# Sprach- und Videoanrufe

## Zweck
Echtzeit-Sprach- und Videoanrufe ueber WebRTC mit Kamera- und Mikrofon-Steuerung.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/CallOverlay.tsx` — Anruf-Overlay mit Controls (Mikrofon, Kamera, Auflegen)
- **P2P:** `src/app/lib/p2p-manager.ts` — MediaStream-Handling, ICE-Server-Config
- **WebRTC:** `src/app/lib/p2p-webrtc.ts` — `sendCallSignal()` im useP2PChat-Hook
- **Chat-Integration:** `src/app/components/ChatScreen.tsx` — Anruf-Buttons im Chat

## Datenfluss
Anruf starten → `sendCallSignal()` via DataChannel → Empfaenger: Incoming-State → Accept → WebRTC MediaStream → Audio/Video-Uebertragung

## Call-States
`idle` → `ringing` (ausgehend) | `incoming` (eingehend) → `connecting` → `active` → `idle`

## Call-Types
- `audio` — Nur Sprachanruf
- `video` — Video + Sprache

## UI-Controls
- Mikrofon Mute/Unmute
- Kamera An/Aus
- Auflegen
- Video-Stream-Anzeige (lokal + remote)

## Schluessel-Exports
- `CallState` — Typ: idle | ringing | incoming | connecting | active
- `CallType` — Typ: audio | video
- `CallOverlay` — React-Komponente mit Props: callState, callType, localStream, remoteStream, onAccept, onReject, onHangup

## Abhaengigkeiten
- Nutzt: [WebRTC](/docs/p2p-network/webrtc.md), [E2E-Verschluesselung](/docs/p2p-network/e2e-encryption.md)
- Nutzt: [Kontakte](/docs/contacts/contact-management.md) (Anzeigename, Avatar)

## Einschraenkungen
- Kein Server-Relay fuer Media-Streams (nur TURN als Fallback)
- Kamera-Verfuegbarkeit wird erkannt (`cameraUnavailable` Prop)
- Keine Gruppenanrufe (nur 1:1)
