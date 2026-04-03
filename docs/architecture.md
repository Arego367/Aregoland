# Architektur & Infrastruktur

## Tech-Stack

- React 18 + TypeScript
- Vite (Build + Dev-Server)
- Tailwind CSS v4
- Motion (Animationen)
- Radix UI (Primitives)
- vite-plugin-pwa (Service Worker)
- i18next + react-i18next (Internationalisierung)
- pnpm (Package Manager)

## Projektstruktur

- Komponenten: `/src/app/components/`
- Typen: `/src/app/types.ts`
- Auth-Logik: `/src/app/auth/`
- P2P-Logik: `/src/app/lib/`
- Mock-Daten: `/src/app/data/`
- i18n-Dateien: `/src/i18n/locales/{de,en,lt}.json`
- i18n-Config: `/src/i18n/i18n.ts`
- Tests: `tests/` (Playwright)

## Befehle

- Dev-Server: `pnpm dev`
- Build: `pnpm build`
- Tests: `npx playwright test`

## Server & Infrastruktur

- Hetzner Server, Ubuntu 24.04
- Claude Code arbeitet in `/root/Aregoland`

## Domains

- aregoland.de (Hauptdomain)
- aregoland.com, aregoland.eu — alle leiten auf aregoland.de weiter

## Nginx Reverse Proxy

- Nginx 1.24 auf Port 80 + 443 (SSL-Terminierung)
- HTTP -> HTTPS Redirect (alle Domains)
- Alle Neben-Domains + www -> `https://aregoland.de` (301)
- Statische Dateien aus `/root/Aregoland/dist/` (Prod-Build)
- SPA-Fallback: `try_files $uri $uri/ /index.html`
- Assets mit 1 Jahr Cache (`/assets/`, immutable)
- Service Worker + Manifest ohne Cache (no-store)
- Proxy: `/ws-signal` + `/code` -> Signaling (127.0.0.1:3001)
- Config: `/etc/nginx/sites-available/aregoland`

## SSL

- Let's Encrypt Zertifikate fuer alle 6 Domains (aregoland.de/com/eu + www)
- Automatische Erneuerung via certbot

## Signaling-Server v4

- Node.js WebSocket Server (Port 3001, Docker)
- Kurzcode-Store (In-Memory, TTL 1h, single-use)
- Presence-System (Online/Offline Push-Updates)
- Inbox-Rooms mit Offline-Pufferung (24h TTL)
- Space-Chat-Rooms (`space-chat:` Prefix, bis 500 Peers, Offline-Pufferung)
- Blindes Relay — Server liest keine Nachrichteninhalte
- Auto-Start via systemd + Docker (`start.sh`, `arego-signaling.service`)
- Dockerfile vorhanden

## TURN-Server (coturn)

- coturn auf Port 3478 (UDP+TCP) und 5349 (TLS)
- HMAC-basierte time-limited Credentials (use-auth-secret, 24h TTL)
- ICE-Konfiguration: STUN (Google) + 3 TURN-Eintraege (UDP, TCP, TLS)
- systemd Service, startet automatisch nach Reboot
- Verbindungsrate: nahezu 100% (vorher ~85-90% wegen symmetrischer NATs)

## PWA (Progressive Web App)

- `vite-plugin-pwa` mit Workbox Service Worker (autoUpdate)
- Web App Manifest: Name "Arego", Standalone-Modus, Portrait, Theme-Color #1D4ED8
- Icons: 192x192, 512x512 (any), 512x512 (maskable), Apple-Touch-Icon 180x180
- Offline-Faehigkeit: App-Shell gecacht
- iOS: `apple-mobile-web-app-capable`, `apple-touch-icon`
- Android: Manifest mit `display: standalone`
- Icon-Quelldateien: `public/icon.svg`, `public/maskable-icon.svg`

## Sonstige Infrastruktur

- `start.sh` — systemd Services fuer Signaling-Server (Docker) + Nginx
- Vite Dev-Server auf 127.0.0.1:5173 (nur intern, fuer Entwicklung)
- Favicon (blaues Chat-Icon)
- Repo ist public — Claude AI liest direkt von GitHub

## Bekannte technische Schulden

- **Mock-QR URL** in `ChildProfileScreen.tsx:235` und `PeopleScreen.tsx:231` — `api.qrserver.com` mit Dummy-Token muss durch echte QR-Generierung ersetzt werden
- **Server-IP hardcoded** in `p2p-manager.ts:75-77` — sollte als `VITE_TURN_HOST` Umgebungsvariable ausgelagert werden
