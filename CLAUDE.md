# Aregoland / Arego Chat — CLAUDE.md

## Projekt-Info

- **Besitzer**: Aras
- **GitHub**: https://github.com/Arego367/aregoland (privat)
- **Lizenz**: AGPL-3.0 — Open Source. Jeder kann den Code sehen und nutzen, aber muss Änderungen ebenfalls unter AGPL-3.0 veröffentlichen. Auch SaaS-Deployments müssen den Quellcode offenlegen.
- **Beschreibung**: Arego Chat ist eine moderne Kommunikations- und Organisations-App (Chat, Spaces, Connect, Dokumente, Pay, Kalender).
- **Figma-Quelle**: https://www.figma.com/design/Smf60PFX7V2nopw1QSzsnc/Aregoland
- **Stack**: React 18 + TypeScript, Vite, Tailwind CSS v4, Motion, Radix UI, vite-plugin-pwa, i18next + react-i18next, pnpm
- **Geschäftsmodell**: Kostendeckend, nicht gewinnorientiert — 1 Euro pro Konto pro Jahr, egal wie viele Spaces/Mitglieder/Wiki-Seiten
- **Kostendeckung**: ab ~1.200 zahlenden Nutzern (Serverkosten ~15 Euro/Monat nach Entwicklungsphase)
- **Zielgruppen**: Familien, Schulen, Gemeinden, Vereine, Unternehmen, Aemter
- **Plattform**: PWA (fertig) + Google Play Store + Apple App Store (geplant, Capacitor.js)
- **Marketing**: Social Media mit KI-Unterstuetzung geplant

## Infrastruktur & Server

- Hetzner Server, Ubuntu 24.04, IP: 46.225.115.51, IPv6: 2a01:4f8:1c19:951d::1
- Claude Code arbeitet in `/root/Aregoland`
- **Domains**: aregoland.de (Hauptdomain), aregoland.com, aregoland.eu — alle leiten auf aregoland.de weiter
- **Nginx** Reverse Proxy auf Port 80 + 443 (SSL-Terminierung)
  - HTTP → HTTPS Redirect (alle Domains)
  - Alle Neben-Domains + www → `https://aregoland.de` (301)
  - Proxy: `/` → Vite (127.0.0.1:5173), `/ws-signal` → Signaling (127.0.0.1:3001), `/code` → Signaling
  - Vite HMR WebSocket: `/ws` → Vite
  - Config: `/etc/nginx/sites-available/aregoland`
- **SSL**: Let's Encrypt Zertifikate für alle 6 Domains (aregoland.de/com/eu + www), automatische Erneuerung via certbot
- Vite Dev-Server lauscht auf 127.0.0.1:5173 (nur intern, kein SSL)
- Signaling Server läuft auf Port 3001 (Docker)
- coturn TURN-Server auf Port 3478 (UDP+TCP) und 5349 (TLS)
- rclone → Google Drive Auto-Sync für CLAUDE.md (post-commit Hook)

## Arbeitsweise

- **Aras** = Visionär & Stratege, kein Entwickler
- Aras beschreibt die Vision, Claude Code setzt um
- Kein Figma — Claude Code baut direkt
- CLAUDE.md ist die einzige Wahrheitsquelle
- Claude Code aktualisiert CLAUDE.md am Ende jeder Session und lädt sie zu Google Drive hoch

## Sicherheits- & Auth-Konzept

- **Passwordless Authentication**: Es werden **keine Passwörter auf dem Server gespeichert**. Authentifizierung erfolgt ausschließlich über lokale kryptografische Schlüssel.
- Identität liegt beim Nutzer, nicht beim Server.

## Aktueller Stand (Stand: 2026-04-01)

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
- QR-Code Screen: vollständig funktional (siehe unten)

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

**Kontakt-Management & Blockieren** ✅ 2026-03-31
- Kontakt entfernen: Bestätigungsdialog, Signal über Inbox-WS + DataChannel
- Contact-Status-System: `mutual` (beide hinzugefügt) / `pending` (nur einer) / `removed` (entfernt)
- Chat-Sperre bei einseitigem Kontakt: Nachrichten empfangen ja, senden nein, mit Hinweis
- **Blockieren**: Button in Kontakt-Detail-Modal (orange) + Chat-Menü (3-Punkte → Blockieren)
- Blockiert = Chat zeigt Banner "Du hast diesen Nutzer blockiert", Eingabe deaktiviert
- Blockliste: `aregoland_blocked` in localStorage, CRUD via `blockContact()`, `unblockContact()`, `isBlocked()`, `loadBlocked()`
- Blockliste unter Datenschutz & Sicherheit → "Blockierte Nutzer" mit Aufheben-Button + Toast
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
- **Online-Status verstecken**: Toggle in App Einstellungen "Online-Status anzeigen" (Standard: AN), gespeichert als `aregoland_hide_online` in localStorage

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

