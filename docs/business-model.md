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

## Wachstumsstrategie
- Kein bezahltes Marketing
- Aras nutzt App selbst mit Familie
- App in Stores (Google Play + Apple)
- Gelegentliche Reels/Posts in Social Media
- Wenn es gut ist, kommt Werbung von alleine
