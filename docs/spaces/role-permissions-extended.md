# Erweiterte Rollen-Berechtigungen

## Zweck
Erweiterung der Custom-Role-Permissions um Kalender-, Abwesenheits- und Push-Berechtigungen fuer Space-Rollen.

## Status
`in-arbeit`

## Code-Anker
- **Interface:** `src/app/components/SpacesScreen.tsx` — `CustomRole.permissions` (Zeile ~140)
- **UI:** `src/app/components/SpacesScreen.tsx` — Rollen-Erstellungs-Panel (Zeile ~5062)

## Neue Berechtigungen
| Feld | Beschreibung |
|------|-------------|
| `manageCalendar` | Kalender-Eintraege erstellen/bearbeiten im Raum |
| `manageSchedule` | Stundenplan bearbeiten (Vorbereitung Phase 4) |
| `reportAbsence` | Krankmeldung/Abwesenheit melden |
| `viewAbsenceDetails` | Details von Abwesenheiten sehen (vs. nur "nicht da") |
| `manageBookingSlots` | Buchungs-Slots erstellen (Vorbereitung Phase 3) |
| `sendPushToAll` | Push-Nachricht an alle Raum-Mitglieder senden |

## Migration
Bestehende Rollen ohne die neuen Felder erhalten automatisch `false` als Default. Die `startEditRole`-Funktion setzt fehlende Felder explizit auf `false` beim Laden.

## Gossip-Sync
Keine zusaetzliche Aenderung noetig — `customRoles` werden bereits als Ganzes im `SpaceSyncPayload` synchronisiert. Die neuen Felder werden automatisch mit uebertragen.

## Abhaengigkeiten
- `docs/spaces/space-management.md` — Basis-Rollensystem
- `docs/spaces/space-sync.md` — Gossip-Synchronisation
