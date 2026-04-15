# Einstellungen

## Zweck
App-Einstellungen fuer Benachrichtigungen, Sprache, Theme und Privacy.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/SettingsScreen.tsx` — Einstellungs-Seite mit allen Sektionen
- **i18n:** `src/i18n/i18n.ts` — Sprachauswahl

## Sektionen
- **Benachrichtigungen:** Push-Einstellungen
- **Sprache:** Auswahl aus 27 verfuegbaren Sprachen
- **Privacy:** Sichtbarkeit pro Kategorie (Kontakte, Profil, Status)
- **Online-Status:** Toggle fuer Sichtbarkeit des eigenen Online-Status. Default: versteckt. Gegenseitigkeit: Wer eigenen Status verbirgt, sieht auch keine Online-Anzeigen anderer. Live-Toggle via `update_presence` WebSocket-Nachricht.
- **Speicher:** Info ueber lokale Datenmenge
- **Daten exportieren/loeschen:** DSGVO-konforme Datenportabilitaet
- **FSK-Verifikation:** Altersverifikation aufrufen
- **Kind-Account:** Kinderprofil verknuepfen
- **Blockliste:** Blockierte Kontakte verwalten

## Storage-Keys
- `aregoland_notifications` — Benachrichtigungs-Einstellungen
- `aregoland_privacy_visibility` — Privacy pro Kategorie
- `aregoland_hide_online` — Online-Status verbergen (`"true"` = versteckt, Default: versteckt wenn Key fehlt)
- `arego_tabs` — Benutzerdefinierte Kontakt-Kategorien

## Abhaengigkeiten
- Nutzt: [FSK-System](/docs/child-safety/fsk-system.md), [i18n](/docs/i18n/localization.md)
- Nutzt: [Kontakte](/docs/contacts/contact-management.md) (Blockliste)

## Einschraenkungen
- Alle Einstellungen lokal gespeichert
- Keine Cloud-Sync fuer Einstellungen
