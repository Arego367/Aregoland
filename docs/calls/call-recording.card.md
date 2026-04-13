# Anruf-Aufnahme (Call Recording)

## Zweck
Lokale Aufnahme von Sprach- und Videoanrufen via MediaRecorder API mit Einwilligungs-Protokoll.

## Status
`aktiv`

## Code-Anker
- **Hook:** `src/app/hooks/useCallRecording.ts` — MediaRecorder-Logik, Consent-State-Machine, WebM-Download
- **UI:** `src/app/components/CallOverlay.tsx` — Aufnahme-Button, Einwilligungs-Dialog, Recording-Indikator
- **Integration:** `src/app/components/ChatScreen.tsx` — Hook-Verdrahtung, Signal-Routing
- **Signaling:** `src/app/lib/p2p-manager.ts` — `CallSignal` mit Recording-Actions

## Datenfluss
Aufnahme-Button → `record-request` via DataChannel → Empfänger sieht Einwilligungs-Dialog → `record-accept`/`record-reject` → Bei Accept: MediaRecorder startet (nur beim Initiator) → `record-stop` beendet Aufnahme → WebM-Download

## Consent-Protokoll
- `record-request` — Initiator fragt Aufnahme an
- `record-accept` — Teilnehmer stimmt zu
- `record-reject` — Teilnehmer lehnt ab
- `record-stop` — Aufnahme wird beendet (von beiden Seiten möglich)

## Consent-States
`idle` → `requesting` (Initiator wartet) | `pending` (Empfänger sieht Dialog) → `accepted` → Aufnahme läuft → `idle`
`idle` → `requesting` | `pending` → `rejected` → `idle` (nach 3s)

## Aufnahme-Details
- Audio: Beide Streams (lokal + remote) via AudioContext gemischt
- Video: Remote-Video-Track + gemischtes Audio
- Format: WebM (vp8+opus) mit Fallback auf MP4
- Speicher: Lokaler Download als Datei, kein Server-Upload

## Schluessel-Exports
- `useCallRecording` — React-Hook: `[CallRecordingState, CallRecordingActions]`
- `RecordingConsent` — Typ: idle | requesting | pending | accepted | rejected
- `CallRecordingState` — Interface: consent, isRecording, elapsed, incomingRequest
- `CallRecordingActions` — Interface: requestRecording, acceptRecording, rejectRecording, stopRecording, handleRecordingSignal, cleanup

## Abhaengigkeiten
- Nutzt: [Sprach-/Videoanrufe](/docs/calls/voice-video.md) (CallOverlay, CallManager, CallSignal)
- Nutzt: [P2P-Netzwerk](/docs/p2p-network/webrtc.md) (DataChannel für Consent-Signaling)

## Einschraenkungen
- Privacy-First: Aufnahme nur mit Einwilligung aller Teilnehmer
- Nur lokale Aufnahme — kein Server-seitiges Recording
- Aufnahme startet nur beim Initiator (nicht beim Akzeptierenden)
- Kein SpaceCallOverlay — nur 1:1-Anrufe unterstützt (Spaces haben noch keine Call-Funktion)
