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
 *  POST /node                  → LiveKit-Node registrieren
 *  GET  /nodes                 → Alle registrierten LiveKit-Nodes abrufen
 *  DELETE /node/:id            → LiveKit-Node entfernen
 *
 *  POST /push/register          → Push-Token registrieren (ECDSA-signiert)
 *  POST /push/wakeup            → Leeren Wakeup-Push an Arego-ID senden
 *  DELETE /push/register        → Push-Token deregistrieren (ECDSA-signiert)
 *
 *  POST /prekeys               → Pre-Key-Bundle hochladen (ECDSA-signiert)
 *  GET  /prekeys/:aregoId      → Pre-Key-Bundle abrufen (konsumiert einen One-Time-Pre-Key)
 *  DELETE /prekeys/:aregoId    → Alle Pre-Keys löschen (ECDSA-signiert)
 *  POST /prekeys/replenish     → One-Time-Pre-Keys nachliefern
 *
 *  POST /child-settings/update          → Verwalter ändert Kind-Einstellung (ECDSA-signiert)
 *  GET  /child-settings/audit/:kind_id  → Audit-Log abrufen (Verwalter + Kind ab FSK 12)
 *  POST /child-settings/self-determination → Kind ab FSK 16 deaktiviert Verwalter-Zugriff
 *  GET  /child-settings/pending/:kind_id → Ausstehende Sync-Einträge abholen + löschen
 *  GET  /child-settings/export/:kind_id  → DSGVO Art. 20 Datenexport
 *  DELETE /child-settings/data/:kind_id  → DSGVO Art. 17 Löschung ohne Vorbehalt
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
 * Space-Calls (Multi-Party):
 *  join room "space-call:{spaceId}" → Call beitreten (Mesh ≤3, SFU ≥4)
 *  space_call_sdp        → SDP Offer/Answer an Ziel-Teilnehmer (Mesh)
 *  space_call_ice        → ICE Candidate an Ziel-Teilnehmer (Mesh)
 *  space_call_leave      → Call verlassen
 *  space_call_mute_remote → Moderator mutet Teilnehmer
 *  space_call_kick       → Moderator kickt Teilnehmer
 *  DSGVO: nur RAM, keine Persistenz, keine Logs. Bei Disconnect sofort gelöscht.
 *
 * Datenschutz: kein Logging, kein Disk-Speicher für Chats.
 *              Öffentliche Spaces in SQLite — nur vom Gründer freigegebene Daten.
 *              Auth per WebSocket-Handshake: Session im RAM, keine Header-Prüfung.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import initSqlJs from 'sql.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { testConnection as testStorage, uploadFile, getFileUrl, deleteFile } from './storage.js';

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
      public_key_jwk    TEXT DEFAULT NULL,
      updated_at        TEXT NOT NULL
    )
  `);
  // Migration: public_key_jwk Spalte
  try { db.run(`ALTER TABLE user_directory ADD COLUMN public_key_jwk TEXT DEFAULT NULL`); } catch {}
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
  // child_links Tabelle entfernt — Verwalter-Info jetzt direkt in user_auth
  db.run(`
    CREATE TABLE IF NOT EXISTS user_auth (
      arego_id          TEXT PRIMARY KEY,
      abo_status        TEXT NOT NULL DEFAULT 'trial',
      abo_gueltig_bis   TEXT DEFAULT NULL,
      fsk_stufe         INTEGER NOT NULL DEFAULT 6,
      verwalter_1       TEXT DEFAULT NULL,
      verwalter_2       TEXT DEFAULT NULL,
      nickname_self_edit INTEGER NOT NULL DEFAULT 0,
      letzter_heartbeat TEXT NOT NULL
    )
  `);
  // Migration: verwalter-Spalten hinzufügen falls Tabelle schon existiert
  try { db.run(`ALTER TABLE user_auth ADD COLUMN verwalter_1 TEXT DEFAULT NULL`); } catch {}
  try { db.run(`ALTER TABLE user_auth ADD COLUMN verwalter_2 TEXT DEFAULT NULL`); } catch {}
  // Migration: nickname_self_edit Spalte
  try { db.run(`ALTER TABLE user_auth ADD COLUMN nickname_self_edit INTEGER NOT NULL DEFAULT 0`); } catch {}
  // Migration: verwalter_einstellungen_erlaubt Spalte (Selbstbestimmung ab FSK 16)
  try { db.run(`ALTER TABLE user_auth ADD COLUMN verwalter_einstellungen_erlaubt INTEGER DEFAULT 1`); } catch {}
  // Migration: Kinderschutz Phase 1 — Anruf-Einstellungen
  try { db.run(`ALTER TABLE user_auth ADD COLUMN calls_enabled INTEGER NOT NULL DEFAULT 1`); } catch {}
  try { db.run(`ALTER TABLE user_auth ADD COLUMN max_call_participants INTEGER NOT NULL DEFAULT 2`); } catch {}
  // Migration: EUDI-Hash Spalte für Wiederherstellungssystem (ARE-305)
  try { db.run(`ALTER TABLE user_auth ADD COLUMN eudi_hash TEXT DEFAULT NULL`); } catch {}
  // Migration: Cloud-Backup Spalten (ARE-307)
  try { db.run(`ALTER TABLE user_auth ADD COLUMN backup_s3_key TEXT DEFAULT NULL`); } catch {}
  try { db.run(`ALTER TABLE user_auth ADD COLUMN backup_updated_at TEXT DEFAULT NULL`); } catch {}

  // Verwalter-Audit-Log (nur Metadaten, keine Hashes — CR-1)
  db.run(`
    CREATE TABLE IF NOT EXISTS verwalter_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      verwalter_id TEXT NOT NULL,
      kind_id TEXT NOT NULL,
      aktion TEXT NOT NULL,
      kategorie TEXT NOT NULL,
      zeitstempel TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (verwalter_id) REFERENCES user_auth(arego_id),
      FOREIGN KEY (kind_id) REFERENCES user_auth(arego_id)
    )
  `);

  // Verwalter-Settings-Sync (Offline-Queue, sofort nach Abholung löschen — VG-1)
  db.run(`
    CREATE TABLE IF NOT EXISTS verwalter_settings_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind_id TEXT NOT NULL,
      verwalter_id TEXT NOT NULL,
      settings_kategorie TEXT NOT NULL,
      payload_encrypted TEXT NOT NULL,
      erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (kind_id) REFERENCES user_auth(arego_id)
    )
  `);
  // Pending child_profile_sync — SQLite-Buffer bis ACK (max 48h TTL)
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_child_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: child_links Daten in user_auth übernehmen, dann Tabelle löschen
  try {
    const links = db.exec(`SELECT child_id, parent_id FROM child_links ORDER BY created_at`);
    if (links.length) {
      for (const row of links[0].values) {
        const [childId, parentId] = row;
        const existing = db.exec(`SELECT verwalter_1, verwalter_2 FROM user_auth WHERE arego_id = ?`, [childId]);
        if (existing.length) {
          const v1 = existing[0].values[0][0];
          const v2 = existing[0].values[0][1];
          if (!v1) db.run(`UPDATE user_auth SET verwalter_1 = ? WHERE arego_id = ?`, [parentId, childId]);
          else if (!v2 && v1 !== parentId) db.run(`UPDATE user_auth SET verwalter_2 = ? WHERE arego_id = ?`, [parentId, childId]);
        }
      }
    }
    db.run(`DROP TABLE IF EXISTS child_links`);
  } catch {}
  // LiveKit Node-Registry
  db.run(`
    CREATE TABLE IF NOT EXISTS livekit_nodes (
      id                TEXT PRIMARY KEY,
      url               TEXT NOT NULL,
      name              TEXT DEFAULT '',
      registered_at     TEXT NOT NULL
    )
  `);
  // Push-Tokens für Wakeup-Service (ARE-345)
  db.run(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      arego_id     TEXT NOT NULL,
      token        TEXT NOT NULL,
      provider     TEXT NOT NULL CHECK(provider IN ('fcm', 'apns')),
      updated_at   INTEGER NOT NULL,
      PRIMARY KEY (arego_id, token)
    )
  `);
  // Pre-Key Bundles für Signal Protocol (ARE-341)
  db.run(`
    CREATE TABLE IF NOT EXISTS pre_key_bundles (
      arego_id                  TEXT PRIMARY KEY,
      identity_key              TEXT NOT NULL,
      signed_pre_key_id         INTEGER NOT NULL,
      signed_pre_key            TEXT NOT NULL,
      signed_pre_key_signature  TEXT NOT NULL,
      one_time_pre_keys         TEXT DEFAULT '[]',
      updated_at                INTEGER NOT NULL
    )
  `);
  persistDb();
}

