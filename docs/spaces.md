# Spaces — Vollstaendige Vision

## Space-Vorlagen (beim Erstellen waehlbar)

- Familie — privat, alle sehen alle, geteilter Kalender
- Schule — Lehrer + Eltern + Kinder, Hausaufgaben, Termine
- Verein/Sport — Trainer sichtbar, Anwesenheit, Kurstermine
- Unternehmen — Abteilungen, Rollen, formell
- Amt/Gemeinde — oeffentlich, Ankuendigungen, Buerger-Kommunikation
- Community — offen oder geschlossen
- Benutzerdefiniert — alles selbst einstellen

## Rollen-System

- **Founder** (nicht entfernbar, automatisch Relay-Node)
- **Admin** (vom Founder ernannt)
- **Moderator** (kann in Globalem Chat posten + automatisch Co-Host/Relay-Node)
- **Mitglied**
- **Gast** (nur lesen)

> **Co-Host ist keine separate Rolle mehr.** Moderatoren sind automatisch Co-Hosts (Relay-Nodes).
> - Moderatoren helfen den Space stabil zu halten
> - Je mehr Moderatoren online sind, desto stabiler sind Chats und Calls
> - Moderator kann Co-Host-Funktion deaktivieren: Toggle "Als Relay-Node aktiv" (Standard: AN)
> - Bei Deaktivierung: Hinweis "Du hilfst nicht mehr als Relay-Node. Das kann die Qualitaet fuer andere Mitglieder bei schlechtem Internet beeinflussen."
> - Gruende fuer Deaktivierung: unterwegs, mobiles Daten, schlechtes Internet

## Space-Einstellungen (Admin)

- Mitglieder sehen sich gegenseitig: Ja/Nein
- Oeffentlich beitreten: Ja/Nein
- ID-Verifizierung zum Beitritt: Ja/Nein (Standard: Ja)
- QR-Code Einladung mit Ablaufzeit
- Globaler Chat: nur Admins/Moderatoren koennen posten
- **Chats verwalten**: Chat erstellen (Name + Rollen-Zugriffsrechte), Chats loeschen
- **Rollen & Rechte**: Eigene Rollen erstellen (Name + Farbe + Rechte)
  - Rechte pro Rolle: Chats lesen, Chats schreiben, Termine erstellen, Neuigkeiten posten, Mitglieder einladen
  - Founder & Admin haben immer vollen Zugriff (nicht konfigurierbar)
  - Chat-Erstellen Rollen-Auswahl zeigt nur Moderator/Mitglied/Gast

## Tabs

- **Uebersicht**: Beschreibung, angepinnte Posts, Ankuendigungen, Statistiken (Admin)
- **Neuigkeiten**: Beitraege, Filter, Kommentare, RSVP
- **Chats**: Nur die Liste der vorhandenen Chats (kein Erstellen-Button). Unterraeume als separate Sektion.
- **Mitglieder**: Nach Rollen gruppiert, Einladen, Rolle aendern
- **Profil**: Eigenes Profil im Space — Name, Rolle-Badge, Relay-Node Toggle (Moderator), Benachrichtigungen ein/aus
- **Einstellungen**: Chats verwalten, Rollen & Rechte, Space loeschen

## Space-Features

- Chats (Gruppen-Chats mit Rollen-Zugriffsrechten)
- Termine mit Anwesenheit — Trainer/Admin sieht Uebersicht
- Wiki/Seiten — strukturierte Infoseiten (je nach Rolle)
- Ankuendigungen — nur Admins/Moderatoren
- Mitglieder-Uebersicht (nur nach Rollen sichtbar)

## Uebersicht-Tab (nach Rollen)

- Admin sieht alles: Chats, Termine, Mitglieder, Wiki
- Mitglied sieht nur: Chats wo Zugang, Termine, Ankuendigungen
- Wichtige Termine ganz oben in der Uebersicht

## Kinder-Spaces

