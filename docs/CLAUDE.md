# CLAUDE.md — Aregoland

> Einzige Wahrheitsquelle fuer Claude. Stand: 2026-04-05

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

### Missbrauchsschutz & Anonymitaet

- Aregoland speichert bei verifizierten Nutzern nur einen anonymen EUDI-Hash — keinen Namen, keine Adresse, keine persoenlichen Daten
- Bei Polizei-Meldungen wird nur der EUDI-Hash weitergegeben
- Die Polizei fragt die EUDI-Behoerde direkt nach Personalien — Aregoland erfaehrt nie die echte Identitaet
- Selbst bei einem Server-Hack sind keine personenbezogenen Daten abrufbar
- Aregoland ist der Briefkasten — wir leiten weiter, wissen selbst nichts

## Roadmap-Workflow

Die Roadmap lebt im Aregoland Official Space (SpacesScreen.tsx, hardcoded).
Sie hat drei Abschnitte: "Bereits fertig", "In Arbeit", "Geplant".

- Aras arbeitet Features mit Claude AI (claude.ai) aus, oft am Handy
- Claude AI sortiert neue Ideen in "Geplant" oder "In Arbeit" ein
- Claude AI bereitet eine Info vor, die Aras am PC an Claude Code weitergibt
- Claude Code aktualisiert dann die Roadmap im Code
- Wenn Aras bestaetigt, dass ein Feature funktioniert → Claude Code verschiebt es nach "Bereits fertig"
- Claude Code fuegt NIE selbst Items hinzu — nur auf Anweisung von Aras

## EUDI Wallet — UX-Anforderungen

- Fehlermeldungen beim Ausweis-Scan muessen immer Grund + naechsten Schritt anzeigen
- Automatische Erkennung ob Ausweis kompatibel ist (z.B. Ausstellungsdatum) — kein stummes Scheitern
- Vorbild: Ausweisapp — reibungslos, klar, kein Raten fuer den Nutzer

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

### Einmal gebaut, nie wieder angefasst

- Jedes Feature wird von Anfang an zukunftssicher und skalierbar gebaut —
  kein Quick-Fix, kein "reicht erstmal"
- Wenn Claude AI oder CC eine bessere Loesung sieht als die angefragte,
  muss sofort ein Gegenvorschlag gemacht werden — bevor angefangen wird
- Kein System das spaeter komplett neu gebaut werden muss weil es nicht
  skaliert, nicht sicher ist oder Architektur-Probleme hat
- Doppelt-gemoppelt ist verboten

### App-Check via Chrome

- Vor jedem Screenshot immer Hard Refresh (Ctrl+Shift+R) machen, nie normalen Refresh
- Wenn Claude AI etwas als Bug erkennt: erst Aras fragen ob es wirklich ein Bug ist —
  erst nach Bestaetigung in den Support-Chat schicken
- Wenn ein Bug bestaetigt ist und Claude AI ihn in den Aregoland Support-Chat schreibt,
  muss am Ende des Textes immer stehen: "Issue von Claude AI hinzugefuegt per App"

## Spracherweiterung

Ziel: Alle EU-Sprachen + Sprachen der Menschen die in der EU leben
(inkl. Schweiz, UK, Norwegen etc.)

Regel: Wenn Aras eine Aufgabe "Sprache erweitern" gibt:
1. Erst alle vorhandenen Sprachen auf Vollstaendigkeit pruefen (Vergleich mit de.json)
2. Fehlende Keys ergaenzen
3. Wenn noch genug Tokens frei → neue Sprache hinzufuegen
4. Neue i18n-Keys NUR auf Deutsch erstellen (bestehende Regel)

Geplante Sprachen (Prioritaet):
DE, EN, LT bereits vorhanden → als naechstes: PL, FR, IT, ES,
PT, NL, SV, DA, FI, NO, CS, SK, HU, RO, BG, HR, SL, ET, LV,
EL, MT + CH-Varianten (DE/FR/IT)

## Regeln fuer Claude Code

- Neue i18n-Keys NUR auf Deutsch erstellen
- Keine Emojis in Quellcode-Strings (Vite HMR bricht sonst)
- Nach jeder Aufgabe: git commit + git push + pnpm build (Aras prueft sofort im Browser)
- Nach jeder Session: diese CLAUDE.md aktualisieren + committen
- Aras gibt vor, was gebaut wird — Claude Code braucht keine Roadmap

### GitHub Issues Workflow

- GitHub Issues regelmaessig pruefen (gh issue list)
- Issues MIT dem Text "Issue von Claude AI hinzugefuegt per App" → automatisch ausfuehren
- Issues OHNE diesen Text → im Chat ausgeben und Aras nach Bestaetigung fragen,
  nicht automatisch ausfuehren
- Issues die grosse Aenderungen oder neue Features beinhalten →
  immer Aras fragen, auch wenn der Vertrauenstext vorhanden ist
