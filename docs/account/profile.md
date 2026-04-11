# Profil

## Zweck
Anzeige und Bearbeitung des eigenen Nutzerprofils mit Avatar, Namen, Adressen und Kontaktdaten.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/ProfileScreen.tsx` — Profilbearbeitung
- **Avatar:** `src/app/components/ProfileAvatar.tsx` — Avatar-Anzeige-Komponente
- **Identity:** `src/app/auth/identity.ts` — Grunddaten (aregoId, displayName)

## Profil-Felder
- Vorname, Nachname, Spitzname
- Status-Text
- Avatar (Upload)
- Mehrere Adressen (Strasse, PLZ, Ort, Land)
- Kontakteintraege: Telefon, Mobil, E-Mail, Fax
- Social Links

## Storage-Keys
- `arego_profile` — Profildaten (JSON)

## Abhaengigkeiten
- Nutzt: [Identity](/docs/identity/registration.md)
- Genutzt von: [QR-Code](qr-code.md), [Kontakte](/docs/contacts/contact-management.md)

## Einschraenkungen
- Profil ist lokal gespeichert — wird bei Kontaktaustausch teilweise geteilt
- Keine zentrale Profil-Suche (Privacy by Design)
