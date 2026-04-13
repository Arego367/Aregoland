# Kalender-Einladungen & Teilnahme-Status

## Zweck
Kontakte zu persoenlichen Kalender-Events einladen und RSVP-Antworten verwalten.
Einladungen werden P2P ueber den bestehenden DataChannel synchronisiert.

## Status
`aktiv`

## Code-Anker
- **Typen:** `src/app/types.ts` — `EventInvitee`, `InviteStatus`
- **P2P Messages:** `src/app/lib/p2p-manager.ts` — `CalendarInviteMessage`, `CalendarRsvpMessage`, send/receive Handler
- **Storage:** `src/app/lib/calendar-invitations.ts` — ReceivedInvitation CRUD, Offline-Queue
- **UI:** `src/app/components/CalendarScreen.tsx` — Invitee-Picker, RSVP-Buttons, Einladungs-Events im Kalender

## Datenfluss
### Einladung senden
Event erstellen mit Invitees → `sendCalendarInvite()` per P2P DataChannel → Empfaenger speichert in `arego_calendar_invitations`

### RSVP antworten
RSVP-Button klicken → `updateRsvp()` lokal → `sendCalendarRsvp()` per P2P an Organizer → Organizer aktualisiert `invitees[].status`

## P2P Message Types
| Type | Richtung | Beschreibung |
|------|----------|-------------|
| `calendar_invite` | Organizer → Invitee | Event-Details + Einladung |
| `calendar_rsvp` | Invitee → Organizer | RSVP-Antwort (accepted/declined/maybe) |

## CalendarEvent-Erweiterungen
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| invitees | EventInvitee[]? | Liste eingeladener Kontakte mit RSVP-Status |
| organizerAregoId | string? | AregoId des Organisators |

## Storage-Keys
- `arego_calendar_events` — Events mit invitees-Feld
- `arego_calendar_invitations` — Empfangene Einladungen
- `arego_calendar_invite_queue` — Offline-Queue fuer ausstehende Einladungen

## UI-Elemente
- Kontakt-Picker im Event-Editor (Chip-Tags + Dropdown)
- RSVP-Status-Dots (gruen/gelb/rot/grau) im Event-Detail
- RSVP-Buttons (Zusagen/Vielleicht/Absagen) fuer empfangene Einladungen
- Empfangene Einladungen als lila Events im Kalender (Prefix: Briefumschlag-Emoji)

## Abhaengigkeiten
- P2P-Manager (`src/app/lib/p2p-manager.ts`)
- Kontakte (`src/app/auth/contacts.ts`)

## Einschraenkungen
- Einladungen werden nur bei bestehender P2P-Verbindung uebertragen
- Offline-Queue wird nicht automatisch abgearbeitet (manuelles Retry noetig)
- Keine Serien-Einladungen (einzelne Events only)