**WelcomeScreen** (`WelcomeScreen.tsx`) — erweitert 2026-03-31
- 3 Buttons: "Loslegen" (Registrierung), "Wiederherstellen" (Recovery), "Kind hinzufügen" (Kind-Konto)
- Sprach-Selector oben rechts: Flagge + Kürzel, Dropdown mit DE/EN/LT, sofortige Umschaltung
- Wiederherstellen: Info-Screen → QR-Code scannen (Kamera-Placeholder) oder Schlüssel eingeben (funktional)
- Kind hinzufügen: Kamera-Scanner (Placeholder) + manuelle Code-Eingabe + Name-Input → `createChildIdentity()`
- Kind-Konto wird in localStorage als `accountType: "child"` mit `parentId` und `fsk` gespeichert
- 5 Views: welcome, restore, restoreScan, restoreKey, child
- Auto-Skip: Bei vorhandener Identität direkt zum gespeicherten Startscreen (kein WelcomeScreen)

**Internationalisierung (i18n)** ✅ 2026-03-31
- i18next + react-i18next + i18next-browser-languagedetector
- 3 Sprachen: Deutsch (de), Englisch (en), Litauisch (lt)
- Sprachdateien: `src/i18n/locales/{de,en,lt}.json` — strukturiert nach Komponenten-Namespaces
- i18n-Config: `src/i18n/i18n.ts` — Fallback Deutsch, Browser-Spracherkennung, localStorage-Persistierung (`aregoland_language`)
- Alle UI-Komponenten nutzen `useTranslation()` Hook mit `t('namespace.key')` Aufrufen
- Sprachwahl in Einstellungen → App Einstellungen → Sprache (alle EU-Sprachen in der Liste, 3 davon übersetzt)
- Neue Sprachen hinzufügen: JSON-Datei in `src/i18n/locales/` erstellen + in `src/i18n/i18n.ts` importieren
- HTML-Inhalte (z.B. `<strong>`, `<br/>`) via `dangerouslySetInnerHTML` mit `t()` gerendert
- Kalender: Monatsnamen, Wochentage, Dauer- und Erinnerungs-Labels vollständig übersetzt

**Familie & Kinder** (`SettingsScreen.tsx`, `identity.ts`) ✅ 2026-03-31
- Neuer Bereich "Familie & Kinder" in Einstellungen (Pink-Icon, Baby-Symbol)
- Unterseite: Liste verknüpfter Kind-Konten mit Initialen-Avatar, Name, Arego-ID, FSK-Badge
- "Kind hinzufügen": QR-Code generieren (TTL 10 Min, einmalig) + Name + FSK-Auswahl
- FSK-Stufen: FSK 6 (Standard, grün), FSK 12 (wählbar, gelb), FSK 16 + FSK 18 (ausgegraut, Schloss-Icon, "ID-Verifizierung")
- FSK pro Kind nachträglich änderbar (aufklappbares Panel)
- Kind-Konto entfernen mit Button
- `ChildAccount` Interface in `identity.ts`: aregoId, displayName, parentId, fsk, createdAt
- CRUD-Funktionen: `loadChildren()`, `saveChild()`, `removeChild()`
- `createChildLinkPayload()`: Base64-kodiertes Linking-Payload mit TTL + Nonce
- `decodeChildLinkPayload()`: Dekodierung + Ablauf-Prüfung
- `createChildIdentity()`: Kind-Konto erstellen mit `accountType: "child"`, parentId, fsk
- WelcomeScreen "Kind hinzufügen": Kamera-Scanner + manuelle Code-Eingabe → Kind-Konto erstellen
- Kind-Konten in localStorage (`aregoland_children` für Eltern-Liste, `aregoland_identity` auf Kind-Gerät)
- Alle i18n-Keys in DE/EN/LT vorhanden
- `qrcode` npm-Paket für QR-Code-Generierung

**PWA (Progressive Web App)** ✅ 2026-03-31
- `vite-plugin-pwa` mit Workbox Service Worker (autoUpdate)
- Web App Manifest: Name "Arego", Standalone-Modus, Portrait, Theme-Color #1D4ED8
- Icons: 192x192, 512x512 (any), 512x512 (maskable), Apple-Touch-Icon 180x180
- Offline-Fähigkeit: App-Shell gecacht (JS, CSS, HTML, Bilder), keine Nachrichten/API-Calls
- iOS: `apple-mobile-web-app-capable`, `apple-touch-icon`, `apple-mobile-web-app-status-bar-style`
- Android: Manifest mit `display: standalone`, "Zum Homescreen hinzufügen" Prompt
- Signaling-WebSocket (`/ws-signal`) und API (`/code`) explizit vom Caching ausgeschlossen
- Icon-Quelldateien: `public/icon.svg`, `public/maskable-icon.svg`

**Nginx Reverse Proxy** ✅ 2026-03-31
- Nginx 1.24 als Reverse Proxy für aregoland.de, aregoland.com, aregoland.eu (+ www-Varianten)
- Let's Encrypt SSL-Zertifikate für alle 6 Domains, automatische Erneuerung via certbot
- HTTP → HTTPS Redirect, alle Neben-Domains → aregoland.de (301)
- Reverse Proxy: `/` → Vite (5173), `/ws-signal` + `/code` → Signaling (3001), `/ws` → Vite HMR
- Config: `/etc/nginx/sites-available/aregoland`

