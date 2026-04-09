// WebCrypto-basierte Schlüsselgenerierung für Passwordless Auth
// Kein Passwort wird auf dem Server gespeichert — die Identität liegt beim Nutzer.

const KEY_ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;

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

/** Signiert einen String mit dem privaten ECDSA-Schluessel und gibt Base64 zurueck */
export async function signData(privateKeyJwk: JsonWebKey, data: string): Promise<string> {
  const privateKey = await crypto.subtle.importKey("jwk", privateKeyJwk, KEY_ALGO, false, ["sign"]);
  const encoded = new TextEncoder().encode(data);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
