# Roadmap

> Stand: 2026-04-03

## Bereits fertig

- Passwordless Registration (WebCrypto ECDSA)
- QR + Kurzcode Kontakte hinzufügen
- E2E verschlüsselter P2P Chat
- WebRTC Audio/Video Anrufe
- Online/Offline Status
- Sprachnachrichten
- Datei/Bild senden (bis 5MB)
- Ungelesene Badges + Browser Notifications
- Gegenseitiges Kontaktsystem (mutual)
- Chat-Verlauf (localStorage)
- Emoji Picker
- Kontakt blockieren/entfernen
- Kalender Stufe 1 (Monat/Woche/Tag, Events, Erinnerungen)
- Spaces Schritt 1: Erstellen mit Vorlagen
- Spaces Schritt 2: Mitglieder & Rollen
- Spaces Schritt 3: Neuigkeiten-Tab + Übersicht
- Spaces Schritt 4: Chats-Tab + Unterräume
- Spaces Schritt 5: Profil-Tab + Rollen & Rechte
- Spaces Schritt 7: Mobile Daten Erkennung
- Spaces: Tags + Suche + Sortierung
- Spaces: Sichtbarkeit (öffentlich/privat)
- Aregoland Official Space (hardcoded, nicht löschbar, Roadmap-Timeline)
- AppHeader.tsx (einheitlicher Header überall)
- Chats Suche
- Kalender Suche
- QR-Code Scanner (Kontakt hinzufügen via Kamera)
- i18n: DE / EN / LT
- PWA (installierbar, offline-fähig)
- Nginx + SSL (Let's Encrypt, alle 3 Domains)
- coturn TURN-Server
- Signaling-Server v4 (Docker)
- Profil-Screen (Avatar, Social Media, Adressen)
- Einstellungen (Benachrichtigungen, Datenschutz, Familie & Kinder)
- Kind-Konten + FSK-System (Grundlage)
- Recovery: QR scannen + Textschlüssel eingeben

## In Arbeit (muss vor Soft Launch fertig sein)

- Spaces Verbesserungen: Melde-System + Mitglieder-Kontrolle
- World — öffentlicher FSK-Feed
- Recovery: Datei-Upload (aregoland-recovery-*.txt)
- Recovery End-to-End Test (Registrieren → löschen → wiederherstellen)
- Prod-Build: pnpm build + Nginx statisch (Vite Dev-Server raus)
- Beta-Banner in App ("Work in Progress — mach mit!")
- Spaces: Wiki/Seiten (Schritt 6)
- Spenden-Button in App (PayPal)

## Geplant

### Launch-Vorbereitung (nicht technisch)
- E-Mail Weiterleitungen einrichten (hallo@, paypal@, social@, support@, noreply@aregoland.de)
- PayPal Konto mit paypal@aregoland.de erstellen
- GitHub Repository public schalten + README ausbauen + CONTRIBUTING.md
- Canva Konto + Aregoland Branding-Kit
- Metricool Konto
- Social Media Konten: TikTok, Instagram, X, Facebook, LinkedIn, Mastodon

### Features
- Spaces Pay: EPC QR Rechnungen (gebührenfrei, SEPA Instant) — siehe spaces-pay.md
- Kalender Stufe 2: Kinder-Integration
- Kalender Stufe 3: Termine P2P teilen
- Kalender Stufe 4: Spaces-Integration
- Kalender Import/Export: iCal (.ics)
- Kinderschutz FSK vollständig (EUDI Wallet, serverseitig unsichtbar unter 16)
- EUDI Wallet Integration (Sandbox 2026, Produktion Dez. 2026)
- World: Post-Erstellung, KI-gestützt, Bildschirmzeit-Enforcement
- Politik-Kachel: Gesetze in Alltagssprache, anonymes Voting
- KI-Support / Arego System-Chat (nach Server-Upgrade 8GB RAM)
- Spaces Video Calls + Streaming (Meeting- + Webinar-Modus)
- Spaces Shop-System
- Dokumente P2P (Ordner-System, Ablaufdaten)
- Institutionen: Gemeinden, Schulen, Vereine (Formulare, EUDI)
- Gesundheitsordner (nach Zertifizierung)
- Angepinnte Chats
- Zwei Profile parallel (Privat + Arbeit)
- Persönliche Statistiken (lokal)
- P2P Cloud-Speicher (Zukunftsvision)
- Erweiterter Backup: .arego Format, E2E verschlüsselt
- Dezentrale Wiederherstellung: Shamir's Secret Sharing + EUDI
- Verifizierungs-Filter
- Öffentliche Space-Suche (Directory-Endpoint)
- Mehrsprachigkeit: weitere EU-Sprachen
- Google Play Store + Apple App Store (Capacitor.js)

### Nebenprojekt
- Emma & Mia YouTube Kanal (KI-Geschichten, kein Zeitdruck)
