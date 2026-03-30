/**
 * Kontakt-Teilen: Payload-Encoding, Kurzcode-API, Room-ID-Ableitung
 *
 * QR-Code:   base64(JSON(ContactSharePayload))  — gültig 10 Min
 * Kurzcode:  6 Zeichen, auf Signaling-Server hinterlegt — gültig 1 Stunde, einmalig
 * Room-ID:   sort([aregoIdA, aregoIdB]).join(':')  — deterministisch für beide Seiten
 */

import { UserIdentity } from '@/app/auth/identity';

export interface ContactSharePayload {
  v: 1;
  aregoId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
  exp: number;  // Unix ms — Ablaufzeitpunkt
  n: string;    // Nonce — für einmalige Nutzungskontrolle
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Erstellt ein frisches Share-Payload für den eigenen Kontakt */
export function createSharePayload(
  identity: UserIdentity,
  ttlMs = 10 * 60 * 1000
): ContactSharePayload {
  return {
    v: 1,
    aregoId: identity.aregoId,
    displayName: identity.displayName,
    publicKeyJwk: identity.publicKeyJwk,
    exp: Date.now() + ttlMs,
    n: randomHex(8),
  };
}

export function encodePayload(p: ContactSharePayload): string {
  const json = JSON.stringify(p);
  // btoa kann kein Unicode → erst UTF-8 kodieren
  return btoa(
    new TextEncoder().encode(json).reduce((s, b) => s + String.fromCharCode(b), '')
  );
}

export function decodePayload(encoded: string): ContactSharePayload | null {
  try {
    // atob → UTF-8 dekodieren (Unicode-safe)
    const binary = atob(encoded.trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as ContactSharePayload;
    if (
      p.v !== 1 ||
      typeof p.aregoId !== 'string' ||
      typeof p.displayName !== 'string' ||
      !p.publicKeyJwk ||
      typeof p.exp !== 'number' ||
      typeof p.n !== 'string'
    )
      return null;
    return p;
  } catch {
    return null;
  }
}

/** Registriert einen Kurzcode auf dem Signaling-Server (TTL 1h) */
export async function registerShortCode(payload: ContactSharePayload): Promise<string> {
  const res = await fetch('/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: encodePayload(payload) }),
  });
  if (!res.ok) throw new Error('Signaling-Server nicht erreichbar');
  const { code } = await res.json();
  return code as string;
}

/** Löst einen Kurzcode ein — gibt Payload zurück und löscht Code serverseitig (single-use) */
export async function redeemShortCode(code: string): Promise<ContactSharePayload | null> {
  const normalized = code.toUpperCase().replace(/\s/g, '');
  if (normalized.length !== 6) return null;

  const res = await fetch(`/code/${normalized}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Server-Fehler');

  const { payload } = await res.json();
  return decodePayload(payload);
}

/**
 * Leitet eine deterministische P2P Room-ID aus zwei Arego-IDs ab.
 * Beide Seiten berechnen dieselbe ID unabhängig voneinander.
 */
export function deriveRoomId(aregoIdA: string, aregoIdB: string): string {
  return [aregoIdA, aregoIdB].sort().join(':');
}
