# Kinderprofile

## Zweck
Erstellung und Verwaltung von Kinderprofilen mit Verknuepfung zum Eltern-/Verwalter-Account.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/ChildProfileScreen.tsx` — QR-Code-Generierung fuer Parent-Linking
- **Logik:** `src/app/auth/identity.ts` — `createChildIdentity()`, `createChildLinkPayload()`, `decodeChildLinkPayload()`
- **Verwalter:** `src/app/auth/identity.ts` — `isChildAccount()`, `getVerwalter()`, `setKindStatus()`

## Datenfluss
1. Elternteil oeffnet ChildProfileScreen
2. `createChildLinkPayload()` erzeugt signierten QR-Code
3. Kind scannt QR-Code → `decodeChildLinkPayload()`
4. `createChildIdentity()` erstellt Kind-Account mit Verwalter-Referenz
5. Kind-Account hat eingeschraenkte Features (FSK-Level des Kindes)

## Schluessel-Exports
- `createChildIdentity()` — Erstellt neuen Kind-Account
- `createChildLinkPayload()` — Erzeugt Linking-Payload fuer QR
- `decodeChildLinkPayload()` — Dekodiert empfangenen Link
- `isChildAccount()` — Prueft ob aktueller Account ein Kind ist
- `getVerwalter()` — Gibt Liste der Verwalter zurueck
- `setKindStatus()` — Setzt Kind-Status auf Identity

## Abhaengigkeiten
- Nutzt: [FSK-System](fsk-system.md), [Identity](/docs/identity/registration.md), [QR-Code](/docs/account/qr-code.md)

## Einschraenkungen
- Ein Kind kann mehrere Verwalter haben
- Verwalter koennen FSK-Level des Kindes nicht ueber dessen echtes Alter hinaus erhoehen
- Kind-Accounts benoetigen mindestens einen Verwalter
