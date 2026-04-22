/**
 * Signal Key Manager — Client-seitige Key-Verwaltung
 *
 * Verwaltet den vollständigen Key-Lifecycle:
 *  - Identity-Key-Pair (Curve25519, via libsignal)
 *  - Signed Pre-Key (Rotation alle 7 Tage)
 *  - One-Time Pre-Keys (Batch von 50, Auto-Nachfüllen wenn < 10)
 *  - Upload zum Server mit ECDSA-Signatur
 *
 * Bestehende ECDSA P-256 Keys bleiben für Arego-ID-Generierung.
 * Neue Curve25519 Identity-Keys für libsignal parallel.
 */

import { KeyHelper } from '@privacyresearch/libsignal-protocol-typescript';
import type { KeyPairType, SignedPreKeyPairType, PreKeyPairType } from '@privacyresearch/libsignal-protocol-typescript';
import { SignalStore } from './signal-store';
import { signData } from '@/app/auth/crypto';

const SIGNED_PRE_KEY_ROTATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const ONE_TIME_PRE_KEY_BATCH = 50;
const ONE_TIME_PRE_KEY_THRESHOLD = 10;

/** Base64-Encoding eines ArrayBuffer */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
  }
  return btoa(binary);
}

/** Metadata für Key-Rotation im IndexedDB */
interface KeyManagerMeta {
  signedPreKeyId: number;
  signedPreKeyCreatedAt: number;
  nextOneTimePreKeyId: number;
}

const META_DB_NAME = 'aregoland-signal-meta';
const META_DB_VERSION = 1;

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB_NAME, META_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getMeta(): Promise<KeyManagerMeta> {
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get('keyManagerMeta');
    req.onsuccess = () => resolve(req.result ?? {
      signedPreKeyId: 0,
      signedPreKeyCreatedAt: 0,
      nextOneTimePreKeyId: 1,
    });
    req.onerror = () => reject(req.error);
  });
}

async function saveMeta(meta: KeyManagerMeta): Promise<void> {
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(meta, 'keyManagerMeta');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface KeyManagerResult {
  store: SignalStore;
  identityKeyPair: KeyPairType;
  registrationId: number;
  isNewIdentity: boolean;
}

/**
 * Initialisiert den Key-Manager:
 * - Lädt oder generiert Identity-Key-Pair
 * - Prüft Signed-Pre-Key-Rotation
 * - Füllt One-Time-Pre-Keys auf
 *
 * @param aregoId - Die Arego-ID des Nutzers
 * @param privateKeyJwk - Der ECDSA P-256 Private Key (für Signatur)
 * @param serverBaseUrl - Server-URL für Pre-Key-Upload
 */
export async function initializeKeyManager(
  aregoId: string,
  privateKeyJwk: JsonWebKey,
  serverBaseUrl: string,
): Promise<KeyManagerResult> {
  const store = new SignalStore();
  let isNewIdentity = false;

  // 1. Identity laden oder generieren
  const loaded = await store.loadFromStorage();
  let identityKeyPair: KeyPairType;
  let registrationId: number;

  if (loaded) {
    identityKeyPair = (await store.getIdentityKeyPair())!;
    registrationId = (await store.getLocalRegistrationId())!;
  } else {
    identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    registrationId = KeyHelper.generateRegistrationId();
    await store.init(identityKeyPair, registrationId);
    isNewIdentity = true;
  }

  const meta = await getMeta();

  // 2. Signed Pre-Key: rotieren wenn nötig oder noch keiner existiert
  const now = Date.now();
  const needsSignedPreKeyRotation =
    meta.signedPreKeyId === 0 ||
    (now - meta.signedPreKeyCreatedAt) > SIGNED_PRE_KEY_ROTATION_MS;

  let signedPreKey: SignedPreKeyPairType | null = null;
  if (needsSignedPreKeyRotation) {
    meta.signedPreKeyId += 1;
    signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, meta.signedPreKeyId);
    await store.storeSignedPreKey(meta.signedPreKeyId, signedPreKey.keyPair);
    meta.signedPreKeyCreatedAt = now;
  }

  // 3. One-Time Pre-Keys: generieren wenn neue Identität oder Batch leer
  let newPreKeys: PreKeyPairType[] = [];
  if (isNewIdentity || needsSignedPreKeyRotation) {
    newPreKeys = await generatePreKeyBatch(store, meta, ONE_TIME_PRE_KEY_BATCH);
  }

  await saveMeta(meta);

  // 4. Upload zum Server wenn neue Keys generiert
  if (isNewIdentity || needsSignedPreKeyRotation) {
    // Bei neuer Identität oder Rotation: vollständiges Bundle hochladen
    const currentSignedPreKey = signedPreKey ??
      await loadCurrentSignedPreKey(store, meta.signedPreKeyId, identityKeyPair);

    if (currentSignedPreKey) {
      await uploadPreKeyBundle(
        aregoId,
        privateKeyJwk,
        serverBaseUrl,
        identityKeyPair,
        currentSignedPreKey,
        newPreKeys,
      );
    }
  }

  return { store, identityKeyPair, registrationId, isNewIdentity };
}

