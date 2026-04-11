# Abo-Verwaltung

## Zweck
Verwaltung des Nutzer-Abonnements (Trial, bezahlte Plaene, Verlaengerung) im Account-Bereich.

## Status
`aktiv`

## Code-Anker
- **Logik:** `src/app/auth/subscription.ts` — Plan-Definitionen, Status-Berechnung, Zugangslogik
- **UI:** `src/app/components/SettingsScreen.tsx` — Abo-Verwaltung in Einstellungen

## Plaene
| Plan | Preis | Laufzeit | Rabatt |
|------|-------|----------|--------|
| Monthly | 1 EUR | 1 Monat | — |
| Quarterly | 2 EUR | 3 Monate | 33% |
| Biannual | 4 EUR | 6 Monate | 33% |
| Yearly | 8 EUR | 12 Monate | 33% |

Standard-Trial: 7 Tage kostenlos.

## Schluessel-Exports
- `SubStatus` — trial | active | expired
- `PlanType` — monthly | quarterly | biannual | yearly
- `PLANS` — Alle verfuegbaren Plan-Optionen
- `hasAccess()` — Prueft ob Nutzer aktiven Zugang hat
- `setAutoRenew()` — Automatische Verlaengerung steuern
- `formatDateDE()` / `daysUntil()` — Hilfsfunktionen fuer Abo-Anzeige

## Abhaengigkeiten
- Nutzt: [Identity Subscription](/docs/identity/subscription.md)

## Einschraenkungen
- Payment-Integration noch nicht implementiert (lokal simuliert)
- Keine Server-seitige Validierung des Abo-Status
