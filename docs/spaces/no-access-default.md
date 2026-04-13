# Kein-Zugriff-Standard fuer Subroom-Mitglieder

## Zweck
Neue Subroom-Mitglieder ohne zugewiesene Rolle sehen KEINE Kanaele. Schutz bei Fehlinvites — Moderator muss erst eine Rolle zuweisen.

## Status
`in-arbeit`

## Code-Anker
- **Subroom-Erstellung:** `src/app/components/SpacesScreen.tsx` — `handleCreateSubroom` (readRoles/writeRoles ohne "guest")
- **Kanal-Filter:** `src/app/components/SpacesScreen.tsx` — Subroom-View filtert Kanaele nach `myRole`
- **Empty-State:** Lock-Icon + Hinweistext wenn keine Kanaele sichtbar

## Verhalten
| Kontext | Default fuer neue Mitglieder |
|---------|------------------------------|
| Space-Level-Kanaele | Unveraendert — guest sieht Kanaele wie bisher |
| Subroom-Kanaele | KEIN Zugriff ohne explizite Rollenzuweisung |

## Datenfluss
1. Neues Subroom-Mitglied beitritt → role = "guest"
2. Subroom-Kanal readRoles enthaelt NICHT "guest"
3. Kanal-Filter blendet Kanaele aus → Empty-State angezeigt
4. Moderator weist Rolle zu → Kanaele erscheinen je nach Rollen-Mapping

## Abhaengigkeiten
- `docs/spaces/space-management.md` — Basis-Rollensystem
- `docs/spaces/role-permissions-extended.md` — Erweiterte Berechtigungen
