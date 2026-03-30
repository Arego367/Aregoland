# Aregoland / Arego Chat — CLAUDE.md

## Projekt-Info

- **Besitzer**: Aras
- **Lizenz**: AGPL-3.0 — Open Source. Jeder kann den Code sehen und nutzen, aber muss Änderungen ebenfalls unter AGPL-3.0 veröffentlichen. Auch SaaS-Deployments müssen den Quellcode offenlegen.
- **Beschreibung**: Arego Chat ist eine moderne Kommunikations- und Organisations-App (Chat, Spaces, Connect, Dokumente, Pay, Kalender).
- **Figma-Quelle**: https://www.figma.com/design/Smf60PFX7V2nopw1QSzsnc/Aregoland
- **Stack**: React 18 + TypeScript, Vite, Tailwind CSS v4, Motion, Radix UI, pnpm

## Sicherheits- & Auth-Konzept

- **Passwordless Authentication**: Es werden **keine Passwörter auf dem Server gespeichert**. Authentifizierung erfolgt ausschließlich über lokale kryptografische Schlüssel.
- Identität liegt beim Nutzer, nicht beim Server.

## Aktueller Stand (Stand: 2026-03-30)

### Fertig implementiert

**Identität & Registrierung** (`src/app/auth/`)
- WebCrypto ECDSA P-256 Schlüsselgenerierung (`crypto.ts`)
- Arego-ID Ableitung aus öffentlichem Schlüssel: `AC-XXXX-XXXXXXXX` Format (`crypto.ts`)
- Kompletter Registrierungs-Flow mit 4 Schritten: Intro, Name, Schlüssel generieren, QR-Backup (`RegistrationScreen.tsx`)
- QR-Code + Textschlüssel für Wiederherstellung anzeigen und kopieren
- Recovery-Schlüssel: kopierbar via Clipboard UND als .txt Datei downloadbar (`aregoland-recovery-{userId}.txt`)
- Recovery-Payload Import (neues Gerät) via `importFromRecoveryPayload` (`identity.ts`)
- Unicode-safe Base64 Encoding/Decoding (Umlaute, Emojis sicher)
- Identität in `localStorage` speichern/laden/löschen
- QR-Code Screen: Kontakt-QR als PNG downloadbar (`Aregoland-QR-{userId}.png`)

**Wiederherstellung** (`WelcomeScreen.tsx`)
- Recovery-Flow im WelcomeScreen mit 2 Optionen
- Option 1: QR-Code scannen (Kamera-Scanner UI, Placeholder für jsQR-Integration)
- Option 2: Textschlüssel manuell eingeben → `importFromRecoveryPayload()` → Erfolg/Fehler-Handling
- Ladeindikator während Import, rote Fehlermeldung bei ungültigem Schlüssel

**Kontakte** (`src/app/auth/contacts.ts`, `auth/share.ts`)
- Lokaler Kontaktspeicher (nur `localStorage`, kein Server)
- Kontakt teilen via QR-Code (TTL 10 Min, Nonce-geschützt) oder 6-Zeichen-Kurzcode (TTL 1h, single-use)
- Kurzcode-API auf Signaling-Server (`/code` POST/GET)
- Deterministische P2P Room-ID aus zwei Arego-IDs
- Gegenseitiger Kontaktaustausch: `sendReverseIdentity` via Inbox-WebSocket + automatischer P2P-Identitätsaustausch über DataChannel
- In-App Toast + Browser-Notification bei neuem Kontakt (beide Wege: WebSocket + DataChannel)
- `AddContactModal.tsx` — UI für Kontakt hinzufügen (Kurzcode + QR)

**P2P Chat E2E-Verschlüsselt** (`src/app/lib/`)
- Ephemeres ECDH P-256 Key-Exchange im WebRTC-Handshake (`p2p-crypto.ts`)
- AES-GCM 256-bit Nachrichtenverschlüsselung (`p2p-crypto.ts`)
- `P2PManager` Klasse: verwaltet mehrere gleichzeitige WebRTC-Verbindungen (`p2p-manager.ts`)
- Verbindungen bleiben aktiv auch wenn ChatScreen geschlossen — Nachrichten kommen immer an
- WebRTC STUN + TURN (coturn) — Relay für Nutzer hinter symmetrischen NATs
- Automatische Reconnection bei Verbindungsabbruch (5s Delay)
- P2P-Chat in `ChatScreen` eingebaut mit `deriveRoomId()` für echte Kontakte

