# Registrierung

## Zweck
Passwordless Registrierung neuer Nutzer mit automatischer Schluesselgenerierung und Backup-Moeglichkeit.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/RegistrationScreen.tsx` — Schritt-fuer-Schritt Registrierungs-Flow
- **Logik:** `src/app/auth/identity.ts` — `createIdentity()`, `loadIdentity()`, `deleteIdentity()`
- **Crypto:** `src/app/auth/crypto.ts` — `generateIdentityKeyPair()`, `deriveAregoId()`

## Datenfluss
1. Nutzer gibt Namen ein (Intro → Name-Schritt)
2. `generateIdentityKeyPair()` erzeugt ECDSA P-256 Schluessel
3. `deriveAregoId()` leitet eindeutige Arego-ID aus Public Key ab
4. `createIdentity()` speichert Identity in localStorage
5. Backup-Payload wird angeboten (`encodeRecoveryPayload()`)
6. Registrierung abgeschlossen → `onComplete(identity)`

## Registrierungs-Schritte
`intro` → `name` → `generating` → `backup` → `done`

## Schluessel-Exports
- `UserIdentity` — Typ mit aregoId, displayName, keyPair, children, verwalter
- `createIdentity()` — Erstellt und speichert neue Identitaet
- `loadIdentity()` — Laedt gespeicherte Identitaet
- `deleteIdentity()` — Loescht Account komplett

## Abhaengigkeiten
- Nutzt: [Kryptoschluessel](crypto-keys.md)
- Genutzt von: Alle Domains (Identity ist Grundvoraussetzung)

## Einschraenkungen
- Kein Passwort, kein Server-Account — Schluessel = Identitaet
- Verlust des Schluessels = Verlust des Accounts (daher Backup-Schritt)
- Kein Benutzername-System, nur kryptografische IDs
