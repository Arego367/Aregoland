# Signaling-Server

## Zweck
WebSocket-basierter Signaling-Dienst fuer den Aufbau von WebRTC-Verbindungen. Vermittelt SDP-Offers/Answers und ICE-Candidates zwischen Peers.

## Status
`aktiv`

## Code-Anker
- **Client-Logik:** `src/app/lib/p2p-manager.ts` — WebSocket-Verbindung zu `/ws-signal`
- **Hook:** `src/app/lib/p2p-webrtc.ts` — Signaling-Integration in `useP2PChat()`
- **Server:** Node.js Signaling-Server (Docker-Container auf Hetzner VPS)

## Datenfluss
Client → WebSocket `/ws-signal` → Signaling-Server → WebSocket → Ziel-Client

## Schluessel-Funktionen
- SDP Offer/Answer Relay
- ICE Candidate Weiterleitung
- Shortcode-Registrierung und -Einloesung (fuer Kontaktaustausch)
- Space-Registry (oeffentliche Raeume)
- **Online-Presence:** `hiddenPresenceUsers` Set trackt User mit verstecktem Status; `update_presence` Message fuer Live-Toggle; versteckte User werden nicht in `onlineUsers` aufgenommen und abonnieren keine `watchIds` (Gegenseitigkeit)

## Abhaengigkeiten
- Genutzt von: [WebRTC](webrtc.md), [Contacts](/docs/contacts/qr-pairing.md)

## Einschraenkungen
- Speichert keine Nachrichteninhalte
- Shortcodes verfallen nach 1 Stunde und sind Einmal-Nutzung
- WebSocket-Verbindung wird von Cache ausgeschlossen (`/ws-signal` nicht gecacht)
