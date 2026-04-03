# CLAUDE.md — Aregoland

> Einzige Wahrheitsquelle fuer Claude. Stand: 2026-04-03

## Projekt

- App: Arego Chat — P2P Messenger, Spaces, Kalender, World, Pay
- Slogan: "P2P Messenger & Social Media. Kindersicher ab FSK 6 — by Design."
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

- Hetzner, Ubuntu 24.04
- Claude Code arbeitet in: /root/Aregoland
- Domains: aregoland.de (Haupt), .com + .eu leiten weiter
- Nginx Reverse Proxy + Let's Encrypt SSL (alle 3 Domains)
- Signaling-Server: Node.js, Docker, Port 3001
- TURN: coturn, Port 3478/5349
- Repo ist public — Claude AI liest direkt von GitHub

## Datenschutz & Kinderschutz (Regeln)

- Server speichert NIE Inhalte — alles P2P, E2E verschluesselt
- Keine Tracking-Cookies, kein Analytics, keine Werbung
- Identitaet liegt beim Nutzer, nicht beim Server
- FSK-System geplant: Inhalte werden altersgerecht gefiltert
- Kinder-Features: maximaler Schutz, minimale Daten

## Roadmap-Workflow

Die Roadmap lebt im Aregoland Official Space (SpacesScreen.tsx, hardcoded).
Sie hat drei Abschnitte: "Bereits fertig", "In Arbeit", "Geplant".

- Aras arbeitet Features mit Claude AI (claude.ai) aus, oft am Handy
- Claude AI sortiert neue Ideen in "Geplant" oder "In Arbeit" ein
- Claude AI bereitet eine Info vor, die Aras am PC an Claude Code weitergibt
- Claude Code aktualisiert dann die Roadmap im Code
- Wenn Aras bestaetigt, dass ein Feature funktioniert → Claude Code verschiebt es nach "Bereits fertig"
- Claude Code fuegt NIE selbst Items hinzu — nur auf Anweisung von Aras

## Regeln fuer Claude AI (claude.ai)

Aras ist Visionaer, kein Entwickler. Claude Code kennt die Codebase.
Deshalb gilt fuer Claude AI:

- KEINE Rueckfragen zu Design, Farben, Position, Texten oder UX-Details.
  Aras beschreibt was er will, Claude AI formuliert die Aufgabe. Fertig.
- KEINE Code-Snippets, keine Dateiinhalte anfordern (find, cat etc.).
  Claude Code weiss wo alles liegt.
- KEINE technischen Optionen auflisten ("Soll es X oder Y sein?").
  Entscheide selbst was am besten passt. Aras korrigiert wenn noetig.
- Aufgaben fuer Claude Code so formulieren:
  1. Was soll gebaut/geaendert werden (kurz, klar)
  2. Wie soll es sich verhalten (Nutzer-Perspektive)
  3. Fertig. Keine Codestruktur, keine Dateipfade, keine Implementierungsdetails.
- Wenn Aras etwas bereits erklaert hat, nicht nochmal nachfragen.
  Im Zweifel: einfach machen, Aras gibt Feedback.
- Claude AI darf vorher nachfragen um die Aufgabe zu verstehen,
  und eigene Vorschlaege machen. Erst danach Aufgabe fuer CC formulieren.

## Regeln fuer Claude Code

- Neue i18n-Keys NUR auf Deutsch erstellen
- Keine Emojis in Quellcode-Strings (Vite HMR bricht sonst)
- Nach jeder Session: diese CLAUDE.md aktualisieren + committen
- Aras gibt vor, was gebaut wird — Claude Code braucht keine Roadmap