**Chat-Funktionen**
- Chat-Verlauf in localStorage gespeichert (max 500 Nachrichten pro Room)
- Chat-Liste zeigt echte Kontakt-Chats, Live-Update bei neuen Nachrichten
- Ungelesene Nachrichten: Badge in Chat-Liste + Dashboard Chat-Kachel + Browser-Benachrichtigungen
- In-App Toast-Popup bei neuer Nachricht wenn Chat nicht offen
- Offline Message Queue: Nachrichten werden lokal als "pending" gespeichert (Uhr-Icon) und automatisch gesendet wenn Empfänger online kommt
- Emoji Picker (`@emoji-mart/react`) — Dark Theme, deutsch, Cursor-Position-Insert
- Fotos & Dateien senden: Chunked Base64 über verschlüsselten DataChannel (14KB Chunks, max 5 MB), mit Backpressure-Kontrolle
- Sprachnachrichten: MediaRecorder API (WebM/Opus), gedrückt halten zum Aufnehmen, Audio-Player mit Play/Pause + Fortschrittsbalken + Seek, Blob-URL für Edge-Kompatibilität
- Chat-Suche: Suchfeld im Header, Treffer werden gelb hervorgehoben
- Medien-Galerie: Alle Bilder, Sprachnachrichten und Dokumente eines Chats als Übersicht
- Chat-Hintergrund: 6 Farbverläufe wählbar, pro Chat in localStorage gespeichert
- Chatverlauf löschen mit Bestätigungsdialog

**Audio & Video Anrufe** (`CallOverlay.tsx`)
- WebRTC Audio P2P via separater PeerConnection, Signaling über DataChannel
- WebRTC Video P2P, Remote groß / eigenes Bild klein (PiP)
- PiP frei verschiebbar (Drag & Drop, Startposition unten links)
- Controls Auto-Hide nach 3s bei Video-Anrufen, Tap zum Einblenden
- Erweiterbare `CallControls`-Komponente (vorbereitet für ScreenShare, Effekte etc.)
- Mute/Kamera-Toggle, Auflegen-Button
- Video-Fallback: Wenn Kamera fehlt, nur Audio mit Avatar + Hinweis-Banner
- Eingehende Anrufe: globales Banner auch wenn Chat nicht offen, Annehmen/Ablehnen
- Anruf starten aus Kontakt-Detail-Modal (Audio/Video)

**Kontakt-Management**
- Kontakt entfernen (gegenseitig): Bestätigungsdialog, Signal über Inbox-WS + DataChannel
- Contact-Status-System: `mutual` (beide hinzugefügt) / `pending` (nur einer) / `removed` (entfernt)
- Chat-Sperre bei einseitigem Kontakt: Nachrichten empfangen ja, senden nein, mit Hinweis
- Kontakt-Detail-Modal: Öffnet sich bei Klick auf Name/Avatar im Chat-Header
- Kontakt-Kategorien: Mehrfachauswahl mit Checkboxen (Familie, Freunde, Arbeit, Schule, Kinder, Spaces, Sonstige + benutzerdefinierte)
- Kategorien als Badges unter dem Kontaktnamen
- Kategorien in localStorage persistiert (`arego_contact_categories`)
- Kontakt-Liste + Chat-Liste aktualisieren sich live (reaktive Version-Counter)

**Zentrales Tab/Listen-System**
- Eine zentrale Kategorie-Liste in App.tsx, gespeichert in localStorage (`arego_tabs`)
- Standard-Kategorien: Alle, Familie, Freunde, Arbeit, Schule, Kinder, Spaces, Sonstige
- TabManagementModal (Bleistift-Button): Reihenfolge ändern, ein-/ausblenden (Auge-Toggle), neue Kategorie hinzufügen, benutzerdefinierte löschen
- Synchron in PeopleScreen (Kontakte), ChatListScreen (Chats) und ContactDetailModal (Checkboxen)
- Ausgeblendete Tabs werden in Tab-Leisten nicht angezeigt, bleiben aber als Kategorie-Option

