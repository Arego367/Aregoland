# FSK-System

## Zweck
Alterskontrolle nach deutschem FSK-Standard (Freiwillige Selbstkontrolle). Steuert den Zugang zu Features basierend auf der verifizierten Altersstufe.

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/auth/fsk.ts` — FSK-Initialisierung, Verifikation, Feature-Locking
- **Integration:** `src/app/components/SettingsScreen.tsx` — FSK-Verifizierung in Einstellungen
- **Typen:** `src/app/auth/fsk.ts` — `FskLevel` (6|12|16|18), `FskStatus`

## Datenfluss
App-Start → `loadFsk()` → Pruefe Verifikation → Feature-Check per `isFeatureLocked()` → UI sperrt/entsperrt Features

## FSK-Stufen
| Level | Freigeschaltete Features |
|-------|------------------------|
| FSK 6 | Grundfunktionen (eingeschraenkt) |
| FSK 12 | Chat-Liste, Kontakte |
| FSK 16 | Community, erweiterte Features |
| FSK 18 | Alle Features |

## Gesperrte Features (bei niedrigem Level)
- `chatList` — Chat-Uebersicht
- `people` — Kontaktverwaltung
- `community` — Gruppen/Spaces
- `world` — Oeffentliche Inhalte

## Schluessel-Exports
- `FskLevel` — Typ: 6 | 12 | 16 | 18
- `FSK_LOCKED_FEATURES` — Map von Features zu Mindest-FSK-Level
- `initFsk()` / `loadFsk()` / `saveFsk()` — Persistenz
- `isFskVerified()` — Prueft ob Verifikation abgeschlossen
- `isFeatureLocked(feature)` — Prueft ob ein Feature gesperrt ist

## Storage-Keys
- `aregoland_fsk` — FSK-Status (level, verified, method, timestamp)

## Abhaengigkeiten
- Genutzt von: [Spaces](/docs/spaces/space-management.md), [Messaging](/docs/messaging/chat.md), [Contacts](/docs/contacts/contact-management.md)

## Einschraenkungen
- FSK-System ist nicht verhandelbar — Kinderschutz ist Kernprinzip
- Verifikationsmethoden: EUDI/Parent-Linking (geplant), manuell (aktuell)
- Keine Umgehung moeglich, auch nicht durch Eltern fuer gesperrte Features unter dem Mindestlevel
