/**
 * Member Absence Status — localStorage-based storage for absence/status system.
 * Supports offline queue for buffered reports when offline.
 */

import type { MemberAbsenceStatus, AbsenceVisibility } from "@/app/types";

const STATUS_KEY = "aregoland_absence_statuses";
const QUEUE_KEY = "aregoland_absence_queue";

// ── CRUD ──

export function loadAbsenceStatuses(): MemberAbsenceStatus[] {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) ?? "[]");
  } catch { return []; }
}

export function saveAbsenceStatuses(statuses: MemberAbsenceStatus[]): void {
  localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
}

export function addAbsenceStatus(
  status: Omit<MemberAbsenceStatus, "id" | "reportedAt">,
): MemberAbsenceStatus {
  const all = loadAbsenceStatuses();
  const record: MemberAbsenceStatus = {
    ...status,
    id: crypto.randomUUID(),
    reportedAt: new Date().toISOString(),
  };
  all.push(record);
  saveAbsenceStatuses(all);
  return record;
}

export function updateAbsenceStatus(
  id: string,
  patch: Partial<Pick<MemberAbsenceStatus, "type" | "label" | "startDate" | "endDate" | "note">>,
): void {
  const all = loadAbsenceStatuses();
  const idx = all.findIndex((s) => s.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch };
    saveAbsenceStatuses(all);
  }
}

export function removeAbsenceStatus(id: string): void {
  const all = loadAbsenceStatuses().filter((s) => s.id !== id);
  saveAbsenceStatuses(all);
}

export function deleteAllAbsenceStatuses(): void {
  localStorage.removeItem(STATUS_KEY);
}

// ── Queries ──

export function getAbsencesBySpace(spaceId: string): MemberAbsenceStatus[] {
  return loadAbsenceStatuses().filter((s) => s.spaceId === spaceId);
}

export function getAbsencesByMember(memberId: string): MemberAbsenceStatus[] {
  return loadAbsenceStatuses().filter((s) => s.memberId === memberId);
}

export function getActiveAbsences(spaceId: string, date: string): MemberAbsenceStatus[] {
  return getAbsencesBySpace(spaceId).filter((s) => {
    if (s.startDate > date) return false;
    if (s.endDate && s.endDate < date) return false;
    return true;
  });
}

// ── Visibility ──

export function resolveVisibility(
  viewerRole: "moderator" | "member" | "external",
  sameSpace: boolean,
): AbsenceVisibility {
  if (!sameSpace) return "none";
  if (viewerRole === "moderator") return "full";
  if (viewerRole === "member") return "limited";
  return "none";
}

export function filterByVisibility(
  statuses: MemberAbsenceStatus[],
  visibility: AbsenceVisibility,
): Partial<MemberAbsenceStatus>[] {
  if (visibility === "none") return [];
  if (visibility === "full") return statuses;
  // limited: strip note, label, reportedBy
  return statuses.map(({ note, label, reportedBy, ...rest }) => rest);
}

// ── Offline Queue ──

export interface QueuedAbsenceReport {
  status: Omit<MemberAbsenceStatus, "id" | "reportedAt">;
  queuedAt: string;
}

export function queueAbsenceReport(status: QueuedAbsenceReport["status"]): void {
  const queue = loadAbsenceQueue();
  queue.push({ status, queuedAt: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function loadAbsenceQueue(): QueuedAbsenceReport[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch { return []; }
}

export function clearAbsenceQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export function flushAbsenceQueue(): MemberAbsenceStatus[] {
  const queue = loadAbsenceQueue();
  const created = queue.map((q) => addAbsenceStatus(q.status));
  clearAbsenceQueue();
  return created;
}
