/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// ── Workbox Precaching ──────────────────────────────────────────────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ── Reminder Storage (IndexedDB) ────────────────────────────────────────────

interface ScheduledReminder {
  eventId: string;
  title: string;
  body: string;
  fireAt: number; // Unix ms
}

const DB_NAME = "aregoland_reminders";
const STORE_NAME = "reminders";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "eventId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveReminder(reminder: ScheduledReminder): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(reminder);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteReminder(eventId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(eventId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getDueReminders(): Promise<ScheduledReminder[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const now = Date.now();
      resolve((req.result as ScheduledReminder[]).filter((r) => r.fireAt <= now));
    };
    req.onerror = () => reject(req.error);
  });
}

async function getAllReminders(): Promise<ScheduledReminder[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as ScheduledReminder[]);
    req.onerror = () => reject(req.error);
  });
}

// ── Fire Due Reminders ──────────────────────────────────────────────────────

async function fireDueReminders(): Promise<void> {
  const due = await getDueReminders();
  for (const reminder of due) {
    await self.registration.showNotification(reminder.title, {
      body: reminder.body,
      icon: "/favicon.ico",
      badge: "/pwa-192x192.png",
      tag: `reminder-${reminder.eventId}`,
    });
    await deleteReminder(reminder.eventId);
  }
}

// Schedule a timer to fire the next upcoming reminder
let nextTimer: ReturnType<typeof setTimeout> | null = null;

async function scheduleNextCheck(): Promise<void> {
  if (nextTimer) clearTimeout(nextTimer);
  const all = await getAllReminders();
  if (all.length === 0) return;

  const now = Date.now();
  // Find the nearest future reminder
  const upcoming = all.filter((r) => r.fireAt > now).sort((a, b) => a.fireAt - b.fireAt);
  if (upcoming.length === 0) {
    // All are past-due, fire them now
    await fireDueReminders();
    return;
  }

  const delay = Math.min(upcoming[0].fireAt - now, 5 * 60 * 1000); // cap at 5min to survive SW lifecycle
  nextTimer = setTimeout(async () => {
    await fireDueReminders();
    await scheduleNextCheck();
  }, delay);
}

// ── Message Handler ─────────────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === "SCHEDULE_REMINDER") {
    const reminder: ScheduledReminder = data.reminder;
    event.waitUntil(
      saveReminder(reminder).then(() => scheduleNextCheck())
    );
  }

  if (data.type === "CANCEL_REMINDER") {
    event.waitUntil(
      deleteReminder(data.eventId).then(() => scheduleNextCheck())
    );
  }

  if (data.type === "CHECK_REMINDERS") {
    event.waitUntil(fireDueReminders().then(() => scheduleNextCheck()));
  }
});

// ── Lifecycle Events ────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await fireDueReminders();
      await scheduleNextCheck();
    })()
  );
});

// On notification click, focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
