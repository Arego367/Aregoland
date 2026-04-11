# Eigene Web-Engine

## Zweck
Unabhaengigkeit von System-Browsern durch eigene WebView-Engine in der nativen App.

## Status
`geplant`

## Code-Anker
- **Aktuell:** `vite.config.ts` — PWA-Konfiguration (nutzt derzeit System-WebView)
- **TWA-Stub:** `android-twa/` — Bisheriger TWA-Ansatz (Chrome-abhaengig)

## Ziel
- App funktioniert im Store ohne installiertes Chrome/Safari
- Eigene WebView (z.B. Tauri wry oder Capacitor mit Custom WebView)
- Vollstaendige Kontrolle ueber Rendering-Engine und Web-APIs

## Optionen
| Engine | Plattform | Beschreibung |
|--------|-----------|-------------|
| wry (Tauri) | Android/iOS/Desktop | Eigene WebView-Bibliothek auf Basis von webkitgtk/WebKit2 |
| Custom WKWebView | iOS | System-WebView, aber App-gebunden |
| Android WebView | Android | System-Komponente, Update-unabhaengig moeglich |

## Abhaengigkeiten
- Nutzt: [Framework-Architektur](architecture.md)

## Einschraenkungen
- Entscheidung abhaengig von Framework-Wahl (Capacitor vs. Tauri)
- WebCrypto API muss in gewaehlter Engine verfuegbar sein
