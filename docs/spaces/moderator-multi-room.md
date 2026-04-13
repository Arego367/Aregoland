# Multi-Raum Moderator-Uebersicht

## Zweck
Moderatoren die mehrere Subrooms verwalten bekommen eine zentrale Uebersicht "Meine Raeume" mit Schnellzugriff auf alle verwalteten Raeume. Strenge Isolation: Inhalte verschiedener Raeume sind in der UI klar getrennt.

## Status
`in-arbeit`

## Code-Anker
- **Interface:** `src/app/components/SpacesScreen.tsx` — `SpaceSubroom.moderatorId` (neues Feld)
- **Tab:** `activeTab === "myRooms"` — neuer Tab in Space-Detail-Ansicht
- **Tile:** `TILE_CONFIG.myRooms` — Kachel auf Uebersichts-Grid (nur sichtbar wenn Moderator)
- **Sync:** `buildSyncPayload` — moderatorId wird via Gossip synchronisiert
- **API-Typ:** `src/app/lib/spaces-api.ts` — `SpaceSyncPayload.subrooms[].moderatorId`

## Verhalten
| Element | Beschreibung |
|---------|-------------|
| Erkennung | Nutzer ist Moderator wenn `creatorId` oder `moderatorId` uebereinstimmt |
| Tab-Sichtbarkeit | "Meine Raeume" nur sichtbar wenn mindestens 1 Raum moderiert wird |
| Pro Raum | Name, Mitglieder-Anzahl, Kanal-Anzahl |
| Schnellzugriff | Kanaele (oeffnet Subroom in Chats-Tab), Mitglieder, Kalender (Platzhalter) |
| Isolation | Jeder Raum als eigene Karte — kein Mischen von Inhalten |

## Datenstruktur
```typescript
interface SpaceSubroom {
  // ... bestehende Felder
  moderatorId?: string; // expliziter Moderator (falls nicht der Ersteller)
}
```
Fallback: Ersteller (`creatorId`) ist immer Moderator.

## Abhaengigkeiten
- `docs/spaces/privacy-by-design-subrooms.md` — Privacy by Design (ARE-163)
- `docs/spaces/moderator-self-exclusion.md` — Moderator-Selbstausschluss (ARE-164)
- `docs/spaces/channel-role-transparency.md` — Rollen-Transparenz (ARE-165)
