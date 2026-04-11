/**
 * Call-Manager — P2P + Media Orchestrierung, SDP, ICE, State-Machine
 *
 * Orchestriert P2PManager (Signaling ueber verschluesselten DataChannel)
 * und MediaStreamManager (lokaler Audio/Video-Stream).
 *
 * Erstellt einen SEPARATEN RTCPeerConnection fuer Media —
 * der DataChannel-PC vom P2PManager wird NICHT wiederverwendet.
 *
 * ICE Candidates laufen ueber den verschluesselten DataChannel,
 * NICHT ueber den Signaling-Server.
 *
 * State-Machine: idle → ringing → connecting → active → ended
 * 30s Klingel-Timeout: kein Abnehmen → ended + hangup senden.
 *
 * Nutzung:
 *   const cm = new CallManager();
 *   cm.onStateChange((state, type) => { ... });
 *   cm.onStreamsChange((local, remote, cameraUnavailable) => { ... });
 *   await cm.startCall('video', sendFn);
 *   cm.handleSignal(signal);      // eingehende Signale vom P2PManager
 *   await cm.acceptCall();
 *   cm.hangup();
 *   cm.destroy();
 */

import { MediaStreamManager, type MediaKind } from '@/app/lib/media-stream-manager';
import { buildIceServers, type CallSignal } from '@/app/lib/p2p-manager';

// ── Typen ───────────────────────────────────────────────────────────────────

export type CallState = 'idle' | 'ringing' | 'incoming' | 'connecting' | 'active' | 'ended';
export type CallType = 'audio' | 'video';

type SendSignalFn = (signal: CallSignal) => Promise<boolean>;
type StateChangeCb = (state: CallState, callType: CallType) => void;
type StreamsChangeCb = (
  localStream: MediaStream | null,
  remoteStream: MediaStream | null,
  cameraUnavailable: boolean,
) => void;

// ── Konstanten ──────────────────────────────────────────────────────────────

const RING_TIMEOUT_MS = 30_000;

// ── Manager ─────────────────────────────────────────────────────────────────

export class CallManager {
  private state: CallState = 'idle';
  private type: CallType = 'audio';
  private pc: RTCPeerConnection | null = null;
  private media = new MediaStreamManager();
  private remoteStream: MediaStream | null = null;
  private cameraUnavailable = false;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private sendSignal: SendSignalFn | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  private stateChangeCb: StateChangeCb | null = null;
  private streamsChangeCb: StreamsChangeCb | null = null;

  // ── Callbacks registrieren ──────────────────────────────────────────────

  onStateChange(cb: StateChangeCb) { this.stateChangeCb = cb; }
  onStreamsChange(cb: StreamsChangeCb) { this.streamsChangeCb = cb; }

  // ── Getter ──────────────────────────────────────────────────────────────

  getState(): CallState { return this.state; }
  getCallType(): CallType { return this.type; }
  getLocalStream(): MediaStream | null { return this.media.getStream(); }
  getRemoteStream(): MediaStream | null { return this.remoteStream; }
  isCameraUnavailable(): boolean { return this.cameraUnavailable; }

  // ── State-Machine ─────────────────────────────────────────────────────

  private setState(s: CallState) {
    if (this.state === s) return;
    console.log(`[CallManager] ${this.state} → ${s}`);
    this.state = s;
    this.stateChangeCb?.(s, this.type);
    this.emitStreams();
  }

  private emitStreams() {
    this.streamsChangeCb?.(
      this.media.getStream(),
      this.remoteStream,
      this.cameraUnavailable,
    );
  }

  // ── Ausgehender Anruf ─────────────────────────────────────────────────

