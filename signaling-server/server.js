/**
 * Arego Chat — Signaling Server v5
 *
 * HTTP:
 *  POST /code          → Kurzcode registrieren (in-memory, TTL 1h)
 *  GET  /code/:c       → Kurzcode einlösen (single-use, sofort gelöscht)
 *
 *  POST /spaces        → Öffentlichen Space registrieren / aktualisieren (Heartbeat)
 *  GET  /spaces        → Alle öffentlichen Spaces abrufen (sortierbar)
 *  DELETE /spaces/:id  → Space aus öffentlicher Liste entfernen
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
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import initSqlJs from 'sql.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const PORT = process.env.PORT || 3001;
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DB_PATH = process.env.DB_PATH || './spaces.db';
const INACTIVITY_DAYS = 30;

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
  persistDb();
}

function persistDb() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// Cronjob: täglich inaktive Spaces löschen (älter als 30 Tage)
setInterval(() => {
  if (!db) return;
  const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM public_spaces WHERE letzte_aktivitaet < ?`, [cutoff]);
  persistDb();
}, 24 * 60 * 60 * 1000).unref(); // einmal täglich

// ── In-Memory Stores ──────────────────────────────────────────────────────────
const codes        = new Map(); // code → { payload, expires }
const rooms        = new Map(); // roomId → Set<WebSocket>
const inboxPending = new Map(); // 'inbox:<aregoId>' → [{ text, expires }]

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

// ── HTTP Server ──────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

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

  // ── DELETE /spaces/:id — Space aus öffentlicher Liste entfernen ─────────────
  const deleteMatch = req.method === 'DELETE' && req.url?.match(/^\/spaces\/(.+)$/);
  if (deleteMatch) {
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
      const limit   = isInbox ? 50 : isSpaceChat ? 500 : 2;
      if (room.size >= limit) { ws.close(1008, 'Room full'); return; }

      room.add(ws);
      ws.send(JSON.stringify({ type: 'joined', peers: room.size }));
      for (const peer of room) {
        if (peer !== ws && peer.readyState === 1)
          peer.send(JSON.stringify({ type: 'peer_joined' }));
      }

      // Inbox / Space-Chat: gepufferte Nachrichten sofort ausliefern
      if (isInbox || isSpaceChat) {
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

    if (delivered === 0 && (roomId.startsWith('inbox:') || roomId.startsWith('space-chat:'))) {
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
server.listen(PORT, () => {
  console.log(`[Arego Signaling v5] Port ${PORT} — Presence + Public Spaces Directory`);
});
