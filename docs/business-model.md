# Business Model — Aregoland

> Stand: 2026-04-01

## Preismodell

- 1 Euro Abo pro Nutzer/Monat
- Non-profit: keine Gewinnausschuettung, aber kostendeckend
- Geschaeftsfuehrergehalt ist erlaubt

## Kalkulation (konservativ)

Von jedem 1 Euro/Monat bleiben nach Stripe (~4%) und MwSt (~16%) ca. 80ct netto.
Bei App Store Zahlung (30% Gebuehr) nur ~55ct. PWA bevorzugen.

| Nutzer | Netto/Monat (PWA) | Netto/Jahr (PWA) |
|---|---|---|
| 500 | 400 Euro | 4.800 Euro |
| 1.500 | 1.200 Euro | 14.400 Euro |
| 5.000 | 4.000 Euro | 48.000 Euro |
| 10.000 | 8.000 Euro | 96.000 Euro |
| 50.000 | 40.000 Euro | 480.000 Euro |

## Laufende Kosten (Schaetzung)

| Posten | Monatlich |
|---|---|
| Hetzner Server (aktuell) | ~5-15 Euro |
| Hetzner skaliert (10k Nutzer) | ~50-100 Euro |
| KI API (Anthropic) | ~0,5ct/Anfrage, nutzungsabhaengig |
| Domain, SSL | ~5 Euro |
| **Gesamt klein** | **~70 Euro/Monat** |

## Break-even

- ~100 Nutzer → Server traegt sich selbst
- ~1.500 Nutzer → bescheidenes Nebengehalt moeglich
- ~5.000 Nutzer → Vollzeit realistisch
- Serverkosten wachsen viel langsamer als Einnahmen

## Zahlungsanbieter

- **Stripe** (bevorzugt): guenstigste EU-Gebuehren, Google/Apple Pay, SEPA, DSGVO-konform
- **PayPal**: zusaetzlich anbieten
- **App Store vermeiden** solange moeglich → PWA = keine 30% Apple/Google Gebuehr

## Rechtsform

- **UG (haftungsbeschraenkt)** — Mini-GmbH ab 1 Euro Stammkapital
- Haftungsschutz fuer Aras persoenlich
- Ermoeglicht Stripe, PayPal, offizielles Geschaeftskonto
- Spaeter in GmbH umwandelbar wenn gewachsen

## Unternehmensphilosophie

Kein gemeinnuetziger Verein — aber ethisches Unternehmen:
- Keine Dark Patterns
- Keine Nutzerdaten verkaufen
- Faire Preise nur zur Kostendeckung
- Community kann mitgestalten (Open Source, AGPL)
- Transparenz ueber Kosten und Einnahmen

## Datenschutz

Alle DSGVO-Vorschriften DE und EU gelten ausnahmslos.
P2P-Architektur = keine Serverdaten = nichts zu verstecken.
Vorteil besonders fuer: Schulen, Behoerden, Unternehmen, Eltern.

## Langfristiges Potenzial (Institutionen)

Wenn Aregoland waechst — organisch, ohne Druck:

| Zielgruppe | DE gesamt | Modell |
|---|---|---|
| Arztpraxen | ~400.000 | Lizenz/Monat |
| Gemeinden | ~11.000 | Lizenz/Monat |
| Schulen | ~33.000 | Lizenz/Monat |
| Krankenhaeuser | ~1.900 | Enterprise |

Zum Vergleich: Doctolib ~170 Euro/Monat pro Praxis.
Aregoland Ansatz: Bruchteile davon — trotzdem nachhaltig.

Hinweis: Gesundheitsbereich braucht Zertifizierungen (ISO 27001,
BSI, Gematik). Erst ab Stufe 4 relevant. Kein Druck.

## Finanzierung vor dem Launch

### Crowdfunding (bevorzugt)
Plattform: Startnext (deutsch, datenschutzfreundlich)
Ziel: ~2.000-3.000 Euro fuer eID Integration + Launch-Kosten

Belohnungsstufen:
- 5-20 Euro → Danke + Name in App-Credits
- 50 Euro → 5 Jahre kostenloses Abo
- 100 Euro → 10 Jahre kostenloses Abo
- 200+ Euro → Lebenslanges Abo
- Geschichte: Alleinerziehender Vater baut sicheren
  Messenger fuer seine Kinder — das ist keine Marketing,
  das ist die Wahrheit.

### KfW Startgeld (alternativ)
- Bis 125.000 Euro, auch ohne Eigenkapital
- Ueber Hausbank beantragen
- Geeignet fuer Nebengewerbe-Gruendung
- Vorher Bankgespraech noetig

## Wachstumsstrategie / Marketing

- Keine bezahlten Ads
- YouTube Creator ansprechen (Datenschutz, Papa/Mama, Tech)
- Kein bezahltes Sponsoring — App zeigen, sie entscheiden
- Reels/Posts gelegentlich selbst erstellen
- Wenn die App gut ist, kommt Werbung von alleine

## Monatliche Fixkosten (Betrieb)

- Apple Developer Account: ~9 Euro/Monat (99 Euro/Jahr)
- Google Play: einmalig 25 Euro
- Hetzner Server: ~15-50 Euro/Monat je nach Nutzerzahl
- Domain: ~5 Euro/Monat
- Gesamt: ~30-70 Euro/Monat

Break-even: ~100 zahlende Nutzer decken alles.

## Zahlung

- Phase 1: App Store (Apple/Google) — einfachster Start
- Phase 2: EUDI Wallet Zahlungsautorisierung + Wero (2027)
- Phase 3: Eigenes P2P System mit BaFin-Lizenz (Zukunft)
- Stripe nur als letzter Fallback fuer Nicht-EU
- Keine Abhaengigkeit von Investoren — niemals

## Zahlung — Klarstellung

EUDI Wallet ist KEIN Geldspeicher — es ist ein Identitaets-
und Autorisierungskanal. Geld liegt immer auf einem Bankkonto.

### Was EUDI fuer Zahlung ermoeglicht:
- Identitaet bestaetigen beim Bezahlen (kostenlos)
- Starke Kundenauthentifizierung (SCA) ersetzen
- Autorisierung: "Ich bin es — ueberweise jetzt"
- Das eigentliche Geld bewegt sich ueber SEPA/Wero

### Aregoland Pay — Langfristvision (Stufe 5):
- Eigenes P2P Zahlungssystem zwischen Aregoland-Nutzern
- Blumenhaendler QR-Code → Kunde zahlt → direkt
- Braucht BaFin ZAG-Lizenz (~60.000-200.000 Euro Startkapital)
- Erst sinnvoll ab 50.000+ aktive Nutzer
- Dann Crowdfunding mit Community fuer Lizenz
- NIEMALS mit Investorengeldern

### Fahrplan Zahlung:
- Phase 1 (jetzt): App Store Apple/Google
- Phase 2 (2027): EUDI Wallet Zahlungsautorisierung + Wero
- Phase 3 (Zukunft): Eigenes P2P System mit BaFin-Lizenz

## Identitaet

- EUDI Wallet ist das technische Fundament (siehe [eudi-integration.md](eudi-integration.md))
- Identitaet, FSK-Verifizierung, Dokumente, Zahlung — alles ueber EUDI
- Sandbox seit 2026 offen, Marktstart Dezember 2026
- Aregoland bereitet sich JETZT vor
