# Build-Pipeline

## Zweck
Build-Prozess fuer Web, PWA und zukuenftige native Store-Releases.

## Status
`aktiv` (Web/PWA), `geplant` (Native)

## Code-Anker
- **Build-Config:** `vite.config.ts` — Vite Build mit Plugins
- **Package:** `package.json` — Scripts und Abhaengigkeiten
- **Entry:** `index.html` → `src/main.tsx` — HTML-Shell

## Build-Befehle
| Befehl | Zweck |
|--------|-------|
| `pnpm dev` | Entwicklungsserver (localhost:5173) |
| `pnpm build` | Production Build nach `dist/` |
| `npx playwright test` | E2E-Tests |

## Stack
- **Build-Tool:** Vite 6.x
- **Package Manager:** pnpm
- **Framework:** React 18.3.1
- **Styling:** Tailwind CSS v4
- **Animationen:** Motion
- **Komponenten:** Radix UI
- **PWA:** vite-plugin-pwa (Auto-Update, Workbox)

## PWA-Konfiguration
- Manifest: "Arego Chat", Standalone-Modus
- Icons: favicon.ico, apple-touch-icon.png, icon.svg (192x192, 512x512, maskable)
- Theme: Dark (#1D4ED8 Akzent, #0f172a Hintergrund)
- Cache: CacheFirst fuer Bilder, max 4 MiB
- Exclusions: `/ws-signal`, `/code` (nicht gecacht)

## Abhaengigkeiten
- Genutzt von: [Framework-Architektur](architecture.md)

## Einschraenkungen
- Native Build-Pipeline noch nicht implementiert
- Docker-Deployment fuer Server (Node.js Signaling + Nginx)
