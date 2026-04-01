# Roadmap & Offene Punkte

> Stand: 2026-04-01

## Naechste Schritte (Prioritaet)

1. **Spaces vollstaendig implementieren** (siehe [spaces.md](spaces.md))
   - Schritt 1: Space erstellen mit Vorlagen (2026-03-31)
   - Schritt 2: Mitglieder & Rollen (2026-03-31)
   - Schritt 3: Neuigkeiten-Tab + Uebersicht nach Rollen (2026-03-31)
   - Schritt 4: Chats-Tab (2026-04-01)
   - Schritt 5: Profil-Tab + Rollen & Rechte (2026-04-01)
   - Schritt 6: Wiki/Seiten

2. **World — Social Media** (siehe [world-concept.md](world-concept.md))
   - World-Tab in Spaces (Coming Soon Hinweis)
   - World-Kachel auf Hauptscreen (Coming Soon Hinweis)
   - Backend: oeffentlicher Feed-Endpoint
   - FSK-gefilterter Feed
   - Post-Erstellung fuer Space-Admins
   - KI-gestuetzte Post-Erstellung
   - Bildschirmzeit-Enforcement
   - Oeffentliche URLs (aregoland.de/world/...)

### Zukuenftige Feature-Bereiche (Langfrist-Roadmap, siehe [aregoland-vision.md](aregoland-vision.md))

**Dokumente (Stufe 2)**
- [ ] Datei/Dokument P2P versenden
- [ ] Ordner-System (z.B. "Gesundheit", "Schule", "Behoerden")
- [ ] Dokument-Ablaufdatum (nach X Tagen automatisch weg)

**Institutionen (Stufe 3)**
- [ ] Spaces fuer Gemeinden/Schulen/Vereine optimieren
- [ ] Formular-System in Spaces
- [ ] Digitale Identitaetsbestaetigung via EUDI Wallet

**Gesundheit (Stufe 4 — nach Zertifizierung)**
- [ ] Gesundheitsordner mit Befunden
- [ ] Arzt-Space Integration
- [ ] Selbstauskunft-Profil
- [ ] Gesundheitskarte digital

**EUDI Wallet Integration** (siehe [eudi-integration.md](eudi-integration.md))
- [ ] EUDI Sandbox Zugang beantragen (Relying Party)
- [ ] EUDI GitHub SDK einbinden und testen
- [ ] FSK-Automatik per EUDI Geburtsdatum implementieren
- [ ] EUDI Wallet Integration vorbereiten

**Social Media Vorbereitung**
- [ ] Social Media Accounts erstellen (Instagram, TikTok, YouTube, LinkedIn)
- [ ] Reichweite aufbauen vor Launch

3. **Pay-Modul** — wenn fertig, ist App marktreif (siehe [geschaeftsmodell.md](geschaeftsmodell.md))

4. **Google Play Store + Apple App Store** (Capacitor.js oder React Native)

5. **KI-Support** (nach Server-Upgrade auf 8GB RAM)

6. **Mehrsprachigkeit erweitern** (weitere EU-Sprachen, siehe [sprachen.md](sprachen.md))

7. **Oeffentliche Suche/Auffindbarkeit** verfeinern (Directory-Endpoint)

8. **Kalender erweitern**
   - Stufe 2: Kinder-Integration
   - Stufe 3: Termine P2P teilen
   - Stufe 4: Spaces-Integration
   - Import/Export: iCal (.ics)

9. **Kinderschutz-Features (FSK)** — siehe [kinderschutz.md](kinderschutz.md)

10. **Recovery-Flow erweitern**
   - QR-Code scannen: erledigt (html5-qrcode)
   - Datei-Upload: Nutzer waehlt gespeicherte `aregoland-recovery-*.txt` Datei
   - Textschluessel eingeben: erledigt

### Bereits erledigt:
- Kalender-Modul Stufe 1 (2026-03-30)
- TURN-Server (coturn, 2026-03-30)
- Sprach-Selector i18n (2026-03-31) — 3 Sprachen: DE, EN, LT

---

## Offene Punkte

