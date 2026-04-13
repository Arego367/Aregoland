# Wiederkehrende Termine (RRULE)

## Zweck
Unterstuetzung fuer wiederkehrende Kalender-Events nach RFC 5545 (RRULE Subset).
Nutzer koennen Termine als taeglich, woechentlich, monatlich oder jaehrlich wiederkehrend markieren.

## Status
`aktiv`

## Code-Anker
- **RRULE-Parser:** `src/app/lib/rrule.ts` — parseRRule, expandRecurrence, buildRRule, rruleLabel
- **UI:** `src/app/components/CalendarScreen.tsx` — Wiederholungs-Auswahl im EventFormModal
- **Typen:** `src/app/types.ts` — `CalendarEvent.rrule`, `CalendarEvent.exdates`, `RecurrenceFreq`

## Datenfluss
Event mit `rrule` erstellen → localStorage speichert Event einmalig → `expandRecurrence()` expandiert in sichtbaren Datumsbereich → Views zeigen Instanzen

## RRULE-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| rrule | string? | RFC 5545 RRULE-String (z.B. `FREQ=WEEKLY;INTERVAL=1`) |
| exdates | string[]? | Ausnahme-Daten (YYYY-MM-DD) die aus der Serie ausgeschlossen werden |

## Unterstuetzte RRULE-Parameter
| Parameter | Beschreibung |
|-----------|-------------|
| FREQ | DAILY, WEEKLY, MONTHLY, YEARLY |
| INTERVAL | Wiederholungs-Intervall (Standard: 1) |
| COUNT | Maximale Anzahl Wiederholungen |
| UNTIL | Ende-Datum der Serie (YYYYMMDD) |

## Expansion
- Events werden on-the-fly expandiert basierend auf dem sichtbaren Zeitraum (Monat/Woche/Tag)
- Maximum 400 Instanzen pro Event als Sicherheitslimit
- Exception Dates (EXDATE) werden bei der Expansion herausgefiltert

## Storage-Keys
- `arego_calendar_events` — Array aller Events (mit rrule/exdates Feldern)

## Abhaengigkeiten
- Keine externen Abhaengigkeiten — eigener RRULE-Parser ohne Bibliothek

## Einschraenkungen
- BYDAY wird geparst aber noch nicht in der UI konfigurierbar
- Bearbeitung aendert alle Instanzen (keine Einzelinstanz-Bearbeitung)
- Kein WKST oder BYMONTHDAY Support
