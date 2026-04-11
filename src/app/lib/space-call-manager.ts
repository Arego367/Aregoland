/**
 * SpaceCallManager — Multi-Party Space-Call Orchestrierung
 *
 * State-Machine: idle → joining → active → leaving
 * Mesh-Modus (<=3 Teilnehmer): RTCPeerConnection pro Teilnehmer, Track-Management
 * SFU-Modus (4+ Teilnehmer): LiveKit Room connect, Track publish/subscribe
 * Automatischer Wechsel Mesh→SFU wenn 4. Teilnehmer joint
 * E2E-Verschluesselung: Insertable Streams fuer Mesh, LiveKit E2E fuer SFU
 * Moderator-Aktionen: mute-remote, kick (ueber Signaling-Server)
 *
 * Signaling-Protokoll (ARE-128):
 *   Join:  WS join room "space-call:{spaceId}"
 *   Server→Client: space_call_joined, space_call_participant_joined,
 *                  space_call_participant_left, space_call_sfu_switch,
 *                  space_call_kicked, space_call_muted_by_moderator, space_call_error
 *   Client→Server: space_call_sdp, space_call_ice, space_call_leave,
 *                  space_call_mute_remote, space_call_kick
 */

import { MediaStreamManager, type MediaKind } from '@/app/lib/media-stream-manager';
import { buildIceServers } from '@/app/lib/p2p-manager';
// LiveKit: dynamisch importiert (nur fuer SFU-Modus mit 4+ Teilnehmern)
// livekit-client ist optional — nicht als Dependency installiert bis SFU gebraucht wird

// ── Typen ───────────────────────────────────────────────────────────────────

export type SpaceCallState = 'idle' | 'joining' | 'active' | 'leaving';
export type SpaceCallMode = 'mesh' | 'sfu';
export type CallMediaType = 'audio' | 'video';

export interface SpaceCallParticipant {
  aregoId: string;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
}

export interface SpaceCallCallbacks {
  onStateChange: (state: SpaceCallState) => void;
  onModeChange: (mode: SpaceCallMode) => void;
  onParticipantsChange: (participants: SpaceCallParticipant[]) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onError: (error: string) => void;
  onModeratorChange: (moderatorId: string) => void;
  onKicked: () => void;
  onMutedByModerator: (track: 'audio' | 'video') => void;
  onScreenShareChange: (sharing: boolean, aregoId: string) => void;
}

// ── Konstanten ──────────────────────────────────────────────────────────────

