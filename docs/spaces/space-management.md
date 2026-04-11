# Space-Verwaltung

## Zweck
Erstellung und Verwaltung von Gruppen-Raeumen (Spaces) mit Mitgliederverwaltung, Rollen und oeffentlicher Registry.

## Status
`aktiv`

## Code-Anker
- **UI:** `src/app/components/SpacesScreen.tsx` — Space-Erstellung, Drag-to-Sort, Mitgliederverwaltung
- **API:** `src/app/lib/spaces-api.ts` — Oeffentliche Space-Registry, Join-Requests, FSK-Codes
- **Gossip:** `src/app/lib/gossip.ts` — Verteilte Zustandssynchronisation

## Datenfluss
Space erstellen → Mitglieder einladen → Gossip-Sync zwischen Mitgliedern → Oeffentliche Spaces optional in Registry registrieren

## Schluessel-Exports
- `PublicSpace` — Typ fuer oeffentliche Spaces
- `registerPublicSpace()` / `unregisterPublicSpace()` — Registry-Verwaltung
- `searchPublicSpaces()` / `fetchPublicTags()` — Suche und Tags
- `sendJoinRequest()` / `fetchJoinRequests()` / `respondJoinRequest()` — Beitrittsprozess
- `maybeHeartbeat()` — Periodischer Heartbeat fuer aktive Spaces
- `redeemFskCode()` / `maybeFskHeartbeat()` — FSK-Verifikation fuer Spaces

## Rollen
- **Founder** — Ersteller, hoechste Rechte, kann nicht entfernt werden
- **Admin** — Verwaltungsrechte
- **Guest** — Lese-/Schreibrechte, keine Verwaltung

## Abhaengigkeiten
- Nutzt: [Space-Sync](space-sync.md), [P2P Network](/docs/p2p-network/webrtc.md), [FSK-System](/docs/child-safety/fsk-system.md)
- Genutzt von: [Messaging](/docs/messaging/chat.md)

## Einschraenkungen
- FSK-Level bestimmt Zugang zu Spaces (Community-Feature gesperrt unter FSK 16)
- Space-Daten werden nicht zentral gespeichert, nur bei den Mitgliedern
