# QR-Code

## Zweck
Anzeige des eigenen Kontakt-QR-Codes und Scannen von QR-Codes anderer Nutzer, Kinderprofile und URLs.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/QRCodeScreen.tsx` — QR anzeigen (Display) und scannen (Scan)
- **Payload:** `src/app/auth/share.ts` — `createSharePayload()`, `encodePayload()`, `decodePayload()`
- **Kind-Link:** `src/app/auth/identity.ts` — `decodeChildLinkPayload()` (Kind-QR erkennen)

## Modi
- **Display:** Zeigt eigenen Kontakt-QR (10 Min Gueltigkeit, mit Nonce)
- **Scan:** Scannt QR-Codes — erkennt Kontakt-Payloads, Kind-Link-Payloads und URLs

## Datenfluss (Display)
`createSharePayload()` → `encodePayload()` → Base64-JSON → QR-Code rendern

## Datenfluss (Scan)
Kamera → QR dekodieren → `decodePayload()` → Typ erkennen → Kontakt speichern / Kind verknuepfen / URL oeffnen

## Abhaengigkeiten
- Nutzt: [QR-Pairing](/docs/contacts/qr-pairing.md), [Kinderprofile](/docs/child-safety/child-profiles.md)
- Genutzt von: [Kontaktverwaltung](/docs/contacts/contact-management.md)

## Einschraenkungen
- QR-Codes haben eingebaute Ablaufzeit (10 Minuten)
- Nonce-Validierung verhindert Replay-Angriffe
