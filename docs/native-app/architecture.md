# Framework-Architektur

## Zweck
Entscheidung und Umsetzung des nativen App-Frameworks (Capacitor vs. Tauri) fuer Store-Releases ohne Browser-Abhaengigkeit.

## Status
`geplant`

## Code-Anker
- **Build-Config:** `vite.config.ts` — Vite 6.x mit React-Plugin, Tailwind, PWA-Plugin
- **Entry:** `src/main.tsx` → `src/app/App.tsx` — React-App-Entry
- **TWA-Stub:** `android-twa/` — Bisheriger Android TWA-Ansatz (wird ersetzt)

## Framework-Optionen

### Capacitor
- Vorteile: Mature, grosse Community, Plugins fuer native APIs
- Nachteile: Nutzt System-WebView (Chrome auf Android, WKWebView auf iOS)
- Bewertung: Akzeptabel, aber nicht voellig unabhaengig von System-Browser

### Tauri
- Vorteile: Eigene WebView (wry), kleiner Footprint, Rust-Backend
- Nachteile: Mobile-Support noch jung, weniger Plugins
- Bewertung: Beste Option fuer vollstaendige Browser-Unabhaengigkeit

## Kernprinzip
Die App bringt ihre eigene Engine mit. Kein Chrome, kein Safari noetig.

## Abhaengigkeiten
- Nutzt: Bestehende Web-Codebase (React + Vite)

## Einschraenkungen
- Entscheidung noch ausstehend
- Android TWA wird als Uebergangsloesung beibehalten
