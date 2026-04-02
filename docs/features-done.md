# Fertige Features

> Stand: 2026-04-02

## Identitaet & Registrierung (`src/app/auth/`)

- WebCrypto ECDSA P-256 Schluesselgenerierung (`crypto.ts`)
- Arego-ID Ableitung aus oeffentlichem Schluessel: `AC-XXXX-XXXXXXXX` Format (`crypto.ts`)
- Kompletter Registrierungs-Flow mit 4 Schritten: Intro, Name, Schluessel generieren, QR-Backup (`RegistrationScreen.tsx`)
- QR-Code + Textschluessel fuer Wiederherstellung anzeigen und kopieren
- Recovery-Schluessel: kopierbar via Clipboard UND als .txt Datei downloadbar (`aregoland-recovery-{userId}.txt`)
- Recovery-Payload Import (neues Geraet) via `importFromRecoveryPayload` (`identity.ts`)
- Unicode-safe Base64 Encoding/Decoding (Umlaute, Emojis sicher)
- Identitaet in `localStorage` speichern/laden/loeschen
- QR-Code Screen: vollstaendig funktional (siehe unten)

## Wiederherstellung (`WelcomeScreen.tsx`)

- Recovery-Flow im WelcomeScreen mit 2 Optionen
- Option 1: QR-Code scannen (Kamera-Scanner UI, Placeholder fuer jsQR-Integration)
- Option 2: Textschluessel manuell eingeben -> `importFromRecoveryPayload()` -> Erfolg/Fehler-Handling
- Ladeindikator waehrend Import, rote Fehlermeldung bei ungueltigem Schluessel

## Kontakte (`src/app/auth/contacts.ts`, `auth/share.ts`)

- Lokaler Kontaktspeicher (nur `localStorage`, kein Server)
- Kontakt teilen via QR-Code (TTL 10 Min, Nonce-geschuetzt) oder 6-Zeichen-Kurzcode (TTL 1h, single-use)
- Kurzcode-API auf Signaling-Server (`/code` POST/GET)
- Deterministische P2P Room-ID aus zwei Arego-IDs
- Gegenseitiger Kontaktaustausch: `sendReverseIdentity` via Inbox-WebSocket + automatischer P2P-Identitaetsaustausch ueber DataChannel
- In-App Toast + Browser-Notification bei neuem Kontakt (beide Wege: WebSocket + DataChannel)
- `AddContactModal.tsx` — UI fuer Kontakt hinzufuegen (Kurzcode + QR)

## P2P Chat E2E-Verschluesselt (`src/app/lib/`)

- Ephemeres ECDH P-256 Key-Exchange im WebRTC-Handshake (`p2p-crypto.ts`)
- AES-GCM 256-bit Nachrichtenverschluesselung (`p2p-crypto.ts`)
- `P2PManager` Klasse: verwaltet mehrere gleichzeitige WebRTC-Verbindungen (`p2p-manager.ts`)
- Verbindungen bleiben aktiv auch wenn ChatScreen geschlossen — Nachrichten kommen immer an
- WebRTC STUN + TURN (coturn) — Relay fuer Nutzer hinter symmetrischen NATs
- Automatische Reconnection bei Verbindungsabbruch (5s Delay)
- P2P-Chat in `ChatScreen` eingebaut mit `deriveRoomId()` fuer echte Kontakte

## Chat-Funktionen

- Chat-Verlauf in localStorage gespeichert (max 500 Nachrichten pro Room)
- Chat-Liste zeigt echte Kontakt-Chats, Live-Update bei neuen Nachrichten
- Ungelesene Nachrichten: Badge in Chat-Liste + Dashboard Chat-Kachel + Browser-Benachrichtigungen
- In-App Toast-Popup bei neuer Nachricht wenn Chat nicht offen
- Offline Message Queue: Nachrichten werden lokal als "pending" gespeichert (Uhr-Icon) und automatisch gesendet wenn Empfaenger online kommt
- Emoji Picker (`@emoji-mart/react`) — Dark Theme, deutsch, Cursor-Position-Insert
- Fotos & Dateien senden: Chunked Base64 ueber verschluesselten DataChannel (14KB Chunks, max 5 MB), mit Backpressure-Kontrolle
- Sprachnachrichten: MediaRecorder API (WebM/Opus), gedrueckt halten zum Aufnehmen, Audio-Player mit Play/Pause + Fortschrittsbalken + Seek, Blob-URL fuer Edge-Kompatibilitaet
- Chat-Suche: Suchfeld im Header, Treffer werden gelb hervorgehoben
- Medien-Galerie: Alle Bilder, Sprachnachrichten und Dokumente eines Chats als Uebersicht
- Chat-Hintergrund: 6 Farbverlaeufe waehlbar, pro Chat in localStorage gespeichert
- Chatverlauf loeschen mit Bestaetigungsdialog

