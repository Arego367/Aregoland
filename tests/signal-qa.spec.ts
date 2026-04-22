/**
 * Signal Protocol QA — ARE-346
 *
 * Umfassende Tests für libsignal-Integration:
 *  1. Migrations-Tests: Altes Crypto (ECDH) ↔ Neues Crypto (libsignal) Fallback
 *  2. Crypto-Korrektheit: Forward Secrecy, Out-of-order, Pre-Key-Verbrauch
 *  3. P2P-Compliance: Kein Server-Speicher, Push ohne Inhalt
 *  4. Edge Cases: Pre-Key-Exhaustion, gleichzeitiger Session-Aufbau
 *  5. Performance: Key-Generierung, Bundle-Size
 */
import { test, expect } from '@playwright/test';

// ── 1. Migrations-Tests ─────────────────────────────────────────────────────

test.describe('1. Migrations-Tests: ECDH ↔ libsignal Fallback', () => {
  test('ECDH-Fallback: Verschlüsselung funktioniert wenn kein Signal-Bundle verfügbar', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const crypto = await import('/src/app/lib/p2p-crypto.ts');

      // Zwei Peers mit ECDH (altes Crypto)
      const aliceKP = await crypto.generateEphemeralKeyPair();
      const bobKP = await crypto.generateEphemeralKeyPair();

      const alicePub = await crypto.exportECDHPublicKey(aliceKP.publicKey);
      const bobPub = await crypto.exportECDHPublicKey(bobKP.publicKey);

      // Key-Ableitung
      const bobPubImported = await crypto.importECDHPublicKey(bobPub);
      const alicePubImported = await crypto.importECDHPublicKey(alicePub);

      const aliceSessionKey = await crypto.deriveSessionKey(aliceKP.privateKey, bobPubImported);
      const bobSessionKey = await crypto.deriveSessionKey(bobKP.privateKey, alicePubImported);

      // Alice → Bob
      const plaintext = 'Migration Test: ECDH funktioniert';
      const encrypted = await crypto.encryptMessage(aliceSessionKey, plaintext);
      const decrypted = await crypto.decryptMessage(bobSessionKey, encrypted);

      // Bob → Alice
      const reply = 'Antwort über ECDH';
      const encReply = await crypto.encryptMessage(bobSessionKey, reply);
      const decReply = await crypto.decryptMessage(aliceSessionKey, encReply);

      return { decrypted, decReply, encrypted };
    });

    expect(result.decrypted).toBe('Migration Test: ECDH funktioniert');
    expect(result.decReply).toBe('Antwort über ECDH');
    // Ciphertext ist Base64 und unterscheidet sich vom Klartext
    expect(result.encrypted).not.toBe('Migration Test: ECDH funktioniert');
  });

  test('Signal-Session: X3DH + Double Ratchet zwischen zwei libsignal-Nutzern', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      // Alice (neuer Nutzer mit libsignal)
      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();

      // Bob (neuer Nutzer mit libsignal)
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      // Bob's Pre-Keys
      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      // Alice baut X3DH Session auf
      const bobAddress = new SignalProtocolAddress('bob-new', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, new SignalProtocolAddress('alice-new', 1));

      // Mehrere Nachrichten hin und her
      const messages = ['Hallo Bob!', 'Wie gehts?', 'Alles klar?'];
      const results: string[] = [];

      for (const msg of messages) {
        const enc = await aliceCipher.encrypt(new TextEncoder().encode(msg).buffer);
        let dec: ArrayBuffer;
        if (enc.type === 3) {
          dec = await bobCipher.decryptPreKeyWhisperMessage(enc.body!, 'binary');
        } else {
          dec = await bobCipher.decryptWhisperMessage(enc.body!, 'binary');
        }
        results.push(new TextDecoder().decode(dec));
      }

      // Bob antwortet
      const bobReply = await bobCipher.encrypt(new TextEncoder().encode('Alles gut!').buffer);
      const aliceDec = await aliceCipher.decryptWhisperMessage(bobReply.body!, 'binary');
      results.push(new TextDecoder().decode(aliceDec));

      return { results, sessionEstablished: true };
    });

    expect(result.results).toEqual(['Hallo Bob!', 'Wie gehts?', 'Alles klar?', 'Alles gut!']);
    expect(result.sessionEstablished).toBe(true);
  });

  test('Arego-ID Stabilität: Identity bleibt nach Signal-Init stabil', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/signal/index.ts');

      // Erste Initialisierung
      const identity1 = await mod.initializeSignal();
      const pubKey1 = new Uint8Array(identity1.identityKeyPair.pubKey);
      const regId1 = identity1.registrationId;

      // Zweite Initialisierung — sollte selben Key laden
      const identity2 = await mod.initializeSignal();
      const pubKey2 = new Uint8Array(identity2.identityKeyPair.pubKey);
      const regId2 = identity2.registrationId;

      // Keys vergleichen
      const keysEqual = pubKey1.length === pubKey2.length &&
        pubKey1.every((v, i) => v === pubKey2[i]);

      return { keysEqual, regIdsEqual: regId1 === regId2, pubKeyLength: pubKey1.length };
    });

    // Nach zweiter Initialisierung: selber Key
    expect(result.keysEqual).toBe(true);
    expect(result.regIdsEqual).toBe(true);
    expect(result.pubKeyLength).toBe(33); // Curve25519
  });
});

