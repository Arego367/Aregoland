# Gossip-Protokoll

## Zweck
Synchronisiert Space-Zustaende zwischen Mitgliedern ueber ein verteiltes Gossip-Protokoll mit Konfliktaufloesung.

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/lib/gossip.ts` — Gossip-Engine mit Versions-Tracking und Konfliktaufloesung
- **Integration:** `src/app/components/SpacesScreen.tsx` — Space-Sync ueber Gossip
- **API:** `src/app/lib/spaces-api.ts` — `sendSpaceSync()` fuer Server-seitigen Sync

## Datenfluss
1. Aenderung in einem Space erzeugt neuen Versions-Eintrag (`SpaceVersionMeta`)
2. `buildDigest()` erstellt kompakten Digest aller bekannten Versionen
3. Digest wird an verbundene Peers gesendet
4. Peers vergleichen mit eigenem State und fordern fehlende Updates an (`computeBackfill()`)
5. Konflikte werden per Rolle aufgeloest: Founder > Admin > Guest, dann Version > Timestamp

## Schluessel-Exports
- `SpaceVersionMeta` — Versions-Metadaten (version, authorId, role, timestamp)
- `SpaceVersionStore` — Persistenter Versions-Speicher
- `SeenSet` — Deduplizierung gesehener Nachrichten
- `resolveConflict()` — Rollenbasierte Konfliktaufloesung
- `buildDigest()` / `computeBackfill()` — Sync-Logik
- `randomBackfillDelay()` — Jitter zur Vermeidung von Sync-Stuermen

## Abhaengigkeiten
- Nutzt: [WebRTC](webrtc.md)
- Genutzt von: [Spaces](/docs/spaces/space-sync.md)

## Einschraenkungen
- Kein zentraler State — alle Daten verteilt bei den Peers
- Konfliktaufloesung ist deterministisch aber nicht reversibel