## Audio & Video Anrufe (`CallOverlay.tsx`)

- WebRTC Audio P2P via separater PeerConnection, Signaling ueber DataChannel
- WebRTC Video P2P, Remote gross / eigenes Bild klein (PiP)
- PiP frei verschiebbar (Drag & Drop, Startposition unten links)
- Controls Auto-Hide nach 3s bei Video-Anrufen, Tap zum Einblenden
- Erweiterbare `CallControls`-Komponente (vorbereitet fuer ScreenShare, Effekte etc.)
- Mute/Kamera-Toggle, Auflegen-Button
- Video-Fallback: Wenn Kamera fehlt, nur Audio mit Avatar + Hinweis-Banner
- Eingehende Anrufe: globales Banner auch wenn Chat nicht offen, Annehmen/Ablehnen
- Anruf starten aus Kontakt-Detail-Modal (Audio/Video)

## Kontakt-Management & Blockieren (2026-03-31)

- Kontakt entfernen: Bestaetigungsdialog, Signal ueber Inbox-WS + DataChannel
- Contact-Status-System: `mutual` / `pending` / `removed`
- Chat-Sperre bei einseitigem Kontakt: Nachrichten empfangen ja, senden nein, mit Hinweis
- Blockieren: Button in Kontakt-Detail-Modal (orange) + Chat-Menue
- Blockliste: `aregoland_blocked` in localStorage, CRUD Funktionen
- Blockliste unter Datenschutz & Sicherheit mit Aufheben-Button + Toast
- Kontakt-Detail-Modal: Klick auf Name/Avatar im Chat-Header
- Kontakt-Kategorien: Mehrfachauswahl mit Checkboxen
- Kategorien als Badges unter dem Kontaktnamen
- Kontakt-Liste + Chat-Liste aktualisieren sich live (reaktive Version-Counter)

## Zentrales Tab/Listen-System

- Zentrale Kategorie-Liste in App.tsx (`arego_tabs`)
- Standard-Kategorien: Alle, Familie, Freunde, Arbeit, Schule, Kinder, Spaces, Sonstige
- TabManagementModal: Reihenfolge aendern, ein-/ausblenden, neue hinzufuegen, benutzerdefinierte loeschen
- Synchron in PeopleScreen, ChatListScreen und ContactDetailModal

## Online-Status System

- Presence-Protokoll auf Signaling-Server v4 (`presence_subscribe` / `presence_update`)
- Gruener Punkt = online, grauer Punkt = offline
- Multi-Tab-Support: erst offline wenn letzter Tab schliesst
- DSGVO: nur aktueller Status im RAM, kein Verlauf
- Online-Status verstecken: Toggle in Einstellungen

## Kalender Stufe 1 (`CalendarScreen.tsx`, 2026-03-30)

- Drei Ansichten: Monat / Woche / Tag
- Monatsansicht: Grid mit farbigen Termin-Pills, max 2 pro Tag, "+X weitere"
- Wochenansicht: 7-Spalten-Zeitstrahl (06:00-21:00)
- Tagesansicht: Zeitstrahl mit Termin-Bloecken, ganztaegige Events oben
- Termin erstellen: Titel, Datum, Uhrzeit, Dauer, Erinnerung, 6 Farben, Notiz
- Erinnerungen via Browser Notification API
- Daten in localStorage (`arego_calendar_events`)

## WelcomeScreen (erweitert 2026-03-31)

- 3 Buttons: Loslegen, Wiederherstellen, Kind hinzufuegen
- Sprach-Selector oben rechts: Flagge + Kuerzel, Dropdown DE/EN/LT
- 5 Views: welcome, restore, restoreScan, restoreKey, child
- Auto-Skip bei vorhandener Identitaet

## Internationalisierung (i18n, 2026-03-31)

- i18next + react-i18next + i18next-browser-languagedetector
- 3 Sprachen: Deutsch (de), Englisch (en), Litauisch (lt)
- Sprachdateien: `src/i18n/locales/{de,en,lt}.json`
- Fallback Deutsch, Browser-Spracherkennung, localStorage-Persistierung
- Sprachwahl in Einstellungen
- Kalender vollstaendig uebersetzt

## Familie & Kinder (`SettingsScreen.tsx`, `identity.ts`, 2026-03-31)

- Bereich "Familie & Kinder" in Einstellungen
- Kind-Konten: Liste, QR-Code generieren, FSK-Auswahl
- FSK-Stufen: 6 (Standard), 12 (waehlbar), 16+18 (ausgegraut, ID noetig)
- `ChildAccount` Interface, CRUD-Funktionen
- WelcomeScreen Kind-hinzufuegen Flow

