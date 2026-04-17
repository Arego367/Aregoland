/**
 * Service Worker-based reminder scheduler.
 * Sends reminder data to the SW which persists it in IndexedDB
 * and fires notifications even when the app tab is closed.
 */

import type { CalendarEvent, EventReminder, EventReminderPreset } from "@/app/types";

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function presetOffsetMs(preset: EventReminderPreset, customMinutes?: number): number {
  switch (preset) {
    case "10min": return 10 * 60_000;
    case "30min": return 30 * 60_000;
    case "1h": return 60 * 60_000;
    case "1day": return 24 * 60 * 60_000;
    case "custom": return (customMinutes ?? 0) * 60_000;
    default: return 0;
  }
}

function reminderOffsetMs(reminder: CalendarEvent["reminder"], customMinutes?: number): number {
  return presetOffsetMs(reminder, customMinutes);
}

async function getSW(): Promise<ServiceWorker | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.active;
}

/** Schedule reminders via the Service Worker (supports multiple reminders) */
export async function scheduleReminder(ev: CalendarEvent): Promise<void> {
  if (ev.duration === "allday") return;

  // Collect all reminder entries: prefer new reminders array, fallback to legacy single
  const reminders: EventReminder[] =
    ev.reminders && ev.reminders.length > 0
      ? ev.reminders
      : ev.reminder !== "none"
        ? [{ preset: ev.reminder, customMinutes: ev.customReminderMinutes }]
        : [];

  if (reminders.length === 0) return;

  const sw = await getSW();
  const [h, m] = ev.startTime.split(":").map(Number);
  const eventDate = parseDate(ev.date);
  eventDate.setHours(h, m, 0, 0);
  const eventMs = eventDate.getTime();

  for (let i = 0; i < reminders.length; i++) {
    const r = reminders[i];
    if (r.preset === 'none') continue;
    const fireAt = eventMs - presetOffsetMs(r.preset, r.customMinutes);
    if (fireAt <= Date.now()) continue;

    const reminderId = reminders.length === 1 ? ev.id : `${ev.id}:r${i}`;

    if (!sw) {
      fallbackScheduleSingle(ev.title, ev.startTime, fireAt);
      continue;
    }

    sw.postMessage({
      type: "SCHEDULE_REMINDER",
      reminder: {
        eventId: reminderId,
        title: `Termin: ${ev.title}`,
        body: `${ev.startTime} Uhr`,
        fireAt,
      },
    });
  }
}

/** Cancel all scheduled reminders for an event (including multi-reminder variants) */
export async function cancelReminder(eventId: string): Promise<void> {
  const sw = await getSW();
  if (!sw) return;
  // Cancel main id + up to 10 sub-ids (r0..r9)
  sw.postMessage({ type: "CANCEL_REMINDER", eventId });
  for (let i = 0; i < 10; i++) {
    sw.postMessage({ type: "CANCEL_REMINDER", eventId: `${eventId}:r${i}` });
  }
}

/** Tell the SW to check for due reminders now */
export async function checkReminders(): Promise<void> {
  const sw = await getSW();
  if (!sw) return;
  sw.postMessage({ type: "CHECK_REMINDERS" });
}

// ── Booking Slot Reminders ──────────────────────────────────────────────────

export type SlotReminderOffset = '10min' | '30min' | '1h';

function slotReminderOffsetMs(offset: SlotReminderOffset): number {
  switch (offset) {
    case '10min': return 10 * 60_000;
    case '30min': return 30 * 60_000;
    case '1h': return 60 * 60_000;
    default: return 10 * 60_000;
  }
}

export interface SlotReminderInfo {
  slotId: string;
  templateId: string;
  spaceId: string;
  title: string;
  startTime: string;   // ISO datetime
}

/** Schedule a reminder for a booked slot */
export async function scheduleSlotReminder(
  slot: SlotReminderInfo,
  offset: SlotReminderOffset = '10min',
): Promise<void> {
  const fireAt = new Date(slot.startTime).getTime() - slotReminderOffsetMs(offset);
  if (fireAt <= Date.now()) return;

  const sw = await getSW();
  if (!sw) {
    fallbackSlotSchedule(slot, fireAt);
    return;
  }

  sw.postMessage({
    type: 'SCHEDULE_REMINDER',
    reminder: {
      eventId: `slot:${slot.slotId}`,
      title: `Buchung: ${slot.title}`,
      body: `Startet um ${new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} Uhr`,
      fireAt,
    },
  });
}

/** Cancel a slot reminder */
export async function cancelSlotReminder(slotId: string): Promise<void> {
  await cancelReminder(`slot:${slotId}`);
}

// ── Timetable Cancellation Notifications ──────────────────────────────────

export interface CancellationNotification {
  entryId: string;
  spaceId: string;
  subject: string;
  startTime: string;   // HH:mm
  newStatus: 'cancelled' | 'substitution';
  substituteTeacherName?: string;
}

/** Fire an immediate push notification for a timetable cancellation/substitution */
export async function notifyCancellation(info: CancellationNotification): Promise<void> {
  const title = info.newStatus === 'cancelled'
    ? `${info.subject} fällt aus`
    : `${info.subject} — Vertretung`;
  const body = info.newStatus === 'cancelled'
    ? `${info.subject} um ${info.startTime} Uhr fällt heute aus.`
    : `${info.subject} um ${info.startTime} Uhr — Vertretung durch ${info.substituteTeacherName ?? '?'}`;

  const sw = await getSW();
  if (sw) {
    sw.postMessage({
      type: 'SCHEDULE_REMINDER',
      reminder: {
        eventId: `cancel:${info.entryId}`,
        title,
        body,
        fireAt: Date.now() + 500, // fire immediately (small delay for SW processing)
      },
    });
  } else if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

function fallbackSlotSchedule(slot: SlotReminderInfo, fireAt: number): void {
  const delay = fireAt - Date.now();
  if (delay <= 0 || delay > 24 * 60 * 60_000) return;
  setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification(`Buchung: ${slot.title}`, {
        body: `Startet um ${new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} Uhr`,
        icon: '/favicon.ico',
      });
    }
  }, delay);
}

/** Fallback for a single reminder in environments without SW support */
function fallbackScheduleSingle(title: string, startTime: string, fireAt: number): void {
  const delay = fireAt - Date.now();
  if (delay <= 0 || delay > 24 * 60 * 60_000) return;
  setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification(`Termin: ${title}`, {
        body: `${startTime} Uhr`,
        icon: "/favicon.ico",
      });
    }
  }, delay);
}
