/**
 * useP2PChat — React Hook für WebRTC P2P Chat
 *
 * Ablauf:
 *  1. WebSocket → Signaling Server (nur für Handshake)
 *  2. SDP offer/answer + ICE candidates werden weitergeleitet
 *  3. ECDH Public Keys werden im SDP-Handshake mitgesendet → Session-Key ableiten
 *  4. DataChannel offen → Server ist komplett raus
 *  5. Alle Nachrichten gehen verschlüsselt direkt Gerät ↔ Gerät
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateEphemeralKeyPair,
  exportECDHPublicKey,
  importECDHPublicKey,
  deriveSessionKey,
  encryptMessage,
  decryptMessage,
} from '@/app/lib/p2p-crypto';

export type P2PStatus =
  | 'connecting'   // WS wird aufgebaut
  | 'waiting'      // In Room, warte auf zweiten Peer
  | 'handshake'    // SDP/ICE Austausch läuft
  | 'connected'    // DataChannel offen, E2E aktiv
  | 'disconnected' // Peer weg oder Verbindung getrennt
  | 'error';       // Signaling nicht erreichbar

export interface P2PIncomingMessage {
  text: string;
  timestamp: string;
}

/** Identitätsdaten die beim DataChannel-Open E2E-verschlüsselt ausgetauscht werden */
export interface P2PIdentityInfo {
  aregoId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
}

interface UseP2PChatOptions {
  roomId: string;
  enabled?: boolean;
  /**
   * Eigene Identität als JSON-String — wird beim DataChannel-Open E2E-verschlüsselt
   * an den Peer gesendet, damit beide Seiten sich gegenseitig als Kontakt speichern können.
   * Format: JSON.stringify({ aregoId, displayName, publicKeyJwk })
   */
  identityPayload?: string;
  /**
   * Callback wenn der Peer seine Identität sendet.
   * Hier den Kontakt in localStorage speichern.
   */
  onContactDiscovered?: (info: P2PIdentityInfo) => void;
}

interface UseP2PChatReturn {
  status: P2PStatus;
  sendP2PMessage: (text: string) => Promise<boolean>;
  error: string | null;
}

// ICE-Server: STUN + TURN (time-limited HMAC credentials)
import { buildIceServers } from '@/app/lib/p2p-manager';

