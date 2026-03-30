import { test, expect } from '@playwright/test';

/**
 * Testet die P2P Message-Delivery-Kette direkt im Browser.
 * Simuliert den kompletten Flow: P2PManager → send() → onmessage → messageCb
 */
test('P2PManager Message-Delivery-Kette', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`${err.message}\n${err.stack}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    // P2PManager direkt importieren
    const { P2PManager } = await import('/src/app/lib/p2p-manager.ts');
    const { encryptMessage, decryptMessage, generateEphemeralKeyPair, deriveSessionKey } =
      await import('/src/app/lib/p2p-crypto.ts');

    const log: string[] = [];
    const received: any[] = [];

    // Manager erstellen
    const mgr = new P2PManager();

    // Callbacks registrieren
    mgr.onMessage((roomId, msg) => {
      log.push(`onMessage: roomId=${roomId} text=${msg.text} senderMsgId=${msg.senderMsgId}`);
      received.push(msg);
    });

    mgr.onStatusChange((roomId, status, error) => {
      log.push(`onStatusChange: ${roomId} → ${status} ${error ?? ''}`);
    });

    mgr.onContactDiscovered((info) => {
      log.push(`onContactDiscovered: ${info.aregoId} ${info.displayName}`);
    });

    mgr.onCallSignal((roomId, signal) => {
      log.push(`onCallSignal: ${roomId} ${signal.action}`);
    });

    mgr.onContactRemoved((roomId, aregoId) => {
      log.push(`onContactRemoved: ${roomId} ${aregoId}`);
    });

    mgr.onReadReceipt((roomId, msgIds) => {
      log.push(`onReadReceipt: ${roomId} [${msgIds.join(',')}]`);
    });

    // Prüfe ob alle Callbacks gesetzt sind
    log.push(`messageCb set: ${!!(mgr as any).messageCb}`);
    log.push(`statusCb set: ${!!(mgr as any).statusCb}`);
    log.push(`contactCb set: ${!!(mgr as any).contactCb}`);
    log.push(`callSignalCb set: ${!!(mgr as any).callSignalCb}`);
    log.push(`contactRemovedCb set: ${!!(mgr as any).contactRemovedCb}`);
    log.push(`readReceiptCb set: ${!!(mgr as any).readReceiptCb}`);

    // Simuliere DataChannel-Nachricht: verschlüssel und entschlüssel manuell
    try {
      // Session-Key generieren (wie im echten Handshake)
      const kp1 = await generateEphemeralKeyPair();
      const kp2 = await generateEphemeralKeyPair();
      const { exportECDHPublicKey, importECDHPublicKey } =
        await import('/src/app/lib/p2p-crypto.ts');
      const pub1 = await exportECDHPublicKey(kp1.publicKey);
      const pub2 = await exportECDHPublicKey(kp2.publicKey);
      const importedPub2 = await importECDHPublicKey(pub2);
      const importedPub1 = await importECDHPublicKey(pub1);
      const sessionKey1 = await deriveSessionKey(kp1.privateKey, importedPub2);
      const sessionKey2 = await deriveSessionKey(kp2.privateKey, importedPub1);

      // Nachricht verschlüsseln (Sender-Seite)
      const payload = JSON.stringify({ _t: 'msg', id: 'test-msg-001', text: 'Hallo Welt' });
      const ct = await encryptMessage(sessionKey1, payload);
      log.push(`encrypted: ct length = ${ct.length}`);

      // Entschlüsseln (Empfänger-Seite)
      const decrypted = await decryptMessage(sessionKey2, ct);
      log.push(`decrypted: ${decrypted}`);

      const parsed = JSON.parse(decrypted);
      log.push(`parsed._t=${parsed._t} parsed.id=${parsed.id} parsed.text=${parsed.text}`);

      // Simuliere was ch.onmessage intern tut:
      // Das ist der Code aus bindChannel
      const msg = { ct }; // Das ist was über den DataChannel kommt (JSON.stringify({ct}))
      const text = await decryptMessage(sessionKey2, msg.ct);
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // msg.t ist undefined (reguläre Nachricht) → else-Block
      if (msg.t === undefined) {
        try {
          const innerParsed = JSON.parse(text);
          if (innerParsed._t === 'msg' && innerParsed.id) {
            // Das ist der Pfad für reguläre Nachrichten
            log.push(`Would call messageCb with text="${innerParsed.text}" senderMsgId="${innerParsed.id}"`);
          }
        } catch {
          log.push('JSON parse failed for inner text');
        }
      }

    } catch (e: any) {
      log.push(`CRYPTO ERROR: ${e.message}\n${e.stack}`);
    }

    return { log, received };
  });

  console.log('=== DELIVERY TEST LOG ===');
  for (const l of result.log) console.log(l);

  console.log('\n=== PAGE ERRORS ===');
  for (const e of errors) console.log(e);

  // Alle Callbacks müssen gesetzt sein
  expect(result.log).toContain('messageCb set: true');
  expect(result.log).toContain('statusCb set: true');
  expect(result.log).toContain('contactCb set: true');

  // Crypto muss funktionieren
  expect(result.log.some(l => l.includes('parsed._t=msg'))).toBe(true);
  expect(result.log.some(l => l.includes('parsed.text=Hallo Welt'))).toBe(true);
});
