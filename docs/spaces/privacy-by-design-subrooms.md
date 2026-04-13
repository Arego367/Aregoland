# Privacy by Design — Subroom-Kanaele

## Zweck
Founder und Admin haben KEINEN automatischen Zugriff auf Subroom-Kanaele. Nur der Subroom-Ersteller (Moderator) sieht alle Kanaele. Alle anderen benoetigen eine explizite Rollenzuweisung.

## Status
`in-arbeit`

## Code-Anker
- **Interface:** `src/app/components/SpacesScreen.tsx` — `SpaceSubroom.creatorId` (neues Feld)
- **Erstellung:** `handleCreateSubroom` — leere readRoles/writeRoles, creatorId gesetzt
- **Sichtbarkeit:** Subroom-Kanal-Filter prueft `isSubroomCreator || ch.readRoles.includes(myRole)`

## Verhalten
| Rolle | Space-Level-Kanaele | Subroom-Kanaele |
|-------|--------------------|-----------------| 
| Founder | Automatisch Vollzugriff | Kein automatischer Zugriff |
| Admin | Automatisch Vollzugriff | Kein automatischer Zugriff |
| Subroom-Ersteller | Je nach Rolle | Automatisch Vollzugriff |
| Custom Role | Je nach readRoles | Je nach readRoles |
| Ohne Rolle | Je nach readRoles | Kein Zugriff (ARE-162) |

## Migration
Bestehende Subrooms ohne `creatorId` behandeln den Ersteller als unbekannt — kein automatischer Vollzugriff fuer existierende Subrooms. Moderator muss sich selbst eine Rolle zuweisen.

## Abhaengigkeiten
- `docs/spaces/no-access-default.md` — Kein-Zugriff-Standard
- `docs/spaces/role-permissions-extended.md` — Erweiterte Berechtigungen
