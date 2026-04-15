/**
 * CallOverlay — Sprach- und Video-Anruf UI
 *
 * Nutzt eine SEPARATE WebRTC PeerConnection (nicht den Chat-DataChannel)
 * mit MediaStream (getUserMedia) für Audio/Video.
 * Signaling läuft über den bestehenden Chat-DataChannel als JSON-Nachrichten.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, CameraOff, Wifi, Radio, UserPlus, Circle, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { ImageWithFallback } from '@/app/components/ImageWithFallback';
import type { ConnectionMode } from '@/app/lib/call-manager';
import type { CallRecordingState, CallRecordingActions } from '@/app/hooks/useCallRecording';

export type CallState = 'idle' | 'ringing' | 'incoming' | 'connecting' | 'active';
export type CallType = 'audio' | 'video';

interface CallOverlayProps {
  callState: CallState;
  callType: CallType;
  contactName: string;
  contactAvatar: string;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  cameraUnavailable?: boolean;
  /** Aktueller Verbindungsmodus: P2P, SFU oder TURN */
  connectionMode?: ConnectionMode;
  /** Teilnehmer zum Anruf hinzufügen (1:1 → Gruppen-Call via Space) */
  onAddParticipant?: () => void;
  /** Aufnahme-State und Actions */
  recording?: CallRecordingState;
  recordingActions?: CallRecordingActions;
}

// ── Control-Button ──────────────────────────────────────────────────────────

interface ControlButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  label: string;
}

function ControlButton({ icon, onClick, active, danger, label }: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`p-4 rounded-full transition-colors ${
        danger
          ? 'bg-red-600 text-white shadow-lg shadow-red-900/40 hover:bg-red-500'
          : active
          ? 'bg-red-600/80 text-white'
          : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700'
      }`}
    >
      {icon}
    </button>
  );
}

// ── CallControls ────────────────────────────────────────────────────────────
// Erweiterbar: später kommen Desktop teilen, Effekte, Layout-Wechsel etc.

interface CallControlsProps {
  callType: CallType;
  callState: CallState;
  cameraUnavailable?: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
  onAddParticipant?: () => void;
  recording?: CallRecordingState;
  onRecordToggle?: () => void;
}

function CallControls({
  callType, callState, cameraUnavailable, isMuted, isCameraOff,
  onToggleMute, onToggleCamera, onHangup, onAddParticipant,
  recording, onRecordToggle,
}: CallControlsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center gap-6">
      <ControlButton
        icon={isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        onClick={onToggleMute}
        active={isMuted}
        label={isMuted ? t('call.micOn') : t('call.micOff')}
      />
      {callType === 'video' && !cameraUnavailable && (
        <ControlButton
          icon={isCameraOff ? <VideoOff size={24} /> : <Video size={24} />}
          onClick={onToggleCamera}
          active={isCameraOff}
          label={isCameraOff ? t('call.cameraOn') : t('call.cameraOff')}
        />
      )}
      {callState === 'active' && onAddParticipant && (
        <ControlButton
          icon={<UserPlus size={24} />}
          onClick={onAddParticipant}
          label={t('call.addParticipant')}
        />
      )}
      {onRecordToggle && (
        <ControlButton
          icon={recording?.isRecording ? <Square size={24} /> : <Circle size={24} />}
          onClick={onRecordToggle}
          active={recording?.isRecording || recording?.consent === 'requesting'}
          label={recording?.isRecording ? t('call.recordStop') : t('call.recordStart')}
        />
      )}
      <ControlButton
        icon={<PhoneOff size={24} />}
        onClick={onHangup}
        danger
        label={t('call.hangup')}
      />
    </div>
  );
}

// ── Haupt-Overlay ───────────────────────────────────────────────────────────

// ── Verbindungsmodus-Indikator ─────────────────────────────────────────────