function persistDb() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Abo-Übernahme: Kind erbt Abo vom Verwalter wenn eigenes abgelaufen ──────
function resolveKindAbo(aregoId) {
  const rows = db.exec(
    `SELECT abo_status, abo_gueltig_bis, verwalter_1, verwalter_2 FROM user_auth WHERE arego_id = ?`,
    [aregoId]
  );
  if (!rows.length || !rows[0].values.length) return null;
  const [aboStatus, aboGueltigBis, v1, v2] = rows[0].values[0];

  // Nur prüfen wenn Kind (hat Verwalter) UND Abo abgelaufen/null
  const istKind = !!(v1 || v2);
  if (!istKind) return null;

  const now = new Date();
  const nochGueltig = aboGueltigBis && new Date(aboGueltigBis) > now;
  if (aboStatus === 'active' && nochGueltig) return null;

  // Verwalter der Reihe nach prüfen
  for (const verwalterId of [v1, v2].filter(Boolean)) {
    const vRows = db.exec(
      `SELECT abo_status, abo_gueltig_bis FROM user_auth WHERE arego_id = ?`,
      [verwalterId]
    );
    if (!vRows.length || !vRows[0].values.length) continue;
    const [vAbo, vBis] = vRows[0].values[0];
    if ((vAbo === 'active' || vAbo === 'trial') && vBis && new Date(vBis) > now) {
      // Verwalter-Abo auf Kind übertragen
      db.run(
        `UPDATE user_auth SET abo_status = ?, abo_gueltig_bis = ? WHERE arego_id = ?`,
        [vAbo, vBis, aregoId]
      );
      persistDb();
      return { abo_status: vAbo, abo_gueltig_bis: vBis };
    }
  }
  return null;
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
  // Auth: Nutzer ohne Heartbeat > 90 Tage entfernen (+ Art. 17 Kaskade)
  const authCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  // Vor dem Löschen: Kaskade für Verwalter-Daten (Art. 17 ohne Vorbehalt)
  db.run(`DELETE FROM verwalter_audit_log WHERE kind_id IN (SELECT arego_id FROM user_auth WHERE letzter_heartbeat < ?)`, [authCutoff]);
  db.run(`DELETE FROM verwalter_audit_log WHERE verwalter_id IN (SELECT arego_id FROM user_auth WHERE letzter_heartbeat < ?)`, [authCutoff]);
  db.run(`DELETE FROM verwalter_settings_sync WHERE kind_id IN (SELECT arego_id FROM user_auth WHERE letzter_heartbeat < ?)`, [authCutoff]);
  db.run(`DELETE FROM user_auth WHERE letzter_heartbeat < ?`, [authCutoff]);
  // Audit-Log: Einträge älter als 90 Tage automatisch löschen
  const auditCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM verwalter_audit_log WHERE zeitstempel < ?`, [auditCutoff]);
  // Settings-Sync: Einträge älter als 30 Tage löschen (TTL)
  const syncCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM verwalter_settings_sync WHERE erstellt_am < ?`, [syncCutoff]);
  // Pending child_profile_sync: Einträge älter als 48h löschen (TTL)
  const childSyncCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM pending_child_sync WHERE created_at < ?`, [childSyncCutoff]);
  // Push-Tokens: älter als 90 Tage löschen (ARE-345)
  const pushCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  db.run(`DELETE FROM push_tokens WHERE updated_at < ?`, [pushCutoff]);
  // Pre-Key Bundles: älter als 30 Tage ohne Update löschen (ARE-341)
  const preKeyCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.run(`DELETE FROM pre_key_bundles WHERE updated_at < ?`, [preKeyCutoff]);
  persistDb();
}, 60 * 60 * 1000).unref(); // stündlich (war: täglich; ARE-341 fordert 1h-Intervall)

// ── In-Memory Stores ──────────────────────────────────────────────────────────
const codes        = new Map(); // code → { payload, expires }
const rooms        = new Map(); // roomId → Set<WebSocket>
const inboxPending = new Map(); // 'inbox:<aregoId>' → [{ text, expires }]

// Rate-Limiting für Support-Chat: max 5 Nachrichten pro 10 Sekunden pro Arego-ID
const supportRateLimit = new Map(); // aregoId → [timestamp, timestamp, ...]

// Rate-Limiting für Verwalter-Einstellungen: 20/h pro Verwalter, 5/h pro Kategorie
const verwalterRateLimit = new Map(); // verwalterId → { total: [ts], categories: { cat: [ts] } }

// Rate-Limiting für Pre-Key Uploads: max 10/min pro Arego-ID (ARE-341)
const preKeyRateLimit = new Map(); // aregoId → [timestamp, ...]

// Rate-Limiting für Push-Wakeup: max 5/min pro Arego-ID (ARE-345)
const pushWakeupRateLimit = new Map(); // aregoId → [timestamp, ...]

// Presence — nur RAM, kein Disk, kein Verlauf
const onlineUsers      = new Map(); // aregoId → Set<WebSocket>
const presenceWatchers = new Map(); // aregoId → Set<WebSocket>  (wer beobachtet diesen User?)
const hiddenPresenceUsers = new Set(); // aregoIds die ihren Status verbergen

// Authentifizierte Sessions — WebSocket-basiert, kein HTTP-Header nötig
const wsSessions       = new Map(); // WebSocket → { arego_id, abo_status, fsk_stufe }
const sessionsByAregoId = new Map(); // aregoId → { arego_id, abo_status, fsk_stufe }

// Space-Calls — nur RAM, keine Persistenz, keine Logs (DSGVO)
// spaceId → { participants: Map<aregoId, WebSocket>, moderatorId, startTime }
const spaceCalls = new Map();

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

/** Binären Body lesen (max 10 MB für Backup-Dateien). */
function readBinaryBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLen = 0;
    req.on('data', c => {
      totalLen += c.length;
      if (totalLen > maxBytes) { req.destroy(); reject(new Error('too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── ECDSA-Signaturverifikation ────────────────────────────────────────────────
async function verifyEcdsaSignature(aregoId, signatureBase64, dataToVerify) {
  const rows = db.exec(`SELECT public_key_jwk FROM user_directory WHERE arego_id = ?`, [aregoId]);
  if (!rows.length || !rows[0].values.length || !rows[0].values[0][0]) return false;
  try {
    const jwk = JSON.parse(rows[0].values[0][0]);
    const key = await globalThis.crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    );
    const sig = Buffer.from(signatureBase64, 'base64');
    const data = new TextEncoder().encode(dataToVerify);
    return await globalThis.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, sig, data
    );
  } catch {
    return false;
  }
}

// ── Push Wakeup Sender (ARE-345) ────────────────────────────────────────────

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || '';
const APNS_KEY_ID = process.env.APNS_KEY_ID || '';
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || '';
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'de.aregoland.app';

/**
 * Sendet einen leeren FCM-Wakeup-Push (kein Titel, kein Body, kein Inhalt).
 * Nutzt FCM Legacy HTTP API — nur data-message, kein notification.
 */
async function sendFcmWakeup(token) {
  if (!FCM_SERVER_KEY) return;
  await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      data: { _t: 'wakeup' }, // Leerer Trigger — kein Nachrichteninhalt
      priority: 'high',
      content_available: true, // iOS background wake
    }),
  });
}

/**
 * Sendet einen leeren APNs-Wakeup-Push (background push, kein Alert).
 * Nutzt HTTP/2 Provider API.
 */
async function sendApnsWakeup(token) {
  if (!APNS_KEY_ID || !APNS_TEAM_ID) return;
  const url = `https://api.push.apple.com/3/device/${token}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'apns-push-type': 'background',
      'apns-priority': '5', // Background priority
      'apns-topic': APNS_BUNDLE_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      aps: { 'content-available': 1 }, // Silent push — nur App aufwecken
    }),
  });
}

// ── Verwalter Rate Limiting ──────────────────────────────────────────────────
function checkVerwalterRateLimit(verwalterId, kategorie) {
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  if (!verwalterRateLimit.has(verwalterId)) {
    verwalterRateLimit.set(verwalterId, { total: [], categories: {} });
  }
  const entry = verwalterRateLimit.get(verwalterId);
  entry.total = entry.total.filter(t => t > hourAgo);
  if (entry.total.length >= 20) return { allowed: false, reason: 'rate_limit_total' };
  if (!entry.categories[kategorie]) entry.categories[kategorie] = [];
  entry.categories[kategorie] = entry.categories[kategorie].filter(t => t > hourAgo);
  if (entry.categories[kategorie].length >= 5) return { allowed: false, reason: 'rate_limit_category' };
  entry.total.push(now);
  entry.categories[kategorie].push(now);
  return { allowed: true };
}

// ── Auth Middleware ───────────────────────────────────────────────────────────