  /**
   * Anruf starten (Caller-Seite).
   * @param type  'audio' oder 'video'
   * @param send  Funktion zum Senden von CallSignal ueber DataChannel
   */
  async startCall(type: CallType, send: SendSignalFn): Promise<void> {
    if (this.state !== 'idle') {
      console.warn('[CallManager] startCall ignoriert — State:', this.state);
      return;
    }

    this.sendSignal = send;
    this.type = type;
    this.cameraUnavailable = false;
    this.setState('ringing');

    try {
      // 1. Media anfordern
      const { stream, cameraUnavailable } = await this.media.acquire(type);
      this.cameraUnavailable = cameraUnavailable;

      // 2. RTCPeerConnection erstellen (separater PC fuer Media)
      const iceServers = await buildIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;
      this.setupPcCallbacks(pc);

      // 3. Lokale Tracks hinzufuegen
      stream.getTracks().forEach((t) => {
        pc.addTrack(t, stream);
        console.log('[CallManager] addTrack (Caller):', t.kind, t.label);
      });

      // 4. SDP Offer erstellen und senden
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[CallManager] Offer erstellt — SDP:', offer.sdp?.length, 'chars');
      await send({ _t: 'call', action: 'offer', callType: type, sdp: offer.sdp });

      // 5. Ring-Timeout starten
      this.startRingTimeout();

      this.emitStreams();
    } catch (err) {
      console.error('[CallManager] startCall FEHLER:', err);
      this.cleanup();
    }
  }

  // ── Eingehender Anruf ─────────────────────────────────────────────────

  /**
   * Eingehende Call-Signale verarbeiten.
   * Wird vom P2PManager-Callback aufgerufen.
   * @param signal   Das empfangene CallSignal
   * @param send     Funktion zum Senden (muss bei erstem Signal gesetzt sein)
   */
  async handleSignal(signal: CallSignal, send?: SendSignalFn): Promise<void> {
    if (send) this.sendSignal = send;

    console.log('[CallManager] Signal empfangen:', signal.action, 'callType:', signal.callType, 'state:', this.state);

    switch (signal.action) {
      case 'offer':
        await this.handleOffer(signal);
        break;
      case 'answer':
        await this.handleAnswer(signal);
        break;
      case 'ice':
        await this.handleIce(signal);
        break;
      case 'hangup':
        this.handleHangup();
        break;
    }
  }

  private async handleOffer(signal: CallSignal): Promise<void> {
    if (this.state !== 'idle') {
      console.warn('[CallManager] Offer ignoriert — bereits im State:', this.state);
      // Busy → automatisch hangup senden
      this.sendSignal?.({ _t: 'call', action: 'hangup', callType: signal.callType });
      return;
    }

    this.type = signal.callType;
    this.setState('incoming');
    this.pendingIceCandidates = [];

    try {
      // PC erstellen und Offer setzen — Media erst bei acceptCall()
      const iceServers = await buildIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;
      this.setupPcCallbacks(pc);
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp! });
      console.log('[CallManager] Offer gesetzt — signalingState:', pc.signalingState);

      // Gepufferte ICE-Kandidaten anwenden
      for (const candidate of this.pendingIceCandidates) {
        try { await pc.addIceCandidate(candidate); } catch { /* ok */ }
      }
      this.pendingIceCandidates = [];

