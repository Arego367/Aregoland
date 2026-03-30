import {
  generateIdentityKeyPair,
  deriveAregoId,
  exportKeyPairAsJWK,
  importKeyPairFromJWK,
} from "./crypto";

export interface UserIdentity {
  aregoId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  createdAt: string;
}

const STORAGE_KEY = "aregoland_identity";

/** Erstellt eine neue Identität, speichert sie lokal und gibt sie zurück. */
export async function createIdentity(displayName: string): Promise<UserIdentity> {
  const keyPair = await generateIdentityKeyPair();
  const aregoId = await deriveAregoId(keyPair.publicKey);
  const { publicKeyJwk, privateKeyJwk } = await exportKeyPairAsJWK(keyPair);

  const identity: UserIdentity = {
    aregoId,
    displayName: displayName.trim() || "Anonym",
    publicKeyJwk,
    privateKeyJwk,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

/** Lädt die lokal gespeicherte Identität, oder null wenn keine vorhanden. */
export function loadIdentity(): UserIdentity | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserIdentity;
  } catch {
    return null;
  }
}

/** Löscht die lokale Identität (Abmelden / Konto entfernen). */
export function deleteIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Kodiert die Identität als Base64-String für den Recovery-QR-Code.
 * Enthält den privaten Schlüssel — NUR offline aufbewahren!
 */
export function encodeRecoveryPayload(identity: UserIdentity): string {
  const json = JSON.stringify({
    aregoId: identity.aregoId,
    displayName: identity.displayName,
    publicKeyJwk: identity.publicKeyJwk,
    privateKeyJwk: identity.privateKeyJwk,
    createdAt: identity.createdAt,
  });
  // btoa kann kein Unicode → erst UTF-8 kodieren
  return btoa(
    new TextEncoder().encode(json).reduce((s, b) => s + String.fromCharCode(b), '')
  );
}

/**
 * Importiert eine Identität aus einem Recovery-Payload (QR-Code oder Schlüssel-Text).
 * Gibt null zurück wenn das Payload ungültig oder korrumpiert ist.
 */
export async function importFromRecoveryPayload(
  encoded: string
): Promise<UserIdentity | null> {
  try {
    // atob → UTF-8 dekodieren (Unicode-safe)
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes)) as UserIdentity;
    // Schlüssel validieren
    await importKeyPairFromJWK(data.publicKeyJwk, data.privateKeyJwk);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}
