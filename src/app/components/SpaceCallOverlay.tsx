/**
 * SpaceCallOverlay — Multi-Party Space-Call UI mit Screen Sharing
 *
 * Grid-View (bis 4 Teilnehmer) / Speaker-View (5+)
 * Teilnehmer-Liste mit Name/Avatar
 * Moderator-Controls (Mute/Kick)
 * Aktiver-Sprecher-Highlight (Audio-Level Detection)
 * Join/Leave Animationen
 * Screen Sharing: FSK >= 16 Gate, prominente Anzeige, Auto-Stop bei Tab-Wechsel
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Phone, PhoneOff, Video, VideoOff, Mic, MicOff,
  CameraOff, Users, Crown, X, Volume2, Wifi, Radio,
  RotateCcw, Monitor, MonitorOff, UserPlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { loadFsk } from '@/app/auth/fsk';
import { SpaceCallManager } from '@/app/lib/space-call-manager';
import type {
  SpaceCallState, SpaceCallMode, SpaceCallParticipant, CallMediaType,
} from '@/app/lib/space-call-manager';

// ── Props ───────────────────────────────────────────────────────────────────

interface SpaceCallOverlayProps {
  callState: SpaceCallState;
  callMode: SpaceCallMode;
  mediaType: CallMediaType;
  spaceName: string;
  participants: SpaceCallParticipant[];
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  moderatorId: string | null;
  myAregoId: string;
  isScreenSharing: boolean;
  /** Callback: Teilnehmer-Anzeigename ermitteln */
  getDisplayName: (aregoId: string) => string;
  onLeave: () => void;
  onToggleMic: () => boolean;
  onToggleCamera: () => boolean;
  onSwitchCamera: () => void;
  onToggleScreenShare: () => void;
  onMuteRemote: (targetId: string) => void;
  onKick: (targetId: string) => void;
  /** Teilnehmer zum Space-Call hinzufügen */
  onAddParticipant?: () => void;
}

// ── Audio-Level Detection ───────────────────────────────────────────────────

function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      ctxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(avg / 255);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // AudioContext nicht verfuegbar
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close();
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [stream]);

  return level;
}

// ── Participant Tile ────────────────────────────────────────────────────────

interface ParticipantTileProps {
  participant: SpaceCallParticipant;
  displayName: string;
  isModerator: boolean;
  isActiveSpeaker: boolean;
  isSpeakerView: boolean;
  isPrimarySpeaker: boolean;
  showModControls: boolean;
  onMute: () => void;
  onKick: () => void;
}

function ParticipantTile({
  participant, displayName, isModerator, isActiveSpeaker,
  isSpeakerView, isPrimarySpeaker, showModControls, onMute, onKick,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = participant.stream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled) ?? false;

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.3 }}
      className={`relative rounded-2xl overflow-hidden ${
        isPrimarySpeaker && isSpeakerView ? 'col-span-2 row-span-2' : ''
      } ${isActiveSpeaker ? 'ring-2 ring-green-400' : 'ring-1 ring-gray-700'} bg-gray-900`}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-900">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ${
            isActiveSpeaker ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}>
            {initials}
          </div>
          {/* Audio element fuer Ton */}
          {participant.stream && (
            <audio ref={videoRef as any} autoPlay className="hidden" />
          )}
        </div>
      )}

      {/* Name + Moderator Badge */}
      <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
        {isModerator && <Crown size={12} className="text-yellow-400 shrink-0" />}
        <span className="text-xs text-white font-medium truncate">{displayName}</span>
        {isActiveSpeaker && (
          <Volume2 size={12} className="text-green-400 shrink-0 animate-pulse" />
        )}
      </div>

      {/* Moderator-Controls */}
      {showModControls && (
        <div className="absolute top-2 right-2 flex gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onMute(); }}
            className="p-1.5 rounded-full bg-black/50 text-gray-300 hover:bg-red-600/80 hover:text-white transition-colors"
            title="Mute"
          >
            <MicOff size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onKick(); }}
            className="p-1.5 rounded-full bg-black/50 text-gray-300 hover:bg-red-600/80 hover:text-white transition-colors"
            title="Kick"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Local Video PiP ─────────────────────────────────────────────────────────

