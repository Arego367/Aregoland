# Datenschutz-Audit — Aussagen vs. Realitaet

> Stand: 2026-04-05. Ziel: Alle Stellen wo etwas ueber Datenspeicherung steht pruefen
> und bewerten ob die Aussage nach den letzten Aenderungen noch korrekt ist.

---

## Was speichert der Server tatsaechlich?

### SQLite (persistent, auf Disk)
| Tabelle | Daten | Loeschung |
|---------|-------|-----------|
| `public_spaces` | space_id, name, beschreibung, sprache, tags, mitgliederzahl, gruender_id | 30 Tage Inaktivitaet |
| `join_requests` | user_id, user_name, space_id, gruender_id | Nach Genehmigung/Ablehnung |
| `user_directory` | arego_id, display_name, first_name, last_name, nickname | 3 Tage ohne Heartbeat |
| `invite_registry` | short_code, space_id, space_name, role, founder_id, founder_name | 3 Tage ohne Heartbeat + expiresAt |

### In-Memory (RAM, verloren bei Restart)
| Store | Daten | Loeschung |
|-------|-------|-----------|
| `codes` (Map) | 6-Zeichen-Code → base64 Payload (Kontakt-QR) | 1h TTL, single-use |
| `rooms` (Map) | roomId → Set<WebSocket> | Bei Disconnect |
| `inboxPending` (Map) | aregoId → gepufferte Nachrichten (max 20) | 24h TTL |
| `onlineUsers` (Map) | aregoId → Set<WebSocket> | Bei Disconnect |
| `presenceWatchers` (Map) | aregoId → Set<WebSocket> | Bei Disconnect |
| `supportRateLimit` (Map) | aregoId → Timestamps | 10s Fenster |

---

## Fundstellen + Bewertung

### 1. KRITISCH — Aussage stimmt nicht mehr vollstaendig

**src/i18n/locales/de.json, Zeile 625:**
> "Aregoland speichert nichts. Keine Nachrichten, keine Dateien, keine Daten auf unseren Servern."

**Bewertung:** FALSCH. Der Server speichert Space-Metadaten (public_spaces), Beitrittsanfragen (join_requests), Nutzer-Verzeichnis (user_directory), Einladungscodes (invite_registry). Zwar keine Nachrichteninhalte, aber "speichert nichts" ist zu pauschal.

**Vorschlag:** Praezisieren: "Aregoland speichert keine Nachrichten, Dateien oder Anrufe. Oeffentliche Space-Infos und Einladungscodes werden temporaer gespeichert und nach Inaktivitaet automatisch geloescht."

---

**src/i18n/locales/de.json, Zeile 346 (FAQ):**
> "Alle Daten werden sofort und unwiderruflich von deinem Geraet geloescht. Da keine Daten auf einem Server gespeichert werden, gibt es keine Moeglichkeit zur Wiederherstellung."

**Bewertung:** TEILWEISE FALSCH. Die Aussage "keine Daten auf einem Server" stimmt nicht mehr — user_directory und invite_registry speichern Daten. Allerdings: Nachrichten und Kontakte werden tatsaechlich nicht gespeichert.

**Vorschlag:** Praezisieren: "...Da keine Nachrichten, Kontakte oder persoenlichen Daten auf einem Server gespeichert werden..."

---

**docs/CLAUDE.md, Zeile 46:**
> "Server speichert NIE Inhalte — alles P2P, E2E verschluesselt"

**Bewertung:** KORREKT fuer Nachrichteninhalte. Aber "NIE Inhalte" koennte missverstanden werden. Space-Metadaten (Name, Beschreibung, Tags) werden gespeichert — das sind keine "Inhalte" im Chat-Sinne, aber Daten.

**Vorschlag:** Praezisieren: "Server speichert NIE Nachrichteninhalte, Dateien oder Anrufe — alles P2P, E2E verschluesselt. Oeffentliche Space-Infos und Einladungscodes werden temporaer in einer Datenbank vorgehalten."

---

### 2. PRAEZISIERUNG EMPFOHLEN

**src/i18n/locales/de.json, Zeile 278 (Einstellungen):**
> "Deine Daten werden nur lokal auf deinem Geraet gespeichert. Aregoland hat keinen Zugriff auf deine Nachrichten oder Kontakte."

