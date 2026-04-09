# Spaces — Vollstaendige Vision

> Stand: 2026-04-02

## Space-Vorlagen (beim Erstellen waehlbar)

- ✅ Familie — privat, alle sehen alle, geteilter Kalender
- ✅ Schule — Lehrer + Eltern + Kinder, Hausaufgaben, Termine
- ✅ Verein/Sport — Trainer sichtbar, Anwesenheit, Kurstermine
- ✅ Unternehmen — Abteilungen, Rollen, formell
- ✅ Amt/Gemeinde — oeffentlich, Ankuendigungen, Buerger-Kommunikation
- ✅ Community — offen oder geschlossen
- ✅ Benutzerdefiniert — alles selbst einstellen

## Rollen-System

- ✅ **Founder** (nicht entfernbar, automatisch Netzwerk-Helfer)
- ✅ **Admin** (vom Founder ernannt, automatisch Netzwerk-Helfer)
- ✅ **Moderator** (kann in Globalem Chat posten, automatisch Netzwerk-Helfer)
- ✅ **Mitglied**
- ✅ **Gast** (nur lesen)
- ✅ **Eigene Rollen** (Admin erstellt, mit konfigurierbaren Rechten)

> **Netzwerk-Helfer** (frueher "Co-Host" / "Relay-Node"):
> - ✅ Founder, Admin, Moderator sind automatisch Netzwerk-Helfer
> - ✅ Bei eigenen Rollen: Admin entscheidet per Toggle "Netzwerk-Helfer erlauben"
> - ✅ Netzwerk-Helfer helfen den Space stabil zu halten (Relay-Node fuer Chats und Calls)
> - ✅ Jeder Netzwerk-Helfer kann die Funktion im Profil-Tab deaktivieren
> - ✅ "Mobile Daten nutzen" Toggle (Standard: AUS) — bei mobilem Internet automatisch deaktiviert
> - ✅ Automatische Erkennung: bei Mobile Daten → Netzwerk-Helfer automatisch AUS + Hinweis

## Space-Einstellungen (Admin)

- ✅ Mitglieder sehen sich gegenseitig: Ja/Nein
- ✅ Oeffentlich beitreten: Ja/Nein
- ✅ ID-Verifizierung zum Beitritt: Ja/Nein (Standard: Ja)
- ✅ QR-Code Einladung mit Ablaufzeit
- ✅ Globaler Chat: nur Admins/Moderatoren koennen posten
- ✅ Bei Space-Erstellung: Info-Box erklaert Privacy + Netzwerk-Helfer Prinzip
- ✅ **Sichtbarkeit**: Oeffentlich oder Privat
  - Oeffentlich: Space erscheint in der Suche anderer Nutzer
  - Privat: nur per Einladung erreichbar
- ✅ **Chats verwalten**: Chat erstellen/bearbeiten (Name + Rollen-Zugriffsrechte + Sichtbarkeit), Chats loeschen
  - Jeder Chat zeigt: Name + Rollen-Badges (Lesen gruen, Schreiben blau)
  - Bearbeiten-Stift oeffnet vorausgefuellten Dialog
  - Rollen-Auswahl: Moderator, Mitglied + alle eigenen Rollen (dynamisch geladen)
  - Gast erscheint nicht als Rolle sondern als Hinweis: "Gast = Standard fuer alle ohne zugewiesene Rolle"
  - Toggle "Mitglieder sehen sich gegenseitig in diesem Chat" (Standard: AN)
  - Founder & Admin haben immer vollen Zugriff
- ✅ **Rollen & Rechte**: Eigene Rollen erstellen (Name + Farbe + Rechte)
  - Rechte pro Rolle:
    - Chats lesen (Voraussetzung fuer Chats schreiben)
    - Chats schreiben (ausgegraut wenn Chats lesen deaktiviert)
    - Termine erstellen
    - Neuigkeiten posten
    - Mitglieder einladen
    - Netzwerk-Helfer erlauben (bei Aktivierung: Erklaerungstext fuer Admin)
  - Rechte-Abhaengigkeit: kein Lesen = kein Schreiben (automatisch deaktiviert + ausgegraut)
  - Founder & Admin haben immer vollen Zugriff (nicht konfigurierbar)
  - **Gast-Rolle** am Ende der Liste: nicht loeschbar, Rechte vom Admin anpassbar
    - Hinweis: "Gast ist die Standard-Rolle fuer alle ohne zugewiesene Rolle"
    - guestPermissions im Space-Objekt gespeichert
  - Jede Rolle: Bearbeiten-Stift oeffnet vorausgefuellten Editor
