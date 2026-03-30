/**
 * Arego Chat — Signaling Server v4
 *
 * HTTP:
 *  POST /code          → Kurzcode registrieren (in-memory, TTL 1h)
 *  GET  /code/:c       → Kurzcode einlösen (single-use, sofort gelöscht)
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
 * Datenschutz: kein Logging, kein Disk-Speicher, Server liest Nachrichteninhalte nicht.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3001;
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

// ── HTTP Server ──────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
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
  const match = req.method === 'GET' && req.url?.match(/^\/code\/([A-Z2-9]{6})$/i);
  if (match) {
    const code = match[1].toUpperCase();
    const entry = codes.get(code);
    if (!entry || entry.expires < Date.now()) { res.writeHead(404); res.end(); return; }
    codes.delete(code);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ payload: entry.payload }));
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
      const limit   = isInbox ? 50 : 2;
      if (room.size >= limit) { ws.close(1008, 'Room full'); return; }

      room.add(ws);
      ws.send(JSON.stringify({ type: 'joined', peers: room.size }));
      for (const peer of room) {
        if (peer !== ws && peer.readyState === 1)
          peer.send(JSON.stringify({ type: 'peer_joined' }));
      }

      // Inbox: gepufferte Nachrichten sofort ausliefern
      if (isInbox) {
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

    if (delivered === 0 && roomId.startsWith('inbox:')) {
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

server.listen(PORT, () => {
  console.log(`[Arego Signaling v4] Port ${PORT} — Presence aktiv, kein Logging, kein Speichern`);
});
