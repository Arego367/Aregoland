import { test, expect } from '@playwright/test';

/**
 * Connection Mode + MediaStreamManager Tests
 *
 * Testet determineConnectionMode() Logik und MediaStreamManager Funktionen.
 */

async function setupApp(page: any) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('aregoland_identity', JSON.stringify({
      aregoId: 'AC-TEST-CONN-001',
      displayName: 'Conn Tester',
      publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'test', y: 'test' },
      privateKeyJwk: { kty: 'EC', crv: 'P-256', x: 'test', y: 'test', d: 'test' },
      createdAt: new Date().toISOString(),
    }));
  });
  await page.reload();
  await page.waitForTimeout(1000);
}

test.describe('determineConnectionMode', () => {

  test('P2P verbunden → p2p Modus', async ({ page }) => {
    await setupApp(page);

    const mode = await page.evaluate(async () => {
      const { determineConnectionMode } = await import('/src/app/lib/call-manager.ts');
      return determineConnectionMode(true, false);
    });

    expect(mode).toBe('p2p');
  });

  test('P2P verbunden hat Prioritaet ueber Timeout', async ({ page }) => {
    await setupApp(page);

    const mode = await page.evaluate(async () => {
      const { determineConnectionMode } = await import('/src/app/lib/call-manager.ts');
      return determineConnectionMode(true, true);
    });

    expect(mode).toBe('p2p');
  });

  test('P2P Timeout mit LiveKit Node → sfu Modus', async ({ page }) => {
    await setupApp(page);

    const mode = await page.evaluate(async () => {
      const { determineConnectionMode, setLiveKitNodeUrl } = await import('/src/app/lib/call-manager.ts');
      setLiveKitNodeUrl('wss://livekit.test.local');
      const result = determineConnectionMode(false, true);
      setLiveKitNodeUrl(null); // cleanup
      return result;
    });

    expect(mode).toBe('sfu');
  });

  test('P2P Timeout ohne LiveKit Node → turn Modus', async ({ page }) => {
    await setupApp(page);

    const mode = await page.evaluate(async () => {
      const { determineConnectionMode, setLiveKitNodeUrl } = await import('/src/app/lib/call-manager.ts');
      setLiveKitNodeUrl(null);
      return determineConnectionMode(false, true);
    });

    expect(mode).toBe('turn');
  });

  test('Weder verbunden noch Timeout → p2p (Versuch laeuft)', async ({ page }) => {
    await setupApp(page);

    const mode = await page.evaluate(async () => {
      const { determineConnectionMode } = await import('/src/app/lib/call-manager.ts');
      return determineConnectionMode(false, false);
    });

    expect(mode).toBe('p2p');
  });

  test('LiveKit Node URL kann gesetzt und gelesen werden', async ({ page }) => {
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { getLiveKitNodeUrl, setLiveKitNodeUrl } = await import('/src/app/lib/call-manager.ts');

      // Erst null
      setLiveKitNodeUrl(null);
      const before = getLiveKitNodeUrl();

      // Setzen
      setLiveKitNodeUrl('wss://my-node.test');
      const after = getLiveKitNodeUrl();

      // Loeschen
      setLiveKitNodeUrl(null);
      const cleared = getLiveKitNodeUrl();

      return { before, after, cleared };
    });

    expect(result.before).toBeNull();
    expect(result.after).toBe('wss://my-node.test');
    expect(result.cleared).toBeNull();
  });

  test('P2P_TIMEOUT_MS ist 10 Sekunden', async ({ page }) => {
    await setupApp(page);

    const timeout = await page.evaluate(async () => {
      const { P2P_TIMEOUT_MS } = await import('/src/app/lib/call-manager.ts');
      return P2P_TIMEOUT_MS;
    });

    expect(timeout).toBe(10_000);
  });
});

