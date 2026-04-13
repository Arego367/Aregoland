# Rollen-Transparenz-Anzeige pro Kanal

## Zweck
Jedes Mitglied soll in einem Kanal sehen koennen welche Rollen Lese- und Schreibzugriff haben. Keine versteckten Beobachter — vollstaendige Transparenz.

## Status
`in-arbeit`

## Code-Anker
- **Interface:** `src/app/components/SpacesScreen.tsx` — `SpaceChannel.readRoles` / `SpaceChannel.writeRoles`
- **UI (Kanal-Header):** Shield-Button im Channel-Header oeffnet ein animiertes Transparenz-Panel mit Lese- und Schreib-Badges
- **UI (Kanal-Liste):** Rollen-Badges unter Kanal-Namen (Space-Level und Subroom-Level) wenn keine letzte Nachricht vorhanden
- **Rollen-Aufloesung:** Custom-Rollen werden aus `selectedSpace.customRoles` aufgeloest und mit deren Farbe dargestellt

## Verhalten
| Element | Beschreibung |
|---------|-------------|
| Shield-Button (Header) | Toggle fuer das Rollen-Info-Panel im geoeffneten Kanal |
| Lese-Badges (blau) | Zeigen welche Rollen Lesezugriff haben |
| Schreib-Badges (gruen) | Zeigen welche Rollen Schreibzugriff haben |
| Custom-Role-Farben | Badges nutzen die Farbe der Custom-Role wenn definiert |
| Ausgeschlossene Mitglieder | Anzahl der via excludedMemberIds ausgeschlossenen Mitglieder wird angezeigt |
| Kanal-Listen-Badges | Rollen-Badges als Vorschau unter Kanal-Name (wenn keine letzte Nachricht vorhanden) |

## Regeln
- founder/admin werden in den Listen-Badges herausgefiltert (haben impliziten Zugriff)
- Custom-Rollen werden mit ihrem definierten Farbwert dargestellt
- Panel schliesst sich automatisch beim Verlassen des Kanals
- Transparenz-Panel ist fuer alle Mitglieder sichtbar (nicht nur Admins)

## Abhaengigkeiten
- `docs/spaces/no-access-default.md` — Kein-Zugriff-Standard (ARE-162)
- `docs/spaces/privacy-by-design-subrooms.md` — Privacy by Design (ARE-163)
