/**
 * Arego Chat — Signaling Server v5
 *
 * HTTP:
 *  POST /code          → Kurzcode registrieren (in-memory, TTL 1h)
 *  GET  /code/:c       → Kurzcode einlösen (single-use, sofort gelöscht)
 *
 *  POST /spaces        → Öffentlichen Space registrieren / aktualisieren (Heartbeat)
 *  GET  /spaces        → Alle öffentlichen Spaces abrufen (sortierbar)
 *  GET  /spaces/tags   → Alle einzigartigen Tags
 *  DELETE /spaces/:id  → Space aus öffentlicher Liste entfernen
 *
 *  POST /join-request          → Beitrittsanfrage stellen
 *  GET  /join-requests/:id     → Ausstehende Anfragen für Gründer
 *  POST /join-request/respond  → Anfrage genehmigen oder ablehnen
 *
 *  POST /fsk/generate           → Freischaltcode generieren (intern)
 *  POST /fsk/redeem             → Freischaltcode einlösen
 *  POST /fsk/heartbeat          → FSK-Heartbeat (30-Tage-Frist)
 *  GET  /fsk/status/:id         → FSK-Status eines Spaces prüfen
 *
 *  POST /support               → Support-Nachricht als GitHub Issue
 *  POST /support/close         → GitHub Issue schließen
 *
 * WebSocket:
 *  Räume vom Typ "chat:…" / normale IDs → max 2 Peers (P2P Chat)
 *  Räume vom Typ "inbox:<aregoId>"      → bis zu 50 Peers, Offline-Pufferung
 *
 * Presence:
 *  presence_subscribe  → als online markieren + Kontakte beobachten
 *  presence_update     → Push wenn beobachteter Kontakt online/offline geht
 *  DSGVO: nur aktueller Status im RAM, kein Verlauf, kein Timestamp.
 *         Bei Disconnect sofort gelöscht.
 *
 * Datenschutz: kein Logging, kein Disk-Speicher für Chats.
 *              Öffentliche Spaces in SQLite — nur vom Gründer freigegebene Daten.
 *              Auth-Middleware prüft bei jedem API-Call: ID bekannt, Abo aktiv, FSK-Stufe.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import initSqlJs from 'sql.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { testConnection as testStorage } from './storage.js';

const PORT = process.env.PORT || 3001;
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DB_PATH = process.env.DB_PATH || './spaces.db';
const INACTIVITY_DAYS = 30;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'Arego367/Aregoland';

// ── SQLite initialisieren ─────────────────────────────────────────────────────
let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS public_spaces (
      space_id           TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      beschreibung       TEXT DEFAULT '',
      sprache            TEXT DEFAULT 'de',
      tags               TEXT DEFAULT '[]',
      mitgliederzahl     INTEGER DEFAULT 1,
      gruender_id        TEXT NOT NULL,
      erstellt_am        TEXT NOT NULL,
      letzte_aktivitaet  TEXT NOT NULL,
      oeffentlich        INTEGER DEFAULT 1,
      inaktivitaets_regel TEXT DEFAULT 'delete'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS join_requests (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            TEXT NOT NULL,
      user_name          TEXT DEFAULT '',
      space_id           TEXT NOT NULL,
      gruender_id        TEXT NOT NULL,
      status             TEXT DEFAULT 'pending',
      erstellt_am        TEXT NOT NULL,
      UNIQUE(user_id, space_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_directory (
      arego_id          TEXT PRIMARY KEY,
      display_name      TEXT DEFAULT '',
      first_name        TEXT DEFAULT '',
      last_name         TEXT DEFAULT '',
      nickname          TEXT DEFAULT '',
      updated_at        TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS invite_registry (
      short_code        TEXT PRIMARY KEY,
      space_id          TEXT NOT NULL,
      space_name        TEXT DEFAULT '',
      role              TEXT DEFAULT 'member',
      founder_id        TEXT NOT NULL,
      founder_name      TEXT DEFAULT '',
      created_at        TEXT NOT NULL,
      last_heartbeat    TEXT NOT NULL,
      expires_at        TEXT DEFAULT NULL,
      single_use        INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS fsk_approved_spaces (
      space_id          TEXT PRIMARY KEY,
      fsk_stufe         INTEGER NOT NULL DEFAULT 6,
      freischaltcode    TEXT NOT NULL,
      code_erstellt_am  TEXT NOT NULL,
      code_gueltig_bis  TEXT NOT NULL,
      code_eingeloest   INTEGER DEFAULT 0,
      letzter_heartbeat TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_auth (
      arego_id          TEXT PRIMARY KEY,
      abo_status        TEXT NOT NULL DEFAULT 'trial',
      abo_gueltig_bis   TEXT DEFAULT NULL,
      fsk_stufe         INTEGER NOT NULL DEFAULT 6,
      letzter_heartbeat TEXT NOT NULL
    )
  `);
  persistDb();
}

function persistDb() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// Cronjob: täglich inaktive Spaces löschen (älter als 30 Tage) + abgelaufene Directory-Einträge (3 Tage)
setInterval(() => {
  if (!db) return;
  const spaceCutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM public_spaces WHERE letzte_aktivitaet < ?`, [spaceCutoff]);
  const directoryCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM user_directory WHERE updated_at < ?`, [directoryCutoff]);
  // Invite-Registry: Heartbeat älter als 3 Tage + abgelaufene Codes
  db.run(`DELETE FROM invite_registry WHERE last_heartbeat < ?`, [directoryCutoff]);
  const now = new Date().toISOString();
  db.run(`DELETE FROM invite_registry WHERE expires_at IS NOT NULL AND expires_at < ?`, [now]);
  // FSK: Spaces mit Heartbeat > 30 Tage entziehen
  const fskCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM fsk_approved_spaces WHERE letzter_heartbeat < ?`, [fskCutoff]);
  // FSK: abgelaufene, nicht eingelöste Codes entfernen
  db.run(`DELETE FROM fsk_approved_spaces WHERE code_eingeloest = 0 AND code_gueltig_bis < ?`, [now]);
  // Auth: Nutzer ohne Heartbeat > 90 Tage entfernen
  const authCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM user_auth WHERE letzter_heartbeat < ?`, [authCutoff]);
  persistDb();
}, 24 * 60 * 60 * 1000).unref(); // einmal täglich

// ── In-Memory Stores ──────────────────────────────────────────────────────────
const codes        = new Map(); // code → { payload, expires }
const rooms        = new Map(); // roomId → Set<WebSocket>
const inboxPending = new Map(); // 'inbox:<aregoId>' → [{ text, expires }]

// Rate-Limiting für Support-Chat: max 5 Nachrichten pro 10 Sekunden pro Arego-ID
const supportRateLimit = new Map(); // aregoId → [timestamp, timestamp, ...]

// Presence — nur RAM, kein Disk, kein Verlauf
const onlineUsers      = new Map(); // aregoId → Set<WebSocket>
const presenceWatchers = new Map(); // aregoId → Set<WebSocket>  (wer beobachtet diesen User?)

// Abgelaufene Einträge jede Minute bereinigen
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of codes)        if (v.expires < now) codes.delete(k);
  for (const [k, items] of inboxPending) {
    const fresh = items.filter(i => i.expires > now);
    if (fresh.length === 0) inboxPending.delete(k);
    else                    inboxPending.set(k, fresh);
  }
}, 60_000).unref();

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function generateCode() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Arego-Auth');
}

function sanitizeId(s) {
  return String(s ?? '').slice(0, 20).replace(/[^a-zA-Z0-9\-]/g, '');
}

function storePending(roomId, raw) {
  const items = inboxPending.get(roomId) ?? [];
  items.push({ text: raw.toString(), expires: Date.now() + 24 * 60 * 60 * 1000 });
  inboxPending.set(roomId, items.slice(-20));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 8192) reject(new Error('too large')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── Auth Middleware ───────────────────────────────────────────────────────────

/**
 * Prüft anhand des X-Arego-Auth Headers:
 * 1. Ist die Arego-ID (Hash) bekannt?
 * 2. Ist das Abo aktiv oder Trial noch gültig?
 * 3. Hat der Nutzer die nötige FSK-Stufe?
 *
 * @param {object} req - HTTP Request
 * @param {object} res - HTTP Response
 * @param {object} opts - { minFsk?: number } — minimale FSK-Stufe (default: keine Prüfung)
 * @returns {object|null} — { arego_id, abo_status, fsk_stufe } oder null wenn blockiert
 */
