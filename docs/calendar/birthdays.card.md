# Geburtstage im Kalender

## Zweck
Geburtstage als eigenen Eintragstyp im Kalender verwalten — manuell oder aus Kontakten importiert.
Jaehrlich wiederkehrend, mit optionaler Altersberechnung und mehreren Erinnerungen.

## Status
`aktiv`

## Code-Anker
- **Typen:** `src/app/types.ts` — `CalendarBirthday`, `BirthdayReminder`, `BirthdayReminderPreset`
- **UI:** `src/app/components/CalendarScreen.tsx` — BirthdayFormModal, Geburtstags-Banner in Day/Week-Views, Import aus Kontakten
- **Erinnerungen:** `src/app/lib/reminder-scheduler.ts` — Multi-Reminder fuer Geburtstage

## Datenfluss
Geburtstag erstellen (manuell oder Kontakt-Import) → localStorage `arego_calendar_birthdays` → Kalender-Views rendern pink hervorgehobene Geburtstags-Eintraege → Erinnerungen via Service Worker

## CalendarBirthday-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | string | Eindeutige ID |
| name | string | Name der Person |
| date | string | Datum im Format MM-DD (jaehrlich wiederkehrend) |
| year | number? | Geburtsjahr (optional, fuer Altersberechnung) |
| contactId | string? | Link zum Kontakt (bei importierten Geburtstagen) |
| note | string? | Optionale Notiz |
| reminders | BirthdayReminder[] | Erinnerungen (Standard: 1 Woche + 1 Tag vorher) |

## BirthdayReminder-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| preset | BirthdayReminderPreset | none, 1day, 1week, custom |
| customMinutes | number? | Benutzerdefinierte Minuten (wenn preset=custom) |

## UI-Elemente
- Kuchen-Icon (Cake) im Kalender-Header oeffnet Geburtstags-Verwaltung
- Formular: Name, Datum (DD.MM.YYYY-Format), optionales Geburtsjahr, Notiz, Erinnerungen
- Import-Funktion: Kontakte mit hinterlegtem Geburtstag koennen importiert werden
- Kalender-Anzeige: Pink hervorgehobene Tage, Geburtstags-Banner in Tages-/Wochenansicht
- Datumsformat-Parser: `parseBirthdayDE()` konvertiert "DD.MM.YYYY" in internes Format

## Storage-Keys
- `arego_calendar_birthdays` — Array der CalendarBirthday-Objekte

## Abhaengigkeiten
- Kontakte (`src/app/auth/contacts.ts`) — fuer Geburtstags-Import
- lucide-react Icons (Cake)

## Einschraenkungen
- Nur lokale Speicherung — kein P2P-Sync
- Kein automatischer Abgleich wenn Kontakt-Geburtstag geaendert wird
- Altersberechnung nur wenn Geburtsjahr angegeben
