# Uebersetzungs-Tracking

> Ab 2026-04-01: Neue i18n-Keys werden NUR auf Deutsch erstellt.
> Englisch und Litauisch werden spaeter in einem separaten Uebersetzungs-Befehl ergaenzt.

## Status-Uebersicht

| Sprache   | Code | Status |
|-----------|------|--------|
| Deutsch   | de   | Primaer — alle Keys vorhanden |
| Englisch  | en   | Vollstaendig (Stand 2026-04-04) |
| Litauisch | lt   | Vollstaendig (Stand 2026-04-04) |
| Franzoesisch | fr | Vollstaendig (Stand 2026-04-04) |
| Spanisch | es | Vollstaendig (Stand 2026-04-04) |
| Polnisch | pl | Vollstaendig (Stand 2026-04-04) |
| Italienisch | it | Vollstaendig (Stand 2026-04-04) |
| Niederlaendisch | nl | Vollstaendig (Stand 2026-04-04) |
| Portugiesisch | pt | Vollstaendig (Stand 2026-04-04) |
| Schwedisch | sv | Vollstaendig (Stand 2026-04-04) |
| Rumaenisch | ro | Vollstaendig (Stand 2026-04-04) |
| Tschechisch | cs | Vollstaendig (Stand 2026-04-04) |
| Ungarisch | hu | Vollstaendig (Stand 2026-04-04) |
| Daenisch | da | Vollstaendig (Stand 2026-04-04) |
| Finnisch | fi | Vollstaendig (Stand 2026-04-04) |
| Slowakisch | sk | Vollstaendig (Stand 2026-04-04) |
| Kroatisch | hr | Vollstaendig (Stand 2026-04-04) |
| Slowenisch | sl | Vollstaendig (Stand 2026-04-04) |
| Estnisch | et | Vollstaendig (Stand 2026-04-04) |
| Lettisch | lv | Vollstaendig (Stand 2026-04-04) |
| Griechisch | el | Vollstaendig (Stand 2026-04-04) |
| Maltesisch | mt | Vollstaendig (Stand 2026-04-04) |
| Bulgarisch | bg | Vollstaendig (Stand 2026-04-04) |
| Norwegisch | no | Vollstaendig (Stand 2026-04-04) |

## Vollstaendig uebersetzte Komponenten

Alle Namespaces sind in allen 24 Sprachen vollstaendig uebersetzt (Stand 2026-04-04) — jeweils 660 Keys.

## Neue Keys — nur Deutsch (noch nicht uebersetzt)

> Hier werden neue Keys eingetragen die nur auf DE erstellt wurden.
> Format: Komponente | Key | DE | EN | LT

| Komponente | Key | DE | EN | LT |
|------------|-----|----|----|-----|
| SettingsScreen | settings.storageSection | Meine Daten & Speicher | — | — |
| SettingsScreen | settings.storageExplainTitle | Was wird hier gespeichert? | — | — |
| SettingsScreen | settings.storageExplainText | Wenn du moechtest, kannst du... | — | — |
| SettingsScreen | settings.storageExplainOptional | Das ist vollstaendig optional... | — | — |
| SettingsScreen | settings.storageStatus | Status | — | — |
| SettingsScreen | settings.storageInactive | Kein Speicher aktiv (Standard, kostenlos) | — | — |
| SettingsScreen | settings.storageActive | Speicher aktiv | — | — |
| SettingsScreen | settings.storageUsed | belegt | — | — |
| SettingsScreen | settings.storageActivate | Speicher freischalten | — | — |
| SettingsScreen | settings.storageActivateTitle | Speicher freischalten | — | — |
| SettingsScreen | settings.storageActivateDesc | Schalte Server-Speicher frei... | — | — |
| SettingsScreen | settings.storageVoucher | Gutscheincode | — | — |
| SettingsScreen | settings.storageVoucherPlaceholder | Code eingeben | — | — |
| SettingsScreen | settings.storageRedeem | Einloesen | — | — |
| SettingsScreen | settings.storageSubscription | Abo abschliessen | — | — |
| SettingsScreen | settings.storageSoonAvailable | Bald verfuegbar | — | — |
| SettingsScreen | settings.storageSyncOptions | Was soll gespeichert werden? | — | — |
| SettingsScreen | settings.storageSyncDesc | Waehle aus, welche Daten... | — | — |
| SettingsScreen | settings.storageSyncAvatar | Profilbild | — | — |

## Anleitung: Uebersetzung nachholen

Wenn alle neuen Keys gesammelt sind, koennen sie in einem Rutsch uebersetzt werden:

1. Alle Keys aus der Tabelle oben sammeln
2. Uebersetzung fuer EN und LT erstellen
3. In `src/i18n/locales/en.json` und `lt.json` eintragen
4. Tabelle hier aktualisieren (alle auf "ja" setzen)