function checkAuth(req, res, opts = {}) {
  const aregoId = req.headers['x-arego-auth'];
  if (!aregoId) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'auth_required', message: 'X-Arego-Auth Header fehlt' }));
    return null;
  }

  const rows = db.exec(`SELECT arego_id, abo_status, abo_gueltig_bis, fsk_stufe FROM user_auth WHERE arego_id = ?`, [aregoId]);
  if (!rows.length || !rows[0].values.length) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unknown_user', message: 'Nutzer nicht registriert' }));
    return null;
  }

  const [id, abo_status, abo_gueltig_bis, fsk_stufe] = rows[0].values[0];

  // Abo prüfen: aktiv oder Trial noch gültig?
  if (abo_status === 'expired') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'subscription_expired', message: 'Kein aktives Abo \u2014 bitte Abo verl\u00e4ngern' }));
    return null;
  }
  if (abo_gueltig_bis && new Date(abo_gueltig_bis) < new Date()) {
    db.run(`UPDATE user_auth SET abo_status = 'expired' WHERE arego_id = ?`, [id]);
    persistDb();
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'subscription_expired', message: 'Abo abgelaufen \u2014 bitte verl\u00e4ngern' }));
    return null;
  }

  // FSK prüfen
  const minFsk = opts.minFsk ?? 0;
  if (fsk_stufe < minFsk) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'fsk_insufficient', message: `FSK ${minFsk} erforderlich \u2014 deine Stufe: FSK ${fsk_stufe}`, required: minFsk, current: fsk_stufe }));
    return null;
  }

  return { arego_id: id, abo_status, fsk_stufe };
}

