/**
 * P2P End-to-End Verschlüsselung
 *
 * Protokoll:
 *  1. Jede Session generiert ein ephemeres ECDH P-256 Schlüsselpaar
 *  2. Beide Seiten tauschen ihre ECDH Public Keys im SDP-Handshake aus
 *  3. Gemeinsamer AES-GCM-256 Session-Key wird per ECDH abgeleitet
 *  4. Alle DataChannel-Nachrichten werden mit AES-GCM verschlüsselt
 *
 * Forward Secrecy: Neue Schlüssel pro Session — alte Sessions bleiben sicher.
 * Server sieht niemals Klartext oder Session-Keys.
 */

/** Ephemeres ECDH-Schlüsselpaar für diese Session */
export async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
}

export async function exportECDHPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importECDHPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [] // ECDH public keys haben keine usages
  );
}

/** Leitet AES-GCM-256 Session-Key aus eigenem Private Key + Peer Public Key ab */
export async function deriveSessionKey(
  myPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false, // nicht extrahierbar
    ['encrypt', 'decrypt']
  );
}

/**
 * Verschlüsselt einen Text mit AES-GCM.
 * Gibt Base64-String zurück: [12 Byte IV][Ciphertext]
 */
export async function encryptMessage(sessionKey: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, encoded);

  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), 12);

  // Loop statt Spread — Spread crasht bei großen Arrays (Stack Overflow)
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < result.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, result.subarray(i, i + CHUNK) as any);
  }
  return btoa(binary);
}

/** Entschlüsselt einen AES-GCM Base64-String */
export async function decryptMessage(sessionKey: CryptoKey, encoded: string): Promise<string> {
  const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const ciphertext = buf.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, ciphertext);
  return new TextDecoder().decode(plain);
}
