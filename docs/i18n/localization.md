# Internationalisierung

## Zweck
Mehrsprachige Unterstuetzung der App mit 27 Sprachen ueber i18next.

## Status
`aktiv`

## Code-Anker
- **Config:** `src/i18n/i18n.ts` — i18next-Konfiguration mit react-i18next
- **Locales:** `src/i18n/locales/` — 27 Sprach-Dateien (JSON)

## Verfuegbare Sprachen
ar, bg, cs, da, **de**, el, **en**, es, et, fi, fr, hr, hu, it, **lt**, lv, mt, nl, no, pl, pt, ro, ru, sk, sl, sv, uk

Primaersprachen fett markiert: Deutsch (de), Englisch (en), Litauisch (lt).

## Nutzung in Komponenten
```tsx
const { t } = useTranslation();
t('registration.generateError')
t('chatList.tapToWrite')
t('calendar.dur15min')
```

## Key-Namenskonvention
`{domain}.{key}` — z.B. `registration.generateError`, `chatList.tapToWrite`

## Entwicklungs-Regel
1. Neue Keys werden **ausschliesslich auf Deutsch** angelegt
2. Andere Sprachen (en, lt, etc.) werden **nicht** befuellt
3. Spracherweiterung nur auf explizite Anweisung von Aras ("Sprachen erweitern")
4. Keine Emojis in i18n-Strings

## Abhaengigkeiten
- Genutzt von: Alle UI-Komponenten

## Einschraenkungen
- Fallback-Sprache: Deutsch (de)
- Fehlende Uebersetzungen zeigen deutschen Text an
- Token-Budget: Uebersetzungen werden spaeter nachgereicht