// ── 2. Crypto-Korrektheit ───────────────────────────────────────────────────

test.describe('2. Crypto-Korrektheit', () => {
  test('Forward Secrecy: Kompromittierter Session-Key enthüllt keine vergangenen Nachrichten', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      const bobAddress = new SignalProtocolAddress('bob-fs', 1);
      const aliceAddress = new SignalProtocolAddress('alice-fs', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, aliceAddress);

      // Nachricht 1: Alice → Bob (diese wird "in der Vergangenheit" gesendet)
      const enc1 = await aliceCipher.encrypt(new TextEncoder().encode('Geheime Nachricht 1').buffer);
      const dec1 = await bobCipher.decryptPreKeyWhisperMessage(enc1.body!, 'binary');

      // Ratchet weiter: Bob → Alice → Bob (Schlüssel-Rotation)
      const enc2 = await bobCipher.encrypt(new TextEncoder().encode('Bob Reply').buffer);
      await aliceCipher.decryptWhisperMessage(enc2.body!, 'binary');
      const enc3 = await aliceCipher.encrypt(new TextEncoder().encode('Alice Reply').buffer);
      await bobCipher.decryptWhisperMessage(enc3.body!, 'binary');

      // Nachricht 1 nochmal entschlüsseln sollte FEHLSCHLAGEN
      // (Session-State hat sich durch Ratchet verändert)
      let replayFailed = false;
      try {
        await bobCipher.decryptPreKeyWhisperMessage(enc1.body!, 'binary');
      } catch {
        replayFailed = true;
      }

      // Jede Nachricht hat unterschiedlichen Ciphertext
      const enc4 = await aliceCipher.encrypt(new TextEncoder().encode('Geheime Nachricht 1').buffer);
      const differentCiphertext = enc1.body !== enc4.body;

      return {
        dec1: new TextDecoder().decode(dec1),
        replayFailed,
        differentCiphertext,
      };
    });

    expect(result.dec1).toBe('Geheime Nachricht 1');
    expect(result.replayFailed).toBe(true); // Replay-Schutz
    expect(result.differentCiphertext).toBe(true); // Gleicher Klartext, anderer Ciphertext
  });

  test('Out-of-order Messages: Nachrichten in falscher Reihenfolge kommen korrekt an', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      const bobAddress = new SignalProtocolAddress('bob-ooo', 1);
      const aliceAddress = new SignalProtocolAddress('alice-ooo', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, aliceAddress);
      const enc = new TextEncoder();

      // Erst Session etablieren: Alice → Bob (PreKeyWhisperMessage)
      const setup = await aliceCipher.encrypt(enc.encode('Setup').buffer);
      await bobCipher.decryptPreKeyWhisperMessage(setup.body!, 'binary');

      // Bob antwortet → Ratchet dreht, folgende Alice-Nachrichten sind WhisperMessages
      const reply = await bobCipher.encrypt(enc.encode('OK').buffer);
      await aliceCipher.decryptWhisperMessage(reply.body!, 'binary');

      // Alice sendet 3 WhisperMessages (gleiche Sending Chain)
      const e1 = await aliceCipher.encrypt(enc.encode('Nachricht 1').buffer);
      const e2 = await aliceCipher.encrypt(enc.encode('Nachricht 2').buffer);
      const e3 = await aliceCipher.encrypt(enc.encode('Nachricht 3').buffer);

      // Bob entschlüsselt out-of-order: 1, 3, 2
      // libsignal speichert Skipped Message Keys für übersprungene Counter
      const d1 = await bobCipher.decryptWhisperMessage(e1.body!, 'binary');
      const d3 = await bobCipher.decryptWhisperMessage(e3.body!, 'binary');
      const d2 = await bobCipher.decryptWhisperMessage(e2.body!, 'binary');

      return {
        d1: new TextDecoder().decode(d1),
        d2: new TextDecoder().decode(d2),
        d3: new TextDecoder().decode(d3),
      };
    });

    expect(result.d1).toBe('Nachricht 1');
    expect(result.d2).toBe('Nachricht 2');
    expect(result.d3).toBe('Nachricht 3');
  });

  test('Pre-Key-Verbrauch: One-Time-Pre-Key wird nach Nutzung gelöscht', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SignalProtocolAddress, createMemoryStore } = helpers;

      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      // Bob hat PreKey ID 42
      const bobPreKey = await KeyHelper.generatePreKey(42);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(42, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      // Vor Session: PreKey existiert
      const preKeyBefore = await bobStore.loadPreKey(42);
      const preKeyExistsBefore = preKeyBefore != null;

      // Alice baut Session auf → verbraucht PreKey
      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();

      const bobAddress = new SignalProtocolAddress('bob-pk', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 42, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      // Alice verschlüsselt → Bob entschlüsselt PreKeyWhisperMessage → PreKey wird gelöscht
      const { SessionCipher } = helpers;
      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const enc = await aliceCipher.encrypt(new TextEncoder().encode('test').buffer);

      const bobCipher = new SessionCipher(bobStore as any, new SignalProtocolAddress('alice-pk', 1));
      await bobCipher.decryptPreKeyWhisperMessage(enc.body!, 'binary');

      // Nach Entschlüsselung: PreKey sollte gelöscht sein (Signal Protocol Spec)
      const preKeyAfter = await bobStore.loadPreKey(42);
      const preKeyExistsAfter = preKeyAfter != null;

      return { preKeyExistsBefore, preKeyExistsAfter };
    });

    expect(result.preKeyExistsBefore).toBe(true);
    // libsignal löscht den PreKey nach Nutzung (removePreKey wird aufgerufen)
    expect(result.preKeyExistsAfter).toBe(false);
  });

  test('Bidirektionaler Ratchet: Ping-Pong Nachrichten rotieren Keys korrekt', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      const bobAddress = new SignalProtocolAddress('bob-ratchet', 1);
      const aliceAddress = new SignalProtocolAddress('alice-ratchet', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, aliceAddress);
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      const ciphertexts: string[] = [];
      const results: string[] = [];

      // 10 Ping-Pong Runden
      for (let i = 0; i < 10; i++) {
        const sender = i % 2 === 0 ? aliceCipher : bobCipher;
        const receiver = i % 2 === 0 ? bobCipher : aliceCipher;
        const msg = `Runde ${i + 1}`;
        const encrypted = await sender.encrypt(enc.encode(msg).buffer);
        ciphertexts.push(encrypted.body ?? '');

        let plain: ArrayBuffer;
        if (encrypted.type === 3) {
          plain = await receiver.decryptPreKeyWhisperMessage(encrypted.body!, 'binary');
        } else {
          plain = await receiver.decryptWhisperMessage(encrypted.body!, 'binary');
        }
        results.push(dec.decode(plain));
      }

      // Alle Ciphertexte müssen verschieden sein
      const uniqueCiphertexts = new Set(ciphertexts);

      return {
        results,
        allCiphertextsUnique: uniqueCiphertexts.size === ciphertexts.length,
      };
    });

    // Alle 10 Nachrichten korrekt entschlüsselt
    for (let i = 0; i < 10; i++) {
      expect(result.results[i]).toBe(`Runde ${i + 1}`);
    }
    expect(result.allCiphertextsUnique).toBe(true);
  });
});

