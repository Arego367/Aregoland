# QR-Pairing (Kontaktaustausch)

## Zweck
Sicherer Austausch von Kontaktdaten ueber QR-Codes oder 6-stellige Shortcodes.

## Status
`aktiv`

## Code-Anker
- **Share-Logik:** `src/app/auth/share.ts` — Payload-Erstellung, Shortcode-Registrierung
- **QR-UI:** `src/app/components/QRCodeScreen.tsx` — QR anzeigen und scannen
- **Kontakt-UI:** `src/app/components/AddContactModal.tsx` — QR/Shortcode-Eingabe

## Datenfluss (QR)
1. `createSharePayload()` → Kontaktdaten + Nonce + Timestamp
2. `encodePayload()` → Base64-JSON-String
3. QR-Code wird angezeigt (10 Min Gueltigkeit)
4. Empfaenger scannt → `decodePayload()` → Nonce-Validierung → `saveContact()`

## Datenfluss (Shortcode)
1. `registerShortCode()` → 6-Zeichen-Code auf Signaling-Server registrieren
2. Code wird angezeigt (1 Stunde Gueltigkeit, Einmalnutzung)
3. Empfaenger gibt Code ein → `redeemShortCode()` → Kontaktdaten empfangen
4. `deriveRoomId()` erzeugt gemeinsame Room-ID fuer Chat

## Schluessel-Exports
- `ContactSharePayload` — Typ: aregoId, publicKey, displayName, nonce, timestamp
- `createSharePayload()` / `encodePayload()` / `decodePayload()` — QR-Flow
- `registerShortCode()` / `redeemShortCode()` — Shortcode-Flow
- `deriveRoomId()` — Ableitung der Chat-Room-ID aus beiden AregoIds

## Abhaengigkeiten
- Nutzt: [Signaling](/docs/p2p-network/signaling.md), [Identity](/docs/identity/registration.md)
- Genutzt von: [Kontaktverwaltung](contact-management.md)

## Einschraenkungen
- QR-Codes verfallen nach 10 Minuten
- Shortcodes verfallen nach 1 Stunde und sind Einmalnutzung
- Nonce-Replay-Schutz verhindert Wiederverwendung alter QR-Codes
