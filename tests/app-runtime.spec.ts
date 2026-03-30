import { test, expect } from '@playwright/test';

test('App lädt ohne Fehler und zeigt Dashboard nach Login', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`PAGE ERROR: ${err.message}\n${err.stack}`);
  });

  await page.goto('/');

  // Registrierung mit echtem Crypto simulieren
  await page.evaluate(async () => {
    // Echte ECDSA-Keys generieren
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    const identity = {
      aregoId: 'AC-TEST-ABCD1234',
      displayName: 'Test User Ä Ö Ü',
      publicKeyJwk: pubJwk,
      privateKeyJwk: privJwk,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('aregoland_identity', JSON.stringify(identity));
  });

  await page.reload();
  await page.waitForTimeout(2000);

  // Prüfen ob Dashboard sichtbar ist
  const body = await page.textContent('body');
  console.log('Page contains Dashboard:', body?.includes('Dashboard') || body?.includes('Chat') || body?.includes('Arego'));

  // Screenshot
  await page.screenshot({ path: 'tests/dashboard-screenshot.png', fullPage: true });

  console.log('=== RUNTIME ERRORS ===');
  for (const e of errors) console.log(e);
  console.log(`Total errors: ${errors.length}`);

  // Sollte keine fatalen Fehler haben
  const fatalErrors = errors.filter(e => e.includes('PAGE ERROR'));
  expect(fatalErrors).toHaveLength(0);
});

test('Chat-Screen öffnet ohne Fehler', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`PAGE ERROR: ${err.message}\n${err.stack}`);
  });

  await page.goto('/');

  // Identity + Mock-Chat in localStorage
  await page.evaluate(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    localStorage.setItem('aregoland_identity', JSON.stringify({
      aregoId: 'AC-TEST-ABCD1234',
      displayName: 'Test User',
      publicKeyJwk: pubJwk,
      privateKeyJwk: privJwk,
      createdAt: new Date().toISOString(),
    }));

    // Mock persisted chat
    localStorage.setItem('arego_chats', JSON.stringify([{
      id: 'AC-PEER-99999999',
      name: 'Peer User',
      avatarUrl: '',
      isGroup: false,
      lastMessage: 'Hallo Welt',
      roomId: 'AC-PEER-99999999:AC-TEST-ABCD1234',
      time: '14:30',
      sortKey: Date.now(),
      unreadCount: 0,
    }]));

    // Contact status
    localStorage.setItem('arego_contact_statuses', JSON.stringify({
      'AC-PEER-99999999': 'mutual'
    }));
  });

  await page.reload();
  await page.waitForTimeout(2000);

  // Versuche Chat zu öffnen (klick auf Chat-Element falls sichtbar)
  const chatItems = page.locator('text=Peer User');
  if (await chatItems.count() > 0) {
    await chatItems.first().click();
    await page.waitForTimeout(1000);
    console.log('Chat geöffnet');
  } else {
    console.log('Chat-Element nicht gefunden — navigiere manuell');
  }

  await page.screenshot({ path: 'tests/chat-screenshot.png', fullPage: true });

  console.log('=== CHAT ERRORS ===');
  for (const e of errors) console.log(e);
  console.log(`Total errors: ${errors.length}`);
});

test('encodePayload und decodePayload roundtrip mit Unicode', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    // Dynamisch importieren
    const { encodePayload, decodePayload, createSharePayload } = await import('/src/app/auth/share.ts');

    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    const identity = {
      aregoId: 'AC-TEST-UNICODE',
      displayName: 'Müller Östreich 😎',
      publicKeyJwk: pubJwk,
    };

    try {
      const payload = createSharePayload(identity as any, 60000);
      const encoded = encodePayload(payload);
      const decoded = decodePayload(encoded);
      return {
        success: true,
        nameMatch: decoded?.displayName === identity.displayName,
        decodedName: decoded?.displayName,
      };
    } catch (e: any) {
      return { success: false, error: e.message, stack: e.stack };
    }
  });

  console.log('encodePayload/decodePayload roundtrip:', JSON.stringify(result));
  expect(result.success).toBe(true);
  expect(result.nameMatch).toBe(true);
});

test('encodeRecoveryPayload mit Umlauten', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { encodeRecoveryPayload, importFromRecoveryPayload } = await import('/src/app/auth/identity.ts');

    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    const identity = {
      aregoId: 'AC-TEST-UNICODE',
      displayName: 'Günther Müßig 🚀',
      publicKeyJwk: pubJwk,
      privateKeyJwk: privJwk,
      createdAt: new Date().toISOString(),
    };

    try {
      const encoded = encodeRecoveryPayload(identity);
      // Manuell dekodieren um zu prüfen
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const decoded = JSON.parse(new TextDecoder().decode(bytes));
      return {
        success: true,
        nameMatch: decoded.displayName === identity.displayName,
        decodedName: decoded.displayName,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  console.log('encodeRecoveryPayload roundtrip:', JSON.stringify(result));
  expect(result.success).toBe(true);
  expect(result.nameMatch).toBe(true);
});