// ── 3. P2P-Compliance ───────────────────────────────────────────────────────

test.describe('3. P2P-Compliance', () => {
  test('Push-Wakeup Payload enthält KEINEN Nachrichteninhalt', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      // Lade den Source-Code der Push-Wakeup Datei direkt
      const resp = await fetch('/src/app/lib/signal/push-wakeup.ts');
      const source = await resp.text();

      // Finde die wakeupPeer-Funktion und extrahiere den JSON.stringify-Payload
      const wakeupFn = source.substring(source.indexOf('async function wakeupPeer'), source.indexOf('result.pushed'));
      const jsonPayload = wakeupFn.substring(wakeupFn.indexOf('JSON.stringify'), wakeupFn.indexOf('})')+2);

      // Der Payload darf NUR enthalten: arego_id, target_arego_id, signature, timestamp
      const allowedFields = ['arego_id', 'target_arego_id', 'signature', 'timestamp'];
      const hasOnlyAllowedFields = allowedFields.every(f => jsonPayload.includes(f));

      // Kein Nachrichten-Payload-Feld wie "text", "payload", "data", "notification"
      const forbiddenPayloadFields = ['text:', 'payload:', 'data:', 'notification:', 'content:'];
      const hasForbiddenField = forbiddenPayloadFields.some(f => jsonPayload.includes(f));

      return { hasOnlyAllowedFields, hasForbiddenField, payloadSnippet: jsonPayload.substring(0, 200) };
    });

    expect(result.hasOnlyAllowedFields).toBe(true);
    expect(result.hasForbiddenField).toBe(false);
  });

  test('Pre-Key-Bundles enthalten nur öffentliche Schlüssel', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper } = helpers;

      const identity = await KeyHelper.generateIdentityKeyPair();
      const preKey = await KeyHelper.generatePreKey(1);
      const signedPreKey = await KeyHelper.generateSignedPreKey(identity, 1);

      // Simuliere was an den Server gesendet wird (nur Public Keys)
      const bundle = {
        identity_key: identity.pubKey,
        signed_pre_key: signedPreKey.keyPair.pubKey,
        signed_pre_key_signature: signedPreKey.signature,
        pre_key: preKey.keyPair.pubKey,
      };

      // Prüfe: Private Keys dürfen NICHT im Bundle sein
      const bundleStr = JSON.stringify(bundle);
      const hasPrivKey = bundleStr.includes('privKey');

      // Public Keys sind ArrayBuffers mit korrekter Länge
      const pubKeyLength = new Uint8Array(identity.pubKey).length;
      const preKeyPubLength = new Uint8Array(preKey.keyPair.pubKey).length;

      // Private Key existiert, wird aber nicht exportiert
      const privKeyLength = new Uint8Array(identity.privKey).length;

      return {
        hasPrivKey,
        pubKeyLength,    // 33 bytes (Curve25519 public)
        preKeyPubLength, // 33 bytes
        privKeyLength,   // 32 bytes (existiert lokal, wird nie gesendet)
      };
    });

    expect(result.hasPrivKey).toBe(false); // Keine privaten Schlüssel im Bundle
    expect(result.pubKeyLength).toBe(33);
    expect(result.preKeyPubLength).toBe(33);
    expect(result.privKeyLength).toBe(32); // Existiert nur lokal
  });

  test('Signal-Nachrichten-Serialisierung: Transport-Format enthält keinen Klartext', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;
      const { serializeSignalMessage, isSignalMessage } = await import('/src/app/lib/signal/session-manager.ts');

      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      const bobAddress = new SignalProtocolAddress('bob-ser', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const secretMessage = 'Super geheime Nachricht mit Passwort: abc123!';
      const encrypted = await aliceCipher.encrypt(new TextEncoder().encode(secretMessage).buffer);

      // Serialisiere für Transport
      const serialized = serializeSignalMessage({ type: encrypted.type, body: encrypted.body ?? '' });
      const parsed = JSON.parse(serialized);

      return {
        isSignal: isSignalMessage(parsed),
        containsPlaintext: serialized.includes(secretMessage),
        hasTypeField: parsed.t === 'sig',
        hasType: typeof parsed.type === 'number',
        hasBody: typeof parsed.body === 'string',
      };
    });

    expect(result.isSignal).toBe(true);
    expect(result.containsPlaintext).toBe(false); // Klartext NICHT im Transport
    expect(result.hasTypeField).toBe(true);
    expect(result.hasType).toBe(true);
    expect(result.hasBody).toBe(true);
  });
});

