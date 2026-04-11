# Elternkontrolle

## Zweck
Ermoeglicht Eltern/Verwaltern die Ueberwachung und Steuerung der Kinder-Accounts.

## Status
`in-arbeit`

## Code-Anker
- **Verwalter-Logik:** `src/app/auth/identity.ts` — `getVerwalter()`, `setKindStatus()`
- **FSK-Integration:** `src/app/auth/fsk.ts` — Feature-Locking basierend auf Kind-Status
- **Settings-UI:** `src/app/components/SettingsScreen.tsx` — Kind-Account-Verwaltung in Einstellungen

## Datenfluss
Verwalter-Account → Pruefe `isChildAccount()` auf Ziel → Steuere Features via FSK-Level → Kind sieht nur freigegebene Features

## Geplante Features
- Dashboard fuer Verwalter mit Uebersicht aller Kinderkonten
- Zeitlimits und Nutzungszeiten
- Kontakt-Freigabe durch Verwalter
- Benachrichtigungen bei verdaechtigen Aktivitaeten

## Abhaengigkeiten
- Nutzt: [FSK-System](fsk-system.md), [Kinderprofile](child-profiles.md)
- Nutzt: [Identity](/docs/identity/registration.md)

## Einschraenkungen
- Elternkontrolle darf Privacy des Kindes nicht vollstaendig aufheben
- Keine Inhaltsueberwachung (E2E-Verschluesselung bleibt intakt)
- Kontrolle beschraenkt sich auf Feature-Zugang und Kontakt-Management
