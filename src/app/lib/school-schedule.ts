/**
 * School Schedule — localStorage-based storage for child schedule configs
 * (OGS/Hort/Bus), school holidays, and day-plan aggregation.
 */

import type {
  ChildScheduleConfig,
  SchoolHoliday,
  DayPlanEntry,
  TimetableEntry,
} from "@/app/types";
import { getEntriesForDay } from "@/app/lib/timetable";

const CONFIGS_KEY = "aregoland_child_schedule_configs";
const HOLIDAYS_KEY = "aregoland_school_holidays";

// ── ChildScheduleConfig CRUD ──

export function loadScheduleConfigs(): ChildScheduleConfig[] {
  try {
    return JSON.parse(localStorage.getItem(CONFIGS_KEY) ?? "[]");
  } catch { return []; }
}

export function saveScheduleConfigs(configs: ChildScheduleConfig[]): void {
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
}

export function addScheduleConfig(
  config: Omit<ChildScheduleConfig, "id" | "updatedAt">,
): ChildScheduleConfig {
  const all = loadScheduleConfigs();
  const record: ChildScheduleConfig = {
    ...config,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  all.push(record);
  saveScheduleConfigs(all);
  return record;
}

export function updateScheduleConfig(
  id: string,
  patch: Partial<Pick<ChildScheduleConfig,
    | "ogsStart" | "ogsEnd" | "busArrival" | "busDeparture"
    | "hortStart" | "hortEnd" | "notes" | "updatedBy"
  >>,
): void {
  const all = loadScheduleConfigs();
  const idx = all.findIndex((c) => c.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
    saveScheduleConfigs(all);
  }
}

export function deleteScheduleConfig(id: string): void {
  const all = loadScheduleConfigs().filter((c) => c.id !== id);
  saveScheduleConfigs(all);
}

export function getConfigByChild(
  childId: string,
  spaceId: string,
): ChildScheduleConfig | undefined {
  return loadScheduleConfigs().find(
    (c) => c.childId === childId && c.spaceId === spaceId,
  );
}

export function getConfigsBySpace(spaceId: string): ChildScheduleConfig[] {
  return loadScheduleConfigs().filter((c) => c.spaceId === spaceId);
}

// ── SchoolHoliday CRUD ──

export function loadHolidays(): SchoolHoliday[] {
  try {
    return JSON.parse(localStorage.getItem(HOLIDAYS_KEY) ?? "[]");
  } catch { return []; }
}

export function saveHolidays(holidays: SchoolHoliday[]): void {
  localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(holidays));
}

export function addHoliday(
  holiday: Omit<SchoolHoliday, "id">,
): SchoolHoliday {
  const all = loadHolidays();
  const record: SchoolHoliday = {
    ...holiday,
    id: crypto.randomUUID(),
  };
  all.push(record);
  saveHolidays(all);
  return record;
}

export function updateHoliday(
  id: string,
  patch: Partial<Pick<SchoolHoliday, "title" | "startDate" | "endDate" | "type">>,
): void {
  const all = loadHolidays();
  const idx = all.findIndex((h) => h.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch };
    saveHolidays(all);
  }
}

export function deleteHoliday(id: string): void {
  const all = loadHolidays().filter((h) => h.id !== id);
  saveHolidays(all);
}

export function getHolidaysBySpace(spaceId: string): SchoolHoliday[] {
  return loadHolidays().filter((h) => h.spaceId === spaceId);
}

export function getHolidayForDate(
  spaceId: string,
  date: string,
): SchoolHoliday | undefined {
  return getHolidaysBySpace(spaceId).find(
    (h) => h.startDate <= date && h.endDate >= date,
  );
}

// ── Day Plan Aggregation ──

/**
 * Builds a sorted day plan for a child on a given date by merging:
 * - Timetable entries (lessons) for the space/weekday
 * - OGS/Hort/Bus blocks from the child's schedule config
 *
 * Returns empty array on holidays/closures.
 */
export function buildDayPlan(
  childId: string,
  date: string,
  spaceId: string,
): DayPlanEntry[] {
  // Check for holiday — no school on holidays
  const holiday = getHolidayForDate(spaceId, date);
  if (holiday) return [];

  const entries: DayPlanEntry[] = [];

  // Timetable lessons
  const lessons = getEntriesForDay(spaceId, date);
  for (const lesson of lessons) {
    entries.push({
      time: lesson.startTime,
      endTime: lesson.endTime,
      type: "lesson",
      label: lesson.subject,
      detail: lesson.status === "substitution"
        ? `Vertretung: ${lesson.substituteTeacherName ?? "?"} (${lesson.substituteRoom ?? lesson.room})`
        : `${lesson.teacherName} — ${lesson.room}`,
      status: lesson.status,
    });
  }

  // Child schedule config (OGS/Bus/Hort)
  const config = getConfigByChild(childId, spaceId);
  if (config) {
    if (config.busArrival) {
      entries.push({
        time: config.busArrival,
        endTime: config.busArrival,
        type: "bus",
        label: "Bus Ankunft",
      });
    }
    if (config.ogsStart && config.ogsEnd) {
      entries.push({
        time: config.ogsStart,
        endTime: config.ogsEnd,
        type: "ogs",
        label: "OGS",
      });
    }
    if (config.hortStart && config.hortEnd) {
      entries.push({
        time: config.hortStart,
        endTime: config.hortEnd,
        type: "hort",
        label: "Hort",
      });
    }
    if (config.busDeparture) {
      entries.push({
        time: config.busDeparture,
        endTime: config.busDeparture,
        type: "bus",
        label: "Bus Abfahrt",
      });
    }
  }

  // Sort by start time
  entries.sort((a, b) => a.time.localeCompare(b.time));

  return entries;
}
