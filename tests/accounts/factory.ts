import * as crypto from 'node:crypto';
import { type AccountIdentity, type AccountEntry, addAccount, findByLabel, storageStatePath } from './registry';

let idCounter = 0;

function generateAregoId(): string {
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `AC-TEST-${hex}`;
}

export async function createAccount(label: string, opts?: { aregoId?: string; displayName?: string }): Promise<AccountEntry> {
  const existing = findByLabel(label);
  if (existing) return existing;

  const keyPair = await (crypto.webcrypto as any).subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  const publicKeyJwk = await (crypto.webcrypto as any).subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await (crypto.webcrypto as any).subtle.exportKey('jwk', keyPair.privateKey);

  const identity: AccountIdentity = {
    aregoId: opts?.aregoId ?? generateAregoId(),
    displayName: opts?.displayName ?? label,
    publicKeyJwk,
    privateKeyJwk,
    createdAt: new Date().toISOString(),
  };

  const entry: AccountEntry = {
    label,
    identity,
    storageState: storageStatePath(label),
  };

  addAccount(entry);
  return entry;
}
