# PWA-Kompatibilitaet

## Zweck
Weiterhin PWA-Unterstuetzung fuer Browser-Nutzung parallel zur nativen App.

## Status
`aktiv`

## Code-Anker
- **PWA-Config:** `vite.config.ts` — vite-plugin-pwa mit Workbox-Konfiguration
- **Manifest:** Generiert durch vite-plugin-pwa (Name: "Arego Chat", Display: standalone)
- **Service Worker:** Auto-Update-Strategie (autoUpdate: true)

## Features
- Installierbar als PWA auf Desktop und Mobile
- Offline-Cache fuer statische Assets (Workbox CacheFirst)
- Auto-Update bei neuer Version
- Standalone-Modus (ohne Browser-UI)

## Cache-Strategie
- Statische Assets: CacheFirst, max 4 MiB
- Bilder: CacheFirst (Runtime-Caching)
- Ausgeschlossen: `/ws-signal` (WebSocket), `/code` (dynamisch)

## Abhaengigkeiten
- Genutzt von: [Build-Pipeline](build-pipeline.md)

## Einschraenkungen
- Abhaengig vom System-Browser fuer Rendering
- Push-Benachrichtigungen browser-limitiert
- Wird langfristig durch native App ergaenzt, nicht ersetzt
