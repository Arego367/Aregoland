# Aregoland Card-System

Feature-Dokumentation fuer das Aregoland-Projekt. Jede Domain beschreibt einen abgegrenzten Funktionsbereich mit Code-Ankern, Datenfluessen und Abhaengigkeiten.

**Nutzung:** Lies zuerst diesen Index, identifiziere die relevante Domain, dann lade nur die benoetigte Card.

---

## Domains

| # | Domain | Beschreibung | Status |
|---|--------|-------------|--------|
| 1 | [identity](identity/) | Registrierung, Login, Nutzer-Identitaet, Kryptoschluessel | aktiv |
| 2 | [messaging](messaging/) | 1:1 Chat, Nachrichtenverlauf, Medien-Anhaenge | aktiv |
| 3 | [contacts](contacts/) | Kontaktverwaltung, Kategorien, QR-Pairing | aktiv |
| 4 | [spaces](spaces/) | Gruppen-Raeume, Community-Features, Space-Sync | aktiv |
| 5 | [calls](calls/) | Sprach-/Videoanrufe ueber WebRTC | aktiv |
| 6 | [calendar](calendar/) | Termine, Erinnerungen, Event-Verwaltung | aktiv |
| 7 | [documents](documents/) | Datei-Austausch zwischen Kontakten | geplant |
| 8 | [child-safety](child-safety/) | FSK-System, Kinderprofil, Elternkontrolle | aktiv |
| 9 | [p2p-network](p2p-network/) | WebRTC, Signaling, Gossip-Protokoll, E2E-Verschluesselung | aktiv |
| 10 | [account](account/) | Profil, QR-Code, Einstellungen, Support, Abo | aktiv |
| 11 | [i18n](i18n/) | Internationalisierung, 27 Sprachen | aktiv |
| 12 | [native-app](native-app/) | Native App-Packaging, eigene Engine, Store-Deploy | geplant |

---

## Kernprinzipien

- **Kein Server-Speicher:** Alle Inhalte laufen P2P, der Server kennt nur Signaling-Daten
- **E2E-Verschluesselung:** ECDH P-256 + AES-GCM-256, Forward Secrecy pro Session
- **FSK by Design:** Kinderschutz ab FSK 6, Feature-Locking nach Altersstufe
- **Passwordless Auth:** WebCrypto ECDSA Schluesselpaare, kein Passwort noetig