## Profil-Screen (`ProfileScreen.tsx`, 2026-03-31)

- Alle Felder persistent in localStorage (`arego_profile`)
- Avatar-Upload (max 500KB, Base64)
- Social Media dynamisch: 12 Plattformen, unbegrenzt viele Links
- Adressen dynamisch: Label-Presets, unbegrenzt viele
- Kontakte dynamisch: Typ + Label, unbegrenzt viele
- Migration alter flacher Felder

## Einstellungen (`SettingsScreen.tsx`, 2026-03-31)

- 5 Unterseiten: App, Benachrichtigungen, Datenschutz & Sicherheit, Familie & Kinder, Hilfe & Support
- Benachrichtigungen: Push/Nachrichten/Anrufe/Toene ein/aus
- Datenschutz: Arego-ID, Auffindbarkeit, Profil-Sichtbarkeit, Datenspeicher, Daten loeschen
- Hilfe & Support: 5 FAQ-Eintraege, Version + Lizenz

## QR-Code Screen (`QRCodeScreen.tsx`, 2026-03-31)

- "Mein Code" Tab: Echter Kontakt-QR-Code mit Timer (10 Min TTL)
- Teilen + Speichern als PNG
- "Scannen" Tab: Echte Kamera via `html5-qrcode`
- Intelligente QR-Erkennung: Kontakt / Kind-Verknuepfung / URL / Unbekannt

## Spaces — Schritt 1: Erstellen mit Vorlagen (2026-03-31)

- 7 Space-Vorlagen mit Icons, Farbgradienten, Standard-Einstellungen
- Erstellungs-Flow: Vorlage -> Name + Beschreibung -> Relay-Node Info -> Erstellen
- Drag & Drop Sortierung via Reorder
- `Space` Interface mit channels[], subrooms[]

## Spaces — Schritt 2: Mitglieder & Rollen (2026-03-31)

- QR-Einladung mit einstellbarer Ablaufzeit
- Rollen: Founder, Admin, Moderator, Co-Host, Mitglied, Gast
- Mitglieder-Tab: nach Rollen gruppiert, farbige Badges
- Rolle aendern, Mitglied entfernen

## Spaces — Schritt 3: Neuigkeiten + Uebersicht (2026-03-31)

- Neuigkeiten-Tab: Beitraege erstellen, Filter-Chips, Upvote, Kommentare, Pin
- Termin-Badge mit RSVP-System
- Uebersicht-Tab rollenbasiert

## Spaces — Schritt 4: Chats-Tab + Unterraeume (2026-04-01)

- Chats-Tab: Channel-Liste, Chat erstellen mit Rollen-Zugriffsrechten
- Globaler Chat automatisch bei Space-Erstellung
- Gruppen-Chat Screen ueber Signaling-Server WebSocket Relay
- Signaling-Server: `space-chat:` Rooms (500 Peers, Offline-Pufferung)
- Unterraeume: Admin erstellt, eigene Mitgliederliste + eigener Chat
- `SpaceChannel`, `SpaceChatMessage`, `SpaceSubroom` Interfaces
- i18n-Keys in DE/EN/LT

## Spaces — Schritt 5: Profil-Tab + Rollen & Rechte (2026-04-02)

- Profil-Tab: Avatar, Name, Rolle-Badge, Arego-ID
- Netzwerk-Helfer Toggle (nur wenn Rolle es erlaubt) mit Erklaerungstext
- Mobile Daten Toggle (Standard: AUS, bei Mobilfunk automatisch deaktiviert)
- Bestaetigung bei manuellem Aktivieren auf Mobilfunk
- Benachrichtigungen: 3 Modi (Alle/Stumm/Keine) + 6 einzelne Toggles
- Rollen & Rechte (Einstellungen): readChats Voraussetzung fuer writeChats
- Founder & Admin als ausgegraute, nicht konfigurierbare Eintraege angezeigt
- Gast-Rolle am Ende, nicht loeschbar, Hinweis "Standard fuer alle ohne Rolle"
- Eigene Rollen: Erstellen/Bearbeiten/Loeschen mit 6 Berechtigungen + Farbe

## Kontakt hinzufuegen — QR-Code Scanner (2026-04-02)

- QR-Code Tab oeffnet jetzt direkt die Kamera (Html5Qrcode)
- QR-Code wird gescannt und Kontakt automatisch hinzugefuegt
- Kein manuelles Textfeld mehr — Textarea entfernt
- Kamera-Bereich mit Abbrechen-Button (X)
- Fehlermeldung bei ungueltigem QR-Code oder Kamera-Zugriff
- Fehlende i18n-Keys gefixt: addContact.addContact, shortCodeHint, privacyInfo, generateNewCodes

