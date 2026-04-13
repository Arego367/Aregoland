/**
 * P2PManager — Imperativer WebRTC-Verbindungsmanager
 *
 * Verwaltet MEHRERE gleichzeitige P2P-Verbindungen (eine pro Kontakt).
 * Lebt in App.tsx (als useRef) → bleibt aktiv wenn ChatScreen unmountet.
 *
 * Ablauf pro Verbindung:
 *  1. WebSocket → Signaling Server → Room beitreten → warten
 *  2. peer_joined → neue ECDH-Keys → RTCPeerConnection → Offer/Answer
 *  3. DataChannel offen → E2E verschlüsselte Nachrichten
 *  4. peer_left → PC abreißen, WS offen lassen, auf nächsten Peer warten
 */

import {
  generateEphemeralKeyPair,
  exportECDHPublicKey,
  importECDHPublicKey,
  deriveSessionKey,
  encryptMessage,
  decryptMessage,
} from '@/app/lib/p2p-crypto';

export type P2PStatus =
  | 'connecting'
  | 'waiting'
  | 'handshake'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface P2PIdentityInfo {
  aregoId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
}

export interface P2PIncomingMessage {
  text: string;
  timestamp: string;
  /** Nur bei Datei-Nachrichten */
  type?: 'text' | 'image' | 'file';
  fileData?: string;
  fileName?: string;
  fileMime?: string;
  /** Die Nachrichten-ID des Senders — für Lesebestätigungen */
  senderMsgId?: string;
}

// ── TURN Credential-Generierung (HMAC-SHA1, time-limited) ────────────────────

const TURN_SECRET = (import.meta as any).env?.VITE_TURN_SECRET as string | undefined;
const TURN_TTL = 60 * 60; // 1h gültig (DSGVO Auflage 3)