- Konto-Wiederherstellung via zwei Vertrauenspersonen wurde verworfen (Missbrauchspotenzial). Stattdessen: QR-Code-basierte Wiederherstellung mit lokalem Schluessel.
- Pay-Modul noch nicht implementiert.
- Backend-Integration (Supabase) geplant.

### Erweiterter Backup/Recovery-Flow (noch nicht implementiert)

- Verschluesselter Backup-Download als Datei (.arego Format)
- Nutzer waehlt Inhalt: Identitaet/Schluessel, Kontakte, Chat-Historie oder alles
- Backup ist E2E-verschluesselt
- Regelmaessige Erinnerungen ("Du hast seit 6 Monaten kein Backup gemacht")
- Wiederherstellung: Backup-Datei hochladen -> alles zurueck

### Datenverwaltung & Bereinigung (noch nicht implementiert)

- Unter Einstellungen -> "Datenschutz & Sicherheit" -> "Speicher verwalten"
- Anzeige: wie viel Speicher belegt ist (Chats, Fotos, Dokumente getrennt)
- Bereinigung: Nutzer waehlt was geloescht wird
- Bestimmte Chats von Bereinigung ausschliessen
- Zeitraum waehlbar, automatische Bereinigung einstellbar

### Intelligente Datenverwaltung (noch nicht implementiert)

- Geraetespeicher pruefen (Storage API: navigator.storage.estimate())
- Warnung wenn Speicher knapp wird
- Automatische Bereinigung mit Nutzer-Zustimmung

### Offizieller "Arego" System-Chat (noch nicht implementiert)

- Automatisch bei jedem Nutzer als erster Chat vorhanden
- Angepinnt, nicht loeschbar, nicht stummschaltbar
- Aregoland postet Updates, Neuigkeiten, Patch-Notes
- Nutzer chattet direkt mit KI: Feedback, Support, Fragen — alles in einem
- Ersetzt separaten Feedback-Button + KI-Support in Hilfe & Support komplett
- KI antwortet intelligent (siehe Intelligentes Feedback-System unten)
- Voraussetzung: Server-Upgrade auf mind. 8GB RAM, Ollama lokal

### Angepinnte Chats (noch nicht implementiert)

- Langer Druck auf Chat in ChatListScreen → Kontextmenue → "Anpinnen"
- Angepinnte Chats immer oben in der Liste mit Pin-Icon
- Arego System-Chat automatisch angepinnt
- Reihenfolge der angepinnten Chats anpassbar
- In localStorage gespeichert (`aregoland_pinned_chats`)

### Verifizierungs-Filter (noch nicht implementiert)

- Kontakte als "verifiziert" markieren
- Filter in Kontaktliste: nur verifizierte Kontakte
- Spaces koennen "nur verifizierte Mitglieder" verlangen

### Zwei Profile parallel (noch nicht implementiert)

- Ein Konto, zwei Arego-IDs (z.B. Privat + Arbeit)
- Profil-Wechsel in der App

### Wiederherstellung erweitern (noch nicht implementiert)

- Option: Wiederherstellung via Vertrauensperson (Kontakt haelt verschluesseltes Fragment)
- Option: EUDI Wallet basierte Wiederherstellung
- Dezentrale Wiederherstellung: Shamir's Secret Sharing

### Wiederherstellung via Vertrauensperson + EUDI Wallet (Konzept verfeinert)

- Vertrauensperson oeffnet App, waehlt den zu wiederherstellenden Kontakt aus ihrer Liste
- Betroffene Person verifiziert sich mit EUDI Wallet direkt am Geraet der Vertrauensperson
- Schluessel wird im Moment aus der EUDI Identitaet abgeleitet — nichts wird gespeichert
- Vertrauensperson hat zu keinem Zeitpunkt Zugriff auf den Schluessel

### Dezentrale Daten-Wiederherstellung (noch nicht implementiert)

- Nach Geraeteverlust: Kontakte pushen gespeicherte Daten zurueck
- Kontakte haben Arego-ID gespeichert -> pushen Kontaktdaten zurueck
- Spaces-Mitglieder pushen Space-Daten zurueck
- Chat-Verlauf: Kontakt kann seine Kopie optional teilen
- "Soziales Netzwerk als Backup" — Identitaet entsteht durch Beziehungen

