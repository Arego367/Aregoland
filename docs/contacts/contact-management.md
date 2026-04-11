# Kontaktverwaltung

## Zweck
Speicherung, Anzeige und Verwaltung von Kontakten mit Kategorien und Blockliste.

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/auth/contacts.ts` — Kontakt-Persistenz, Blockliste, Nonce-Tracking
- **UI:** `src/app/components/PeopleScreen.tsx` — Kontaktliste mit Tabs/Kategorien
- **Detail:** `src/app/components/ContactDetailModal.tsx` — Kontaktdetails bearbeiten, Chat/Anruf starten
- **Hinzufuegen:** `src/app/components/AddContactModal.tsx` — QR/Shortcode Kontaktaustausch
- **Mock-Daten:** `src/app/data/contacts.ts` — Test-Kontakte

## Datenfluss
Kontakt hinzufuegen (QR/Shortcode) → `saveContact()` → localStorage → PeopleScreen zeigt Kontakt an

## Schluessel-Exports
- `StoredContact` — Typ mit aregoId, displayName, publicKey, category
- `loadContacts()` / `saveContact()` / `removeContact()` — CRUD
- `loadBlocked()` / `blockContact()` / `unblockContact()` / `isBlocked()` — Blockliste
- `isNonceUsed()` / `markNonceUsed()` — Replay-Schutz fuer QR-Codes

## Storage-Keys
- `aregoland_contacts` — Kontaktliste (StoredContact[])
- `aregoland_blocked` — Blockliste (AregoId[])
- `aregoland_used_nonces` — Verwendete Einmal-Codes

## Abhaengigkeiten
- Nutzt: [QR-Pairing](qr-pairing.md), [FSK-System](/docs/child-safety/fsk-system.md)
- Genutzt von: [Messaging](/docs/messaging/chat.md), [Calls](/docs/calls/voice-video.md)

## Einschraenkungen
- Kontakte sind lokal gespeichert — kein Server-Adressbuch
- Blockierte Kontakte koennen keine Nachrichten senden
- FSK-Level kann Kontaktverwaltung einschraenken