**Infrastruktur**
- `start.sh` — systemd Services für Signaling-Server (Docker) + Vite Dev-Server + Nginx
- `arego.bat` — Windows-Batch für SSH + Claude Code
- Vite Dev-Server auf 127.0.0.1:5173 (nur intern, Nginx macht SSL-Terminierung)
- HMR Overlay deaktiviert (`hmr: { overlay: false }`)
- Playwright-Tests (`tests/`) für Video-Call-UI, DataChannel-Delivery, Console-Errors, Unicode-Encoding
- Favicon (blaues Chat-Icon)
- rclone installiert — CLAUDE.md Auto-Sync zu Google Drive via git post-commit Hook
- `sync-claude-md.sh` — manuelles Sync-Script für CLAUDE.md → Google Drive

**Profil-Screen** (`ProfileScreen.tsx`) ✅ 2026-03-31
- Alle Felder persistent in localStorage (`arego_profile`): Name, Spitzname, Status, Adresse, Social Media, Telefon, E-Mail
- Beim Laden werden gespeicherte Daten angezeigt, Fallback auf Identity-DisplayName
- "Speichern" Button speichert in localStorage + aktualisiert `displayName` in Identity
- Erfolgs-Toast "Profil gespeichert" (grün, animiert, 2.5s)
- Initialen-Avatar aktualisiert sich live bei Namensänderung
- Avatar-Upload: Foto auswählen (max 500KB), als Base64 in `arego_profile` gespeichert
- Avatar entfernen via X-Button (zurück zu Initialen)
- Arego-ID nicht editierbar, kopierbar
- Social Media dynamisch: "+ Hinzufügen" Button → Bottom-Sheet mit 12 Plattformen (Instagram, TikTok, YouTube, Discord, Twitch, Mastodon, LinkedIn, X/Twitter, Snapchat, Pinterest, Telegram, Sonstiges)
- Jede Plattform hat SVG-Icon, Prefix (@), Username-Feld und Löschen-Button
- Unbegrenzt viele Links hinzufügbar, als `socialLinks[]` Array in localStorage gespeichert
- Migration: alte feste Felder (`instagram`, `tiktok`, `otherSocial`) werden automatisch in `socialLinks` überführt
- Adressen dynamisch: "+ Adresse hinzufügen" Button → Inline-Formular mit Label-Presets (Zuhause, Arbeit, Lieferadresse, Rechnungsadresse) oder eigenes Label
- Jede Adresse als kompakte Karte: Label (blau), Adresse einzeilig, Bearbeiten + Löschen Buttons
- Unbegrenzt viele Adressen, als `addresses[]` Array in localStorage gespeichert
- Migration: alte flache Adressfelder (`street`, `houseNumber`, `zipCode`, `city`, `country`) werden automatisch als "Zuhause"-Adresse migriert
- Kontakte dynamisch: "+ Kontakt hinzufügen" Button → Inline-Formular mit Typ (Telefon, Handy, E-Mail, Fax, Sonstiges) und Label (Privat, Arbeit, Schule, Sonstiges oder eigenes)
- Jeder Kontakt als kompakte Karte: Icon, Wert, Typ·Label, Bearbeiten + Löschen
- Unbegrenzt viele Kontakte, als `contactEntries[]` Array in localStorage gespeichert
- Migration: alte flache Felder (`phone`, `email`) werden automatisch als Kontakteinträge migriert

**Einstellungen — Vollständig** (`SettingsScreen.tsx`) ✅ 2026-03-31
- 5 Unterseiten: App Einstellungen, Benachrichtigungen, Datenschutz & Sicherheit, Familie & Kinder, Hilfe & Support
- **Benachrichtigungen**: Push ein/aus (mit Browser Notification Permission Request), Nachrichten ein/aus, Anrufe ein/aus, Töne ein/aus — alles in localStorage (`aregoland_notifications`)
- **Datenschutz & Sicherheit**: Arego-ID anzeigen + kopieren, Auffindbarkeit (Opt-in mit Signaling-Server /directory Endpoint, Kind-Konten ausgegraut + Hinweis), Profil-Sichtbarkeit pro Kategorie (Persönliche Daten / Adresse / Kontaktdaten / Social Media, je 3 Stufen: Alle Kontakte / Nur Familie / Niemand), Datenspeicher-Anzeige (Chats/Profil/Kontakte getrennt mit KB/MB), Daten löschen (Chat-Verlauf / Profildaten)
- Auffindbarkeit: `directoryRegister()` / `directoryRemove()` rufen `/directory` POST/DELETE auf dem Signaling-Server auf
- Privacy-Einstellungen in `aregoland_privacy_visibility` in localStorage gespeichert
- **Hilfe & Support**: 5 FAQ-Einträge als Akkordeon (Was ist Arego-ID, Kontakt hinzufügen, Geräteverlust, Verschlüsselung, Konto löschen), Link zu aregoland.de, Feedback per E-Mail, Version + Lizenz

