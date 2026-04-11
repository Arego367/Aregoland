# Kryptoschluessel

## Zweck
Generierung und Verwaltung kryptografischer Schluesselpaare fuer Nutzer-Identitaet und digitale Signaturen.

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/auth/crypto.ts` — WebCrypto ECDSA Schluessel-Operationen
- **Typen:** `src/app/auth/identity.ts` — `UserIdentity` (enthaelt keyPair)

## Datenfluss
`generateIdentityKeyPair()` → ECDSA P-256 KeyPair → `deriveAregoId()` (SHA-256 Hash des Public Key) → Persistenz als JWK in localStorage

## Schluessel-Exports
- `generateIdentityKeyPair()` — Erzeugt ECDSA P-256 Schluessel (sign/verify)
- `deriveAregoId()` — Leitet eindeutige ID aus Public Key ab (SHA-256, Base64URL)
- `exportKeyPairAsJWK()` — Exportiert Schluessel als JSON Web Key (fuer Backup)
- `importKeyPairFromJWK()` — Importiert Schluessel aus JWK (fuer Recovery)
- `signData()` — Signiert Daten mit Private Key (ECDSA)

## Abhaengigkeiten
- Genutzt von: [Registrierung](registration.md), [E2E-Verschluesselung](/docs/p2p-network/e2e-encryption.md)

## Einschraenkungen
- Basiert auf WebCrypto API (Browser-nativ, kein Polyfill)
- Private Key verliert sich bei localStorage-Leerung ohne Backup
- ECDSA fuer Signatur, ECDH (separates Modul) fuer Verschluesselung