**Online-Status System**
- Presence-Protokoll auf Signaling-Server v4 (`presence_subscribe` / `presence_update`)
- Grüner Punkt = online, grauer Punkt = offline (Chat-Liste + Chat-Header + Kontakt-Liste)
- Online/Offline Text in Kontaktliste (PeopleScreen)
- Multi-Tab-Support: erst offline wenn letzter Tab schließt
- DSGVO: nur aktueller Status im RAM, kein Verlauf, kein Timestamp, bei Disconnect sofort gelöscht

**Signaling-Server v4** (`signaling-server/`)
- Node.js WebSocket Server (Port 3001)
- Dockerfile vorhanden
- Kurzcode-Store (In-Memory, TTL 1h, single-use)
- Presence-System (Online/Offline Push-Updates)
- Inbox-Rooms mit Offline-Pufferung (24h TTL)
- Blindes Relay — Server liest keine Nachrichteninhalte
- Auto-Start via systemd + Docker (`start.sh`, `arego-signaling.service`)

**TURN-Server (coturn)**
- coturn auf Port 3478 (UDP+TCP) und 5349 (TLS) installiert
- HMAC-basierte time-limited Credentials (use-auth-secret, 24h TTL)
- ICE-Konfiguration: STUN (Google) + 3 TURN-Einträge (UDP, TCP, TLS)
- systemd Service, startet automatisch nach Reboot
- Verbindungsrate: nahezu 100% (vorher ~85-90% wegen symmetrischer NATs)

**Kalender Stufe 1** (`CalendarScreen.tsx`) ✅ 2026-03-30
- Drei Ansichten umschaltbar: Monat / Woche / Tag
- Monatsansicht: Kalender-Grid mit farbigen Termin-Pills (Uhrzeit + Titel), max 2 pro Tag, "+X weitere"
- Wochenansicht: 7-Spalten-Zeitstrahl (06:00-21:00)
- Tagesansicht: Zeitstrahl mit Termin-Blöcken, ganztägige Events oben
- Termin erstellen: Titel, Datum, Uhrzeit, Dauer (15min/30min/1h/2h/ganztägig), Erinnerung, 6 Farben, Notiz
- Termin-Detail: Bearbeiten + Löschen mit Bestätigungsdialog
- Erinnerungen via Browser Notification API (innerhalb 24h)
- Daten in localStorage (`arego_calendar_events`)
- `CalendarEvent` Interface in `types.ts`
- Kalender-Kachel auf Dashboard navigiert zu CalendarScreen

**WelcomeScreen** (`WelcomeScreen.tsx`) — bereinigt 2026-03-30
- 3 Buttons: "Loslegen" (Registrierung), "Wiederherstellen" (Recovery), "Kind hinzufügen" (Kind-Konto)
- Sprach-Selector entfernt (kommt mit i18n zurück)
- Wiederherstellen: Info-Screen → QR-Code scannen (Kamera-Placeholder) oder Schlüssel eingeben (funktional)
- Kind hinzufügen: eigener Screen mit Kamera-Scanner für Eltern-QR-Code (Placeholder)
- 5 Views: welcome, restore, restoreScan, restoreKey, child

**Infrastruktur**
- `start.sh` — systemd Services für Signaling-Server (Docker) + Vite Dev-Server
- `arego.bat` — Windows-Batch für SSH + Claude Code
- Vite HTTPS mit `@vitejs/plugin-basic-ssl`, WebSocket-Proxy für `/ws-signal`
- HMR Overlay deaktiviert (`hmr: { overlay: false }`)
- Playwright-Tests (`tests/`) für Video-Call-UI, DataChannel-Delivery, Console-Errors, Unicode-Encoding
- Favicon (blaues Chat-Icon)
- rclone installiert — CLAUDE.md Auto-Sync zu Google Drive via git post-commit Hook
- `sync-claude-md.sh` — manuelles Sync-Script für CLAUDE.md → Google Drive

