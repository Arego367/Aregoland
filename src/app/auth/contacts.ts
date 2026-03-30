/** Lokaler Kontaktspeicher — nur localStorage, kein Server */

export interface StoredContact {
  aregoId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
  addedAt: string;
}

const CONTACTS_KEY = 'aregoland_contacts';
const NONCES_KEY = 'aregoland_used_nonces';

export function loadContacts(): StoredContact[] {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveContact(contact: StoredContact): void {
  const all = loadContacts();
  const idx = all.findIndex((c) => c.aregoId === contact.aregoId);
  if (idx >= 0) all[idx] = contact;
  else all.push(contact);
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(all));
}

export function isNonceUsed(nonce: string): boolean {
  const used: string[] = JSON.parse(localStorage.getItem(NONCES_KEY) ?? '[]');
  return used.includes(nonce);
}

/** Entfernt einen einzelnen Kontakt */
export function removeContact(aregoId: string): void {
  const all = loadContacts();
  const filtered = all.filter((c) => c.aregoId !== aregoId);
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(filtered));
}

/** Löscht alle Kontakte und Nonces — für vollständigen Account-Reset */
export function deleteContacts(): void {
  localStorage.removeItem(CONTACTS_KEY);
  localStorage.removeItem(NONCES_KEY);
}

export function markNonceUsed(nonce: string): void {
  const used: string[] = JSON.parse(localStorage.getItem(NONCES_KEY) ?? '[]');
  used.push(nonce);
  // Max 200 Nonces lokal speichern
  if (used.length > 200) used.splice(0, used.length - 200);
  localStorage.setItem(NONCES_KEY, JSON.stringify(used));
}
