# Space-Sync

## Zweck
Verteilte Synchronisation von Space-Zustaenden ueber das Gossip-Protokoll zwischen allen Mitgliedern.

## Status
`aktiv`

## Code-Anker
- **Gossip:** `src/app/lib/gossip.ts` — Digest/Backfill-Logik, Konfliktaufloesung
- **API:** `src/app/lib/spaces-api.ts` — `sendSpaceSync()` fuer Server-seitige Koordination
- **UI:** `src/app/components/SpacesScreen.tsx` — Integration der Sync-Logik

## Datenfluss
1. Aenderung im Space → Neue Version erstellt (`SpaceVersionMeta`)
2. Gossip-Digest an verbundene Peers senden
3. Peers vergleichen Digests und fordern fehlende Updates an
4. Konflikte aufgeloest: Version > Rolle (Founder > Admin > Guest) > Timestamp
5. Konvergierter Zustand bei allen Mitgliedern

## Schluessel-Exports
- `sendSpaceSync()` — Sendet Sync-Request an Server
- `loadPendingRequests()` / `savePendingRequest()` / `removePendingRequest()` — Offline-Queue

## Storage-Keys
- `aregoland_spaces_*` — Space-Daten
- `aregoland_space_versions` — Gossip Versions-Metadaten
- `aregoland_pending_requests` — Ausstehende Join-Requests

## Abhaengigkeiten
- Nutzt: [Gossip-Protokoll](/docs/p2p-network/gossip-protocol.md), [WebRTC](/docs/p2p-network/webrtc.md)
- Genutzt von: [Space-Verwaltung](space-management.md)

## Einschraenkungen
- Eventual Consistency — kurzzeitige Divergenz zwischen Peers moeglich
- Konfliktaufloesung ist deterministisch aber nicht umkehrbar