**QR-Code Screen** (`QRCodeScreen.tsx`) ✅ 2026-03-31
- "Mein Code" Tab: Echter Kontakt-QR-Code mit `createSharePayload()` / `encodePayload()` (kompatibel mit AddContactModal)
- Zeigt echten Namen (aus `arego_profile` / Identity) + Arego-ID unter dem QR-Code
- Timer: 10 Min TTL, Ablauf-Overlay mit "Neu erstellen" Button
- "Teilen" Button: Web Share API mit Deep-Link URL, Fallback: Clipboard
- "Speichern" Button: QR als PNG herunterladen (`Aregoland-QR-{aregoId}.png`)
- "Scannen" Tab: Echte Kamera via `html5-qrcode` Bibliothek
- Intelligente QR-Erkennung nach Scan:
  - Kontakt-Payload → "Möchtest du X hinzufügen?" Dialog mit Avatar + Name + Arego-ID
  - Kind-Verknüpfungs-QR → Info-Card "Kind-Verknüpfung erkannt"
  - URL (https://) → "Öffnen" Button (öffnet im Browser)
  - Unbekannt → Inhalt anzeigen + Kopieren-Button
- Kontakt hinzufügen: Nonce-Prüfung, Ablauf-Check, `saveContact()` direkt
- `html5-qrcode` npm-Paket hinzugefügt

**Spaces — Schritt 1: Erstellen mit Vorlagen** (`SpacesScreen.tsx`) ✅ 2026-03-31
- Mock-Daten (Design Team, Klasse 4b) komplett entfernt
- 7 Space-Vorlagen: Familie, Schule, Verein/Sport, Unternehmen, Amt/Gemeinde, Community, Benutzerdefiniert
- Jede Vorlage hat: Icon, Farbgradient, Standard-Identitätsregel, Standard-Einstellungen
- Erstellungs-Flow: Vorlage wählen → Name + Beschreibung → Relay-Node Info-Banner → Erstellen
- Space-Daten in localStorage (`aregoland_spaces`): ID, Name, Beschreibung, Template, Farbe, Founder, Mitglieder, Einstellungen
- Ersteller wird automatisch als Founder (erste Rolle) eingetragen
- Listen-Ansicht: Spaces als Karten mit Gradient-Header, Template-Icon, Name, Beschreibung, Mitgliederzahl
- Detail-Ansicht: Header mit Gradient, 4 Tabs (Übersicht, Chats, Mitglieder, Einstellungen)
- Space löschen mit sofortiger Entfernung aus localStorage
- "Space erstellen" Button oben in der Liste (wie PeopleScreen-Stil, kein FAB)
- Drag & Drop Sortierung via `Reorder` (Motion), GripVertical Handle links, Reihenfolge in `aregoland_spaces_order` gespeichert
- Volle Browserbreite (kein max-width Container)
- Erfolgs-Toast "Space erstellt"
- `Space` Interface: id, name, description, template, color, identityRule, founderId, members[], channels[], subrooms[], settings{}, createdAt

**Spaces — Schritt 2: Mitglieder & Rollen** (`SpacesScreen.tsx`) ✅ 2026-03-31
- Mitglied einladen: QR-Code mit `SpaceInvitePayload` (spaceId, spaceName, template, role, exp, nonce)
- Einstellbare Ablaufzeit: 1h, 24h, 7 Tage, 30 Tage, Unbegrenzt, eigene Dauer (Tage-Eingabe)
- Admin/Moderator-Einladungen: max 30 Tage (Unbegrenzt ausgegraut mit Hinweis)
- Rolle beim Einladen als Radio-Liste mit Beschreibung pro Rolle (Admin, Moderator, Mitglied, Gast)
- Beitritts-Hinweis: automatisch generiert aus Space-Einstellungen (Rolle, ID-Verifizierung, Namensregel)
- Teilen via Web Share API + Fallback Clipboard
- Mitglieder-Tab: nach Rollen gruppiert (Gründer → Admin → Moderator → Co-Host → Mitglied → Gast)
- Farbige Rollen-Badges (Gold/Rot/Blau/Lila/Grau)
- Rolle ändern: aufklappbares Panel pro Mitglied (nur für Founder/Admin sichtbar)
- Mitglied entfernen Button
- Founder kann nicht entfernt/geändert werden
- `ROLE_ORDER` und `ROLE_COLORS` Konstanten für konsistentes Rollen-Rendering

**Spaces — Schritt 3: Neuigkeiten + Übersicht** (`SpacesScreen.tsx`) ✅ 2026-03-31
- Neuer "Neuigkeiten" Tab zwischen Übersicht und Chats
- Beitrag erstellen (nur Admin/Moderator/Founder): Titel, Text, Badge (Ankündigung/Neuigkeit/Termin), Anpinnen
- Beiträge als Karten: Autor-Avatar, Name, Rolle, Datum, Badge (farbig), Pin-Indikator
- Angepinnte Beiträge immer oben (gelber Rahmen)
- Filter-Chips: Alle / Ankündigungen / Neuigkeiten / Termine
- Upvote pro Beitrag (Toggle, zeigt Anzahl)
- Kommentare: einklappbar, Eingabefeld mit Enter-Senden
- Beitrag anpinnen/lösen + löschen (nur Autor oder Founder)
- `SpacePost` Interface: id, authorId, authorName, authorRole, title, text, badge, pinned, upvotes[], comments[], createdAt
- `SpaceComment` Interface: id, authorId, authorName, text, createdAt
- Übersicht-Tab rollenbasiert: Admins sehen Statistiken (Mitglieder/Posts/Chats), alle sehen angepinnte Posts + letzte Ankündigungen
- Alles in `aregoland_spaces` localStorage (posts[] Array im Space-Objekt)
- Bug fix: `loadSpaces()` migriert Spaces ohne `posts` Feld (setzt `posts: []`)
- Bug fix: `handleCreatePost` nutzt `?? []` defensiv gegen undefined posts
- Termin-Badge: zusätzliche Felder Datum, Uhrzeit, Ort bei Badge "Termin"
- RSVP-System: Ja / Nein / Vielleicht pro Termin-Beitrag, Anzahl sichtbar, Toggle
- Push-Benachrichtigung bei neuem Termin: "Neuer Termin: [Titel]" (Browser Notification API)
- `SpacePost` erweitert: eventDate, eventTime, eventLocation, rsvp (Record<aregoId, response>)

**Spaces — Schritt 4: Chats-Tab + Unterräume** (`SpacesScreen.tsx`) ✅ 2026-04-01
- Chats-Tab vollständig funktionsfähig: Channel-Liste, Chat erstellen, Gruppen-Chat
- "Chat erstellen" Button: Name eingeben + Rollen-Zugriffsrechte (Lesen/Schreiben) per Rolle wählbar
- Globaler Chat wird automatisch bei Space-Erstellung angelegt (nur Admin/Moderator/Founder schreibt, alle lesen)
- Channel-Liste: Name, letzte Nachricht, Uhrzeit, ungelesene Badge (blau)
- Globaler Chat immer mit Megaphone-Icon + "GLOBAL" Badge gekennzeichnet
- Gruppen-Chat Screen: Nachrichtenliste mit Sender-Name, Zeitstempel, eigene Nachrichten rechts (blau), fremde links (grau)
- Nachrichten über Signaling-Server als verschlüsseltes Relay (WebSocket Room `space-chat:{spaceId}:{channelId}`)
- Signaling-Server erweitert: `space-chat:` Rooms erlauben bis zu 500 Peers + Offline-Pufferung (24h TTL)
- Schreibsperre für Nutzer ohne Schreibzugriff (Lock-Icon + Hinweis)
- Nachrichten in localStorage (`aregoland_space_chats`), max 500 pro Channel
- Ungelesene Badge im Chats-Tab + auf Space-Karte in der Liste
- `SpaceChannel` Interface: id, spaceId, name, isGlobal, readRoles[], writeRoles[], unreadCount, lastMessage, lastMessageTime
- `SpaceChatMessage` Interface: id, channelId, authorId, authorName, text, timestamp
- Unterräume: Admin kann Unterräume erstellen (z.B. "Pilates Di 18 Uhr")
- Unterraum hat eigene Mitgliederliste (Teilmenge des Space, per Checkbox auswählbar)
- Unterraum hat eigene Channels (automatisch "Allgemein" bei Erstellung)
- Unterräume-Bereich in Chats-Tab mit lila Icons + Badges
- Unterraum löschen (nur Admin)
- `SpaceSubroom` Interface: id, spaceId, name, memberIds[], channels[], createdAt
- `loadSpaces()` migriert Spaces ohne `channels`/`subrooms` Feld
- Alle i18n-Keys in DE/EN/LT: createChat, writeAccess, readAccess, globalChatHint, readOnlyChat, createSubroom, subroomMembers, subrooms, deleteSubroom

**UI-Screens**
- `ChatListScreen`, `ChatScreen`, `PeopleScreen`, `SpacesScreen`
- `ConnectScreen`, `DocumentsScreen`, `DashboardScreen`
- `ProfileScreen`, `QRCodeScreen`, `SettingsScreen`, `WelcomeScreen`
- `ContactDetailModal`, `AddContactModal`, `TabManagementModal`, `ChildProfileScreen`
- `CallOverlay` — Fullscreen Anruf-UI mit Auto-Hide Controls + draggable PiP
- `RegistrationScreen` — 4-Schritte Registrierung

---

## Nächste Schritte (Priorität)

1. **Spaces vollständig implementieren** (siehe "Spaces — Vollständige Vision")
   - Schritt 1: Space erstellen mit Vorlagen ✅ 2026-03-31
   - Schritt 2: Mitglieder & Rollen ✅ 2026-03-31
   - Schritt 3: Neuigkeiten-Tab + Übersicht nach Rollen ✅ 2026-03-31
   - Schritt 4: Chats-Tab + Unterräume ✅ 2026-04-01
   - Schritt 5: Wiki/Seiten

2. **Pay-Modul** — wenn fertig, ist App marktreif

3. **Google Play Store + Apple App Store** (Capacitor.js oder React Native)

4. **KI-Support** (nach Server-Upgrade auf 8GB RAM)

5. **Mehrsprachigkeit erweitern** (weitere EU-Sprachen)

6. **Öffentliche Suche/Auffindbarkeit** verfeinern (Directory-Endpoint)

7. **Kalender erweitern**
   - Stufe 2: Kinder-Integration (Grundlage fertig: Name, FSK, Eltern-Verknüpfung)
   - Stufe 3: Termine P2P teilen
   - Stufe 4: Spaces-Integration (Termine aus Spaces im Hauptkalender)
   - Import/Export: iCal (.ics)

8. **Kinderschutz-Features (FSK)** — nach Kinder-Profilen
   - Serverseitig: Kinder unter 16 nicht auffindbar/kontaktierbar
   - Kontakt zwischen Kindern nur über gegenseitige Eltern-Zustimmung
   - Medienzeiten basierend auf wissenschaftlichen Empfehlungen (nicht von Eltern änderbar)

9. **Recovery-Flow erweitern**
   - QR-Code scannen: ✅ html5-qrcode integriert
   - Datei-Upload: Nutzer wählt gespeicherte `aregoland-recovery-*.txt` Datei
   - Textschlüssel eingeben: ✅ bereits implementiert

### Bereits erledigt:
- ✅ Kalender-Modul Stufe 1 (2026-03-30)
- ✅ TURN-Server (coturn, 2026-03-30)
- ✅ Sprach-Selector i18n (2026-03-31) — 3 Sprachen: DE, EN, LT

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
- **Kostendeckend, nicht gewinnorientiert** — kein Upselling, keine Premium-Features die Datenschutz einschränken

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

## Spaces — Vollständige Vision (noch nicht implementiert)

### Space-Vorlagen (beim Erstellen auswählbar):
- Familie — privat, alle sehen alle, geteilter Kalender
- Schule — Lehrer + Eltern + Kinder, Hausaufgaben, Termine
- Verein/Sport — Trainer sichtbar, Anwesenheit, Kurstermine
- Unternehmen — Abteilungen, Rollen, formell
- Amt/Gemeinde — öffentlich, Ankündigungen, Bürger-Kommunikation
- Community — offen oder geschlossen
- Benutzerdefiniert — alles selbst einstellen

### Rollen-System:
- **Founder** (nicht entfernbar, automatisch Co-Host)
- **Admin** (vom Founder ernannt)
- **Moderator/Trainer** (sichtbar, kann in Globalem Chat posten)
- **Co-Host/Relay-Node** (anonym, freiwillig, Bandbreite teilen)
- **Mitglied**
- **Gast** (nur lesen)

### Space-Einstellungen (Admin):
- Mitglieder sehen sich gegenseitig: Ja/Nein
- Co-Hosting erlaubt: Ja/Nein + welche Rollen dürfen Co-Host werden
- Admin sieht nur ANZAHL der Co-Hosts, keine Namen (Privacy!)
- Öffentlich beitreten: Ja/Nein
- ID-Verifizierung zum Beitritt: Ja/Nein (Standard: Ja)
- QR-Code Einladung mit Ablaufzeit
- Globaler Chat: nur Admins/Moderatoren können posten

### Space-Features:
- Chats (Gruppen-Chats mit Rollen-Zugriffsrechten)
- Termine mit Anwesenheit (komme/komme nicht) — Trainer/Admin sieht Übersicht
- Wiki/Seiten — strukturierte Infoseiten, jeder kann erstellen (je nach Rolle)
- Ankündigungen — nur Admins/Moderatoren
- Unterräume — z.B. "Pilates Dienstag 18 Uhr", "Pilates Dienstag 19 Uhr"
- Mitglieder-Übersicht (nur nach Rollen sichtbar)

### Übersicht-Tab (nach Rollen):
- Admin sieht alles: Chats, Termine, Mitglieder, Wiki
- Mitglied sieht nur: Chats wo Zugang, Termine, Ankündigungen
- Wichtige Termine ganz oben in der Übersicht

### Kinder-Spaces:
- Elternteil automatisch Co-Host
- Kinder sehen nur freigegebene Inhalte (FSK-basiert)
- Eltern können Kinder-Kommunikation untereinander freischalten

### Technische Architektur:
- Space-Ersteller = primärer Relay-Node
- Freiwillige Co-Hosts = sekundäre Relay-Nodes (anonym)
- Nachrichten: P2P Mesh über Relay-Nodes
- Wenn Founder offline → Co-Host übernimmt automatisch
- Space-Daten in localStorage + Sync über Relay-Nodes

### Implementierungs-Schritte:
1. **Schritt 1** — Space erstellen mit Vorlagen: + Button, 7 Vorlagen, Name/Beschreibung, Relay-Node Hinweis, localStorage, Mock-Daten entfernen
2. **Schritt 2** — Mitglieder & Rollen: QR-Einladung mit Ablaufzeit, Kurzcode, Rollen zuweisen, Co-Host System, Mitglieder-Sichtbarkeit
3. **Schritt 3** — Übersicht nach Rollen + Termine mit Anwesenheit
4. **Schritt 4** — Wiki/Seiten

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
- **Erweiterter Backup/Recovery-Flow** (noch nicht implementiert)
  - Verschlüsselter Backup-Download als Datei (.arego Format)
  - Nutzer wählt Inhalt: Identität/Schlüssel, Kontakte, Chat-Historie oder alles
  - Backup ist E2E-verschlüsselt — nur der Nutzer kann es öffnen
  - Regelmäßige Erinnerungen ("Du hast seit 6 Monaten kein Backup gemacht")
  - Nach ~1 Jahr: Backup fast erzwungen bevor Nutzer weitermachen kann
  - Wiederherstellung: Backup-Datei hochladen → alles zurück
- **Pay-Modul** (noch nicht implementiert)
  - Wenn fertig: App ist marktreif
  - Mehrere verknüpfte Arego-IDs pro Person möglich (z.B. Privat + Arbeit)
  - Profil-Wechsel in der App (ein Konto, zwei Identitäten)
  - Arbeitgeber kann für Mitarbeiter zahlen (Firmen-Abo)
  - Schulen zahlen aktuell 7-20 Euro pro Kind/Monat für schlechte Software — Aregoland ersetzt das für 1 Euro/Jahr
- **Datenverwaltung & Bereinigung** (noch nicht implementiert)
  - Unter Einstellungen → "Datenschutz & Sicherheit" → "Speicher verwalten"
  - Anzeige: wie viel Speicher belegt ist (Chats, Fotos, Dokumente getrennt)
  - Bereinigung: Nutzer wählt was gelöscht wird (Chats, Fotos, Dokumente)
  - Bestimmte Chats von Bereinigung ausschließen ("Diesen Chat schützen")
  - Zeitraum wählbar: älter als 30 Tage / 6 Monate / 1 Jahr / custom
  - Automatische Bereinigung einstellbar (z.B. jeden Monat)
  - Konto löschen = sofort alles weg, keine Ausnahmen
- **Intelligente Datenverwaltung** (noch nicht implementiert)
  - Gerätespeicher prüfen (Storage API: navigator.storage.estimate())
  - Warnung wenn Speicher knapp wird (z.B. unter 100MB frei)
  - Automatische Bereinigung mit Nutzer-Zustimmung wenn kritisch
  - Nutzer definiert Regeln: was darf automatisch gelöscht werden (alte Chats, Bilder etc.)
  - Manuelle Bereinigung unter Datenschutz & Sicherheit → Datenspeicher
- **KI-Support in Hilfe & Support** (noch nicht implementiert)
  - Voraussetzung: Server-Upgrade auf mind. 8GB RAM
  - Ollama mit llama3.2:3b oder phi3:mini lokal auf Server
  - Chat-UI in Hilfe & Support
  - Aregoland-Dokumentation als Kontext
  - Klassifizierung: Bug / Feedback / Frage / Kritik
  - Keine personenbezogenen Daten in Konversationen
- **Verifizierungs-Filter** (noch nicht implementiert)
  - Kontakte als "verifiziert" markieren (nach persönlichem Treffen / Video-Call)
  - Filter in Kontaktliste: nur verifizierte Kontakte anzeigen
  - Spaces können "nur verifizierte Mitglieder" verlangen
- **Zwei Profile parallel** (noch nicht implementiert)
  - Ein Konto, zwei Arego-IDs (z.B. Privat + Arbeit)
  - Profil-Wechsel in der App, getrennte Kontakte/Chats pro Profil
  - Arbeitgeber sieht nur Arbeits-Profil
- **Wiederherstellung erweitern** (noch nicht implementiert)
  - Option: Wiederherstellung via Vertrauensperson (Kontakt hält verschlüsseltes Fragment)
  - Option: eID-basierte Wiederherstellung (nach Integration mit nationaler eID)
  - Dezentrale Wiederherstellung: Schlüssel-Fragmente auf mehrere Geräte verteilen (Shamir's Secret Sharing)
- **Spaces — Video Calls & Streaming** (noch nicht implementiert)
  - Meeting-Modus (klein, interaktiv, alle Kameras)
  - Stream/Webinar-Modus (gross, einseitig, bis 5000+ Teilnehmer)
  - Automatische Node-Zuweisung: WLAN = automatisch Node, Mobile Daten = fragen ob Flat
  - Nutzer kann Mobile-Daten-Nutzung als Node deaktivieren
  - Admin kann manuell Nodes zuweisen
  - Raised Hand fuer Zuschauer (koennen kurz auf Buehne geholt werden)
  - Live Q&A Chat waehrend Stream
  - Baum-Struktur fuer Nodes (Presenter → Relay-Nodes → Sub-Nodes → Zuschauer)
- **Spaces — Melde-System** (noch nicht implementiert)
  - Mitglied melden (Grund + Beschreibung)
  - Nachricht melden als Beweis (Zeitstempel + Inhalt unveraenderlich)
  - Ab X Meldungen → Admin Benachrichtigung
  - Kinder-Spaces: Elternteil bekommt alle Meldungen sofort
- **Spaces — Mitglieder-Kontrolle** (noch nicht implementiert)
  - Admin-zugewiesene Spitznamen
  - Online-Status erzwingen/erlauben
  - Echter Name Pflicht oder Spitzname
  - Beitritts-Genehmigung durch waehlbare Rollen
  - Abstimmung moeglich (X von Y muessen zustimmen)
  - Beitritts-Hinweis: automatisch generiert aus Space-Einstellungen
- **Node-Architektur für Spaces Video/Stream** (noch nicht implementiert)
  - Jeder Nutzer wird beim Beitritt geprüft ob er Node werden kann
  - WLAN = automatisch Node-Kandidat, Mobile Daten = fragen ob Flat vorhanden
  - Formel: verfügbare Nodes / 2 = aktive Nodes (immer gerade Zahl, sonst einer zu Reserve)
  - 10% Reserve (aufrunden auf nächste ganze Zahl)
  - Nodes agieren immer in Paaren: A (aktiv) + B (Standby, wartet nur)
  - Heartbeat: alle 1 Sekunde "Ich lebe" an Admin
  - Reserve sendet auch Heartbeat an Admin
  - Bei Ausfall: Admin weist sofort Reserve als neues B zu
  - Upload-Messung beim Verbindungsaufbau: Node-Kapazität = Upload / 4 Mbit (2x Sicherheitspuffer)
  - Abrunden bei Kapazitätsberechnung (lieber weniger als überlasten)
  - Stabiler Node: Admin kann manuell einen Node als "Stabil" markieren (Einzelgänger, kein Partner nötig, z.B. 1GB Leitung)
  - Neue Nutzer die joinen und Node werden können = sofort zu Reserve hinzufügen
  - Qualitätsanpassung: genug Nodes = HD, wenige = SD, kritisch = Audio only
  - Admin-Dashboard: Nutzer-Anzahl, aktive Nodes, Reserve-Kapazität, Auslastung %, Qualität
  - Warnung bei >80% Auslastung → System fragt neue Nutzer ob sie Node werden wollen
- **FSK-System für Spaces** (noch nicht implementiert)
  - Jeder neue Space startet mit FSK 18 (Standard)
  - Runterstufung nur per Antrag: Admin mit verifizierter ID beantragt niedrigere FSK
  - Admin muss: im Space sein + Admin-Rechte haben + identifiziert sein + Zugehörigkeit nachweisbar (Schule, Verein, Unternehmen)
  - Prüfung online (Handelsregister, Schulverzeichnis etc.) — keine Daten danach gespeichert
  - Nutzer kann Hochstufung beantragen/melden — Missbrauch führt zu Warnung, temporärem oder permanentem ID-Ban
- **FSK-System für Nutzer** (noch nicht implementiert)
  - Neu registriert = automatisch FSK 6
  - ID-Verifizierung = FSK 18 (Nutzer stuft sich selbst hoch)
  - Kinder-Konto = FSK 6 (Eltern können auf FSK 12 hochstufen, keine ID nötig)
  - FSK 16/18 für Kinder nur mit ID möglich (ausgegraut)
- **Politik-Space** (noch nicht implementiert)
  - Spezieller Space-Typ für demokratische Abstimmungen
  - Geheime Abstimmungen: niemand sieht wie wer abgestimmt hat, nicht mal Admin
  - Partei-Zugehörigkeit optional, komplett anonym speicherbar
  - Ergebnis: nur Gesamtzahlen sichtbar (60% dafür, 40% dagegen)
  - Gesetze zustimmen/ablehnen
  - Abstimmungsergebnis nach Partei-Zugehörigkeit auswertbar (ohne Namen)
  - Technisch: Zero-Knowledge Voting (kryptografisch manipulationssicher)
- **Aregoland offizieller Space** (noch nicht implementiert)
  - Offizieller Space von Aras/Aregoland
  - Updates, Neuigkeiten, Changelog posten
  - Nutzer können beitreten, lesen, Feedback geben
- **Öffentliche Space-Suche** (noch nicht implementiert)
  - Spaces die öffentlich sind können gefunden werden
  - Suche nach Name, Kategorie, Vorlage
  - Space-Vorschau vor Beitritt (Name, Beschreibung, Mitgliederzahl, FSK)
  - Nur Spaces die "öffentlich auffindbar" aktiviert haben erscheinen
- **Wiederherstellung via Vertrauensperson + eID** (Konzept verfeinert)
  - Vertrauensperson öffnet App, wählt den zu wiederherstellenden Kontakt aus ihrer Liste
  - Betroffene Person verifiziert sich mit eID direkt am Gerät der Vertrauensperson
  - Schlüssel wird im Moment aus der eID abgeleitet — nichts wird gespeichert
  - Vertrauensperson hat zu keinem Zeitpunkt Zugriff auf den Schlüssel
- **Dezentrale Daten-Wiederherstellung** (noch nicht implementiert)
  - Nach Geräteverlust: Kontakte pushen gespeicherte Daten zurück
  - Kontakte haben Arego-ID gespeichert → pushen Kontaktdaten zurück
  - Spaces-Mitglieder pushen Space-Daten zurück
  - Chat-Verlauf: Kontakt kann seine Kopie optional teilen
  - "Soziales Netzwerk als Backup" — Identität entsteht durch Beziehungen

## Arbeitsregel für Claude Code

> **WICHTIG**: Nach jeder Änderung an der Codebase CLAUDE.md aktualisieren.
> - Neue Features → "Fertig implementiert" ergänzen
> - Bugfixes → beim betroffenen Feature notieren
> - Erledigte Punkte → mit ✅ und Datum markieren
> - Neue Ideen/Pläne → "Nächste Schritte" ergänzen
> - Neue Komponenten/Libraries → in relevantem Abschnitt eintragen
> Ziel: CLAUDE.md ist immer der aktuelle, vollständige Zustand des Projekts.
