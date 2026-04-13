# Moderator-Selbstausschluss aus Subroom-Kanaelen

## Zweck
Ein Subroom-Moderator (Ersteller) kann sich selbst aus einzelnen Kanaelen im eigenen Subroom ausschliessen. Anwendungsfall: Eltern planen Ueberraschungsparty fuer die Lehrerin — Lehrerin schliesst sich aus dem "Orgateam"-Kanal aus.

## Status
`in-arbeit`

## Code-Anker
- **Interface:** `src/app/components/SpacesScreen.tsx` — `SpaceChannel.excludedMemberIds?: string[]`
- **Sichtbarkeit:** Subroom-Kanal-Filter prueft `excludedMemberIds` VOR Rollen-Check — ausgeschlossene Moderatoren sehen den Kanal nicht
- **UI:** EyeOff/Eye-Buttons in der Subroom-Kanal-Liste (nur fuer Subroom-Ersteller sichtbar)
- **Sync:** `buildSyncPayload` uebertraegt `excludedMemberIds` im Gossip-Protokoll

## Verhalten
| Aktion | Ergebnis |
|--------|----------|
| Moderator schliesst sich aus | Kanal verschwindet aus der Liste, kein Lesen/Schreiben moeglich |
| Moderator schliesst sich wieder ein | Kanal erscheint wieder, voller Zugriff wie zuvor |
| Ausgeschlossener Moderator | Erscheint NICHT in Mitgliederliste des Kanals |

## Regeln
- Nur der Subroom-Ersteller (Moderator) kann sich selbst ausschliessen
- Ausschluss ist jederzeit rueckgaengig machbar
- `excludedMemberIds` wird vor dem Rollen-Check geprueft — hat Vorrang
- Ausgeschlossene Kanaele werden separat angezeigt mit Re-Include-Button

## Abhaengigkeiten
- `docs/spaces/no-access-default.md` — Kein-Zugriff-Standard (ARE-162)
- `docs/spaces/privacy-by-design-subrooms.md` — Privacy by Design (ARE-163)
