/**
 * CallOverlay — Sprach- und Video-Anruf UI
 *
 * Nutzt eine SEPARATE WebRTC PeerConnection (nicht den Chat-DataChannel)
 * mit MediaStream (getUserMedia) für Audio/Video.
 * Signaling läuft über den bestehenden Chat-DataChannel als JSON-Nachrichten.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, CameraOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';

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
  cameraUnavailable?: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
}

function CallControls({
  callType, cameraUnavailable, isMuted, isCameraOff,
  onToggleMute, onToggleCamera, onHangup,
}: CallControlsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center gap-6">
      {/* Reihe 1: Kern-Controls */}
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
      {/* Platzhalter für zukünftige Buttons:
          - Desktop teilen (ScreenShare)
          - Effekte / Hintergrund-Blur
          - Layout wechseln (Grid/Speaker)
      */}
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

export default function CallOverlay({
  callState, callType, contactName, contactAvatar,
  onAccept, onReject, onHangup, localStream, remoteStream,
  cameraUnavailable,
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
                className="absolute top-0 inset-x-0 z-20 pt-12 pb-4 flex justify-center bg-gradient-to-b from-gray-950/70 to-transparent"
              >
                <span className="text-white/80 text-sm font-medium bg-black/30 px-4 py-1 rounded-full backdrop-blur-sm">
                  {formatTime(elapsed)}
                </span>
              </motion.div>
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
          {callType === 'audio' && callState === 'active' && <audio ref={remoteVideoRef as any} autoPlay />}
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
                cameraUnavailable={cameraUnavailable}
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                onToggleMute={toggleMute}
                onToggleCamera={toggleCamera}
                onHangup={onHangup}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
