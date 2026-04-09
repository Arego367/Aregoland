# Aregoland — Vision

> Stand: 2026-04-06

## Wer ist Aras

Aras ist alleinerziehender Vater, Baubegleiter bei Deutsche Telekom Technik GmbH, Solo-Founder ohne Investorenkapital. Selbstbeschreibung: "fauler Arsch mit smarten Ideen." Baut Aregoland abends und nebenbei — beim Zocken, beim TV schauen, auf dem Sofa. ADHS ist sein Superpower, kein Problem. Sein Kopf dreht sich pausenlos, Aregoland ist das Ziel das ihn lenkt. Finanzierung via Förderungen und Crowdfunding. Rechtsform: UG (haftungsbeschränkt). Kein Investor — niemals. Keiner redet ihm rein, keiner verbiegt seine Vision.

## Was will er

Eine digitale Lebensinfrastruktur für Europa. Nicht noch eine App — eine komplette Alternative zu allem was es gibt. Ehrlich. Sicher. Für Menschen, nicht für Aktionäre. Eine App die er selbst nutzen würde. Eine die seine Kinder schützt. Eine die niemanden ausbeutet.

Kurz: Er will WeChat — aber dezentral, DSGVO-konform, und niemand außer dir hat deine Daten.

Aregoland ist kein Startup das verkauft werden will. Es ist Infrastruktur die bleibt.

## Warum will er es

Er baute es für seine Töchter. WhatsApp gehört Meta. iMessage nur Apple. Telegram speichert alles. Signal hat keine Spaces, keinen Kalender, kein Kinderschutzsystem. Kein einziger Messenger kombiniert echte P2P-Verschlüsselung + Kinderschutz by Design + Community-Features + DSGVO + kein Algorithmus.

TikTok, Instagram, Facebook wollen Aufmerksamkeit verkaufen. Algorithmen optimiert auf Empörung, Hass, Angst. Kinder die süchtig werden. Eltern ohne Kontrolle. Wissenschaftler die seit 20 Jahren warnen — niemand hört zu. Meta wurde in den USA verklagt wegen Algorithmen die Kinder abhängig machen. Die Politik diskutiert Verbote. Aras löst das Problem technisch — Verbote werden überflüssig.

Wissenschaftler fordern seit 20 Jahren eine demokratische europäische Plattform. Niemand hat sie gebaut. Aregoland ist die Antwort.

Philosophie: "Wenn es nicht ums Geld geht, wird es gut." Kein Investor-Druck. Kein Wachstum um jeden Preis. Wenn es gut ist, kommt die Werbung von alleine.

## Was hat er bereits gebaut

Ein funktionierender P2P-Messenger mit E2E-verschlüsseltem Chat, Audio/Video-Anrufen, Sprachnachrichten und Dateitransfer — als PWA für alle Plattformen. Dazu ein vollständiges Spaces-System mit 7 Vorlagen, Rollen, QR-Einladungen, öffentlicher Suche und P2P-Sync via Gossip Protocol. Kalender, Kinderverwaltung mit FSK-Ratings, Profil-System, Recovery-Flow, Block-System und Settings sind gebaut und nutzbar. Die App läuft in 24 EU-Sprachen, hat ein GitHub-Support-System auf Arego-ID-Basis und einen hardcoded "Aregoland Official Space" mit Roadmap.

## Wie funktioniert Aregoland

Alles läuft P2P — direkt von Gerät zu Gerät. Der Server vermittelt nur den ersten Kontakt (Signaling), danach ist er raus. Server sieht keine Inhalte, keine Metadaten, kein "wer mit wem", kein "wann". Nutzer löscht App — alles weg, unwiderruflich.

**Authentifizierung:** Passwordless via WebCrypto ECDSA. Jeder Nutzer bekommt eine eindeutige Arego-ID (Format: AC-XXXX-XXXXXXXX). Keine Handynummer, kein Passwort. Die Arego-ID macht die Handynummer überflüssig — struktureller Datenschutzvorteil der sich von selbst erklärt.

**P2P:** WebRTC direkt zwischen Geräten. Signaling-Server handhabt nur ICE/SDP-Handshake, speichert nichts. coturn TURN-Server für NAT-Traversal wenn nötig.

**Kinderschutz:** Nicht eine Einstellung — es ist die Architektur. FSK 6 automatisch für alle Kinder-Konten, kryptographisch erzwungen, nicht umgehbar. Eltern richten Kinder-Konto per QR ein, danach ist das Gerät gesperrt. FSK-Upgrades passieren kryptographisch über EUDI Wallet, automatisch am Geburtstag. Kinder unter 16 sind für Fremde unsichtbar. Kind-zu-Kind-Kontakt braucht Genehmigung beider Elternteile. Medienzeiten nach Wissenschaft — nicht änderbar.

**Spaces:** Gründer erstellt Space, wählt Vorlage, teilt QR-Code. Mitglieder scannen, treten bei. Alles synchronisiert sich P2P via Gossip Protocol — kein Single Point of Failure.

