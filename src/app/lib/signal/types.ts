/**
 * Signal Protocol Types — Re-exports & Aregoland-spezifische Typen
 */

export type {
  KeyPairType,
  PreKeyPairType,
  SignedPreKeyPairType,
  PreKeyType,
  SignedPublicPreKeyType,
  DeviceType,
  StorageType,
  SessionRecordType,
  MessageType,
} from '@privacyresearch/libsignal-protocol-typescript';

export { Direction } from '@privacyresearch/libsignal-protocol-typescript';

/** Serialisierte Schlüsseldaten für IndexedDB-Speicherung */
export interface SerializedKeyPair {
  pubKey: string;   // Base64
  privKey: string;  // Base64
}

/** Store-Konfiguration für lokale Identität */
export interface LocalIdentity {
  identityKeyPair: SerializedKeyPair;
  registrationId: number;
}