// ── HTTP Server ──────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── POST /auth/register — Nutzer registrieren / Status aktualisieren ──────
  if (req.method === 'POST' && req.url === '/auth/register') {
    try {
      const body = await readBody(req);
      const { arego_id, abo_status, abo_gueltig_bis, fsk_stufe } = JSON.parse(body);
      if (!arego_id || !abo_status) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'arego_id und abo_status erforderlich' }));
        return;
      }
      const validStatuses = ['trial', 'active', 'expired'];
      const status = validStatuses.includes(abo_status) ? abo_status : 'trial';
      const fsk = [6, 12, 16, 18].includes(fsk_stufe) ? fsk_stufe : 6;
      const now = new Date().toISOString();
      db.run(`
        INSERT INTO user_auth (arego_id, abo_status, abo_gueltig_bis, fsk_stufe, letzter_heartbeat)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(arego_id) DO UPDATE SET
          abo_status = excluded.abo_status,
          abo_gueltig_bis = excluded.abo_gueltig_bis,
          fsk_stufe = excluded.fsk_stufe,
          letzter_heartbeat = excluded.letzter_heartbeat
      `, [arego_id, status, abo_gueltig_bis ?? null, fsk, now]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // POST /code
  if (req.method === 'POST' && req.url === '/code') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { payload } = JSON.parse(body);
        if (typeof payload !== 'string' || payload.length > 4096) {
          res.writeHead(400); res.end(); return;
        }
        const code = generateCode();
        codes.set(code, { payload, expires: Date.now() + 3_600_000 });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code }));
      } catch { res.writeHead(400); res.end(); }
    });
    return;
  }

  // GET /code/:code
  const codeMatch = req.method === 'GET' && req.url?.match(/^\/code\/([A-Z2-9]{6})$/i);
  if (codeMatch) {
    const code = codeMatch[1].toUpperCase();
    const entry = codes.get(code);
    if (!entry || entry.expires < Date.now()) { res.writeHead(404); res.end(); return; }
    codes.delete(code);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ payload: entry.payload }));
    return;
  }

  // ── POST /spaces — Space registrieren / Heartbeat ──────────────────────��───
  if (req.method === 'POST' && req.url === '/spaces') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const { space_id, name, beschreibung, sprache, tags, mitgliederzahl, gruender_id, inaktivitaets_regel } = data;

      if (!space_id || !name || !gruender_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'space_id, name, gruender_id erforderlich' }));
        return;
      }

      const now = new Date().toISOString();
      const tagsJson = JSON.stringify(Array.isArray(tags) ? tags.slice(0, 10) : []);
      const regel = inaktivitaets_regel === 'transfer' ? 'transfer' : 'delete';

      // UPSERT: wenn Space existiert → aktualisieren (Heartbeat), sonst → neu anlegen
      db.run(`
        INSERT INTO public_spaces (space_id, name, beschreibung, sprache, tags, mitgliederzahl, gruender_id, erstellt_am, letzte_aktivitaet, oeffentlich, inaktivitaets_regel)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(space_id) DO UPDATE SET
          name = excluded.name,
          beschreibung = excluded.beschreibung,
          sprache = excluded.sprache,
          tags = excluded.tags,
          mitgliederzahl = excluded.mitgliederzahl,
          letzte_aktivitaet = excluded.letzte_aktivitaet,
          inaktivitaets_regel = excluded.inaktivitaets_regel
      `, [space_id, name.slice(0, 100), (beschreibung ?? '').slice(0, 500), sprache ?? 'de', tagsJson, mitgliederzahl ?? 1, gruender_id, now, now, regel]);
      persistDb();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /spaces/tags — Alle einzigartigen Tags ──────────────────────────────
  if (req.method === 'GET' && req.url === '/spaces/tags') {
    try {
      const stmt = db.prepare('SELECT tags FROM public_spaces WHERE oeffentlich = 1');
      const allTags = new Set();
      while (stmt.step()) {
        const row = stmt.getAsObject();
        for (const tag of JSON.parse(row.tags || '[]')) allTags.add(tag);
      }
      stmt.free();
      const sorted = [...allTags].sort((a, b) => String(a).localeCompare(String(b)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tags: sorted }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── GET /spaces — Öffentliche Spaces abrufen ───────────────────────────────
  if (req.method === 'GET' && req.url?.startsWith('/spaces')) {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const sprache = url.searchParams.get('sprache');
      const sort = url.searchParams.get('sort') ?? 'name';
      const tag = url.searchParams.get('tag');
      const search = url.searchParams.get('q');

      let query = 'SELECT * FROM public_spaces WHERE oeffentlich = 1';
      const params = [];

      if (sprache) {
        query += ' AND sprache = ?';
        params.push(sprache);
      }
      if (tag) {
        query += ' AND tags LIKE ?';
        params.push(`%${tag}%`);
      }
      if (search) {
        query += ' AND (name LIKE ? OR beschreibung LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      switch (sort) {
        case 'mitglieder': query += ' ORDER BY mitgliederzahl DESC'; break;
        case 'neueste':    query += ' ORDER BY erstellt_am DESC'; break;
        case 'aktivitaet': query += ' ORDER BY letzte_aktivitaet DESC'; break;
        default:           query += ' ORDER BY name COLLATE NOCASE ASC'; break;
      }

      query += ' LIMIT 200';

      const stmt = db.prepare(query);
      if (params.length) stmt.bind(params);

      const spaces = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        spaces.push({
          ...row,
          tags: JSON.parse(row.tags || '[]'),
          oeffentlich: !!row.oeffentlich,
        });
      }
      stmt.free();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ spaces }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /join-request — Beitrittsanfrage stellen ──────────────────────────
  if (req.method === 'POST' && req.url === '/join-request') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { user_id, user_name, space_id, gruender_id } = JSON.parse(body);
      if (!user_id || !space_id || !gruender_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'user_id, space_id, gruender_id erforderlich' }));
        return;
      }
      const now = new Date().toISOString();
      db.run(`
        INSERT OR IGNORE INTO join_requests (user_id, user_name, space_id, gruender_id, status, erstellt_am)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `, [user_id, (user_name ?? '').slice(0, 100), space_id, gruender_id, now]);
      persistDb();

      // Wenn Gründer online → sofort per WebSocket benachrichtigen
      const founderSockets = onlineUsers.get(gruender_id);
      if (founderSockets) {
        const notify = JSON.stringify({ type: 'join_request', user_id, user_name: user_name ?? '', space_id });
        for (const ws of founderSockets) {
          if (ws.readyState === 1) ws.send(notify);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /join-requests/:gruender_id — Ausstehende Anfragen für Gründer ────
  const joinReqMatch = req.method === 'GET' && req.url?.match(/^\/join-requests\/([^/]+)$/);
  if (joinReqMatch) {
    try {
      const gruenderId = decodeURIComponent(joinReqMatch[1]);
      const stmt = db.prepare(`SELECT * FROM join_requests WHERE gruender_id = ? AND status = 'pending'`);
      stmt.bind([gruenderId]);
      const requests = [];
      while (stmt.step()) requests.push(stmt.getAsObject());
      stmt.free();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ requests }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /join-request/respond — Anfrage genehmigen oder ablehnen ─────────
  if (req.method === 'POST' && req.url === '/join-request/respond') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { user_id, space_id, gruender_id, action, space_name, space_template, space_description, gruender_name } = JSON.parse(body);
      if (!user_id || !space_id || !gruender_id || !['approve', 'reject'].includes(action)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'user_id, space_id, gruender_id, action (approve|reject) erforderlich' }));
        return;
      }

      // Anfrage löschen
      db.run(`DELETE FROM join_requests WHERE user_id = ? AND space_id = ?`, [user_id, space_id]);
      persistDb();

      // Nutzer benachrichtigen — online per WebSocket, offline per Inbox-Pufferung
      const notify = JSON.stringify({
        type: 'join_response', space_id, action,
        space_name: space_name ?? '', space_template: space_template ?? 'community',
        space_description: space_description ?? '',
        gruender_id, gruender_name: gruender_name ?? '',
      });
      const userSockets = onlineUsers.get(user_id);
      let delivered = false;
      if (userSockets) {
        for (const ws of userSockets) {
          if (ws.readyState === 1) { ws.send(notify); delivered = true; }
        }
      }
      // Offline → in Inbox puffern (24h TTL)
      if (!delivered) {
        const inboxRoom = `inbox:${user_id}`;
        storePending(inboxRoom, notify);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /space-sync — Space-Daten an einen User senden (WS oder Inbox) ────
  if (req.method === 'POST' && req.url === '/space-sync') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { target_user_id, payload } = JSON.parse(body);
      if (!target_user_id || !payload) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'target_user_id und payload erforderlich' }));
        return;
      }

      const msg = JSON.stringify({ type: 'space_sync', ...payload });

      // Online per WebSocket
      const userSockets = onlineUsers.get(target_user_id);
      let delivered = false;
      if (userSockets) {
        for (const ws of userSockets) {
          if (ws.readyState === 1) { ws.send(msg); delivered = true; }
        }
      }
      // Offline → Inbox puffern (24h TTL)
      if (!delivered) {
        const inboxRoom = `inbox:${target_user_id}`;
        storePending(inboxRoom, msg);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, delivered }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /space-sync-request — Sync-Anfrage an Founder weiterleiten ───────
  if (req.method === 'POST' && req.url === '/space-sync-request') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { founder_id, requester_id, space_id } = JSON.parse(body);
      if (!founder_id || !requester_id || !space_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'founder_id, requester_id, space_id erforderlich' }));
        return;
      }

      const msg = JSON.stringify({ type: 'space_sync_request', requester_id, space_id });

      const founderSockets = onlineUsers.get(founder_id);
      let delivered = false;
      if (founderSockets) {
        for (const ws of founderSockets) {
          if (ws.readyState === 1) { ws.send(msg); delivered = true; }
        }
      }
      // Nicht puffern — Sync-Requests nur wenn Founder online

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, delivered }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /directory — Nutzer im Verzeichnis registrieren / Heartbeat ────────
  if (req.method === 'POST' && req.url === '/directory') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { aregoId, displayName, firstName, lastName, nickname } = JSON.parse(body);
      if (!aregoId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'aregoId erforderlich' }));
        return;
      }
      db.run(
        `INSERT INTO user_directory (arego_id, display_name, first_name, last_name, nickname, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(arego_id) DO UPDATE SET
           display_name = excluded.display_name,
           first_name = excluded.first_name,
           last_name = excluded.last_name,
           nickname = excluded.nickname,
           updated_at = excluded.updated_at`,
        [aregoId, displayName ?? '', firstName ?? '', lastName ?? '', nickname ?? '', new Date().toISOString()]
      );
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── DELETE /directory — Nutzer aus dem Verzeichnis entfernen ────────────────
  if (req.method === 'DELETE' && req.url === '/directory') {
    try {
      const body = await readBody(req);
      const { aregoId } = JSON.parse(body);
      if (!aregoId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'aregoId erforderlich' }));
        return;
      }
      db.run(`DELETE FROM user_directory WHERE arego_id = ?`, [aregoId]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /directory?q=... — Öffentliche Profile suchen ───────────────────────
  if (req.method === 'GET' && req.url?.startsWith('/directory')) {
    try {
      const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const q = (params.get('q') ?? '').trim();
      if (!q || q.length < 2) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ profiles: [] }));
        return;
      }
      const like = `%${q}%`;
      const rows = db.exec(
        `SELECT arego_id, display_name, first_name, last_name, nickname
         FROM user_directory
         WHERE arego_id LIKE ? OR display_name LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR nickname LIKE ?
         LIMIT 20`,
        [like, like, like, like, like]
      );
      const profiles = (rows[0]?.values ?? []).map(r => ({
        aregoId: r[0], displayName: r[1], firstName: r[2], lastName: r[3], nickname: r[4],
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ profiles }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /invite — Einladungscode in Registry registrieren ──────────────────
  if (req.method === 'POST' && req.url === '/invite') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { spaceId, spaceName, role, founderId, founderName, expiresAt, singleUse } = JSON.parse(body);
      if (!spaceId || !founderId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'spaceId, founderId erforderlich' }));
        return;
      }
      const code = generateCode();
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO invite_registry (short_code, space_id, space_name, role, founder_id, founder_name, created_at, last_heartbeat, expires_at, single_use)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, spaceId, spaceName ?? '', role ?? 'member', founderId, founderName ?? '', now, now, expiresAt ?? null, singleUse ? 1 : 0]
      );
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, code }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /invite/:code — Einladungscode nachschlagen ────────────────────────
  if (req.method === 'GET' && req.url?.startsWith('/invite/')) {
    try {
      const code = req.url.slice('/invite/'.length).toUpperCase().trim();
      if (!code) { res.writeHead(400); res.end(); return; }
      const now = new Date().toISOString();
      const rows = db.exec(
        `SELECT space_id, space_name, role, founder_id, founder_name, expires_at, single_use
         FROM invite_registry
         WHERE short_code = ? AND (expires_at IS NULL OR expires_at > ?) AND last_heartbeat > ?`,
        [code, now, new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()]
      );
      if (!rows[0]?.values?.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      const r = rows[0].values[0];
      const invite = { spaceId: r[0], spaceName: r[1], role: r[2], founderId: r[3], founderName: r[4] };
      // Einmalige Codes sofort löschen
      if (r[6]) {
        db.run(`DELETE FROM invite_registry WHERE short_code = ?`, [code]);
        persistDb();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(invite));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── DELETE /invite/:code — Einladungscode widerrufen ───────────────────────
  if (req.method === 'DELETE' && req.url?.startsWith('/invite/')) {
    try {
      const code = req.url.slice('/invite/'.length).toUpperCase().trim();
      db.run(`DELETE FROM invite_registry WHERE short_code = ?`, [code]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /invite/heartbeat — Alle Codes eines Founders erneuern ────────────
  if (req.method === 'POST' && req.url === '/invite/heartbeat') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { founderId } = JSON.parse(body);
      if (!founderId) { res.writeHead(400); res.end(); return; }
      const now = new Date().toISOString();
      db.run(`UPDATE invite_registry SET last_heartbeat = ? WHERE founder_id = ?`, [now, founderId]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /support — Support-Nachricht als GitHub Issue anlegen ──────────────
  if (req.method === 'POST' && req.url === '/support') {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { message, arego_id } = JSON.parse(body);
      if (!message || !arego_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'message und arego_id erforderlich' }));
        return;
      }

      // Rate-Limiting: max 5 Nachrichten pro 10 Sekunden
      const now = Date.now();
      const timestamps = (supportRateLimit.get(arego_id) ?? []).filter(t => t > now - 10_000);
      if (timestamps.length >= 5) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'rate_limited' }));
        return;
      }
      timestamps.push(now);
      supportRateLimit.set(arego_id, timestamps);

      if (!GITHUB_TOKEN) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'GitHub Token nicht konfiguriert' }));
        return;
      }

      const title = message.slice(0, 60) + (message.length > 60 ? '…' : '');
      const issueBody = `${message}\n\n---\n**Arego-ID:** \`${arego_id}\`\n**Gesendet:** ${new Date().toISOString()}`;

      const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ title, body: issueBody, labels: ['support'] }),
      });

      if (!ghRes.ok) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'GitHub API Fehler' }));
        return;
      }

      const issue = await ghRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, issue_number: issue.number }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /support/close — GitHub Issue schließen ───────────────────────────
  if (req.method === 'POST' && req.url === '/support/close') {
    try {
      const body = await readBody(req);
      const { issue_number, reason } = JSON.parse(body);
      if (!issue_number || !GITHUB_TOKEN) {
        res.writeHead(400); res.end(); return;
      }

      // Kommentar hinzufügen
      const comment = reason === 'rejected' ? 'Abgelehnt — Issue geschlossen.' : 'Erledigt — Issue geschlossen.';
      await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${issue_number}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ body: comment }),
      });

      // Issue schließen
      await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${issue_number}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ state: 'closed' }),
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /fsk/generate — Freischaltcode generieren (intern/CC) ──────────────
  if (req.method === 'POST' && req.url === '/fsk/generate') {
    try {
      const body = await readBody(req);
      const { space_id, fsk_stufe } = JSON.parse(body);
      if (!space_id || ![6, 12, 16].includes(fsk_stufe)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'space_id und fsk_stufe (6/12/16) erforderlich' }));
        return;
      }
      const code = `FSK${fsk_stufe}-${Array.from({ length: 4 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join('')}-${Array.from({ length: 4 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join('')}`;
      const now = new Date().toISOString();
      const gueltigBis = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.run(`INSERT OR REPLACE INTO fsk_approved_spaces (space_id, fsk_stufe, freischaltcode, code_erstellt_am, code_gueltig_bis, code_eingeloest, letzter_heartbeat) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [space_id, fsk_stufe, code, now, gueltigBis, now]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, code, gueltig_bis: gueltigBis }));
    } catch {
      res.writeHead(400, cors); res.end();
    }
    return;
  }

  // ── POST /fsk/redeem — Freischaltcode einlösen ─────────────────────────────
  if (req.method === 'POST' && req.url === '/fsk/redeem') {
    try {
      const body = await readBody(req);
      const { space_id, code } = JSON.parse(body);
      if (!space_id || !code) {
        res.writeHead(400, cors);
        res.end(JSON.stringify({ error: 'space_id und code erforderlich' }));
        return;
      }
      const rows = db.exec(`SELECT fsk_stufe, code_gueltig_bis, code_eingeloest FROM fsk_approved_spaces WHERE space_id = ? AND freischaltcode = ?`, [space_id, code]);
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_code' }));
        return;
      }
      const [fsk_stufe, gueltig_bis, eingeloest] = rows[0].values[0];
      if (eingeloest) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'already_redeemed' }));
        return;
      }
      if (new Date(gueltig_bis) < new Date()) {
        res.writeHead(410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'expired' }));
        return;
      }
      const now = new Date().toISOString();
      db.run(`UPDATE fsk_approved_spaces SET code_eingeloest = 1, letzter_heartbeat = ? WHERE space_id = ? AND freischaltcode = ?`, [now, space_id, code]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, fsk_stufe }));
    } catch {
      res.writeHead(400, cors); res.end();
    }
    return;
  }

  // ── POST /fsk/heartbeat — FSK-Heartbeat (alle 30 Tage) ────────────────────
  if (req.method === 'POST' && req.url === '/fsk/heartbeat') {
    try {
      const body = await readBody(req);
      const { space_id } = JSON.parse(body);
      if (!space_id) {
        res.writeHead(400); res.end(); return;
      }
      const rows = db.exec(`SELECT code_eingeloest FROM fsk_approved_spaces WHERE space_id = ?`, [space_id]);
      if (!rows.length || !rows[0].values.length || !rows[0].values[0][0]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_approved' }));
        return;
      }
      const now = new Date().toISOString();
      db.run(`UPDATE fsk_approved_spaces SET letzter_heartbeat = ? WHERE space_id = ?`, [now, space_id]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, cors); res.end();
    }
    return;
  }

  // ── GET /fsk/status/:id — FSK-Status eines Spaces prüfen ──────────────────
  const fskStatusMatch = req.method === 'GET' && req.url?.match(/^\/fsk\/status\/(.+)$/);
  if (fskStatusMatch) {
    const spaceId = decodeURIComponent(fskStatusMatch[1]);
    const rows = db.exec(`SELECT fsk_stufe, letzter_heartbeat, code_eingeloest FROM fsk_approved_spaces WHERE space_id = ?`, [spaceId]);
    if (!rows.length || !rows[0].values.length || !rows[0].values[0][2]) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ approved: false, fsk_stufe: 18 }));
      return;
    }
    const [fsk_stufe, letzter_heartbeat] = rows[0].values[0];
    const heartbeatAge = Date.now() - new Date(letzter_heartbeat).getTime();
    const expired = heartbeatAge > 30 * 24 * 60 * 60 * 1000;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ approved: !expired, fsk_stufe: expired ? 18 : fsk_stufe, letzter_heartbeat }));
    return;
  }

  // ── DELETE /spaces/:id — Space aus öffentlicher Liste entfernen ─────────────
  const deleteMatch = req.method === 'DELETE' && req.url?.match(/^\/spaces\/(.+)$/);
  if (deleteMatch) {
    const auth = checkAuth(req, res); if (!auth) return;
    try {
      const body = await readBody(req);
      const { gruender_id } = JSON.parse(body);
      const spaceId = decodeURIComponent(deleteMatch[1]);

      // Nur der Gründer darf seinen Space entfernen
      const existing = db.exec(`SELECT gruender_id FROM public_spaces WHERE space_id = ?`, [spaceId]);
      if (!existing.length || !existing[0].values.length) {
        res.writeHead(404); res.end(); return;
      }
      if (existing[0].values[0][0] !== gruender_id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Nur der Gründer darf den Eintrag entfernen' }));
        return;
      }

      db.run(`DELETE FROM public_spaces WHERE space_id = ?`, [spaceId]);
      persistDb();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  res.writeHead(404); res.end();
});

// ── WebSocket Signaling + Presence ──────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let roomId = null;
  let presenceId = null;      // eigene aregoId für Presence
  let watchIds = [];           // aregoIds die beobachtet werden

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── Join Room ────────────────────────────────────────────────────────────
    if (msg.type === 'join') {
      roomId = String(msg.roomId ?? '')
        .slice(0, 128)
        .replace(/[^a-zA-Z0-9\-:_]/g, '');
      if (!roomId) return;

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const room = rooms.get(roomId);

      const isInbox = roomId.startsWith('inbox:');
      const isSpaceChat = roomId.startsWith('space-chat:');
      const isSpaceMeta = roomId.startsWith('space-meta:');
      const limit   = isInbox ? 50 : (isSpaceChat || isSpaceMeta) ? 500 : 2;
      if (room.size >= limit) { ws.close(1008, 'Room full'); return; }

      room.add(ws);
      ws.send(JSON.stringify({ type: 'joined', peers: room.size }));
      for (const peer of room) {
        if (peer !== ws && peer.readyState === 1)
          peer.send(JSON.stringify({ type: 'peer_joined' }));
      }

      // Inbox / Space-Chat / Space-Meta: gepufferte Nachrichten sofort ausliefern
      if (isInbox || isSpaceChat || isSpaceMeta) {
        const pending = inboxPending.get(roomId);
        if (pending?.length) {
          const now = Date.now();
          for (const { text, expires } of pending) {
            if (expires > now && ws.readyState === 1) ws.send(text);
          }
          inboxPending.delete(roomId);
        }
      }
      return;
    }

    // ── Presence Subscribe ───────────────────────────────────────────────────
    if (msg.type === 'presence_subscribe') {
      presenceId = sanitizeId(msg.aregoId);
      if (!presenceId) return;

      watchIds = Array.isArray(msg.watchIds)
        ? msg.watchIds.map(sanitizeId).filter(Boolean).slice(0, 200)
        : [];

      // Als online markieren
      if (!onlineUsers.has(presenceId)) onlineUsers.set(presenceId, new Set());
      onlineUsers.get(presenceId).add(ws);

      // Abonnements für Kontakt-Präsenz registrieren
      for (const id of watchIds) {
        if (!presenceWatchers.has(id)) presenceWatchers.set(id, new Set());
        presenceWatchers.get(id).add(ws);
      }

      // Initiale Statusmeldung: welche beobachteten Kontakte sind gerade online?
      const statuses = {};
      for (const id of watchIds) {
        const sockets = onlineUsers.get(id);
        statuses[id] = !!(sockets && sockets.size > 0);
      }
      ws.send(JSON.stringify({ type: 'presence_update', statuses }));

      // Allen die MICH beobachten mitteilen dass ich online bin
      const myWatchers = presenceWatchers.get(presenceId);
      if (myWatchers) {
        const update = JSON.stringify({ type: 'presence_update', statuses: { [presenceId]: true } });
        for (const w of myWatchers) {
          if (w !== ws && w.readyState === 1) w.send(update);
        }
      }
      return;
    }

    // ── Relay (blindes Weiterleiten) ─────────────────────────────────────────
    if (!roomId) return;

    const text = raw.toString();

    const room = rooms.get(roomId);
    if (!room) {
      if (roomId.startsWith('inbox:')) storePending(roomId, raw);
      return;
    }

    let delivered = 0;
    for (const peer of room) {
      if (peer !== ws && peer.readyState === 1) {
        peer.send(text);
        delivered++;
      }
    }

    if (delivered === 0 && (roomId.startsWith('inbox:') || roomId.startsWith('space-chat:') || roomId.startsWith('space-meta:'))) {
      storePending(roomId, raw);
    }
  });

  ws.on('close', () => {
    // ── Room Cleanup ─────────────────────────────────────────────────────────
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.delete(ws);
        for (const peer of room) {
          if (peer.readyState === 1) peer.send(JSON.stringify({ type: 'peer_left' }));
        }
        if (room.size === 0) rooms.delete(roomId);
      }
    }

    // ── Presence Cleanup ─────────────────────────────────────────────────────
    if (presenceId) {
      const sockets = onlineUsers.get(presenceId);
      if (sockets) {
        sockets.delete(ws);
        // Nur offline melden wenn KEIN anderer Tab/Gerät mehr verbunden ist
        if (sockets.size === 0) {
          onlineUsers.delete(presenceId);
          const myWatchers = presenceWatchers.get(presenceId);
          if (myWatchers) {
            const update = JSON.stringify({ type: 'presence_update', statuses: { [presenceId]: false } });
            for (const w of myWatchers) {
              if (w.readyState === 1) w.send(update);
            }
          }
        }
      }
    }

    // Watcher-Abos dieses WS aus allen Sets entfernen
    for (const id of watchIds) {
      const watchers = presenceWatchers.get(id);
      if (watchers) {
        watchers.delete(ws);
        if (watchers.size === 0) presenceWatchers.delete(id);
      }
    }
  });

  ws.on('error', () => ws.terminate());
});

// ── Server starten ───────────────────────────────────────────────────────────
await initDb();
await testStorage();
server.listen(PORT, () => {
  console.log(`[Arego Signaling v5] Port ${PORT} — Presence + Public Spaces Directory`);
});
