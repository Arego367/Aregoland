# Uebersetzungs-Tracking

> Ab 2026-04-01: Neue i18n-Keys werden NUR auf Deutsch erstellt.
> Englisch und Litauisch werden spaeter in einem separaten Uebersetzungs-Befehl ergaenzt.

## Status-Uebersicht

| Sprache   | Code | Status |
|-----------|------|--------|
| Deutsch   | de   | Primaer — alle Keys vorhanden |
| Englisch  | en   | Vollstaendig (Stand 2026-04-01) |
| Litauisch | lt   | Vollstaendig (Stand 2026-04-01) |

## Vollstaendig uebersetzte Komponenten (DE/EN/LT)

Alle bisherigen Komponenten sind in allen 3 Sprachen vollstaendig uebersetzt (Stand 2026-04-01):

| Komponente | Namespace | DE | EN | LT |
|------------|-----------|----|----|-----|
| Navigation & Common | `common` | ja | ja | ja |
| Dashboard | `dashboard` | ja | ja | ja |
| Chat | `chat` | ja | ja | ja |
| Kontakte | `people` | ja | ja | ja |
| Spaces | `spaces` | ja | ja | ja |
| Kalender | `calendar` | ja | ja | ja |
| Einstellungen | `settings` | ja | ja | ja |
| Profil | `profile` | ja | ja | ja |
| Registrierung | `registration` | ja | ja | ja |
| Welcome | `welcome` | ja | ja | ja |
| QR-Code | `qrcode` | ja | ja | ja |
| Kontakt-Detail | `contactDetail` | ja | ja | ja |
| Kind-Profil | `childProfile` | ja | ja | ja |

## Neue Keys — nur Deutsch (noch nicht uebersetzt)

> Hier werden neue Keys eingetragen die nur auf DE erstellt wurden.
> Format: Komponente | Key | DE | EN | LT

| Komponente | Key | DE | EN | LT |
|------------|-----|----|----|-----|
| Spaces | `spaces.ttlHours` | ja | nein | nein |
| Spaces | `spaces.manageChats` | ja | nein | nein |
| Spaces | `spaces.moderatorCoHostInfo` | ja | nein | nein |
| Spaces | `spaces.relayNodeActive` | ja | nein | nein |
| Spaces | `spaces.relayNodeActiveDesc` | ja | nein | nein |
| Spaces | `spaces.relayNodeOffWarning` | ja | nein | nein |
| Spaces | `spaces.adminAlwaysAccess` | ja | nein | nein |
| Spaces | `spaces.tab_profile` | ja | nein | nein |
| Spaces | `spaces.spaceNotifications` | ja | nein | nein |
| Spaces | `spaces.spaceNotificationsDesc` | ja | nein | nein |
| Spaces | `spaces.rolesAndPermissions` | ja | nein | nein |
| Spaces | `spaces.createRole` | ja | nein | nein |
| Spaces | `spaces.roleNamePlaceholder` | ja | nein | nein |
| Spaces | `spaces.perm_readChats` | ja | nein | nein |
| Spaces | `spaces.perm_writeChats` | ja | nein | nein |
| Spaces | `spaces.perm_createEvents` | ja | nein | nein |
| Spaces | `spaces.perm_postNews` | ja | nein | nein |
| Spaces | `spaces.perm_inviteMembers` | ja | nein | nein |
| Spaces | `spaces.notifMode_all` | ja | nein | nein |
| Spaces | `spaces.notifMode_mute` | ja | nein | nein |
| Spaces | `spaces.notifMode_none` | ja | nein | nein |
| Spaces | `spaces.notif_messages` | ja | nein | nein |
| Spaces | `spaces.notif_events` | ja | nein | nein |
| Spaces | `spaces.notif_news` | ja | nein | nein |
| Spaces | `spaces.notif_calls` | ja | nein | nein |
| Spaces | `spaces.notif_mentions` | ja | nein | nein |
| Spaces | `spaces.notif_newMembers` | ja | nein | nein |
| Spaces | `spaces.notifRecommended` | ja | nein | nein |
| Spaces | `spaces.recording` | ja | nein | nein |
| Spaces | `spaces.noMentionResults` | ja | nein | nein |
| Spaces | `spaces.largeFileWarning` | ja | nein | nein |
| Spaces | `spaces.sendAnyway` | ja | nein | nein |
| Spaces | `spaces.perm_allowNetworkHelper` | ja | nein | nein |
| Spaces | `spaces.networkHelperActive` | ja | nein | nein |
| Spaces | `spaces.networkHelperDesc` | ja | nein | nein |
| Spaces | `spaces.networkHelperOffWarning` | ja | nein | nein |
| Spaces | `spaces.useMobileData` | ja | nein | nein |
| Spaces | `spaces.useMobileDataDesc` | ja | nein | nein |
| Spaces | `spaces.mobileDataDetected` | ja | nein | nein |
| Spaces | `spaces.createSpaceInfo` | ja | nein | nein |
| Spaces | `spaces.networkHelperRoleHint` | ja | nein | nein |
| Spaces | `spaces.networkHelperProfileHint` | ja | nein | nein |
| Spaces | `spaces.guestHint` | ja | nein | nein |
| Spaces | `spaces.chatMembersVisible` | ja | nein | nein |
| Spaces | `spaces.guestDefault` | ja | nein | nein |
| Spaces | `spaces.guestRoleHint` | ja | nein | nein |
| Spaces | `spaces.writeRequiresRead` | ja | nein | nein |
| Spaces | `spaces.customizeLayout` | ja | nein | nein |
| Spaces | `spaces.upcomingEvents` | ja | nein | nein |
| Spaces | `spaces.activeChats` | ja | nein | nein |
| Spaces | `spaces.membersOnline` | ja | nein | nein |
| Spaces | `spaces.widget_pinned` | ja | nein | nein |
| Spaces | `spaces.widget_announcements` | ja | nein | nein |
| Spaces | `spaces.widget_stats` | ja | nein | nein |
| Spaces | `spaces.widget_events` | ja | nein | nein |
| Spaces | `spaces.widget_activeChats` | ja | nein | nein |
| Spaces | `spaces.widget_membersOnline` | ja | nein | nein |

## Anleitung: Uebersetzung nachholen

Wenn alle neuen Keys gesammelt sind, koennen sie in einem Rutsch uebersetzt werden:

1. Alle Keys aus der Tabelle oben sammeln
2. Uebersetzung fuer EN und LT erstellen
3. In `src/i18n/locales/en.json` und `lt.json` eintragen
4. Tabelle hier aktualisieren (alle auf "ja" setzen)
