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

function reminderOffsetMs(reminder: CalendarEvent["reminder"]): number {
  switch (reminder) {
    case "10min": return 10 * 60_000;
    case "30min": return 30 * 60_000;
    case "1h": return 60 * 60_000;
    case "1day": return 24 * 60 * 60_000;
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
  const fireAt = eventDate.getTime() - reminderOffsetMs(ev.reminder);

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

/** Fallback for environments without SW support */
function fallbackSchedule(ev: CalendarEvent): void {
  const [h, m] = ev.startTime.split(":").map(Number);
  const eventDate = parseDate(ev.date);
  eventDate.setHours(h, m, 0, 0);
  const fireAt = eventDate.getTime() - reminderOffsetMs(ev.reminder);
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