## Chats — Suche (2026-04-02)

- Suche-Icon oben rechts im Chats-Header funktioniert jetzt
- Klick oeffnet expandierbare Suchleiste mit Animation
- Filtert Chats nach Kontaktname in Echtzeit
- X-Button schliesst die Suche

## Einheitlicher Header — AppHeader.tsx (2026-04-02)

- Neue wiederverwendbare Komponente `AppHeader.tsx`
- Identisches Layout in allen Screens: Chats, Kontakte, Kalender, Spaces
- Links: Zurueck-Pfeil + Titel
- Mitte: Primaer-Button (gleiche Hoehe wie Avatar)
- Rechts: Optionale Extra-Buttons + Profil-Avatar mit Dropdown-Menue
- Profil-Avatar Klick oeffnet Dropdown: Profil, QR-Code, Einstellungen
- Radix UI DropdownMenu (gleich wie Dashboard)

## Kalender — Suche (2026-04-02)

- Suche-Icon oben rechts im Kalender-Header
- Expandierbare Suchleiste mit Animation
- Suche nach Event-Titeln und Beschreibungen (Notizen)
- Ergebnisse als Liste mit Farbindikator, Datum, Uhrzeit
- Klick auf Ergebnis springt zum Datum (Tagesansicht)
- Leerer Zustand: "Kein Termin gefunden"

## Spaces — Schritt 7: Mobile Daten Erkennung (2026-04-02)

- navigator.connection API Pruefung
- Bei Mobilfunk (cellular): Netzwerk-Helfer automatisch AUS
- Hinweis: "Mobile Daten erkannt — Netzwerk-Helfer deaktiviert"
- Manuelle Aktivierung mit Warnung moeglich

## Spaces — Tags + Suche (2026-04-02)

- Suche-Icon oben rechts in Titelzeile (gleicher Stil wie Chats)
- Klick klappt Suchleiste auf mit Animation
- X-Button zum Leeren/Schliessen der Suche
- Leerer Zustand: "Kein Space gefunden"
- Drag & Drop: kein versehentlicher Klick nach Drag (isDragging-Guard)
- 10 vordefinierte Tags: Familie, Schule, Verein, Handwerk, Community, Gemeinde, Sport, Musik, Gaming, Sonstiges
- Tag-Auswahl bei Space-Erstellung
- Tags als kleine Chips unter Space-Name (Liste + Detail-Header)
- Tags klickbar → filtert Spaces-Liste nach Tag
- Tag-Filter Chips ueber der Liste
- Tags nachtraeglich bearbeiten in Einstellungen-Tab (Admin/Founder)
- Tags UX: Chips mit X zum Entfernen, "+ Tag" Dropdown mit eigenem Tag erstellen (2026-04-02)

## Spaces — Sichtbarkeit, Suche & Sortierung (2026-04-02)

- Sichtbarkeit (oeffentlich/privat) als Einstellung im Settings-Tab (Admin/Founder)
- Sichtbarkeit gespeichert im Space-Objekt (`visibility: "public" | "private"`)
- Suche zeigt bei aktiver Eingabe auch oeffentliche Spaces anderer Nutzer (aus localStorage simuliert)
- Sort-Icon neben Suchleiste mit Dropdown: Aktivitaet, Name A-Z, Tags, Zuletzt beigetreten
- Sortierung wird auf alle Spaces angewendet (Aregoland Official immer oben)

## Aregoland Official Space (2026-04-02)

- Hardcodierter "Aregoland" Space bei jedem Nutzer automatisch sichtbar
- Nicht loeschbar, nicht verlassbar
- 4 Tabs: Neuigkeiten, Uebersicht, Support, World
- Neuigkeiten aus aregoland-news.json (automatisch befuellt bei CC-Commits)
- Uebersicht: Hintergrundgeschichte + App-Version + visuelle Roadmap (Timeline mit fertig/in Arbeit/geplant)
- Support: "Kommt bald" mit KI-Support-Vorschau
- World: "Kommt bald" mit World-Vorschau
- Gradient blau/lila (Aregoland Branding), Globe-Icon
- App-Version via vite define (__APP_VERSION__) aus package.json

## Nginx Reverse Proxy (2026-03-31)

- Siehe [architecture.md](architecture.md)

## TURN-Server coturn (2026-03-30)

- Siehe [architecture.md](architecture.md)

## PWA (2026-03-31)

- Siehe [architecture.md](architecture.md)
