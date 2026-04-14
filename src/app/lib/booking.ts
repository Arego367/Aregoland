/**
 * Booking System — localStorage-based storage for batch-booking templates,
 * slots, and requests (Elternsprechtag, Termine etc.).
 */

import type {
  BookingTemplate,
  BookingSlot,
  BookingRequest,
  SlotStatus,
} from "@/app/types";

const TEMPLATES_KEY = "aregoland_booking_templates";
const REQUESTS_KEY = "aregoland_booking_requests";

// ── Templates CRUD ──

export function loadTemplates(): BookingTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? "[]");
  } catch { return []; }
}

export function saveTemplates(templates: BookingTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export function addTemplate(
  tmpl: Omit<BookingTemplate, "id" | "createdAt" | "slots">,
): BookingTemplate {
  const all = loadTemplates();
  const slots = generateSlots(
    tmpl.startTime,
    tmpl.endTime,
    tmpl.slotDuration,
    tmpl.breakBetween,
  );
  const record: BookingTemplate = {
    ...tmpl,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    slots: slots.map((s) => ({ ...s, templateId: "" })),
  };
  // Backfill templateId into slots
  record.slots = record.slots.map((s) => ({ ...s, templateId: record.id }));
  all.push(record);
  saveTemplates(all);
  return record;
}

export function getTemplate(id: string): BookingTemplate | undefined {
  return loadTemplates().find((t) => t.id === id);
}

export function updateTemplate(
  id: string,
  patch: Partial<Pick<BookingTemplate, "title" | "date" | "maxBookingsPerMember">>,
): void {
  const all = loadTemplates();
  const idx = all.findIndex((t) => t.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch };
    saveTemplates(all);
  }
}

export function removeTemplate(id: string): void {
  const all = loadTemplates().filter((t) => t.id !== id);
  saveTemplates(all);
  // Also remove related requests
  const reqs = loadRequests().filter((r) => r.templateId !== id);
  saveRequests(reqs);
}

export function getTemplatesBySpace(spaceId: string): BookingTemplate[] {
  return loadTemplates().filter((t) => t.spaceId === spaceId);
}

// ── Slot Operations ──

export function generateSlots(
  windowStart: string,
  windowEnd: string,
  durationMin: number,
  breakMin: number,
): Omit<BookingSlot, "templateId">[] {
  const slots: Omit<BookingSlot, "templateId">[] = [];
  let [h, m] = windowStart.split(":").map(Number);
  const [endH, endM] = windowEnd.split(":").map(Number);
  const endTotal = endH * 60 + endM;

  while (h * 60 + m + durationMin <= endTotal) {
    const start = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const endMinutes = h * 60 + m + durationMin;
    const eH = Math.floor(endMinutes / 60);
    const eM = endMinutes % 60;
    const end = `${String(eH).padStart(2, "0")}:${String(eM).padStart(2, "0")}`;

    slots.push({
      id: crypto.randomUUID(),
      startTime: start,
      endTime: end,
      status: "free" as const,
    });

    const nextMinutes = endMinutes + breakMin;
    h = Math.floor(nextMinutes / 60);
    m = nextMinutes % 60;
  }

  return slots;
}

export function updateSlotStatus(
  templateId: string,
  slotId: string,
  status: SlotStatus,
  bookedBy?: string,
): void {
  const all = loadTemplates();
  const tIdx = all.findIndex((t) => t.id === templateId);
  if (tIdx < 0) return;
  const sIdx = all[tIdx].slots.findIndex((s) => s.id === slotId);
  if (sIdx < 0) return;

  all[tIdx].slots[sIdx].status = status;
  if (status === "booked" && bookedBy) {
    all[tIdx].slots[sIdx].bookedBy = bookedBy;
    all[tIdx].slots[sIdx].bookedAt = new Date().toISOString();
  } else if (status === "free") {
    delete all[tIdx].slots[sIdx].bookedBy;
    delete all[tIdx].slots[sIdx].bookedAt;
  }
  saveTemplates(all);
}

export function getFreeSlots(templateId: string): BookingSlot[] {
  const tmpl = getTemplate(templateId);
  if (!tmpl) return [];
  return tmpl.slots.filter((s) => s.status === "free");
}

export function countMemberBookings(templateId: string, memberId: string): number {
  const tmpl = getTemplate(templateId);
  if (!tmpl) return 0;
  return tmpl.slots.filter((s) => s.bookedBy === memberId).length;
}

// ── Requests CRUD ──

export function loadRequests(): BookingRequest[] {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY) ?? "[]");
  } catch { return []; }
}

export function saveRequests(requests: BookingRequest[]): void {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
}

export function addRequest(
  req: Omit<BookingRequest, "id" | "createdAt" | "status">,
): BookingRequest {
  const all = loadRequests();
  const record: BookingRequest = {
    ...req,
    id: crypto.randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  all.push(record);
  saveRequests(all);
  return record;
}

export function updateRequestStatus(
  id: string,
  status: BookingRequest["status"],
  counterSlotId?: string,
): void {
  const all = loadRequests();
  const idx = all.findIndex((r) => r.id === id);
  if (idx >= 0) {
    all[idx].status = status;
    if (counterSlotId) all[idx].counterSlotId = counterSlotId;
    saveRequests(all);
  }
}

export function getRequestsByTemplate(templateId: string): BookingRequest[] {
  return loadRequests().filter((r) => r.templateId === templateId);
}

// ── TTL Cleanup ──

export function purgeExpiredTemplates(retentionDays = 30): number {
  const all = loadTemplates();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const kept = all.filter((t) => t.date >= cutoffStr);
  const removed = all.length - kept.length;
  if (removed > 0) {
    const removedIds = new Set(all.filter((t) => t.date < cutoffStr).map((t) => t.id));
    saveTemplates(kept);
    // Clean up requests for removed templates
    const reqs = loadRequests().filter((r) => !removedIds.has(r.templateId));
    saveRequests(reqs);
  }
  return removed;
}

// ── Privacy filter (member view) ──

export function filterSlotsForMember(slots: BookingSlot[]): Pick<BookingSlot, "id" | "templateId" | "startTime" | "endTime" | "status">[] {
  return slots.map(({ id, templateId, startTime, endTime, status }) => ({
    id,
    templateId,
    startTime,
    endTime,
    status: status === "blocked" ? "blocked" as const : status,
  }));
}
