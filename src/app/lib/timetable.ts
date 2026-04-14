/**
 * Timetable (Stundenplan) — localStorage-based storage for timetable entries.
 * CRUD operations, filtering by space/weekday, and day-specific queries.
 */

import type { TimetableEntry } from "@/app/types";

const STORAGE_KEY = "aregoland_timetable_entries";

// ── CRUD ──

export function loadTimetableEntries(): TimetableEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

export function saveTimetableEntries(entries: TimetableEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function addTimetableEntry(
  entry: Omit<TimetableEntry, "id" | "updatedAt">,
): TimetableEntry {
  const all = loadTimetableEntries();
  const record: TimetableEntry = {
    ...entry,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  all.push(record);
  saveTimetableEntries(all);
  return record;
}

export function updateTimetableEntry(
  id: string,
  patch: Partial<Pick<TimetableEntry,
    | "subject" | "teacherId" | "teacherName" | "room"
    | "weekday" | "startTime" | "endTime"
    | "status" | "substituteTeacherId" | "substituteTeacherName"
    | "substituteRoom" | "statusNote"
  >>,
): void {
  const all = loadTimetableEntries();
  const idx = all.findIndex((e) => e.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
    saveTimetableEntries(all);
  }
}

export function deleteTimetableEntry(id: string): void {
  const all = loadTimetableEntries().filter((e) => e.id !== id);
  saveTimetableEntries(all);
}

// ── Queries ──

export function getEntriesBySpace(spaceId: string): TimetableEntry[] {
  return loadTimetableEntries().filter((e) => e.spaceId === spaceId);
}

export function getEntriesBySpaceAndWeekday(
  spaceId: string,
  weekday: number,
): TimetableEntry[] {
  return loadTimetableEntries().filter(
    (e) => e.spaceId === spaceId && e.weekday === weekday,
  );
}

/**
 * Returns timetable entries for a given date, mapping date to weekday (1-5).
 * Returns empty array for weekends (Sat/Sun).
 */
export function getEntriesForDay(
  spaceId: string,
  date: string,
): TimetableEntry[] {
  const d = new Date(date + "T00:00:00");
  const jsDay = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  if (jsDay === 0 || jsDay === 6) return []; // Weekend
  const weekday = jsDay; // 1=Mon … 5=Fri matches our schema
  return getEntriesBySpaceAndWeekday(spaceId, weekday);
}
