/**
 * Arego Chat — Abo-System
 *
 * Verwaltet Trial, Abo-Status und Plan-Typen.
 * Alles lokal in localStorage — kein Server noetig.
 */

export type SubStatus = "trial" | "active" | "expired";
export type PlanType = "monthly" | "quarterly" | "biannual" | "yearly" | null;

export interface Subscription {
  createdAt: string;
  trialEnd: string;
  status: SubStatus;
  planType: PlanType;
  expiresAt: string | null;
  autoRenew: boolean;
}

export interface PlanOption {
  type: PlanType;
  months: number;
  price: number;
  discount: number | null;
}

export const PLANS: PlanOption[] = [
  { type: "monthly",   months: 1,  price: 1, discount: null },
  { type: "quarterly", months: 3,  price: 2, discount: 33 },
  { type: "biannual",  months: 6,  price: 4, discount: 33 },
  { type: "yearly",    months: 12, price: 8, discount: 33 },
];

const STORAGE_KEY = "aregoland_subscription";
const TRIAL_DAYS = 7;

/** Erstellt ein neues Trial-Abo (wird bei Registrierung aufgerufen). */
export function initSubscription(): Subscription {
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  const sub: Subscription = {
    createdAt: now.toISOString(),
    trialEnd: trialEnd.toISOString(),
    status: "trial",
    planType: null,
    expiresAt: null,
    autoRenew: true,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sub));
  return sub;
}

/** Laedt das Abo aus localStorage. */
export function loadSubscription(): Subscription | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Subscription;
  } catch {
    return null;
  }
}

/** Speichert das Abo in localStorage. */
export function saveSubscription(sub: Subscription): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sub));
}

/**
 * Berechnet den aktuellen Status basierend auf Datumswerten.
 * Aktualisiert bei Bedarf den gespeicherten Status.
 */
export function getEffectiveStatus(sub: Subscription): SubStatus {
  const now = Date.now();

  // Aktives Abo pruefen
  if (sub.status === "active" && sub.expiresAt) {
    if (now > new Date(sub.expiresAt).getTime()) {
      sub.status = "expired";
      saveSubscription(sub);
      return "expired";
    }
    return "active";
  }

  // Trial pruefen
  if (sub.status === "trial") {
    if (now > new Date(sub.trialEnd).getTime()) {
      sub.status = "expired";
      saveSubscription(sub);
      return "expired";
    }
    return "trial";
  }

  return sub.status;
}

/** Gibt true zurueck wenn der Nutzer Zugang zur App hat (Trial oder aktives Abo). */
export function hasAccess(sub: Subscription | null): boolean {
  if (!sub) return true; // Kein Abo-Objekt = Legacy-Account, Zugang erlauben
  const status = getEffectiveStatus(sub);
  return status === "trial" || status === "active";
}

/** Aktiviert einen Plan (Platzhalter ohne echte Bezahlung). */
export function activatePlan(planType: PlanType): Subscription | null {
  const sub = loadSubscription();
  if (!sub || !planType) return null;

  const plan = PLANS.find(p => p.type === planType);
  if (!plan) return null;

  const now = new Date();
  // Wenn aktuelles Abo noch aktiv ist, vom Ende verlaengern; sonst ab jetzt
  const start = sub.expiresAt && new Date(sub.expiresAt).getTime() > now.getTime()
    ? new Date(sub.expiresAt)
    : now;
  const expiresAt = new Date(start);
  expiresAt.setMonth(expiresAt.getMonth() + plan.months);

  sub.status = "active";
  sub.planType = planType;
  sub.expiresAt = expiresAt.toISOString();
  saveSubscription(sub);
  return sub;
}

/** Setzt Auto-Verlaengerung. */
export function setAutoRenew(renew: boolean): void {
  const sub = loadSubscription();
  if (!sub) return;
  sub.autoRenew = renew;
  saveSubscription(sub);
}

// ── ARE-308 Phase 4: Zusatz-Speicher für Fotos & Videos ─────────────────────

export interface StorageTier {
  id: string;
  gb: number;
  priceMonthly: number; // EUR pro Monat
  label: string;        // z.B. "5 GB", "20 GB"
}

export const STORAGE_TIERS: StorageTier[] = [
  { id: 'free',   gb: 0,   priceMonthly: 0,   label: '0 GB (Standard)' },
  { id: '5gb',    gb: 5,   priceMonthly: 1,   label: '5 GB' },
  { id: '20gb',   gb: 20,  priceMonthly: 3,   label: '20 GB' },
  { id: '50gb',   gb: 50,  priceMonthly: 5,   label: '50 GB' },
  { id: '100gb',  gb: 100, priceMonthly: 8,   label: '100 GB' },
];

export interface StorageQuota {
  tierId: string;
  usedBytes: number;
  activatedAt: string;
}

const STORAGE_KEY_QUOTA = 'aregoland_storage_quota';

/** Lädt die Speicher-Quota aus localStorage. */
export function loadStorageQuota(): StorageQuota | null {
  const raw = localStorage.getItem(STORAGE_KEY_QUOTA);
  if (!raw) return null;
  try { return JSON.parse(raw) as StorageQuota; } catch { return null; }
}

/** Speichert die Speicher-Quota. */
export function saveStorageQuota(quota: StorageQuota): void {
  localStorage.setItem(STORAGE_KEY_QUOTA, JSON.stringify(quota));
}

/** Aktiviert einen Speicher-Tier (setzt Abo voraus). */
export function activateStorageTier(tierId: string): StorageQuota | null {
  const tier = STORAGE_TIERS.find(t => t.id === tierId);
  if (!tier) return null;

  // Abo prüfen — Zusatz-Speicher nur mit aktivem Abo
  const sub = loadSubscription();
  if (!sub || !hasAccess(sub)) return null;

  const quota: StorageQuota = {
    tierId,
    usedBytes: loadStorageQuota()?.usedBytes ?? 0,
    activatedAt: new Date().toISOString(),
  };
  saveStorageQuota(quota);
  return quota;
}

/** Gibt den aktiven Tier zurück (oder den Free-Tier). */
export function getActiveStorageTier(): StorageTier {
  const quota = loadStorageQuota();
  if (!quota) return STORAGE_TIERS[0];
  return STORAGE_TIERS.find(t => t.id === quota.tierId) ?? STORAGE_TIERS[0];
}

/** Prüft ob noch Speicherplatz verfügbar ist. */
export function hasStorageAvailable(additionalBytes: number = 0): boolean {
  const quota = loadStorageQuota();
  if (!quota) return false;
  const tier = STORAGE_TIERS.find(t => t.id === quota.tierId);
  if (!tier || tier.gb === 0) return false;
  return (quota.usedBytes + additionalBytes) <= tier.gb * 1024 * 1024 * 1024;
}

/** Aktualisiert den belegten Speicher (z.B. nach Upload). */
export function updateStorageUsed(usedBytes: number): void {
  const quota = loadStorageQuota();
  if (!quota) return;
  quota.usedBytes = usedBytes;
  saveStorageQuota(quota);
}

/** Formatiert ein ISO-Datum als deutsches Datum (TT.MM.JJJJ). */
export function formatDateDE(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

/** Verbleibende Tage bis zu einem Datum. */
export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}
