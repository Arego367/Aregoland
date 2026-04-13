/**
 * Roadmap-Daten aus dem Card-System (docs/{domain}/*.md).
 *
 * Jeder Eintrag referenziert eine oder mehrere Feature-Cards und uebernimmt
 * deren Status.  Die Roadmap-UI in SpacesScreen.tsx liest ausschliesslich
 * diese Datei — manuelle Aenderungen an der Roadmap sind nicht mehr noetig.
 *
 * Status-Mapping (Card → Roadmap):
 *   aktiv      → done
 *   in-arbeit  → wip
 *   geplant    → planned
 */

export type RoadmapStatus = "done" | "wip" | "planned";

export interface RoadmapItem {
  title: string;
  desc: string;
  /** Referenzierte Card-Pfade unter docs/ */
  cards: string[];
}

export interface RoadmapSection {
  status: RoadmapStatus;
  items: RoadmapItem[];
}

// ---------------------------------------------------------------------------
// Einzelne Items — sortiert nach Card-Status
// ---------------------------------------------------------------------------

const doneItems: RoadmapItem[] = [
  {
    title: "Messenger",
    desc: "Vollstaendig verschluesselter P2P-Chat mit Audio/Video-Anrufen, Sprachnachrichten und Dateiversand. Alles geht direkt von Geraet zu Geraet — kein Server sieht oder speichert deine Nachrichten. Dazu Online/Offline-Status und Browser-Benachrichtigungen, damit du nichts verpasst.",
    cards: ["messaging/chat", "messaging/media-attachments", "messaging/message-storage", "calls/voice-video"],
  },
  {
    title: "Kontakte",
    desc: "QR-Code scannen oder Kurzcode eingeben — fertig, Kontakt hinzugefuegt. Keine Handynummer noetig, keine Kontaktliste die hochgeladen wird. Du entscheidest wer dich erreichen darf.",
    cards: ["contacts/contact-management", "contacts/qr-pairing"],
  },
  {
    title: "Spaces",
    desc: "Digitale Raeume fuer Familien, Vereine, Schulen und Firmen. Mit Rollen-System (Gruender, Admin, Custom), QR-Einladungen, oeffentlicher Suche, Beitritts-Genehmigung und Echtzeit-Sync zwischen allen Mitgliedern via Gossip Protocol — komplett dezentral, kein Single Point of Failure.",
    cards: ["spaces/space-management", "spaces/space-sync"],
  },
  {
    title: "Kalender",
    desc: "Monats-, Wochen- und Tagesansicht mit Event-Erstellung und Erinnerungen. Laeuft komplett lokal auf deinem Geraet. Spaeter kommen Familien-Kalender, Spaces-Kalender und P2P-Teilen dazu.",
    cards: ["calendar/events"],
  },
  {
    title: "Profil & Sicherheit",
    desc: "Passwordlose Registrierung — kein Passwort, kein Datenleck, dein Geraet ist dein Schluessel. Dazu Kind-Konten mit FSK-Grundlage, Recovery per QR-Code oder Textschluessel, und ein vollstaendiges Profil mit Avatar, Adressen und Datenschutz-Einstellungen.",
    cards: ["account/profile", "identity/registration", "identity/crypto-keys"],
  },
  {
    title: "Sprachen",
    desc: "Aregoland spricht 24 Sprachen — alle EU-Sprachen plus Arabisch, Russisch und Ukrainisch. Damit moeglichst viele Menschen in Europa die App in ihrer Sprache nutzen koennen, von Anfang an.",
    cards: ["i18n/localization"],
  },
  {
    title: "PWA & Infrastruktur",
    desc: "Aregoland laeuft als Progressive Web App direkt im Browser — installierbar auf jedem Geraet, ohne App Store. Das ist unsere Beta-Phase: Nutzer koennen die App bereits testen und nutzen, waehrend wir parallel die nativen Apps fuer Google Play und Apple App Store vorbereiten. Dazu Prod-Build ueber Nginx, E-Mail-Weiterleitungen und PayPal-Spendensystem.",
    cards: ["native-app/pwa-legacy", "native-app/build-pipeline"],
  },
  {
    title: "Aregoland Official Space",
    desc: "Unser zentraler Raum — hier findest du Neuigkeiten, diese Roadmap und den Support-Chat. Support-Anfragen werden automatisch als GitHub Issues erstellt, mit Arego-ID Vertrauenssystem und Rate-Limiting.",
    cards: ["account/support"],
  },
];

