/**
 * Test-Helpers für Signal Protocol Tests
 *
 * Re-exportiert die nötigen Klassen über Vite-auflösbare Pfade
 * und stellt einen In-Memory Store für Tests bereit.
 */

export {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';

export function createMemoryStore() {
  const state: Record<string, unknown> = {};
  return {
    _identity: null as any,
    _regId: 0,
    async getIdentityKeyPair() { return this._identity; },
    async getLocalRegistrationId() { return this._regId; },
    async isTrustedIdentity() { return true; },
    async saveIdentity(_addr: string, key: ArrayBuffer) {
      const existing = state['identity_' + _addr];
      state['identity_' + _addr] = key;
      return existing != null;
    },
    async loadPreKey(id: string | number) { return state['prekey_' + id]; },
    async storePreKey(id: number | string, kp: unknown) { state['prekey_' + id] = kp; },
    async removePreKey(id: number | string) { delete state['prekey_' + id]; },
    async loadSignedPreKey(id: number | string) { return state['signedprekey_' + id]; },
    async storeSignedPreKey(id: number | string, kp: unknown) { state['signedprekey_' + id] = kp; },
    async removeSignedPreKey(id: number | string) { delete state['signedprekey_' + id]; },
    async loadSession(addr: string) { return state['session_' + addr]; },
    async storeSession(addr: string, record: unknown) { state['session_' + addr] = record; },
  };
}