// Signaling URL: über Vite-Proxy (wss/ws automatisch je nach Protokoll)
// Proxy: /ws-signal → ws://127.0.0.1:3001 (kein mixed-content Problem)
const SIGNALING_URL =
  (import.meta as any).env?.VITE_SIGNALING_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-signal`;

export function useP2PChat(
  options: UseP2PChatOptions,
  onMessage: (msg: P2PIncomingMessage) => void
): UseP2PChatReturn {
  const { roomId, enabled = true } = options;

  const [status, setStatus] = useState<P2PStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const sessionKeyRef = useRef<CryptoKey | null>(null);
  // Stabile Referenzen — verhindert Effect-Neustarts bei Callback-Änderungen
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const identityPayloadRef = useRef(options.identityPayload);
  identityPayloadRef.current = options.identityPayload;
  const onContactDiscoveredRef = useRef(options.onContactDiscovered);
  onContactDiscoveredRef.current = options.onContactDiscovered;

  useEffect(() => {
    if (!enabled || !roomId) return;

    let cancelled = false;

    const start = async () => {
      try {
        // Ephemeres ECDH-Schlüsselpaar für diese Session
        const ephemeralKP = await generateEphemeralKeyPair();
        const myPubJwk = await exportECDHPublicKey(ephemeralKP.publicKey);

        const ws = new WebSocket(SIGNALING_URL);
        wsRef.current = ws;

        const iceServers = await buildIceServers();
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;

        // ICE Candidates → an Peer weiterleiten
        pc.onicecandidate = ({ candidate }) => {
          if (candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ice', candidate }));
          }
        };

        pc.onconnectionstatechange = () => {
          if (cancelled) return;
          const s = pc.connectionState;
          if (s === 'connected') setStatus('connected');
          if (s === 'disconnected' || s === 'failed' || s === 'closed') setStatus('disconnected');
        };

        // Responder empfängt DataChannel vom Initiator
        pc.ondatachannel = ({ channel }) => bindChannel(channel);

        const bindChannel = (ch: RTCDataChannel) => {
          channelRef.current = ch;

          // Eigene Identität E2E-verschlüsselt senden sobald der Kanal offen ist.
          // Beide Seiten tun das → automatisch gegenseitiger Kontakt-Austausch.
          const sendIdentityHandshake = async () => {
            const key = sessionKeyRef.current;
            const payload = identityPayloadRef.current;
            if (!key || !payload || ch.readyState !== 'open') return;
            try {
              const ct = await encryptMessage(key, payload);
              ch.send(JSON.stringify({ t: 'id', ct }));
            } catch { /* ignorieren */ }
          };

          ch.onopen = () => {
            if (!cancelled) setStatus('connected');
            sendIdentityHandshake();
          };
          ch.onclose = () => { if (!cancelled) setStatus('disconnected'); };

          ch.onmessage = async ({ data }) => {
            if (!sessionKeyRef.current) return;
            try {
              const msg = JSON.parse(data);
              const text = await decryptMessage(sessionKeyRef.current, msg.ct);

              if (msg.t === 'id') {
                // Identitäts-Handshake — Peer als Kontakt speichern
                try {
                  const info = JSON.parse(text) as P2PIdentityInfo;
                  if (info.aregoId && info.displayName && info.publicKeyJwk) {
                    onContactDiscoveredRef.current?.(info);
                  }
                } catch { /* ungültiges Format ignorieren */ }
              } else {
                // Normale Chat-Nachricht
                onMessageRef.current({
                  text,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                });
              }
            } catch {
              // Entschlüsselungsfehler → Nachricht verwerfen (niemals anzeigen)
            }
          };
        };

        ws.onopen = () => {
          if (!cancelled) {
            ws.send(JSON.stringify({ type: 'join', roomId }));
            setStatus('waiting');
          }
        };

        ws.onmessage = async ({ data }) => {
          if (cancelled) return;
          let msg: any;
          try { msg = JSON.parse(data); } catch { return; }

          // Peer ist dem Room beigetreten → wir sind Initiator, senden Offer
          if (msg.type === 'peer_joined') {
            setStatus('handshake');
            const ch = pc.createDataChannel('chat', { ordered: true });
            bindChannel(ch);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp, ek: myPubJwk }));
          }

          // Wir sind Responder — Offer empfangen
          if (msg.type === 'offer') {
            setStatus('handshake');
            const peerPub = await importECDHPublicKey(msg.ek);
            sessionKeyRef.current = await deriveSessionKey(ephemeralKP.privateKey, peerPub);

            await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp, ek: myPubJwk }));
          }

          // Answer empfangen (Initiator-Seite)
          if (msg.type === 'answer') {
            const peerPub = await importECDHPublicKey(msg.ek);
            sessionKeyRef.current = await deriveSessionKey(ephemeralKP.privateKey, peerPub);
            await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
          }

          // ICE Candidate vom Peer
          if (msg.type === 'ice') {
            try { await pc.addIceCandidate(msg.candidate); } catch { /* ignorieren */ }
          }

          if (msg.type === 'peer_left') {
            if (!cancelled) setStatus('disconnected');
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setStatus('error');
            setError('Signaling-Server nicht erreichbar (Port 3001)');
          }
        };

        ws.onclose = () => {
          if (!cancelled && status !== 'connected') setStatus('disconnected');
        };

      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError('WebRTC konnte nicht gestartet werden');
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      channelRef.current?.close();
      pcRef.current?.close();
      wsRef.current?.close();
      channelRef.current = null;
      pcRef.current = null;
      wsRef.current = null;
      sessionKeyRef.current = null;
    };
  }, [roomId, enabled]);

  const sendP2PMessage = useCallback(async (text: string): Promise<boolean> => {
    const ch = channelRef.current;
    const key = sessionKeyRef.current;
    if (!ch || ch.readyState !== 'open' || !key) return false;

    const ct = await encryptMessage(key, text);
    ch.send(JSON.stringify({ ct }));
    return true;
  }, []);

  return { status, sendP2PMessage, error };
}