**UI-Screens**
- `ChatListScreen`, `ChatScreen`, `PeopleScreen`, `SpacesScreen`
- `ConnectScreen`, `DocumentsScreen`, `DashboardScreen`
- `ProfileScreen`, `QRCodeScreen`, `SettingsScreen`, `WelcomeScreen`
- `ContactDetailModal`, `AddContactModal`, `TabManagementModal`, `ChildProfileScreen`
- `CallOverlay` — Fullscreen Anruf-UI mit Auto-Hide Controls + draggable PiP
- `RegistrationScreen` — 4-Schritte Registrierung

---

## Nächste Schritte (Priorität)

1. **Kalender-Modul Stufe 1** ✅ Fertig (2026-03-30)

2. **Recovery-Flow erweitern**
   - QR-Code scannen: jsQR-Bibliothek integrieren für echtes Kamera-Scanning (aktuell nur Placeholder-UI)
   - Datei-Upload: Nutzer wählt gespeicherte `aregoland-recovery-*.txt` Datei aus → `importFromRecoveryPayload()`
   - Textschlüssel eingeben: ✅ bereits implementiert

3. **Kalender-Modul Stufe 2 — Kinder-Integration**
   - Kinder-Profile anlegen (Name, Alter, FSK-Stufe, Avatar)
   - Kind hat eigenen Stundenplan (Schule, Sport, Aktivitäten)
   - Eltern-Kind geteilte Termine (z.B. Kinderarzt erscheint bei beiden)
   - Aufgaben für Kinder: Liste mit Erledigt-Button → Eltern werden benachrichtigt
   - Kinder-Kalender in Eltern-Ansicht einsehbar (Tippen auf Kind → Stundenplan)

4. **Kalender-Modul Stufe 3 — Teilen & P2P**
   - Termine P2P mit Kontakten teilen (verschlüsselt, kein Server)
   - Einladungen mit Annehmen/Ablehnen + optionaler Begründung
   - Frei/Besetzt-Anzeige für Kontakte (nur mit expliziter Freigabe sichtbar)
   - Freigabe-Steuerung: pro Kontakt oder Kategorie (Familie, Arbeit, etc.)

5. **Kalender-Modul Stufe 4 — Spaces-Integration**
   - Spaces haben eigenen Kalender (Firma, Schule, Verein etc.)
   - Termine aus Spaces erscheinen automatisch im Hauptkalender
   - Termin-Einladungen aus Spaces: Annehmen/Ablehnen mit Begründung
   - Schul-Space: Elternabend etc. direkt ins Eltern-Hauptkalender
   - Firmen-Space: Chef sieht nur Frei/Besetzt, keine privaten Details

6. **Kalender-Import/Export**
   - iCal (.ics) Import von Google Calendar, Outlook, Apple Calendar
   - iCal Export (eigene Termine exportieren)

7. **TURN-Server** ✅ Fertig (coturn, 2026-03-30)

8. **Kinderschutz-Features (FSK)** — nach Kinder-Profilen (Stufe 2)
   - Serverseitig: Kinder unter 16 nicht auffindbar/kontaktierbar
   - Kontakt zwischen Kindern nur über gegenseitige Eltern-Zustimmung
   - Medienzeiten basierend auf wissenschaftlichen Empfehlungen (nicht von Eltern änderbar)

9. **Pay-Modul** — noch nicht begonnen

10. **Sprach-Selector (i18n)** — kommt wenn Übersetzungen implementiert werden
    - Sprachauswahl im WelcomeScreen + Einstellungen
    - Alle EU-Sprachen geplant
    - UI-Texte über Übersetzungsdateien laden

## Datenschutz-Grundprinzipien

> **Diese Prinzipien gelten für ALLE zukünftigen Funktionen — keine Ausnahmen.**
> Bei jedem neuen Feature zuerst prüfen: verletzt es eines dieser Prinzipien?

