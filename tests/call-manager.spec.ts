import { test, expect } from '@playwright/test';

/**
 * CallManager State-Machine Tests
 *
 * Testet die Zustandsuebergaenge des CallManagers in-browser
 * ueber page.evaluate() mit dynamischem Import.
 */

// Hilfsfunktion: Identity + App laden
async function setupApp(page: any) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('aregoland_identity', JSON.stringify({
      aregoId: 'AC-TEST-CALL-001',
      displayName: 'Call Tester',
      publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'test', y: 'test' },
      privateKeyJwk: { kty: 'EC', crv: 'P-256', x: 'test', y: 'test', d: 'test' },
      createdAt: new Date().toISOString(),
    }));
  });
  await page.reload();
  await page.waitForTimeout(1000);
}

test.describe('CallManager State-Machine', () => {

  test('Initialzustand ist idle', async ({ page }) => {
    await setupApp(page);

    const state = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const result = {
        state: cm.getState(),
        callType: cm.getCallType(),
        localStream: cm.getLocalStream(),
        remoteStream: cm.getRemoteStream(),
        cameraUnavailable: cm.isCameraUnavailable(),
      };
      cm.destroy();
      return result;
    });

    expect(state.state).toBe('idle');
    expect(state.callType).toBe('audio');
    expect(state.localStream).toBeNull();
    expect(state.remoteStream).toBeNull();
    expect(state.cameraUnavailable).toBe(false);
  });

  test('startCall wechselt zu ringing (Audio)', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const states: string[] = [];
      cm.onStateChange((s) => states.push(s));

      const mockSend = async () => true;
      await cm.startCall('audio', mockSend);

      const finalState = cm.getState();
      const hasLocalStream = cm.getLocalStream() !== null;
      cm.destroy();
      return { states, finalState, hasLocalStream };
    });

    expect(result.states).toContain('ringing');
    expect(result.hasLocalStream).toBe(true);
  });

  test('startCall wechselt zu ringing (Video)', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const states: string[] = [];
      cm.onStateChange((s) => states.push(s));

      const mockSend = async () => true;
      await cm.startCall('video', mockSend);

      const finalState = cm.getState();
      const callType = cm.getCallType();
      cm.destroy();
      return { states, finalState, callType };
    });

    expect(result.states).toContain('ringing');
    expect(result.callType).toBe('video');
  });

  test('startCall ignoriert wenn nicht idle', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const states: string[] = [];
      cm.onStateChange((s) => states.push(s));

      const mockSend = async () => true;
      await cm.startCall('audio', mockSend);
      // Zweiter startCall sollte ignoriert werden
      await cm.startCall('video', mockSend);

      const callType = cm.getCallType();
      cm.destroy();
      return { stateCount: states.length, callType };
    });

    // CallType bleibt 'audio' — zweiter startCall wurde ignoriert
    expect(result.callType).toBe('audio');
  });

  test('hangup wechselt zu ended dann idle', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const states: string[] = [];
      cm.onStateChange((s) => states.push(s));

      const signals: any[] = [];
      const mockSend = async (sig: any) => { signals.push(sig); return true; };
      await cm.startCall('audio', mockSend);
      cm.hangup();

      cm.destroy();
      return { states, signals, finalState: cm.getState() };
    });

    expect(result.states).toContain('ended');
    // Nach ended kommt sofort idle
    expect(result.states[result.states.length - 1]).toBe('idle');
    // Hangup-Signal wurde gesendet
    expect(result.signals.some((s: any) => s.action === 'hangup')).toBe(true);
  });

  test('eingehender Offer wechselt zu incoming', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const states: string[] = [];
      cm.onStateChange((s) => states.push(s));

      // Fake SDP Offer erstellen
      const pc = new RTCPeerConnection();
      pc.addTransceiver('audio');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pc.close();

      const mockSend = async () => true;
      await cm.handleSignal({
        _t: 'call',
        action: 'offer',
        callType: 'video',
        sdp: offer.sdp!,
      }, mockSend);

      const state = cm.getState();
      const callType = cm.getCallType();
      cm.destroy();
      return { states, state, callType };
    });

    expect(result.states).toContain('incoming');
    expect(result.state).toBe('incoming');
    expect(result.callType).toBe('video');
  });

  test('reject sendet hangup und wechselt zu idle', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const states: string[] = [];
      cm.onStateChange((s) => states.push(s));

      const pc = new RTCPeerConnection();
      pc.addTransceiver('audio');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pc.close();

      const signals: any[] = [];
      const mockSend = async (sig: any) => { signals.push(sig); return true; };
      await cm.handleSignal({
        _t: 'call', action: 'offer', callType: 'audio', sdp: offer.sdp!,
      }, mockSend);

      cm.reject();

      cm.destroy();
      return { states, signals, finalState: states[states.length - 1] };
    });

    expect(result.states).toContain('incoming');
    expect(result.finalState).toBe('idle');
    expect(result.signals.some((s: any) => s.action === 'hangup')).toBe(true);
  });

  test('acceptCall wechselt zu connecting/active', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const states: string[] = [];
      cm.onStateChange((s) => states.push(s));

      const pc = new RTCPeerConnection();
      pc.addTransceiver('audio');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pc.close();

      const signals: any[] = [];
      const mockSend = async (sig: any) => { signals.push(sig); return true; };
      await cm.handleSignal({
        _t: 'call', action: 'offer', callType: 'audio', sdp: offer.sdp!,
      }, mockSend);

      await cm.acceptCall();

      const hasLocalStream = cm.getLocalStream() !== null;
      const sentAnswer = signals.some((s: any) => s.action === 'answer');
      cm.destroy();
      return { states, hasLocalStream, sentAnswer };
    });

    expect(result.states).toContain('incoming');
    expect(result.states).toContain('connecting');
    expect(result.hasLocalStream).toBe(true);
    expect(result.sentAnswer).toBe(true);
  });

  test('Offer im Nicht-idle-Zustand sendet Busy-Hangup', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();

      const signals: any[] = [];
      const mockSend = async (sig: any) => { signals.push(sig); return true; };

      // Ersten Call starten → ringing
      await cm.startCall('audio', mockSend);

      // Zweites Offer kommt rein → sollte busy-hangup senden
      const pc = new RTCPeerConnection();
      pc.addTransceiver('audio');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pc.close();

      await cm.handleSignal({
        _t: 'call', action: 'offer', callType: 'video', sdp: offer.sdp!,
      }, mockSend);

      cm.destroy();
      // Es sollte ein hangup unter den Signalen sein (busy)
      const hangups = signals.filter((s: any) => s.action === 'hangup');
      return { hangupCount: hangups.length };
    });

    expect(result.hangupCount).toBeGreaterThanOrEqual(1);
  });

  test('ICE Candidates werden gepuffert wenn PC noch nicht existiert', async ({ page }) => {
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();

      // ICE vor Offer senden — sollte nicht crashen
      try {
        await cm.handleSignal({
          _t: 'call', action: 'ice', callType: 'audio',
          candidate: { candidate: 'candidate:test', sdpMid: '0', sdpMLineIndex: 0 },
        });
        cm.destroy();
        return { success: true };
      } catch (e: any) {
        cm.destroy();
        return { success: false, error: e.message };
      }
    });

    expect(result.success).toBe(true);
  });

  test('hangup im idle Zustand wird ignoriert', async ({ page }) => {
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();
      const hangupStates: string[] = [];
      cm.onStateChange((s) => hangupStates.push(s));

      cm.hangup();
      // hangup() prueft state === idle → return, keine Aenderung
      const statesAfterHangup = [...hangupStates];

      cm.destroy();
      return { statesAfterHangup: statesAfterHangup.length };
    });

    // hangup() im idle gibt sofort zurueck — keine State-Changes
    expect(result.statesAfterHangup).toBe(0);
  });

  test('toggleMic/toggleCamera funktionieren im aktiven Call', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await setupApp(page);

    const result = await page.evaluate(async () => {
      const { CallManager } = await import('/src/app/lib/call-manager.ts');
      const cm = new CallManager();

      const pc = new RTCPeerConnection();
      pc.addTransceiver('audio');
      pc.addTransceiver('video');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pc.close();

      const mockSend = async () => true;
      await cm.handleSignal({
        _t: 'call', action: 'offer', callType: 'video', sdp: offer.sdp!,
      }, mockSend);
      await cm.acceptCall();

      // Mic toggle
      const micAfterToggle = cm.toggleMic();
      const micEnabled = cm.isMicEnabled();

      // Camera toggle
      const camAfterToggle = cm.toggleCamera();
      const camEnabled = cm.isCameraEnabled();

      cm.destroy();
      return { micAfterToggle, micEnabled, camAfterToggle, camEnabled };
    });

    // Nach toggleMic: Mic ist aus (false)
    expect(result.micAfterToggle).toBe(false);
    expect(result.micEnabled).toBe(false);
    // Nach toggleCamera: Camera ist aus (false)
    expect(result.camAfterToggle).toBe(false);
    expect(result.camEnabled).toBe(false);
  });
});