- Elternteil automatisch Moderator (= Co-Host)
- Kinder sehen nur freigegebene Inhalte (FSK-basiert)
- Eltern koennen Kinder-Kommunikation untereinander freischalten

## Technische Architektur

- Space-Ersteller = primaerer Relay-Node
- Moderatoren = sekundaere Relay-Nodes (automatisch, deaktivierbar)
- Nachrichten: P2P Mesh ueber Relay-Nodes
- Wenn Founder offline → Moderator uebernimmt automatisch
- Space-Daten in localStorage + Sync ueber Relay-Nodes

## Implementierungs-Schritte

1. Space erstellen mit Vorlagen (2026-03-31)
2. Mitglieder & Rollen (2026-03-31)
3. Uebersicht nach Rollen + Termine mit Anwesenheit (2026-03-31)
4. Chats-Tab (2026-04-01)
5. Profil-Tab + Rollen & Rechte + Chat-Rollen vereinfacht (2026-04-01)
6. Wiki/Seiten

---

## Node-Architektur fuer Spaces Video/Stream (noch nicht implementiert)

- Jeder Nutzer wird beim Beitritt geprueft ob er Node werden kann
- WLAN = automatisch Node-Kandidat, Mobile Daten = fragen ob Flat vorhanden
- Formel: verfuegbare Nodes / 2 = aktive Nodes (immer gerade Zahl, sonst einer zu Reserve)
- 10% Reserve (aufrunden auf naechste ganze Zahl)
- Nodes agieren immer in Paaren: A (aktiv) + B (Standby, wartet nur)
- Heartbeat: alle 1 Sekunde "Ich lebe" an Admin
- Reserve sendet auch Heartbeat an Admin
- Bei Ausfall: Admin weist sofort Reserve als neues B zu
- Upload-Messung beim Verbindungsaufbau: Node-Kapazitaet = Upload / 4 Mbit (2x Sicherheitspuffer)
- Abrunden bei Kapazitaetsberechnung (lieber weniger als ueberlasten)
- Stabiler Node: Admin kann manuell einen Node als "Stabil" markieren (Einzelgaenger, kein Partner noetig, z.B. 1GB Leitung)
- Neue Nutzer die joinen und Node werden koennen = sofort zu Reserve hinzufuegen
- Qualitaetsanpassung: genug Nodes = HD, wenige = SD, kritisch = Audio only
- Admin-Dashboard: Nutzer-Anzahl, aktive Nodes, Reserve-Kapazitaet, Auslastung %, Qualitaet
- Warnung bei >80% Auslastung → System fragt neue Nutzer ob sie Node werden wollen

## Spaces — Video Calls & Streaming (noch nicht implementiert)

- Meeting-Modus (klein, interaktiv, alle Kameras)
- Stream/Webinar-Modus (gross, einseitig, bis 5000+ Teilnehmer)
- Automatische Node-Zuweisung: WLAN = automatisch Node, Mobile Daten = fragen ob Flat
- Nutzer kann Mobile-Daten-Nutzung als Node deaktivieren
- Admin kann manuell Nodes zuweisen
- Raised Hand fuer Zuschauer
- Live Q&A Chat waehrend Stream
- Baum-Struktur fuer Nodes (Presenter → Relay-Nodes → Sub-Nodes → Zuschauer)

## Spaces — Melde-System (noch nicht implementiert)

- Mitglied melden (Grund + Beschreibung)
- Nachricht melden als Beweis (Zeitstempel + Inhalt unveraenderlich)
- Ab X Meldungen → Admin Benachrichtigung
- Kinder-Spaces: Elternteil bekommt alle Meldungen sofort

## Spaces — Mitglieder-Kontrolle (noch nicht implementiert)

- Admin-zugewiesene Spitznamen
- Online-Status erzwingen/erlauben
- Echter Name Pflicht oder Spitzname
- Beitritts-Genehmigung durch waehlbare Rollen
- Abstimmung moeglich (X von Y muessen zustimmen)
- Beitritts-Hinweis: automatisch generiert aus Space-Einstellungen
