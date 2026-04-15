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

/** Formatiert ein ISO-Datum als deutsches Datum (TT.MM.JJJJ). */
export function formatDateDE(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

/** Verbleibende Tage bis zu einem Datum. */
export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}
