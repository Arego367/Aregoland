/**
 * Signal Protocol Integration — Lazy-Loading Entry Point
 *
 * Lädt die Signal-Bibliothek erst beim ersten Chat-Öffnen (Code-Splitting).
 * Alle Exporte sind async, damit Vite den Signal-Code in einen separaten
 * Chunk auslagern kann (< 500KB gzipped Ziel).
 *
 * Verwendung:
 *   const signal = await import('@/app/lib/signal');
 *   const { identityKeyPair, registrationId, store } = await signal.initializeSignal();
 *   const encrypted = await signal.encryptForPeer(store, peerAddress, peerBundle, plaintext);
 */

import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';
import type {
  KeyPairType,
  DeviceType,
  MessageType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { SignalStore } from './signal-store';

export { SignalStore } from './signal-store';
export { initializeKeyManager, replenishIfNeeded } from './key-manager';
export type { KeyManagerResult } from './key-manager';
export {
  establishSession,
  getSessionCipher,
  signalEncrypt,
  signalDecrypt,
  hasSignalSession,
  serializeSignalMessage,
  isSignalMessage,
  getSignalCapability,
} from './session-manager';
export type { SignalSession, SignalCapability } from './session-manager';
export { SignalProtocolAddress } from '@privacyresearch/libsignal-protocol-typescript';
export type { KeyPairType, DeviceType, MessageType } from '@privacyresearch/libsignal-protocol-typescript';

export interface SignalIdentity {
  identityKeyPair: KeyPairType;
  registrationId: number;
  store: SignalStore;
}

/**
 * Initialisiert Signal Protocol — lädt bestehende Identität aus IndexedDB
 * oder generiert eine neue.
 */
export async function initializeSignal(): Promise<SignalIdentity> {
  const store = new SignalStore();

  // Versuche bestehende Identität zu laden
  const loaded = await store.loadFromStorage();
  if (loaded) {
    const identityKeyPair = (await store.getIdentityKeyPair())!;
    const registrationId = (await store.getLocalRegistrationId())!;
    return { identityKeyPair, registrationId, store };
  }

  // Neue Identität generieren
  const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
  const registrationId = KeyHelper.generateRegistrationId();
  await store.init(identityKeyPair, registrationId);

  return { identityKeyPair, registrationId, store };
}

/**
 * Generiert einen Satz PreKeys für die Verteilung an den Server.
 */
export async function generatePreKeys(
  identityKeyPair: KeyPairType,
  startId: number,
  count: number
) {
  const preKeys = [];
  for (let i = 0; i < count; i++) {
    preKeys.push(await KeyHelper.generatePreKey(startId + i));
  }
  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, 1);
  return { preKeys, signedPreKey };
}

/**
 * Baut eine Session auf und verschlüsselt eine Nachricht für einen Peer.
 *
 * @param store - Signal Store mit eigener Identität
 * @param name - Peer-Identifier (z.B. UserId)
 * @param deviceId - Geräte-ID des Peers (Standard: 1)
 * @param peerBundle - PreKeyBundle des Peers vom Server
 * @param plaintext - Klartext-Nachricht
 */
export async function encryptForPeer(
  store: SignalStore,
  name: string,
  deviceId: number,
  peerBundle: DeviceType,
  plaintext: string
): Promise<MessageType> {
  const address = new SignalProtocolAddress(name, deviceId);
  const builder = new SessionBuilder(store, address);
  await builder.processPreKey(peerBundle);

  const cipher = new SessionCipher(store, address);
  const encoded = new TextEncoder().encode(plaintext);
  return cipher.encrypt(encoded.buffer as ArrayBuffer);
}

/**
 * Entschlüsselt eine empfangene Signal-Nachricht.
 *
 * @param store - Signal Store mit eigener Identität
 * @param name - Absender-Identifier
 * @param deviceId - Geräte-ID des Absenders
 * @param message - Verschlüsselte Nachricht (MessageType)
 */
export async function decryptFromPeer(
  store: SignalStore,
  name: string,
  deviceId: number,
  message: MessageType
): Promise<string> {
  const address = new SignalProtocolAddress(name, deviceId);
  const cipher = new SessionCipher(store, address);

  let plainBuffer: ArrayBuffer;
  if (message.type === 3) {
    // PreKeyWhisperMessage — erster Nachrichtenaustausch
    plainBuffer = await cipher.decryptPreKeyWhisperMessage(message.body!, 'binary');
  } else {
    // WhisperMessage — etablierte Session
    plainBuffer = await cipher.decryptWhisperMessage(message.body!, 'binary');
  }

  return new TextDecoder().decode(plainBuffer);
}

/**
 * Prüft ob eine offene Session mit einem Peer existiert.
 */
export async function hasSession(
  store: SignalStore,
  name: string,
  deviceId: number
): Promise<boolean> {
  const address = new SignalProtocolAddress(name, deviceId);
  const cipher = new SessionCipher(store, address);
  return cipher.hasOpenSession();
}
