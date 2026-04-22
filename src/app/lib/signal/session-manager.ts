/**
 * Signal Session Manager — X3DH Session-Aufbau für P2P
 *
 * Kapselt den X3DH Handshake und SessionCipher-Nutzung:
 *  1. Initiator holt Pre-Key-Bundle vom Server
 *  2. Führt X3DH via libsignal SessionBuilder durch
 *  3. Verschlüsselt/Entschlüsselt via SessionCipher (Double Ratchet)
 *
 * Fallback auf ECDH wenn Peer kein Pre-Key-Bundle hat.
 */

import {
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';
import type { MessageType, DeviceType } from '@privacyresearch/libsignal-protocol-typescript';
import { SignalStore } from './signal-store';

const SIGNALING_BASE_URL =
  (import.meta as any).env?.VITE_SIGNALING_URL_HTTP ??
  `${window.location.protocol}//${window.location.host}`;

/** Ergebnis eines Pre-Key-Bundle-Abrufs vom Server */
interface ServerPreKeyBundle {
  arego_id: string;
  identity_key: string;         // Base64
  signed_pre_key: {
    keyId: number;
    publicKey: string;           // Base64
    signature: string;           // Base64
  };
  pre_key: { id: number; key: string } | null;  // One-Time-Pre-Key (kann null sein)
  remaining_one_time_pre_keys: number;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
  }
  return btoa(binary);
}

export interface SignalSession {
  cipher: SessionCipher;
  address: SignalProtocolAddress;
  /** true = X3DH Session, false = Fallback ECDH */
  isSignalSession: boolean;
}

/**
 * Versucht eine X3DH Session mit einem Peer aufzubauen.
 * Gibt null zurück wenn der Peer kein Pre-Key-Bundle hat (→ Fallback).
 */
export async function establishSession(
  store: SignalStore,
  peerAregoId: string,
  deviceId: number = 1,
): Promise<SignalSession | null> {
  // 1. Pre-Key-Bundle vom Server holen
  const bundle = await fetchPreKeyBundle(peerAregoId);
  if (!bundle) return null;

  // 2. DeviceType für libsignal bauen
  const device: DeviceType = {
    identityKey: base64ToArrayBuffer(bundle.identity_key),
    registrationId: 0, // Server liefert keine regId — nicht kritisch für Session-Aufbau
    signedPreKey: {
      keyId: bundle.signed_pre_key.keyId,
      publicKey: base64ToArrayBuffer(bundle.signed_pre_key.publicKey),
      signature: base64ToArrayBuffer(bundle.signed_pre_key.signature),
    },
  };
  if (bundle.pre_key) {
    device.preKey = {
      keyId: bundle.pre_key.id,
      publicKey: base64ToArrayBuffer(bundle.pre_key.key),
    };
  }

  // 3. X3DH Session aufbauen
  const address = new SignalProtocolAddress(peerAregoId, deviceId);
  const builder = new SessionBuilder(store, address);
  await builder.processPreKey(device);

  const cipher = new SessionCipher(store, address);
  return { cipher, address, isSignalSession: true };
}

/**
 * Erstellt einen SessionCipher für eine bestehende Session.
 * Nutzt die im Store gespeicherte Session (z.B. nach Empfang einer PreKeyWhisperMessage).
 */
export function getSessionCipher(
  store: SignalStore,
  peerAregoId: string,
  deviceId: number = 1,
): SignalSession {
  const address = new SignalProtocolAddress(peerAregoId, deviceId);
  const cipher = new SessionCipher(store, address);
  return { cipher, address, isSignalSession: true };
}

/**
 * Verschlüsselt eine Nachricht für den Peer.
 */
export async function signalEncrypt(
  session: SignalSession,
  plaintext: string,
): Promise<{ type: number; body: string }> {
  const encoded = new TextEncoder().encode(plaintext);
  const msg: MessageType = await session.cipher.encrypt(encoded.buffer as ArrayBuffer);
  return { type: msg.type, body: msg.body ?? '' };
}

/**
 * Entschlüsselt eine empfangene Signal-Nachricht.
 */
export async function signalDecrypt(
  session: SignalSession,
  message: { type: number; body: string },
): Promise<string> {
  let plainBuffer: ArrayBuffer;
  if (message.type === 3) {
    // PreKeyWhisperMessage — erstmalige Nachricht, Session wird aufgebaut
    plainBuffer = await session.cipher.decryptPreKeyWhisperMessage(message.body, 'binary');
  } else {
    // WhisperMessage — etablierte Session
    plainBuffer = await session.cipher.decryptWhisperMessage(message.body, 'binary');
  }
  return new TextDecoder().decode(plainBuffer);
}

/**
 * Prüft ob eine Signal-Session mit dem Peer existiert.
 */
export async function hasSignalSession(
  store: SignalStore,
  peerAregoId: string,
  deviceId: number = 1,
): Promise<boolean> {
  const address = new SignalProtocolAddress(peerAregoId, deviceId);
  const cipher = new SessionCipher(store, address);
  return cipher.hasOpenSession();
}

/**
 * Serialisiert eine Signal-Nachricht für den Transport über DataChannel.
 * Format: { t: 'sig', type: 3, body: '...' }
 */
export function serializeSignalMessage(msg: { type: number; body: string }): string {
  return JSON.stringify({ t: 'sig', type: msg.type, body: msg.body });
}

/**
 * Prüft ob eine DataChannel-Nachricht ein Signal-Protokoll-Message ist.
 */
export function isSignalMessage(msg: any): msg is { t: 'sig'; type: number; body: string } {
  return msg?.t === 'sig' && typeof msg.type === 'number' && typeof msg.body === 'string';
}

// ── Server-Kommunikation ─────────────────────────────────────────────────────

async function fetchPreKeyBundle(aregoId: string): Promise<ServerPreKeyBundle | null> {
  try {
    const resp = await fetch(`${SIGNALING_BASE_URL}/prekeys/${encodeURIComponent(aregoId)}`);
    if (resp.status === 404) return null;
    if (!resp.ok) {
      console.warn('[Signal] Pre-Key-Bundle Abruf fehlgeschlagen:', resp.status);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.warn('[Signal] Pre-Key-Bundle Abruf Fehler:', err);
    return null;
  }
}

/**
 * Identity-Handshake-Payload: enthält Signal-Capability-Flag.
 * Wird in den bestehenden identity_exchange eingebettet.
 */
export interface SignalCapability {
  signalCapable: boolean;
  /** Base64 der libsignal IdentityKey (Curve25519 public key) */
  signalIdentityKey?: string;
}

/**
 * Erstellt das signalCapable-Flag für den Identity-Handshake.
 */
export async function getSignalCapability(store: SignalStore): Promise<SignalCapability> {
  const keyPair = await store.getIdentityKeyPair();
  if (!keyPair) return { signalCapable: false };
  return {
    signalCapable: true,
    signalIdentityKey: arrayBufferToBase64(keyPair.pubKey),
  };
}