const wipItems: RoadmapItem[] = [
  {
    title: "Spaces erweitern",
    desc: "Melde-System und Mitglieder-Kontrolle fuer Space-Admins, Video Calls und Streaming im Meeting- und Webinar-Modus. Spaces sollen der zentrale Ort werden, an dem Gruppen wirklich alles machen koennen.",
    cards: ["spaces/space-management", "child-safety/parental-controls"],
  },
  {
    title: "Chat-Verbesserungen",
    desc: "Angepinnte Chats damit Wichtiges oben bleibt, und zwei getrennte Profile — privat und beruflich — die parallel laufen. So musst du nicht zwischen Apps wechseln.",
    cards: ["messaging/chat"],
  },
  {
    title: "Backup & Recovery",
    desc: "Erweitertes Backup im .arego Format, komplett E2E verschluesselt. Recovery per Datei-Upload und Shamir's Secret Sharing — dein Schluessel wird aufgeteilt, damit kein einzelner Punkt alles verlieren kann.",
    cards: ["identity/crypto-keys"],
  },
  {
    title: "KI-Support",
    desc: "Ein persoenlicher Assistent direkt in der App. Beantwortet Fragen, hilft bei Problemen — ohne dass du die App verlassen musst.",
    cards: ["account/support"],
  },
];

const plannedItems: RoadmapItem[] = [
  {
    title: "World",
    desc: "Aregolands eigener Social-Feed. Nur verifizierte Nutzer posten, das FSK-System schuetzt Kinder automatisch. Kein Algorithmus, kein Infinite Scroll — stattdessen KI-gestuetzte Post-Erstellung und wissenschaftsbasierte Bildschirmzeit fuer Kinder.",
    cards: ["child-safety/fsk-system"],
  },
  {
    title: "Kinderschutz & EUDI Wallet",
    desc: "FSK wird vollstaendig: serverseitige Alterspruefung, Kinder unter 16 unsichtbar fuer Fremde. Das Ganze laeuft ueber die europaeische digitale Identitaet (EUDI Wallet) — die EU baut die Infrastruktur, wir liefern den Kanal. Sandbox 2026, Produktion Ende 2026.",
    cards: ["child-safety/fsk-system", "child-safety/child-profiles"],
  },
  {
    title: "Spaces als Plattform",
    desc: "Shop-System zum Verkaufen direkt im Space, EPC QR-Rechnungen fuer gebuehrenfreie SEPA-Zahlungen, und ein B2B-Layer als Privacy-first Alternative zu LinkedIn — Unternehmensseiten, Arbeitsplatz-Verifizierung, berufliche Identitaet ueber EUDI Wallet.",
    cards: ["spaces/space-management"],
  },
  {
    title: "Kalender & Dokumente",
    desc: "Kalender waechst weiter: Kinder-Stundenplan, Familien-Termine P2P teilen, Spaces-Kalender, iCal Import/Export. Dazu P2P-Dokumentenaustausch mit Ordner-System und Ablaufdaten — fuer Behoerden, Schulen, Aerzte.",
    cards: ["calendar/events", "documents/file-sharing"],
  },
  {
    title: "Institutionen & Politik",
    desc: "Gemeinden, Schulen und Vereine bekommen eigene Formulare mit EUDI-Anbindung. Die Politik-Kachel uebersetzt Gesetze in Alltagssprache und ermoeglicht anonymes Voting — Demokratie direkt in der App.",
    cards: [],
  },
  {
    title: "Native Apps",
    desc: "Google Play und Apple App Store — native Apps via Capacitor.js. Damit Aregoland aus der PWA-Beta rauswaechst und als vollwertige App auf jedem Smartphone laeuft.",
    cards: ["native-app/architecture", "native-app/web-engine"],
  },
  {
    title: "Kinder-Medienzugang",
    desc: "Eigener Player mit Whitelist-Prinzip: Eltern fuegen erlaubte Kanaele hinzu, Kinder sehen nur diese. Kein Algorithmus, keine Als-naechstes-Falle. Mit Eltern-Abo (YouTube Premium) keine Werbung. Technologie: YouTube Data API.",
    cards: ["child-safety/parental-controls"],
  },
  {
    title: "Community-Schutz (Niu Niu Niu)",
    desc: "3-Stufen-System gegen Hass und Missbrauch — ohne Privacy zu opfern. Von Verwarnung ueber Einschraenkungen bis zur Polizei-Meldung per EUDI-Hash. Aregoland kennt nie die echte Identitaet. KI-Moderation plus Community-Moderatoren je Sprache.",
    cards: ["child-safety/fsk-system"],
  },
  {
    title: "Autonomes KI-Team",
    desc: "Nach dem Launch: KI-Agenten die Aregoland selbst organisieren — Support, Social Media, Marketing, Monitoring. Open Source auf eigenem Server. Erst wenn echte Nutzer da sind, nicht vorher.",
    cards: [],
  },
];

// ---------------------------------------------------------------------------
// Oeffentliche API
// ---------------------------------------------------------------------------

export const roadmapSections: RoadmapSection[] = [
  { status: "done", items: doneItems },
  { status: "wip", items: wipItems },
  { status: "planned", items: plannedItems },
];