async function generateTurnCredentials(): Promise<{ username: string; credential: string }> {
  const timestamp = Math.floor(Date.now() / 1000) + TURN_TTL;
  // coturn erwartet "timestamp:beliebiger-string" — Nonce statt fester ID (DSGVO: nicht rückverfolgbar)
  const nonce = crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  const username = `${timestamp}:${nonce}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(TURN_SECRET!), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
  const credential = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return { username, credential };
}

export async function buildIceServers(): Promise<RTCIceServer[]> {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (TURN_SECRET) {
    const { username, credential } = await generateTurnCredentials();
    servers.push(
      { urls: 'turn:46.225.115.51:3478', username, credential },
      { urls: 'turn:46.225.115.51:3478?transport=tcp', username, credential },
      { urls: 'turns:46.225.115.51:5349', username, credential },
    );
  }
  return servers;
}

// ── Konfiguration ─────────────────────────────────────────────────────────────

const SIGNALING_URL =
  (import.meta as any).env?.VITE_SIGNALING_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-signal`;

const RECONNECT_DELAY = 5_000;

// ── Interner Verbindungstyp ──────────────────────────────────────────────────

interface Conn {
  roomId: string;
  ws: WebSocket | null;
  pc: RTCPeerConnection | null;
  channel: RTCDataChannel | null;
  sessionKey: CryptoKey | null;
  status: P2PStatus;
  error: string | null;
  identityPayload?: string;
  destroyed: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

// ── Manager ──────────────────────────────────────────────────────────────────

/** Anruf-Signaling über den DataChannel */
export interface CallSignal {
  _t: 'call';
  action: 'offer' | 'answer' | 'ice' | 'hangup';
  callType: 'audio' | 'video';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

type MessageCb = (roomId: string, msg: P2PIncomingMessage) => void;
type StatusCb  = (roomId: string, status: P2PStatus, error: string | null) => void;
type ContactCb = (info: P2PIdentityInfo) => void;
type CallSignalCb = (roomId: string, signal: CallSignal) => void;
type ContactRemovedCb = (roomId: string, aregoId: string) => void;
type ReadReceiptCb = (roomId: string, msgIds: string[]) => void;

// ── Calendar Invitation Messages ──────────────────────────────────────────────

export interface CalendarInviteMessage {
  _t: 'calendar_invite';
  eventId: string;
  title: string;
  date: string;         // YYYY-MM-DD
  startTime: string;    // HH:mm
  duration: string;
  organizerAregoId: string;
  organizerName: string;
  note?: string;
}

export interface CalendarRsvpMessage {
  _t: 'calendar_rsvp';
  eventId: string;
  responderAregoId: string;
  responderName: string;
  status: 'accepted' | 'declined' | 'maybe';
}

export class P2PManager {
  private conns = new Map<string, Conn>();
  private fileBuffers: Map<string, { fileName: string; fileMime: string; totalChunks: number; chunks: (string | null)[]; received: number; roomId: string }> | null = null;
  private messageCb: MessageCb | null = null;
  private statusCb: StatusCb | null = null;
  private contactCb: ContactCb | null = null;
  private callSignalCb: CallSignalCb | null = null;
  private contactRemovedCb: ContactRemovedCb | null = null;
  private readReceiptCb: ReadReceiptCb | null = null;
  private calendarInviteCb: ((roomId: string, invite: CalendarInviteMessage) => void) | null = null;
  private calendarRsvpCb: ((roomId: string, rsvp: CalendarRsvpMessage) => void) | null = null;
  private globalIdentityPayload: string | undefined;

  // ── Callbacks registrieren ─────────────────────────────────────────────────

  onMessage(cb: MessageCb) { this.messageCb = cb; }
  onStatusChange(cb: StatusCb) { this.statusCb = cb; }
  onContactDiscovered(cb: ContactCb) { this.contactCb = cb; }
  onCallSignal(cb: CallSignalCb) { this.callSignalCb = cb; }
  onContactRemoved(cb: ContactRemovedCb) { this.contactRemovedCb = cb; }
  onReadReceipt(cb: ReadReceiptCb) { this.readReceiptCb = cb; }
  onCalendarInvite(cb: (roomId: string, invite: CalendarInviteMessage) => void) { this.calendarInviteCb = cb; }
  onCalendarRsvp(cb: (roomId: string, rsvp: CalendarRsvpMessage) => void) { this.calendarRsvpCb = cb; }

  setIdentityPayload(payload: string | undefined) {
    this.globalIdentityPayload = payload;
    for (const conn of this.conns.values()) conn.identityPayload = payload;
  }

  // ── Öffentliche API ────────────────────────────────────────────────────────

  getStatus(roomId: string): P2PStatus {
    return this.conns.get(roomId)?.status ?? 'disconnected';
  }

  getError(roomId: string): string | null {
    return this.conns.get(roomId)?.error ?? null;
  }

  async send(roomId: string, text: string, msgId?: string): Promise<boolean> {
    const c = this.conns.get(roomId);
    if (!c?.channel || c.channel.readyState !== 'open' || !c.sessionKey) return false;
    try {
      // Sende msgId mit, damit der Empfänger Lesebestätigungen referenzieren kann
      const payload = msgId ? JSON.stringify({ _t: 'msg', id: msgId, text }) : text;
      const ct = await encryptMessage(c.sessionKey, payload);
      c.channel.send(JSON.stringify({ ct }));
      return true;
    } catch {
      return false;
    }
  }

  /** Sendet eine Datei in Chunks über den DataChannel (max 14KB pro Chunk) */
  async sendFile(roomId: string, fileData: string, fileName: string, fileMime: string, msgId: string): Promise<boolean> {
    const c = this.conns.get(roomId);
    if (!c?.channel || c.channel.readyState !== 'open' || !c.sessionKey) return false;
    try {
      const CHUNK_SIZE = 14_000; // 14KB Base64 pro Chunk → ~19KB verschlüsselt
      const totalChunks = Math.ceil(fileData.length / CHUNK_SIZE);
      const chunkId = msgId;

      // 1. Metadaten senden
      const meta = JSON.stringify({ _t: 'file_start', chunkId, fileName, fileMime, totalChunks });
      const metaCt = await encryptMessage(c.sessionKey, meta);
      c.channel.send(JSON.stringify({ t: 'file', ct: metaCt }));

      // 2. Chunks senden
      for (let i = 0; i < totalChunks; i++) {
        const data = fileData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunk = JSON.stringify({ _t: 'file_chunk', chunkId, idx: i, data });
        const chunkCt = await encryptMessage(c.sessionKey, chunk);
        c.channel.send(JSON.stringify({ t: 'file', ct: chunkCt }));
        // Kurz warten damit DataChannel-Buffer nicht überläuft
        if (c.channel.bufferedAmount > 64_000) {
          await new Promise<void>((resolve) => {
            const check = () => {
              if (!c.channel || c.channel.bufferedAmount < 16_000) resolve();
              else setTimeout(check, 10);
            };
            check();
          });
        }
      }
      return true;
    } catch (err) {
      console.error('[P2P] sendFile FEHLER:', err);
      return false;
    }
  }

  /** Sendet ein Kontakt-Entfernen-Signal verschlüsselt über den DataChannel */
  async sendContactRemove(roomId: string, myAregoId: string): Promise<boolean> {
    const c = this.conns.get(roomId);
    if (!c?.channel || c.channel.readyState !== 'open' || !c.sessionKey) return false;
    try {
      const ct = await encryptMessage(c.sessionKey, JSON.stringify({ aregoId: myAregoId }));
      c.channel.send(JSON.stringify({ t: 'contact_remove', ct }));
      return true;
    } catch {
      return false;
    }
  }

  /** Sendet eine Lesebestätigung für Nachrichten-IDs verschlüsselt über den DataChannel */
  async sendReadReceipt(roomId: string, msgIds: string[]): Promise<boolean> {
    const c = this.conns.get(roomId);
    if (!c?.channel || c.channel.readyState !== 'open' || !c.sessionKey || msgIds.length === 0) return false;
    try {
      const ct = await encryptMessage(c.sessionKey, JSON.stringify(msgIds));
      c.channel.send(JSON.stringify({ t: 'msg_read', ct }));
      return true;
    } catch {
      return false;
    }
  }

  /** Sendet eine Kalender-Einladung verschlüsselt über den DataChannel */
  async sendCalendarInvite(roomId: string, invite: CalendarInviteMessage): Promise<boolean> {
    const c = this.conns.get(roomId);
    if (!c?.channel || c.channel.readyState !== 'open' || !c.sessionKey) return false;
    try {
      const ct = await encryptMessage(c.sessionKey, JSON.stringify(invite));
      c.channel.send(JSON.stringify({ t: 'calendar_invite', ct }));
      return true;
    } catch { return false; }
  }

  /** Sendet eine RSVP-Antwort auf eine Kalender-Einladung */
  async sendCalendarRsvp(roomId: string, rsvp: CalendarRsvpMessage): Promise<boolean> {
    const c = this.conns.get(roomId);
    if (!c?.channel || c.channel.readyState !== 'open' || !c.sessionKey) return false;
    try {
      const ct = await encryptMessage(c.sessionKey, JSON.stringify(rsvp));
      c.channel.send(JSON.stringify({ t: 'calendar_rsvp', ct }));
      return true;
    } catch { return false; }
  }

  /** Sendet ein Anruf-Signal verschlüsselt über den DataChannel */
  async sendCallSignal(roomId: string, signal: CallSignal): Promise<boolean> {
    const c = this.conns.get(roomId);
    if (!c?.channel || c.channel.readyState !== 'open' || !c.sessionKey) {
      console.warn('[P2P] sendCallSignal BLOCKED — channel:', c?.channel?.readyState, 'sessionKey:', !!c?.sessionKey);
      return false;
    }
    try {
      console.log('[P2P] sendCallSignal:', signal.action, 'callType:', signal.callType, 'sdp:', signal.sdp ? `${signal.sdp.length} chars` : 'none');
      const ct = await encryptMessage(c.sessionKey, JSON.stringify(signal));
      c.channel.send(JSON.stringify({ t: 'call', ct }));
      return true;
    } catch (err) {
      console.error('[P2P] sendCallSignal FEHLER:', err);
      return false;
    }
  }

  /** Verbindung für einen Room starten (idempotent) */
  connect(roomId: string) {
    if (this.conns.has(roomId)) return;
    const conn: Conn = {
      roomId,
      ws: null,
      pc: null,
      channel: null,
      sessionKey: null,
      status: 'connecting',
      error: null,
      identityPayload: this.globalIdentityPayload,
      destroyed: false,
    };
    this.conns.set(roomId, conn);
    this.boot(conn);
  }

  /** Verbindung für einen Room sauber trennen */
  disconnect(roomId: string) {
    const c = this.conns.get(roomId);
    if (!c) return;
    c.destroyed = true;
    clearTimeout(c.reconnectTimer);
    c.channel?.close();
    c.pc?.close();
    c.ws?.close();
    this.conns.delete(roomId);
  }

  /** Alle Verbindungen trennen */
  disconnectAll() {
    for (const id of [...this.conns.keys()]) this.disconnect(id);
  }

  isConnected(roomId: string): boolean {
    return this.conns.get(roomId)?.status === 'connected';
  }

  /** Gibt alle aktiven Room-IDs zurück */
  getRoomIds(): string[] {
    return [...this.conns.keys()];
  }

  // ── Privat: Verbindung aufbauen ────────────────────────────────────────────

  private setStatus(c: Conn, status: P2PStatus, error: string | null = null) {
    if (c.destroyed) return;
    c.status = status;
    c.error = error;
    this.statusCb?.(c.roomId, status, error);
  }

  private async boot(c: Conn) {
    if (c.destroyed) return;

    try {
      const ws = new WebSocket(SIGNALING_URL);
      c.ws = ws;

      ws.onopen = () => {
        if (c.destroyed) { ws.close(); return; }
        ws.send(JSON.stringify({ type: 'join', roomId: c.roomId }));
        this.setStatus(c, 'waiting');
      };

      ws.onmessage = async ({ data }) => {
        if (c.destroyed) return;
        let msg: any;
        try { msg = JSON.parse(data); } catch { return; }

        if (msg.type === 'peer_joined') {
          await this.startWebRTC(c, true);
        }

        if (msg.type === 'offer') {
          await this.startWebRTC(c, false, msg);
        }

        if (msg.type === 'answer' && c.pc) {
          try {
            const peerPub = await importECDHPublicKey(msg.ek);
            c.sessionKey = await deriveSessionKey(
              (c as any)._ephKP.privateKey,
              peerPub,
            );
            await c.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
          } catch { /* ignorieren */ }
        }

        if (msg.type === 'ice' && c.pc) {
          try { await c.pc.addIceCandidate(msg.candidate); } catch { /* ok */ }
        }

        if (msg.type === 'peer_left') {
          this.teardownPeer(c);
          this.setStatus(c, 'waiting');
        }
      };

      ws.onerror = () => {
        if (!c.destroyed) this.setStatus(c, 'error', 'Signaling nicht erreichbar');
      };

      ws.onclose = () => {
        if (c.destroyed) return;
        this.teardownPeer(c);
        this.setStatus(c, 'disconnected');
        // Automatisch reconnecten
        c.reconnectTimer = setTimeout(() => {
          if (!c.destroyed) {
            c.ws = null;
            this.setStatus(c, 'connecting');
            this.boot(c);
          }
        }, RECONNECT_DELAY);
      };
    } catch {
      this.setStatus(c, 'error', 'WebRTC konnte nicht gestartet werden');
    }
  }

  /**
   * WebRTC-Handshake starten (Initiator oder Responder).
   * Generiert pro Handshake neue ephemere ECDH-Keys → Forward Secrecy.
   */
  private async startWebRTC(c: Conn, isInitiator: boolean, offerMsg?: any) {
    // Alter PC aufräumen
    this.teardownPeer(c);
    this.setStatus(c, 'handshake');

    const ephKP = await generateEphemeralKeyPair();
    const myPubJwk = await exportECDHPublicKey(ephKP.publicKey);
    (c as any)._ephKP = ephKP; // temporär für answer-Empfang

    const iceServers = await buildIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    c.pc = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && c.ws?.readyState === WebSocket.OPEN)
        c.ws.send(JSON.stringify({ type: 'ice', candidate }));
    };

    pc.onconnectionstatechange = () => {
      if (c.destroyed) return;
      const s = pc.connectionState;
      if (s === 'connected') this.setStatus(c, 'connected');
      if (s === 'disconnected' || s === 'failed') {
        this.teardownPeer(c);
        this.setStatus(c, 'waiting');
      }
    };

    pc.ondatachannel = ({ channel }) => this.bindChannel(c, channel);

    if (isInitiator) {
      const ch = pc.createDataChannel('chat', { ordered: true });
      this.bindChannel(c, ch);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      c.ws?.send(JSON.stringify({ type: 'offer', sdp: offer.sdp, ek: myPubJwk }));
    } else if (offerMsg) {
      const peerPub = await importECDHPublicKey(offerMsg.ek);
      c.sessionKey = await deriveSessionKey(ephKP.privateKey, peerPub);
      await pc.setRemoteDescription({ type: 'offer', sdp: offerMsg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      c.ws?.send(JSON.stringify({ type: 'answer', sdp: answer.sdp, ek: myPubJwk }));
    }
  }

  private bindChannel(c: Conn, ch: RTCDataChannel) {
    c.channel = ch;

    ch.onopen = () => {
      if (!c.destroyed) this.setStatus(c, 'connected');
      // Identitäts-Handshake → gegenseitiger Kontakt-Austausch
      const sendIdHandshake = async () => {
        if (!c.sessionKey || !c.identityPayload || ch.readyState !== 'open') return;
        try {
          const ct = await encryptMessage(c.sessionKey, c.identityPayload);
          ch.send(JSON.stringify({ t: 'id', ct }));
        } catch { /* ignorieren */ }
      };
      sendIdHandshake();
    };

    ch.onclose = () => {
      if (!c.destroyed && c.status === 'connected') this.setStatus(c, 'waiting');
    };

    ch.onmessage = async ({ data }) => {
      if (!c.sessionKey) return;
      try {
        const msg = JSON.parse(data);
        const text = await decryptMessage(c.sessionKey, msg.ct);

        if (msg.t === 'id') {
          try {
            const info = JSON.parse(text) as P2PIdentityInfo;
            if (info.aregoId && info.displayName && info.publicKeyJwk)
              this.contactCb?.(info);
          } catch { /* ignorieren */ }
        } else if (msg.t === 'call') {
          try {
            const signal = JSON.parse(text) as CallSignal;
            console.log('[P2P] Call-Signal empfangen:', signal.action, 'callType:', signal.callType, 'hasCb:', !!this.callSignalCb);
            this.callSignalCb?.(c.roomId, signal);
          } catch (err) { console.error('[P2P] Call-Signal parse Fehler:', err); }
        } else if (msg.t === 'contact_remove') {
          try {
            const { aregoId } = JSON.parse(text) as { aregoId: string };
            if (aregoId) this.contactRemovedCb?.(c.roomId, aregoId);
          } catch { /* ignorieren */ }
        } else if (msg.t === 'msg_read') {
          try {
            const msgIds = JSON.parse(text) as string[];
            if (Array.isArray(msgIds)) this.readReceiptCb?.(c.roomId, msgIds);
          } catch { /* ignorieren */ }
        } else if (msg.t === 'calendar_invite') {
          try {
            const invite = JSON.parse(text) as CalendarInviteMessage;
            if (invite._t === 'calendar_invite') this.calendarInviteCb?.(c.roomId, invite);
          } catch { /* ignorieren */ }
        } else if (msg.t === 'calendar_rsvp') {
          try {
            const rsvp = JSON.parse(text) as CalendarRsvpMessage;
            if (rsvp._t === 'calendar_rsvp') this.calendarRsvpCb?.(c.roomId, rsvp);
          } catch { /* ignorieren */ }
        } else if (msg.t === 'file') {
          // Chunked File-Transfer
          try {
            const parsed = JSON.parse(text);
            if (parsed._t === 'file_start') {
              // Neuen Transfer starten
              if (!this.fileBuffers) this.fileBuffers = new Map();
              this.fileBuffers.set(parsed.chunkId, {
                fileName: parsed.fileName, fileMime: parsed.fileMime,
                totalChunks: parsed.totalChunks, chunks: new Array(parsed.totalChunks).fill(null),
                received: 0, roomId: c.roomId,
              });
            } else if (parsed._t === 'file_chunk') {
              const buf = this.fileBuffers?.get(parsed.chunkId);
              if (buf && buf.chunks[parsed.idx] === null) {
                buf.chunks[parsed.idx] = parsed.data;
                buf.received++;
                // Alle Chunks empfangen → zusammensetzen
                if (buf.received === buf.totalChunks) {
                  const fileData = buf.chunks.join('');
                  const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const isAudio = buf.fileMime?.startsWith('audio/') || /^voice\./i.test(buf.fileName ?? '');
                  this.messageCb?.(buf.roomId, {
                    text: isAudio ? 'Sprachnachricht' : (buf.fileName ?? 'Datei'),
                    timestamp: ts,
                    type: buf.fileMime?.startsWith('image/') ? 'image' : isAudio ? 'audio' : 'file',
                    fileData: `data:${buf.fileMime};base64,${fileData}`,
                    fileName: buf.fileName,
                    fileMime: buf.fileMime,
                    senderMsgId: parsed.chunkId,
                  });
                  this.fileBuffers!.delete(parsed.chunkId);
                }
              }
            }
          } catch { /* ignorieren */ }
        } else {
          // Reguläre Chat-Nachricht oder Datei
          const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          try {
            const parsed = JSON.parse(text);
            if (parsed._t === 'file') {
              const isAudio = parsed.fileMime?.startsWith('audio/') || /^voice\./i.test(parsed.fileName ?? '');
              this.messageCb?.(c.roomId, {
                text: isAudio ? 'Sprachnachricht' : (parsed.fileName ?? 'Datei'),
                timestamp: ts,
                type: parsed.fileMime?.startsWith('image/') ? 'image' : isAudio ? 'audio' : 'file',
                fileData: parsed.fileData,
                fileName: parsed.fileName,
                fileMime: parsed.fileMime,
              });
            } else if (parsed._t === 'msg' && parsed.id) {
              // Nachricht mit Sender-ID → für Lesebestätigungen
              this.messageCb?.(c.roomId, { text: parsed.text, timestamp: ts, senderMsgId: parsed.id });
            } else {
              this.messageCb?.(c.roomId, { text, timestamp: ts });
            }
          } catch {
            // Kein JSON → normaler Text
            this.messageCb?.(c.roomId, { text, timestamp: ts });
          }
        }
      } catch { /* Entschlüsselungsfehler → verwerfen */ }
    };
  }

  /** RTCPeerConnection + DataChannel aufräumen, WS bleibt offen */
  private teardownPeer(c: Conn) {
    c.channel?.close();
    c.channel = null;
    c.pc?.close();
    c.pc = null;
    c.sessionKey = null;
    (c as any)._ephKP = null;
  }
}