- **DSGVO-konform by Design** — kein Nachbessern, Datenschutz ist von Anfang an eingebaut
- **Server speichert NICHTS** außer: dem Arego-ID-Hash für Routing (kein Klartext, kein Profil)
- **Keine Metadaten** — kein "wer mit wem", kein "wann", kein "wie viel"
- **Keine IP-Adressen** speichern oder loggen
- **Alle Nachrichten, Fotos, Dateien** werden ausschließlich P2P direkt zwischen Geräten übertragen
- **Kein Tracking, keine Analysen, keine Werbung**
- **Nutzer löscht App = alles weg** — nichts bleibt auf dem Server
- **E2E-Verschlüsselung überall** — der Server sieht niemals Inhalte
- **Datensparsamkeit** — nur das absolute Minimum speichern
- **Jede neue Funktion** muss diese Prinzipien einhalten — keine Ausnahmen

## Kinderschutz-Vision (noch nicht implementiert)

> Konzeptionelle Leitlinien für das FSK-Kinderschutzsystem — bei Implementierung strikt einhalten.

- **Medienzeiten** basieren auf wissenschaftlichen Empfehlungen — **nicht von Eltern änderbar** (Schutz vor Überforderung und sozialem Druck)
- **Chat und Anrufe** sind von Medienzeiten **nicht betroffen** — Kommunikation bleibt immer möglich
- **Lernvideos / Erklärvideos** erlaubt bis FSK 6, aber: **keine Kommentare, keine Likes, keine Empfehlungen** — kein Algorithmus, keine Engagement-Mechanismen
- **Bis FSK 12**: Kind wählt nur ein Thema oder sucht gezielt — **kein Algorithmus**, kein "Das könnte dir auch gefallen"
- **Kinder unter 16 sind für alle unsichtbar** — nicht auffindbar, nicht kontaktierbar von Fremden
- **Kontakt zwischen Kindern nur über Eltern**: Elternteil A lädt Elternteil B ein → beide stimmen zu → erst dann können Kinder miteinander kommunizieren
- **Kinder-Spaces**: nur für Kinder sichtbar; Eltern sind automatisch dabei (bis FSK 12)
- **Ab FSK 12**: Eltern sehen den Chat nicht mehr, sind aber noch im Space (Vertrauensübergang)
- **Kind-Konto-Einrichtung**: Scannen-Button auf WelcomeScreen ist der Einstiegspunkt für Kind-Konto-Einrichtung via Eltern-QR-Code

## Entwicklungsrichtlinien

- Mobile-First, Dark Mode als Standard
- Keine zentralen Passwort-Speicher, keine PII auf externen Servern wo vermeidbar
- Komponenten in `/src/app/components/`, Typen in `/src/app/types.ts`
- Auth-Logik in `/src/app/auth/`, P2P-Logik in `/src/app/lib/`
- Mock-Daten in `/src/app/data/`
- Package Manager: **pnpm**
- Dev-Server starten: `pnpm dev`
- Tests: `npx playwright test`
- Keine Emojis in Quellcode-Strings (verursacht Vite HMR "URI malformed")

## Offene Punkte

- Konto-Wiederherstellung via zwei Vertrauenspersonen wurde verworfen (Missbrauchspotenzial). Stattdessen: QR-Code-basierte Wiederherstellung mit lokalem Schlüssel.
- Pay-Modul noch nicht implementiert.
- Backend-Integration (Supabase) geplant.
- **Mock-QR URL** in `ChildProfileScreen.tsx:235` und `PeopleScreen.tsx:231` — `api.qrserver.com` mit Dummy-Token muss durch echte QR-Generierung ersetzt werden
- **Server-IP hardcoded** in `p2p-manager.ts:75-77` — `46.225.115.51` sollte als `VITE_TURN_HOST` Umgebungsvariable ausgelagert werden

## Arbeitsregel für Claude Code

> **WICHTIG**: Nach jeder Änderung an der Codebase CLAUDE.md aktualisieren.
> - Neue Features → "Fertig implementiert" ergänzen
> - Bugfixes → beim betroffenen Feature notieren
> - Erledigte Punkte → mit ✅ und Datum markieren
> - Neue Ideen/Pläne → "Nächste Schritte" ergänzen
> - Neue Komponenten/Libraries → in relevantem Abschnitt eintragen
> Ziel: CLAUDE.md ist immer der aktuelle, vollständige Zustand des Projekts.