// ── HTTP Server ──────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // GET /api/health
  if (req.method === 'GET' && req.url === '/api/health') {
    const body = JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
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
    try {
      const body = await readBody(req);
      const { aregoId, displayName, firstName, lastName, nickname, publicKeyJwk } = JSON.parse(body);
      if (!aregoId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'aregoId erforderlich' }));
        return;
      }
      db.run(
        `INSERT INTO user_directory (arego_id, display_name, first_name, last_name, nickname, public_key_jwk, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(arego_id) DO UPDATE SET
           display_name = excluded.display_name,
           first_name = excluded.first_name,
           last_name = excluded.last_name,
           nickname = excluded.nickname,
           public_key_jwk = COALESCE(excluded.public_key_jwk, user_directory.public_key_jwk),
           updated_at = excluded.updated_at`,
        [aregoId, displayName ?? '', firstName ?? '', lastName ?? '', nickname ?? '', publicKeyJwk ? JSON.stringify(publicKeyJwk) : null, new Date().toISOString()]
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

  // ── GET /whoami/:arego_id — Server als einzige Wahrheitsquelle ──────────────
  const whoamiMatch = req.method === 'GET' && req.url?.match(/^\/whoami\/(.+)$/);
  if (whoamiMatch) {
    try {
      const aregoId = decodeURIComponent(whoamiMatch[1]);
      const rows = db.exec(`SELECT abo_status, abo_gueltig_bis, fsk_stufe, verwalter_1, verwalter_2, nickname_self_edit, verwalter_einstellungen_erlaubt, calls_enabled, max_call_participants FROM user_auth WHERE arego_id = ?`, [aregoId]);
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      let [abo_status, abo_gueltig_bis, fsk_stufe, verwalter_1, verwalter_2, nickname_self_edit, verwalter_einstellungen_erlaubt, calls_enabled, max_call_participants] = rows[0].values[0];
      const ist_kind = !!(verwalter_1 || verwalter_2);

      // Kind-Abo-Übernahme: wenn abgelaufen, Verwalter-Abo prüfen
      const aboAbgelaufen = abo_status === 'expired' || (abo_gueltig_bis && new Date(abo_gueltig_bis) < new Date());
      if (aboAbgelaufen) {
        const kindAbo = resolveKindAbo(aregoId);
        if (kindAbo) {
          abo_status = kindAbo.abo_status;
          abo_gueltig_bis = kindAbo.abo_gueltig_bis;
        }
      }

      // Verknüpfte Kinder dieses Nutzers (als Elternteil) — inkl. Namen aus user_directory
      const childRows = db.exec(
        `SELECT ua.arego_id, ua.fsk_stufe, ua.nickname_self_edit,
                COALESCE(ud.first_name, '') AS first_name,
                COALESCE(ud.last_name, '') AS last_name,
                COALESCE(ud.nickname, '') AS nickname,
                COALESCE(ud.display_name, '') AS display_name,
                ua.calls_enabled, ua.max_call_participants
         FROM user_auth ua
         LEFT JOIN user_directory ud ON ud.arego_id = ua.arego_id
         WHERE ua.verwalter_1 = ? OR ua.verwalter_2 = ?`,
        [aregoId, aregoId]
      );
      const linked_children = childRows.length ? childRows[0].values.map(r => ({
        child_id: r[0], fsk_stufe: r[1], nickname_self_edit: !!r[2],
        firstName: r[3], lastName: r[4], nickname: r[5], displayName: r[6],
        calls_enabled: !!r[7], max_call_participants: r[8] ?? 2,
      })) : [];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ arego_id: aregoId, abo_status, abo_gueltig_bis, fsk_stufe, verwalter_1, verwalter_2, nickname_self_edit: !!nickname_self_edit, verwalter_einstellungen_erlaubt: verwalter_einstellungen_erlaubt === null ? true : !!verwalter_einstellungen_erlaubt, calls_enabled: !!calls_enabled, max_call_participants: max_call_participants ?? 2, ist_kind, linked_children }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /child-link — Kind mit Elternteil verknüpfen (in user_auth) ──────
  if (req.method === 'POST' && req.url === '/child-link') {
    try {
      const body = await readBody(req);
      const { child_id, parent_id } = JSON.parse(body);
      if (!child_id || !parent_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'child_id und parent_id erforderlich' }));
        return;
      }
      // Aktuellen Verwalter-Status prüfen
      const existing = db.exec(`SELECT verwalter_1, verwalter_2 FROM user_auth WHERE arego_id = ?`, [child_id]);
      if (!existing.length || !existing[0].values.length) {
        // Kind hat noch keinen user_auth Eintrag — anlegen
        const now = new Date().toISOString();
        db.run(`INSERT INTO user_auth (arego_id, verwalter_1, fsk_stufe, letzter_heartbeat) VALUES (?, ?, 6, ?)`, [child_id, parent_id, now]);
      } else {
        const [v1, v2] = existing[0].values[0];
        if (v1 === parent_id || v2 === parent_id) {
          // Bereits verknüpft
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, already_linked: true }));
          return;
        }
        if (v1 && v2) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'max_parents', message: 'Maximal 2 Elternteile pro Kind' }));
          return;
        }
        if (!v1) {
          db.run(`UPDATE user_auth SET verwalter_1 = ?, fsk_stufe = 6 WHERE arego_id = ?`, [parent_id, child_id]);
        } else {
          db.run(`UPDATE user_auth SET verwalter_2 = ?, fsk_stufe = 6 WHERE arego_id = ?`, [parent_id, child_id]);
        }
      }
      persistDb();

      // Beide per WebSocket benachrichtigen
      const notifyParent = JSON.stringify({ type: 'child_linked', child_id, role: 'parent' });
      const notifyChild = JSON.stringify({ type: 'child_linked', parent_id, role: 'child' });

      const parentSockets = onlineUsers.get(parent_id);
      let parentDelivered = false;
      if (parentSockets) {
        for (const ws of parentSockets) { if (ws.readyState === 1) { ws.send(notifyParent); parentDelivered = true; } }
      }
      if (!parentDelivered) storePending(`inbox:${parent_id}`, Buffer.from(notifyParent));

      const childSockets = onlineUsers.get(child_id);
      let childDelivered = false;
      if (childSockets) {
        for (const ws of childSockets) { if (ws.readyState === 1) { ws.send(notifyChild); childDelivered = true; } }
      }
      if (!childDelivered) storePending(`inbox:${child_id}`, Buffer.from(notifyChild));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /child-profile — Verwalter ändert Name des Kindes ──────────────────
  if (req.method === 'POST' && req.url === '/child-profile') {
    try {
      const body = await readBody(req);
      const { child_id, parent_id, firstName, lastName, nickname } = JSON.parse(body);
      if (!child_id || !parent_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'child_id und parent_id erforderlich' }));
        return;
      }
      // Prüfen ob parent_id tatsächlich Verwalter ist
      const rows = db.exec(`SELECT verwalter_1, verwalter_2 FROM user_auth WHERE arego_id = ?`, [child_id]);
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'child_not_found' }));
        return;
      }
      const [v1, v2] = rows[0].values[0];
      if (v1 !== parent_id && v2 !== parent_id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_verwalter', message: 'Du bist kein Verwalter dieses Kindes' }));
        return;
      }
      // Display-Name aus Vor-/Nachname
      const displayName = [firstName, lastName].filter(Boolean).join(' ') || '';
      // In user_directory speichern
      db.run(
        `INSERT INTO user_directory (arego_id, display_name, first_name, last_name, nickname, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(arego_id) DO UPDATE SET
           display_name = excluded.display_name,
           first_name = excluded.first_name,
           last_name = excluded.last_name,
           nickname = excluded.nickname,
           updated_at = excluded.updated_at`,
        [child_id, displayName, firstName ?? '', lastName ?? '', nickname ?? '', new Date().toISOString()]
      );
      persistDb();

      // Kind per WebSocket benachrichtigen
      const notify = JSON.stringify({ type: 'child_profile_updated', firstName, lastName, nickname });
      const childSockets = onlineUsers.get(child_id);
      let delivered = false;
      if (childSockets) {
        for (const ws of childSockets) { if (ws.readyState === 1) { ws.send(notify); delivered = true; } }
      }
      if (!delivered) storePending(`inbox:${child_id}`, Buffer.from(notify));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /child-settings/update — Verwalter ändert Kind-Einstellung (ECDSA) ─
  if (req.method === 'POST' && req.url === '/child-settings/update') {
    try {
      const body = await readBody(req);
      const { verwalter_id, kind_id, kategorie, aktion, payload_encrypted, signature, timestamp } = JSON.parse(body);
      if (!verwalter_id || !kind_id || !kategorie || !aktion || !signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'verwalter_id, kind_id, kategorie, aktion, signature, timestamp erforderlich' }));
        return;
      }
      // Timestamp-Validierung (max 5 Minuten alt)
      const tsAge = Math.abs(Date.now() - new Date(timestamp).getTime());
      if (tsAge > 5 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'timestamp_expired' }));
        return;
      }
      // ECDSA-Signaturverifikation
      const dataToVerify = kind_id + kategorie + timestamp;
      const valid = await verifyEcdsaSignature(verwalter_id, signature, dataToVerify);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // Verwalter-Berechtigung prüfen
      const rows = db.exec(
        `SELECT verwalter_1, verwalter_2, fsk_stufe, verwalter_einstellungen_erlaubt FROM user_auth WHERE arego_id = ?`,
        [kind_id]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'kind_not_found' }));
        return;
      }
      const [v1, v2, kindFsk, einstellungenErlaubt] = rows[0].values[0];
      if (v1 !== verwalter_id && v2 !== verwalter_id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_verwalter' }));
        return;
      }
      if (!einstellungenErlaubt) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'verwalter_einstellungen_deaktiviert', message: 'Kind hat Verwalter-Einstellungen deaktiviert' }));
        return;
      }
      // FSK-Validierung bei Kategorie 'fsk'
      if (kategorie === 'fsk') {
        // Verwalter-FSK prüfen
        const vRows = db.exec(`SELECT fsk_stufe FROM user_auth WHERE arego_id = ?`, [verwalter_id]);
        const verwalterFsk = vRows.length && vRows[0].values.length ? vRows[0].values[0][0] : 6;
        // payload_encrypted enthält bei FSK die gewünschte Stufe nicht im Klartext,
        // aber aktion enthält die Stufe als 'fsk_upgrade_XX'
        const targetFskMatch = aktion.match(/fsk_upgrade_(\d+)/);
        if (targetFskMatch) {
          const targetFsk = parseInt(targetFskMatch[1], 10);
          if (targetFsk <= kindFsk) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'fsk_no_downgrade', message: 'FSK kann nicht gesenkt werden' }));
            return;
          }
          if (targetFsk > verwalterFsk) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'fsk_exceeds_verwalter', message: 'FSK darf Verwalter-Stufe nicht überschreiten' }));
            return;
          }
        }
      }
      // Rate Limiting
      const rateCheck = checkVerwalterRateLimit(verwalter_id, kategorie);
      if (!rateCheck.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: rateCheck.reason }));
        return;
      }
      // Audit-Log schreiben (nur Metadaten — CR-1)
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO verwalter_audit_log (verwalter_id, kind_id, aktion, kategorie, zeitstempel) VALUES (?, ?, ?, ?, ?)`,
        [verwalter_id, kind_id, aktion.slice(0, 100), kategorie.slice(0, 50), now]
      );
      const auditId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];
      // Zustellung: WebSocket oder Sync-Queue
      let delivered = false;
      const notify = JSON.stringify({
        type: 'child_settings_update',
        verwalter_id,
        kind_id,
        kategorie,
        aktion,
        payload_encrypted: payload_encrypted ?? '',
      });
      const kindSockets = onlineUsers.get(kind_id);
      if (kindSockets) {
        for (const ws of kindSockets) {
          if (ws.readyState === 1) { ws.send(notify); delivered = true; }
        }
      }
      if (!delivered && payload_encrypted) {
        // Offline → in Sync-Queue (max 50 Einträge, FIFO)
        db.run(
          `INSERT INTO verwalter_settings_sync (kind_id, verwalter_id, settings_kategorie, payload_encrypted, erstellt_am) VALUES (?, ?, ?, ?, ?)`,
          [kind_id, verwalter_id, kategorie, payload_encrypted, now]
        );
        // FIFO: älteste löschen wenn > 50
        db.run(
          `DELETE FROM verwalter_settings_sync WHERE kind_id = ? AND id NOT IN (SELECT id FROM verwalter_settings_sync WHERE kind_id = ? ORDER BY id DESC LIMIT 50)`,
          [kind_id, kind_id]
        );
      }
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, audit_id: auditId, delivered }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /child-settings/audit/:kind_id — Audit-Log abrufen ─────────────────
  const auditMatch = req.method === 'GET' && req.url?.match(/^\/child-settings\/audit\/([^?]+)/);
  if (auditMatch) {
    try {
      const kindId = decodeURIComponent(auditMatch[1]);
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const requesterId = url.searchParams.get('requester_id');
      const sig = url.searchParams.get('signature');
      const ts = url.searchParams.get('timestamp');
      if (!requesterId || !sig || !ts) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'requester_id, signature, timestamp erforderlich' }));
        return;
      }
      // ECDSA-Signaturverifikation
      const valid = await verifyEcdsaSignature(requesterId, sig, kindId + 'audit' + ts);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // Zugriffsprüfung: Verwalter des Kindes ODER Kind selbst (ab FSK 12)
      const rows = db.exec(
        `SELECT verwalter_1, verwalter_2, fsk_stufe FROM user_auth WHERE arego_id = ?`,
        [kindId]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'kind_not_found' }));
        return;
      }
      const [v1, v2, fsk] = rows[0].values[0];
      const isVerwalter = v1 === requesterId || v2 === requesterId;
      const isSelf = requesterId === kindId && fsk >= 12;
      if (!isVerwalter && !isSelf) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'access_denied' }));
        return;
      }
      // Audit-Log abfragen
      const auditRows = db.exec(
        `SELECT id, verwalter_id, aktion, kategorie, zeitstempel FROM verwalter_audit_log WHERE kind_id = ? ORDER BY zeitstempel DESC LIMIT 200`,
        [kindId]
      );
      const audits = auditRows.length ? auditRows[0].values.map(r => ({
        id: r[0], verwalter_id: r[1], aktion: r[2], kategorie: r[3], zeitstempel: r[4],
      })) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ audits }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /child-settings/self-determination — Kind deaktiviert Verwalter-Zugriff (ab FSK 16) ──
  if (req.method === 'POST' && req.url === '/child-settings/self-determination') {
    try {
      const body = await readBody(req);
      const { kind_id, verwalter_einstellungen_erlaubt, signature, timestamp } = JSON.parse(body);
      if (!kind_id || verwalter_einstellungen_erlaubt === undefined || !signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'kind_id, verwalter_einstellungen_erlaubt, signature, timestamp erforderlich' }));
        return;
      }
      // ECDSA-Signaturverifikation des Kindes
      const valid = await verifyEcdsaSignature(kind_id, signature, kind_id + 'self_determination' + timestamp);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // FSK prüfen: >= 16
      const rows = db.exec(`SELECT fsk_stufe, verwalter_1, verwalter_2 FROM user_auth WHERE arego_id = ?`, [kind_id]);
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'kind_not_found' }));
        return;
      }
      const [fsk, v1, v2] = rows[0].values[0];
      if (fsk < 16) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'fsk_zu_niedrig', message: 'Selbstbestimmung erst ab FSK 16' }));
        return;
      }
      const erlaubt = verwalter_einstellungen_erlaubt ? 1 : 0;
      db.run(`UPDATE user_auth SET verwalter_einstellungen_erlaubt = ? WHERE arego_id = ?`, [erlaubt, kind_id]);
      // Audit-Log
      const now = new Date().toISOString();
      const auditAktion = erlaubt ? 'activated' : 'deactivated';
      db.run(
        `INSERT INTO verwalter_audit_log (verwalter_id, kind_id, aktion, kategorie, zeitstempel) VALUES (?, ?, ?, ?, ?)`,
        [kind_id, kind_id, auditAktion, 'verwalter_access', now]
      );
      persistDb();
      // Verwalter benachrichtigen
      const notify = JSON.stringify({
        type: 'verwalter_access_changed',
        kind_id,
        verwalter_einstellungen_erlaubt: !!erlaubt,
      });
      for (const parentId of [v1, v2].filter(Boolean)) {
        const parentSockets = onlineUsers.get(parentId);
        let delivered = false;
        if (parentSockets) {
          for (const ws of parentSockets) { if (ws.readyState === 1) { ws.send(notify); delivered = true; } }
        }
        if (!delivered) storePending(`inbox:${parentId}`, Buffer.from(notify));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /child-settings/pending/:kind_id — Ausstehende Sync-Einträge abrufen + löschen ──
  const pendingMatch = req.method === 'GET' && req.url?.match(/^\/child-settings\/pending\/([^?]+)/);
  if (pendingMatch) {
    try {
      const kindId = decodeURIComponent(pendingMatch[1]);
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const requesterId = url.searchParams.get('requester_id');
      const sig = url.searchParams.get('signature');
      const ts = url.searchParams.get('timestamp');
      if (!requesterId || !sig || !ts) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'requester_id, signature, timestamp erforderlich' }));
        return;
      }
      // Nur das Kind selbst darf ausstehende Einträge abholen
      if (requesterId !== kindId) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'access_denied', message: 'Nur das Kind selbst kann ausstehende Einträge abholen' }));
        return;
      }
      // ECDSA-Signaturverifikation
      const valid = await verifyEcdsaSignature(requesterId, sig, kindId + 'pending' + ts);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // Ausstehende Einträge abrufen
      const syncRows = db.exec(
        `SELECT id, verwalter_id, settings_kategorie, payload_encrypted, erstellt_am FROM verwalter_settings_sync WHERE kind_id = ? ORDER BY erstellt_am ASC`,
        [kindId]
      );
      const pending = syncRows.length ? syncRows[0].values.map(r => ({
        id: r[0], verwalter_id: r[1], kategorie: r[2], payload_encrypted: r[3], erstellt_am: r[4],
      })) : [];
      // Sofort nach Abholung löschen (VG-1: DELETE, kein Soft-Delete)
      if (pending.length > 0) {
        const ids = pending.map(p => p.id);
        db.run(`DELETE FROM verwalter_settings_sync WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        persistDb();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pending }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── GET /child-settings/export/:kind_id — DSGVO Art. 20 Export ─────────────
  const exportMatch = req.method === 'GET' && req.url?.match(/^\/child-settings\/export\/([^?]+)/);
  if (exportMatch) {
    try {
      const kindId = decodeURIComponent(exportMatch[1]);
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const requesterId = url.searchParams.get('requester_id');
      const sig = url.searchParams.get('signature');
      const ts = url.searchParams.get('timestamp');
      if (!requesterId || !sig || !ts) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'requester_id, signature, timestamp erforderlich' }));
        return;
      }
      // ECDSA-Signaturverifikation
      const valid = await verifyEcdsaSignature(requesterId, sig, kindId + 'export' + ts);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // Zugriffsprüfung: Verwalter des Kindes ODER Kind selbst (ab FSK 12)
      const rows = db.exec(
        `SELECT fsk_stufe, verwalter_1, verwalter_2, verwalter_einstellungen_erlaubt FROM user_auth WHERE arego_id = ?`,
        [kindId]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'kind_not_found' }));
        return;
      }
      const [fsk, v1, v2, einstellungenErlaubt] = rows[0].values[0];
      const isVerwalter = v1 === requesterId || v2 === requesterId;
      const isSelf = requesterId === kindId && fsk >= 12;
      if (!isVerwalter && !isSelf) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'access_denied' }));
        return;
      }
      // Audit-Log für Export loggen
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO verwalter_audit_log (verwalter_id, kind_id, aktion, kategorie, zeitstempel) VALUES (?, ?, ?, ?, ?)`,
        [requesterId, kindId, 'art20_export', 'export', now]
      );
      persistDb();
      // Export-Daten zusammenstellen
      const verwalterBeziehungen = [];
      if (v1) verwalterBeziehungen.push({ verwalter_id: v1, rolle: 'verwalter_1' });
      if (v2) verwalterBeziehungen.push({ verwalter_id: v2, rolle: 'verwalter_2' });
      // Audit-Log
      const auditRows = db.exec(
        `SELECT id, verwalter_id, aktion, kategorie, zeitstempel FROM verwalter_audit_log WHERE kind_id = ? ORDER BY zeitstempel DESC`,
        [kindId]
      );
      const auditLog = auditRows.length ? auditRows[0].values.map(r => ({
        id: r[0], verwalter_id: r[1], aktion: r[2], kategorie: r[3], zeitstempel: r[4],
      })) : [];
      // Pending sync (verschlüsselt)
      const syncRows = db.exec(
        `SELECT id, verwalter_id, settings_kategorie, payload_encrypted, erstellt_am FROM verwalter_settings_sync WHERE kind_id = ?`,
        [kindId]
      );
      const pendingSync = syncRows.length ? syncRows[0].values.map(r => ({
        id: r[0], verwalter_id: r[1], kategorie: r[2], payload_encrypted: r[3], erstellt_am: r[4],
      })) : [];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        export: {
          kind_id: kindId,
          export_zeitstempel: now,
          verwalter_beziehungen: verwalterBeziehungen,
          einstellungen_erlaubt: !!einstellungenErlaubt,
          fsk_stufe: fsk,
          audit_log: auditLog,
          pending_sync: pendingSync,
        },
      }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── DELETE /child-settings/data/:kind_id — DSGVO Art. 17 Löschung ohne Vorbehalt ──
  const deleteDataMatch = req.method === 'DELETE' && req.url?.match(/^\/child-settings\/data\/([^?]+)/);
  if (deleteDataMatch) {
    try {
      const kindId = decodeURIComponent(deleteDataMatch[1]);
      const body = await readBody(req);
      const { requester_id, signature, timestamp } = JSON.parse(body);
      if (!requester_id || !signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'requester_id, signature, timestamp erforderlich' }));
        return;
      }
      // ECDSA-Signaturverifikation
      const valid = await verifyEcdsaSignature(requester_id, signature, kindId + 'delete' + timestamp);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // Zugriffsprüfung: Verwalter des Kindes ODER Kind selbst (ab FSK 12)
      const rows = db.exec(
        `SELECT fsk_stufe, verwalter_1, verwalter_2 FROM user_auth WHERE arego_id = ?`,
        [kindId]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'kind_not_found' }));
        return;
      }
      const [fsk, v1, v2] = rows[0].values[0];
      const isVerwalter = v1 === requester_id || v2 === requester_id;
      const isSelf = requester_id === kindId && fsk >= 12;
      if (!isVerwalter && !isSelf) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'access_denied' }));
        return;
      }
      // Art. 17: Ohne Vorbehalt löschen — keine Aufbewahrungspflicht
      db.run(`DELETE FROM verwalter_audit_log WHERE kind_id = ?`, [kindId]);
      db.run(`DELETE FROM verwalter_settings_sync WHERE kind_id = ?`, [kindId]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deleted: { audit_log: true, settings_sync: true } }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /child-settings/:child_id — Kind-Einstellungen abrufen ─────────────
  const childSettingsGet = req.method === 'GET' && req.url?.match(/^\/child-settings\/(.+)$/);
  if (childSettingsGet) {
    try {
      const childId = decodeURIComponent(childSettingsGet[1]);
      const rows = db.exec(`SELECT fsk_stufe, nickname_self_edit, verwalter_1, verwalter_2, verwalter_einstellungen_erlaubt, calls_enabled, max_call_participants FROM user_auth WHERE arego_id = ?`, [childId]);
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      const [fsk_stufe, nickname_self_edit, v1, v2, einstellungen_erlaubt, calls_enabled, max_call_participants] = rows[0].values[0];
      // Profil-Daten aus user_directory laden
      const dirRows = db.exec(`SELECT first_name, last_name, nickname, display_name FROM user_directory WHERE arego_id = ?`, [childId]);
      const dir = dirRows.length && dirRows[0].values.length ? dirRows[0].values[0] : ['', '', '', ''];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        fsk_stufe,
        nickname_self_edit: !!nickname_self_edit,
        verwalter_einstellungen_erlaubt: einstellungen_erlaubt === null ? true : !!einstellungen_erlaubt,
        verwalter_1: v1, verwalter_2: v2,
        calls_enabled: !!calls_enabled,
        max_call_participants: max_call_participants ?? 2,
        firstName: dir[0] ?? '', lastName: dir[1] ?? '', nickname: dir[2] ?? '', displayName: dir[3] ?? '',
      }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /child-settings — Verwalter setzt Kind-Einstellungen ──────────────
  if (req.method === 'POST' && req.url === '/child-settings') {
    try {
      const body = await readBody(req);
      const { child_id, parent_id, nickname_self_edit, calls_enabled, max_call_participants } = JSON.parse(body);
      if (!child_id || !parent_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'child_id und parent_id erforderlich' }));
        return;
      }
      // Verwalter-Check
      const rows = db.exec(`SELECT verwalter_1, verwalter_2, fsk_stufe FROM user_auth WHERE arego_id = ?`, [child_id]);
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'child_not_found' }));
        return;
      }
      const [v1, v2, fsk] = rows[0].values[0];
      if (v1 !== parent_id && v2 !== parent_id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_verwalter' }));
        return;
      }
      // Ab FSK 16 kann der Toggle nicht mehr gesetzt werden
      if (fsk >= 16) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'fsk_16_plus', message: 'Ab FSK 16 darf das Kind den Spitznamen immer selbst ändern' }));
        return;
      }
      if (nickname_self_edit !== undefined) {
        db.run(`UPDATE user_auth SET nickname_self_edit = ? WHERE arego_id = ?`, [nickname_self_edit ? 1 : 0, child_id]);
        persistDb();
      }
      if (calls_enabled !== undefined) {
        db.run(`UPDATE user_auth SET calls_enabled = ? WHERE arego_id = ?`, [calls_enabled ? 1 : 0, child_id]);
        persistDb();
      }
      if (max_call_participants !== undefined) {
        const val = Math.max(2, Math.min(10, parseInt(max_call_participants) || 2));
        db.run(`UPDATE user_auth SET max_call_participants = ? WHERE arego_id = ?`, [val, child_id]);
        persistDb();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /fsk/eudi-upgrade — Kind verifiziert Alter via EUDI Wallet ────────
  if (req.method === 'POST' && req.url === '/fsk/eudi-upgrade') {
    try {
      const body = await readBody(req);
      const { arego_id, verified_age } = JSON.parse(body);
      if (!arego_id || !verified_age || typeof verified_age !== 'number') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'arego_id und verified_age (Zahl) erforderlich' }));
        return;
      }
      // FSK-Stufe aus Alter berechnen
      let newFsk = 6;
      if (verified_age >= 18) newFsk = 18;
      else if (verified_age >= 16) newFsk = 16;
      else if (verified_age >= 12) newFsk = 12;

      // Nur hochstufen, nicht runterstufen
      const rows = db.exec(`SELECT fsk_stufe, verwalter_1, verwalter_2 FROM user_auth WHERE arego_id = ?`, [arego_id]);
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      const [currentFsk, v1, v2] = rows[0].values[0];
      if (newFsk <= currentFsk) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, changed: false, fsk_stufe: currentFsk, message: 'Bereits auf dieser oder höherer Stufe' }));
        return;
      }

      // FSK hochstufen
      db.run(`UPDATE user_auth SET fsk_stufe = ? WHERE arego_id = ?`, [newFsk, arego_id]);
      // Ab FSK 16: nickname_self_edit wird irrelevant, aber setzen wir auf 1
      if (newFsk >= 16) {
        db.run(`UPDATE user_auth SET nickname_self_edit = 1 WHERE arego_id = ?`, [arego_id]);
      }

      const verwalter = [v1, v2].filter(Boolean);

      // ── FSK 18: Loslösung — Verknüpfung lösen + Probe-Abo ──────────────
      if (newFsk >= 18 && verwalter.length > 0) {
        // Verwalter-Verknüpfung entfernen
        db.run(`UPDATE user_auth SET verwalter_1 = NULL, verwalter_2 = NULL, nickname_self_edit = 1 WHERE arego_id = ?`, [arego_id]);
        // Frisches Probe-Abo (30 Tage)
        const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        db.run(`UPDATE user_auth SET abo_status = 'trial', abo_gueltig_bis = ? WHERE arego_id = ?`, [trialEnd, arego_id]);

        // Kind benachrichtigen: Loslösung
        const detachNotify = JSON.stringify({
          type: 'child_detached',
          child_id: arego_id,
          new_fsk: newFsk,
          abo_status: 'trial',
          abo_gueltig_bis: trialEnd,
        });
        const childSockets = onlineUsers.get(arego_id);
        if (childSockets) {
          for (const ws of childSockets) { if (ws.readyState === 1) ws.send(detachNotify); }
        } else {
          storePending(`inbox:${arego_id}`, Buffer.from(detachNotify));
        }

        // Verwalter benachrichtigen: Kind hat sich gelöst
        for (const parentId of verwalter) {
          const notify = JSON.stringify({ type: 'child_detached', child_id: arego_id, new_fsk: newFsk });
          const parentSockets = onlineUsers.get(parentId);
          let delivered = false;
          if (parentSockets) {
            for (const ws of parentSockets) { if (ws.readyState === 1) { ws.send(notify); delivered = true; } }
          }
          if (!delivered) storePending(`inbox:${parentId}`, Buffer.from(notify));
        }
      } else {
        // Normale FSK-Hochstufung: Verwalter benachrichtigen
        for (const parentId of verwalter) {
          const notify = JSON.stringify({ type: 'child_fsk_upgraded', child_id: arego_id, new_fsk: newFsk });
          const parentSockets = onlineUsers.get(parentId);
          let delivered = false;
          if (parentSockets) {
            for (const ws of parentSockets) { if (ws.readyState === 1) { ws.send(notify); delivered = true; } }
          }
          if (!delivered) storePending(`inbox:${parentId}`, Buffer.from(notify));
        }
      }

      persistDb();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, changed: true, fsk_stufe: newFsk, detached: newFsk >= 18 && verwalter.length > 0 }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /eudi/register — EUDI-Hash mit Arego-ID verknüpfen (ARE-305) ──────
  if (req.method === 'POST' && req.url === '/eudi/register') {
    try {
      const body = await readBody(req);
      const { arego_id, eudi_hash } = JSON.parse(body);
      if (!arego_id || !eudi_hash) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'arego_id und eudi_hash erforderlich' }));
        return;
      }
      const normalized = eudi_hash.trim();

      // Prüfen ob dieser Hash bereits einem anderen Nutzer zugeordnet ist
      const existing = db.exec(
        `SELECT arego_id FROM user_auth WHERE eudi_hash = ? AND arego_id != ?`,
        [normalized, arego_id]
      );
      if (existing.length && existing[0].values.length) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'eudi_hash_conflict', existing_arego_id: existing[0].values[0][0] }));
        return;
      }

      // Hash speichern (user_auth Eintrag muss existieren)
      const rows = db.exec(`SELECT arego_id FROM user_auth WHERE arego_id = ?`, [arego_id]);
      if (!rows.length || !rows[0].values.length) {
        // Nutzer hat noch keinen user_auth Eintrag — anlegen
        const now = new Date().toISOString();
        db.run(
          `INSERT INTO user_auth (arego_id, eudi_hash, letzter_heartbeat) VALUES (?, ?, ?)`,
          [arego_id, normalized, now]
        );
      } else {
        db.run(`UPDATE user_auth SET eudi_hash = ? WHERE arego_id = ?`, [normalized, arego_id]);
      }
      persistDb();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /eudi/recover — Konto via EUDI-Hash wiederherstellen (ARE-305) ────
  if (req.method === 'POST' && req.url === '/eudi/recover') {
    try {
      const body = await readBody(req);
      const { eudi_hash } = JSON.parse(body);
      if (!eudi_hash) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'eudi_hash erforderlich' }));
        return;
      }
      const normalized = eudi_hash.trim();

      // Nutzer anhand EUDI-Hash suchen
      const rows = db.exec(
        `SELECT arego_id, abo_status, abo_gueltig_bis, fsk_stufe, verwalter_1, verwalter_2,
                calls_enabled, max_call_participants
         FROM user_auth WHERE eudi_hash = ?`,
        [normalized]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ found: false }));
        return;
      }
      const [aregoId, aboStatus, aboGueltigBis, fskStufe, v1, v2, callsEnabled, maxCallParticipants] = rows[0].values[0];

      // Profildaten aus user_directory laden (falls vorhanden)
      const dirRows = db.exec(
        `SELECT display_name, first_name, last_name, nickname, public_key_jwk
         FROM user_directory WHERE arego_id = ?`,
        [aregoId]
      );
      const profile = dirRows.length && dirRows[0].values.length
        ? { displayName: dirRows[0].values[0][0], firstName: dirRows[0].values[0][1],
            lastName: dirRows[0].values[0][2], nickname: dirRows[0].values[0][3],
            publicKeyJwk: dirRows[0].values[0][4] ? JSON.parse(dirRows[0].values[0][4]) : null }
        : null;

      // Abo-Info aufbereiten
      const subscription = (aboStatus && aboStatus !== 'none')
        ? { status: aboStatus, gueltig_bis: aboGueltigBis }
        : null;

      // Konflikt-Erkennung: prüfen ob Nutzer gerade online ist (anderes Gerät)
      const isOnline = onlineUsers.has(aregoId) && onlineUsers.get(aregoId).size > 0;
      const conflict = isOnline
        ? { deviceA: 'Aktuelles Gerät', deviceB: 'Anderes Gerät (online)' }
        : undefined;

      // Heartbeat aktualisieren
      db.run(`UPDATE user_auth SET letzter_heartbeat = ? WHERE arego_id = ?`,
        [new Date().toISOString(), aregoId]);
      persistDb();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        found: true,
        arego_id: aregoId,
        fsk_level: fskStufe,
        subscription,
        profile,
        ist_kind: !!(v1 || v2),
        verwalter_1: v1,
        verwalter_2: v2,
        calls_enabled: !!callsEnabled,
        max_call_participants: maxCallParticipants ?? 2,
        conflict,
      }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /backup/upload — Verschlüsseltes Backup in Hetzner Object Storage hochladen (ARE-307) ──
  if (req.method === 'POST' && req.url === '/backup/upload') {
    try {
      // Arego-ID und EUDI-Hash aus Headern lesen
      const aregoId = req.headers['x-arego-id'];
      const eudiHash = req.headers['x-eudi-hash'];
      if (!aregoId || !eudiHash) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'x-arego-id und x-eudi-hash Header erforderlich' }));
        return;
      }

      // EUDI-Hash verifizieren — muss zum Arego-ID passen
      const authRows = db.exec(
        `SELECT eudi_hash, abo_status, abo_gueltig_bis FROM user_auth WHERE arego_id = ?`,
        [aregoId]
      );
      if (!authRows.length || !authRows[0].values.length) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'arego_id_not_found' }));
        return;
      }
      const [storedHash, aboStatus, aboGueltigBis] = authRows[0].values[0];
      if (!storedHash || storedHash !== eudiHash.trim()) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'eudi_hash_mismatch' }));
        return;
      }

      // Abo prüfen — nur aktive Abos dürfen Cloud-Backup nutzen
      const hasAbo = aboStatus === 'active' || aboStatus === 'trial';
      const aboExpired = aboGueltigBis && new Date(aboGueltigBis).getTime() < Date.now();
      if (!hasAbo || (aboStatus === 'active' && aboExpired)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'abo_required' }));
        return;
      }

      // Binären Body lesen (verschlüsselte .arego-Datei)
      const buffer = await readBinaryBody(req);

      // S3-Key: backups/{eudi-hash-prefix}/{arego-id}.arego
      const prefix = eudiHash.trim().substring(0, 8);
      const s3Key = `backups/${prefix}/${aregoId}.arego`;

      await uploadFile(s3Key, buffer, 'application/octet-stream');

      // Backup-Metadaten in DB speichern
      db.run(`UPDATE user_auth SET backup_s3_key = ?, backup_updated_at = ? WHERE arego_id = ?`,
        [s3Key, new Date().toISOString(), aregoId]);
      persistDb();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, size: buffer.length }));
    } catch (err) {
      console.error('[Backup Upload] Fehler:', err.message);
      if (err.message === 'too large') {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'backup_too_large' }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upload_failed' }));
      }
    }
    return;
  }

  // ── POST /backup/download — Backup aus Hetzner laden (nach EUDI-Verifikation) (ARE-307) ──
  if (req.method === 'POST' && req.url === '/backup/download') {
    try {
      const body = await readBody(req);
      const { eudi_hash } = JSON.parse(body);
      if (!eudi_hash) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'eudi_hash erforderlich' }));
        return;
      }
      const normalized = eudi_hash.trim();

      // Nutzer per EUDI-Hash suchen
      const rows = db.exec(
        `SELECT arego_id, backup_s3_key, backup_updated_at FROM user_auth WHERE eudi_hash = ?`,
        [normalized]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ found: false }));
        return;
      }
      const [aregoId, s3Key, backupUpdatedAt] = rows[0].values[0];
      if (!s3Key) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ found: true, arego_id: aregoId, has_backup: false }));
        return;
      }

      // Presigned URL erzeugen (1 Stunde gültig)
      const url = await getFileUrl(s3Key);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        found: true,
        arego_id: aregoId,
        has_backup: true,
        backup_url: url,
        backup_updated_at: backupUpdatedAt,
      }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /backup/status/:aregoId — Backup-Status prüfen (ARE-307) ──
  if (req.method === 'GET' && req.url?.startsWith('/backup/status/')) {
    try {
      const aregoId = decodeURIComponent(req.url.split('/backup/status/')[1]);
      if (!aregoId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'arego_id erforderlich' }));
        return;
      }

      const rows = db.exec(
        `SELECT backup_s3_key, backup_updated_at, abo_status, abo_gueltig_bis FROM user_auth WHERE arego_id = ?`,
        [aregoId]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ has_backup: false, cloud_enabled: false }));
        return;
      }
      const [s3Key, backupUpdatedAt, aboStatus, aboGueltigBis] = rows[0].values[0];
      const hasAbo = aboStatus === 'active' || aboStatus === 'trial';
      const aboExpired = aboGueltigBis && new Date(aboGueltigBis).getTime() < Date.now();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        has_backup: !!s3Key,
        backup_updated_at: backupUpdatedAt || null,
        cloud_enabled: hasAbo && !aboExpired,
      }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── POST /contacts/online — Online-Status von Kontakten prüfen (ARE-307) ──
  if (req.method === 'POST' && req.url === '/contacts/online') {
    try {
      const body = await readBody(req);
      const { arego_id, contact_ids } = JSON.parse(body);
      if (!arego_id || !Array.isArray(contact_ids)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'arego_id und contact_ids erforderlich' }));
        return;
      }

      const online = [];
      for (const cid of contact_ids.slice(0, 100)) {
        if (typeof cid !== 'string') continue;
        const sockets = onlineUsers.get(cid);
        if (sockets && sockets.size > 0) {
          // Display-Name aus user_directory laden
          const dirRows = db.exec(
            `SELECT display_name FROM user_directory WHERE arego_id = ?`,
            [cid]
          );
          const displayName = dirRows.length && dirRows[0].values.length
            ? dirRows[0].values[0][0] || cid
            : cid;
          online.push({ id: cid, displayName });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ online }));
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

  // ── POST /node — LiveKit-Node registrieren ──────────────────────────────────
  if (req.method === 'POST' && req.url === '/node') {
    try {
      const body = await readBody(req);
      const { url, name } = JSON.parse(body);
      if (!url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url erforderlich' }));
        return;
      }
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();
      db.run(`
        INSERT INTO livekit_nodes (id, url, name, registered_at)
        VALUES (?, ?, ?, ?)
      `, [id, url, (name ?? '').slice(0, 100), now]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id, url, name: name ?? '', registeredAt: now }));
    } catch {
      res.writeHead(400); res.end();
    }
    return;
  }

  // ── GET /nodes — Alle registrierten LiveKit-Nodes ──────────────────────────
  if (req.method === 'GET' && req.url === '/nodes') {
    try {
      const rows = db.exec(`SELECT id, url, name, registered_at FROM livekit_nodes ORDER BY registered_at DESC`);
      const nodes = rows.length ? rows[0].values.map(([id, url, name, registered_at]) => ({
        id, url, name, registeredAt: registered_at,
      })) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(nodes));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── DELETE /node/:id — LiveKit-Node entfernen ──────────────────────────────
  const nodeDeleteMatch = req.method === 'DELETE' && req.url?.match(/^\/node\/([a-z0-9]+)$/);
  if (nodeDeleteMatch) {
    try {
      const nodeId = nodeDeleteMatch[1];
      const existing = db.exec(`SELECT id FROM livekit_nodes WHERE id = ?`, [nodeId]);
      if (!existing.length || !existing[0].values.length) {
        res.writeHead(404); res.end(); return;
      }
      db.run(`DELETE FROM livekit_nodes WHERE id = ?`, [nodeId]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /push/register — Push-Token registrieren (ECDSA-signiert) (ARE-345) ──
  if (req.method === 'POST' && req.url === '/push/register') {
    try {
      const body = await readBody(req);
      const { arego_id, token, provider, signature, timestamp } = JSON.parse(body);
      if (!arego_id || !token || !provider || !signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_fields' }));
        return;
      }
      if (provider !== 'fcm' && provider !== 'apns') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_provider' }));
        return;
      }
      const tsAge = Math.abs(Date.now() - new Date(timestamp).getTime());
      if (tsAge > 5 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'timestamp_expired' }));
        return;
      }
      const dataToVerify = arego_id + token + timestamp;
      const valid = await verifyEcdsaSignature(arego_id, signature, dataToVerify);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      const now = Date.now();
      db.run(
        `INSERT OR REPLACE INTO push_tokens (arego_id, token, provider, updated_at) VALUES (?, ?, ?, ?)`,
        [arego_id, token, provider, now]
      );
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── DELETE /push/register — Push-Token deregistrieren (ECDSA-signiert) (ARE-345) ──
  if (req.method === 'DELETE' && req.url === '/push/register') {
    try {
      const body = await readBody(req);
      const { arego_id, token, signature, timestamp } = JSON.parse(body);
      if (!arego_id || !token || !signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_fields' }));
        return;
      }
      const tsAge = Math.abs(Date.now() - new Date(timestamp).getTime());
      if (tsAge > 5 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'timestamp_expired' }));
        return;
      }
      const dataToVerify = arego_id + 'deregister' + timestamp;
      const valid = await verifyEcdsaSignature(arego_id, signature, dataToVerify);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      db.run(`DELETE FROM push_tokens WHERE arego_id = ? AND token = ?`, [arego_id, token]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /push/wakeup — Leeren Wakeup-Push an Arego-ID senden (ARE-345) ──
  if (req.method === 'POST' && req.url === '/push/wakeup') {
    try {
      const body = await readBody(req);
      const { arego_id, target_arego_id, signature, timestamp } = JSON.parse(body);
      if (!arego_id || !target_arego_id || !signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_fields' }));
        return;
      }
      const tsAge = Math.abs(Date.now() - new Date(timestamp).getTime());
      if (tsAge > 5 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'timestamp_expired' }));
        return;
      }
      // Rate Limiting: max 5 Wakeups/min
      const now = Date.now();
      const minuteAgo = now - 60_000;
      if (!pushWakeupRateLimit.has(arego_id)) pushWakeupRateLimit.set(arego_id, []);
      const timestamps = pushWakeupRateLimit.get(arego_id).filter(t => t > minuteAgo);
      if (timestamps.length >= 5) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'rate_limit' }));
        return;
      }
      const dataToVerify = arego_id + target_arego_id + timestamp;
      const valid = await verifyEcdsaSignature(arego_id, signature, dataToVerify);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // Push-Tokens des Ziels laden
      const rows = db.exec(
        `SELECT token, provider FROM push_tokens WHERE arego_id = ?`,
        [target_arego_id]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pushed: 0, reason: 'no_tokens' }));
        timestamps.push(now);
        pushWakeupRateLimit.set(arego_id, timestamps);
        return;
      }
      // Leere Wakeup-Pushes versenden (kein Nachrichteninhalt — P2P-Prinzip)
      let pushed = 0;
      for (const [token, provider] of rows[0].values) {
        try {
          if (provider === 'fcm') {
            await sendFcmWakeup(token);
            pushed++;
          } else if (provider === 'apns') {
            await sendApnsWakeup(token);
            pushed++;
          }
        } catch {
          // Token möglicherweise ungültig — nicht löschen, Cleanup erledigt das
        }
      }
      timestamps.push(now);
      pushWakeupRateLimit.set(arego_id, timestamps);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, pushed }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /prekeys — Pre-Key-Bundle hochladen (ECDSA-signiert) (ARE-341) ─────
  if (req.method === 'POST' && req.url === '/prekeys') {
    try {
      const body = await readBody(req);
      const { arego_id, identity_key, signed_pre_key_id, signed_pre_key,
              signed_pre_key_signature, one_time_pre_keys, signature, timestamp } = JSON.parse(body);
      if (!arego_id || !identity_key || signed_pre_key_id == null || !signed_pre_key ||
          !signed_pre_key_signature || !signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_fields' }));
        return;
      }
      // Timestamp-Validierung (max 5 Minuten alt)
      const tsAge = Math.abs(Date.now() - new Date(timestamp).getTime());
      if (tsAge > 5 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'timestamp_expired' }));
        return;
      }
      // Rate Limiting: max 10 Uploads/Minute
      const now = Date.now();
      const minuteAgo = now - 60_000;
      if (!preKeyRateLimit.has(arego_id)) preKeyRateLimit.set(arego_id, []);
      const timestamps = preKeyRateLimit.get(arego_id).filter(t => t > minuteAgo);
      if (timestamps.length >= 10) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'rate_limit' }));
        return;
      }
      // ECDSA-Signaturverifikation
      const dataToVerify = arego_id + identity_key + timestamp;
      const valid = await verifyEcdsaSignature(arego_id, signature, dataToVerify);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // One-Time-Pre-Keys: max 50
      const otpks = Array.isArray(one_time_pre_keys) ? one_time_pre_keys.slice(0, 50) : [];
      db.run(
        `INSERT OR REPLACE INTO pre_key_bundles (arego_id, identity_key, signed_pre_key_id, signed_pre_key, signed_pre_key_signature, one_time_pre_keys, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [arego_id, identity_key, signed_pre_key_id, signed_pre_key, signed_pre_key_signature, JSON.stringify(otpks), now]
      );
      persistDb();
      timestamps.push(now);
      preKeyRateLimit.set(arego_id, timestamps);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, one_time_pre_key_count: otpks.length }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── POST /prekeys/replenish — One-Time-Pre-Keys nachliefern (ECDSA-signiert) (ARE-341) ──
  if (req.method === 'POST' && req.url === '/prekeys/replenish') {
    try {
      const body = await readBody(req);
      const { arego_id, one_time_pre_keys, signature, timestamp } = JSON.parse(body);
      if (!arego_id || !one_time_pre_keys || !signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_fields' }));
        return;
      }
      const tsAge = Math.abs(Date.now() - new Date(timestamp).getTime());
      if (tsAge > 5 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'timestamp_expired' }));
        return;
      }
      // Rate Limiting
      const now = Date.now();
      const minuteAgo = now - 60_000;
      if (!preKeyRateLimit.has(arego_id)) preKeyRateLimit.set(arego_id, []);
      const timestamps = preKeyRateLimit.get(arego_id).filter(t => t > minuteAgo);
      if (timestamps.length >= 10) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'rate_limit' }));
        return;
      }
      const dataToVerify = arego_id + 'replenish' + timestamp;
      const valid = await verifyEcdsaSignature(arego_id, signature, dataToVerify);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      // Existierendes Bundle laden
      const rows = db.exec(`SELECT one_time_pre_keys FROM pre_key_bundles WHERE arego_id = ?`, [arego_id]);
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no_bundle' }));
        return;
      }
      const existing = JSON.parse(rows[0].values[0][0] || '[]');
      const newKeys = Array.isArray(one_time_pre_keys) ? one_time_pre_keys : [];
      const merged = [...existing, ...newKeys].slice(0, 50);
      db.run(
        `UPDATE pre_key_bundles SET one_time_pre_keys = ?, updated_at = ? WHERE arego_id = ?`,
        [JSON.stringify(merged), now, arego_id]
      );
      persistDb();
      timestamps.push(now);
      preKeyRateLimit.set(arego_id, timestamps);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, one_time_pre_key_count: merged.length }));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── GET /prekeys/:aregoId — Pre-Key-Bundle abrufen (konsumiert einen One-Time-Pre-Key) (ARE-341) ──
  const preKeyGetMatch = req.method === 'GET' && req.url?.match(/^\/prekeys\/([A-Za-z0-9_-]+)$/);
  if (preKeyGetMatch) {
    try {
      const aregoId = preKeyGetMatch[1];
      const rows = db.exec(
        `SELECT identity_key, signed_pre_key_id, signed_pre_key, signed_pre_key_signature, one_time_pre_keys
         FROM pre_key_bundles WHERE arego_id = ?`,
        [aregoId]
      );
      if (!rows.length || !rows[0].values.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no_bundle' }));
        return;
      }
      const [identityKey, signedPreKeyId, signedPreKey, signedPreKeySig, otpksJson] = rows[0].values[0];
      const otpks = JSON.parse(otpksJson || '[]');
      // Einen One-Time-Pre-Key konsumieren (FIFO)
      let consumedPreKey = null;
      if (otpks.length > 0) {
        consumedPreKey = otpks.shift();
        db.run(
          `UPDATE pre_key_bundles SET one_time_pre_keys = ? WHERE arego_id = ?`,
          [JSON.stringify(otpks), aregoId]
        );
        persistDb();
      }
      const bundle = {
        arego_id: aregoId,
        identity_key: identityKey,
        signed_pre_key: { keyId: signedPreKeyId, publicKey: signedPreKey, signature: signedPreKeySig },
        pre_key: consumedPreKey,
        remaining_one_time_pre_keys: otpks.length,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bundle));
    } catch {
      res.writeHead(500); res.end();
    }
    return;
  }

  // ── DELETE /prekeys/:aregoId — Alle Pre-Keys löschen (ECDSA-signiert) (ARE-341) ──
  const preKeyDeleteMatch = req.method === 'DELETE' && req.url?.match(/^\/prekeys\/([A-Za-z0-9_-]+)$/);
  if (preKeyDeleteMatch) {
    try {
      const aregoId = preKeyDeleteMatch[1];
      const body = await readBody(req);
      const { signature, timestamp } = JSON.parse(body);
      if (!signature || !timestamp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_fields' }));
        return;
      }
      const tsAge = Math.abs(Date.now() - new Date(timestamp).getTime());
      if (tsAge > 5 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'timestamp_expired' }));
        return;
      }
      const dataToVerify = aregoId + 'delete' + timestamp;
      const valid = await verifyEcdsaSignature(aregoId, signature, dataToVerify);
      if (!valid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
      db.run(`DELETE FROM pre_key_bundles WHERE arego_id = ?`, [aregoId]);
      persistDb();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(500); res.end();
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
      roomId = String(msg.roomId ?? msg.room ?? '')
        .slice(0, 128)
        .replace(/[^a-zA-Z0-9\-:_]/g, '');
      if (!roomId) return;

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const room = rooms.get(roomId);

      const isInbox = roomId.startsWith('inbox:');
      const isSpaceChat = roomId.startsWith('space-chat:');
      const isSpaceMeta = roomId.startsWith('space-meta:');
      const isSpaceCall = roomId.startsWith('space-call:');

      // ── Space-Call Join (eigene Logik) ─────────────────────────────────────
      if (isSpaceCall) {
        const session = wsSessions.get(ws);
        if (!session) { ws.close(4001, 'Not authenticated'); return; }

        const spaceId = roomId.replace('space-call:', '');
        if (!spaceId) return;

        // Kinderschutz: calls_enabled prüfen
        const authRows = db.exec(
          `SELECT calls_enabled, max_call_participants FROM user_auth WHERE arego_id = ?`,
          [session.arego_id]
        );
        if (authRows.length && authRows[0].values.length) {
          const [callsEnabled, maxParticipants] = authRows[0].values[0];
          if (!callsEnabled) {
            ws.send(JSON.stringify({ type: 'space_call_error', error: 'calls_disabled', message: 'Anrufe sind deaktiviert' }));
            return;
          }
          // Max-Teilnehmer aus Kinderschutz-Settings
          const call = spaceCalls.get(spaceId);
          if (call && call.participants.size >= maxParticipants) {
            ws.send(JSON.stringify({ type: 'space_call_error', error: 'call_full', message: 'Maximale Teilnehmerzahl erreicht' }));
            return;
          }
        }

        // Call-State initialisieren oder beitreten
        if (!spaceCalls.has(spaceId)) {
          spaceCalls.set(spaceId, {
            participants: new Map(), // aregoId → WebSocket
            moderatorId: session.arego_id,
            startTime: Date.now(),
          });
        }
        const call = spaceCalls.get(spaceId);

        // Doppelter Join verhindern
        if (call.participants.has(session.arego_id)) {
          ws.send(JSON.stringify({ type: 'space_call_error', error: 'already_joined', message: 'Bereits im Call' }));
          return;
        }

        // Auch in normales Room-System eintragen (für Relay)
        room.add(ws);
        call.participants.set(session.arego_id, ws);

        // Aktuelle Teilnehmer-Liste erstellen
        const participantList = Array.from(call.participants.keys());

        // Dem neuen Teilnehmer den Call-State senden
        ws.send(JSON.stringify({
          type: 'space_call_joined',
          spaceId,
          participants: participantList,
          moderatorId: call.moderatorId,
          startTime: call.startTime,
          mode: call.participants.size <= 3 ? 'mesh' : 'sfu',
        }));

        // Allen bestehenden Teilnehmern den neuen Peer melden
        const joinMsg = JSON.stringify({
          type: 'space_call_participant_joined',
          aregoId: session.arego_id,
          participantCount: call.participants.size,
          mode: call.participants.size <= 3 ? 'mesh' : 'sfu',
        });
        for (const [id, peer] of call.participants) {
          if (id !== session.arego_id && peer.readyState === 1) peer.send(joinMsg);
        }

        // LiveKit-Token ausgeben wenn SFU-Modus (>=4 Teilnehmer)
        if (call.participants.size >= 4) {
          const nodes = db.exec(`SELECT url FROM livekit_nodes LIMIT 1`);
          if (nodes.length && nodes[0].values.length) {
            const livekitUrl = nodes[0].values[0][0];
            // SFU-Switch an ALLE Teilnehmer senden
            const sfuMsg = JSON.stringify({
              type: 'space_call_sfu_switch',
              spaceId,
              livekitUrl,
              roomName: `space-call-${spaceId}`,
            });
            for (const [, peer] of call.participants) {
              if (peer.readyState === 1) peer.send(sfuMsg);
            }
          }
        }
        return;
      }

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
        // Persistierte child_profile_sync Messages aus SQLite ausliefern
        if (isInbox) {
          const targetId = roomId.replace('inbox:', '');
          const rows = db.exec(`SELECT id, payload FROM pending_child_sync WHERE target_id = ? ORDER BY id ASC`, [targetId]);
          if (rows.length && rows[0].values.length) {
            for (const [id, payload] of rows[0].values) {
              if (ws.readyState === 1) ws.send(payload);
            }
          }
        }
      }
      return;
    }

    // ── Auth Handshake — zentrale Authentifizierung beim Connect ────────────
    if (msg.type === 'auth') {
      const aregoId = String(msg.aregoId ?? '').slice(0, 64);
      if (!aregoId) {
        ws.send(JSON.stringify({ type: 'auth_error', error: 'missing_id', message: 'Arego-ID fehlt' }));
        ws.close(4001, 'Missing aregoId');
        return;
      }

      // Abo + FSK vom Client übernehmen und in DB speichern (UPSERT)
      const validStatuses = ['trial', 'active', 'expired'];
      const aboStatus = validStatuses.includes(msg.abo_status) ? msg.abo_status : 'trial';
      const aboGueltigBis = msg.abo_gueltig_bis ?? null;
      const fskStufe = [6, 12, 16, 18].includes(msg.fsk_stufe) ? msg.fsk_stufe : 6;
      const now = new Date().toISOString();

      db.run(`
        INSERT INTO user_auth (arego_id, abo_status, abo_gueltig_bis, fsk_stufe, letzter_heartbeat)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(arego_id) DO UPDATE SET
          abo_status = excluded.abo_status,
          abo_gueltig_bis = excluded.abo_gueltig_bis,
          fsk_stufe = excluded.fsk_stufe,
          letzter_heartbeat = excluded.letzter_heartbeat
      `, [aregoId, aboStatus, aboGueltigBis, fskStufe, now]);

      // Public Key in user_directory speichern (für Familien-Kontaktaustausch)
      if (msg.publicKeyJwk) {
        db.run(
          `INSERT INTO user_directory (arego_id, display_name, public_key_jwk, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(arego_id) DO UPDATE SET
             public_key_jwk = COALESCE(excluded.public_key_jwk, user_directory.public_key_jwk),
             updated_at = excluded.updated_at`,
          [aregoId, msg.displayName ?? '', JSON.stringify(msg.publicKeyJwk), now]
        );
      }
      persistDb();

      // Abo-Gültigkeit serverseitig prüfen
      let effectiveAbo = aboStatus;
      let effectiveBis = aboGueltigBis;
      const aboAbgelaufen = aboStatus === 'expired' || (aboGueltigBis && new Date(aboGueltigBis) < new Date());

      if (aboAbgelaufen) {
        // Kind-Abo-Übernahme: Verwalter-Abo prüfen bevor expired
        const kindAbo = resolveKindAbo(aregoId);
        if (kindAbo) {
          effectiveAbo = kindAbo.abo_status;
          effectiveBis = kindAbo.abo_gueltig_bis;
        } else {
          db.run(`UPDATE user_auth SET abo_status = 'expired' WHERE arego_id = ?`, [aregoId]);
          persistDb();
          ws.send(JSON.stringify({ type: 'auth_error', error: 'subscription_expired', message: 'Abo abgelaufen' }));
          ws.close(4002, 'Subscription expired');
          return;
        }
      }

      // Session speichern
      const session = { arego_id: aregoId, abo_status: effectiveAbo, fsk_stufe: fskStufe };
      wsSessions.set(ws, session);
      sessionsByAregoId.set(aregoId, session);
      presenceId = aregoId;

      // Hidden-Presence: wenn User seinen Status verbirgt
      const hideOnline = !!msg.hideOnlineStatus;
      if (hideOnline) {
        hiddenPresenceUsers.add(presenceId);
      } else {
        hiddenPresenceUsers.delete(presenceId);
      }

      // Presence: als online markieren (nur wenn nicht versteckt)
      if (!hideOnline) {
        if (!onlineUsers.has(presenceId)) onlineUsers.set(presenceId, new Set());
        onlineUsers.get(presenceId).add(ws);
      }

      // Kontakt-Präsenz abonnieren (nur wenn eigener Status sichtbar — Gegenseitigkeit)
      watchIds = [];
      if (!hideOnline) {
        watchIds = Array.isArray(msg.watchIds)
          ? msg.watchIds.map(id => String(id ?? '').slice(0, 64)).filter(Boolean).slice(0, 200)
          : [];
        for (const id of watchIds) {
          if (!presenceWatchers.has(id)) presenceWatchers.set(id, new Set());
          presenceWatchers.get(id).add(ws);
        }
      }

      // Initiale Statusmeldung: null = versteckt, true/false = sichtbar
      const requestedWatchIds = Array.isArray(msg.watchIds)
        ? msg.watchIds.map(id => String(id ?? '').slice(0, 64)).filter(Boolean).slice(0, 200)
        : [];
      const statuses = {};
      for (const id of requestedWatchIds) {
        if (hiddenPresenceUsers.has(id)) {
          statuses[id] = null; // Status versteckt → Indicator komplett ausblenden
        } else {
          const sockets = onlineUsers.get(id);
          statuses[id] = !!(sockets && sockets.size > 0);
        }
      }

      // Kind-Status aus user_auth ermitteln (verwalter_1/verwalter_2 + nickname_self_edit)
      const authRows = db.exec(`SELECT verwalter_1, verwalter_2, nickname_self_edit FROM user_auth WHERE arego_id = ?`, [aregoId]);
      const v1 = authRows.length ? authRows[0].values[0][0] : null;
      const v2 = authRows.length ? authRows[0].values[0][1] : null;
      const nickSelfEdit = authRows.length ? !!authRows[0].values[0][2] : false;
      const verwalter = [v1, v2].filter(Boolean);
      const istKind = verwalter.length > 0;

      // Verknüpfte Kinder dieses Nutzers (als Elternteil) — inkl. Namen
      const linkedRows = db.exec(
        `SELECT ua.arego_id, ua.fsk_stufe, ua.nickname_self_edit,
                COALESCE(ud.first_name, '') AS first_name,
                COALESCE(ud.last_name, '') AS last_name,
                COALESCE(ud.nickname, '') AS nickname,
                COALESCE(ud.display_name, '') AS display_name
         FROM user_auth ua
         LEFT JOIN user_directory ud ON ud.arego_id = ua.arego_id
         WHERE ua.verwalter_1 = ? OR ua.verwalter_2 = ?`,
        [aregoId, aregoId]
      );
      const linkedChildren = linkedRows.length ? linkedRows[0].values.map(r => ({
        child_id: r[0], fsk_stufe: r[1], nickname_self_edit: !!r[2],
        firstName: r[3], lastName: r[4], nickname: r[5], displayName: r[6],
      })) : [];

      // Familien-Kontakte sammeln (Verwalter + Kinder) — mit Public Keys für automatische Kontakt-Verknüpfung
      const familyIds = [...verwalter, ...linkedChildren.map(c => c.child_id)].filter(Boolean);
      let familyContacts = [];
      if (familyIds.length > 0) {
        const placeholders = familyIds.map(() => '?').join(',');
        const famRows = db.exec(
          `SELECT arego_id, display_name, first_name, last_name, public_key_jwk
           FROM user_directory WHERE arego_id IN (${placeholders})`,
          familyIds
        );
        if (famRows.length && famRows[0].values.length) {
          familyContacts = famRows[0].values
            .filter(r => r[4]) // nur mit Public Key
            .map(r => ({
              aregoId: r[0],
              displayName: [r[2], r[3]].filter(Boolean).join(' ') || r[1] || r[0],
              publicKeyJwk: JSON.parse(r[4]),
            }));
        }
      }

      // Session erweitern
      session.ist_kind = istKind;
      session.verwalter = verwalter;

      // Auth bestätigen mit allen Kontodaten
      ws.send(JSON.stringify({
        type: 'auth_ok',
        arego_id: aregoId,
        abo_status: effectiveAbo,
        abo_gueltig_bis: effectiveBis,
        fsk_stufe: fskStufe,
        ist_kind: istKind,
        verwalter,
        nickname_self_edit: nickSelfEdit,
        linked_children: linkedChildren,
        family_contacts: familyContacts,
        statuses,
      }));

      // Allen die MICH beobachten mitteilen dass ich online bin (nur wenn nicht versteckt)
      if (!hideOnline) {
        const myWatchers = presenceWatchers.get(presenceId);
        if (myWatchers) {
          const update = JSON.stringify({ type: 'presence_update', statuses: { [presenceId]: true } });
          for (const w of myWatchers) {
            if (w !== ws && w.readyState === 1) w.send(update);
          }
        }
      }
      return;
    }

    // ── Live Presence Toggle — Status im laufenden Betrieb ändern ──────────
    if (msg.type === 'update_presence') {
      if (!presenceId) return;
      const hide = !!msg.hideOnlineStatus;

      if (hide) {
        // Verstecken: aus onlineUsers entfernen, Watcher-Abos auflösen, als hidden markieren
        hiddenPresenceUsers.add(presenceId);
        const sockets = onlineUsers.get(presenceId);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) onlineUsers.delete(presenceId);
        }
        // Watchers benachrichtigen: null = versteckt
        const myWatchers = presenceWatchers.get(presenceId);
        if (myWatchers) {
          const update = JSON.stringify({ type: 'presence_update', statuses: { [presenceId]: null } });
          for (const w of myWatchers) {
            if (w.readyState === 1) w.send(update);
          }
        }
        // Watcher-Abos dieses WS entfernen (Gegenseitigkeit)
        for (const id of watchIds) {
          const watchers = presenceWatchers.get(id);
          if (watchers) {
            watchers.delete(ws);
            if (watchers.size === 0) presenceWatchers.delete(id);
          }
        }
        watchIds = [];
      } else {
        // Sichtbar machen: wieder online markieren + Watchers abonnieren
        hiddenPresenceUsers.delete(presenceId);
        if (!onlineUsers.has(presenceId)) onlineUsers.set(presenceId, new Set());
        onlineUsers.get(presenceId).add(ws);
        // watchIds aus msg wiederherstellen
        watchIds = Array.isArray(msg.watchIds)
          ? msg.watchIds.map(id => String(id ?? '').slice(0, 64)).filter(Boolean).slice(0, 200)
          : [];
        for (const id of watchIds) {
          if (!presenceWatchers.has(id)) presenceWatchers.set(id, new Set());
          presenceWatchers.get(id).add(ws);
        }
        // Watchers benachrichtigen: wieder online
        const myWatchers = presenceWatchers.get(presenceId);
        if (myWatchers) {
          const update = JSON.stringify({ type: 'presence_update', statuses: { [presenceId]: true } });
          for (const w of myWatchers) {
            if (w !== ws && w.readyState === 1) w.send(update);
          }
        }
        // Aktuelle Statuses an Client senden
        const statuses = {};
        for (const id of watchIds) {
          if (hiddenPresenceUsers.has(id)) {
            statuses[id] = null;
          } else {
            const s = onlineUsers.get(id);
            statuses[id] = !!(s && s.size > 0);
          }
        }
        ws.send(JSON.stringify({ type: 'presence_update', statuses }));
      }
      return;
    }

    // ── Kind-Aktion: Kind will etwas tun → Server leitet an Verwalter ──────
    if (msg.type === 'child_action_request') {
      const session = wsSessions.get(ws);
      if (!session?.ist_kind || !session.verwalter?.length) return;

      const requestId = `cr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const notify = JSON.stringify({
        type: 'child_action_request',
        request_id: requestId,
        child_id: session.arego_id,
        action: String(msg.action ?? '').slice(0, 50),
        details: String(msg.details ?? '').slice(0, 200),
      });

      // An alle Verwalter senden (online oder inbox-puffer)
      for (const parentId of session.verwalter) {
        const parentSockets = onlineUsers.get(parentId);
        if (parentSockets?.size) {
          for (const pw of parentSockets) {
            if (pw.readyState === 1) pw.send(notify);
          }
        } else {
          // Verwalter offline → in Inbox zwischenspeichern
          storePending(`inbox:${parentId}`, Buffer.from(notify));
        }
      }

      // Kind bekommt Bestätigung dass Anfrage gesendet wurde
      ws.send(JSON.stringify({ type: 'child_action_pending', request_id: requestId }));
      return;
    }

    // ── Verwalter antwortet auf Kind-Aktion ──────────────────────────────────
    if (msg.type === 'child_action_response') {
      const childId = String(msg.child_id ?? '');
      const approved = msg.approved === true;
      if (!childId) return;

      const notify = JSON.stringify({
        type: 'child_action_response',
        request_id: msg.request_id ?? '',
        approved,
        action: msg.action ?? '',
      });

      const childSockets = onlineUsers.get(childId);
      if (childSockets?.size) {
        for (const cw of childSockets) {
          if (cw.readyState === 1) cw.send(notify);
        }
      } else {
        storePending(`inbox:${childId}`, Buffer.from(notify));
      }
      return;
    }

    // ── Verwalter sendet Kind-Profil (P2P-Sync) ───────────────────────────────
    if (msg.type === 'child_profile_sync') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const childId = String(msg.child_id ?? '');
      if (!childId) return;

      // Prüfen ob Sender tatsächlich Verwalter ist
      const rows = db.exec(`SELECT verwalter_1, verwalter_2 FROM user_auth WHERE arego_id = ?`, [childId]);
      if (!rows.length || !rows[0].values.length) return;
      const [v1, v2] = rows[0].values[0];
      if (v1 !== session.arego_id && v2 !== session.arego_id) return;

      // Profildaten weiterleiten an Kind + anderen Verwalter
      const payload = JSON.stringify({
        type: 'child_profile_sync',
        child_id: childId,
        from: session.arego_id,
        profile: msg.profile ?? {},
      });

      const targets = [childId, v1, v2].filter(id => id && id !== session.arego_id);
      for (const targetId of targets) {
        // Persist to SQLite for reliable delivery
        db.run(
          `INSERT INTO pending_child_sync (target_id, child_id, from_id, payload, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
          [targetId, childId, session.arego_id, payload]
        );
        // Try immediate delivery
        const sockets = onlineUsers.get(targetId);
        if (sockets) {
          for (const s of sockets) {
            if (s.readyState === 1) s.send(payload);
          }
        }
      }
      persistDb();
      return;
    }

    // ── ACK für child_profile_sync — erst nach ACK aus SQLite löschen ────────
    if (msg.type === 'child_profile_sync_ack') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const childId = String(msg.child_id ?? '');
      if (!childId) return;
      db.run(`DELETE FROM pending_child_sync WHERE target_id = ? AND child_id = ?`, [session.arego_id, childId]);
      persistDb();
      return;
    }

    // ── Kind sendet erlaubte Profiländerungen (Self-Edit) ────────────────────
    if (msg.type === 'child_profile_self_edit') {
      const session = wsSessions.get(ws);
      if (!session?.ist_kind || !session.verwalter?.length) return;

      // FSK prüfen für Berechtigungen
      const fskRows = db.exec(`SELECT fsk_stufe FROM user_auth WHERE arego_id = ?`, [session.arego_id]);
      const fskLevel = fskRows.length && fskRows[0].values.length ? fskRows[0].values[0][0] : 6;

      // Nur erlaubte Felder durchlassen
      const allowed = { nickname: msg.profile?.nickname };
      if (fskLevel >= 16) {
        allowed.socialLinks = msg.profile?.socialLinks;
        allowed.contactEntries = msg.profile?.contactEntries;
      }

      const payload = JSON.stringify({
        type: 'child_profile_self_edit',
        child_id: session.arego_id,
        profile: allowed,
        fsk_stufe: fskLevel,
      });

      // An alle Verwalter senden
      for (const parentId of session.verwalter) {
        const sockets = onlineUsers.get(parentId);
        let delivered = false;
        if (sockets) {
          for (const s of sockets) { if (s.readyState === 1) { s.send(payload); delivered = true; } }
        }
        if (!delivered) storePending(`inbox:${parentId}`, Buffer.from(payload));
      }
      return;
    }

    // ── Space-Call: SDP-Relay (gezielt an einen Teilnehmer) ─────────────────
    if (msg.type === 'space_call_sdp') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const spaceId = String(msg.spaceId ?? '');
      const targetId = String(msg.targetId ?? '');
      const call = spaceCalls.get(spaceId);
      if (!call || !call.participants.has(session.arego_id)) return;
      const targetWs = call.participants.get(targetId);
      if (targetWs?.readyState === 1) {
        targetWs.send(JSON.stringify({
          type: 'space_call_sdp',
          fromId: session.arego_id,
          sdp: msg.sdp,
          sdpType: msg.sdpType, // 'offer' | 'answer'
        }));
      }
      return;
    }

    // ── Space-Call: ICE Candidate Relay ───────────────────────────────────────
    if (msg.type === 'space_call_ice') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const spaceId = String(msg.spaceId ?? '');
      const targetId = String(msg.targetId ?? '');
      const call = spaceCalls.get(spaceId);
      if (!call || !call.participants.has(session.arego_id)) return;
      const targetWs = call.participants.get(targetId);
      if (targetWs?.readyState === 1) {
        targetWs.send(JSON.stringify({
          type: 'space_call_ice',
          fromId: session.arego_id,
          candidate: msg.candidate,
        }));
      }
      return;
    }

    // ── Space-Call: Leave ─────────────────────────────────────────────────────
    if (msg.type === 'space_call_leave') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const spaceId = String(msg.spaceId ?? '');
      const call = spaceCalls.get(spaceId);
      if (!call || !call.participants.has(session.arego_id)) return;

      call.participants.delete(session.arego_id);

      // Moderator-Übergabe wenn Moderator verlässt
      if (call.moderatorId === session.arego_id && call.participants.size > 0) {
        call.moderatorId = call.participants.keys().next().value;
      }

      if (call.participants.size === 0) {
        spaceCalls.delete(spaceId);
      } else {
        const leaveMsg = JSON.stringify({
          type: 'space_call_participant_left',
          aregoId: session.arego_id,
          participantCount: call.participants.size,
          moderatorId: call.moderatorId,
          mode: call.participants.size <= 3 ? 'mesh' : 'sfu',
        });
        for (const [, peer] of call.participants) {
          if (peer.readyState === 1) peer.send(leaveMsg);
        }
      }

      // Auch aus Room-System entfernen
      if (roomId?.startsWith('space-call:')) {
        const room = rooms.get(roomId);
        if (room) {
          room.delete(ws);
          if (room.size === 0) rooms.delete(roomId);
        }
        roomId = null;
      }
      return;
    }

    // ── Space-Call: Moderator mute-remote ────────────────────────────────────
    if (msg.type === 'space_call_mute_remote') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const spaceId = String(msg.spaceId ?? '');
      const targetId = String(msg.targetId ?? '');
      const call = spaceCalls.get(spaceId);
      if (!call || call.moderatorId !== session.arego_id) return;
      const targetWs = call.participants.get(targetId);
      if (targetWs?.readyState === 1) {
        targetWs.send(JSON.stringify({
          type: 'space_call_muted_by_moderator',
          moderatorId: session.arego_id,
          track: msg.track ?? 'audio', // 'audio' | 'video'
        }));
      }
      return;
    }

    // ── Space-Call: Moderator kick ───────────────────────────────────────────
    // ── Space Absence Update (Krankmeldung → Push an Moderator) ────────────
    if (msg.type === 'space_absence_update') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const spaceId = String(msg.spaceId ?? '');
      const targetAregoId = String(msg.targetAregoId ?? '');
      if (!spaceId || !targetAregoId) return;

      const payload = JSON.stringify({
        type: 'space_absence_update',
        spaceId,
        absence: msg.absence ?? {},
        fromAregoId: session.arego_id,
      });

      // Direkt an Ziel senden (Moderator) oder offline puffern
      const targetSockets = onlineUsers.get(targetAregoId);
      if (targetSockets && targetSockets.size > 0) {
        for (const s of targetSockets) {
          if (s.readyState === 1) s.send(payload);
        }
      } else {
        const inboxRoom = `inbox:${targetAregoId}`;
        storePending(inboxRoom, Buffer.from(payload));
      }
      return;
    }

    // ── Space Slot Booked (Bestätigung an Moderator + Buchender) ─────────
    if (msg.type === 'space_slot_booked') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const spaceId = String(msg.spaceId ?? '');
      const targetAregoIds = Array.isArray(msg.targetAregoIds) ? msg.targetAregoIds.map(String) : [];
      if (!spaceId || targetAregoIds.length === 0) return;

      const payload = JSON.stringify({
        type: 'space_slot_booked',
        spaceId,
        templateId: msg.templateId ?? '',
        slotId: msg.slotId ?? '',
        bookedBy: session.arego_id,
      });

      for (const targetId of targetAregoIds) {
        if (targetId === session.arego_id) continue; // Nicht an sich selbst
        const targetSockets = onlineUsers.get(targetId);
        if (targetSockets && targetSockets.size > 0) {
          for (const s of targetSockets) {
            if (s.readyState === 1) s.send(payload);
          }
        } else {
          storePending(`inbox:${targetId}`, Buffer.from(payload));
        }
      }
      return;
    }

    // ── Space Booking Request (Anfrage → Push an Moderator) ──────────────
    if (msg.type === 'space_booking_request') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const spaceId = String(msg.spaceId ?? '');
      const moderatorAregoId = String(msg.moderatorAregoId ?? '');
      if (!spaceId || !moderatorAregoId) return;

      const payload = JSON.stringify({
        type: 'space_booking_request',
        spaceId,
        templateId: msg.templateId ?? '',
        requestId: msg.requestId ?? '',
        requestedBy: session.arego_id,
        preferredTimes: msg.preferredTimes ?? [],
        message: String(msg.message ?? '').slice(0, 500),
      });

      const targetSockets = onlineUsers.get(moderatorAregoId);
      if (targetSockets && targetSockets.size > 0) {
        for (const s of targetSockets) {
          if (s.readyState === 1) s.send(payload);
        }
      } else {
        storePending(`inbox:${moderatorAregoId}`, Buffer.from(payload));
      }
      return;
    }

    // ── Space Slot Reminder (konfigurierbar 10/30/60 min vor Termin) ─────
    if (msg.type === 'space_slot_reminder') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const targetAregoId = String(msg.targetAregoId ?? '');
      if (!targetAregoId) return;

      const payload = JSON.stringify({
        type: 'space_slot_reminder',
        spaceId: msg.spaceId ?? '',
        templateId: msg.templateId ?? '',
        slotId: msg.slotId ?? '',
        title: String(msg.title ?? '').slice(0, 200),
        startTime: msg.startTime ?? '',
        reminderMinutes: msg.reminderMinutes ?? 10,
      });

      const targetSockets = onlineUsers.get(targetAregoId);
      if (targetSockets && targetSockets.size > 0) {
        for (const s of targetSockets) {
          if (s.readyState === 1) s.send(payload);
        }
      } else {
        storePending(`inbox:${targetAregoId}`, Buffer.from(payload));
      }
      return;
    }

    if (msg.type === 'space_call_kick') {
      const session = wsSessions.get(ws);
      if (!session) return;
      const spaceId = String(msg.spaceId ?? '');
      const targetId = String(msg.targetId ?? '');
      const call = spaceCalls.get(spaceId);
      if (!call || call.moderatorId !== session.arego_id) return;
      const targetWs = call.participants.get(targetId);

      // Gekickten Teilnehmer informieren und entfernen
      if (targetWs?.readyState === 1) {
        targetWs.send(JSON.stringify({ type: 'space_call_kicked', moderatorId: session.arego_id }));
      }
      call.participants.delete(targetId);

      // Allen verbleibenden Teilnehmern melden
      const kickMsg = JSON.stringify({
        type: 'space_call_participant_left',
        aregoId: targetId,
        participantCount: call.participants.size,
        moderatorId: call.moderatorId,
        mode: call.participants.size <= 3 ? 'mesh' : 'sfu',
        reason: 'kicked',
      });
      for (const [, peer] of call.participants) {
        if (peer.readyState === 1) peer.send(kickMsg);
      }

      if (call.participants.size === 0) {
        spaceCalls.delete(spaceId);
      }

      // Gekickten aus Room-System entfernen
      const callRoomId = `space-call:${spaceId}`;
      const callRoom = rooms.get(callRoomId);
      if (callRoom && targetWs) {
        callRoom.delete(targetWs);
        if (callRoom.size === 0) rooms.delete(callRoomId);
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

    // ── Space-Call Cleanup ──────────────────────────────────────────────────
    if (roomId?.startsWith('space-call:')) {
      const spaceId = roomId.replace('space-call:', '');
      const call = spaceCalls.get(spaceId);
      if (call) {
        const session = wsSessions.get(ws);
        const leavingId = session?.arego_id;
        if (leavingId && call.participants.has(leavingId)) {
          call.participants.delete(leavingId);
          if (call.moderatorId === leavingId && call.participants.size > 0) {
            call.moderatorId = call.participants.keys().next().value;
          }
          if (call.participants.size === 0) {
            spaceCalls.delete(spaceId);
          } else {
            const leaveMsg = JSON.stringify({
              type: 'space_call_participant_left',
              aregoId: leavingId,
              participantCount: call.participants.size,
              moderatorId: call.moderatorId,
              mode: call.participants.size <= 3 ? 'mesh' : 'sfu',
              reason: 'disconnected',
            });
            for (const [, peer] of call.participants) {
              if (peer.readyState === 1) peer.send(leaveMsg);
            }
          }
        }
      }
    }

    // ── Presence Cleanup ─────────────────────────────────────────────────────
    if (presenceId) {
      const wasHidden = hiddenPresenceUsers.has(presenceId);
      const sockets = onlineUsers.get(presenceId);
      if (sockets) {
        sockets.delete(ws);
        // Nur offline melden wenn KEIN anderer Tab/Gerät mehr verbunden ist
        if (sockets.size === 0) {
          onlineUsers.delete(presenceId);
          if (!wasHidden) {
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
      // Hidden-Set aufräumen wenn kein Socket mehr verbunden
      if (wasHidden && (!sockets || sockets.size === 0)) {
        hiddenPresenceUsers.delete(presenceId);
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

    // Session aufräumen
    const session = wsSessions.get(ws);
    if (session) {
      // Nur aus sessionsByAregoId entfernen wenn kein anderer Socket mehr existiert
      const otherSockets = onlineUsers.get(session.arego_id);
      if (!otherSockets || otherSockets.size === 0) {
        sessionsByAregoId.delete(session.arego_id);
      }
      wsSessions.delete(ws);
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