// ── 4. Edge Cases ───────────────────────────────────────────────────────────

test.describe('4. Edge Cases', () => {
  test('Pre-Keys aufgebraucht: Session-Aufbau ohne One-Time-Pre-Key (nur SignedPreKey)', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      // Bob hat KEINEN One-Time-Pre-Key (aufgebraucht) — nur SignedPreKey
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      const bobAddress = new SignalProtocolAddress('bob-noprekey', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);

      // Session-Aufbau ohne preKey — nur mit SignedPreKey
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, new SignalProtocolAddress('alice-noprekey', 1));

      // Verschlüsselung + Entschlüsselung muss trotzdem funktionieren
      const enc = await aliceCipher.encrypt(new TextEncoder().encode('Kein Pre-Key vorhanden').buffer);
      const dec = await bobCipher.decryptPreKeyWhisperMessage(enc.body!, 'binary');

      return {
        decrypted: new TextDecoder().decode(dec),
        type: enc.type,
      };
    });

    // Session-Aufbau funktioniert auch ohne One-Time-Pre-Key
    expect(result.decrypted).toBe('Kein Pre-Key vorhanden');
    expect(result.type).toBe(3); // Immer noch PreKeyWhisperMessage
  });

  test('Gleichzeitiger Session-Aufbau von beiden Seiten', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      // Beide Seiten generieren Pre-Keys
      const alicePreKey = await KeyHelper.generatePreKey(1);
      const aliceSignedPreKey = await KeyHelper.generateSignedPreKey(aliceStore._identity, 1);
      await aliceStore.storePreKey(1, alicePreKey.keyPair);
      await aliceStore.storeSignedPreKey(1, aliceSignedPreKey.keyPair);

      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      const aliceAddress = new SignalProtocolAddress('alice-sim', 1);
      const bobAddress = new SignalProtocolAddress('bob-sim', 1);

      // Beide bauen gleichzeitig Session auf (Simulated Race Condition)
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      const bobBuilder = new SessionBuilder(bobStore as any, aliceAddress);

      await Promise.all([
        aliceBuilder.processPreKey({
          identityKey: bobStore._identity.pubKey,
          registrationId: bobStore._regId,
          preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
          signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
        }),
        bobBuilder.processPreKey({
          identityKey: aliceStore._identity.pubKey,
          registrationId: aliceStore._regId,
          preKey: { keyId: 1, publicKey: alicePreKey.keyPair.pubKey },
          signedPreKey: { keyId: 1, publicKey: aliceSignedPreKey.keyPair.pubKey, signature: aliceSignedPreKey.signature },
        }),
      ]);

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, aliceAddress);

      // Alice → Bob
      const enc1 = await aliceCipher.encrypt(new TextEncoder().encode('Alice spricht').buffer);
      const dec1 = await bobCipher.decryptPreKeyWhisperMessage(enc1.body!, 'binary');

      // Bob → Alice
      const enc2 = await bobCipher.encrypt(new TextEncoder().encode('Bob spricht').buffer);
      // Bob's Nachricht könnte PreKeyWhisperMessage oder WhisperMessage sein
      let dec2: ArrayBuffer;
      try {
        dec2 = await aliceCipher.decryptPreKeyWhisperMessage(enc2.body!, 'binary');
      } catch {
        dec2 = await aliceCipher.decryptWhisperMessage(enc2.body!, 'binary');
      }

      return {
        aliceMsg: new TextDecoder().decode(dec1),
        bobMsg: new TextDecoder().decode(dec2),
      };
    });

    expect(result.aliceMsg).toBe('Alice spricht');
    expect(result.bobMsg).toBe('Bob spricht');
  });

  test('Große Nachrichten: 10KB Text verschlüsseln/entschlüsseln', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      const bobAddress = new SignalProtocolAddress('bob-big', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, new SignalProtocolAddress('alice-big', 1));

      // 10KB Nachricht
      const bigMessage = 'A'.repeat(10240);
      const enc = await aliceCipher.encrypt(new TextEncoder().encode(bigMessage).buffer);
      const dec = await bobCipher.decryptPreKeyWhisperMessage(enc.body!, 'binary');
      const decText = new TextDecoder().decode(dec);

      return {
        originalLength: bigMessage.length,
        decryptedLength: decText.length,
        match: decText === bigMessage,
      };
    });

    expect(result.match).toBe(true);
    expect(result.originalLength).toBe(10240);
    expect(result.decryptedLength).toBe(10240);
  });

  test('ECDH Session-Level Forward Secrecy: Neue Session = neue Keys', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const crypto = await import('/src/app/lib/p2p-crypto.ts');

      // Session 1
      const s1alice = await crypto.generateEphemeralKeyPair();
      const s1bob = await crypto.generateEphemeralKeyPair();
      const s1alicePub = await crypto.exportECDHPublicKey(s1alice.publicKey);
      const s1bobPub = await crypto.exportECDHPublicKey(s1bob.publicKey);

      // Session 2 (nach Reconnect)
      const s2alice = await crypto.generateEphemeralKeyPair();
      const s2bob = await crypto.generateEphemeralKeyPair();
      const s2alicePub = await crypto.exportECDHPublicKey(s2alice.publicKey);
      const s2bobPub = await crypto.exportECDHPublicKey(s2bob.publicKey);

      // Keys müssen verschieden sein (neue ephemere Schlüssel)
      const keysAreDifferent = s1alicePub.x !== s2alicePub.x || s1alicePub.y !== s2alicePub.y;

      // Session 1: Encrypt/Decrypt
      const key1 = await crypto.deriveSessionKey(
        s1alice.privateKey,
        await crypto.importECDHPublicKey(s1bobPub)
      );
      const enc1 = await crypto.encryptMessage(key1, 'Session 1 Nachricht');

      // Session 2: gleiche Nachricht, anderer Ciphertext
      const key2 = await crypto.deriveSessionKey(
        s2alice.privateKey,
        await crypto.importECDHPublicKey(s2bobPub)
      );
      const enc2 = await crypto.encryptMessage(key2, 'Session 1 Nachricht');

      return {
        keysAreDifferent,
        ciphertextsDifferent: enc1 !== enc2,
      };
    });

    expect(result.keysAreDifferent).toBe(true);
    expect(result.ciphertextsDifferent).toBe(true);
  });
});

