import {
  generateIdentityKeyPair,
  deriveAregoId,
  exportKeyPairAsJWK,
  importKeyPairFromJWK,
} from "./crypto";
import { initSubscription, loadSubscription } from "./subscription";
import { initFsk, loadFsk } from "./fsk";

export interface UserIdentity {
  aregoId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  createdAt: string;
}

export interface ChildAccount {
  aregoId: string;
  displayName: string;
  parentId: string;
  fsk: 6 | 12 | 16 | 18;
  createdAt: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
}

const STORAGE_KEY = "aregoland_identity";
const CHILDREN_KEY = "aregoland_children";

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
  initSubscription();
  initFsk();
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
    if (!loadSubscription()) initSubscription();
    if (!loadFsk()) initFsk();
    return data;
  } catch {
    return null;
  }
}

// ── Kind-Konten ──────────────────────────────────────────────────────────────

export function loadChildren(): ChildAccount[] {
  try {
    return JSON.parse(localStorage.getItem(CHILDREN_KEY) ?? '[]');
  } catch { return []; }
}

export function saveChild(child: ChildAccount): void {
  const children = loadChildren();
  const idx = children.findIndex(c => c.aregoId === child.aregoId);
  if (idx >= 0) children[idx] = child; else children.push(child);
  localStorage.setItem(CHILDREN_KEY, JSON.stringify(children));
}

export function removeChild(aregoId: string): void {
  const children = loadChildren().filter(c => c.aregoId !== aregoId);
  localStorage.setItem(CHILDREN_KEY, JSON.stringify(children));
}

/** Erstellt ein Kind-Konto-Linking-Payload als Base64 (TTL 10 Min, einmalig) */
export function createChildLinkPayload(parentIdentity: UserIdentity, childNames?: { firstName?: string; lastName?: string; nickname?: string }): string {
  const payload: Record<string, unknown> = {
    t: 'child-link' as const,
    pid: parentIdentity.aregoId,
    pn: parentIdentity.displayName,
    exp: Date.now() + 10 * 60 * 1000,
    n: Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, '0')).join(''),
  };
  if (childNames?.firstName) payload.cfn = childNames.firstName;
  if (childNames?.lastName) payload.cln = childNames.lastName;
  if (childNames?.nickname) payload.cnn = childNames.nickname;
  const json = JSON.stringify(payload);
  return btoa(
    new TextEncoder().encode(json).reduce((s, b) => s + String.fromCharCode(b), '')
  );
}

/** Dekodiert ein Kind-Konto-Linking-Payload vom Eltern-QR */
export function decodeChildLinkPayload(encoded: string): {
  parentId: string; parentName: string; exp: number;
  childFirstName?: string; childLastName?: string; childNickname?: string;
} | null {
  try {
    const binary = atob(encoded.trim());
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes));
    const type = p.t ?? p.type;
    const parentId = p.pid ?? p.parentId;
    const parentName = p.pn ?? p.parentName ?? '';
    const exp = p.exp;
    if (type !== 'child-link' || !parentId || !exp) return null;
    if (Date.now() > exp) return null;
    return {
      parentId, parentName, exp,
      childFirstName: p.cfn ?? undefined,
      childLastName: p.cln ?? undefined,
      childNickname: p.cnn ?? undefined,
    };
  } catch { return null; }
}

/** Erstellt ein Kind-Konto und speichert es lokal (auf dem Kind-Gerät) */
export async function createChildIdentity(
  displayName: string,
  parentId: string,
  fsk: 6 | 12 | 16 | 18 = 6
): Promise<UserIdentity & { accountType: 'child'; parentId: string; fsk: number }> {
  const keyPair = await generateIdentityKeyPair();
  const aregoId = await deriveAregoId(keyPair.publicKey);
  const { publicKeyJwk, privateKeyJwk } = await exportKeyPairAsJWK(keyPair);

  const identity = {
    aregoId,
    displayName: displayName.trim() || "Kind",
    publicKeyJwk,
    privateKeyJwk,
    createdAt: new Date().toISOString(),
    accountType: 'child' as const,
    parentId,
    fsk,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}