function LocalPip({
  stream, isCameraOff, cameraUnavailable, containerRef,
}: {
  stream: MediaStream | null;
  isCameraOff: boolean;
  cameraUnavailable: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = !cameraUnavailable && !isCameraOff &&
    (stream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled) ?? false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <motion.div
      drag
      dragConstraints={containerRef}
      dragElastic={0.05}
      dragMomentum={false}
      initial={{ x: 16, y: typeof window !== 'undefined' ? window.innerHeight - 200 : 500 }}
      className="absolute top-0 left-0 w-24 h-32 rounded-2xl border-2 border-white/20 shadow-2xl z-10 cursor-grab active:cursor-grabbing overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover pointer-events-none"
          style={{ transform: 'scaleX(-1)' }}
        />
      ) : (
        <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center gap-1">
          <CameraOff size={16} className="text-gray-500" />
          <span className="text-[9px] text-gray-500 text-center px-1">
            {cameraUnavailable ? 'Keine Kamera' : 'Kamera aus'}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ── Mode Indicator ──────────────────────────────────────────────────────────

function ModeIndicator({ mode }: { mode: SpaceCallMode }) {
  const { t } = useTranslation();
  const config = mode === 'sfu'
    ? { icon: <Radio size={12} />, label: t('spaceCall.modeSFU'), color: 'text-blue-400' }
    : { icon: <Wifi size={12} />, label: t('spaceCall.modeMesh'), color: 'text-green-400' };

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color} bg-black/30 px-2 py-0.5 rounded-full backdrop-blur-sm`}>
      {config.icon} {config.label}
    </span>
  );
}

// ── Screen-Share Prominente Anzeige ─────────────────────────────────────────

function ScreenShareView({
  stream,
  sharerName,
}: {
  stream: MediaStream;
  sharerName: string;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative w-full flex-1 min-h-0 bg-gray-950 rounded-xl overflow-hidden border-2 border-blue-500/30">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />
      <div className="absolute top-3 left-3 bg-blue-600/80 backdrop-blur-sm rounded-lg px-3 py-1 flex items-center gap-2">
        <Monitor size={14} className="text-white" />
        <span className="text-xs text-white font-medium">
          {t('call.screenShareRemote', { name: sharerName })}
        </span>
      </div>
    </div>
  );
}

// ── Haupt-Overlay ───────────────────────────────────────────────────────────

export default function SpaceCallOverlay({
  callState, callMode, mediaType, spaceName,
  participants, localStream, localScreenStream, moderatorId, myAregoId, isScreenSharing,
  getDisplayName, onLeave, onToggleMic, onToggleCamera,
  onSwitchCamera, onToggleScreenShare, onMuteRemote, onKick,
  onAddParticipant,
}: SpaceCallOverlayProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const isMod = myAregoId === moderatorId;
  const isVideoCall = mediaType === 'video';
  const totalParticipants = participants.length + 1; // +1 fuer mich

  // FSK >= 16 Gate fuer Screen Sharing
  const fsk = loadFsk();
  const canScreenShare = (fsk?.level ?? 0) >= 16;
  const screenShareSupported = SpaceCallManager.isScreenShareSupported();

  // Aktiver Screen-Share finden (lokal oder remote)
  const activeScreenShare = useMemo(() => {
    if (isScreenSharing && localScreenStream) {
      return { stream: localScreenStream, sharerName: t('call.screenShareActive'), isLocal: true };
    }
    for (const p of participants) {
      if (p.screenStream) {
        return { stream: p.screenStream, sharerName: getDisplayName(p.aregoId), isLocal: false };
      }
    }
    return null;
  }, [isScreenSharing, localScreenStream, participants, getDisplayName, t]);
  const useSpeakerView = totalParticipants > 4;

  // ── Audio-Level Detection fuer aktiven Sprecher ─────────────────────────
  const speakerLevels = useMemo(() => {
    const map = new Map<string, number>();
    // Fuer Remote-Teilnehmer: AudioContext-basiert waere optimal,
    // aber wir verwenden hier einen vereinfachten Ansatz:
    // der erste Teilnehmer mit aktivem Audio-Track gilt als Sprecher
    for (const p of participants) {
      const hasAudio = p.stream?.getAudioTracks().some(t => t.readyState === 'live' && t.enabled) ?? false;
      map.set(p.aregoId, hasAudio ? 0.5 : 0); // Vereinfacht
    }
    return map;
  }, [participants]);

  // Aktivster Sprecher ermitteln (vereinfacht: erster mit Audio)
  const activeSpeakerId = useMemo(() => {
    for (const p of participants) {
      const hasAudio = p.stream?.getAudioTracks().some(t => t.readyState === 'live' && t.enabled) ?? false;
      if (hasAudio) return p.aregoId;
    }
    return null;
  }, [participants]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (callState !== 'active') { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  // ── Auto-Hide Controls ────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    if (callState === 'active' && isVideoCall) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }
  }, [callState, isVideoCall]);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [resetHideTimer]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleToggleMic = useCallback(() => {
    const enabled = onToggleMic();
    setIsMuted(!enabled);
  }, [onToggleMic]);

  const handleToggleCamera = useCallback(() => {
    const enabled = onToggleCamera();
    setIsCameraOff(!enabled);
  }, [onToggleCamera]);

  if (callState === 'idle') return null;

  const showControls = controlsVisible || !isVideoCall || callState !== 'active';
  const cameraUnavailable = isVideoCall && !localStream?.getVideoTracks().some(t => t.readyState === 'live');

  // ── Joining State ─────────────────────────────────────────────────────────
  if (callState === 'joining') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-gray-950 flex flex-col items-center justify-center gap-6"
      >
        <div className="w-20 h-20 rounded-full bg-blue-600/20 flex items-center justify-center">
          <Phone size={32} className="text-blue-400 animate-pulse" />
        </div>
        <h2 className="text-xl font-bold text-white">{spaceName}</h2>
        <p className="text-gray-400 text-sm">{t('spaceCall.joining')}</p>
        <button
          onClick={onLeave}
          className="mt-4 px-6 py-2.5 bg-red-600 text-white rounded-full text-sm font-medium hover:bg-red-500 transition-colors"
        >
          {t('spaceCall.cancel')}
        </button>
      </motion.div>
    );
  }

  // ── Leaving State ─────────────────────────────────────────────────────────
  if (callState === 'leaving') {
    return (
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-[100] bg-gray-950 flex items-center justify-center"
      >
        <p className="text-gray-400 text-sm">{t('spaceCall.leaving')}</p>
      </motion.div>
    );
  }

  // ── Active Call ───────────────────────────────────────────────────────────
  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-gray-950 flex flex-col"
      onClick={resetHideTimer}
    >
      {/* Header */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 inset-x-0 z-20 pt-12 pb-4 px-4 bg-gradient-to-b from-gray-950/80 to-transparent flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm truncate max-w-[180px]">{spaceName}</span>
              <span className="text-gray-400 text-xs">
                <Users size={12} className="inline mr-1" />
                {totalParticipants}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/80 text-xs font-medium bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">
                {formatTime(elapsed)}
              </span>
              <ModeIndicator mode={callMode} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen Share: prominente Position (grosses Fenster) */}
      {activeScreenShare && (
        <div className="pt-24 px-2 flex-1 min-h-0 max-h-[60vh]">
          <ScreenShareView
            stream={activeScreenShare.stream}
            sharerName={activeScreenShare.sharerName}
          />
        </div>
      )}

      {/* Participant Grid / Speaker View */}
      <div className={`${activeScreenShare ? 'h-28 shrink-0 px-2 pb-28' : 'flex-1 pt-24 pb-28 px-2'} ${
        activeScreenShare
          ? 'flex gap-2 overflow-x-auto'
          : useSpeakerView
          ? 'grid grid-cols-3 grid-rows-[2fr_1fr] gap-2'
          : `grid gap-2 ${
              totalParticipants <= 2 ? 'grid-cols-1' :
              totalParticipants <= 4 ? 'grid-cols-2' : 'grid-cols-2'
            }`
      }`}>
        <AnimatePresence mode="popLayout">
          {participants.map(p => (
            <ParticipantTile
              key={p.aregoId}
              participant={p}
              displayName={getDisplayName(p.aregoId)}
              isModerator={p.aregoId === moderatorId}
              isActiveSpeaker={p.aregoId === activeSpeakerId}
              isSpeakerView={!activeScreenShare && useSpeakerView}
              isPrimarySpeaker={!activeScreenShare && useSpeakerView && p.aregoId === activeSpeakerId}
              showModControls={isMod && p.aregoId !== myAregoId}
              onMute={() => onMuteRemote(p.aregoId)}
              onKick={() => onKick(p.aregoId)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Local PiP (Video-Call) */}
      {isVideoCall && callState === 'active' && (
        <LocalPip
          stream={localStream}
          isCameraOff={isCameraOff}
          cameraUnavailable={!!cameraUnavailable}
          containerRef={containerRef}
        />
      )}

      {/* Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 inset-x-0 z-20 pb-10 pt-6 px-6 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center gap-5">
              {/* Mic */}
              <button
                onClick={handleToggleMic}
                className={`p-4 rounded-full transition-colors ${
                  isMuted ? 'bg-red-600/80 text-white' : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700'
                }`}
                aria-label={isMuted ? t('call.micOn') : t('call.micOff')}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>

              {/* Camera (nur bei Video-Call) */}
              {isVideoCall && !cameraUnavailable && (
                <button
                  onClick={handleToggleCamera}
                  className={`p-4 rounded-full transition-colors ${
                    isCameraOff ? 'bg-red-600/80 text-white' : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700'
                  }`}
                  aria-label={isCameraOff ? t('call.cameraOn') : t('call.cameraOff')}
                >
                  {isCameraOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>
              )}

              {/* Kamera wechseln (nur bei Video-Call) */}
              {isVideoCall && !cameraUnavailable && (
                <button
                  onClick={onSwitchCamera}
                  className="p-4 rounded-full bg-gray-800/90 text-gray-300 hover:bg-gray-700 transition-colors"
                  aria-label={t('spaceCall.switchCamera')}
                >
                  <RotateCcw size={24} />
                </button>
              )}

              {/* Screen Share — FSK >= 16 Gate + Browser-Detection */}
              <button
                onClick={onToggleScreenShare}
                disabled={!screenShareSupported || !canScreenShare}
                className={`p-4 rounded-full transition-colors ${
                  !screenShareSupported || !canScreenShare
                    ? 'bg-gray-800/40 text-gray-600 cursor-not-allowed'
                    : isScreenSharing
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700'
                }`}
                aria-label={
                  !screenShareSupported ? t('call.screenShareNotSupported') :
                  !canScreenShare ? t('call.screenShareFskRequired') :
                  isScreenSharing ? t('call.screenShareStop') : t('call.screenShare')
                }
                title={
                  !screenShareSupported ? t('call.screenShareNotSupported') :
                  !canScreenShare ? t('call.screenShareFskRequired') : undefined
                }
              >
                {isScreenSharing ? <MonitorOff size={24} /> : <Monitor size={24} />}
              </button>

              {/* Teilnehmer hinzufügen */}
              {onAddParticipant && (
                <button
                  onClick={onAddParticipant}
                  className="p-4 rounded-full bg-gray-800/90 text-gray-300 hover:bg-gray-700 transition-colors"
                  aria-label={t('call.addParticipant')}
                >
                  <UserPlus size={24} />
                </button>
              )}

              {/* Auflegen */}
              <button
                onClick={onLeave}
                className="p-4 rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 hover:bg-red-500 transition-colors"
                aria-label={t('call.hangup')}
              >
                <PhoneOff size={24} />
              </button>
            </div>
            {/* Hinweis wenn Screen Share nicht verfuegbar */}
            {!screenShareSupported && (
              <p className="text-center text-xs text-yellow-400 mt-2">{t('call.screenShareNotSupported')}</p>
            )}
            {screenShareSupported && !canScreenShare && (
              <p className="text-center text-xs text-yellow-400 mt-2">{t('call.screenShareFskRequired')}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