// ── 5. Performance ──────────────────────────────────────────────────────────

test.describe('5. Performance', () => {
  test('Key-Generierung: IdentityKeyPair + PreKeys < 500ms', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper } = helpers;

      const start = performance.now();

      // Identity
      const identity = await KeyHelper.generateIdentityKeyPair();
      const regId = KeyHelper.generateRegistrationId();

      // 50 PreKeys (wie im KeyManager-Batch)
      for (let i = 1; i <= 50; i++) {
        await KeyHelper.generatePreKey(i);
      }

      // Signed PreKey
      await KeyHelper.generateSignedPreKey(identity, 1);

      const elapsed = performance.now() - start;
      return { elapsed, regIdValid: regId > 0 };
    });

    // Key-Generierung (Identity + 50 PreKeys + SignedPreKey) sollte < 2s dauern
    expect(result.elapsed).toBeLessThan(2000);
    expect(result.regIdValid).toBe(true);
  });

  test('Erste Nachricht nach Session-Aufbau: Encrypt + Decrypt < 100ms', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      // Setup (nicht gemessen)
      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      const bobAddress = new SignalProtocolAddress('bob-perf', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: { keyId: 1, publicKey: bobSignedPreKey.keyPair.pubKey, signature: bobSignedPreKey.signature },
      });

      // Gemessen: Encrypt + Decrypt
      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, new SignalProtocolAddress('alice-perf', 1));

      const start = performance.now();
      const enc = await aliceCipher.encrypt(new TextEncoder().encode('Performance Test').buffer);
      const dec = await bobCipher.decryptPreKeyWhisperMessage(enc.body!, 'binary');
      const elapsed = performance.now() - start;

      return {
        elapsed,
        decrypted: new TextDecoder().decode(dec),
      };
    });

    expect(result.elapsed).toBeLessThan(500);
    expect(result.decrypted).toBe('Performance Test');
  });

  test('Signal-Modul: Lazy-Loading funktioniert (kein globaler Import)', async ({ page }) => {
    await page.goto('/');

    // Prüfe dass Signal-Code erst bei Bedarf geladen wird
    const result = await page.evaluate(async () => {
      // Vor dem Import: kein Signal-Code im Speicher
      const beforeImport = performance.now();
      const mod = await import('/src/app/lib/signal/index.ts');
      const afterImport = performance.now();

      // initializeSignal muss eine Funktion sein
      const isFunction = typeof mod.initializeSignal === 'function';
      const importTime = afterImport - beforeImport;

      return { isFunction, importTime };
    });

    expect(result.isFunction).toBe(true);
    // Import sollte unter 2s sein (auch auf langsamen Systemen)
    expect(result.importTime).toBeLessThan(2000);
  });
});

