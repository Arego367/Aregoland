# Business Model — Aregoland

> Stand: 2026-04-01

## Preismodell

- 1 Euro Abo pro Nutzer/Monat
- Non-profit: keine Gewinnausschuettung, aber kostendeckend
- Geschaeftsfuehrergehalt ist erlaubt

## Kalkulation (konservativ)

Von jedem 1 Euro bleiben nach allen Gebuehren (App Store, Zahlungsanbieter, MwSt) ~50ct.
So wird geplant — alles darueber ist Bonus.

| Nutzer | Pro Monat | Pro Jahr |
|---|---|---|
| 1.000 | 500 Euro | 6.000 Euro |
| 5.000 | 2.500 Euro | 30.000 Euro |
| 10.000 | 5.000 Euro | 60.000 Euro |
| 50.000 | 25.000 Euro | 300.000 Euro |
| 100.000 | 50.000 Euro | 600.000 Euro |

## Laufende Kosten (Schaetzung)

| Posten | Monatlich |
|---|---|
| Hetzner Server (aktuell) | ~5-15 Euro |
| Hetzner skaliert (10k Nutzer) | ~50-100 Euro |
| KI API (Anthropic) | ~0,5ct/Anfrage, nutzungsabhaengig |
| Domain, SSL | ~5 Euro |
| **Gesamt klein** | **~70 Euro/Monat** |

## Break-even

- ~150 zahlende Nutzer → Server traegt sich selbst
- ~500 Nutzer → komfortabel
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
