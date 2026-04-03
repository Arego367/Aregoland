# CLAUDE.md — Aregoland

> Einzige Wahrheitsquelle fuer Claude. Stand: 2026-04-03

## Projekt

- App: Arego Chat — P2P Messenger, Spaces, Kalender, World, Pay
- GitHub: https://github.com/Arego367/aregoland (privat, AGPL-3.0)
- Besitzer: Aras — Visionaer & Stratege, kein Entwickler. CC setzt um.
- Ziel: Kostendeckend, nicht gewinnorientiert. ~1 Euro/Monat pro Konto.

## Stack

- React 18 + TypeScript + Vite + Tailwind CSS v4 + Motion + Radix UI
- pnpm als Package Manager
- i18next (DE primaer, EN + LT vorhanden)
- vite-plugin-pwa (PWA, offline-faehig)

## Struktur

- Komponenten: /src/app/components/
- Typen: /src/app/types.ts
- Auth: /src/app/auth/
- P2P: /src/app/lib/
- i18n: /src/i18n/locales/{de,en,lt}.json

## Befehle

- Dev: pnpm dev
- Build: pnpm build
- Tests: npx playwright test

## Infrastruktur

- Hetzner, Ubuntu 24.04, IP: 46.225.115.51
- Claude Code arbeitet in: /root/Aregoland
- Domains: aregoland.de (Haupt), .com + .eu leiten weiter
- Nginx Reverse Proxy + Let's Encrypt SSL (alle 3 Domains)
- Signaling-Server: Node.js, Docker, Port 3001
- TURN: coturn, Port 3478/5349
- Sync: git post-commit Hook -> rclone -> Google Drive

## Datenschutz & Kinderschutz (Regeln)

- Server speichert NIE Inhalte — alles P2P, E2E verschluesselt
- Keine Tracking-Cookies, kein Analytics, keine Werbung
- Identitaet liegt beim Nutzer, nicht beim Server
- FSK-System geplant: Inhalte werden altersgerecht gefiltert
- Kinder-Features: maximaler Schutz, minimale Daten

## Regeln fuer Claude Code

- Neue i18n-Keys NUR auf Deutsch erstellen
- Keine Emojis in Quellcode-Strings (Vite HMR bricht sonst)
- Nach jeder Session: diese CLAUDE.md aktualisieren + committen
- Aras gibt vor, was gebaut wird — Claude Code braucht keine Roadmap