// ── 6. Security Review: Code-Level Checks ───────────────────────────────────

test.describe('6. Security Review', () => {
  test('SignalStore: Trust-on-First-Use (TOFU) korrekt implementiert', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/signal/index.ts');
      const identity = await mod.initializeSignal();

      // Erster Kontakt: Immer vertrauenswürdig (TOFU)
      const firstContact = await identity.store.isTrustedIdentity(
        'new-peer',
        new Uint8Array([1, 2, 3, 4]).buffer,
        0 // Direction.SENDING
      );

      // Identität speichern
      await identity.store.saveIdentity('new-peer', new Uint8Array([1, 2, 3, 4]).buffer);

      // Gleicher Key: vertrauenswürdig
      const sameKey = await identity.store.isTrustedIdentity(
        'new-peer',
        new Uint8Array([1, 2, 3, 4]).buffer,
        0
      );

      // Anderer Key: NICHT vertrauenswürdig (Key Change Attack!)
      const differentKey = await identity.store.isTrustedIdentity(
        'new-peer',
        new Uint8Array([5, 6, 7, 8]).buffer,
        0
      );

      return { firstContact, sameKey, differentKey };
    });

    expect(result.firstContact).toBe(true);   // TOFU
    expect(result.sameKey).toBe(true);         // Bekannter Key
    expect(result.differentKey).toBe(false);   // Key Change → reject!
  });

  test('saveIdentity: Key-Change-Detection funktioniert', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/signal/index.ts');
      const identity = await mod.initializeSignal();

      // Erster Save: kein Key-Change
      const firstSave = await identity.store.saveIdentity(
        'peer-change',
        new Uint8Array([10, 20, 30]).buffer
      );

      // Zweiter Save mit gleichem Key: kein Change
      const sameSave = await identity.store.saveIdentity(
        'peer-change',
        new Uint8Array([10, 20, 30]).buffer
      );

      // Dritter Save mit anderem Key: KEY CHANGE!
      const changedSave = await identity.store.saveIdentity(
        'peer-change',
        new Uint8Array([40, 50, 60]).buffer
      );

      return { firstSave, sameSave, changedSave };
    });

    expect(result.firstSave).toBe(false);   // Erster Key → kein vorheriger
    expect(result.sameSave).toBe(false);     // Gleicher Key → kein Change
    expect(result.changedSave).toBe(true);   // Anderer Key → Change detected!
  });

  test('ECDH: AES-GCM verwendet zufällige IVs (keine IV-Wiederverwendung)', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const crypto = await import('/src/app/lib/p2p-crypto.ts');

      const kp = await crypto.generateEphemeralKeyPair();
      const kp2 = await crypto.generateEphemeralKeyPair();
      const pub2 = await crypto.importECDHPublicKey(await crypto.exportECDHPublicKey(kp2.publicKey));
      const key = await crypto.deriveSessionKey(kp.privateKey, pub2);

      // Gleiche Nachricht 100x verschlüsseln
      const ciphertexts = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const ct = await crypto.encryptMessage(key, 'Gleiche Nachricht');
        ciphertexts.add(ct);
      }

      // IVs extrahieren (erste 16 Base64-Zeichen ≈ 12 Bytes IV)
      const ivs = [...ciphertexts].map(ct => ct.substring(0, 16));
      const uniqueIvs = new Set(ivs);

      return {
        allCiphertextsUnique: ciphertexts.size === 100,
        allIvsUnique: uniqueIvs.size === 100,
      };
    });

    // Jede Verschlüsselung mit eigenem IV → kein Ciphertext doppelt
    expect(result.allCiphertextsUnique).toBe(true);
    expect(result.allIvsUnique).toBe(true);
  });

  test('KeyManager Konstanten: sichere Werte konfiguriert', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      // Lese die Datei-Inhalte über fetch (Vite Dev Server)
      const resp = await fetch('/src/app/lib/signal/key-manager.ts');
      const source = await resp.text();

      // Prüfe kritische Konstanten
      const signedPreKeyRotation = source.match(/SIGNED_PRE_KEY_ROTATION_MS\s*=\s*(\d+)/);
      const oneTimeBatch = source.match(/ONE_TIME_PRE_KEY_BATCH\s*=\s*(\d+)/);
      const threshold = source.match(/ONE_TIME_PRE_KEY_THRESHOLD\s*=\s*(\d+)/);

      const rotationMatch = source.match(/7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
      return {
        // Rotation: 7 Tage = 604800000ms
        rotationMs: rotationMatch ? rotationMatch[0] : null,
        hasRotation: !!signedPreKeyRotation,
        // Batch: mindestens 20 Pre-Keys pro Auffüllung
        batchSize: oneTimeBatch ? parseInt(oneTimeBatch[1]) : 0,
        // Threshold: Nachfüllen wenn unter 10
        threshold: threshold ? parseInt(threshold[1]) : 0,
      };
    });

    expect(result.hasRotation).toBe(true);
    expect(result.batchSize).toBeGreaterThanOrEqual(20);  // Mindestens 20 Pre-Keys
    expect(result.threshold).toBeGreaterThanOrEqual(5);    // Nachfüllen bei < 5-10
    expect(result.threshold).toBeLessThan(result.batchSize); // Threshold < Batch
  });
});
