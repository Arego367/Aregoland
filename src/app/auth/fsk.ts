/**
 * Arego Chat — FSK-Schutzsystem
 *
 * Jedes Konto startet mit FSK 6. Ohne Verifizierung sind
 * soziale Features (Chats, Spaces, Kontakte, World) gesperrt.
 * Verifizierung per EUDI Wallet oder Eltern-Verknuepfung (beides kommt spaeter).
 */

export type FskLevel = 6 | 12 | 16 | 18;

export interface FskStatus {
  level: FskLevel;
  verified: boolean;
  verifiedAt: string | null;
  method: "eudi" | "parent" | "self" | null;
  eudiHash?: string | null;
}

const STORAGE_KEY = "aregoland_fsk";

/** Gesperrte Features bei unverifiziertem FSK-Status. */
export const FSK_LOCKED_FEATURES = ["chatList", "people", "community", "world"] as const;

/** Erstellt den initialen FSK-Status (FSK 6, nicht verifiziert). */
export function initFsk(): FskStatus {
  const fsk: FskStatus = {
    level: 6,
    verified: false,
    verifiedAt: null,
    method: null,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fsk));
  return fsk;
}

/** Laedt den FSK-Status. */
export function loadFsk(): FskStatus | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FskStatus;
  } catch {
    return null;
  }
}

/** Speichert den FSK-Status. */
export function saveFsk(fsk: FskStatus): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fsk));
}

/** Gibt true zurueck wenn der Nutzer verifiziert ist. */
export function isFskVerified(fsk: FskStatus | null): boolean {
  if (!fsk) return false; // Kein FSK-Status = nicht verifiziert → initFsk() aufrufen
  return fsk.verified;
}

/** Prueft ob ein bestimmtes Feature durch FSK gesperrt ist. */
export function isFeatureLocked(fsk: FskStatus | null, featureId: string): boolean {
  if (!fsk) return true; // Kein FSK-Status = alles gesperrt
  if (fsk.verified) return false;
  return (FSK_LOCKED_FEATURES as readonly string[]).includes(featureId);
}
