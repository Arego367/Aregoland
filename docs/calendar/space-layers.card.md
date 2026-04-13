# Kalender-Layer pro Space

## Zweck
Space-Events (SpacePost mit badge=event) als farbkodierte Layer im Kalender anzeigen.
Jeder Space erscheint als eigener togglebarer Layer.

## Status
`aktiv`

## Code-Anker
- **Typen:** `src/app/types.ts` — `CalendarLayer` Interface
- **UI:** `src/app/components/CalendarScreen.tsx` — Layer-Toggle, Space-Event-Integration
- **Datenquelle:** `aregoland_spaces` localStorage → SpacePost mit `badge: "event"`

## Datenfluss
Spaces laden → Posts mit `badge=event` filtern → CalendarLayer-Objekte erzeugen → Toggle-State in `arego_calendar_layers` localStorage → sichtbare Layer-Events in eventsMap mergen → Views rendern

## CalendarLayer-Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| spaceId | string | Space-ID |
| spaceName | string | Space-Name (fuer Anzeige) |
| color | string | Space-Farbe |
| visible | boolean | Layer ein-/ausgeblendet |

## Space-Event Mapping
SpacePost-Felder werden auf CalendarEvent gemappt:
- `title` → `[SpaceName] PostTitle`
- `eventDate` → `date`
- `eventTime` → `startTime`
- `eventLocation` → `note` (mit Pin-Emoji)
- Space-Farbe → naechste verfuegbare Kalender-Farbe

## Storage-Keys
- `arego_calendar_layers` — Array der Layer-Toggle-States
- `aregoland_spaces` — Quelle fuer Space-Events (readonly)

## UI
- Layer-Button (Layers-Icon) im Kalender-Header, nur sichtbar wenn Spaces mit Events existieren
- Dropdown-Panel mit Toggles pro Space, farbkodiert
- Checkbox-Toggle fuer Sichtbarkeit

## Abhaengigkeiten
- Spaces-System (`aregoland_spaces` localStorage)

## Einschraenkungen
- Space-Events sind read-only im Kalender (Bearbeitung nur im Space)
- Keine Erinnerungen fuer Space-Events
- Dauer wird pauschal als 1h angenommen (keine Duration in SpacePost)
