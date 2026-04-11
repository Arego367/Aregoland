/**
 * LiveKit-Manager — Self-Hosted SFU Verbindung
 *
 * Verwaltet eine LiveKit Room-Verbindung mit E2E-Verschluesselung.
 * Der SFU-Node sieht nur verschluesselten Ciphertext (Insertable Streams / E2EE).
 *
 * Ablauf:
 *  1. Room-Connect zur Node-URL mit Token
 *  2. E2EE aktivieren (LiveKit Built-in E2EE mit SharedKey)
 *  3. Lokale Tracks publishen (Audio/Video)
 *  4. Remote-Tracks subscriben → MediaStream fuer CallOverlay
 *  5. Disconnect + Cleanup
 */

import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  ConnectionState,
  ExternalE2EEKeyProvider,
  E2EEOptions,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type LocalTrackPublication,
} from 'livekit-client';

export type LiveKitStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface LiveKitCallbacks {
  onStatusChange: (status: LiveKitStatus, error?: string) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onRemoteStreamRemoved: () => void;
}

export class LiveKitManager {
  private room: Room | null = null;
  private callbacks: LiveKitCallbacks;
  private remoteStream: MediaStream | null = null;
  private status: LiveKitStatus = 'disconnected';

  constructor(callbacks: LiveKitCallbacks) {
    this.callbacks = callbacks;
  }

  getStatus(): LiveKitStatus {
    return this.status;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Verbindung zum LiveKit-Node herstellen.
   *
   * @param nodeUrl  WebSocket-URL des LiveKit-Nodes (z.B. wss://livekit.example.com)
   * @param token    JWT-Token fuer Authentifizierung (vom Signaling-Server generiert)
   * @param e2eeKey  Shared Key fuer E2E-Verschluesselung (aus bestehendem ECDH-Key)
   */
  async connect(
    nodeUrl: string,
    token: string,
    e2eeKey: Uint8Array,
  ): Promise<void> {
    if (this.room) {
      this.disconnect();
    }

    this.setStatus('connecting');

    try {
      // E2EE Setup mit SharedKey
      const keyProvider = new ExternalE2EEKeyProvider();
      keyProvider.setKey(e2eeKey);

      const e2eeOptions: E2EEOptions = {
        keyProvider,
        worker: new Worker(
          new URL('livekit-client/e2ee-worker', import.meta.url),
          { type: 'module' },
        ),
      };

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
        },
        e2ee: e2eeOptions,
      });

      // Event-Handler
      room.on(RoomEvent.Connected, () => {
        this.setStatus('connected');
      });

      room.on(RoomEvent.Reconnecting, () => {
        this.setStatus('reconnecting');
      });

      room.on(RoomEvent.Reconnected, () => {
        this.setStatus('connected');
      });

      room.on(RoomEvent.Disconnected, () => {
        this.cleanupRemoteStream();
        this.setStatus('disconnected');
      });

      room.on(
        RoomEvent.TrackSubscribed,
        (track, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
          this.handleTrackSubscribed(track);
        },
      );

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
          this.handleTrackUnsubscribed(track);
        },
      );

      room.on(RoomEvent.ConnectionQualityChanged, (_quality, participant) => {
        if (participant.isLocal) return;
        // Koennte spaeter fuer UI-Indikator genutzt werden
      });

      // Verbinden
      await room.connect(nodeUrl, token);
      this.room = room;

      // E2EE aktivieren
      await room.setE2EEEnabled(true);
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : 'Verbindungsfehler');
      throw err;
    }
  }

  /**
   * Lokale Audio/Video-Tracks publishen.
   * Nutzt den bestehenden MediaStream vom MediaStreamManager.
   */
  async publishTracks(localStream: MediaStream): Promise<void> {
    if (!this.room || this.room.state !== ConnectionState.Connected) return;

    const audioTracks = localStream.getAudioTracks();
    const videoTracks = localStream.getVideoTracks();

    for (const track of audioTracks) {
      await this.room.localParticipant.publishTrack(track, {
        source: Track.Source.Microphone,
      });
    }

    for (const track of videoTracks) {
      await this.room.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
        videoEncoding: VideoPresets.h720.encoding,
      });
    }
  }

  /**
   * Einzelnen lokalen Track unpublishen (fuer Mic/Camera Toggle).
   */
  async unpublishTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.room) return;

    const publications = this.room.localParticipant.trackPublications;
    for (const [, pub] of publications) {
      if ((pub as LocalTrackPublication).track?.mediaStreamTrack === track) {
        await this.room.localParticipant.unpublishTrack(track);
        break;
      }
    }
  }

  /**
   * Mic stumm schalten / aktivieren.
   */
  async setMicEnabled(enabled: boolean): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  /**
   * Kamera an/aus.
   */
  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setCameraEnabled(enabled);
  }

  /**
   * Verbindung sauber trennen.
   */
  disconnect(): void {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
    this.cleanupRemoteStream();
    this.setStatus('disconnected');
  }

  isConnected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  // ── Privat ──────────────────────────────────────────────────────────────────

  private setStatus(status: LiveKitStatus, error?: string) {
    this.status = status;
    this.callbacks.onStatusChange(status, error);
  }

  private handleTrackSubscribed(track: Track) {
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;

    if (!this.remoteStream) {
      this.remoteStream = new MediaStream();
    }

    this.remoteStream.addTrack(mediaTrack);
    this.callbacks.onRemoteStream(this.remoteStream);
  }

  private handleTrackUnsubscribed(track: Track) {
    if (!this.remoteStream) return;

    const mediaTrack = track.mediaStreamTrack;
    if (mediaTrack) {
      this.remoteStream.removeTrack(mediaTrack);
    }

    // Wenn keine Tracks mehr, Stream entfernen
    if (this.remoteStream.getTracks().length === 0) {
      this.cleanupRemoteStream();
    }
  }

  private cleanupRemoteStream() {
    if (this.remoteStream) {
      this.remoteStream = null;
      this.callbacks.onRemoteStreamRemoved();
    }
  }
}