**Bewertung:** KORREKT fuer Nachrichten und Kontakte. Aber wenn "Oeffentlich auffindbar" aktiv ist, werden Name + Arego-ID an den Server gesendet. Der zweite Satz ist korrekt.

**Vorschlag:** Ersten Satz praezisieren: "Deine Nachrichten, Kontakte und persoenlichen Daten werden nur lokal auf deinem Geraet gespeichert."

---

**src/i18n/locales/de.json, Zeile 74 (Registrierung):**
> "Kein Passwort. Kein Benutzername. Kein Server speichert deine Zugangsdaten."

**Bewertung:** KORREKT. Identitaet ist rein lokal (localStorage). Server kennt keine Zugangsdaten.

---

**src/i18n/locales/de.json, Zeile 164 + 187 (Kontakt-Code):**
> "Der Code enthaelt nur deinen Namen und oeffentlichen Schluessel. Kein Server speichert deine Kontakte."

**Bewertung:** KORREKT. Kontakte werden nur lokal gespeichert. Der Kurzcode ist in-memory mit 1h TTL und wird nach Einloesung geloescht.

---

**src/i18n/locales/de.json, Zeile 227 (Profil):**
> "Alle folgenden Daten sind optional. Sie werden nicht auf dem Server gespeichert, sondern verbleiben ausschliesslich lokal auf deinem Geraet."

**Bewertung:** TEILWEISE. Wenn "Oeffentlich auffindbar" aktiv ist, werden Name + Spitzname an den Server gesendet. Allerdings bezieht sich diese Aussage auf die Profil-Eingabefelder, nicht auf die Auffindbarkeit.

**Vorschlag:** Fussnote: "Ausnahme: Wenn du 'Oeffentlich auffindbar' aktivierst, werden Name und Spitzname temporaer an den Server uebermittelt."

---

### 3. KORREKTE AUSSAGEN — KEINE AENDERUNG NOETIG

| Stelle | Aussage | Bewertung |
|--------|---------|-----------|
| de.json Z.73 | "Identitaet lokal auf deinem Geraet" | KORREKT |
| de.json Z.344 | "E2E mit ECDH + AES-GCM-256" | KORREKT |
| de.json Z.129 | "P2P Ende-zu-Ende verschluesselt" | KORREKT |
| contacts.ts Z.1 | "Lokaler Kontaktspeicher — nur localStorage, kein Server" | KORREKT |
| chats.ts Z.1 | "Persistente Chat-Liste — localStorage, kein Server" | KORREKT |
| p2p-crypto.ts | "Forward Secrecy, Server sieht niemals Klartext" | KORREKT |
| p2p-webrtc.ts | "DataChannel offen → Server ist komplett raus" | KORREKT |
| server.js Z.26-30 | "DSGVO: nur RAM, kein Verlauf. Blindes Relay." | KORREKT (fuer Presence + Chat) |
| SpacesScreen.tsx Roadmap | "kein Server speichert sie" (Chat) | KORREKT fuer Chat-Nachrichten |
| README.md | "E2E verschluesselt — kein Server speichert Inhalte" | KORREKT (Inhalte = Nachrichten) |

---

## Zusammenfassung

**3 Stellen muessen korrigiert werden:**
1. `de.json Z.625` — "Aregoland speichert nichts" (zu pauschal)
2. `de.json Z.346` — "keine Daten auf einem Server" (zu pauschal)
3. `docs/CLAUDE.md Z.46` — "Server speichert NIE Inhalte" (sollte praeziser sein)

**2 Stellen sollten praezisiert werden:**
1. `de.json Z.278` — "nur lokal gespeichert" (Ausnahme: Auffindbarkeit)
2. `de.json Z.227` — "nicht auf dem Server gespeichert" (Ausnahme: Auffindbarkeit)

**Alle anderen Aussagen sind korrekt** — insbesondere alles zu E2E, P2P, Kontakten, Chats, Identitaet.

**Grundregel fuer Korrekturen:** "Nachrichten, Kontakte und persoenliche Daten = nie auf dem Server. Oeffentliche Space-Infos, Einladungscodes und Auffindbarkeit = temporaer mit automatischer Loeschung."
