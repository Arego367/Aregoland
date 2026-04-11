# Datei-Austausch

## Zweck
Austausch von Dateien zwischen Kontakten ueber P2P-Verbindung.

## Status
`geplant`

## Code-Anker
- **UI:** `src/app/components/DocumentsScreen.tsx` — Platzhalter-UI mit Upload-Button (noch nicht funktional)
- **P2P-Transfer:** `src/app/lib/p2p-webrtc.ts` — `sendP2PFile()` (Grundinfrastruktur vorhanden)

## Geplante Features
- Dateiverwaltung mit Ordnerstruktur
- Datei-Upload und -Download ueber P2P
- Vorschau fuer gaengige Dateitypen
- Versionierung (optional)

## Abhaengigkeiten
- Nutzt: [P2P Network](/docs/p2p-network/webrtc.md), [E2E-Verschluesselung](/docs/p2p-network/e2e-encryption.md)

## Einschraenkungen
- Keine Server-Speicherung — Dateien nur bei den beteiligten Peers
- Beide Peers muessen online sein fuer Uebertragung
- Groessenlimit durch WebRTC DataChannel
