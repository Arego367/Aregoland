/**
 * Signal Protocol Store — IndexedDB-basierte StorageType-Implementierung
 *
 * Persistiert alle Signal-Schlüssel und Sessions in IndexedDB:
 *  - identity: eigenes IdentityKeyPair + RegistrationId
 *  - prekeys: One-Time PreKeys
 *  - signedprekeys: Signed PreKeys
 *  - sessions: Session-Records pro Remote-Adresse
 *  - identitykeys: Remote Identity Keys (Trust-Store)
 */

import type {
  StorageType,
  KeyPairType,
  SessionRecordType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { Direction } from '@privacyresearch/libsignal-protocol-typescript';

const DB_NAME = 'aregoland-signal';
const DB_VERSION = 1;

const STORES = {
  identity: 'identity',
  prekeys: 'prekeys',
  signedPrekeys: 'signedprekeys',
  sessions: 'sessions',
  identityKeys: 'identitykeys',
} as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut(storeName: string, key: IDBValidKey, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

/**
 * IndexedDB-backed Signal Protocol Store.
 *
 * Verwendung:
 *   const store = new SignalStore();
 *   await store.init(identityKeyPair, registrationId);
 */
export class SignalStore implements StorageType {
  private identityKeyPair: KeyPairType | undefined;
  private localRegistrationId: number | undefined;

  /** Initialisiert den Store mit einem bestehenden oder neuen IdentityKeyPair */
  async init(keyPair: KeyPairType, registrationId: number): Promise<void> {
    this.identityKeyPair = keyPair;
    this.localRegistrationId = registrationId;
    await idbPut(STORES.identity, 'identityKeyPair', keyPair);
    await idbPut(STORES.identity, 'registrationId', registrationId);
  }

  /** Lädt gespeicherte Identität aus IndexedDB (falls vorhanden) */
  async loadFromStorage(): Promise<boolean> {
    const keyPair = await idbGet<KeyPairType>(STORES.identity, 'identityKeyPair');
    const regId = await idbGet<number>(STORES.identity, 'registrationId');
    if (keyPair && regId != null) {
      this.identityKeyPair = keyPair;
      this.localRegistrationId = regId;
      return true;
    }
    return false;
  }

  // --- StorageType Interface ---

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    return this.identityKeyPair;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.localRegistrationId;
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction
  ): Promise<boolean> {
    const stored = await idbGet<ArrayBuffer>(STORES.identityKeys, identifier);
    if (!stored) {
      // Erster Kontakt — Trust on First Use (TOFU)
      return true;
    }
    return arrayBuffersEqual(stored, identityKey);
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer
  ): Promise<boolean> {
    const existing = await idbGet<ArrayBuffer>(STORES.identityKeys, encodedAddress);
    await idbPut(STORES.identityKeys, encodedAddress, publicKey);
    // true = Identity hat sich geändert (Key Change)
    return existing != null && !arrayBuffersEqual(existing, publicKey);
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    return idbGet<KeyPairType>(STORES.prekeys, String(keyId));
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await idbPut(STORES.prekeys, String(keyId), keyPair);
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await idbDelete(STORES.prekeys, String(keyId));
  }

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    return idbGet<KeyPairType>(STORES.signedPrekeys, String(keyId));
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await idbPut(STORES.signedPrekeys, String(keyId), keyPair);
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await idbDelete(STORES.signedPrekeys, String(keyId));
  }

  async loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    return idbGet<SessionRecordType>(STORES.sessions, encodedAddress);
  }

  async storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    await idbPut(STORES.sessions, encodedAddress, record);
  }
}

function arrayBuffersEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) return false;
  }
  return true;
}