function ConnectionModeIndicator({ mode, t }: { mode?: ConnectionMode; t: (key: string) => string }) {
  if (!mode) return null;
  const config = {
    p2p: { icon: <Wifi size={12} />, label: t('call.modeP2P'), color: 'text-green-400' },
    sfu: { icon: <Radio size={12} />, label: t('call.modeSFU'), color: 'text-blue-400' },
    turn: { icon: <Wifi size={12} />, label: t('call.modeTURN'), color: 'text-yellow-400' },
  }[mode];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color} bg-black/30 px-2 py-0.5 rounded-full backdrop-blur-sm`}>
      {config.icon} {config.label}
    </span>
  );
}

// ── Aufnahme-Einwilligungsdialog ───────────────────────────────────────────

function RecordConsentDialog({
  contactName, onAccept, onReject,
}: { contactName: string; onAccept: () => void; onReject: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mx-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-500/10 rounded-full">
            <Circle size={24} className="text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-white">{t('call.recordConsentTitle')}</h3>
        </div>
        <p className="text-sm text-gray-300 mb-6">
          {t('call.recordConsentMessage', { name: contactName })}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            {t('call.recordConsentReject')}
          </button>
          <button
            onClick={onAccept}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-colors text-sm font-medium"
          >
            {t('call.recordConsentAccept')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Aufnahme-Indikator ─────────────────────────────────────────────────────

function RecordingIndicator({ elapsed }: { elapsed: number }) {
  const { t } = useTranslation();
  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="inline-flex items-center gap-2 bg-red-600/90 px-3 py-1 rounded-full backdrop-blur-sm"
    >
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
      <span className="text-xs text-white font-medium">{t('call.recording')} {formatTime(elapsed)}</span>
    </motion.div>
  );
}

export default function CallOverlay({
  callState, callType, contactName, contactAvatar,
  onAccept, onReject, onHangup, localStream, remoteStream,
  cameraUnavailable, connectionMode, onAddParticipant,
  recording, recordingActions,
}: CallOverlayProps) {
  const { t } = useTranslation();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Auto-Hide Controls (nur bei aktivem Video-Anruf) ─────────────────────
  const resetHideTimer = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    if (callState === 'active' && callType === 'video') {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [callState, callType]);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [resetHideTimer]);

  const handleScreenTap = useCallback(() => {
    if (callState !== 'active' || callType !== 'video') return;
    resetHideTimer();
  }, [callState, callType, resetHideTimer]);

  // Timer für aktiven Anruf
  useEffect(() => {
    if (callState !== 'active') { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  // Streams an Video-Elemente binden
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState, callType]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState, callType]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audio = localStream.getAudioTracks()[0];
    if (audio) { audio.enabled = !audio.enabled; setIsMuted(!audio.enabled); }
  }, [localStream]);

  const toggleCamera = useCallback(() => {
    if (!localStream) return;
    const video = localStream.getVideoTracks()[0];
    if (video) { video.enabled = !video.enabled; setIsCameraOff(!video.enabled); }
  }, [localStream]);

  const handleRecordToggle = useCallback(() => {
    if (!recordingActions) return;
    if (recording?.isRecording) {
      recordingActions.stopRecording();
    } else if (recording?.consent === 'idle' || recording?.consent === 'rejected') {
      recordingActions.requestRecording();
    }
  }, [recording, recordingActions]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (callState === 'idle') return null;

  const hasLocalVideo = !cameraUnavailable && (localStream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled) ?? false);
  const hasRemoteVideo = remoteStream?.getVideoTracks().some(t => t.readyState === 'live') ?? false;
  const isVideoCallActive = callType === 'video' && callState === 'active';
  const showControls = controlsVisible || !isVideoCallActive;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-gray-950 flex flex-col"
      onClick={handleScreenTap}
    >
      {/* ── Video-Anruf aktiv ──────────────────────────────────────────────── */}
      {isVideoCallActive ? (
        <>
          {/* Remote: Video oder Avatar-Fallback */}
          {hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-950">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-700 shadow-2xl">
                <ImageWithFallback src={contactAvatar} alt={contactName} className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-bold text-white">{contactName}</h2>
              <p className="text-gray-400 text-sm">{formatTime(elapsed)}</p>
              <audio ref={remoteVideoRef as any} autoPlay className="hidden" />
            </div>
          )}

          {/* Timer-Overlay oben */}
          <AnimatePresence>
            {showControls && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-0 inset-x-0 z-20 pt-12 pb-4 flex justify-center gap-2 bg-gradient-to-b from-gray-950/70 to-transparent"
              >
                <span className="text-white/80 text-sm font-medium bg-black/30 px-4 py-1 rounded-full backdrop-blur-sm">
                  {formatTime(elapsed)}
                </span>
                <ConnectionModeIndicator mode={connectionMode} t={t} />
                {recording?.isRecording && <RecordingIndicator elapsed={recording.elapsed} />}
                {recording?.consent === 'requesting' && (
                  <span className="text-xs text-yellow-400 bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">
                    {t('call.recordConsentWaiting')}
                  </span>
                )}
                {recording?.consent === 'rejected' && (
                  <span className="text-xs text-red-400 bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">
                    {t('call.recordConsentRejected')}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Aufnahme-Einwilligungsdialog */}
          <AnimatePresence>
            {recording?.incomingRequest && recordingActions && (
              <RecordConsentDialog
                contactName={contactName}
                onAccept={recordingActions.acceptRecording}
                onReject={recordingActions.rejectRecording}
              />
            )}
          </AnimatePresence>

          {/* Lokal: PiP Video — frei verschiebbar, Startposition unten links */}
          <motion.div
            drag
            dragConstraints={containerRef}
            dragElastic={0.05}
            dragMomentum={false}
            initial={{ x: 16, y: typeof window !== 'undefined' ? window.innerHeight - 200 : 500 }}
            className="absolute top-0 left-0 w-28 h-40 rounded-2xl border-2 border-white/20 shadow-2xl z-10 cursor-grab active:cursor-grabbing overflow-hidden"
            style={{ touchAction: 'none' }}
          >
            {hasLocalVideo && !isCameraOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover pointer-events-none"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center gap-2">
                <CameraOff size={20} className="text-gray-500" />
                <span className="text-[10px] text-gray-500 text-center px-1">
                  {cameraUnavailable ? t('call.noCamera') : t('call.cameraOff')}
                </span>
              </div>
            )}
          </motion.div>

          {/* Kamera-Hinweis */}
          <AnimatePresence>
            {cameraUnavailable && showControls && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-14 left-4 right-4 z-20 bg-yellow-900/80 border border-yellow-700 rounded-xl px-3 py-2 flex items-center gap-2"
              >
                <CameraOff size={14} className="text-yellow-400 shrink-0" />
                <span className="text-xs text-yellow-200">{t('call.cameraUnavailable')}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        /* ── Audio-Anruf oder Wartezustand ──────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-gray-700 shadow-2xl">
            <ImageWithFallback src={contactAvatar} alt={contactName} className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl font-bold text-white">{contactName}</h2>
          <p className="text-gray-400 text-sm">
            {callState === 'ringing' && t('call.ringing')}
            {callState === 'incoming' && (callType === 'video' ? t('call.incomingVideo') : t('call.incomingAudio'))}
            {callState === 'connecting' && t('call.connecting')}
            {callState === 'active' && formatTime(elapsed)}
          </p>
          {callState === 'active' && <ConnectionModeIndicator mode={connectionMode} t={t} />}
          {callState === 'active' && recording?.isRecording && <RecordingIndicator elapsed={recording.elapsed} />}
          {callState === 'active' && recording?.consent === 'requesting' && (
            <span className="text-xs text-yellow-400">{t('call.recordConsentWaiting')}</span>
          )}
          {callState === 'active' && recording?.consent === 'rejected' && (
            <span className="text-xs text-red-400">{t('call.recordConsentRejected')}</span>
          )}
          {callType === 'audio' && callState === 'active' && <audio ref={remoteVideoRef as any} autoPlay />}

          {/* Aufnahme-Einwilligungsdialog (Audio) */}
          <AnimatePresence>
            {recording?.incomingRequest && recordingActions && (
              <RecordConsentDialog
                contactName={contactName}
                onAccept={recordingActions.acceptRecording}
                onReject={recordingActions.rejectRecording}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2 }}
            className="relative z-20 pb-12 pt-6 px-6 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            {callState === 'incoming' ? (
              <div className="flex justify-center gap-16">
                <ControlButton
                  icon={<PhoneOff size={28} />}
                  onClick={onReject}
                  danger
                  label={t('call.reject')}
                />
                <button
                  onClick={onAccept}
                  className="p-5 rounded-full bg-green-600 text-white shadow-lg shadow-green-900/40 hover:bg-green-500 transition-colors"
                  aria-label={t('call.accept')}
                >
                  <Phone size={28} />
                </button>
              </div>
            ) : (
              <CallControls
                callType={callType}
                callState={callState}
                cameraUnavailable={cameraUnavailable}
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                onToggleMute={toggleMute}
                onToggleCamera={toggleCamera}
                onHangup={onHangup}
                onAddParticipant={onAddParticipant}
                recording={recording}
                onRecordToggle={callState === 'active' && recordingActions ? handleRecordToggle : undefined}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
