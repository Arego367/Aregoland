/**
 * MediaStream-Manager — getUserMedia, Kamera-Wechsel, Mic/Cam Toggle
 *
 * Besitzt den lokalen MediaStream (Audio + Video).
 * Kein Signaling, kein RTCPeerConnection — das bleibt beim Call-Manager.
 *
 * Nutzung:
 *   const msm = new MediaStreamManager();
 *   const { stream, cameraUnavailable } = await msm.acquire('video');
 *   msm.toggleMic();
 *   msm.toggleCamera();
 *   await msm.switchCamera();   // Front ↔ Back (Mobile)
 *   msm.cleanup();
 */

export type MediaKind = 'audio' | 'video';

export interface AcquireResult {
  stream: MediaStream;
  cameraUnavailable: boolean;
}

export class MediaStreamManager {
  private stream: MediaStream | null = null;
  private currentFacingMode: 'user' | 'environment' = 'user';

  // ── Stream anfordern ──────────────────────────────────────────────────────

  /**
   * getUserMedia anfordern. Bei Video-Anfrage mit Kamera-Fallback auf Audio-only.
   * Wirft bei Audio-Fehler (= kein Mikrofon) direkt.
   */
  async acquire(kind: MediaKind): Promise<AcquireResult> {
    this.cleanup();

    let cameraUnavailable = false;

    if (kind === 'video') {
      try {
        console.log('[MediaStreamManager] getUserMedia — audio + video');
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: this.currentFacingMode },
        });
      } catch (videoErr) {
        console.warn('[MediaStreamManager] Kamera nicht verfügbar, Fallback auf Audio:', videoErr);
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        cameraUnavailable = true;
      }
    } else {
      console.log('[MediaStreamManager] getUserMedia — audio only');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    console.log(
      '[MediaStreamManager] Stream erhalten — Tracks:',
      this.stream.getTracks().map((t) => `${t.kind}:${t.label}`).join(', '),
    );

    return { stream: this.stream, cameraUnavailable };
  }

  // ── Mic Toggle ────────────────────────────────────────────────────────────

  /** Mikrofon ein/aus (track.enabled), kein Stream-Neustart. Gibt neuen State zurück. */
  toggleMic(): boolean {
    const track = this.stream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    console.log('[MediaStreamManager] Mic toggled:', track.enabled ? 'on' : 'off');
    return track.enabled;
  }

  /** Gibt true zurück wenn Mikrofon aktiv. */
  isMicEnabled(): boolean {
    return this.stream?.getAudioTracks()[0]?.enabled ?? false;
  }

  // ── Camera Toggle ─────────────────────────────────────────────────────────

  /** Kamera ein/aus (track.enabled), kein Stream-Neustart. Gibt neuen State zurück. */
  toggleCamera(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    console.log('[MediaStreamManager] Camera toggled:', track.enabled ? 'on' : 'off');
    return track.enabled;
  }

  /** Gibt true zurück wenn Kamera aktiv. */
  isCameraEnabled(): boolean {
    return this.stream?.getVideoTracks()[0]?.enabled ?? false;
  }

  // ── Kamera-Wechsel (Front ↔ Back) ────────────────────────────────────────

  /**
   * Kamera wechseln ohne den Audio-Track zu unterbrechen.
   * Stoppt nur den alten Video-Track, fordert neuen an, fügt ihn dem Stream hinzu.
   * Gibt den neuen Video-Track zurück (für replaceTrack auf RTCPeerConnection).
   * Gibt null zurück wenn kein Video-Track vorhanden.
   */
  async switchCamera(): Promise<MediaStreamTrack | null> {
    if (!this.stream) return null;
    const oldVideoTrack = this.stream.getVideoTracks()[0];
    if (!oldVideoTrack) return null;

    // Facing Mode umschalten
    this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    console.log('[MediaStreamManager] Kamera-Wechsel →', this.currentFacingMode);

    try {
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.currentFacingMode },
      });
      const newVideoTrack = newVideoStream.getVideoTracks()[0];

      // Alten Track stoppen und aus Stream entfernen
      oldVideoTrack.stop();
      this.stream.removeTrack(oldVideoTrack);

      // Neuen Track hinzufügen
      this.stream.addTrack(newVideoTrack);

      console.log('[MediaStreamManager] Kamera gewechselt:', newVideoTrack.label);
      return newVideoTrack;
    } catch (err) {
      console.error('[MediaStreamManager] Kamera-Wechsel fehlgeschlagen:', err);
      // Facing Mode zurücksetzen
      this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
      return null;
    }
  }

  // ── Getter ────────────────────────────────────────────────────────────────

  /** Aktuellen lokalen Stream holen (oder null). */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /** Gibt true zurück wenn ein aktiver Stream existiert. */
  hasStream(): boolean {
    return this.stream !== null && this.stream.getTracks().some((t) => t.readyState === 'live');
  }

  /** Gibt alle aktuellen Tracks zurück. */
  getTracks(): MediaStreamTrack[] {
    return this.stream?.getTracks() ?? [];
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /** Alle Tracks stoppen und Stream freigeben. */
  cleanup(): void {
    if (!this.stream) return;
    this.stream.getTracks().forEach((t) => {
      t.stop();
      console.log('[MediaStreamManager] Track gestoppt:', t.kind, t.label);
    });
    this.stream = null;
  }
}
