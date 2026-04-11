# Chat (1:1 Nachrichten)

## Zweck
Echtzeit-Textnachrichten zwischen zwei Kontakten ueber P2P-Verbindung.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/ChatScreen.tsx` — Chat-Ansicht mit Nachrichten-Eingabe, Medien-Upload, Anruf-Buttons
- **Liste:** `src/app/components/ChatListScreen.tsx` — Chat-Uebersicht mit Unread-Counter
- **Logik:** `src/app/lib/chats.ts` — Persistenz (localStorage), Nachrichten-History, Pending-Queue
- **Typen:** `src/app/types.ts` — `StoredMessage`, `PersistedChat`

## Datenfluss
Nachricht eingeben → `savePendingMessage()` → P2P-Crypto verschluesseln → WebRTC DataChannel senden → Empfaenger entschluesselt → `saveHistory()` → UI-Update

## Schluessel-Exports
- `loadPersistedChats()` / `savePersistedChat()` — Chat-Liste laden/speichern
- `loadHistory()` / `saveHistory()` — Nachrichten-Verlauf pro Raum
- `savePendingMessage()` / `loadPendingMessages()` / `removePendingMessages()` — Offline-Queue
- `updateMessagesStatus()` — Zustellstatus aktualisieren
- `clearChatUnread()` / `incrementChatUnread()` / `getTotalUnread()` — Unread-Zaehler

## Storage-Keys
- `aregoland_chats` — Chat-Liste (PersistedChat[])
- `aregoland_history_{roomId}` — Nachrichtenverlauf pro Raum
- `aregoland_pending_{roomId}` — Noch nicht zugestellte Nachrichten

## Abhaengigkeiten
- Nutzt: [P2P Network](/docs/p2p-network/webrtc.md), [E2E-Verschluesselung](/docs/p2p-network/e2e-encryption.md)
- Genutzt von: [Spaces](/docs/spaces/space-management.md)

## Einschraenkungen
- Keine Server-Speicherung — Verlauf nur lokal im Browser (localStorage)
- Offline-Nachrichten werden bei naechster Verbindung nachgeliefert (Pending-Queue)
- FSK-Filter bei Medien-Anhaengen