### Politik-Space (noch nicht implementiert)

- Spezieller Space-Typ fuer demokratische Abstimmungen
- Geheime Abstimmungen: niemand sieht wie wer abgestimmt hat, nicht mal Admin
- Partei-Zugehoerigkeit optional, komplett anonym speicherbar
- Ergebnis: nur Gesamtzahlen sichtbar
- Zero-Knowledge Voting (kryptografisch manipulationssicher)

### Aregoland offizieller Space (noch nicht implementiert)

- Offizieller Space von Aras/Aregoland
- Updates, Neuigkeiten, Changelog posten
- Nutzer koennen beitreten, lesen, Feedback geben

### Oeffentliche Space-Suche (noch nicht implementiert)

- Spaces die oeffentlich sind koennen gefunden werden
- Suche nach Name, Kategorie, Vorlage
- Space-Vorschau vor Beitritt (Name, Beschreibung, Mitgliederzahl, FSK)

### Persoenliche Statistiken (noch nicht implementiert)

- Lokal auf Geraet, nur fuer den Nutzer selbst sichtbar
- Genutzte Zeit pro App-Bereich
- Nachrichten gesendet/empfangen
- Selbst getippte Zeichen
- Termine erstellt, Anrufe gemacht + Dauer
- Spaces beigetreten
- Fuer Spaces: anonyme Space-Statistiken fuer Admin (keine Namen)

### Intelligentes Feedback-System (Teil des Arego System-Chats)

- Laeuft innerhalb des "Arego" System-Chats (kein separater Bereich)
- Nutzer schreibt Text ODER sendet Voice-Nachricht frei
- Optional: Foto/Video anhaengen
- KI fragt am Ende: "Darf ich deine Geraeteinfos haben?" → Ja/Nein
- KI stellt max. 1-2 kurze Rueckfragen wenn noetig
- KI sortiert im Hintergrund: Bug/Idee/Lob/Frage
- Kein Formular, keine Pflichtfelder, keine Kategorieauswahl

KI antwortet sofort intelligent:
- Bug bereits bekannt: "Dieser Bug wurde bereits von X Personen gemeldet, wird im naechsten Patch behoben"
- Bug neu: "Danke! Ich habe es aufgenommen und weitergeleitet"
- Idee bereits vorgeschlagen: "Du bist Person Nr. X die das vorschlaegt — steigt auf Prioritaetsliste"
- Idee einzigartig: "Noch niemand hat das vorgeschlagen, ich leite es weiter"
- Bereits implementiert: "Das gibt es bereits! Schau unter Einstellungen → XY"
- Abgelehnte Idee: "Diese Idee wurde bereits diskutiert und erstmal zurueckgestellt weil [Grund]"

Ziel: Nutzer fuehlt sich gehoert, keine doppelten Bug-Reports, Community-Voting ohne Voting-System

### Erweitertes Chunking & P2P Dateiuebertragung (noch nicht implementiert)

- Chunks durchnummeriert mit Selective ACK
- Empfaenger meldet welche Chunks fehlen → Sender schickt nur fehlende
- Resume bei Verbindungsabbruch (weitermachen ab letztem bestaetigten Chunk)
- Multi-Source Download: mehrere Nodes senden gleichzeitig verschiedene Chunks
- Video Progressive Playback: Video startet waehrend Rest noch laedt
- Basis fuer Video-Sharing Spaces und Live-Streaming

### P2P Cloud Speicher (Zukunftsvision, noch nicht implementiert)

- Nutzer stellt freiwillig Speicherplatz zur Verfuegung (waehlbar: 10GB/50GB/100GB/eigen)
- Dateien werden verschluesselt auf mehreren Geraeten verteilt (wie IPFS/BitTorrent)
- Space-Mitglieder teilen Speicher untereinander
- Unternehmen: 5000 Laptops x 500GB = 2.500TB kostenlose Unternehmens-Cloud
- Nutzer kann jederzeit widerrufen
- Geraet muss eingeschaltet/verbunden sein als "Speicher-Node"
- DSGVO: alles verschluesselt, niemand sieht fremde Daten
- Ersetzt AWS/Azure/Google Cloud fuer Unternehmen die Aregoland nutzen
