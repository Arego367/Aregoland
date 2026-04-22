/**
 * Signal Protocol Integration Tests
 *
 * Testet: Library-Loading, Key-Generierung, Session-Aufbau, Encrypt/Decrypt
 * Läuft im Browser-Kontext via Playwright gegen den Vite Dev-Server,
 * der die Module korrekt auflöst.
 */
import { test, expect } from '@playwright/test';

test.describe('Signal Protocol Integration', () => {
  test('Library lädt und IdentityKeyPair.generate() funktioniert', async ({ page }) => {
    await page.goto('/');

    // Nutze Vite's Module-System über dynamisches import() im App-Kontext
    const result = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/signal/index.ts');
      const identity = await mod.initializeSignal();
      return {
        hasPubKey:
          identity.identityKeyPair.pubKey instanceof ArrayBuffer &&
          identity.identityKeyPair.pubKey.byteLength > 0,
        hasPrivKey:
          identity.identityKeyPair.privKey instanceof ArrayBuffer &&
          identity.identityKeyPair.privKey.byteLength > 0,
        pubKeyLength: identity.identityKeyPair.pubKey.byteLength,
        privKeyLength: identity.identityKeyPair.privKey.byteLength,
        regIdValid:
          typeof identity.registrationId === 'number' &&
          identity.registrationId > 0,
        storeExists: identity.store != null,
      };
    });

    expect(result.hasPubKey).toBe(true);
    expect(result.hasPrivKey).toBe(true);
    expect(result.pubKeyLength).toBe(33); // Curve25519 public key
    expect(result.privKeyLength).toBe(32); // Curve25519 private key
    expect(result.regIdValid).toBe(true);
    expect(result.storeExists).toBe(true);
  });

  test('PreKey und SignedPreKey Generierung funktioniert', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const mod = await import('/src/app/lib/signal/index.ts');
      const identity = await mod.initializeSignal();
      const { preKeys, signedPreKey } = await mod.generatePreKeys(
        identity.identityKeyPair,
        1,
        3
      );
      return {
        preKeyCount: preKeys.length,
        preKeyIds: preKeys.map((pk: any) => pk.keyId),
        signedPreKeyId: signedPreKey.keyId,
        signedPreKeyHasSig: signedPreKey.signature.byteLength > 0,
      };
    });

    expect(result.preKeyCount).toBe(3);
    expect(result.preKeyIds).toEqual([1, 2, 3]);
    expect(result.signedPreKeyId).toBe(1);
    expect(result.signedPreKeyHasSig).toBe(true);
  });

  test('Session-Aufbau und Encrypt/Decrypt zwischen zwei Peers', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      // Lade alles über den Vite-aufgelösten Pfad — kein bare specifier im Browser
      const mod = await import('/src/app/lib/signal/index.ts');

      // Re-export KeyHelper etc. aus einem Helper-Modul das Vite auflösen kann
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');

      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      // --- Alice ---
      const aliceStore = createMemoryStore();
      aliceStore._identity = await KeyHelper.generateIdentityKeyPair();
      aliceStore._regId = KeyHelper.generateRegistrationId();

      // --- Bob ---
      const bobStore = createMemoryStore();
      bobStore._identity = await KeyHelper.generateIdentityKeyPair();
      bobStore._regId = KeyHelper.generateRegistrationId();

      // Bob PreKeys
      const bobPreKey = await KeyHelper.generatePreKey(1);
      const bobSignedPreKey = await KeyHelper.generateSignedPreKey(bobStore._identity, 1);
      await bobStore.storePreKey(1, bobPreKey.keyPair);
      await bobStore.storeSignedPreKey(1, bobSignedPreKey.keyPair);

      // Alice baut Session auf
      const bobAddress = new SignalProtocolAddress('bob', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: {
          keyId: 1,
          publicKey: bobSignedPreKey.keyPair.pubKey,
          signature: bobSignedPreKey.signature,
        },
      });

      // Alice verschlüsselt
      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const plaintext = 'Hallo Bob, geheimer Test!';
      const encoded = new TextEncoder().encode(plaintext);
      const encrypted = await aliceCipher.encrypt(encoded.buffer);

      // Bob entschlüsselt
      const aliceAddress = new SignalProtocolAddress('alice', 1);
      const bobCipher = new SessionCipher(bobStore as any, aliceAddress);
      const decrypted = await bobCipher.decryptPreKeyWhisperMessage(
        encrypted.body!,
        'binary'
      );
      const decryptedText = new TextDecoder().decode(decrypted);

      // Bob antwortet
      const reply = 'Hallo Alice, empfangen!';
      const replyEncoded = new TextEncoder().encode(reply);
      const replyEncrypted = await bobCipher.encrypt(replyEncoded.buffer);
      const replyDecrypted = await aliceCipher.decryptWhisperMessage(
        replyEncrypted.body!,
        'binary'
      );
      const replyText = new TextDecoder().decode(replyDecrypted);

      return {
        encryptedType: encrypted.type,
        decryptedText,
        replyType: replyEncrypted.type,
        replyText,
      };
    });

    // Erste Nachricht = PreKeyWhisperMessage (type 3)
    expect(result.encryptedType).toBe(3);
    expect(result.decryptedText).toBe('Hallo Bob, geheimer Test!');

    // Antwort = WhisperMessage (type 1)
    expect(result.replyType).toBe(1);
    expect(result.replyText).toBe('Hallo Alice, empfangen!');
  });

  test('Double Ratchet: Jede Nachricht hat einen anderen Key (Forward Secrecy)', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const helpers = await import('/src/app/lib/signal/test-helpers.ts');
      const { KeyHelper, SessionBuilder, SessionCipher, SignalProtocolAddress, createMemoryStore } = helpers;

      // --- Alice & Bob Setup ---
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

      const bobAddress = new SignalProtocolAddress('bob', 1);
      const aliceAddress = new SignalProtocolAddress('alice', 1);
      const aliceBuilder = new SessionBuilder(aliceStore as any, bobAddress);
      await aliceBuilder.processPreKey({
        identityKey: bobStore._identity.pubKey,
        registrationId: bobStore._regId,
        preKey: { keyId: 1, publicKey: bobPreKey.keyPair.pubKey },
        signedPreKey: {
          keyId: 1,
          publicKey: bobSignedPreKey.keyPair.pubKey,
          signature: bobSignedPreKey.signature,
        },
      });

      const aliceCipher = new SessionCipher(aliceStore as any, bobAddress);
      const bobCipher = new SessionCipher(bobStore as any, aliceAddress);

      // Gleichen Text 3x verschlüsseln — muss jedes Mal anderen Ciphertext ergeben
      const plaintext = 'Test Message';
      const enc = new TextEncoder();
      const e1 = await aliceCipher.encrypt(enc.encode(plaintext).buffer);
      const e2 = await aliceCipher.encrypt(enc.encode(plaintext).buffer);
      const e3 = await aliceCipher.encrypt(enc.encode(plaintext).buffer);

      // Entschlüsseln — Typ bestimmt Decrypt-Methode
      async function decryptMsg(cipher: any, msg: any): Promise<string> {
        if (msg.type === 3) {
          return new TextDecoder().decode(
            await cipher.decryptPreKeyWhisperMessage(msg.body!, 'binary')
          );
        }
        return new TextDecoder().decode(
          await cipher.decryptWhisperMessage(msg.body!, 'binary')
        );
      }

      const d1 = await decryptMsg(bobCipher, e1);
      const d2 = await decryptMsg(bobCipher, e2);
      const d3 = await decryptMsg(bobCipher, e3);

      // Ratchet in Gegenrichtung: Bob → Alice
      const e4 = await bobCipher.encrypt(enc.encode('Reply 1').buffer);
      const e5 = await bobCipher.encrypt(enc.encode('Reply 2').buffer);
      const d4 = await decryptMsg(aliceCipher, e4);
      const d5 = await decryptMsg(aliceCipher, e5);

      return {
        allDifferent: e1.body !== e2.body && e2.body !== e3.body && e1.body !== e3.body,
        d1, d2, d3, d4, d5,
        firstType: e1.type,
        subsequentType: e2.type,
      };
    });

    // Double Ratchet: Jeder Ciphertext ist anders
    expect(result.allDifferent).toBe(true);
    // Klartext bleibt identisch
    expect(result.d1).toBe('Test Message');
    expect(result.d2).toBe('Test Message');
    expect(result.d3).toBe('Test Message');
    // Bidirektionaler Ratchet
    expect(result.d4).toBe('Reply 1');
    expect(result.d5).toBe('Reply 2');
    // Initiator-Nachrichten vor Responder-Reply = PreKeyWhisperMessage (3)
    expect(result.firstType).toBe(3);
    expect(result.subsequentType).toBe(3); // Bleibt 3 bis Responder antwortet
  });
});