test.describe('MediaStreamManager', () => {

  test('acquire audio liefert Audio-Stream', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { MediaStreamManager } = await import('/src/app/lib/media-stream-manager.ts');
      const msm = new MediaStreamManager();
      const { stream, cameraUnavailable } = await msm.acquire('audio');
      const audioTracks = stream.getAudioTracks().length;
      const videoTracks = stream.getVideoTracks().length;
      const hasStream = msm.hasStream();
      msm.cleanup();
      return { audioTracks, videoTracks, cameraUnavailable, hasStream };
    });

    expect(result.audioTracks).toBeGreaterThan(0);
    expect(result.videoTracks).toBe(0);
    expect(result.cameraUnavailable).toBe(false);
    expect(result.hasStream).toBe(true);
  });

  test('acquire video liefert Audio+Video-Stream', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { MediaStreamManager } = await import('/src/app/lib/media-stream-manager.ts');
      const msm = new MediaStreamManager();
      const { stream, cameraUnavailable } = await msm.acquire('video');
      const audioTracks = stream.getAudioTracks().length;
      const videoTracks = stream.getVideoTracks().length;
      msm.cleanup();
      return { audioTracks, videoTracks, cameraUnavailable };
    });

    expect(result.audioTracks).toBeGreaterThan(0);
    expect(result.videoTracks).toBeGreaterThan(0);
    expect(result.cameraUnavailable).toBe(false);
  });

  test('toggleMic schaltet Mikrofon ein/aus', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { MediaStreamManager } = await import('/src/app/lib/media-stream-manager.ts');
      const msm = new MediaStreamManager();
      await msm.acquire('audio');

      const initial = msm.isMicEnabled();
      msm.toggleMic();
      const afterToggle = msm.isMicEnabled();
      msm.toggleMic();
      const afterToggleBack = msm.isMicEnabled();

      msm.cleanup();
      return { initial, afterToggle, afterToggleBack };
    });

    expect(result.initial).toBe(true);
    expect(result.afterToggle).toBe(false);
    expect(result.afterToggleBack).toBe(true);
  });

  test('toggleCamera schaltet Kamera ein/aus', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { MediaStreamManager } = await import('/src/app/lib/media-stream-manager.ts');
      const msm = new MediaStreamManager();
      await msm.acquire('video');

      const initial = msm.isCameraEnabled();
      msm.toggleCamera();
      const afterToggle = msm.isCameraEnabled();
      msm.toggleCamera();
      const afterToggleBack = msm.isCameraEnabled();

      msm.cleanup();
      return { initial, afterToggle, afterToggleBack };
    });

    expect(result.initial).toBe(true);
    expect(result.afterToggle).toBe(false);
    expect(result.afterToggleBack).toBe(true);
  });

  test('cleanup stoppt alle Tracks und gibt Stream frei', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { MediaStreamManager } = await import('/src/app/lib/media-stream-manager.ts');
      const msm = new MediaStreamManager();
      await msm.acquire('video');
      const beforeCleanup = msm.hasStream();
      const tracksBefore = msm.getTracks().length;

      msm.cleanup();
      const afterCleanup = msm.hasStream();
      const stream = msm.getStream();

      return { beforeCleanup, tracksBefore, afterCleanup, streamNull: stream === null };
    });

    expect(result.beforeCleanup).toBe(true);
    expect(result.tracksBefore).toBeGreaterThan(0);
    expect(result.afterCleanup).toBe(false);
    expect(result.streamNull).toBe(true);
  });

  test('toggleMic ohne Stream gibt false zurueck', async ({ page }) => {
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { MediaStreamManager } = await import('/src/app/lib/media-stream-manager.ts');
      const msm = new MediaStreamManager();
      return msm.toggleMic();
    });

    expect(result).toBe(false);
  });

  test('toggleCamera ohne Stream gibt false zurueck', async ({ page }) => {
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { MediaStreamManager } = await import('/src/app/lib/media-stream-manager.ts');
      const msm = new MediaStreamManager();
      return msm.toggleCamera();
    });

    expect(result).toBe(false);
  });

  test('acquire ersetzt vorherigen Stream (cleanup)', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { MediaStreamManager } = await import('/src/app/lib/media-stream-manager.ts');
      const msm = new MediaStreamManager();

      // Erster Stream
      const { stream: s1 } = await msm.acquire('audio');
      const t1 = s1.getAudioTracks()[0];

      // Zweiter Stream (ersetzt ersten)
      const { stream: s2 } = await msm.acquire('video');
      const t1Ended = t1.readyState === 'ended';
      const newTrackCount = s2.getTracks().length;

      msm.cleanup();
      return { t1Ended, newTrackCount };
    });

    // Erster Track wurde gestoppt
    expect(result.t1Ended).toBe(true);
    // Neuer Stream hat Tracks
    expect(result.newTrackCount).toBeGreaterThan(0);
  });
});

test.describe('E2EE Key Derivation', () => {

  test('deriveE2EEKey erzeugt Uint8Array aus CryptoKey', async ({ page }) => {
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { deriveE2EEKey } = await import('/src/app/lib/call-manager.ts');

      // ECDH Key generieren als Test-SessionKey
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits'],
      );

      // Shared secret ableiten (self-agreement fuer Test)
      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: keyPair.publicKey },
        keyPair.privateKey,
        256,
      );

      const sessionKey = await crypto.subtle.importKey(
        'raw',
        sharedBits,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      );

      const e2eeKey = await deriveE2EEKey(sessionKey);
      return {
        isUint8Array: e2eeKey instanceof Uint8Array,
        length: e2eeKey.length,
        nonZero: e2eeKey.some(b => b !== 0),
      };
    });

    expect(result.isUint8Array).toBe(true);
    expect(result.length).toBe(32); // 256 bit
    expect(result.nonZero).toBe(true);
  });
});
