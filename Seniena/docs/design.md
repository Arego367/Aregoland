# Design-Richtlinien

## Grundprinzipien

- Mobile-First
- Dark Mode als Standard
- Keine zentralen Passwort-Speicher
- Keine PII auf externen Servern wo vermeidbar

## Code-Konventionen

- Komponenten in `/src/app/components/`
- Typen in `/src/app/types.ts`
- Auth-Logik in `/src/app/auth/`
- P2P-Logik in `/src/app/lib/`
- Mock-Daten in `/src/app/data/`
- Package Manager: **pnpm**
- Keine Emojis in Quellcode-Strings (verursacht Vite HMR "URI malformed")

## i18n-Regel

- Neue i18n-Keys werden **NUR auf Deutsch** erstellt
- Englisch und Litauisch werden spaeter in einem separaten Uebersetzungs-Befehl ergaenzt
- Tracking in [sprachen.md](sprachen.md)

## UI-Screens

- `ChatListScreen`, `ChatScreen`, `PeopleScreen`, `SpacesScreen`
- `ConnectScreen`, `DocumentsScreen`, `DashboardScreen`
- `ProfileScreen`, `QRCodeScreen`, `SettingsScreen`, `WelcomeScreen`
- `ContactDetailModal`, `AddContactModal`, `TabManagementModal`, `ChildProfileScreen`
- `CallOverlay` — Fullscreen Anruf-UI mit Auto-Hide Controls + draggable PiP
- `RegistrationScreen` — 4-Schritte Registrierung
