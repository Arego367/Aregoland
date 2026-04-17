/**
 * Service Worker-based reminder scheduler.
 * Sends reminder data to the SW which persists it in IndexedDB
 * and fires notifications even when the app tab is closed.
 */

import type { CalendarEvent } from "@/app/types";

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function reminderOffsetMs(reminder: CalendarEvent["reminder"], customMinutes?: number): number {
  switch (reminder) {
    case "10min": return 10 * 60_000;
    case "30min": return 30 * 60_000;
    case "1h": return 60 * 60_000;
    case "1day": return 24 * 60 * 60_000;
    case "custom": return (customMinutes ?? 0) * 60_000;
    default: return 0;
  }
}

async function getSW(): Promise<ServiceWorker | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.active;
}

/** Schedule a reminder via the Service Worker */
export async function scheduleReminder(ev: CalendarEvent): Promise<void> {
  if (ev.reminder === "none" || ev.duration === "allday") return;

  const sw = await getSW();
  if (!sw) {
    // Fallback: use setTimeout (existing behavior for no-SW environments)
    fallbackSchedule(ev);
    return;
  }

  const [h, m] = ev.startTime.split(":").map(Number);
  const eventDate = parseDate(ev.date);
  eventDate.setHours(h, m, 0, 0);
  const fireAt = eventDate.getTime() - reminderOffsetMs(ev.reminder, ev.customReminderMinutes);

  if (fireAt <= Date.now()) return; // Already past

  sw.postMessage({
    type: "SCHEDULE_REMINDER",
    reminder: {
      eventId: ev.id,
      title: `Termin: ${ev.title}`,
      body: `${ev.startTime} Uhr`,
      fireAt,
    },
  });
}

/** Cancel a scheduled reminder */
export async function cancelReminder(eventId: string): Promise<void> {
  const sw = await getSW();
  if (!sw) return;
  sw.postMessage({ type: "CANCEL_REMINDER", eventId });
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

/** Fallback for environments without SW support */
function fallbackSchedule(ev: CalendarEvent): void {
  const [h, m] = ev.startTime.split(":").map(Number);
  const eventDate = parseDate(ev.date);
  eventDate.setHours(h, m, 0, 0);
  const fireAt = eventDate.getTime() - reminderOffsetMs(ev.reminder, ev.customReminderMinutes);
  const delay = fireAt - Date.now();
  if (delay <= 0 || delay > 24 * 60 * 60_000) return;
  setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification(`Termin: ${ev.title}`, {
        body: `${ev.startTime} Uhr`,
        icon: "/favicon.ico",
      });
    }
  }, delay);
}
