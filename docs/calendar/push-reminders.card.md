# Push-Benachrichtigungen via Service Worker

## Zweck
Kalender-Erinnerungen die auch bei geschlossenem Browser-Tab funktionieren,
durch Nutzung des Service Workers statt setTimeout.

## Status
`aktiv`

## Code-Anker
- **Service Worker:** `src/sw.ts` — Notification-Handler, IndexedDB-Speicher, Lifecycle-Events
- **Scheduler:** `src/app/lib/reminder-scheduler.ts` — Main-Thread API (scheduleReminder, cancelReminder, checkReminders)
- **Integration:** `src/app/components/CalendarScreen.tsx` — nutzt scheduleSWReminder statt setTimeout
- **PWA-Config:** `vite.config.ts` — injectManifest-Modus fuer Custom-SW

## Datenfluss
Event speichern → `scheduleSWReminder()` → `postMessage` an SW → SW speichert in IndexedDB → SW feuert `showNotification()` zum Zeitpunkt

## Architektur
| Komponente | Verantwortung |
|-----------|---------------|
| `src/sw.ts` | IndexedDB CRUD, Timer-Management, Notification-Display |
| `reminder-scheduler.ts` | Main-Thread Wrapper, SW-Kommunikation, Fallback fuer Nicht-SW |
| CalendarScreen | Ruft scheduleReminder/cancelReminder bei CRUD auf |

## IndexedDB Schema
- **DB:** `aregoland_reminders`
- **Store:** `reminders` (keyPath: `eventId`)
- **Felder:** eventId, title, body, fireAt (Unix ms)

## Reminder-Zeitpunkte
- Events: 10 Min, 30 Min, 1 Std, 1 Tag vorher, benutzerdefiniert
- Zeitbloecke: 5 Min, 10 Min, 30 Min, 1 Std vorher, benutzerdefiniert
- Geburtstage: 1 Tag, 1 Woche vorher, benutzerdefiniert

## Multi-Reminder (ARE-261)
- Jedes Event, jeder Zeitblock und jeder Geburtstag kann mehrere Erinnerungen haben
- `scheduleReminder()` iteriert ueber `reminders[]`-Array und erstellt je einen SW-Timer
- ID-Schema: `{eventId}` fuer erste Erinnerung, `{eventId}:r{index}` fuer weitere
- `cancelReminder()` loescht alle Varianten r0..r9

## Fallback
- Ohne Service Worker: automatischer Fallback auf setTimeout (max 24h, nur bei offenem Tab)

## Abhaengigkeiten
- `vite-plugin-pwa` (injectManifest-Modus)
- `workbox-precaching` (im SW fuer Asset-Caching)

## Einschraenkungen
- Browser kann SW jederzeit beenden — Timer-Cap bei 5 Min sorgt fuer regelmaessiges Aufwachen
- Keine Server-seitigen Push-Daten (Privacy-First)
- Notification-Permission muss vom Nutzer erteilt werden
