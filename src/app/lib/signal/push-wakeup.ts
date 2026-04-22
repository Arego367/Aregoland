/**
 * Push-Wakeup Client — Token-Registrierung und Peer-Wakeup
 *
 * Registriert den FCM/APNs Push-Token beim Server und
 * kann Offline-Peers per leerem Push aufwecken.
 *
 * P2P-Prinzip: Push enthält NIEMALS Nachrichteninhalte.
 */

import { signData } from '@/app/auth/crypto';

const SIGNALING_BASE_URL =
  (import.meta as any).env?.VITE_SIGNALING_URL_HTTP ??
  `${window.location.protocol}//${window.location.host}`;

/**
 * Registriert einen Push-Token beim Server.
 *
 * @param aregoId - Eigene Arego-ID
 * @param privateKeyJwk - ECDSA P-256 Private Key für Signatur
 * @param token - FCM- oder APNs-Token
 * @param provider - 'fcm' oder 'apns'
 */
export async function registerPushToken(
  aregoId: string,
  privateKeyJwk: JsonWebKey,
  token: string,
  provider: 'fcm' | 'apns',
): Promise<void> {
  const timestamp = new Date().toISOString();
  const dataToSign = aregoId + token + timestamp;
  const signature = await signData(privateKeyJwk, dataToSign);

  const resp = await fetch(`${SIGNALING_BASE_URL}/push/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arego_id: aregoId, token, provider, signature, timestamp }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Push register failed: ${resp.status} ${(err as any).error || ''}`);
  }
}

/**
 * Deregistriert einen Push-Token.
 */
export async function deregisterPushToken(
  aregoId: string,
  privateKeyJwk: JsonWebKey,
  token: string,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const dataToSign = aregoId + 'deregister' + timestamp;
  const signature = await signData(privateKeyJwk, dataToSign);

  const resp = await fetch(`${SIGNALING_BASE_URL}/push/register`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arego_id: aregoId, token, signature, timestamp }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Push deregister failed: ${resp.status} ${(err as any).error || ''}`);
  }
}

/**
 * Sendet einen leeren Wakeup-Push an einen Peer.
 * Gibt die Anzahl der tatsächlich gesendeten Pushes zurück.
 */
export async function wakeupPeer(
  aregoId: string,
  privateKeyJwk: JsonWebKey,
  targetAregoId: string,
): Promise<number> {
  const timestamp = new Date().toISOString();
  const dataToSign = aregoId + targetAregoId + timestamp;
  const signature = await signData(privateKeyJwk, dataToSign);

  const resp = await fetch(`${SIGNALING_BASE_URL}/push/wakeup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      arego_id: aregoId,
      target_arego_id: targetAregoId,
      signature,
      timestamp,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Push wakeup failed: ${resp.status} ${(err as any).error || ''}`);
  }

  const result = await resp.json();
  return result.pushed ?? 0;
}

/**
 * Holt den FCM-Token aus dem Service Worker (wenn verfügbar).
 * Gibt null zurück wenn Push nicht verfügbar.
 */
export async function getFcmToken(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY,
    });
    // endpoint enthält den Token als letzten Pfad-Bestandteil
    const endpoint = sub.endpoint;
    const token = endpoint.split('/').pop() ?? null;
    return token;
  } catch {
    return null;
  }
}
