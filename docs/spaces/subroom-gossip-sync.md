# Subroom-Sync via Gossip-Protokoll

## Zweck
Subrooms werden ueber das Gossip-Protokoll zwischen allen Space-Mitgliedern synchronisiert. Ohne Sync existieren Subrooms nur lokal beim Ersteller.

## Status
`in-arbeit`

## Code-Anker
- **Payload:** `src/app/lib/spaces-api.ts` — `SpaceSyncPayload.subrooms`
- **Builder:** `src/app/components/SpacesScreen.tsx` — `buildSyncPayload()` inkl. Subrooms
- **Sync-Handler:** `src/app/App.tsx` — Subroom-Merge-Logik im `space_sync` Handler
- **Sichtbarkeit:** `SpacesScreen.tsx` — Subrooms nur fuer Mitglieder/Ersteller sichtbar

## Merge-Strategie
| Aspekt | Strategie |
|--------|-----------|
| Neuer Subroom (nur remote) | Wird hinzugefuegt |
| Bestehender Subroom | Config: Last-Write-Wins (createdAt Vergleich) |
| memberIds | Union-Merge (beide Seiten) |
| Channels | Von der autoritaetiven Seite uebernommen |

## Sichtbarkeitsregel
- Nur Mitglieder die in `subroom.memberIds` stehen ODER der `creatorId` entsprechen sehen den Subroom
- Kanal-Zugriff innerhalb des Subrooms bleibt rollenbasiert (ARE-162, ARE-163)

## Abhaengigkeiten
- `docs/spaces/space-sync.md` — Basis-Gossip-Sync
- `docs/spaces/privacy-by-design-subrooms.md` — Privacy by Design
- `docs/spaces/no-access-default.md` — Kein-Zugriff-Standard