- ✅ **Erscheinungsbild**: Icon (Emoji oder Bild-Upload) + Banner-Farbe waehlbar
- ✅ **Tags bearbeiten**: Tags hinzufuegen/entfernen, vordefinierte + eigene Tags
- ✅ **Gruender-Rechte uebertragen**: Founder waehlt Admin → Bestaetigung → alter Founder wird Admin
- ✅ **Space loeschen**: Mehrstufiger Dialog:
  1. "Moechtest du diesen Space wirklich loeschen?" + Warnung
  2. "Moechtest du den Space lieber uebertragen?" → Ja/Nein
  3. "Ich verstehe, alles wird geloescht" → Endgueltig loeschen

## Tabs

- ✅ **Uebersicht**: Personalisierbar via Stift-Icon oben rechts
  - Drag & Drop Editor: Widgets in gewuenschte Reihenfolge ziehen + ein/ausblenden
  - 6 Widgets: Angepinnte Beitraege, Ankuendigungen, Statistiken, Termine, Aktive Chats, Mitglieder online
  - Layout pro Nutzer in localStorage (`aregoland_space_layout_{spaceId}`)
  - Standard-Layout wenn nicht angepasst
- ✅ **Neuigkeiten**: Beitraege, Filter, Kommentare, RSVP
- ✅ **Chats**: Nur die Liste der vorhandenen Chats (kein Erstellen-Button). Unterraeume als separate Sektion.
  - Gruppen-Chat: Text, Fotos/Bilder (inline), Dateien (Download-Link), Sprachnachrichten (Play/Pause)
  - Keine Groessenbeschraenkung: Chunked Transfer (64KB Chunks, durchnummeriert)
  - Fortschrittsbalken bei grossen Dateien, Warnung bei >50MB
  - @Erwaehnung: @ tippen → Mitglieder-Liste, erwaehnte Person bekommt Benachrichtigung
  - Bueroklammer-Icon fuer Fotos & Dateien, Mikrofon-Icon fuer Voice (gedrueckt halten)
- ✅ **Mitglieder**: Nach Rollen gruppiert, Einladen, Rolle aendern
  - Sortierung: nach Rolle, Name, Beitrittsdatum + Uhrzeit
- ✅ **Profil**: Eigenes Profil im Space:
  - Name, Rolle-Badge
  - Netzwerk-Helfer Toggle (nur wenn Rolle es erlaubt) + Erklaerungstext ueber Verschluesselung
  - Mobile Daten Toggle (nur wenn Netzwerk-Helfer aktiv)
  - Automatische Mobile-Daten-Erkennung mit Hinweis
  - Benachrichtigungen: 3 Modi (Alle/Stumm/Keine) + 6 einzelne Toggles
- ✅ **Einstellungen**: Erscheinungsbild, Tags, Sichtbarkeit, Chats verwalten, Rollen & Rechte, Gruender-Rechte uebertragen, Space loeschen

## Spaces-Uebersichtsliste

- ✅ Space-Karten: Gradient fuellt ganze Karte, Icon mit Buchstaben-Fallback (Initials) zentriert im Banner, Bild-Upload fuer Icon moeglich
- ✅ Mitgliederzahl und Tags aus Space-Karten entfernt (Tags nur fuer Suche im Hintergrund)
- ✅ Template/Schablonen-Label entfernt ueberall
- ✅ Aregoland Official Space immer oben
- ✅ Drag & Drop Sortierung (Reorder)
- ✅ Unread-Badge auf Space-Karten
- ✅ Suche (Name + Tags), oeffentliche Spaces anderer Nutzer bei aktiver Suche sichtbar
- ✅ Tag-Filter nur bei aktiver Suche sichtbar
- ✅ Sortierung: Aktivitaet, Name A-Z, Tags, Zuletzt beigetreten (Sort-Icon neben Suchleiste)

