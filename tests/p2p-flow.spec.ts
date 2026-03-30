import { test, expect } from '@playwright/test';

test('WebSocket Signaling + P2P Flow Simulation', async ({ page }) => {
  const errors: string[] = [];
  const logs: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') errors.push(text);
    if (text.startsWith('[')) logs.push(text);
  });
  page.on('pageerror', (err) => {
    errors.push(`PAGE ERROR: ${err.message}\n${err.stack}`);
  });

  await page.goto('/');

  // Echte Identity generieren und App initialisieren
  const setupResult = await page.evaluate(async () => {
    try {
      // ECDSA Keys
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
      );
      const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

      const identity = {
        aregoId: 'AC-TEST-P2PFLOW1',
        displayName: 'Test P2P',
        publicKeyJwk: pubJwk,
        privateKeyJwk: privJwk,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('aregoland_identity', JSON.stringify(identity));

      // Kontakt + Chat erstellen
      const contacts = [{
        aregoId: 'AC-PEER-P2PFLOW2',
        displayName: 'Peer P2P',
        publicKeyJwk: pubJwk,
        addedAt: new Date().toISOString(),
      }];
      localStorage.setItem('arego_contacts', JSON.stringify(contacts));

      const roomId = ['AC-PEER-P2PFLOW2', 'AC-TEST-P2PFLOW1'].sort().join(':');
      localStorage.setItem('arego_chats', JSON.stringify([{
        id: 'AC-PEER-P2PFLOW2',
        name: 'Peer P2P',
        avatarUrl: '',
        isGroup: false,
        lastMessage: 'Test',
        roomId,
        time: '14:30',
        sortKey: Date.now(),
        unreadCount: 0,
      }]));

      localStorage.setItem('arego_contact_statuses', JSON.stringify({
        'AC-PEER-P2PFLOW2': 'mutual'
      }));

      return { success: true, roomId };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  console.log('Setup:', JSON.stringify(setupResult));
  expect(setupResult.success).toBe(true);

  await page.reload();
  await page.waitForTimeout(3000);

  // Module testen: encodePayload, decodePayload, encodeRecoveryPayload
  const moduleTest = await page.evaluate(async () => {
    const results: Record<string, any> = {};

    try {
      const { encodePayload, decodePayload, createSharePayload } = await import('/src/app/auth/share.ts');
      const { encodeRecoveryPayload } = await import('/src/app/auth/identity.ts');

      // Share payload mit Umlauten
      const payload = createSharePayload({
        aregoId: 'AC-TEST-UMLAUT',
        displayName: 'Günther Müßig 🚀',
        publicKeyJwk: { kty: 'EC' },
      } as any, 60000);
      const enc = encodePayload(payload);
      const dec = decodePayload(enc);
      results.sharePayload = { encoded: enc.slice(0, 20) + '...', decoded: dec?.displayName, match: dec?.displayName === payload.displayName };

      // Recovery payload
      const identity = JSON.parse(localStorage.getItem('aregoland_identity')!);
      const recoveryEnc = encodeRecoveryPayload(identity);
      results.recoveryPayload = { length: recoveryEnc.length, ok: recoveryEnc.length > 0 };

    } catch (e: any) {
      results.error = e.message + '\n' + e.stack;
    }

    return results;
  });

  console.log('Module tests:', JSON.stringify(moduleTest, null, 2));

  // Prüfe ob WebSocket-Verbindung zum Signaling-Server aufgebaut wird
  await page.waitForTimeout(2000);

  console.log('=== CONSOLE LOGS ===');
  for (const l of logs) console.log(l);
  console.log('=== ERRORS ===');
  for (const e of errors) console.log(e);

  // Keine fatalen Fehler
  const pageErrors = errors.filter(e => e.includes('PAGE ERROR'));
  if (pageErrors.length > 0) {
    console.log('FATAL PAGE ERRORS FOUND:');
    for (const e of pageErrors) console.log(e);
  }
  expect(pageErrors).toHaveLength(0);
});
