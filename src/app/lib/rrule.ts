/**
 * Minimal RRULE parser/expander (RFC 5545 subset).
 * Supports FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL, BYDAY.
 * Exception dates (EXDATE) are handled externally via CalendarEvent.exdates.
 */

import type { RecurrenceFreq } from "@/app/types";

export interface ParsedRRule {
  freq: RecurrenceFreq;
  interval: number;
  count?: number;
  until?: string; // YYYY-MM-DD
  byday?: string[]; // e.g. ["MO","WE","FR"]
}

/** Parse an RRULE string like "FREQ=WEEKLY;INTERVAL=2;COUNT=10" */
export function parseRRule(rrule: string): ParsedRRule | null {
  if (!rrule) return null;
  const parts: Record<string, string> = {};
  for (const segment of rrule.split(";")) {
    const [key, val] = segment.split("=");
    if (key && val) parts[key.toUpperCase()] = val;
  }
  const freq = parts["FREQ"] as RecurrenceFreq | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;

  return {
    freq,
    interval: parts["INTERVAL"] ? Math.max(1, parseInt(parts["INTERVAL"], 10)) : 1,
    count: parts["COUNT"] ? parseInt(parts["COUNT"], 10) : undefined,
    until: parts["UNTIL"] ? normalizeUntilDate(parts["UNTIL"]) : undefined,
    byday: parts["BYDAY"] ? parts["BYDAY"].split(",") : undefined,
  };
}

/** Build an RRULE string from components */
export function buildRRule(opts: {
  freq: RecurrenceFreq;
  interval?: number;
  count?: number;
  until?: string;
}): string {
  let rule = `FREQ=${opts.freq}`;
  if (opts.interval && opts.interval > 1) rule += `;INTERVAL=${opts.interval}`;
  if (opts.count) rule += `;COUNT=${opts.count}`;
  if (opts.until) rule += `;UNTIL=${opts.until.replace(/-/g, "")}`;
  return rule;
}

function normalizeUntilDate(val: string): string {
  // Accept both YYYYMMDD and YYYY-MM-DD
  const cleaned = val.replace(/T.*$/, "").replace(/-/g, "");
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  return val;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addToDate(d: Date, freq: RecurrenceFreq, interval: number): Date {
  const next = new Date(d);
  switch (freq) {
    case "DAILY":
      next.setDate(next.getDate() + interval);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7 * interval);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + interval);
      break;
    case "YEARLY":
      next.setFullYear(next.getFullYear() + interval);
      break;
  }
  return next;
}

/**
 * Expand a recurring event into occurrence dates within [rangeStart, rangeEnd].
 * Returns an array of YYYY-MM-DD strings (excluding exdates).
 * Caps expansion at 400 occurrences for safety.
 */
export function expandRecurrence(
  startDate: string,
  rrule: string,
  rangeStart: string,
  rangeEnd: string,
  exdates?: string[],
): string[] {
  const parsed = parseRRule(rrule);
  if (!parsed) return [startDate];

  const exSet = new Set(exdates ?? []);
  const rangeStartDate = parseDateStr(rangeStart);
  const rangeEndDate = parseDateStr(rangeEnd);
  const results: string[] = [];
  let current = parseDateStr(startDate);
  const untilDate = parsed.until ? parseDateStr(parsed.until) : null;
  let count = 0;
  const maxOccurrences = parsed.count ?? 400;

  while (count < maxOccurrences) {
    if (untilDate && current > untilDate) break;
    if (current > rangeEndDate) break;

    const ds = toDateStr(current);
    if (current >= rangeStartDate && !exSet.has(ds)) {
      results.push(ds);
    }

    count++;
    current = addToDate(current, parsed.freq, parsed.interval);
  }

  return results;
}

/** Human-readable summary of an RRULE for display */
export function rruleLabel(rrule: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const parsed = parseRRule(rrule);
  if (!parsed) return "";
  const interval = parsed.interval;
  switch (parsed.freq) {
    case "DAILY":
      return interval === 1 ? t("calendar.recurDaily") : t("calendar.recurEveryNDays", { n: interval });
    case "WEEKLY":
      return interval === 1 ? t("calendar.recurWeekly") : t("calendar.recurEveryNWeeks", { n: interval });
    case "MONTHLY":
      return interval === 1 ? t("calendar.recurMonthly") : t("calendar.recurEveryNMonths", { n: interval });
    case "YEARLY":
      return interval === 1 ? t("calendar.recurYearly") : t("calendar.recurEveryNYears", { n: interval });
  }
}