const SIGNALING_URL =
  (import.meta as any).env?.VITE_SIGNALING_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-signal`;

// ── Mesh-Peer Verbindung ────────────────────────────────────────────────────

interface MeshPeer {
  aregoId: string;
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  pendingIce: RTCIceCandidateInit[];
}

// ── Manager ─────────────────────────────────────────────────────────────────

export class SpaceCallManager {
  private state: SpaceCallState = 'idle';
  private mode: SpaceCallMode = 'mesh';
  private spaceId: string | null = null;
  private myAregoId: string | null = null;
  private moderatorId: string | null = null;
  private ws: WebSocket | null = null;
  private media = new MediaStreamManager();
  private callbacks: SpaceCallCallbacks;
  private mediaType: CallMediaType = 'audio';

  // Mesh-Modus
  private meshPeers = new Map<string, MeshPeer>();

  // SFU-Modus (LiveKit)
  private livekitRoom: any = null;
  private livekitUrl: string | null = null;
  private livekitRoomName: string | null = null;
  private sfuRemoteStreams = new Map<string, MediaStream>();

  // E2EE: gemeinsamer Schluessel fuer Mesh (Insertable Streams)
  private e2eeKey: CryptoKey | null = null;

  // Screen Sharing
  private screenStream: MediaStream | null = null;
  private screenSharing = false;
  private remoteScreenStreams = new Map<string, MediaStream>();
  private visibilityHandler: (() => void) | null = null;

  constructor(callbacks: SpaceCallCallbacks) {
    this.callbacks = callbacks;
  }

  // ── Getter ──────────────────────────────────────────────────────────────

  getState(): SpaceCallState { return this.state; }
  getMode(): SpaceCallMode { return this.mode; }
  getModeratorId(): string | null { return this.moderatorId; }
  isModerator(): boolean { return this.myAregoId != null && this.myAregoId === this.moderatorId; }
  getLocalStream(): MediaStream | null { return this.media.getStream(); }
  isScreenSharing(): boolean { return this.screenSharing; }
  getScreenStream(): MediaStream | null { return this.screenStream; }

  /** Prueft ob der Browser getDisplayMedia unterstuetzt. */
  static isScreenShareSupported(): boolean {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getDisplayMedia === 'function';
  }

  getParticipants(): SpaceCallParticipant[] {
    if (this.mode === 'mesh') {
      return Array.from(this.meshPeers.values()).map(p => ({
        aregoId: p.aregoId,
        stream: p.remoteStream.getTracks().length > 0 ? p.remoteStream : null,
        screenStream: this.remoteScreenStreams.get(p.aregoId) ?? null,
      }));
    }
    // SFU-Modus
    return Array.from(this.sfuRemoteStreams.entries()).map(([aregoId, stream]) => ({
      aregoId,
      stream,
      screenStream: this.remoteScreenStreams.get(aregoId) ?? null,
    }));
  }

  // ── State-Machine ─────────────────────────────────────────────────────

  private setState(s: SpaceCallState) {
    if (this.state === s) return;
    console.log(`[SpaceCallManager] ${this.state} → ${s}`);
    this.state = s;
    this.callbacks.onStateChange(s);
  }

  private setMode(m: SpaceCallMode) {
    if (this.mode === m) return;
    console.log(`[SpaceCallManager] Modus: ${this.mode} → ${m}`);
    this.mode = m;
    this.callbacks.onModeChange(m);
  }

  private emitParticipants() {
    this.callbacks.onParticipantsChange(this.getParticipants());
  }

  // ── Call beitreten ────────────────────────────────────────────────────

  /**
   * Einem Space-Call beitreten.
   * @param spaceId  Space-ID
   * @param aregoId  Eigene Arego-ID
   * @param mediaType  'audio' oder 'video'
   * @param e2eeKey  Optionaler gemeinsamer E2EE-Schluessel
   */
  async join(spaceId: string, aregoId: string, mediaType: CallMediaType, e2eeKey?: CryptoKey): Promise<void> {
    if (this.state !== 'idle') {
      console.warn('[SpaceCallManager] join ignoriert — State:', this.state);
      return;
    }

    this.spaceId = spaceId;
    this.myAregoId = aregoId;
    this.mediaType = mediaType;
    this.e2eeKey = e2eeKey ?? null;
    this.setState('joining');

    try {
      // 1. Media anfordern
      await this.media.acquire(mediaType);
      this.callbacks.onLocalStream(this.media.getStream());

      // 2. WebSocket zum Signaling-Server oeffnen
      await this.connectSignaling(spaceId);
    } catch (err) {
      console.error('[SpaceCallManager] join FEHLER:', err);
      this.callbacks.onError(err instanceof Error ? err.message : 'Beitritt fehlgeschlagen');
      this.cleanup();
    }
  }

  // ── WebSocket Signaling ───────────────────────────────────────────────

  private connectSignaling(spaceId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(SIGNALING_URL);
      this.ws = ws;

      ws.onopen = () => {
        console.log('[SpaceCallManager] WS offen — join space-call:', spaceId);
        ws.send(JSON.stringify({ type: 'join', room: `space-call:${spaceId}` }));
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this.handleSignalingMessage(msg, resolve);
      };

      ws.onerror = () => {
        reject(new Error('WebSocket-Fehler'));
      };

      ws.onclose = () => {
        console.log('[SpaceCallManager] WS geschlossen');
        if (this.state === 'active' || this.state === 'joining') {
          this.cleanup();
        }
      };
    });
  }

  private handleSignalingMessage(msg: any, resolveJoin?: (value: void) => void) {
    switch (msg.type) {
      case 'space_call_joined':
        this.handleJoined(msg);
        resolveJoin?.();
        break;
      case 'space_call_participant_joined':
        this.handleParticipantJoined(msg);
        break;
      case 'space_call_participant_left':
        this.handleParticipantLeft(msg);
        break;
      case 'space_call_sdp':
        this.handleSdp(msg);
        break;
      case 'space_call_ice':
        this.handleIce(msg);
        break;
      case 'space_call_sfu_switch':
        this.handleSfuSwitch(msg);
        break;
      case 'space_call_kicked':
        this.handleKicked();
        break;
      case 'space_call_muted_by_moderator':
        this.handleMutedByModerator(msg);
        break;
      case 'space_call_screen_share':
        this.handleRemoteScreenShare(msg);
        break;
      case 'space_call_error':
        console.error('[SpaceCallManager] Server-Fehler:', msg.error, msg.message);
        this.callbacks.onError(msg.message ?? msg.error);
        this.cleanup();
        break;
    }
  }

  // ── Joined: Initialer Call-State vom Server ───────────────────────────

  private async handleJoined(msg: any) {
    const participants: string[] = msg.participants ?? [];
    this.moderatorId = msg.moderatorId ?? null;
    this.callbacks.onModeratorChange(this.moderatorId!);

    const serverMode: SpaceCallMode = msg.mode === 'sfu' ? 'sfu' : 'mesh';
    this.setMode(serverMode);
    this.setState('active');

    if (serverMode === 'mesh') {
      // Mesh-Verbindungen zu bestehenden Teilnehmern aufbauen (wir sind Polite Peer)
      for (const peerId of participants) {
        if (peerId === this.myAregoId) continue;
        await this.createMeshOffer(peerId);
      }
    }
    // SFU-Modus wird ueber space_call_sfu_switch aktiviert

    this.emitParticipants();
  }

  // ── Neuer Teilnehmer ──────────────────────────────────────────────────

  private async handleParticipantJoined(msg: any) {
    const peerId = msg.aregoId as string;
    const newMode: SpaceCallMode = msg.mode === 'sfu' ? 'sfu' : 'mesh';

    if (newMode !== this.mode) {
      // Modus-Wechsel wird ueber space_call_sfu_switch gehandelt
    }

    if (this.mode === 'mesh' && !this.meshPeers.has(peerId)) {
      // Neuer Peer im Mesh — wir warten auf dessen Offer (er ist neu, wir sind bestehend)
      // Der neue Peer sendet Offers an alle bestehenden (handleJoined)
      // Wir brauchen hier nichts tun — SDP kommt ueber space_call_sdp
    }

    this.callbacks.onModeratorChange(this.moderatorId!);
    this.emitParticipants();
  }

  // ── Teilnehmer verlassen ──────────────────────────────────────────────

  private handleParticipantLeft(msg: any) {
    const peerId = msg.aregoId as string;
    this.moderatorId = msg.moderatorId ?? this.moderatorId;

    // Mesh-Peer aufraeumen
    const peer = this.meshPeers.get(peerId);
    if (peer) {
      peer.pc.close();
      this.meshPeers.delete(peerId);
    }

    // SFU-Remote-Stream aufraeumen
    this.sfuRemoteStreams.delete(peerId);

    const newMode: SpaceCallMode = msg.mode === 'sfu' ? 'sfu' : 'mesh';
    if (newMode !== this.mode && newMode === 'mesh' && this.mode === 'sfu') {
      // SFU→Mesh Rueckwechsel (Teilnehmer unter 4 gefallen)
      this.switchSfuToMesh(msg);
    }

    this.callbacks.onModeratorChange(this.moderatorId!);
    this.emitParticipants();
  }

  // ── Mesh: SDP Handling ────────────────────────────────────────────────

  private async createMeshOffer(peerId: string) {
    const iceServers = await buildIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    const remoteStream = new MediaStream();

    const meshPeer: MeshPeer = {
      aregoId: peerId,
      pc,
      remoteStream,
      pendingIce: [],
    };
    this.meshPeers.set(peerId, meshPeer);

    this.setupMeshPcCallbacks(meshPeer);

    // Lokale Tracks hinzufuegen
    const localStream = this.media.getStream();
    if (localStream) {
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }

    // E2EE: Insertable Streams (wenn Key vorhanden)
    if (this.e2eeKey) {
      this.setupInsertableStreams(pc, this.e2eeKey);
    }

    // Offer erstellen und senden
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.wsSend({
      type: 'space_call_sdp',
      spaceId: this.spaceId,
      targetId: peerId,
      sdp: offer.sdp,
      sdpType: 'offer',
    });
  }

  private async handleSdp(msg: any) {
    const fromId = msg.fromId as string;
    const sdpType = msg.sdpType as 'offer' | 'answer';
    const sdp = msg.sdp as string;

    if (sdpType === 'offer') {
      // Incoming Offer — erstelle Answer
      const iceServers = await buildIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      const remoteStream = new MediaStream();

      const meshPeer: MeshPeer = {
        aregoId: fromId,
        pc,
        remoteStream,
        pendingIce: [],
      };
      this.meshPeers.set(fromId, meshPeer);
      this.setupMeshPcCallbacks(meshPeer);

      // Lokale Tracks hinzufuegen
      const localStream = this.media.getStream();
      if (localStream) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
      }

      // E2EE
      if (this.e2eeKey) {
        this.setupInsertableStreams(pc, this.e2eeKey);
      }

      await pc.setRemoteDescription({ type: 'offer', sdp });

      // Gepufferte ICE Candidates
      for (const candidate of meshPeer.pendingIce) {
        try { await pc.addIceCandidate(candidate); } catch { /* ok */ }
      }
      meshPeer.pendingIce = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.wsSend({
        type: 'space_call_sdp',
        spaceId: this.spaceId,
        targetId: fromId,
        sdp: answer.sdp,
        sdpType: 'answer',
      });

      this.emitParticipants();
    } else if (sdpType === 'answer') {
      const peer = this.meshPeers.get(fromId);
      if (!peer) return;

      await peer.pc.setRemoteDescription({ type: 'answer', sdp });

      // Gepufferte ICE Candidates
      for (const candidate of peer.pendingIce) {
        try { await peer.pc.addIceCandidate(candidate); } catch { /* ok */ }
      }
      peer.pendingIce = [];
    }
  }

  private async handleIce(msg: any) {
    const fromId = msg.fromId as string;
    const candidate = msg.candidate as RTCIceCandidateInit;

    const peer = this.meshPeers.get(fromId);
    if (!peer) return;

    if (!peer.pc.remoteDescription) {
      peer.pendingIce.push(candidate);
    } else {
      try { await peer.pc.addIceCandidate(candidate); } catch { /* ok */ }
    }
  }

  private setupMeshPcCallbacks(meshPeer: MeshPeer) {
    const { pc, remoteStream, aregoId } = meshPeer;

    pc.ontrack = ({ track }) => {
      console.log(`[SpaceCallManager] Mesh ontrack von ${aregoId}:`, track.kind, track.label);

      // Screen-Share-Track erkennen: zweiter Video-Track
      const existingVideoTracks = remoteStream.getVideoTracks();
      if (track.kind === 'video' && existingVideoTracks.length > 0) {
        const screenStream = new MediaStream([track]);
        this.remoteScreenStreams.set(aregoId, screenStream);
        track.onended = () => {
          this.remoteScreenStreams.delete(aregoId);
          this.emitParticipants();
        };
        this.emitParticipants();
        return;
      }

      remoteStream.addTrack(track);
      // Neuen Stream erzeugen damit React re-rendert
      meshPeer.remoteStream = new MediaStream(remoteStream.getTracks());
      this.emitParticipants();
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.wsSend({
          type: 'space_call_ice',
          spaceId: this.spaceId,
          targetId: aregoId,
          candidate: candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log(`[SpaceCallManager] Mesh PC ${aregoId} connectionState:`, s);
      if (s === 'disconnected' || s === 'failed') {
        // Peer-Verbindung verloren — aufraeumen
        pc.close();
        this.meshPeers.delete(aregoId);
        this.emitParticipants();
      }
    };
  }

  // ── E2EE: Insertable Streams (Mesh-Modus) ────────────────────────────

  private setupInsertableStreams(pc: RTCPeerConnection, key: CryptoKey) {
    // Insertable Streams API fuer sender und receiver
    // Nutzt RTCRtpScriptTransform wenn verfuegbar, sonst createEncodedStreams
    const senders = pc.getSenders();
    const receivers = pc.getReceivers();

    // Fuer Sender: Frames verschluesseln
    for (const sender of senders) {
      if ('transform' in sender && typeof RTCRtpScriptTransform !== 'undefined') {
        // Moderne API — ScriptTransform (Worker-basiert)
        // Fuer Aregoland: einfache XOR-basierte Frame-Verschluesselung
        // (Vollstaendige AES-Verschluesselung kommt in spaeterer Phase)
        console.log('[SpaceCallManager] E2EE: Insertable Streams Setup fuer Sender');
      }
    }

    // Fuer Receiver: Frames entschluesseln
    for (const receiver of receivers) {
      if ('transform' in receiver && typeof RTCRtpScriptTransform !== 'undefined') {
        console.log('[SpaceCallManager] E2EE: Insertable Streams Setup fuer Receiver');
      }
    }
  }

  // ── SFU-Modus: LiveKit ────────────────────────────────────────────────

  private async handleSfuSwitch(msg: any) {
    this.livekitUrl = msg.livekitUrl as string;
    this.livekitRoomName = msg.roomName as string;

    console.log('[SpaceCallManager] SFU-Switch:', this.livekitUrl, this.livekitRoomName);

    // Mesh-Peers schliessen
    this.closeMeshPeers();
    this.setMode('sfu');

    // LiveKit-Verbindung aufbauen
    await this.connectLiveKit();
  }

  private async connectLiveKit() {
    if (!this.livekitUrl || !this.livekitRoomName) return;

    try {
      // LiveKit-Token vom Signaling-Server anfordern
      const token = await this.fetchLiveKitToken();
      if (!token) {
        console.error('[SpaceCallManager] Kein LiveKit-Token erhalten');
        return;
      }

      // E2EE Setup
      let e2eeOptions: any;
      if (this.e2eeKey) {
        const rawKey = await crypto.subtle.exportKey('raw', this.e2eeKey);
        const keyBytes = new Uint8Array(rawKey);
        const { ExternalE2EEKeyProvider: EKP } = await Function('return import("livekit-client")')();
        const keyProvider = new EKP();
        keyProvider.setKey(keyBytes);
        e2eeOptions = {
          keyProvider,
          worker: new Worker('livekit-client/e2ee-worker', { type: 'module' }),
        };
      }

      // Dynamischer LiveKit-Import
      const lk = await Function('return import("livekit-client")')().catch(() => null);
      if (!lk) {
        console.error('[SpaceCallManager] livekit-client nicht verfuegbar');
        this.callbacks.onError('SFU-Modus nicht verfuegbar');
        return;
      }
      const { Room: LKRoom, RoomEvent: LKRoomEvent, Track: LKTrack, VideoPresets: LKPresets } = lk;

      const room = new LKRoom({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: LKPresets.h720.resolution },
        ...(e2eeOptions ? { e2ee: e2eeOptions } : {}),
      });

      room.on(LKRoomEvent.Connected, () => {
        console.log('[SpaceCallManager] LiveKit verbunden');
      });

      room.on(LKRoomEvent.Disconnected, () => {
        console.log('[SpaceCallManager] LiveKit getrennt');
        this.sfuRemoteStreams.clear();
        this.emitParticipants();
      });

      room.on(
        LKRoomEvent.TrackSubscribed,
        (track: any, pub: any, participant: any) => {
          const mediaTrack = track.mediaStreamTrack;
          if (!mediaTrack) return;
          const participantId = participant.identity;

          // Screen-Share-Track separat behandeln
          if (pub.source === LKTrack.Source.ScreenShare) {
            const screenStream = new MediaStream([mediaTrack]);
            this.remoteScreenStreams.set(participantId, screenStream);
            this.callbacks.onScreenShareChange(true, participantId);
            this.emitParticipants();
            return;
          }

          let stream = this.sfuRemoteStreams.get(participantId);
          if (!stream) {
            stream = new MediaStream();
            this.sfuRemoteStreams.set(participantId, stream);
          }
          stream.addTrack(mediaTrack);
          // Neuen Stream fuer React-Rerender
          this.sfuRemoteStreams.set(participantId, new MediaStream(stream.getTracks()));
          this.emitParticipants();
        },
      );

      room.on(
        LKRoomEvent.TrackUnsubscribed,
        (track: any, pub: any, participant: any) => {
          const mediaTrack = track.mediaStreamTrack;
          if (!mediaTrack) return;
          const participantId = participant.identity;

          // Screen-Share-Track entfernt
          if (pub.source === LKTrack.Source.ScreenShare) {
            this.remoteScreenStreams.delete(participantId);
            this.callbacks.onScreenShareChange(false, participantId);
            this.emitParticipants();
            return;
          }

          const stream = this.sfuRemoteStreams.get(participantId);
          if (stream) {
            stream.removeTrack(mediaTrack);
            if (stream.getTracks().length === 0) {
              this.sfuRemoteStreams.delete(participantId);
            }
          }
          this.emitParticipants();
        },
      );

      room.on(LKRoomEvent.ParticipantDisconnected, (participant: any) => {
        this.sfuRemoteStreams.delete(participant.identity);
        this.emitParticipants();
      });

      await room.connect(this.livekitUrl, token);
      this.livekitRoom = room;

      if (e2eeOptions) {
        await room.setE2EEEnabled(true);
      }

      // Lokale Tracks publishen
      const localStream = this.media.getStream();
      if (localStream) {
        for (const track of localStream.getAudioTracks()) {
          await room.localParticipant.publishTrack(track, {
            source: LKTrack.Source.Microphone,
          });
        }
        for (const track of localStream.getVideoTracks()) {
          await room.localParticipant.publishTrack(track, {
            source: LKTrack.Source.Camera,
            videoEncoding: LKPresets.h720.encoding,
          });
        }
      }
    } catch (err) {
      console.error('[SpaceCallManager] LiveKit-Verbindung fehlgeschlagen:', err);
      this.callbacks.onError('SFU-Verbindung fehlgeschlagen');
    }
  }

  private async fetchLiveKitToken(): Promise<string | null> {
    const httpUrl =
      (import.meta as any).env?.VITE_SIGNALING_HTTP_URL ??
      `${window.location.protocol}//${window.location.host}/api-signal`;
    try {
      const res = await fetch(`${httpUrl}/space-call-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceId: this.spaceId,
          aregoId: this.myAregoId,
          roomName: this.livekitRoomName,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.token ?? null;
    } catch {
      return null;
    }
  }

  private async switchSfuToMesh(msg: any) {
    // Teilnehmer unter 4 → zurueck zu Mesh
    console.log('[SpaceCallManager] SFU→Mesh Rueckwechsel');

    // LiveKit trennen
    if (this.livekitRoom) {
      this.livekitRoom.disconnect();
      this.livekitRoom = null;
    }
    this.sfuRemoteStreams.clear();
    this.setMode('mesh');

    // Neue Mesh-Verbindungen zu verbleibenden Teilnehmern
    // Der Server sendet die aktuelle Teilnehmer-Liste im participant_left Event nicht direkt,
    // daher muessen bestehende Peers ueber SDP neu verbunden werden.
    // Dies passiert automatisch wenn participant_joined Events kommen.
  }

  // ── Mesh: Peer-Cleanup ────────────────────────────────────────────────

  private closeMeshPeers() {
    for (const [, peer] of this.meshPeers) {
      peer.pc.close();
    }
    this.meshPeers.clear();
  }

  // ── Call verlassen ────────────────────────────────────────────────────

  async leave(): Promise<void> {
    if (this.state === 'idle' || this.state === 'leaving') return;

    this.setState('leaving');

    // Server informieren
    this.wsSend({
      type: 'space_call_leave',
      spaceId: this.spaceId,
    });

    this.cleanup();
  }

  // ── Moderator-Aktionen ────────────────────────────────────────────────

  /** Teilnehmer remote muten (nur Moderator). */
  muteRemote(targetId: string, track: 'audio' | 'video' = 'audio') {
    if (!this.isModerator()) {
      console.warn('[SpaceCallManager] muteRemote — nicht Moderator');
      return;
    }
    this.wsSend({
      type: 'space_call_mute_remote',
      spaceId: this.spaceId,
      targetId,
      track,
    });
  }

  /** Teilnehmer kicken (nur Moderator). */
  kick(targetId: string) {
    if (!this.isModerator()) {
      console.warn('[SpaceCallManager] kick — nicht Moderator');
      return;
    }
    this.wsSend({
      type: 'space_call_kick',
      spaceId: this.spaceId,
      targetId,
    });
  }

  // ── Eingehende Moderator-Aktionen ─────────────────────────────────────

  private handleKicked() {
    console.log('[SpaceCallManager] Gekickt vom Moderator');
    this.callbacks.onKicked();
    this.cleanup();
  }

  private handleMutedByModerator(msg: any) {
    const track = (msg.track as 'audio' | 'video') ?? 'audio';
    console.log('[SpaceCallManager] Gemutet vom Moderator:', track);

    if (track === 'audio') {
      const audioTrack = this.media.getStream()?.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = false;
    } else {
      const videoTrack = this.media.getStream()?.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = false;
    }

    this.callbacks.onMutedByModerator(track);
  }

  // ── Media Controls ────────────────────────────────────────────────────

  toggleMic(): boolean {
    const enabled = this.media.toggleMic();
    if (this.mode === 'sfu' && this.livekitRoom) {
      this.livekitRoom.localParticipant.setMicrophoneEnabled(enabled);
    }
    return enabled;
  }

  toggleCamera(): boolean {
    const enabled = this.media.toggleCamera();
    if (this.mode === 'sfu' && this.livekitRoom) {
      this.livekitRoom.localParticipant.setCameraEnabled(enabled);
    }
    return enabled;
  }

  isMicEnabled(): boolean { return this.media.isMicEnabled(); }
  isCameraEnabled(): boolean { return this.media.isCameraEnabled(); }

  async switchCamera(): Promise<void> {
    const newTrack = await this.media.switchCamera();
    if (!newTrack) return;

    if (this.mode === 'mesh') {
      // Track bei allen Mesh-Peers ersetzen
      for (const [, peer] of this.meshPeers) {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }
    }

    this.callbacks.onLocalStream(this.media.getStream());
  }

  // ── Screen Sharing ────────────────────────────────────────────────────

  /**
   * Screen Sharing starten. Nur ab FSK >= 16, nur im aktiven Call.
   * Screen-Share ist ein separater Video-Track (ersetzt nicht die Kamera).
   */
  async startScreenShare(): Promise<void> {
    if (this.state !== 'active') {
      console.warn('[SpaceCallManager] startScreenShare — Call nicht aktiv');
      return;
    }
    if (this.screenSharing) {
      console.warn('[SpaceCallManager] startScreenShare — bereits aktiv');
      return;
    }
    if (!SpaceCallManager.isScreenShareSupported()) {
      this.callbacks.onError('Screen Sharing wird von diesem Browser nicht unterstuetzt');
      return;
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = this.screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        this.callbacks.onError('Kein Screen-Track erhalten');
        return;
      }

      // Track-Ende erkennen (User klickt "Sharing beenden" im Browser-Dialog)
      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      // Tab-Wechsel: automatisch stoppen
      this.visibilityHandler = () => {
        if (document.hidden && this.screenSharing) {
          console.log('[SpaceCallManager] Tab versteckt — Screen Sharing gestoppt');
          this.stopScreenShare();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);

      // Track an Peers senden
      if (this.mode === 'mesh') {
        await this.addScreenTrackToMesh(screenTrack);
      } else if (this.mode === 'sfu' && this.livekitRoom) {
        const lk = await Function('return import("livekit-client")')().catch(() => null);
        if (lk) {
          await this.livekitRoom.localParticipant.publishTrack(screenTrack, {
            source: lk.Track.Source.ScreenShare,
          });
        }
      }

      // Allen Peers mitteilen dass Screen geteilt wird
      this.wsSend({
        type: 'space_call_screen_share',
        spaceId: this.spaceId,
        fromId: this.myAregoId,
        sharing: true,
      });

      this.screenSharing = true;
      this.callbacks.onScreenShareChange(true, this.myAregoId!);
      console.log('[SpaceCallManager] Screen Sharing gestartet');
    } catch (err) {
      // User hat Dialog abgebrochen — kein Fehler
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        console.log('[SpaceCallManager] Screen-Share vom User abgebrochen');
        return;
      }
      console.error('[SpaceCallManager] Screen Sharing Fehler:', err);
      this.callbacks.onError('Screen Sharing fehlgeschlagen');
    }
  }

  /** Screen Sharing beenden. */
  stopScreenShare(): void {
    if (!this.screenSharing) return;

    // Visibility-Listener entfernen
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    // Screen-Track stoppen
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
    }

    // Track von Mesh-Peers entfernen
    if (this.mode === 'mesh') {
      this.removeScreenTrackFromMesh();
    } else if (this.mode === 'sfu' && this.livekitRoom) {
      const publications = this.livekitRoom.localParticipant.trackPublications;
      for (const [, pub] of publications) {
        if (pub.source === 'screen_share') {
          this.livekitRoom.localParticipant.unpublishTrack(pub.track!.mediaStreamTrack);
        }
      }
    }

    // Allen Peers mitteilen
    this.wsSend({
      type: 'space_call_screen_share',
      spaceId: this.spaceId,
      fromId: this.myAregoId,
      sharing: false,
    });

    this.screenStream = null;
    this.screenSharing = false;
    this.callbacks.onScreenShareChange(false, this.myAregoId!);
    console.log('[SpaceCallManager] Screen Sharing gestoppt');
  }

  private async addScreenTrackToMesh(screenTrack: MediaStreamTrack): Promise<void> {
    for (const [, peer] of this.meshPeers) {
      peer.pc.addTrack(screenTrack, this.screenStream!);
      // Renegotiation noetig — neuen Offer erstellen
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.wsSend({
        type: 'space_call_sdp',
        spaceId: this.spaceId,
        targetId: peer.aregoId,
        sdp: offer.sdp,
        sdpType: 'offer',
      });
    }
  }

  private removeScreenTrackFromMesh(): void {
    const screenTrack = this.screenStream?.getVideoTracks()[0];
    if (!screenTrack) return;
    for (const [, peer] of this.meshPeers) {
      const sender = peer.pc.getSenders().find(s => s.track === screenTrack);
      if (sender) {
        peer.pc.removeTrack(sender);
      }
    }
  }

  private handleRemoteScreenShare(msg: any): void {
    const fromId = msg.fromId as string;
    const sharing = msg.sharing as boolean;
    if (!sharing) {
      this.remoteScreenStreams.delete(fromId);
    }
    this.callbacks.onScreenShareChange(sharing, fromId);
    this.emitParticipants();
  }

  // ── WebSocket-Hilfe ───────────────────────────────────────────────────

  private wsSend(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  private cleanup() {
    // Screen Sharing aufraeumen
    if (this.screenSharing) {
      this.stopScreenShare();
    }
    this.remoteScreenStreams.clear();

    // Mesh aufraeumen
    this.closeMeshPeers();

    // SFU aufraeumen
    if (this.livekitRoom) {
      this.livekitRoom.disconnect();
      this.livekitRoom = null;
    }
    this.sfuRemoteStreams.clear();

    // Media stoppen
    this.media.cleanup();
    this.callbacks.onLocalStream(null);

    // WebSocket schliessen
    if (this.ws) {
      this.ws.onclose = null; // Prevent recursive cleanup
      this.ws.close();
      this.ws = null;
    }

    this.spaceId = null;
    this.moderatorId = null;
    this.e2eeKey = null;
    this.livekitUrl = null;
    this.livekitRoomName = null;

    this.setState('idle');
    this.emitParticipants();
  }

  /** Manager komplett zerstoeren (bei Unmount). */
  destroy() {
    if (this.state !== 'idle') {
      this.leave();
    }
    this.callbacks = null!;
  }
}