## Aregoland Official Space

- ✅ Hardcodiert, nicht loeschbar, nicht verlassbar, stummschaltbar
- ✅ 4 Tabs: Neuigkeiten, Ueber, Support, World (Coming Soon)
- ✅ Neuigkeiten aus `aregoland-news.json` (automatisch befuellt bei Commits)
- ✅ Ueber-Tab: Hintergrundgeschichte + App-Version
- ✅ Ueber-Tab: Roadmap klappbar (Fertig/In Arbeit/Geplant) mit Feature-Beschreibungen
- ✅ Ueber-Tab: Spenden-Sektion mit PayPal/Ko-fi/Patreon/GitHub Sponsors Platzhalter
- ✅ Support-Tab: "Kommt bald" mit KI-Support-Vorschau
- ✅ World-Tab: "Kommt bald" mit World-Vorschau
- ✅ Gradient blau/lila (Aregoland Branding), Globe-Icon
- ✅ App-Version via vite define (`__APP_VERSION__`) aus package.json

## Space-Features

- ✅ Chats (Gruppen-Chats mit Rollen-Zugriffsrechten)
- ✅ Ankuendigungen — nur Admins/Moderatoren
- ✅ Mitglieder-Uebersicht (nur nach Rollen sichtbar)
- 🔲 Termine mit Anwesenheit — Trainer/Admin sieht Uebersicht

## Uebersicht-Tab (nach Rollen)

- ✅ Admin sieht alles: Chats, Termine, Mitglieder
- ✅ Mitglied sieht nur: Chats wo Zugang, Termine, Ankuendigungen
- ✅ Wichtige Termine ganz oben in der Uebersicht

## Kinder-Spaces

- 🔲 Elternteil automatisch Moderator (= Netzwerk-Helfer)
- 🔲 Kinder sehen nur freigegebene Inhalte (FSK-basiert)
- 🔲 Eltern koennen Kinder-Kommunikation untereinander freischalten

## Technische Architektur

- ✅ Space-Ersteller = primaerer Netzwerk-Helfer (Relay-Node)
- ✅ Moderatoren + Rollen mit "Netzwerk-Helfer erlauben" = sekundaere Relay-Nodes
- 🔲 Nachrichten: P2P Mesh ueber Relay-Nodes
- 🔲 Wenn Founder offline → naechster Netzwerk-Helfer uebernimmt automatisch
- ✅ Space-Daten in localStorage + Sync ueber Relay-Nodes

## Implementierungs-Schritte

1. ✅ Space erstellen mit Vorlagen (2026-03-31)
2. ✅ Mitglieder & Rollen (2026-03-31)
3. ✅ Uebersicht nach Rollen + Termine mit Anwesenheit (2026-03-31)
4. ✅ Chats-Tab (2026-04-01)
5. ✅ Profil-Tab + Rollen & Rechte (2026-04-02)
6. ✅ Gruppen-Chat: Fotos, Dateien, Voice, @Erwaehnung, Chunked Transfer (2026-04-01)
7. ✅ Rollen-Logik: Rechte-Abhaengigkeit, Netzwerk-Helfer, Mobile-Daten-Erkennung (2026-04-02)
8. ✅ Tags + Suche + Sortierung + Sichtbarkeit (2026-04-02)
9. ✅ Erscheinungsbild: Icon + Banner-Farbe (2026-04-02)
10. ✅ Aregoland Official Space mit Roadmap (2026-04-02)
11. ✅ Space-Karten Design: Gradient, Icon zentriert, Template-Label entfernt (2026-04-02)
12. ✅ Mitglieder-Tab Sortierung: Rolle, Name, Beitrittsdatum+Uhrzeit (2026-04-02)
13. ✅ Oeffentliche Space-Suche: Server-Seite (SQLite + REST), Space-Settings Backend-Anbindung, Neuer-Space-Flow mit 3 Optionen (2026-04-05)

---

## 🔲 Kurzfristig offen

### Melde-System

- 🔲 Mitglied melden (Grund + Beschreibung)
- 🔲 Nachricht melden als Beweis (Zeitstempel + Inhalt unveraenderlich)
- 🔲 Ab X Meldungen → Admin Benachrichtigung
- 🔲 Kinder-Spaces: Elternteil bekommt alle Meldungen sofort

