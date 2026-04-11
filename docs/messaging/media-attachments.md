# Medien-Anhaenge

## Zweck
Versand von Bildern und Dateien innerhalb von Chat-Nachrichten ueber P2P.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/ChatScreen.tsx` — Datei-Upload-Button, Medien-Vorschau im Chat
- **P2P-Transfer:** `src/app/lib/p2p-webrtc.ts` — `sendP2PFile()` Funktion im useP2PChat-Hook
- **Verschluesselung:** `src/app/lib/p2p-crypto.ts` — Dateien werden wie Nachrichten E2E verschluesselt

## Datenfluss
Datei auswaehlen → File-Reader → P2P-Crypto verschluesseln → WebRTC DataChannel → Empfaenger entschluesseln → Blob anzeigen

## Abhaengigkeiten
- Nutzt: [Chat](chat.md), [P2P Network](/docs/p2p-network/webrtc.md)

## Einschraenkungen
- Keine Server-Speicherung — Datei wird direkt P2P uebertragen
- Groesse limitiert durch DataChannel-Kapazitaet
- FSK-Filter aktiv fuer Medieninhalte
