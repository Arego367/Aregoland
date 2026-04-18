# Kalender-Events

## Zweck
Lokale Termin- und Erinnerungsverwaltung mit Monats-, Wochen- und Tagesansicht, Farbkodierung und Labels.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/CalendarScreen.tsx` — Monats-/Wochen-/Tagesansicht, Event-CRUD, Farbauswahl, Jahresauswahl
- **Typen:** `src/app/types.ts` — `CalendarEvent`, `CalendarLabel`, `CalendarEventDefaults`, `EventReminder`, `EventReminderPreset`

## Datenfluss
Event erstellen/bearbeiten → localStorage `arego_calendar_events` → Views rendern Events

## CalendarEvent-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | string | Eindeutige ID |
| title | string | Event-Titel |
| date | string | Datum (YYYY-MM-DD) |
| startTime | string | Startzeit (HH:mm) |
| duration | enum | 15min, 30min, 1h, 2h, allday, custom |
| customDurationMinutes | number? | Manuelle Dauer in Minuten (wenn duration=custom) |
| reminder | EventReminderPreset | Legacy-Einzelerinnerung (none, 10min, 30min, 1h, 1day, custom) |
| customReminderMinutes | number? | Legacy: Minuten wenn reminder=custom |
| reminders | EventReminder[]? | Neue Multi-Erinnerungen (ueberschreibt Legacy wenn vorhanden) |
| color | string | Tailwind-Farb-ID (z.B. 'blue') oder Hex-Farbe (z.B. '#ff5500') |
| label | string? | Optionaler Label-Name (z.B. "Arbeit", "Familie") |
| address | string? | Optionaler Ort — wird als zweite Zeile im Kalender angezeigt |
| note | string? | Optionale Notiz |
| rrule | string? | RFC 5545 RRULE-String (siehe recurring-events.card.md) |
| exdates | string[]? | Ausnahme-Daten fuer Serien (YYYY-MM-DD) |
| invitees | EventInvitee[]? | Eingeladene Kontakte mit RSVP-Status (siehe invitations.card.md) |
| organizerAregoId | string? | AregoId des Event-Organisators |

## EventReminder-Felder (Multi-Erinnerung, ARE-261)
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| preset | EventReminderPreset | none, 10min, 30min, 1h, 1day, custom |
| customMinutes | number? | Benutzerdefinierte Minuten (wenn preset=custom) |

Migration: Legacy-Events mit einzelnem `reminder`-Feld werden automatisch in `reminders[]`-Array konvertiert.

## Jahresauswahl (ARE-256)
- Endlos scrollbare Jahresauswahl von 1 bis 9999
- 4-Spalten Grid-Layout im Modal
- Auto-Scroll zum aktuell ausgewaehlten Jahr

## Storage-Keys
- `arego_calendar_events` — Array aller Events

## Abhaengigkeiten
- Keine externen Abhaengigkeiten (eigenstaendige Domain)

## Einschraenkungen
- Nur lokale Speicherung — kein Sync zwischen Geraeten
- Keine geteilten Kalender (geplant fuer spaeter)