### Mitglieder-Kontrolle

- 🔲 Admin-zugewiesene Spitznamen
- 🔲 Online-Status erzwingen/erlauben
- 🔲 Echter Name Pflicht oder Spitzname
- 🔲 Beitritts-Genehmigung durch waehlbare Rollen
- 🔲 Abstimmung moeglich (X von Y muessen zustimmen)
- 🔲 Beitritts-Hinweis: automatisch generiert aus Space-Einstellungen

---

## 🔲 Langfristig offen

### Video Calls & Streaming

- 🔲 Meeting-Modus (klein, interaktiv, alle Kameras)
- 🔲 Stream/Webinar-Modus (gross, einseitig, bis 5000+ Teilnehmer)
- 🔲 Automatische Node-Zuweisung: WLAN = automatisch Node, Mobile Daten = fragen ob Flat
- 🔲 Nutzer kann Mobile-Daten-Nutzung als Node deaktivieren
- 🔲 Admin kann manuell Nodes zuweisen
- 🔲 Raised Hand fuer Zuschauer
- 🔲 Live Q&A Chat waehrend Stream
- 🔲 Baum-Struktur fuer Nodes (Presenter → Relay-Nodes → Sub-Nodes → Zuschauer)

### Netzwerk-Helfer Node-Architektur

- 🔲 Jeder Nutzer wird beim Beitritt geprueft ob er Node werden kann
- 🔲 WLAN = automatisch Node-Kandidat, Mobile Daten = fragen ob Flat vorhanden
- 🔲 Formel: verfuegbare Nodes / 2 = aktive Nodes (immer gerade Zahl, sonst einer zu Reserve)
- 🔲 10% Reserve (aufrunden auf naechste ganze Zahl)
- 🔲 Nodes agieren immer in Paaren: A (aktiv) + B (Standby, wartet nur)
- 🔲 Heartbeat: alle 1 Sekunde "Ich lebe" an Admin
- 🔲 Reserve sendet auch Heartbeat an Admin
- 🔲 Bei Ausfall: Admin weist sofort Reserve als neues B zu
- 🔲 Upload-Messung beim Verbindungsaufbau: Node-Kapazitaet = Upload / 4 Mbit (2x Sicherheitspuffer)
- 🔲 Abrunden bei Kapazitaetsberechnung (lieber weniger als ueberlasten)
- 🔲 Stabiler Node: Admin kann manuell einen Node als "Stabil" markieren
- 🔲 Qualitaetsanpassung: genug Nodes = HD, wenige = SD, kritisch = Audio only
- 🔲 Admin-Dashboard: Nutzer-Anzahl, aktive Nodes, Reserve-Kapazitaet, Auslastung %, Qualitaet
- 🔲 Warnung bei >80% Auslastung → System fragt neue Nutzer ob sie Node werden wollen

### Transparenz-Kasse

- 🔲 Klassengelder digital verwalten
- 🔲 Jeder Euro fuer alle Eltern sichtbar
- 🔲 Wer hat fuer was bezahlt — transparent
- 🔲 Automatische Abrechnung bei Klassenfahrten

### Handwerker-Space

- 🔲 Digitale Rechnungen direkt hochladen
- 🔲 Kunde empfaengt sofort auf seinem Geraet
- 🔲 Zahlung direkt ueber Space
- 🔲 Angebote, Auftraege, Rechnungen — alles an einem Ort

### Spaces Shop-System

- 🔲 Verkaufen direkt im Space
- 🔲 Produkte/Dienstleistungen anbieten
- 🔲 Zahlung ueber Pay-Modul

### P2P Cloud Speicher

- 🔲 Nutzer stellt freiwillig Speicherplatz zur Verfuegung
- 🔲 Dateien verschluesselt auf mehreren Geraeten verteilt (wie IPFS/BitTorrent)
- 🔲 Space-Mitglieder teilen Speicher untereinander
- 🔲 Unternehmen: 5000 Laptops x 500GB = 2.500TB kostenlose Unternehmens-Cloud
- 🔲 DSGVO: alles verschluesselt, niemand sieht fremde Daten
