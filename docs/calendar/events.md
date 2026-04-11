# Kalender-Events

## Zweck
Lokale Termin- und Erinnerungsverwaltung mit Monatsansicht und Farbkodierung.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/CalendarScreen.tsx` — Monatsansicht, Event-CRUD, Farbauswahl
- **Typen:** `src/app/types.ts` — `CalendarEvent` Interface

## Datenfluss
Event erstellen/bearbeiten → localStorage `arego_calendar_events` → Monatsansicht rendert Events

## CalendarEvent-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | string | Eindeutige ID |
| title | string | Event-Titel |
| date | string | Datum (YYYY-MM-DD) |
| startTime | string | Startzeit (HH:mm) |
| duration | enum | 15min, 30min, 1h, 2h, allday |
| reminder | enum | none, 10min, 30min, 1h, 1day |
| color | string | Tailwind-Farbklasse (6 Optionen) |
| note | string | Optionale Notiz |

## Storage-Keys
- `arego_calendar_events` — Array aller Events

## Abhaengigkeiten
- Keine externen Abhaengigkeiten (eigenstaendige Domain)

## Einschraenkungen
- Nur lokale Speicherung — kein Sync zwischen Geraeten
- Keine geteilten Kalender (geplant fuer spaeter)
- Erinnerungen funktionieren nur bei geoeffneter App