      // 30s Timeout: wenn nicht angenommen → beenden
      this.startRingTimeout();
    } catch (err) {
      console.error('[CallManager] Offer verarbeiten FEHLER:', err);
      this.cleanup();
    }
  }

  /**
   * Eingehenden Anruf annehmen (Callee-Seite).
   * Fordert Media an, erstellt SDP Answer.
   */
  async acceptCall(): Promise<void> {
    if (this.state !== 'incoming' || !this.pc) {
      console.warn('[CallManager] acceptCall ignoriert — State:', this.state, 'PC:', !!this.pc);
      return;
    }

    this.clearRingTimeout();
    this.setState('connecting');
    this.cameraUnavailable = false;

    try {
      // 1. Media anfordern
      const { stream, cameraUnavailable } = await this.media.acquire(this.type);
      this.cameraUnavailable = cameraUnavailable;

      // 2. Lokale Tracks dem PC hinzufuegen
      stream.getTracks().forEach((t) => {
        this.pc!.addTrack(t, stream);
        console.log('[CallManager] addTrack (Callee):', t.kind, t.label);
      });

      // 3. SDP Answer erstellen und senden
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      console.log('[CallManager] Answer erstellt — SDP:', answer.sdp?.length, 'chars');
      await this.sendSignal?.({ _t: 'call', action: 'answer', callType: this.type, sdp: answer.sdp });

      this.setState('active');
      this.emitStreams();
    } catch (err) {
      console.error('[CallManager] acceptCall FEHLER:', err);
      this.cleanup();
    }
  }

  private async handleAnswer(signal: CallSignal): Promise<void> {
    if (!this.pc || this.state !== 'ringing') {
      console.warn('[CallManager] Answer ignoriert — State:', this.state);
      return;
    }

    this.clearRingTimeout();

    try {
      console.log('[CallManager] Answer empfangen — SDP:', signal.sdp?.length, 'chars');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp! });
      this.setState('active');
    } catch (err) {
      console.error('[CallManager] Answer verarbeiten FEHLER:', err);
    }
  }

  private async handleIce(signal: CallSignal): Promise<void> {
    if (!signal.candidate) return;

    // Wenn PC noch nicht existiert (ICE vor Offer) → puffern
    if (!this.pc) {
      this.pendingIceCandidates.push(signal.candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(signal.candidate);
    } catch (err) {
      console.warn('[CallManager] ICE Candidate Fehler:', err);
    }
  }

  private handleHangup(): void {
    console.log('[CallManager] Hangup empfangen');
    this.cleanup();
  }

  // ── Auflegen ──────────────────────────────────────────────────────────

  /** Anruf beenden (von lokaler Seite). Sendet hangup-Signal. */
  hangup(): void {
    if (this.state === 'idle' || this.state === 'ended') return;
    console.log('[CallManager] hangup — sende Signal');
    this.sendSignal?.({ _t: 'call', action: 'hangup', callType: this.type });
    this.cleanup();
  }

  /** Eingehenden Anruf ablehnen. Sendet hangup-Signal. */
  reject(): void {
    if (this.state !== 'incoming') return;
    console.log('[CallManager] reject');
    this.sendSignal?.({ _t: 'call', action: 'hangup', callType: this.type });
    this.cleanup();
  }

  // ── Media-Controls (Proxy zum MediaStreamManager) ─────────────────────

  toggleMic(): boolean { return this.media.toggleMic(); }
  toggleCamera(): boolean { return this.media.toggleCamera(); }
  isMicEnabled(): boolean { return this.media.isMicEnabled(); }
  isCameraEnabled(): boolean { return this.media.isCameraEnabled(); }

  /** Kamera wechseln (Front ↔ Back) und Track auf PC ersetzen. */
  async switchCamera(): Promise<void> {
    const newTrack = await this.media.switchCamera();
    if (!newTrack || !this.pc) return;

    // Track auf dem RTCPeerConnection ersetzen (kein Renegotiation noetig)
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) {
      await sender.replaceTrack(newTrack);
      console.log('[CallManager] Kamera-Track ersetzt:', newTrack.label);
    }
    this.emitStreams();
  }

  // ── Ring-Timeout ──────────────────────────────────────────────────────

  private startRingTimeout(): void {
    this.clearRingTimeout();
    this.ringTimer = setTimeout(() => {
      if (this.state === 'ringing' || this.state === 'incoming') {
        console.log('[CallManager] Ring-Timeout (30s) — Anruf beenden');
        this.sendSignal?.({ _t: 'call', action: 'hangup', callType: this.type });
        this.cleanup();
      }
    }, RING_TIMEOUT_MS);
  }

  private clearRingTimeout(): void {
    if (this.ringTimer) {
      clearTimeout(this.ringTimer);
      this.ringTimer = null;
    }
  }

  // ── RTCPeerConnection Callbacks ───────────────────────────────────────

  private setupPcCallbacks(pc: RTCPeerConnection): void {
    // Remote-Tracks empfangen
    this.remoteStream = new MediaStream();
    pc.ontrack = ({ track }) => {
      console.log('[CallManager] ontrack — Remote:', track.kind, 'enabled:', track.enabled);
      this.remoteStream!.addTrack(track);
      // Neuen Stream erzeugen damit React re-rendert
      this.remoteStream = new MediaStream(this.remoteStream!.getTracks());
      this.emitStreams();
    };

    // ICE Candidates ueber DataChannel senden
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('[CallManager] ICE Candidate senden:', candidate.type, candidate.protocol);
        this.sendSignal?.({
          _t: 'call',
          action: 'ice',
          callType: this.type,
          candidate: candidate.toJSON(),
        });
      }
    };

    // Verbindungsstatus ueberwachen
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log('[CallManager] PC connectionState:', s);
      if (s === 'connected' && this.state === 'connecting') {
        this.setState('active');
      }
      if (s === 'disconnected' || s === 'failed') {
        this.cleanup();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallManager] PC iceConnectionState:', pc.iceConnectionState);
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /** Alles aufraeumen: Tracks stoppen, PC schliessen, State → ended → idle. */
  private cleanup(): void {
    this.clearRingTimeout();
    this.media.cleanup();
    this.pc?.close();
    this.pc = null;
    this.remoteStream = null;
    this.cameraUnavailable = false;
    this.pendingIceCandidates = [];
    this.setState('ended');
    // Sofort zurueck auf idle damit neuer Anruf moeglich
    this.setState('idle');
  }

  /** Manager komplett zerstoeren (bei Unmount). */
  destroy(): void {
    this.cleanup();
    this.sendSignal = null;
    this.stateChangeCb = null;
    this.streamsChangeCb = null;
  }
}

