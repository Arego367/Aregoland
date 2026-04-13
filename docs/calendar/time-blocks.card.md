# Persoenliche Zeitbloecke

## Zweck
Wochenplan fuer Arbeitszeit, Verfuegbarkeit und Pufferzeiten.
Zeitbloecke werden als Hintergrundfarbe in Week- und Day-View angezeigt.

## Status
`aktiv`

## Code-Anker
- **Typen:** `src/app/types.ts` — `TimeBlock`, `TimeBlockType`
- **UI:** `src/app/components/CalendarScreen.tsx` — TimeBlockEditor Modal, Background-Rendering in Week/Day-Views
- **Storage:** `arego_calendar_time_blocks` localStorage

## Datenfluss
Timer-Icon klicken → TimeBlockEditor Modal → Bloecke hinzufuegen/entfernen → Speichern in localStorage → Week/Day-Views rendern Hintergrundfarben

## TimeBlock-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | string | Eindeutige ID |
| type | TimeBlockType | work, interruptible, buffer, available |
| dayOfWeek | number | 0=Mo, 6=So (Montag-basiert) |
| startTime | string | Startzeit HH:mm |
| endTime | string | Endzeit HH:mm |

## Block-Typen & Farben
| Typ | Farbe | Beschreibung |
|-----|-------|-------------|
| work | Blau (bg-blue-500/10) | Fokus-Arbeitszeit |
| interruptible | Gelb (bg-yellow-500/10) | Unterbrechbare Arbeitszeit |
| buffer | Grau (bg-gray-500/10) | Puffer/Uebergang |
| available | Gruen (bg-green-500/10) | Verfuegbar fuer andere |

## Storage-Keys
- `arego_calendar_time_blocks` — Array der TimeBlock-Objekte

## UI-Elemente
- Timer-Icon im Kalender-Header oeffnet Editor
- Modal mit bestehenden Bloecken (loeschbar) und Hinzufuegen-Formular
- Wochentag-Selector, Zeitbereich, Typ-Auswahl (Pill-Buttons)

## Abhaengigkeiten
- Keine externen Abhaengigkeiten

## Einschraenkungen
- Keine Ueberlappungs-Pruefung
- Verfuegbarkeits-Sharing (opt-in fuer andere) noch nicht implementiert
- Keine Vorlagen/Templates fuer typische Wochenplaene