**EUDI Wallet:** EU baut bis Ende 2026 digitale Brieftasche für alle EU-Bürger. Enthält Identität, Altersnachweis, Dokumente. Aregoland registriert sich als Relying Party — Sandbox bereits offen. Ab 2027 einzige Verifikationsgrundlage.

**Open Source:** AGPL-3.0 — Vertrauen durch Transparenz, wie Signal. Jeder kann prüfen ob die Versprechen stimmen.

## Was bringt das dem Nutzer

Für Eltern: Kinder schlafen ruhig. Schutz passiert automatisch — kein Einrichten, kein Nachbessern. Wissenschaftsbasierte Medienzeiten die niemand umgehen kann, auch Eltern nicht.

Für Familien: Alles an einem Ort. Messenger, Kalender, Spaces, Dokumente. Keine 400 verschiedenen Apps.

Für Schulen und Vereine: Spaces als digitaler Raum — QR-Code scannen, sofort drin. Keine IT-Abteilung, kein Aufwand. Transparenzkasse für Vereine — kein Euro unkontrolliert.

Für kleine Unternehmen: EPC QR-Code Zahlungen via SEPA Instant, null Transaktionsgebühren. Creatoren bekommen 100% der Trinkgelder direkt.

Für alle: Kein Tracking. Keine Werbung. Kein Datenverkauf. Niemals. Wer zahlt bekommt Privatsphäre — nicht mehr Werbung.

## Features

**Messenger** — P2P E2E verschlüsselter Chat, Audio/Video-Anrufe, Sprachnachrichten, Dateitransfer, Offline-Queue. Kontakt nur per QR oder Kurzcode.

**Spaces** — Digitale Heimräume für Familien, Schulen, Vereine, Unternehmen, Gemeinden. Mit Rollen, Neuigkeiten, Kalender, Chat, QR-Einladungen, öffentlicher Suche. B2B: Spaces als Unternehmensseiten, LinkedIn-Alternative.

**World** — Aregolands eigener Social-Feed. FSK-basierte Inhaltsfilterung (FSK 6/12/18/21). Pseudonymität via World-Nick. Kein Algorithmus, kein Infinite Scroll für Kinder. Business-Verifikation via Handelsregisternummer oder EUDI Wallet.

**Kalender** — Persönlich, Kinder-Stundenplan, Familien-Kalender, Spaces-Kalender. P2P teilen. Import aus Google Calendar und Outlook.

**Arego Cloud** — Persönliche E2E-verschlüsselte Cloud. 1GB gratis im Abo. Online → P2P direkt. Offline → Cloud als Fallback. Gemietet (Hetzner) oder Self-Hosted — kein Zwang. "Deine Cloud. Nur du hast den Schlüssel. Nicht mal Aregoland kann reinschauen."

**Pay** — Wero + EUDI Wallet. EPC QR-Code für kleine Läden (SEPA Instant, null Transaktionsgebühren). Creatoren bekommen 100% der Spenden direkt.

## Geschäftsmodell

1€/Monat pro Konto. ~50ct netto. Keine Werbung, kein Datenverkauf — niemals. App Store/Google Play zuerst. EUDI Wallet ab 2027. Wero als europäische Alternative. Stripe nur als letzter Fallback.

Arego Cloud Storage optional gegen Aufpreis. Hetzner Object Storage: 1TB = ~7,72€/Monat, auf 200 Nutzer verteilt = 0,04€ pro Nutzer.

Zielgruppen: Familien, Schulen, Gemeinden, Vereine, Unternehmen, Behörden.

## Langzeit-Vision

Stufe 1 — Jetzt: Messenger + Spaces + Kalender
Stufe 2 — 2026: Arego Cloud + Dokumenten-P2P
Stufe 3 — 2026/27: Institutionen + World Launch
Stufe 4 — 2027+: EUDI Wallet vollständig integriert
Stufe 5 — 2028+: Gesundheit (Befunde, Selbstauskunft, ePA-Alternative)
Stufe 6 — Langfristig: Vollständige digitale Lebensinfrastruktur für Europa

WeChat-Prinzip — aber niemand außer dir hat deine Daten.

## CC's Einschätzung

**Was stark ist:**
- Die "Warum"-Story ist das Herzstück und funktioniert. Ein Vater der seine Kinder schützen will — das ist greifbar, emotional, glaubwürdig. Kein Startup-Pitch, sondern eine persönliche Mission.
- Die technische Differenzierung ist real: P2P + Kinderschutz by Design + DSGVO + keine Algorithmen — das gibt es tatsächlich nirgends in Kombination.
- Das Geschäftsmodell ist radikal einfach und ehrlich. 1€/Monat, keine Werbung, keine Investoren. Das schafft Vertrauen.
- Die Langzeit-Vision von Stufe 1 bis 6 zeigt Ambition ohne Größenwahn — jede Stufe baut logisch auf der vorherigen auf.

**Was fehlt oder überarbeitet werden könnte:**
- Es fehlt ein kurzer Abschnitt zu Risiken/Herausforderungen — z.B. WebRTC-Limitierungen bei Offline-Szenarien, EUDI-Wallet-Abhängigkeit von EU-Timeline, oder die Herausforderung als Solo-Founder ohne Team zu skalieren. Das würde die Vision ehrlicher und robuster machen.