// ── LiveKit SFU Fallback Utilities ──────────────────────────────────────────

export type ConnectionMode = 'p2p' | 'sfu' | 'turn';

export interface NodeInfo {
  id: string;
  url: string;
  name?: string;
  registeredAt: string;
}

const SIGNALING_HTTP_URL =
  (import.meta as any).env?.VITE_SIGNALING_HTTP_URL ??
  `${window.location.protocol}//${window.location.host}/api-signal`;

/**
 * Liest die konfigurierte LiveKit-Node-URL aus localStorage.
 * Kann von SettingsScreen gesetzt werden.
 */
export function getLiveKitNodeUrl(): string | null {
  return localStorage.getItem('aregoland_livekit_node_url');
}

export function setLiveKitNodeUrl(url: string | null): void {
  if (url) {
    localStorage.setItem('aregoland_livekit_node_url', url);
  } else {
    localStorage.removeItem('aregoland_livekit_node_url');
  }
}

/**
 * Verfuegbare Nodes vom Signaling-Server abrufen.
 */
export async function fetchAvailableNodes(): Promise<NodeInfo[]> {
  try {
    const res = await fetch(`${SIGNALING_HTTP_URL}/nodes`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Bestimmt den Verbindungsmodus basierend auf P2P-Status und Konfiguration.
 */
export function determineConnectionMode(
  p2pConnected: boolean,
  p2pTimedOut: boolean,
): ConnectionMode {
  if (p2pConnected) return 'p2p';
  const nodeUrl = getLiveKitNodeUrl();
  if (p2pTimedOut && nodeUrl) return 'sfu';
  if (p2pTimedOut) return 'turn';
  return 'p2p';
}

/** P2P-Timeout in Millisekunden */
export const P2P_TIMEOUT_MS = 10_000;

/**
 * Erzeugt einen E2EE-Schluessel fuer LiveKit aus dem bestehenden ECDH-SessionKey.
 */
export async function deriveE2EEKey(sessionKey: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', sessionKey);
  return new Uint8Array(raw);
}

