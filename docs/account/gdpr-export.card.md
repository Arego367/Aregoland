# DSGVO Datenexport (Art. 20)

## Zweck
Strukturierter Export aller Nutzerdaten in maschinenlesbarem JSON-Format
gemaess DSGVO Artikel 20 (Recht auf Datenuebertragbarkeit).

## Status
`aktiv`

## Code-Anker
- **Export-Logik:** `src/app/lib/gdpr-export.ts` — collectGdprExport, downloadGdprExport
- **UI:** `src/app/components/SettingsScreen.tsx` — Download-Button im Datenschutz-Bereich

## Datenfluss
Button klicken → `collectGdprExport()` sammelt localStorage-Daten → Sanitize (Private Keys entfernen) → JSON-Blob erstellen → Browser-Download ausloesen

## Exportierte Kategorien
| Kategorie | localStorage-Keys |
|-----------|------------------|
| Profil | aregoland_identity (ohne Private Keys), arego_profile, arego_child_profiles |
| Kontakte | arego_contacts, aregoland_contacts, aregoland_blocked, arego_contact_categories, arego_contact_statuses |
| Kalender | arego_calendar_events |
| Spaces | aregoland_spaces, aregoland_deleted_spaces, aregoland_space_appearance, aregoland_space_chats, aregoland_space_versions |
| Chats | Alle Keys mit Prefix `arego_chat_` |
| Einstellungen | arego_tabs, aregoland_language, aregoland_dark_mode, etc. |

## Sicherheit
- Private Keys (privateKey, signingPrivateKey) werden vor Export entfernt
- Export laeuft komplett lokal im Browser — keine Server-Kommunikation
- Download als `aregoland-datenexport-YYYY-MM-DD.json`

## Abhaengigkeiten
- Keine externen Abhaengigkeiten (kein JSZip noetig)

## Einschraenkungen
- Export als einzelne JSON-Datei (kein ZIP-Bundle)
- IndexedDB-Daten (SW-Reminders) nicht im Export enthalten
