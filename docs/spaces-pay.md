# Spaces Pay — Gebührenfreie Rechnungen & QR-Überweisung

## Konzept

Space-Betreiber (z.B. Läden, Vereine, Dienstleister) können direkt in Aregoland
Rechnungen erstellen. Der Kunde bezahlt per SEPA-Überweisung via Banking-App —
kein Zahlungssystem, keine Gebühren, keine Lizenz nötig.

## Warum kein eigenes Zahlungssystem

- Aregoland wickelt KEINE Zahlung ab — wir sind nur der Rechnungsersteller
- Keine PCI-DSS Compliance nötig
- Keine BaFin-Lizenz nötig
- Keine Stripe/PayPal-Gebühren (1,5–3% entfallen komplett)
- Datenschutz: Aregoland sieht keine Bankdaten, keine Transaktionen

## Technischer Standard: EPC QR Code

Der generierte QR-Code folgt dem **EPC QR Code Standard** (European Payments Council).
Dieser Standard wird nativ von allen deutschen und europäischen Banking-Apps unterstützt:
Sparkasse, DKB, N26, ING, Commerzbank, Volksbank, Revolut, etc.

### EPC QR Inhalt:
- BIC der empfangenden Bank
- IBAN des Empfängers
- Name des Empfängers
- Betrag (EUR)
- Verwendungszweck / Rechnungsnummer

Beim Scannen öffnet die Banking-App automatisch eine vorausgefüllte Überweisung —
der Kunde muss nur noch bestätigen.

## User Flow

### Händler (Space-Admin/Founder):
1. Space öffnen → Tab "Rechnung" (oder über Space-Einstellungen)
2. Rechnungspositionen eingeben (Artikel, Menge, Preis)
3. Eigene IBAN + Name hinterlegt (einmalig in Space-Einstellungen)
4. Rechnung generieren → EPC QR Code wird erstellt
5. QR Code dem Kunden zeigen (Bildschirm) oder per Chat senden

### Kunde:
1. QR Code mit Banking-App scannen
2. Überweisung erscheint vorausgefüllt (Name, IBAN, Betrag, Verwendungszweck)
3. Bestätigen → Echtzeit-Überweisung (SEPA Instant, falls beide Banken unterstützen)

## Zahlungsbestätigung

Da Aregoland keinen Zugriff auf Bankkonten hat, gibt es zwei Optionen:

**Option A — Manuell:**
Händler sieht in seiner Banking-App den Eingang und markiert Rechnung in Aregoland
manuell als "Bezahlt".

**Option B — Kunde bestätigt (Trust-basiert):**
Kunde drückt nach der Zahlung in der App auf "Zahlung abgeschlossen" —
Händler bekommt eine Benachrichtigung. Kein Beweis, aber für Stammkunden ausreichend.

**Option C — Zukunft: Open Banking (PSD2):**
Händler verbindet freiwillig sein Bankkonto via PSD2 Read-Only API →
automatische Zahlungserkennung über Verwendungszweck/Rechnungsnummer.
Kein Geldfluss über Aregoland — nur Lesezugriff auf eigene Kontobewegungen.

## Datenschutz

- IBAN des Händlers: nur im Space sichtbar (Mitglieder/Kunden)
- IBAN des Kunden: nie gespeichert, nie übertragen — bleibt in Banking-App
- Aregoland speichert nur: Rechnungsdaten (Positionen, Betrag, Status)
- Alle Rechnungsdaten: lokal in localStorage des Space-Founders (P2P-Prinzip)

## Space-Einstellungen (einmalig):
- Empfänger-Name
- IBAN
- BIC (optional, kann aus IBAN abgeleitet werden)
- Standard-Währung (EUR)
- Rechnungs-Prefix (z.B. "RE-2026-")

## Rechnungs-Interface:

### Positionen:
- Artikel/Beschreibung
- Menge
- Einzelpreis
- Gesamt (automatisch)
- MwSt-Satz (0%, 7%, 19%) — optional

### Rechnung gesamt:
- Netto-Summe
- MwSt
- Brutto-Summe
- Fälligkeitsdatum (optional)
- Notiz/Freitext

## Implementierungs-Priorität

Gehört zum **Pay-Modul** — aber unabhängig davon implementierbar,
da kein Zahlungssystem nötig. Kann als erster Schritt des Pay-Moduls gebaut werden.

### Abhängigkeiten:
- Spaces müssen bestehen (✅ fertig)
- IBAN-Eingabe in Space-Einstellungen (neu)
- Rechnungs-UI in Space (neu)
- EPC QR Code Generierung (Library: `epc-qr` oder custom)
- Rechnungs-Liste/Archiv in localStorage

## Zielgruppen

- Kleingewerbe / Soloselbständige (Döner-Laden, Friseur, Handwerker)
- Vereine (Mitgliedsbeiträge, Veranstaltungen)
- Privatpersonen (Kosten teilen, WG-Abrechnung)
- Schulen / Kitas (Ausflüge, Materialien)

## Wettbewerbs-Vorteil

| Lösung | Gebühren | Datenschutz | Aufwand |
|--------|----------|-------------|---------|
| PayPal | 2,49% + 0,35€ | schlecht | mittel |
| Stripe | 1,5% + 0,25€ | mittel | hoch |
| SumUp | 1,69% | mittel | mittel |
| **Aregoland** | **0%** | **excellent** | **minimal** |
