# Abo-System (Identity-Kontext)

## Zweck
Verwaltung des Nutzer-Abos als Teil der Identitaet (Trial, Bezahlt, Abgelaufen).

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/auth/subscription.ts` — Abo-Status, Plaene, Zugangskontrolle
- **UI:** `src/app/components/SettingsScreen.tsx` — Abo-Verwaltung in Einstellungen

## Datenfluss
App-Start → `loadSubscription()` → `getEffectiveStatus()` → Feature-Zugang pruefen via `hasAccess()`

## Plaene
| Plan | Preis | Laufzeit |
|------|-------|----------|
| Monthly | 1 EUR | 1 Monat |
| Quarterly | 2 EUR | 3 Monate |
| Biannual | 4 EUR | 6 Monate |
| Yearly | 8 EUR | 12 Monate (33% Rabatt) |

Trial: 7 Tage kostenlos nach Registrierung.

## Schluessel-Exports
- `SubStatus` — Typ: trial | active | expired
- `PLANS` — Array aller verfuegbaren Plaene
- `initSubscription()` — Startet Trial bei Registrierung
- `hasAccess()` — Prueft ob Nutzer Zugang hat
- `getEffectiveStatus()` — Berechnet aktuellen Status (inkl. Trial-Ablauf)
- `setAutoRenew()` — Auto-Verlaengerung an/aus

## Storage-Keys
- `aregoland_subscription` — Abo-Daten (Plan, Status, Start, Ende, AutoRenew)

## Abhaengigkeiten
- Genutzt von: [Account](/docs/account/subscription.md)

## Einschraenkungen
- Lokal gespeichert — keine Server-seitige Validierung (Vertrauensbasis)
- Payment-Integration noch nicht implementiert (lokal simuliert)
