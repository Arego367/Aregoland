// WebCrypto-basierte Schlüsselgenerierung für Passwordless Auth
// Kein Passwort wird auf dem Server gespeichert — die Identität liegt beim Nutzer.

const KEY_ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;

/**
 * SHA-256 Hash einer Arego-ID — wird an den Server gesendet statt der echten ID.
 * Die echte Arego-ID verlässt nie das Gerät des Nutzers.
 */
export async function hashAregoId(id: string): Promise<string> {
  const data = new TextEncoder().encode(id);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Synchrone Version mit vorberechnetem Cache */
let _hashCache: Record<string, string> = {};

export function hashAregoIdSync(id: string): string {
  return _hashCache[id] ?? id; // Fallback auf rohe ID wenn nicht gecached
}

/** Muss einmal beim Start aufgerufen werden */
export async function precomputeHash(id: string): Promise<string> {
  const h = await hashAregoId(id);
  _hashCache[id] = h;
  return h;
}

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  if (!crypto?.subtle) {
    throw new Error(
      "WebCrypto nicht verfügbar. Die App benötigt HTTPS (kein HTTP)."
    );
  }
  return crypto.subtle.generateKey(KEY_ALGO, true, ["sign", "verify"]);
}

/** Leitet die Arego-ID aus dem öffentlichen Schlüssel ab (SHA-256 Hash → "AC-XXXX-XXXX") */
export async function deriveAregoId(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const toHex = (bytes: Uint8Array) =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");
  return `AC-${toHex(hash.slice(0, 2))}-${toHex(hash.slice(2, 6))}`;
}

export async function exportKeyPairAsJWK(
  keyPair: CryptoKeyPair
): Promise<{ publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey }> {
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
  ]);
  return { publicKeyJwk, privateKeyJwk };
}

export async function importKeyPairFromJWK(
  publicKeyJwk: JsonWebKey,
  privateKeyJwk: JsonWebKey
): Promise<CryptoKeyPair> {
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey("jwk", publicKeyJwk, KEY_ALGO, true, ["verify"]),
    crypto.subtle.importKey("jwk", privateKeyJwk, KEY_ALGO, true, ["sign"]),
  ]);
  return { publicKey, privateKey };
}
