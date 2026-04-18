# Persoenliche Zeitbloecke

## Zweck
Wochenplan fuer Arbeitszeit, Verfuegbarkeit und Pufferzeiten.
Zeitbloecke werden als Hintergrundfarbe in Week- und Day-View angezeigt.
Jeder Zeitblock kann individuelle Nicht-stören-Einstellungen haben.

## Status
`aktiv`

## Code-Anker
- **Typen:** `src/app/types.ts` — `TimeBlock`, `TimeBlockType`, `TimeBlockReminder`, `DoNotDisturbSettings`, `DndNotificationMode`
- **UI:** `src/app/components/CalendarScreen.tsx` — TimeBlockEditor Modal, SortableBlockItem (aufklappbar zur Bearbeitung), DndSettingsForm, Background-Rendering in Week/Day-Views
- **Storage:** `arego_calendar_time_blocks` localStorage

## Datenfluss
Timer-Icon klicken → TimeBlockEditor Modal → Bloecke hinzufuegen/bearbeiten/entfernen → Speichern in localStorage → Week/Day-Views rendern Hintergrundfarben

## TimeBlock-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | string | Eindeutige ID |
| name | string | Freier Name (z.B. "Arbeit", "Pilates") |
| daysOfWeek | number[] | 0=Mo, 6=So — mehrere Tage moeglich |
| startTime | string | Startzeit HH:mm |
| endTime | string | Endzeit HH:mm |
| isInterruptible | boolean | Unterbrechbar Ja/Nein |
| priority | number | Sortier-Reihenfolge (niedriger = hoehere Prioritaet) |
| bufferBefore | TimeBlockBuffer? | Optionaler Puffer davor (Minuten + Name) |
| bufferAfter | TimeBlockBuffer? | Optionaler Puffer danach (Minuten + Name) |
| doNotDisturb | DoNotDisturbSettings? | Optionale Nicht-stören-Einstellungen |
| reminders | TimeBlockReminder[]? | Mehrere Erinnerungen pro Zeitblock (ARE-261) |
| type | TimeBlockType? | Legacy: work, interruptible, buffer, available |
| dayOfWeek | number? | Legacy: Einzelner Tag |

## DoNotDisturbSettings-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| enabled | boolean | Nicht-stören aktiv |
| allowedContacts | string[] | Kontakt-IDs oder Listen-IDs (list:family etc.) die durchkommen duerfen |
| notificationMode | DndNotificationMode | 'silent' / 'vibration' / 'normal' |
| allowedMessagers? | string[] | Legacy — wird bei Migration nach allowedContacts zusammengefuehrt |
| allowedCallers? | string[] | Legacy — wird bei Migration nach allowedContacts zusammengefuehrt |

## TimeBlockReminder-Felder (ARE-261)
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| preset | enum | none, 5min, 10min, 30min, 1h, custom |
| customMinutes | number? | Benutzerdefinierte Minuten (wenn preset=custom) |

## Block-Typen & Farben
| Typ | Farbe | Beschreibung |
|-----|-------|-------------|
| (alle) | Blau (bg-blue-500/10) | Einheitliche Farbe, Unterscheidung ueber isInterruptible |

## Storage-Keys
- `arego_calendar_time_blocks` — Array der TimeBlock-Objekte

## UI-Elemente
- Timer-Icon im Kalender-Header oeffnet Editor
- Modal mit bestehenden Bloecken (aufklappbar zur Bearbeitung, drag-sortierbar, loeschbar) und Hinzufuegen-Formular
- Klick auf Block klappt Bearbeitungs-Formular auf (alle Felder editierbar + Speichern-Button)
- Nicht-stören: Aufklappbare Pill pro Zeitblock ("Nicht stören Aus/Aktiv")
  - "Wer darf mich erreichen?" — Kontakte-Picker mit Tags/Pills (Einzelkontakte + Listen)
  - Benachrichtigungsmodus: Stumm / Vibration / Normal
- Wochentag-Selector, Zeitbereich, Unterbrechbar-Toggle, Puffer vor/nach

## Abhaengigkeiten
- @dnd-kit (drag & drop)
- lucide-react Icons (BellOff, Bell, Users, etc.)

## Einschraenkungen
- Keine Ueberlappungs-Pruefung
- Verfuegbarkeits-Sharing (opt-in fuer andere) noch nicht implementiert
- Keine Vorlagen/Templates fuer typische Wochenplaene
- Legacy-Daten (allowedMessagers/allowedCallers) werden automatisch nach allowedContacts migriert