/**
 * Prüft ob One-Time-Pre-Keys nachgefüllt werden müssen und füllt auf.
 */
export async function replenishIfNeeded(
  aregoId: string,
  privateKeyJwk: JsonWebKey,
  serverBaseUrl: string,
  store: SignalStore,
  remainingKeysOnServer: number,
): Promise<void> {
  if (remainingKeysOnServer >= ONE_TIME_PRE_KEY_THRESHOLD) return;

  const meta = await getMeta();
  const count = ONE_TIME_PRE_KEY_BATCH - remainingKeysOnServer;
  const newPreKeys = await generatePreKeyBatch(store, meta, count);
  await saveMeta(meta);

  if (newPreKeys.length > 0) {
    await replenishPreKeys(aregoId, privateKeyJwk, serverBaseUrl, newPreKeys);
  }
}

// ── Interne Hilfsfunktionen ──────────────────────────────────────────────────

async function generatePreKeyBatch(
  store: SignalStore,
  meta: KeyManagerMeta,
  count: number,
): Promise<PreKeyPairType[]> {
  const preKeys: PreKeyPairType[] = [];
  for (let i = 0; i < count; i++) {
    const preKey = await KeyHelper.generatePreKey(meta.nextOneTimePreKeyId);
    await store.storePreKey(meta.nextOneTimePreKeyId, preKey.keyPair);
    preKeys.push(preKey);
    meta.nextOneTimePreKeyId += 1;
  }
  return preKeys;
}

async function loadCurrentSignedPreKey(
  store: SignalStore,
  signedPreKeyId: number,
  identityKeyPair: KeyPairType,
): Promise<SignedPreKeyPairType | null> {
  const keyPair = await store.loadSignedPreKey(signedPreKeyId);
  if (!keyPair) return null;
  // Re-sign da wir Signature nicht separat speichern
  return KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
}

async function uploadPreKeyBundle(
  aregoId: string,
  privateKeyJwk: JsonWebKey,
  serverBaseUrl: string,
  identityKeyPair: KeyPairType,
  signedPreKey: SignedPreKeyPairType,
  oneTimePreKeys: PreKeyPairType[],
): Promise<void> {
  const timestamp = new Date().toISOString();
  const identityKeyB64 = arrayBufferToBase64(identityKeyPair.pubKey);
  const dataToSign = aregoId + identityKeyB64 + timestamp;
  const signature = await signData(privateKeyJwk, dataToSign);

  const payload = {
    arego_id: aregoId,
    identity_key: identityKeyB64,
    signed_pre_key_id: signedPreKey.keyId,
    signed_pre_key: arrayBufferToBase64(signedPreKey.keyPair.pubKey),
    signed_pre_key_signature: arrayBufferToBase64(signedPreKey.signature),
    one_time_pre_keys: oneTimePreKeys.map(pk => ({
      id: pk.keyId,
      key: arrayBufferToBase64(pk.keyPair.pubKey),
    })),
    signature,
    timestamp,
  };

  const resp = await fetch(`${serverBaseUrl}/prekeys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Pre-Key upload failed: ${resp.status} ${(err as any).error || ''}`);
  }
}

async function replenishPreKeys(
  aregoId: string,
  privateKeyJwk: JsonWebKey,
  serverBaseUrl: string,
  newPreKeys: PreKeyPairType[],
): Promise<void> {
  const timestamp = new Date().toISOString();
  const dataToSign = aregoId + 'replenish' + timestamp;
  const signature = await signData(privateKeyJwk, dataToSign);

  const payload = {
    arego_id: aregoId,
    one_time_pre_keys: newPreKeys.map(pk => ({
      id: pk.keyId,
      key: arrayBufferToBase64(pk.keyPair.pubKey),
    })),
    signature,
    timestamp,
  };

  const resp = await fetch(`${serverBaseUrl}/prekeys/replenish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Pre-Key replenish failed: ${resp.status} ${(err as any).error || ''}`);
  }
}
