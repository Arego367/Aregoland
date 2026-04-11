# WebRTC P2P-Verbindungen

## Zweck
Verwaltet den Lebenszyklus von WebRTC-Verbindungen zwischen Peers fuer Echtzeit-Kommunikation (Chat, Dateien, Anrufe).

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/lib/p2p-manager.ts` — P2PManager-Klasse, Multi-Connection-Architektur (eine RTCPeerConnection pro Kontakt)
- **React-Hook:** `src/app/lib/p2p-webrtc.ts` — `useP2PChat()` Hook fuer Komponenten-Integration
- **Typen:** `src/app/types.ts` — P2PStatus, P2PIncomingMessage, P2PIdentityInfo

## Datenfluss
1. Client verbindet per WebSocket zu `/ws-signal` (Signaling-Server)
2. SDP Offer/Answer + ICE Candidates werden ueber WebSocket ausgetauscht
3. ECDH Handshake fuer Session-Key-Ableitung
4. DataChannel fuer verschluesselte Nachrichten (AES-GCM)
5. Optional: MediaStream fuer Audio/Video-Anrufe

## Statusuebergaenge
`connecting` → `waiting` → `handshake` → `connected` → `disconnected` | `error`

## Schluessel-Exports
- `P2PManager` — Klasse: verwaltet mehrere gleichzeitige Peer-Verbindungen
- `buildIceServers()` — TURN-Server-Konfiguration (coturn, Port 3478/5349)
- `useP2PChat()` — React-Hook: Status, sendMessage, sendFile, registerHandler

## Abhaengigkeiten
- Nutzt: [E2E-Verschluesselung](e2e-encryption.md), [Signaling](signaling.md)
- Genutzt von: [Messaging](/docs/messaging/chat.md), [Calls](/docs/calls/voice-video.md), [Spaces](/docs/spaces/space-sync.md)

## Einschraenkungen
- Server speichert niemals Nachrichten-Inhalte (nur Signaling-Daten)
- TURN-Server nur als Relay-Fallback, bevorzugt direkte P2P-Verbindung
