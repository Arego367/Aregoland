# Aregoland / Arego Chat — Dokumentation

> Haupt-Index. Alle Details sind in den verlinkten Dateien.

## Projekt-Info

- **Besitzer**: Aras ([aras.md](aras.md))
- **GitHub**: https://github.com/Arego367/aregoland (privat)
- **Lizenz**: AGPL-3.0
- **Beschreibung**: Arego Chat ist eine moderne Kommunikations- und Organisations-App (Chat, Spaces, Connect, Dokumente, Pay, Kalender).
- **Figma-Quelle**: https://www.figma.com/design/Smf60PFX7V2nopw1QSzsnc/Aregoland
- **Plattform**: PWA (fertig) + Google Play Store + Apple App Store (geplant, Capacitor.js)

## Dokumentation

| Datei | Inhalt |
|-------|--------|
| [architecture.md](architecture.md) | Tech-Stack, Server, Infrastruktur, Nginx, SSL, Signaling |
| [features-done.md](features-done.md) | Alle fertigen Features mit Datum |
| [features-todo.md](features-todo.md) | Roadmap, Nächste Schritte, Offene Punkte |
| [spaces.md](spaces.md) | Spaces Vision, Node-Architektur, alle Konzepte |
| [design.md](design.md) | Design-Richtlinien, Mobile-First, Dark Mode |
| [privacy.md](privacy.md) | Datenschutz-Prinzipien, DSGVO |
| [kinderschutz.md](kinderschutz.md) | FSK-System, Kinder-Vision |
| [geschaeftsmodell.md](geschaeftsmodell.md) | 1 Euro/Jahr, Zielgruppen, Pay-Modul |
| [sprachen.md](sprachen.md) | i18n Übersetzungs-Tracking |
| [aras.md](aras.md) | Persönliches Profil von Aras |
| [world-concept.md](world-concept.md) | World Social Media Konzept, FSK-Feed, Bildschirmzeit |
| [aregoland-vision.md](aregoland-vision.md) | Die grosse Vision: 5 Stufen von Messenger bis Lebensinfrastruktur |
| [business-model.md](business-model.md) | 1 Euro/Monat, UG, Institutionen-Potenzial |
| [eudi-integration.md](eudi-integration.md) | EUDI Wallet Fundament, FSK-Automatik, Zeitplan |

## Arbeitsweise

- **Aras** = Visionär & Stratege, kein Entwickler
- Aras beschreibt die Vision, Claude Code setzt um
- Kein Figma — Claude Code baut direkt
- /docs ist die einzige Wahrheitsquelle
- Claude Code aktualisiert /docs am Ende jeder Session und lädt zu Google Drive hoch

## Sicherheits- & Auth-Konzept

- **Passwordless Authentication**: Keine Passwörter auf dem Server. Authentifizierung über lokale kryptografische Schlüssel.
- Identität liegt beim Nutzer, nicht beim Server.

## Arbeitsregel für Claude Code

> **WICHTIG**: Nach jeder Änderung an der Codebase /docs aktualisieren.
> - Neue Features → `features-done.md` ergänzen
> - Bugfixes → beim betroffenen Feature notieren
> - Erledigte Punkte → mit Datum markieren
> - Neue Ideen/Pläne → `features-todo.md` ergänzen
> - Neue Komponenten/Libraries → in relevantem Dokument eintragen
> - Neue i18n-Keys → NUR auf Deutsch erstellen, `sprachen.md` updaten
> Ziel: /docs ist immer der aktuelle, vollständige Zustand des Projekts.
