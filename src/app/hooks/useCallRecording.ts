/**
 * useCallRecording — MediaRecorder-basierte Anrufaufnahme mit Einwilligungs-Protokoll
 *
 * Privacy-First: Aufnahme startet NUR wenn alle Teilnehmer zugestimmt haben.
 * Lokale Aufnahme — kein Server-seitiges Recording.
 *
 * Consent-Protokoll via DataChannel:
 *   Initiator sendet 'record-request'
 *   → Empfänger sieht Dialog → 'record-accept' oder 'record-reject'
 *   → Bei Accept: beide Seiten zeigen Aufnahme-Indikator, Initiator startet MediaRecorder
 *   → 'record-stop' beendet die Aufnahme auf beiden Seiten
 */

import { useState, useRef, useCallback } from 'react';
import type { CallSignal } from '@/app/lib/p2p-manager';
import type { CallType } from '@/app/lib/call-manager';

export type RecordingConsent = 'idle' | 'requesting' | 'pending' | 'accepted' | 'rejected';

export interface CallRecordingState {
  /** Consent-Status */
  consent: RecordingConsent;
  /** Ob gerade aufgenommen wird */
  isRecording: boolean;
  /** Aufnahme-Dauer in Sekunden */
  elapsed: number;
  /** Ob der Remote eine Aufnahme angefragt hat (für Dialog) */
  incomingRequest: boolean;
}

export interface CallRecordingActions {
  /** Aufnahme-Anfrage an den anderen Teilnehmer senden */
  requestRecording: () => void;
  /** Eingehende Aufnahme-Anfrage akzeptieren */
  acceptRecording: () => void;
  /** Eingehende Aufnahme-Anfrage ablehnen */
  rejectRecording: () => void;
  /** Aufnahme stoppen (von beiden Seiten möglich) */
  stopRecording: () => void;
  /** Eingehendes Recording-Signal verarbeiten */
  handleRecordingSignal: (action: CallSignal['action']) => void;
  /** Aufräumen bei Call-Ende */
  cleanup: () => void;
}

const MIME_TYPE = typeof MediaRecorder !== 'undefined'
  ? MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : MediaRecorder.isTypeSupported('video/webm')
    ? 'video/webm'
    : 'video/mp4'
  : 'video/webm';

export function useCallRecording(
  sendSignal: (signal: CallSignal) => Promise<boolean>,
  callType: CallType,
  localStream: MediaStream | null,
  remoteStream: MediaStream | null,
  contactName: string,
): [CallRecordingState, CallRecordingActions] {
  const [consent, setConsent] = useState<RecordingConsent>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [incomingRequest, setIncomingRequest] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const isInitiatorRef = useRef(false);

  const startMediaRecorder = useCallback(() => {
    if (!localStream && !remoteStream) return;

    // AudioContext zum Mixen beider Streams
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();

    if (localStream) {
      const localSource = ctx.createMediaStreamSource(localStream);
      localSource.connect(dest);
    }
    if (remoteStream) {
      const remoteSource = ctx.createMediaStreamSource(remoteStream);
      remoteSource.connect(dest);
    }

    // Für Video-Calls: Remote-Video-Track + gemischtes Audio
    const tracks: MediaStreamTrack[] = [...dest.stream.getAudioTracks()];
    if (callType === 'video' && remoteStream) {
      const videoTrack = remoteStream.getVideoTracks()[0];
      if (videoTrack) tracks.push(videoTrack);
    }

    const combinedStream = new MediaStream(tracks);
    const recorder = new MediaRecorder(combinedStream, { mimeType: MIME_TYPE });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: MIME_TYPE });
      const ext = MIME_TYPE.includes('webm') ? 'webm' : 'mp4';
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `call-${contactName.replace(/\s+/g, '_')}-${ts}.${ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      chunksRef.current = [];
      ctx.close();
    };

    recorder.start(1000);
    recorderRef.current = recorder;

    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, [localStream, remoteStream, callType, contactName]);

  const stopMediaRecorder = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    clearInterval(timerRef.current);
    setIsRecording(false);
    setElapsed(0);
    setConsent('idle');
    setIncomingRequest(false);
    isInitiatorRef.current = false;
  }, []);

  const requestRecording = useCallback(() => {
    isInitiatorRef.current = true;
    setConsent('requesting');
    sendSignal({ _t: 'call', action: 'record-request', callType });
  }, [sendSignal, callType]);

  const acceptRecording = useCallback(() => {
    setConsent('accepted');
    setIncomingRequest(false);
    sendSignal({ _t: 'call', action: 'record-accept', callType });
    // Der Initiator startet den Recorder, nicht der Akzeptierende
  }, [sendSignal, callType]);

  const rejectRecording = useCallback(() => {
    setConsent('rejected');
    setIncomingRequest(false);
    sendSignal({ _t: 'call', action: 'record-reject', callType });
    setTimeout(() => setConsent('idle'), 3000);
  }, [sendSignal, callType]);

  const stopRecording = useCallback(() => {
    sendSignal({ _t: 'call', action: 'record-stop', callType });
    stopMediaRecorder();
  }, [sendSignal, callType, stopMediaRecorder]);

  const handleRecordingSignal = useCallback((action: CallSignal['action']) => {
    switch (action) {
      case 'record-request':
        setConsent('pending');
        setIncomingRequest(true);
        break;
      case 'record-accept':
        setConsent('accepted');
        // Initiator startet die Aufnahme
        if (isInitiatorRef.current) {
          startMediaRecorder();
        }
        break;
      case 'record-reject':
        setConsent('rejected');
        isInitiatorRef.current = false;
        setTimeout(() => setConsent('idle'), 3000);
        break;
      case 'record-stop':
        stopMediaRecorder();
        break;
    }
  }, [startMediaRecorder, stopMediaRecorder]);

  const cleanup = useCallback(() => {
    stopMediaRecorder();
  }, [stopMediaRecorder]);

  return [
    { consent, isRecording, elapsed, incomingRequest },
    { requestRecording, acceptRecording, rejectRecording, stopRecording, handleRecordingSignal, cleanup },
  ];
}
