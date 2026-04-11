# Nachrichten-Speicherung

## Zweck
Lokale Persistierung von Chat-Verlaeufen und Zustellstatus im Browser (localStorage).

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/lib/chats.ts` — Alle Storage-Operationen
- **Typen:** `src/app/types.ts` — `StoredMessage` (id, text, sender, timestamp, status)

## Datenfluss
Nachricht empfangen/gesendet → `saveHistory()` → localStorage `aregoland_history_{roomId}`

## Storage-Keys
- `aregoland_chats` — Persistierte Chat-Liste mit Metadaten (letzter Text, Unread-Count)
- `aregoland_history_{roomId}` — Vollstaendiger Nachrichtenverlauf pro Raum
- `aregoland_pending_{roomId}` — Nachrichten die noch nicht zugestellt wurden
- `aregoland_contact_statuses` — Online/Offline-Status der Kontakte

## Schluessel-Exports
- `deleteAllHistory()` — Loescht gesamten Verlauf (Datenschutz-Feature)
- `deletePersistedChats()` — Loescht Chat-Liste
- `loadContactStatuses()` / `setContactStatus()` — Kontakt-Praesenz

## Abhaengigkeiten
- Genutzt von: [Chat](chat.md)

## Einschraenkungen
- Nur lokale Speicherung — kein Cloud-Backup, kein Sync zwischen Geraeten
- localStorage-Limit des Browsers (typisch 5-10 MB)
- Bei Account-Loeschung wird alles entfernt (`deleteAllHistory()`, `deleteAllPending()`)
