import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, X, Trash2, Edit2, Clock, CalendarPlus, Search, Repeat, Layers, UserPlus, Check, XCircle, HelpCircle, Timer, GripVertical, Settings, ChevronDown, ChevronUp, Tag, Save, BellOff, Bell, Users, Cake, Import, PenLine } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import ProfileAvatar from "./ProfileAvatar";
import AppHeader from "./AppHeader";
import { motion, AnimatePresence } from "motion/react";
import type { CalendarEvent, RecurrenceFreq, CalendarLayer, EventInvitee, InviteStatus, TimeBlock, TimeBlockType, TimeBlockBuffer, TimeBlockReminder, CalendarLabel, CalendarEventDefaults, DoNotDisturbSettings, DndNotificationMode, Tab, Contact, CalendarBirthday, BirthdayReminder, BirthdayReminderPreset, EventReminder, EventReminderPreset } from "@/app/types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { expandRecurrence, buildRRule, rruleLabel } from "@/app/lib/rrule";
import { scheduleReminder as scheduleSWReminder, cancelReminder, checkReminders } from "@/app/lib/reminder-scheduler";
import { loadInvitations, invitationsToEvents, updateRsvp, type ReceivedInvitation } from "@/app/lib/calendar-invitations";
import { loadContacts, type StoredContact } from "@/app/auth/contacts";

// ── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "arego_calendar_events";

function loadEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const events: CalendarEvent[] = raw ? JSON.parse(raw) : [];
    // Migrate: if event has no reminders array, create one from the legacy single reminder field
    for (const ev of events) {
      if (!ev.reminders) {
        if (ev.reminder && ev.reminder !== 'none') {
          ev.reminders = [{ preset: ev.reminder, customMinutes: ev.customReminderMinutes }];
        } else {
          ev.reminders = [];
        }
      }
    }
    return events;
  } catch { return []; }
}

function saveEvents(events: CalendarEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

// ── Labels Persistence ──────────────────────────────────────────────────────

const LABELS_KEY = "arego_calendar_labels";

function loadLabels(): CalendarLabel[] {
  try {
    const raw = localStorage.getItem(LABELS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLabels(labels: CalendarLabel[]) {
  localStorage.setItem(LABELS_KEY, JSON.stringify(labels));
}

// ── Event Defaults Persistence ──────────────────────────────────────────────

const DEFAULTS_KEY = "arego_calendar_event_defaults";

const INITIAL_DEFAULTS: CalendarEventDefaults = {
  duration: "1h",
  reminder: "10min",
  recurrence: "none",
  color: "blue",
};

function loadDefaults(): CalendarEventDefaults {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    return raw ? { ...INITIAL_DEFAULTS, ...JSON.parse(raw) } : INITIAL_DEFAULTS;
  } catch { return INITIAL_DEFAULTS; }
}

function saveDefaults(defaults: CalendarEventDefaults) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
}

// ── Birthday Persistence ────────────────────────────────────────────────────

const BIRTHDAYS_KEY = "arego_calendar_birthdays";

function loadBirthdays(): CalendarBirthday[] {
  try {
    const raw = localStorage.getItem(BIRTHDAYS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveBirthdays(birthdays: CalendarBirthday[]) {
  localStorage.setItem(BIRTHDAYS_KEY, JSON.stringify(birthdays));
}

const DEFAULT_BIRTHDAY_REMINDERS: BirthdayReminder[] = [
  { preset: '1week' },
  { preset: '1day' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLORS = [
  { id: "blue", bg: "bg-blue-600", dot: "bg-blue-400", ring: "ring-blue-500" },
  { id: "purple", bg: "bg-purple-600", dot: "bg-purple-400", ring: "ring-purple-500" },
  { id: "pink", bg: "bg-pink-600", dot: "bg-pink-400", ring: "ring-pink-500" },
  { id: "green", bg: "bg-green-600", dot: "bg-green-400", ring: "ring-green-500" },
  { id: "orange", bg: "bg-orange-600", dot: "bg-orange-400", ring: "ring-orange-500" },
  { id: "teal", bg: "bg-teal-600", dot: "bg-teal-400", ring: "ring-teal-500" },
];

const DURATIONS: { value: CalendarEvent["duration"]; labelKey: string }[] = [
  { value: "15min", labelKey: "calendar.dur15min" },
  { value: "30min", labelKey: "calendar.dur30min" },
  { value: "1h", labelKey: "calendar.dur1h" },
  { value: "2h", labelKey: "calendar.dur2h" },
  { value: "allday", labelKey: "calendar.durAllDay" },
];

const REMINDERS: { value: CalendarEvent["reminder"]; labelKey: string }[] = [
  { value: "none", labelKey: "calendar.remNone" },
  { value: "10min", labelKey: "calendar.rem10min" },
  { value: "30min", labelKey: "calendar.rem30min" },
  { value: "1h", labelKey: "calendar.rem1h" },
  { value: "1day", labelKey: "calendar.rem1day" },
];

const RECURRENCES: { value: RecurrenceFreq | "none"; labelKey: string }[] = [
  { value: "none", labelKey: "calendar.recurNone" },
  { value: "DAILY", labelKey: "calendar.recurDaily" },
  { value: "WEEKLY", labelKey: "calendar.recurWeekly" },
  { value: "MONTHLY", labelKey: "calendar.recurMonthly" },
  { value: "YEARLY", labelKey: "calendar.recurYearly" },
];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Montag-basierte Wochentag-Nummer (0=Mo, 6=So) */
function weekdayMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const startPad = weekdayMon(first);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function durationMinutes(dur: CalendarEvent["duration"], customMinutes?: number): number {
  switch (dur) {
    case "15min": return 15;
    case "30min": return 30;
    case "1h": return 60;
    case "2h": return 120;
    case "allday": return 0;
    case "custom": return customMinutes ?? 60;
  }
}

/** Add minutes to a HH:mm time string and return the result as HH:mm */
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 24 * 60 - 1);
  const rh = Math.floor(total / 60);
  const rm = total % 60;
  return `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
}

/** Convert start + end time strings to duration in minutes */
function timeDiffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function getColor(id: string): { id: string; bg: string; dot: string; ring: string; hex?: string } {
  if (id.startsWith("#")) {
    return { id, bg: "", dot: "", ring: "", hex: id };
  }
  return COLORS.find((c) => c.id === id) ?? COLORS[0];
}

/** Get inline style for hex colors or empty object for Tailwind colors */
function colorStyle(id: string): React.CSSProperties {
  if (id.startsWith("#")) return { backgroundColor: id };
  return {};
}

/** Get CSS class for color - returns Tailwind class or empty string for hex */
function colorBgClass(id: string): string {
  if (id.startsWith("#")) return "";
  return getColor(id).bg;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Row-based Layout Algorithm (ARE-218 v2) ─────────────────────────────────

const MIN_ROW_PX = 24;
const MAX_ROW_PX = 47;

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatMinuteOfDay(m: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(m)));
  const h = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

type RowPlanEntry =
  | { kind: "free"; startMin: number; endMin: number }
  | { kind: "event"; event: CalendarEvent; position: "only" | "top" | "bottom" };

interface RowPlan {
  rows: RowPlanEntry[];
  droppedAddresses: boolean;
}

interface PlanBlock {
  kind: "event" | "free";
  event?: CalendarEvent;
  eventRows?: 1 | 2;
  startMin?: number;
  endMin?: number;
  freeRows?: number;
}

function buildBlocks(
  timed: { event: CalendarEvent; startMin: number; endMin: number }[],
  useAddresses: boolean,
): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  let cursor = 0;
  for (const t of timed) {
    if (t.startMin > cursor) {
      blocks.push({ kind: "free", startMin: cursor, endMin: t.startMin, freeRows: 1 });
    }
    const hasAddr = useAddresses && !!t.event.address?.trim();
    blocks.push({ kind: "event", event: t.event, eventRows: hasAddr ? 2 : 1 });
    cursor = Math.max(cursor, t.endMin);
  }
  if (cursor < 24 * 60) {
    blocks.push({ kind: "free", startMin: cursor, endMin: 24 * 60, freeRows: 1 });
  }
  if (blocks.length === 0) {
    blocks.push({ kind: "free", startMin: 0, endMin: 24 * 60, freeRows: 1 });
  }
  return blocks;
}

function totalRows(blocks: PlanBlock[]): number {
  return blocks.reduce(
    (s, b) => s + (b.kind === "event" ? b.eventRows! : b.freeRows!),
    0,
  );
}

function distributeSplits(blocks: PlanBlock[], neededExtras: number): void {
  if (neededExtras <= 0) return;
  const freeBlocks = blocks.filter((b) => b.kind === "free");
  if (freeBlocks.length === 0) return;
  const totalFreeMin = freeBlocks.reduce((s, b) => s + (b.endMin! - b.startMin!), 0);
  if (totalFreeMin <= 0) return;
  let assigned = 0;
  for (let i = 0; i < freeBlocks.length; i++) {
    const b = freeBlocks[i];
    const share = (b.endMin! - b.startMin!) / totalFreeMin;
    const extra =
      i === freeBlocks.length - 1
        ? neededExtras - assigned
        : Math.round(share * neededExtras);
    b.freeRows! += Math.max(0, extra);
    assigned += extra;
  }
  // Cap each free block at its minute count (don't split 10min into 30 rows).
  for (const b of freeBlocks) {
    const maxSplits = Math.max(1, b.endMin! - b.startMin!);
    if (b.freeRows! > maxSplits) b.freeRows = maxSplits;
  }
}

function computeRowPlan(events: CalendarEvent[], H: number): RowPlan {
  const timed = events
    .filter((e) => e.duration !== "allday")
    .map((e) => {
      const startMin = toMinutes(e.startTime);
      const endMin = Math.min(24 * 60, startMin + durationMinutes(e.duration, e.customDurationMinutes));
      return { event: e, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const effectiveH = Math.max(0, H);

  // Step 1: try with addresses
  let blocks = buildBlocks(timed, true);
  let T = totalRows(blocks);

  if (effectiveH > 0) {
    const targetMin = Math.ceil(effectiveH / MAX_ROW_PX); // need ≥ this many rows so base ≤ MAX
    const targetMax = Math.max(1, Math.floor(effectiveH / MIN_ROW_PX)); // at most this before rows shrink below MIN
    const targetT = Math.max(T, Math.min(targetMin, targetMax));
    distributeSplits(blocks, targetT - T);
    T = totalRows(blocks);
  }

  let base = effectiveH > 0 ? effectiveH / Math.max(1, T) : MIN_ROW_PX;
  let droppedAddresses = false;

  // Step 2: if still too tight (rows would shrink below MIN), drop addresses and re-split
  if (effectiveH > 0 && base < MIN_ROW_PX) {
    droppedAddresses = true;
    blocks = buildBlocks(timed, false);
    T = totalRows(blocks);
    const targetMin = Math.ceil(effectiveH / MAX_ROW_PX);
    const targetMax = Math.max(1, Math.floor(effectiveH / MIN_ROW_PX));
    const targetT = Math.max(T, Math.min(targetMin, targetMax));
    distributeSplits(blocks, targetT - T);
    T = totalRows(blocks);
    base = effectiveH / Math.max(1, T);
  }

  const rows: RowPlanEntry[] = [];
  for (const b of blocks) {
    if (b.kind === "event") {
      const n = b.eventRows!;
      if (n === 1) {
        rows.push({ kind: "event", event: b.event!, position: "only" });
      } else {
        rows.push({ kind: "event", event: b.event!, position: "top" });
        rows.push({ kind: "event", event: b.event!, position: "bottom" });
      }
    } else {
      const n = Math.max(1, b.freeRows!);
      const span = (b.endMin! - b.startMin!) / n;
      for (let i = 0; i < n; i++) {
        rows.push({
          kind: "free",
          startMin: b.startMin! + i * span,
          endMin: b.startMin! + (i + 1) * span,
        });
      }
    }
  }

  return { rows, droppedAddresses };
}

function useElementHeight<T extends HTMLElement>(
  ref: React.RefObject<T>,
): number {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setH(el.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setH(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}

interface DayRowStackProps {
  events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent) => void;
  onClickFreeSlot?: (startMin: number, endMin: number) => void;
  height: number;
  freeLabel: string;
  density?: "normal" | "compact";
  timeBlocks?: TimeBlock[];
}

function DayRowStack({
  events,
  onSelectEvent,
  onClickFreeSlot,
  height,
  freeLabel,
  density = "normal",
  timeBlocks,
}: DayRowStackProps) {
  const plan = useMemo(() => computeRowPlan(events, height), [events, height]);

  // Compute time-block grid overlays
  const tbOverlays = useMemo(() => {
    if (!timeBlocks || timeBlocks.length === 0 || plan.rows.length === 0) return [];
    // Build time range for each row
    const rowTimes: { startMin: number; endMin: number }[] = [];
    for (let i = 0; i < plan.rows.length; i++) {
      const row = plan.rows[i];
      if (row.kind === "free") {
        rowTimes.push({ startMin: row.startMin, endMin: row.endMin });
      } else {
        const ev = row.event;
        const evStart = toMinutes(ev.startTime);
        const evEnd = Math.min(24 * 60, evStart + durationMinutes(ev.duration, ev.customDurationMinutes));
        if (row.position === "only") {
          rowTimes.push({ startMin: evStart, endMin: evEnd });
        } else if (row.position === "top") {
          rowTimes.push({ startMin: evStart, endMin: (evStart + evEnd) / 2 });
        } else {
          rowTimes.push({ startMin: (evStart + evEnd) / 2, endMin: evEnd });
        }
      }
    }
    // For each timeBlock, find overlapping row range
    return timeBlocks.map((tb) => {
      const tbStart = toMinutes(tb.startTime);
      const tbEnd = toMinutes(tb.endTime);
      let firstRow = -1;
      let lastRow = -1;
      for (let r = 0; r < rowTimes.length; r++) {
        if (rowTimes[r].endMin > tbStart && rowTimes[r].startMin < tbEnd) {
          if (firstRow === -1) firstRow = r;
          lastRow = r;
        }
      }
      if (firstRow === -1) return null;
      return { tb, gridRowStart: firstRow + 1, gridRowEnd: lastRow + 2 };
    }).filter(Boolean) as { tb: TimeBlock; gridRowStart: number; gridRowEnd: number }[];
  }, [timeBlocks, plan.rows]);

  // Map each row index to its covering TimeBlock (if any)
  const rowTimeBlock = useMemo(() => {
    const map = new Map<number, TimeBlock>();
    for (const ov of tbOverlays) {
      for (let r = ov.gridRowStart - 1; r < ov.gridRowEnd - 1; r++) {
        map.set(r, ov.tb);
      }
    }
    return map;
  }, [tbOverlays]);

  if (height <= 0 || plan.rows.length === 0) return null;
  const compact = density === "compact";

  return (
    <div
      className="w-full h-full grid overflow-hidden relative"
      style={{ gridTemplateRows: `repeat(${plan.rows.length}, minmax(0, 1fr))` }}
    >
      {plan.rows.map((row, i) => {
        const tb = rowTimeBlock.get(i);
        if (row.kind === "free") {
          if (tb) {
            // Row inside a time block — show block background + name
            const interruptible = tb.isInterruptible;
            return (
              <button
                key={i}
                onClick={interruptible ? () => onClickFreeSlot?.(row.startMin, row.endMin) : undefined}
                className={`flex items-center ${compact ? "px-1.5" : "px-3"} border-t border-blue-500/15 overflow-hidden text-left transition-colors ${interruptible ? "bg-blue-500/10 text-blue-400/70 hover:bg-blue-500/18 cursor-pointer" : "bg-blue-500/8 text-blue-400/50 cursor-not-allowed opacity-80"}`}
                style={{ fontSize: compact ? "10px" : "11px", lineHeight: 1 }}
                disabled={!interruptible}
              >
                <span className="truncate">
                  {formatMinuteOfDay(row.startMin)} – {formatMinuteOfDay(row.endMin)} · {tb.name}
                </span>
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => onClickFreeSlot?.(row.startMin, row.endMin)}
              className={`flex items-center ${compact ? "px-1.5" : "px-3"} border-t border-gray-800/40 text-gray-500 italic hover:bg-gray-800/40 cursor-pointer overflow-hidden text-left transition-colors`}
              style={{ fontSize: compact ? "10px" : "11px", lineHeight: 1 }}
            >
              <span className="truncate">
                {formatMinuteOfDay(row.startMin)} – {formatMinuteOfDay(row.endMin)} · {freeLabel}
              </span>
            </button>
          );
        }
        const ev = row.event;
        const isTop = row.position === "top" || row.position === "only";
        const isBottom = row.position === "bottom" || row.position === "only";
        const cornerClass = `${isTop ? "rounded-t-md" : ""} ${isBottom ? "rounded-b-md mb-0.5" : ""}`;
        // Event row — if inside a time block, show block background behind event
        const tbBg = tb ? "bg-blue-500/8" : "";
        return (
          <div key={i} className={`relative ${tbBg}`}>
            <button
              onClick={() => onSelectEvent(ev)}
              className={`w-full h-full flex items-center ${compact ? "px-1.5 gap-1" : "px-2 gap-2"} text-left text-white ${colorBgClass(ev.color)} ${cornerClass} overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/40`}
              style={{ ...colorStyle(ev.color), zIndex: 1 }}
            >
              {row.position === "top" || row.position === "only" ? (
                <>
                  {!compact && (
                    <span className="text-[10px] font-semibold opacity-80 shrink-0 tabular-nums">
                      {ev.startTime}
                    </span>
                  )}
                  <span className={`truncate font-semibold ${compact ? "text-[10px]" : "text-xs sm:text-sm"}`}>
                    {ev.title}
                  </span>
                </>
              ) : (
                <span className={`truncate opacity-90 ${compact ? "text-[9px] pl-1" : "text-[11px] pl-2"}`}>
                  📍 {ev.address}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Time Blocks ─────────────────────────────────────────────────────────────

const TIME_BLOCKS_KEY = "arego_calendar_time_blocks";

/** Migrate legacy DND: merge allowedMessagers + allowedCallers → allowedContacts */
function migrateDnd(dnd?: DoNotDisturbSettings): DoNotDisturbSettings | undefined {
  if (!dnd) return undefined;
  if (dnd.allowedContacts !== undefined && !dnd.allowedMessagers && !dnd.allowedCallers) return dnd;
  const merged = new Set([...(dnd.allowedMessagers ?? []), ...(dnd.allowedCallers ?? [])]);
  return { enabled: dnd.enabled, allowedContacts: [...merged], notificationMode: dnd.notificationMode };
}

/** Migrate old TimeBlock format (single dayOfWeek, type-based) to new format */
function migrateTimeBlock(b: TimeBlock & { dayOfWeek?: number; type?: TimeBlockType }): TimeBlock {
  const base: TimeBlock = (b.daysOfWeek && b.name !== undefined && b.priority !== undefined)
    ? b
    : {
        id: b.id,
        name: b.name ?? (b.type === "work" ? "Arbeit" : b.type === "interruptible" ? "Unterbrechbar" : b.type === "buffer" ? "Puffer" : "Verfügbar"),
        daysOfWeek: b.daysOfWeek ?? (b.dayOfWeek !== undefined ? [b.dayOfWeek] : [0]),
        startTime: b.startTime,
        endTime: b.endTime,
        isInterruptible: b.isInterruptible ?? (b.type === "interruptible"),
        priority: b.priority ?? 0,
        bufferBefore: b.bufferBefore,
        bufferAfter: b.bufferAfter,
      };
  return { ...base, doNotDisturb: migrateDnd(base.doNotDisturb) };
}

function loadTimeBlocks(): TimeBlock[] {
  try {
    const raw: TimeBlock[] = JSON.parse(localStorage.getItem(TIME_BLOCKS_KEY) ?? "[]");
    const migrated = raw.map(migrateTimeBlock);
    // Ensure unique priorities
    migrated.forEach((b, i) => { if (b.priority === 0 && i > 0) b.priority = i; });
    return migrated.sort((a, b) => a.priority - b.priority);
  } catch { return []; }
}

function saveTimeBlocks(blocks: TimeBlock[]) {
  // Re-index priorities before saving
  const indexed = blocks.map((b, i) => ({ ...b, priority: i }));
  localStorage.setItem(TIME_BLOCKS_KEY, JSON.stringify(indexed));
}

const TIME_BLOCK_COLOR = "bg-blue-500/10 border-blue-500/20";

// ── Days-View Config Persistence ────────────────────────────────────────────

const DAYS_CONFIG_KEY = "arego_calendar_days_config";

interface DaysConfig {
  count: number;          // 1–5
  selectedDays: number[]; // 0=Mo … 6=So (subset)
}

const DEFAULT_DAYS_CONFIG: DaysConfig = { count: 3, selectedDays: [0, 1, 2, 3, 4, 5, 6] };

function loadDaysConfig(): DaysConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(DAYS_CONFIG_KEY) ?? "null");
    if (raw && typeof raw.count === "number" && Array.isArray(raw.selectedDays)) {
      return {
        count: Math.max(1, Math.min(5, raw.count)),
        selectedDays: raw.selectedDays.length > 0 ? raw.selectedDays : [0],
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_DAYS_CONFIG;
}

function saveDaysConfig(cfg: DaysConfig) {
  localStorage.setItem(DAYS_CONFIG_KEY, JSON.stringify(cfg));
}

/** Compute the N next selected-weekday dates starting from `anchor`.
 *  `selectedDays` uses Mon=0 convention. */
function computeRollingDates(anchor: Date, count: number, selectedDays: number[]): Date[] {
  if (selectedDays.length === 0) return [];
  const set = new Set(selectedDays);
  const dates: Date[] = [];
  const d = new Date(anchor);
  // If anchor day itself is not selected, still start searching from anchor
  for (let safety = 0; dates.length < count && safety < 400; safety++) {
    if (set.has(weekdayMon(d))) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** Compute N previous selected-weekday dates ending before `anchor` (reverse). */
function computeRollingDatesBefore(anchor: Date, count: number, selectedDays: number[]): Date[] {
  if (selectedDays.length === 0) return [];
  const set = new Set(selectedDays);
  const dates: Date[] = [];
  const d = new Date(anchor);
  d.setDate(d.getDate() - 1); // start before anchor
  for (let safety = 0; dates.length < count && safety < 400; safety++) {
    if (set.has(weekdayMon(d))) dates.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return dates.reverse();
}

/** Format days array as compact string: Mo–Fr, Di, etc. */
function formatDays(days: number[], weekdays: string[]): string {
  if (days.length === 0) return "";
  if (days.length === 7) return `${weekdays[0]}–${weekdays[6]}`;
  const sorted = [...days].sort((a, b) => a - b);
  // Check for consecutive ranges
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? weekdays[start] : `${weekdays[start]}–${weekdays[end]}`);
      if (i < sorted.length) { start = sorted[i]; end = sorted[i]; }
    }
  }
  return ranges.join(", ");
}

// ── Reminder Scheduling (delegated to Service Worker) ───────────────────────

// ── Calendar Layers (Space Events) ──────────────────────────────────────────

const LAYERS_KEY = "arego_calendar_layers";

function loadLayers(): CalendarLayer[] {
  try {
    return JSON.parse(localStorage.getItem(LAYERS_KEY) ?? "[]");
  } catch { return []; }
}

function saveLayers(layers: CalendarLayer[]) {
  localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
}

interface SpaceEventData {
  spaceId: string;
  spaceName: string;
  spaceColor: string;
  postId: string;
  title: string;
  date: string;
  time: string;
  location?: string;
}

function loadSpaceEvents(): SpaceEventData[] {
  try {
    const spaces = JSON.parse(localStorage.getItem("aregoland_spaces") ?? "[]");
    const events: SpaceEventData[] = [];
    for (const space of spaces) {
      if (!space.posts) continue;
      for (const post of space.posts) {
        if (post.badge === "event" && post.eventDate) {
          events.push({
            spaceId: space.id,
            spaceName: space.name,
            spaceColor: space.color || "blue",
            postId: post.id,
            title: post.title,
            date: post.eventDate,
            time: post.eventTime || "00:00",
            location: post.eventLocation,
          });
        }
      }
    }
    return events;
  } catch { return []; }
}

/** Map space color to a CalendarEvent-compatible color */
function mapSpaceColor(spaceColor: string): string {
  const map: Record<string, string> = {
    blue: "blue", red: "pink", green: "green", purple: "purple",
    orange: "orange", teal: "teal", yellow: "orange", pink: "pink",
  };
  return map[spaceColor] || "blue";
}

// ── Component ────────────────────────────────────────────────────────────────

type View = "month" | "days";

interface CalendarScreenProps {
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
}

export default function CalendarScreen({ onBack, onOpenProfile, onOpenQRCode, onOpenSettings, onOpenSupport }: CalendarScreenProps) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<CalendarEvent[]>(loadEvents);
  const [view, setView] = useState<View>("month");
  const switchToDayView = (d: Date) => {
    const cfg: DaysConfig = { ...daysConfig, count: 1 };
    setDaysConfig(cfg);
    saveDaysConfig(cfg);
    setDaysAnchor(d);
    setView("days");
  };
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [daysConfig, setDaysConfig] = useState<DaysConfig>(loadDaysConfig);
  const [daysAnchor, setDaysAnchor] = useState<Date | null>(null); // null = rolling from today
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formDefaultStartTime, setFormDefaultStartTime] = useState<string | undefined>(undefined);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [calSearchOpen, setCalSearchOpen] = useState(false);
  const [calSearchQuery, setCalSearchQuery] = useState("");
  const calSearchRef = useRef<HTMLInputElement>(null);
  const [layers, setLayers] = useState<CalendarLayer[]>(loadLayers);
  const [showLayers, setShowLayers] = useState(false);
  const [invitations, setInvitations] = useState<ReceivedInvitation[]>(loadInvitations);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(loadTimeBlocks);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const [birthdays, setBirthdays] = useState<CalendarBirthday[]>(loadBirthdays);
  const [showBirthdayForm, setShowBirthdayForm] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState<CalendarBirthday | null>(null);
  const [showDaysTabMenu, setShowDaysTabMenu] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const yearPickerRef = useRef<HTMLDivElement>(null);
  const MONTHS = t('calendar.months', { returnObjects: true }) as string[];
  const WEEKDAYS_SHORT = t('calendar.weekdaysShort', { returnObjects: true }) as string[];
  const WEEKDAYS_FULL = t('calendar.weekdaysFull', { returnObjects: true }) as string[];

  // Persist
  useEffect(() => { saveEvents(events); }, [events]);

  // Auto-scroll year picker to selected year
  useEffect(() => {
    if (showYearPicker && yearPickerRef.current) {
      const selectedBtn = yearPickerRef.current.querySelector('[data-selected-year="true"]');
      if (selectedBtn) {
        selectedBtn.scrollIntoView({ block: "center", behavior: "instant" });
      }
    }
  }, [showYearPicker]);

  // Sync layers with available spaces
  const spaceEvents = useMemo(() => loadSpaceEvents(), [events]); // re-derive when events change (forces refresh)
  useEffect(() => {
    const se = loadSpaceEvents();
    const spaceIds = new Set(se.map((e) => e.spaceId));
    const existing = new Map(layers.map((l) => [l.spaceId, l]));
    let changed = false;
    const next: CalendarLayer[] = [];
    for (const sid of spaceIds) {
      const sample = se.find((e) => e.spaceId === sid)!;
      if (existing.has(sid)) {
        next.push(existing.get(sid)!);
      } else {
        next.push({ spaceId: sid, spaceName: sample.spaceName, color: sample.spaceColor, visible: true });
        changed = true;
      }
    }
    if (changed || next.length !== layers.length) {
      setLayers(next);
      saveLayers(next);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLayer = useCallback((spaceId: string) => {
    setLayers((prev) => {
      const next = prev.map((l) => l.spaceId === spaceId ? { ...l, visible: !l.visible } : l);
      saveLayers(next);
      return next;
    });
  }, []);

  // Schedule reminders via Service Worker on load
  useEffect(() => {
    if (Notification.permission === "default") Notification.requestPermission();
    events.forEach(scheduleSWReminder);
    checkReminders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute a visible range for recurrence expansion based on current view
  const expansionRange = useMemo(() => {
    const d = new Date(selectedDate);
    if (view === "month") {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      start.setDate(start.getDate() - 7);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end.setDate(end.getDate() + 7);
      return { start: toDateStr(start), end: toDateStr(end) };
    } else if (view === "days") {
      // Pad generously: rolling days may span weeks when weekdays are skipped
      const anchor = daysAnchor ?? new Date();
      const start = new Date(anchor);
      start.setDate(start.getDate() - 30);
      const end = new Date(anchor);
      end.setDate(end.getDate() + 60);
      return { start: toDateStr(start), end: toDateStr(end) };
    } else {
      return { start: toDateStr(d), end: toDateStr(d) };
    }
  }, [selectedDate, view, daysAnchor, daysConfig]);

  const eventsMap = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (ev.rrule) {
        const dates = expandRecurrence(ev.date, ev.rrule, expansionRange.start, expansionRange.end, ev.exdates);
        for (const ds of dates) {
          const list = m.get(ds) ?? [];
          list.push({ ...ev, date: ds });
          m.set(ds, list);
        }
      } else {
        const list = m.get(ev.date) ?? [];
        list.push(ev);
        m.set(ev.date, list);
      }
    }
    // Merge visible space events
    const visibleSpaces = new Set(layers.filter((l) => l.visible).map((l) => l.spaceId));
    for (const se of spaceEvents) {
      if (!visibleSpaces.has(se.spaceId)) continue;
      const calEv: CalendarEvent = {
        id: `space-${se.spaceId}-${se.postId}`,
        title: `[${se.spaceName}] ${se.title}`,
        date: se.date,
        startTime: se.time,
        duration: "1h",
        reminder: "none",
        color: mapSpaceColor(se.spaceColor),
        address: se.location,
      };
      const list = m.get(se.date) ?? [];
      list.push(calEv);
      m.set(se.date, list);
    }
    // Merge received invitations (not declined)
    for (const invEv of invitationsToEvents(invitations)) {
      const list = m.get(invEv.date) ?? [];
      list.push(invEv);
      m.set(invEv.date, list);
    }
    return m;
  }, [events, expansionRange, layers, spaceEvents, invitations]);

  // Build a map of date-string -> birthdays for the visible range
  const birthdaysMap = useMemo(() => {
    const m = new Map<string, CalendarBirthday[]>();
    if (birthdays.length === 0) return m;
    // Determine year range from expansion range
    const startYear = parseInt(expansionRange.start.slice(0, 4), 10);
    const endYear = parseInt(expansionRange.end.slice(0, 4), 10);
    for (const bd of birthdays) {
      for (let y = startYear; y <= endYear; y++) {
        const ds = `${y}-${bd.date}`; // bd.date is MM-DD
        if (ds >= expansionRange.start && ds <= expansionRange.end) {
          const list = m.get(ds) ?? [];
          list.push(bd);
          m.set(ds, list);
        }
      }
    }
    return m;
  }, [birthdays, expansionRange]);

  const searchResults = useMemo(() => {
    if (!calSearchQuery.trim()) return [];
    const q = calSearchQuery.toLowerCase().trim();
    return events
      .filter(ev => ev.title.toLowerCase().includes(q) || (ev.note ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, calSearchQuery]);

  const todayStr = toDateStr(new Date());

  const addOrUpdateEvent = useCallback((ev: CalendarEvent) => {
    setEvents((prev) => {
      const exists = prev.findIndex((e) => e.id === ev.id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = ev;
        return next;
      }
      return [...prev, ev];
    });
    scheduleSWReminder(ev);
    setShowForm(false);
    setEditingEvent(null);
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    cancelReminder(id);
    setDetailEvent(null);
  }, []);

  const saveBirthdayEntry = useCallback((bd: CalendarBirthday) => {
    setBirthdays((prev) => {
      const exists = prev.findIndex((b) => b.id === bd.id);
      const next = exists >= 0 ? [...prev.slice(0, exists), bd, ...prev.slice(exists + 1)] : [...prev, bd];
      saveBirthdays(next);
      return next;
    });
    setShowBirthdayForm(false);
    setEditingBirthday(null);
  }, []);

  const saveBirthdayBatch = useCallback((bds: CalendarBirthday[]) => {
    setBirthdays((prev) => {
      const existingIds = new Set(prev.map(b => b.id));
      const newOnes = bds.filter(b => !existingIds.has(b.id));
      // Also skip duplicates by contactId
      const existingContactIds = new Set(prev.filter(b => b.contactId).map(b => b.contactId));
      const filtered = newOnes.filter(b => !b.contactId || !existingContactIds.has(b.contactId));
      const next = [...prev, ...filtered];
      saveBirthdays(next);
      return next;
    });
    setShowBirthdayForm(false);
  }, []);

  const deleteBirthday = useCallback((id: string) => {
    setBirthdays((prev) => {
      const next = prev.filter((b) => b.id !== id);
      saveBirthdays(next);
      return next;
    });
  }, []);

  const goToday = () => {
    setSelectedDate(new Date());
    setDaysAnchor(null); // reset to rolling mode
  };

  const navigate = (dir: -1 | 1) => {
    const d = new Date(selectedDate);
    if (view === "month") {
      d.setMonth(d.getMonth() + dir);
      setSelectedDate(d);
    } else {
      // days view (including count=1)
      const anchor = daysAnchor ?? new Date();
      if (dir === 1) {
        const visible = computeRollingDates(anchor, daysConfig.count, daysConfig.selectedDays);
        if (visible.length > 0) {
          const next = new Date(visible[visible.length - 1]);
          next.setDate(next.getDate() + 1);
          setDaysAnchor(next);
        }
      } else {
        const prev = computeRollingDatesBefore(anchor, daysConfig.count, daysConfig.selectedDays);
        if (prev.length > 0) {
          setDaysAnchor(prev[0]);
        }
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
      <AppHeader
        title={t('calendar.title')}
        onBack={onBack}
        onOpenProfile={onOpenProfile}
        onOpenQRCode={onOpenQRCode}
        onOpenSettings={onOpenSettings}
        onOpenSupport={onOpenSupport}
        centerExtra={
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl max-[480px]:rounded-full max-[480px]:p-2.5 transition-all text-sm font-medium min-w-[44px] min-h-[44px] justify-center shrink-0">
                <Plus size={18} />
                <span className="max-[480px]:hidden">{t('common.addNew')}</span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[200px] bg-gray-800 rounded-xl shadow-2xl p-2 border border-gray-700 z-50"
                sideOffset={8}
                align="center"
              >
                <DropdownMenu.Item
                  onClick={() => { setEditingEvent(null); setFormDefaultStartTime(undefined); setShowForm(true); }}
                  className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
                >
                  <CalendarPlus size={18} />
                  <span className="font-medium">{t('calendar.newEvent')}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={() => setShowBlockEditor(true)}
                  className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
                >
                  <Timer size={18} />
                  <span className="font-medium">{t('calendar.timeBlocks')}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={() => { setEditingBirthday(null); setShowBirthdayForm(true); }}
                  className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-pink-600 hover:text-white outline-none cursor-pointer transition-colors"
                >
                  <Cake size={18} />
                  <span className="font-medium">{t('calendar.birthdays')}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        }
        rightExtra={<>
          {layers.length > 0 && (
            <button onClick={() => setShowLayers(!showLayers)}
              className={`p-2 rounded-full transition-all ${showLayers ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-white/10"}`}>
              <Layers size={20} />
            </button>
          )}
          <button onClick={goToday} className="px-3 py-1.5 text-xs font-bold rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            {t('calendar.today')}
          </button>
          <button
            onClick={() => { setCalSearchOpen(!calSearchOpen); if (!calSearchOpen) { setCalSearchQuery(""); setTimeout(() => calSearchRef.current?.focus(), 100); } }}
            className={`p-2 rounded-full transition-all min-w-[44px] min-h-[44px] flex items-center justify-center ${calSearchOpen ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
            aria-label={t('common.search')}
          >
            <Search size={20} />
          </button>
        </>}
      />

      {/* Expandable search bar */}
      <AnimatePresence>
        {calSearchOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-gray-800 bg-gray-900">
            <div className="px-4 py-2.5 relative">
              <Search size={16} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                ref={calSearchRef}
                type="text"
                value={calSearchQuery}
                onChange={e => setCalSearchQuery(e.target.value)}
                placeholder={t('calendar.searchPlaceholder')}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
              />
              <button onClick={() => { setCalSearchOpen(false); setCalSearchQuery(""); }} className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            {/* Search results */}
            {calSearchQuery.trim() && (
              <div className="px-4 pb-3 max-h-64 overflow-y-auto space-y-1.5">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">{t('calendar.noSearchResults')}</p>
                ) : (
                  searchResults.map(ev => {
                    const [y, m, d] = ev.date.split("-").map(Number);
                    return (
                      <button key={ev.id}
                        onClick={() => {
                          setSelectedDate(new Date(y, m - 1, d));
                          switchToDayView(new Date(y, m - 1, d));
                          setCalSearchOpen(false);
                          setCalSearchQuery("");
                        }}
                        className="w-full flex items-center gap-3 p-2.5 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors text-left">
                        <div className={`w-2 h-8 rounded-full bg-${ev.color}-500 shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{ev.title}</div>
                          <div className="text-[11px] text-gray-500">{d}. {MONTHS[m - 1]} {y}{ev.startTime !== "00:00" ? ` · ${ev.startTime}` : ""}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer toggle panel */}
      <AnimatePresence>
        {showLayers && layers.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-gray-800 bg-gray-900">
            <div className="px-4 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('calendar.spaceLayers')}</span>
                <button onClick={() => setShowLayers(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
              {layers.map((layer) => (
                <button
                  key={layer.spaceId}
                  onClick={() => toggleLayer(layer.spaceId)}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all ${
                    layer.visible ? "bg-gray-800/70" : "bg-gray-800/30 opacity-50"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-${mapSpaceColor(layer.color)}-500 ${layer.visible ? "" : "opacity-30"}`} />
                  <span className="text-sm font-medium flex-1 text-left truncate">{layer.spaceName}</span>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    layer.visible ? "bg-blue-600 border-blue-600" : "border-gray-600"
                  }`}>
                    {layer.visible && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Toggle + Navigation (combined row) */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-1 bg-gray-900">
        {/* Monat tab */}
        <button
          onClick={() => { setView("month"); setShowDaysTabMenu(false); setShowYearPicker(false); }}
          className={`py-1.5 px-3 text-xs font-bold rounded-full transition-colors ${
            view === "month" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          {t('calendar.month')}
        </button>

        {/* Tage tab — double-tap: first tap switches view, second tap opens settings */}
        <div className="relative">
          <button
            onClick={() => {
              if (view !== "days") {
                setView("days");
                setShowDaysTabMenu(false);
              } else {
                setShowDaysTabMenu(!showDaysTabMenu);
              }
            }}
            className={`py-1.5 px-3 text-xs font-bold rounded-full transition-colors flex items-center gap-1 ${
              view === "days" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {t('calendar.days')}
            {view === "days" && <Settings size={12} />}
          </button>

          {/* Settings dropdown (day count + weekday picker) */}
          {showDaysTabMenu && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-2 z-50 min-w-[200px]">
              {/* Day count selection */}
              <div className="text-[10px] font-bold text-gray-500 uppercase px-2 pb-1">{t('calendar.daysCount')}</div>
              <div className="flex flex-wrap gap-1 px-1 pb-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      const cfg = { ...daysConfig, count: n };
                      setDaysConfig(cfg);
                      saveDaysConfig(cfg);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      daysConfig.count === n
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {/* Weekday selection — only for multi-day */}
              {daysConfig.count > 1 && (
                <>
                  <div className="border-t border-gray-700 my-1" />
                  <div className="text-[10px] font-bold text-gray-500 uppercase px-2 pb-1">{t('calendar.daysWhich')}</div>
                  {WEEKDAYS_FULL.map((name, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const next = daysConfig.selectedDays.includes(i)
                          ? daysConfig.selectedDays.filter((d) => d !== i)
                          : [...daysConfig.selectedDays, i].sort((a, b) => a - b);
                        if (next.length > 0) {
                          const cfg = { ...daysConfig, selectedDays: next };
                          setDaysConfig(cfg);
                          saveDaysConfig(cfg);
                        }
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        daysConfig.selectedDays.includes(i)
                          ? "bg-blue-600/20 text-blue-400"
                          : "text-gray-400 hover:text-white hover:bg-gray-700"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        daysConfig.selectedDays.includes(i) ? "bg-blue-600 border-blue-600" : "border-gray-600"
                      }`}>
                        {daysConfig.selectedDays.includes(i) && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      {name}
                    </button>
                  ))}
                </>
              )}

              <button
                onClick={() => setShowDaysTabMenu(false)}
                className="w-full mt-1 py-1.5 text-[11px] font-bold text-gray-500 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Navigation arrows + date */}
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-gray-800">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-bold text-gray-200 whitespace-nowrap">
          {view === "month"
            ? <>{MONTHS[selectedDate.getMonth()]} <button onClick={() => setShowYearPicker(!showYearPicker)} className="inline text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors">{selectedDate.getFullYear()}</button></>
            : (() => {
                const a = daysAnchor ?? new Date();
                const vis = computeRollingDates(a, daysConfig.count, daysConfig.selectedDays);
                if (vis.length === 0) return "";
                const first = vis[0];
                return `${t('calendar.daysFrom')} ${first.getDate()}. ${MONTHS[first.getMonth()].slice(0, 3)}.`;
              })()}
        </span>
        <button onClick={() => navigate(1)} className="p-1.5 rounded-full hover:bg-gray-800">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Year Picker Grid */}
      {showYearPicker && view === "month" && (() => {
        const currentYear = new Date().getFullYear();
        const selectedYear = selectedDate.getFullYear();
        const startYear = 1;
        const endYear = 9999;
        const years: number[] = [];
        for (let y = startYear; y <= endYear; y++) years.push(y);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowYearPicker(false)}>
            <div
              ref={yearPickerRef}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl p-4 max-h-[60vh] w-[280px] overflow-y-auto"
            >
              <div className="text-xs font-bold text-gray-400 uppercase mb-3 text-center">{t('calendar.selectYear', 'Jahr wählen')}</div>
              <div className="grid grid-cols-4 gap-1.5">
                {years.map((y) => (
                  <button
                    key={y}
                    data-selected-year={y === selectedYear ? "true" : undefined}
                    onClick={() => {
                      const newDate = y === currentYear
                        ? new Date(y, new Date().getMonth(), 1)
                        : new Date(y, 0, 1);
                      setSelectedDate(newDate);
                      setShowYearPicker(false);
                    }}
                    className={`py-2 px-1 rounded-lg text-xs font-bold transition-colors ${
                      y === selectedYear
                        ? "bg-blue-600 text-white"
                        : y === currentYear
                          ? "bg-gray-700 text-blue-400 ring-1 ring-blue-500"
                          : "bg-gray-700/50 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Content */}
      {view === "days" ? (
        <div className="flex-1 min-h-0 px-4 pb-4 flex flex-col">
          <DaysView
            anchor={daysAnchor}
            config={daysConfig}
            todayStr={todayStr}
            eventsMap={eventsMap}
            birthdaysMap={birthdaysMap}
            timeBlocks={timeBlocks}
            onSelectEvent={setDetailEvent}
            onClickFreeSlot={(dateStr, startMin) => {
              const hour = Math.floor(startMin / 60);
              const roundedTime = `${String(hour).padStart(2, "0")}:00`;
              setSelectedDate(new Date(dateStr + "T00:00:00"));
              setFormDefaultStartTime(roundedTime);
              setEditingEvent(null);
              setShowForm(true);
            }}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <MonthView
            date={selectedDate}
            todayStr={todayStr}
            eventsMap={eventsMap}
            birthdaysMap={birthdaysMap}
            onSelectDate={(d) => switchToDayView(d)}
          />
        </div>
      )}

      {/* Event Form Modal */}
      <AnimatePresence>
        {showForm && (
          <EventFormModal
            initial={editingEvent}
            defaultDate={toDateStr(selectedDate)}
            defaultStartTime={formDefaultStartTime}
            onSave={addOrUpdateEvent}
            onClose={() => { setShowForm(false); setEditingEvent(null); setFormDefaultStartTime(undefined); }}
          />
        )}
      </AnimatePresence>

      {/* Time Block Editor Modal */}
      <AnimatePresence>
        {showBlockEditor && (
          <TimeBlockEditor
            blocks={timeBlocks}
            onSave={(blocks) => { setTimeBlocks(blocks); saveTimeBlocks(blocks); setShowBlockEditor(false); }}
            onClose={() => setShowBlockEditor(false)}
          />
        )}
      </AnimatePresence>

      {/* Birthday Form Modal */}
      <AnimatePresence>
        {showBirthdayForm && (
          <BirthdayFormModal
            initial={editingBirthday}
            existingBirthdays={birthdays}
            onSave={saveBirthdayEntry}
            onSaveBatch={saveBirthdayBatch}
            onDelete={deleteBirthday}
            onClose={() => { setShowBirthdayForm(false); setEditingBirthday(null); }}
          />
        )}
      </AnimatePresence>

      {/* Event Detail Modal */}
      <AnimatePresence>
        {detailEvent && (
          <EventDetailModal
            event={detailEvent}
            onClose={() => setDetailEvent(null)}
            onEdit={() => { setEditingEvent(detailEvent); setDetailEvent(null); setFormDefaultStartTime(undefined); setShowForm(true); }}
            onDelete={() => deleteEvent(detailEvent.id)}
            onRsvp={(eventId, status) => {
              updateRsvp(eventId, status);
              setInvitations(loadInvitations());
              setDetailEvent(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Month View ───────────────────────────────────────────────────────────────

/** Height of the date number label area (px). */
const MONTH_DATE_H = 18;
/** Height of one event pill including gap (px). */
const MONTH_EVENT_H = 18;
/** Height of the "+X more" overflow label (px). */
const MONTH_OVERFLOW_H = 14;
/** Cell vertical padding (px). */
const MONTH_CELL_PAD = 4;

function MonthView({
  date, todayStr, eventsMap, birthdaysMap, onSelectDate,
}: {
  date: Date; todayStr: string;
  eventsMap: Map<string, CalendarEvent[]>;
  birthdaysMap: Map<string, CalendarBirthday[]>;
  onSelectDate: (d: Date) => void;
}) {
  const { t } = useTranslation();
  const WEEKDAYS_SHORT = t('calendar.weekdaysShort', { returnObjects: true }) as string[];
  const grid = useMemo(() => getMonthGrid(date.getFullYear(), date.getMonth()), [date]);

  // Measure row height to compute max visible events
  const rowRef = useRef<HTMLDivElement>(null);
  const rowHeight = useElementHeight(rowRef);

  const maxVisible = useMemo(() => {
    if (rowHeight <= 0) return 2; // fallback before measurement
    const available = rowHeight - MONTH_CELL_PAD - MONTH_DATE_H;
    if (available <= 0) return 0;
    // Reserve space for the overflow label if we might need it
    const withOverflow = Math.floor((available - MONTH_OVERFLOW_H) / MONTH_EVENT_H);
    const withoutOverflow = Math.floor(available / MONTH_EVENT_H);
    // If all events of the busiest day fit without overflow, use that
    return Math.max(1, withOverflow > 0 ? withOverflow : withoutOverflow);
  }, [rowHeight]);

  return (
    <div className="flex flex-col h-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS_SHORT.map((wd) => (
          <div key={wd} className="text-center text-[11px] font-bold text-gray-500 py-1">{wd}</div>
        ))}
      </div>
      {/* Days */}
      {grid.map((row, ri) => (
        <div key={ri} ref={ri === 0 ? rowRef : undefined} className="grid grid-cols-7 gap-px flex-1">
          {row.map((cell, ci) => {
            if (!cell) return <div key={ci} />;
            const ds = toDateStr(cell);
            const isToday = ds === todayStr;
            const dayEvents = eventsMap.get(ds) ?? [];
            const dayBirthdays = birthdaysMap.get(ds) ?? [];
            const hasBirthday = dayBirthdays.length > 0;
            // Check if all events fit without overflow
            const allFit = dayEvents.length <= Math.floor((rowHeight - MONTH_CELL_PAD - MONTH_DATE_H) / MONTH_EVENT_H);
            const limit = allFit ? dayEvents.length : maxVisible;
            const visible = dayEvents.slice(0, limit);
            const overflow = dayEvents.length - limit;
            return (
              <button
                key={ci}
                onClick={() => onSelectDate(cell)}
                className={`flex flex-col items-stretch p-0.5 rounded-lg transition-colors relative ${
                  isToday ? "bg-blue-600/20 ring-1 ring-blue-500"
                    : hasBirthday ? "bg-pink-500/10" : "hover:bg-gray-800"
                }`}
              >
                <span className={`text-[11px] font-bold text-center mb-0.5 ${isToday ? "text-blue-400" : hasBirthday ? "text-pink-300" : "text-gray-300"}`}>
                  {cell.getDate()}
                </span>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  {dayBirthdays.map((bd) => (
                    <div
                      key={`bd-${bd.id}`}
                      className="bg-pink-500/20 border border-pink-500/30 rounded px-1 py-1 truncate text-[11px] leading-none font-semibold text-pink-300"
                    >
                      {bd.name}
                    </div>
                  ))}
                  {visible.map((ev) => (
                    <div
                      key={ev.id}
                      className={`${colorBgClass(ev.color)} rounded px-1 py-1 truncate text-[11px] leading-none font-semibold text-white`}
                      style={colorStyle(ev.color)}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <span className="text-[10px] text-gray-500 font-bold text-center leading-none">
                      {t('calendar.moreEvents', { count: overflow })}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Days View (replaces old Week View) ──────────────────────────────────────

function DaysView({
  anchor, config, todayStr, eventsMap, birthdaysMap, onSelectEvent, onClickFreeSlot, timeBlocks,
}: {
  anchor: Date | null;
  config: DaysConfig;
  todayStr: string;
  eventsMap: Map<string, CalendarEvent[]>;
  birthdaysMap: Map<string, CalendarBirthday[]>;
  onSelectEvent: (ev: CalendarEvent) => void;
  onClickFreeSlot?: (dateStr: string, startMin: number, endMin: number) => void;
  timeBlocks?: TimeBlock[];
}) {
  const { t } = useTranslation();
  const WEEKDAYS_SHORT = t('calendar.weekdaysShort', { returnObjects: true }) as string[];
  const MONTHS = t('calendar.months', { returnObjects: true }) as string[];
  const visibleDates = useMemo(
    () => computeRollingDates(anchor ?? new Date(), config.count, config.selectedDays),
    [anchor, config.count, config.selectedDays],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const containerHeight = useElementHeight(containerRef);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Horizontal column layout */}
      <div ref={containerRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Column headers row */}
        <div className="shrink-0 flex flex-row">
          {/* Day column headers */}
          {visibleDates.map((d) => {
            const ds = toDateStr(d);
            const isToday = ds === todayStr;
            return (
              <div
                key={ds}
                className={`flex-1 min-w-0 flex flex-col items-center py-1 ${isToday ? "text-blue-400" : "text-gray-400"}`}
              >
                <span className="text-[10px] font-medium uppercase">{WEEKDAYS_SHORT[weekdayMon(d)]}</span>
                <span className={`text-sm font-bold leading-tight ${isToday ? "bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center" : ""}`}>
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Birthday banner row */}
        {visibleDates.some((d) => (birthdaysMap.get(toDateStr(d)) ?? []).length > 0) && (
          <div className="shrink-0 flex flex-row border-b border-pink-500/20 bg-pink-500/5">
            {visibleDates.map((d) => {
              const ds = toDateStr(d);
              const dayBds = birthdaysMap.get(ds) ?? [];
              return (
                <div key={ds} className="flex-1 min-w-0 px-0.5 py-0.5 border-r border-gray-800/40 last:border-r-0">
                  {dayBds.map((bd) => {
                    const age = bd.year ? (d.getFullYear() - bd.year) : null;
                    return (
                      <div
                        key={bd.id}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold text-pink-300 bg-pink-500/20 border border-pink-500/30 truncate mb-0.5"
                      >
                        {bd.name}{age !== null ? ` (${age})` : ''}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* All-day row (if any day has all-day events) */}
        {visibleDates.some((d) => (eventsMap.get(toDateStr(d)) ?? []).some((e) => e.duration === "allday")) && (
          <div className="shrink-0 flex flex-row border-b border-gray-800/60">
            {visibleDates.map((d) => {
              const ds = toDateStr(d);
              const allDay = (eventsMap.get(ds) ?? []).filter((e) => e.duration === "allday");
              return (
                <div key={ds} className="flex-1 min-w-0 px-0.5 py-0.5 border-r border-gray-800/40 last:border-r-0">
                  {allDay.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate ${colorBgClass(ev.color)} mb-0.5`}
                      style={colorStyle(ev.color)}
                    >
                      {ev.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid + day columns */}
        <div className="flex-1 min-h-0 flex flex-row overflow-y-auto">
          {/* Day columns with timed events */}
          {visibleDates.map((d) => {
            const ds = toDateStr(d);
            const dayEvs = eventsMap.get(ds) ?? [];
            const timed = dayEvs.filter((e) => e.duration !== "allday").sort((a, b) => a.startTime.localeCompare(b.startTime));
            const stackH = Math.max(0, containerHeight - 56);
            const dayOfWeek = weekdayMon(d);
            const dayTbs = timeBlocks?.filter((tb) => tb.daysOfWeek.includes(dayOfWeek));

            return (
              <div
                key={ds}
                className="flex-1 min-w-0 border-r border-gray-800/40 last:border-r-0 min-h-0"
              >
                <DayRowStack
                  events={timed}
                  onSelectEvent={onSelectEvent}
                  onClickFreeSlot={onClickFreeSlot ? (startMin, endMin) => onClickFreeSlot(ds, startMin, endMin) : undefined}
                  height={stackH}
                  freeLabel={t('calendar.free')}
                  density={config.count === 1 ? "normal" : "compact"}
                  timeBlocks={dayTbs}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Day Event List (used in Month View below grid) ───────────────────────────

function DayEventList({ events, label, onSelect }: { events: CalendarEvent[]; label: string; onSelect: (ev: CalendarEvent) => void }) {
  const { t } = useTranslation();
  if (events.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-xs font-bold text-gray-500 mb-2">{label}</h3>
      <div className="space-y-1.5">
        {events.map((ev) => (
          <button
            key={ev.id}
            onClick={() => onSelect(ev)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800 hover:bg-gray-750 transition-colors text-left"
          >
            <div className={`w-1 h-10 rounded-full ${colorBgClass(ev.color)}`} style={colorStyle(ev.color)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100 truncate">{ev.title}</p>
              <p className="text-xs text-gray-400">
                {ev.duration === "allday" ? t('calendar.allDay') : `${ev.startTime} – ${addMinutesToTime(ev.startTime, durationMinutes(ev.duration, ev.customDurationMinutes))}`}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Reminder unit helpers ────────────────────────────────────────────────────

type ReminderUnit = 'minutes' | 'hours' | 'days' | 'weeks';

function reminderUnitKey(unit: ReminderUnit): string {
  return `calendar.unit${unit.charAt(0).toUpperCase()}${unit.slice(1)}`;
}

function toCustomReminderMinutes(value: number, unit: ReminderUnit): number {
  switch (unit) {
    case 'minutes': return value;
    case 'hours': return value * 60;
    case 'days': return value * 60 * 24;
    case 'weeks': return value * 60 * 24 * 7;
  }
}

function fromCustomReminderMinutes(minutes: number): { value: number; unit: ReminderUnit } {
  if (minutes >= 10080 && minutes % 10080 === 0) return { value: minutes / 10080, unit: 'weeks' };
  if (minutes >= 1440 && minutes % 1440 === 0) return { value: minutes / 1440, unit: 'days' };
  if (minutes >= 60 && minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' };
  return { value: minutes, unit: 'minutes' };
}

// ── Recurrence unit helpers ─────────────────────────────────────────────────

type RecurrenceUnit = 'days' | 'weeks' | 'months' | 'years';

function recurrenceUnitToFreq(unit: RecurrenceUnit): RecurrenceFreq {
  switch (unit) {
    case 'days': return 'DAILY';
    case 'weeks': return 'WEEKLY';
    case 'months': return 'MONTHLY';
    case 'years': return 'YEARLY';
  }
}

function freqToRecurrenceUnit(freq: RecurrenceFreq): RecurrenceUnit {
  switch (freq) {
    case 'DAILY': return 'days';
    case 'WEEKLY': return 'weeks';
    case 'MONTHLY': return 'months';
    case 'YEARLY': return 'years';
  }
}

function recurrenceUnitKey(unit: RecurrenceUnit): string {
  return `calendar.unit${unit.charAt(0).toUpperCase()}${unit.slice(1)}`;
}

// ── Reminder label helper ───────────────────────────────────────────────────

function reminderSummary(
  reminder: CalendarEvent["reminder"],
  customMinutes: number | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (reminder === "custom" && customMinutes) {
    const { value, unit } = fromCustomReminderMinutes(customMinutes);
    return t('calendar.customReminderValue', { value, unit: t(reminderUnitKey(unit)) });
  }
  const found = REMINDERS.find((r) => r.value === reminder);
  return found ? t(found.labelKey) : t('calendar.remNone');
}

function singleReminderLabel(
  r: EventReminder,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (r.preset === 'custom' && r.customMinutes) {
    const { value, unit } = fromCustomReminderMinutes(r.customMinutes);
    return t('calendar.customReminderValue', { value, unit: t(reminderUnitKey(unit)) });
  }
  const found = REMINDERS.find((rem) => rem.value === r.preset);
  return found ? t(found.labelKey) : t('calendar.remNone');
}

function multiReminderSummary(
  reminders: EventReminder[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (reminders.length === 0) return t('calendar.remNone');
  if (reminders.length === 1) return singleReminderLabel(reminders[0], t);
  return `${reminders.length} ${t('calendar.remMultiple')}`;
}

const TB_REMINDER_LABELS: Record<string, string> = {
  none: 'calendar.remNone', '5min': 'calendar.tbRem5min', '10min': 'calendar.rem10min',
  '30min': 'calendar.rem30min', '1h': 'calendar.rem1h', custom: 'calendar.remCustom',
};

function tbReminderSummary(
  reminders: TimeBlockReminder[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (reminders.length === 0) return t('calendar.remNone');
  if (reminders.length === 1) {
    const r = reminders[0];
    if (r.preset === 'custom' && r.customMinutes) {
      const { value, unit } = fromCustomReminderMinutes(r.customMinutes);
      return t('calendar.customReminderValue', { value, unit: t(reminderUnitKey(unit)) });
    }
    return t(TB_REMINDER_LABELS[r.preset] ?? 'calendar.remNone');
  }
  return `${reminders.length} ${t('calendar.remMultiple')}`;
}

// ── Recurrence label helper ─────────────────────────────────────────────────

function recurrenceSummary(
  recurrence: RecurrenceFreq | "none" | "custom",
  customInterval: number | undefined,
  customUnit: RecurrenceUnit | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (recurrence === "custom" && customInterval && customUnit) {
    return t('calendar.customRecurrenceValue', { value: customInterval, unit: t(recurrenceUnitKey(customUnit)) });
  }
  const found = RECURRENCES.find((r) => r.value === recurrence);
  return found ? t(found.labelKey) : t('calendar.recurNone');
}

// ── Color/label summary helper ──────────────────────────────────────────────

function colorLabelSummary(
  color: string,
  label: string | undefined,
  t: (key: string) => string,
): string {
  if (label) return label;
  if (color.startsWith("#")) return color;
  const found = COLORS.find((c) => c.id === color);
  return found ? found.id.charAt(0).toUpperCase() + found.id.slice(1) : t('calendar.color');
}

// ── Pill Section Component ──────────────────────────────────────────────────

type PillSection = 'reminder' | 'recurrence' | 'colorLabel';

function SectionPill({
  label,
  summary,
  isOpen,
  onToggle,
  colorDot,
  children,
}: {
  label: string;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  colorDot?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-colors ${
          isOpen ? "bg-gray-700 border border-gray-600" : "bg-gray-800 border border-gray-700 hover:bg-gray-750"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {colorDot && (
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${colorDot.startsWith("#") ? "" : getColor(colorDot).bg}`}
              style={colorDot.startsWith("#") ? { backgroundColor: colorDot } : undefined}
            />
          )}
          <span className="text-gray-400 font-bold shrink-0">{label}</span>
          <span className="text-white truncate">{summary}</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-500 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 px-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Event Form Modal ─────────────────────────────────────────────────────────

function EventFormModal({
  initial, defaultDate, defaultStartTime, onSave, onClose,
}: {
  initial: CalendarEvent | null;
  defaultDate: string;
  defaultStartTime?: string;
  onSave: (ev: CalendarEvent) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const defaults = useMemo(() => loadDefaults(), []);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(initial?.startTime ?? defaultStartTime ?? "09:00");
  const [duration, setDuration] = useState<CalendarEvent["duration"]>(initial?.duration ?? defaults.duration);
  const [customDurationMinutes, setCustomDurationMinutes] = useState<number>(initial?.customDurationMinutes ?? 60);
  const [customEndTimeInput, setCustomEndTimeInput] = useState<string>(() =>
    initial?.duration === "custom" && initial.customDurationMinutes
      ? addMinutesToTime(initial.startTime, initial.customDurationMinutes)
      : ""
  );
  const [showEndDropdown, setShowEndDropdown] = useState(false);
  const [showCustomEndInput, setShowCustomEndInput] = useState(false);
  const endDropdownRef = useRef<HTMLDivElement>(null);
  // Multiple reminders state
  const [eventReminders, setEventReminders] = useState<EventReminder[]>(() => {
    if (initial?.reminders && initial.reminders.length > 0) return initial.reminders;
    // Fallback to legacy single reminder
    const legacyPreset = initial?.reminder ?? defaults.reminder;
    if (legacyPreset === 'none') return [];
    return [{ preset: legacyPreset, customMinutes: initial?.customReminderMinutes ?? defaults.customReminderMinutes }];
  });
  // Legacy compat — kept for defaults save (uses first reminder or 'none')
  const reminder: EventReminderPreset = eventReminders.length > 0 ? eventReminders[0].preset : 'none';
  const customReminderValue = (() => {
    const first = eventReminders.find(r => r.preset === 'custom');
    const mins = first?.customMinutes;
    return mins ? fromCustomReminderMinutes(mins).value : 15;
  })();
  const customReminderUnit: ReminderUnit = (() => {
    const first = eventReminders.find(r => r.preset === 'custom');
    const mins = first?.customMinutes;
    return mins ? fromCustomReminderMinutes(mins).unit : 'minutes';
  })();
  const [color, setColor] = useState(initial?.color ?? defaults.color);
  const [labelText, setLabelText] = useState(initial?.label ?? defaults.label ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  // Recurrence state
  const initialFreq = (() => {
    if (!initial?.rrule) return (defaults.recurrence ?? "none") as RecurrenceFreq | "none" | "custom";
    const match = initial.rrule.match(/FREQ=(\w+)/);
    const interval = initial.rrule.match(/INTERVAL=(\d+)/);
    const freq = match?.[1] as RecurrenceFreq | undefined;
    if (freq && interval && parseInt(interval[1]) > 1) return "custom" as const;
    return (freq ?? "none") as RecurrenceFreq | "none";
  })();
  const [recurrence, setRecurrence] = useState<RecurrenceFreq | "none" | "custom">(initialFreq);
  const [customRecInterval, setCustomRecInterval] = useState<number>(() => {
    if (initial?.rrule) {
      const match = initial.rrule.match(/INTERVAL=(\d+)/);
      if (match) return parseInt(match[1]);
    }
    return defaults.customRecurrenceInterval ?? 2;
  });
  const [customRecUnit, setCustomRecUnit] = useState<RecurrenceUnit>(() => {
    if (initial?.rrule) {
      const match = initial.rrule.match(/FREQ=(\w+)/);
      if (match) return freqToRecurrenceUnit(match[1] as RecurrenceFreq);
    }
    return defaults.customRecurrenceUnit ?? 'days';
  });

  // Labels
  const [labels, setLabels] = useState<CalendarLabel[]>(() => loadLabels());

  // Invitees
  const contacts = useMemo(() => loadContacts(), []);
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>(
    initial?.invitees?.map((i) => i.aregoId) ?? []
  );
  const [showInviteePicker, setShowInviteePicker] = useState(false);

  // Accordion state — only one pill open at a time
  const [openSection, setOpenSection] = useState<PillSection | null>(null);
  const toggleSection = (section: PillSection) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  // Close end-time dropdown on outside click
  useEffect(() => {
    if (!showEndDropdown) return;
    const handler = (e: MouseEvent) => {
      if (endDropdownRef.current && !endDropdownRef.current.contains(e.target as Node)) {
        setShowEndDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEndDropdown]);

  // Defaults saved flash
  const [showDefaultsSaved, setShowDefaultsSaved] = useState(false);

  const toggleInvitee = (aregoId: string) => {
    setSelectedInvitees((prev) =>
      prev.includes(aregoId) ? prev.filter((id) => id !== aregoId) : [...prev, aregoId]
    );
  };

  const handleSaveDefaults = () => {
    const newDefaults: CalendarEventDefaults = {
      duration,
      customDurationMinutes: duration === 'custom' ? customDurationMinutes : undefined,
      reminder,
      customReminderMinutes: reminder === 'custom' ? toCustomReminderMinutes(customReminderValue, customReminderUnit) : undefined,
      recurrence: recurrence === 'custom' ? 'none' : recurrence,
      customRecurrenceInterval: recurrence === 'custom' ? customRecInterval : undefined,
      customRecurrenceUnit: recurrence === 'custom' ? customRecUnit : undefined,
      color,
      label: labelText.trim() || undefined,
    };
    saveDefaults(newDefaults);
    setShowDefaultsSaved(true);
    setTimeout(() => setShowDefaultsSaved(false), 2000);
  };

  const handleSaveLabel = () => {
    if (!labelText.trim()) return;
    const existing = labels.find((l) => l.name.toLowerCase() === labelText.trim().toLowerCase());
    if (existing) {
      // Update color of existing label
      const updated = labels.map((l) => l.id === existing.id ? { ...l, color } : l);
      setLabels(updated);
      saveLabels(updated);
    } else {
      const newLabel: CalendarLabel = { id: generateId(), name: labelText.trim(), color };
      const updated = [...labels, newLabel];
      setLabels(updated);
      saveLabels(updated);
    }
  };

  const handleSelectLabel = (label: CalendarLabel) => {
    setLabelText(label.name);
    setColor(label.color);
  };

  const handleDeleteLabel = (labelId: string) => {
    const updated = labels.filter((l) => l.id !== labelId);
    setLabels(updated);
    saveLabels(updated);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    let rrule: string | undefined;
    if (recurrence === "custom") {
      rrule = buildRRule({ freq: recurrenceUnitToFreq(customRecUnit), interval: customRecInterval });
    } else if (recurrence !== "none") {
      rrule = buildRRule({ freq: recurrence });
    }
    const customReminderMinutes = reminder === 'custom'
      ? toCustomReminderMinutes(customReminderValue, customReminderUnit)
      : undefined;
    // Auto-save label if new
    if (labelText.trim()) handleSaveLabel();
    const invitees: EventInvitee[] | undefined = selectedInvitees.length > 0
      ? selectedInvitees.map((id) => {
          const existing = initial?.invitees?.find((i) => i.aregoId === id);
          const contact = contacts.find((c) => c.aregoId === id);
          return {
            aregoId: id,
            displayName: existing?.displayName ?? contact?.displayName ?? id,
            status: existing?.status ?? ("pending" as InviteStatus),
          };
        })
      : undefined;
    onSave({
      id: initial?.id ?? generateId(),
      title: title.trim(),
      date,
      startTime,
      duration,
      customDurationMinutes: duration === "custom" ? customDurationMinutes : undefined,
      reminder,
      customReminderMinutes,
      reminders: eventReminders,
      color,
      label: labelText.trim() || undefined,
      address: address.trim() || undefined,
      note: note.trim() || undefined,
      rrule,
      exdates: initial?.exdates,
      invitees,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-gray-900 rounded-t-3xl border-t border-gray-700 p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">{initial ? t('calendar.editEvent') : t('calendar.newEvent')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-800"><X size={20} /></button>
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('calendar.eventTitle')}
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
        />

        {/* Date + Time + Bis (End) */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div>
            <label className="text-xs text-gray-500 font-bold mb-1 block">{t('calendar.date')}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-bold mb-1 block">{t('calendar.time')}</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={duration === "allday"}
              className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 [color-scheme:dark]"
            />
          </div>
          <div className="relative" ref={endDropdownRef}>
            <label className="text-xs text-gray-500 font-bold mb-1 block">{t('calendar.endTime')}</label>
            {showCustomEndInput ? (
              <input
                type="time"
                autoFocus
                value={customEndTimeInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomEndTimeInput(val);
                  if (val) {
                    const mins = timeDiffMinutes(startTime, val);
                    if (mins > 0) {
                      setDuration("custom");
                      setCustomDurationMinutes(mins);
                    }
                  }
                }}
                onBlur={() => {
                  if (!customEndTimeInput || timeDiffMinutes(startTime, customEndTimeInput) <= 0) {
                    setShowCustomEndInput(false);
                  }
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowEndDropdown((p) => !p)}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
              >
                <span className={duration === "allday" ? "" : "tabular-nums"}>
                  {duration === "allday"
                    ? t('calendar.allDay')
                    : addMinutesToTime(startTime, durationMinutes(duration, customDurationMinutes))}
                </span>
                <ChevronDown size={14} className="text-gray-400 shrink-0 ml-1" />
              </button>
            )}
            {showEndDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
                {[
                  { dur: "15min" as const, label: "+15 Min", mins: 15 },
                  { dur: "30min" as const, label: "+30 Min", mins: 30 },
                  { dur: "1h" as const, label: "+1 Std", mins: 60 },
                  { dur: "2h" as const, label: "+2 Std", mins: 120 },
                ].map((opt) => (
                  <button
                    key={opt.dur}
                    type="button"
                    onClick={() => {
                      setDuration(opt.dur);
                      setShowEndDropdown(false);
                      setShowCustomEndInput(false);
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-700 flex items-center justify-between ${
                      duration === opt.dur ? "text-blue-400 font-bold" : "text-gray-300"
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="text-gray-500 tabular-nums">{addMinutesToTime(startTime, opt.mins)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setDuration("allday");
                    setShowEndDropdown(false);
                    setShowCustomEndInput(false);
                  }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-700 ${
                    duration === "allday" ? "text-blue-400 font-bold" : "text-gray-300"
                  }`}
                >
                  {t('calendar.allDay')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEndDropdown(false);
                    setShowCustomEndInput(true);
                    setCustomEndTimeInput(addMinutesToTime(startTime, durationMinutes(duration, customDurationMinutes)));
                  }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-700 border-t border-gray-700 ${
                    duration === "custom" ? "text-blue-400 font-bold" : "text-gray-300"
                  }`}
                >
                  {t('calendar.endTimeCustom')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Collapsible Pill Sections ─────────────────────────────────── */}

        {/* Reminder Pill — multiple reminders */}
        <SectionPill
          label={t('calendar.reminder')}
          summary={multiReminderSummary(eventReminders, t)}
          isOpen={openSection === 'reminder'}
          onToggle={() => toggleSection('reminder')}
        >
          <div className="space-y-2 mb-2">
            {eventReminders.map((r, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={r.preset}
                  onChange={(e) => {
                    const next = [...eventReminders];
                    next[idx] = { ...r, preset: e.target.value as EventReminderPreset };
                    setEventReminders(next);
                  }}
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                >
                  {REMINDERS.filter(rem => rem.value !== 'none').map((rem) => (
                    <option key={rem.value} value={rem.value}>{t(rem.labelKey)}</option>
                  ))}
                  <option value="custom">{t('calendar.remCustom')}</option>
                </select>
                {r.preset === 'custom' && (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={r.customMinutes ? fromCustomReminderMinutes(r.customMinutes).value : 15}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        const unit = r.customMinutes ? fromCustomReminderMinutes(r.customMinutes).unit : 'minutes';
                        const next = [...eventReminders];
                        next[idx] = { ...r, customMinutes: toCustomReminderMinutes(val, unit) };
                        setEventReminders(next);
                      }}
                      className="w-16 px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                    />
                    <select
                      value={r.customMinutes ? fromCustomReminderMinutes(r.customMinutes).unit : 'minutes'}
                      onChange={(e) => {
                        const unit = e.target.value as ReminderUnit;
                        const val = r.customMinutes ? fromCustomReminderMinutes(r.customMinutes).value : 15;
                        const next = [...eventReminders];
                        next[idx] = { ...r, customMinutes: toCustomReminderMinutes(val, unit) };
                        setEventReminders(next);
                      }}
                      className="px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                    >
                      <option value="minutes">{t('calendar.unitMinutes')}</option>
                      <option value="hours">{t('calendar.unitHours')}</option>
                      <option value="days">{t('calendar.unitDays')}</option>
                      <option value="weeks">{t('calendar.unitWeeks')}</option>
                    </select>
                  </>
                )}
                <button
                  onClick={() => setEventReminders(prev => prev.filter((_, i) => i !== idx))}
                  className="p-1.5 rounded-full hover:bg-gray-800 text-gray-500 hover:text-red-400 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setEventReminders(prev => [...prev, { preset: '10min' }])}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium"
          >
            + {t('calendar.bdAddReminder')}
          </button>
        </SectionPill>

        {/* Recurrence Pill */}
        <SectionPill
          label={t('calendar.recurrence')}
          summary={recurrenceSummary(recurrence, customRecInterval, customRecUnit, t)}
          isOpen={openSection === 'recurrence'}
          onToggle={() => toggleSection('recurrence')}
        >
          <div className="flex flex-wrap gap-2 mb-3">
            {RECURRENCES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRecurrence(r.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  recurrence === r.value ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {t(r.labelKey)}
              </button>
            ))}
            <button
              onClick={() => setRecurrence('custom')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                recurrence === 'custom' ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {t('calendar.recurCustom')}
            </button>
          </div>
          {recurrence === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={999}
                value={customRecInterval}
                onChange={(e) => setCustomRecInterval(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
              />
              <select
                value={customRecUnit}
                onChange={(e) => setCustomRecUnit(e.target.value as RecurrenceUnit)}
                className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="days">{t('calendar.unitDays')}</option>
                <option value="weeks">{t('calendar.unitWeeks')}</option>
                <option value="months">{t('calendar.unitMonths')}</option>
                <option value="years">{t('calendar.unitYears')}</option>
              </select>
            </div>
          )}
        </SectionPill>

        {/* Color & Label Pill */}
        <SectionPill
          label={t('calendar.colorAndLabel')}
          summary={colorLabelSummary(color, labelText.trim() || undefined, t)}
          isOpen={openSection === 'colorLabel'}
          onToggle={() => toggleSection('colorLabel')}
          colorDot={color}
        >
          {/* Color picker: preset colors + free hex input */}
          <div className="flex items-center gap-3 mb-3">
            {COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setColor(c.id)}
                className={`w-8 h-8 rounded-full ${c.bg} transition-all ${
                  color === c.id ? `ring-2 ${c.ring} ring-offset-2 ring-offset-gray-900 scale-110` : "opacity-60 hover:opacity-100"
                }`}
              />
            ))}
            <div className="relative">
              <input
                type="color"
                value={color.startsWith("#") ? color : "#3b82f6"}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded-full cursor-pointer border-0 p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                title="Colorpicker"
              />
              {color.startsWith("#") && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-gray-900" />
              )}
            </div>
          </div>

          {/* Label name */}
          <input
            type="text"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            placeholder={t('calendar.labelNamePlaceholder')}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          />

          {/* Saved labels */}
          {labels.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-bold mb-1.5">{t('calendar.savedLabels')}</p>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => handleSelectLabel(l)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      labelText === l.name ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${l.color.startsWith("#") ? "" : getColor(l.color).bg}`}
                      style={l.color.startsWith("#") ? { backgroundColor: l.color } : undefined}
                    />
                    {l.name}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteLabel(l.id); }}
                      className="ml-0.5 text-gray-500 hover:text-red-400"
                    >
                      <X size={10} />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}
        </SectionPill>

        {/* Invitees */}
        {contacts.length > 0 && (
          <div className="mb-4">
            <label className="text-xs text-gray-500 font-bold mb-2 block">{t('calendar.invitees')}</label>
            {selectedInvitees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedInvitees.map((id) => {
                  const c = contacts.find((ct) => ct.aregoId === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-600/20 text-purple-300 text-xs font-medium">
                      {c?.displayName ?? id.slice(0, 8)}
                      <button onClick={() => toggleInvitee(id)} className="hover:text-white"><X size={12} /></button>
                    </span>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setShowInviteePicker(!showInviteePicker)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <UserPlus size={14} /> {t('calendar.addInvitees')}
            </button>
            <AnimatePresence>
              {showInviteePicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-2"
                >
                  <div className="max-h-40 overflow-y-auto space-y-1 bg-gray-800/50 rounded-xl p-2">
                    {contacts.map((c) => {
                      const selected = selectedInvitees.includes(c.aregoId);
                      return (
                        <button
                          key={c.aregoId}
                          onClick={() => toggleInvitee(c.aregoId)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-sm transition-all ${
                            selected ? "bg-purple-600/15 text-purple-300" : "text-gray-300 hover:bg-gray-700"
                          }`}
                        >
                          <span className="truncate">{c.displayName}</span>
                          {selected && <Check size={14} className="text-purple-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Address */}
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('calendar.addressOptional')}
          className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />

        {/* Note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('calendar.noteOptional')}
          rows={2}
          className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 resize-none"
        />

        {/* Save Event */}
        <button
          onClick={handleSave}
          disabled={!title.trim()}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-3"
        >
          {initial ? t('common.save') : t('calendar.createEvent')}
        </button>

        {/* Save as Default */}
        <button
          onClick={handleSaveDefaults}
          className="w-full py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 font-medium text-xs hover:bg-gray-750 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          {showDefaultsSaved ? (
            <>
              <Check size={14} className="text-green-400" />
              <span className="text-green-400">{t('calendar.defaultsSaved')}</span>
            </>
          ) : (
            <>
              <Save size={14} />
              {t('calendar.saveAsDefault')}
            </>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Event Detail Modal ───────────────────────────────────────────────────────

function EventDetailModal({
  event, onClose, onEdit, onDelete, onRsvp,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRsvp?: (eventId: string, status: InviteStatus) => void;
}) {
  const { t } = useTranslation();
  const MONTHS = t('calendar.months', { returnObjects: true }) as string[];
  const [showConfirm, setShowConfirm] = useState(false);
  const c = getColor(event.color);
  const dateObj = parseDate(event.date);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-gray-900 rounded-3xl border border-gray-700 p-6 shadow-2xl"
      >
        {/* Color bar */}
        <div className={`w-full h-1.5 rounded-full ${colorBgClass(event.color)} mb-4`} style={colorStyle(event.color)} />

        <h2 className="text-xl font-bold text-white mb-1">{event.title}</h2>
        <p className="text-sm text-gray-400 mb-4">
          {dateObj.getDate()}. {MONTHS[dateObj.getMonth()]} {dateObj.getFullYear()}
          {event.duration !== "allday" && ` | ${t('calendar.atTime', { time: event.startTime })}`}
        </p>

        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Clock size={14} />
          <span>
            {event.duration === "allday"
              ? t('calendar.allDay')
              : `${event.startTime} – ${addMinutesToTime(event.startTime, durationMinutes(event.duration, event.customDurationMinutes))}`}
          </span>
        </div>

        {((event.reminders && event.reminders.length > 0) || event.reminder !== "none") && (
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <span>{t('calendar.reminderLabel', { label: event.reminders && event.reminders.length > 0 ? multiReminderSummary(event.reminders, t) : reminderSummary(event.reminder, event.customReminderMinutes, t) })}</span>
          </div>
        )}

        {event.label && (
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Tag size={14} />
            <span>{event.label}</span>
          </div>
        )}

        {event.rrule && (
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Repeat size={14} />
            <span>{rruleLabel(event.rrule, t)}</span>
          </div>
        )}

        {event.address && (
          <div className="flex items-start gap-2 text-sm text-gray-300 mt-3 p-3 rounded-xl bg-gray-800">
            <span className="shrink-0">📍</span>
            <span className="whitespace-pre-wrap break-words">{event.address}</span>
          </div>
        )}

        {event.note && (
          <p className="text-sm text-gray-300 mt-3 p-3 rounded-xl bg-gray-800 whitespace-pre-wrap break-words">{event.note}</p>
        )}

        {/* Invitees display */}
        {event.invitees && event.invitees.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 font-bold mb-1.5">{t('calendar.invitees')}</p>
            <div className="space-y-1">
              {event.invitees.map((inv) => (
                <div key={inv.aregoId} className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${
                    inv.status === "accepted" ? "bg-green-500" :
                    inv.status === "declined" ? "bg-red-500" :
                    inv.status === "maybe" ? "bg-yellow-500" : "bg-gray-500"
                  }`} />
                  <span className="text-gray-300">{inv.displayName}</span>
                  <span className="text-xs text-gray-500">{t(`calendar.rsvp${inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}`)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RSVP buttons for received invitations */}
        {event.id.startsWith("invite-") && onRsvp && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 font-bold mb-2">{t('calendar.yourResponse')}</p>
            <div className="flex gap-2">
              <button onClick={() => onRsvp(event.id.replace("invite-", ""), "accepted")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs font-bold transition-colors">
                <Check size={14} /> {t('calendar.rsvpAccept')}
              </button>
              <button onClick={() => onRsvp(event.id.replace("invite-", ""), "maybe")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 text-xs font-bold transition-colors">
                <HelpCircle size={14} /> {t('calendar.rsvpMaybe')}
              </button>
              <button onClick={() => onRsvp(event.id.replace("invite-", ""), "declined")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-bold transition-colors">
                <XCircle size={14} /> {t('calendar.rsvpDecline')}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold transition-colors"
          >
            <Edit2 size={16} /> {t('common.edit')}
          </button>
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-bold transition-colors"
            >
              <Trash2 size={16} /> {t('common.delete')}
            </button>
          ) : (
            <button
              onClick={onDelete}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold transition-colors animate-pulse"
            >
              {t('calendar.confirmDelete')}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Time Block Editor ───────────────────────────────────────────────────────

const WEEKDAY_INDICES = [0, 1, 2, 3, 4, 5, 6]; // Mon-Sun

// ── Contact/List helpers for DND picker ───────────────────────────────────

const DEFAULT_TABS: Tab[] = [
  { id: "all", label: "Alle" },
  { id: "family", label: "Familie" },
  { id: "friends", label: "Freunde" },
  { id: "work", label: "Arbeit" },
  { id: "child", label: "Kinder" },
  { id: "other", label: "Sonstige" },
];

function loadTabs(): Tab[] {
  try {
    const saved = JSON.parse(localStorage.getItem('arego_tabs') ?? '');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch { /* ignore */ }
  return DEFAULT_TABS;
}

interface PickerEntry {
  id: string;
  label: string;
  kind: 'contact' | 'list';
}

function loadPickerEntries(): PickerEntry[] {
  const savedCats: Record<string, string[]> = (() => { try { return JSON.parse(localStorage.getItem('arego_contact_categories') ?? '{}'); } catch { return {}; } })();
  const contacts: PickerEntry[] = loadContacts().map((c) => ({
    id: c.aregoId,
    label: c.displayName,
    kind: 'contact' as const,
  }));
  const tabs = loadTabs().filter(t => t.id !== 'all' && !t.hidden);
  const lists: PickerEntry[] = tabs.map((t) => ({
    id: `list:${t.id}`,
    label: t.label,
    kind: 'list' as const,
  }));
  return [...lists, ...contacts];
}

// ── Do-Not-Disturb Settings Sub-Form ──────────────────────────────────────

function DndSettingsForm({
  dnd, onChange, inputClass,
}: {
  dnd: DoNotDisturbSettings;
  onChange: (dnd: DoNotDisturbSettings) => void;
  inputClass: string;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const entries = useMemo(() => loadPickerEntries(), []);

  const modes: { value: DndNotificationMode; label: string }[] = [
    { value: 'silent', label: t('calendar.dndSilent') },
    { value: 'vibration', label: t('calendar.dndVibration') },
    { value: 'normal', label: t('calendar.dndNormal') },
  ];

  const selected = dnd.allowedContacts ?? [];
  const toggleEntry = (id: string) => {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    onChange({ ...dnd, allowedContacts: next });
  };
  const removeEntry = (id: string) => {
    onChange({ ...dnd, allowedContacts: selected.filter(x => x !== id) });
  };

  const labelFor = (id: string) => entries.find(e => e.id === id)?.label ?? id;
  const kindFor = (id: string) => entries.find(e => e.id === id)?.kind ?? 'contact';

  const filtered = entries.filter(e =>
    !pickerSearch || e.label.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  return (
    <div className="space-y-3 mt-2">
      {/* Wer darf mich erreichen? — Contact/List Picker */}
      <div>
        <label className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
          <Users size={12} /> {t('calendar.dndAllowedContacts')}
        </label>

        {/* Selected tags/pills */}
        <div
          className={`min-h-[38px] flex flex-wrap gap-1.5 p-1.5 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer ${pickerOpen ? 'border-purple-500' : ''}`}
          onClick={() => setPickerOpen(!pickerOpen)}
        >
          {selected.length === 0 && (
            <span className="text-xs text-gray-500 px-1 py-1">{t('calendar.dndContactsPlaceholder')}</span>
          )}
          {selected.map((id) => (
            <span key={id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              kindFor(id) === 'list' ? 'bg-purple-600/30 text-purple-300' : 'bg-blue-600/30 text-blue-300'
            }`}>
              {kindFor(id) === 'list' && <Users size={10} />}
              {labelFor(id)}
              <button onClick={(e) => { e.stopPropagation(); removeEntry(id); }} className="hover:text-white ml-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>

        {/* Dropdown picker */}
        {pickerOpen && (
          <div className="mt-1 rounded-lg border border-gray-700 bg-gray-900 overflow-hidden max-h-48 flex flex-col">
            <input
              type="text"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder={t('calendar.dndContactsPlaceholder')}
              className="w-full bg-gray-800 border-b border-gray-700 px-2 py-1.5 text-xs text-white outline-none"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-3">—</p>
              )}
              {filtered.map((e) => {
                const isSelected = selected.includes(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); toggleEntry(e.id); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                      isSelected ? 'bg-purple-600/20 text-purple-300' : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {e.kind === 'list' && <Users size={12} className="text-purple-400 shrink-0" />}
                    <span className="flex-1 truncate">{e.label}</span>
                    {isSelected && <Check size={12} className="text-purple-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Benachrichtigungsmodus */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">{t('calendar.dndNotificationMode')}</label>
        <div className="flex gap-1.5">
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => onChange({ ...dnd, notificationMode: m.value })}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                dnd.notificationMode === m.value ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sortable Block Item (Drag & Drop + Expandable Edit) ─────────────────

function SortableBlockItem({
  block, index, weekdays, weekdayIndices, onRemove, onUpdate, inputClass,
}: {
  block: TimeBlock; index: number; weekdays: string[]; weekdayIndices: number[];
  onRemove: (id: string) => void;
  onUpdate: (updated: TimeBlock) => void;
  inputClass: string;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [expanded, setExpanded] = useState(false);

  // Local edit state — initialized from block, synced on save
  const [editName, setEditName] = useState(block.name);
  const [editDays, setEditDays] = useState<number[]>([...block.daysOfWeek]);
  const [editStart, setEditStart] = useState(block.startTime);
  const [editEnd, setEditEnd] = useState(block.endTime);
  const [editInterruptible, setEditInterruptible] = useState(block.isInterruptible);
  const [editBufferBefore, setEditBufferBefore] = useState(block.bufferBefore?.minutes?.toString() ?? "");
  const [editBufferBeforeName, setEditBufferBeforeName] = useState(block.bufferBefore?.name ?? "");
  const [editBufferAfter, setEditBufferAfter] = useState(block.bufferAfter?.minutes?.toString() ?? "");
  const [editBufferAfterName, setEditBufferAfterName] = useState(block.bufferAfter?.name ?? "");
  const [editDnd, setEditDnd] = useState<DoNotDisturbSettings>(
    block.doNotDisturb ?? { enabled: false, allowedContacts: [], notificationMode: 'silent' }
  );
  const [showDnd, setShowDnd] = useState(editDnd.enabled);
  const [editReminders, setEditReminders] = useState<TimeBlockReminder[]>(block.reminders ?? []);
  const [showReminders, setShowReminders] = useState(editReminders.length > 0);

  const toggleEditDay = (d: number) => {
    setEditDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const saveEdit = () => {
    if (!editName.trim() || editDays.length === 0) return;
    onUpdate({
      ...block,
      name: editName.trim(),
      daysOfWeek: [...editDays].sort((a, b) => a - b),
      startTime: editStart,
      endTime: editEnd,
      isInterruptible: editInterruptible,
      bufferBefore: editBufferBefore ? { minutes: parseInt(editBufferBefore), name: editBufferBeforeName.trim() || undefined } : undefined,
      bufferAfter: editBufferAfter ? { minutes: parseInt(editBufferAfter), name: editBufferAfterName.trim() || undefined } : undefined,
      doNotDisturb: showDnd ? { ...editDnd, enabled: true } : undefined,
      reminders: editReminders.length > 0 ? editReminders : undefined,
    });
    setExpanded(false);
  };

  return (
    <div ref={setNodeRef} style={style} className={`rounded-xl border ${TIME_BLOCK_COLOR} overflow-hidden`}>
      {/* Collapsed header */}
      <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <button {...attributes} {...listeners} className="p-1 text-gray-500 hover:text-gray-300 cursor-grab touch-none" onClick={(e) => e.stopPropagation()}>
          <GripVertical size={14} />
        </button>
        <div className="text-sm font-bold text-gray-400 w-5 text-center">{index + 1}.</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {block.name} | {formatDays(block.daysOfWeek, weekdays)} {block.startTime}–{block.endTime} | {block.isInterruptible ? t('calendar.interruptibleYes') : t('calendar.interruptibleNo')}
          </div>
          {(block.bufferBefore || block.bufferAfter) && (
            <div className="text-xs text-gray-400 mt-0.5">
              {block.bufferBefore && <span>{t('calendar.bufferBefore')}: {block.bufferBefore.minutes} min{block.bufferBefore.name ? ` (${block.bufferBefore.name})` : ""} </span>}
              {block.bufferAfter && <span>{t('calendar.bufferAfter')}: {block.bufferAfter.minutes} min{block.bufferAfter.name ? ` (${block.bufferAfter.name})` : ""}</span>}
            </div>
          )}
          {block.doNotDisturb?.enabled && (
            <div className="text-xs text-purple-400 mt-0.5 flex items-center gap-1"><BellOff size={10} /> {t('calendar.dndActive')}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
          <button onClick={(e) => { e.stopPropagation(); onRemove(block.id); }} className="p-1 text-gray-500 hover:text-red-400">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div className="border-t border-gray-700/50 p-4 space-y-3">
          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('calendar.blockName')}</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              placeholder={t('calendar.blockNamePlaceholder')} className={inputClass} />
          </div>

          {/* Weekday chips */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('calendar.days')}</label>
            <div className="flex flex-wrap gap-1.5">
              {weekdayIndices.map((i) => (
                <button key={i} onClick={() => toggleEditDay(i)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    editDays.includes(i) ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}>
                  {weekdays[i]}
                </button>
              ))}
            </div>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.from')}</label>
              <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.to')}</label>
              <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Interruptible toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">{t('calendar.interruptible')}</label>
            <button onClick={() => setEditInterruptible(!editInterruptible)}
              className={`w-10 h-6 rounded-full transition-colors relative ${editInterruptible ? "bg-blue-600" : "bg-gray-700"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${editInterruptible ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Buffer before */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bufferBefore')} (min)</label>
              <input type="number" min="0" value={editBufferBefore} onChange={(e) => setEditBufferBefore(e.target.value)}
                placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bufferName')}</label>
              <input type="text" value={editBufferBeforeName} onChange={(e) => setEditBufferBeforeName(e.target.value)}
                placeholder={t('calendar.bufferNamePlaceholder')} className={inputClass} />
            </div>
          </div>

          {/* Buffer after */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bufferAfter')} (min)</label>
              <input type="number" min="0" value={editBufferAfter} onChange={(e) => setEditBufferAfter(e.target.value)}
                placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bufferName')}</label>
              <input type="text" value={editBufferAfterName} onChange={(e) => setEditBufferAfterName(e.target.value)}
                placeholder={t('calendar.bufferNamePlaceholder')} className={inputClass} />
            </div>
          </div>

          {/* Do Not Disturb — collapsible pill */}
          <div className="rounded-xl border border-gray-700/50 overflow-hidden">
            <button
              onClick={() => { setShowDnd(!showDnd); if (!showDnd) setEditDnd(prev => ({ ...prev, enabled: true })); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors ${
                showDnd ? "bg-purple-600/20 text-purple-300" : "bg-gray-800/50 text-gray-400 hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                {showDnd ? <BellOff size={14} /> : <Bell size={14} />}
                {t('calendar.dndLabel')} {showDnd ? t('calendar.dndActive') : t('calendar.dndOff')}
              </span>
              {showDnd ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showDnd && (
              <div className="px-3 pb-3 bg-gray-800/30">
                <DndSettingsForm dnd={editDnd} onChange={setEditDnd} inputClass={inputClass} />
              </div>
            )}
          </div>

          {/* Reminders — collapsible pill */}
          <div className="rounded-xl border border-gray-700/50 overflow-hidden">
            <button
              onClick={() => setShowReminders(!showReminders)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors ${
                showReminders ? "bg-blue-600/20 text-blue-300" : "bg-gray-800/50 text-gray-400 hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <Bell size={14} />
                {t('calendar.reminder')} · {tbReminderSummary(editReminders, t)}
              </span>
              {showReminders ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showReminders && (
              <div className="px-3 pb-3 pt-2 bg-gray-800/30 space-y-2">
                {editReminders.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={r.preset}
                      onChange={(e) => {
                        const next = [...editReminders];
                        next[idx] = { ...r, preset: e.target.value as TimeBlockReminder['preset'] };
                        setEditReminders(next);
                      }}
                      className="flex-1 px-3 py-2 bg-gray-800 rounded-lg text-sm text-white border border-gray-700 outline-none"
                    >
                      <option value="5min">{t('calendar.tbRem5min')}</option>
                      <option value="10min">{t('calendar.rem10min')}</option>
                      <option value="30min">{t('calendar.rem30min')}</option>
                      <option value="1h">{t('calendar.rem1h')}</option>
                      <option value="custom">{t('calendar.remCustom')}</option>
                    </select>
                    {r.preset === 'custom' && (
                      <input
                        type="number"
                        min={1}
                        value={r.customMinutes ?? 15}
                        onChange={(e) => {
                          const next = [...editReminders];
                          next[idx] = { ...r, customMinutes: parseInt(e.target.value, 10) || 15 };
                          setEditReminders(next);
                        }}
                        className="w-20 px-2 py-2 bg-gray-800 rounded-lg text-sm text-white border border-gray-700 outline-none"
                      />
                    )}
                    <button onClick={() => setEditReminders(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 rounded-full hover:bg-gray-800 text-gray-500 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setEditReminders(prev => [...prev, { preset: '10min' }])}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                  + {t('calendar.bdAddReminder')}
                </button>
              </div>
            )}
          </div>

          {/* Save button */}
          <button onClick={saveEdit}
            disabled={!editName.trim() || editDays.length === 0}
            className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
            <Save size={14} /> {t('common.save')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Time Block Editor ──────────────────────────────────────────────────────

function TimeBlockEditor({
  blocks, onSave, onClose,
}: {
  blocks: TimeBlock[];
  onSave: (blocks: TimeBlock[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const WEEKDAYS_SHORT = t('calendar.weekdaysShort', { returnObjects: true }) as string[];
  const [editing, setEditing] = useState<TimeBlock[]>([...blocks]);

  // New block form state
  const [addName, setAddName] = useState("");
  const [addDays, setAddDays] = useState<number[]>([]);
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("17:00");
  const [addInterruptible, setAddInterruptible] = useState(false);
  const [addBufferBefore, setAddBufferBefore] = useState("");
  const [addBufferBeforeName, setAddBufferBeforeName] = useState("");
  const [addBufferAfter, setAddBufferAfter] = useState("");
  const [addBufferAfterName, setAddBufferAfterName] = useState("");
  const [addDnd, setAddDnd] = useState<DoNotDisturbSettings>({ enabled: false, allowedContacts: [], notificationMode: 'silent' });
  const [addShowDnd, setAddShowDnd] = useState(false);
  const [addShowReminders, setAddShowReminders] = useState(false);
  const [addReminders, setAddReminders] = useState<TimeBlockReminder[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleDay = (d: number) => {
    setAddDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const addBlock = () => {
    if (!addName.trim() || addDays.length === 0) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newBlock: TimeBlock = {
      id,
      name: addName.trim(),
      daysOfWeek: [...addDays].sort((a, b) => a - b),
      startTime: addStart,
      endTime: addEnd,
      isInterruptible: addInterruptible,
      priority: editing.length,
      bufferBefore: addBufferBefore ? { minutes: parseInt(addBufferBefore), name: addBufferBeforeName.trim() || undefined } : undefined,
      bufferAfter: addBufferAfter ? { minutes: parseInt(addBufferAfter), name: addBufferAfterName.trim() || undefined } : undefined,
      doNotDisturb: addShowDnd ? { ...addDnd, enabled: true } : undefined,
      reminders: addReminders.length > 0 ? addReminders : undefined,
    };
    setEditing([...editing, newBlock]);
    setAddName(""); setAddDays([]); setAddStart("09:00"); setAddEnd("17:00");
    setAddInterruptible(false); setAddBufferBefore(""); setAddBufferBeforeName("");
    setAddBufferAfter(""); setAddBufferAfterName("");
    setAddDnd({ enabled: false, allowedContacts: [], notificationMode: 'silent' });
    setAddShowDnd(false); setAddReminders([]); setShowAddForm(false);
  };

  const updateBlock = (updated: TimeBlock) => {
    setEditing(editing.map((b) => b.id === updated.id ? updated : b));
  };

  const removeBlock = (id: string) => {
    setEditing(editing.filter((b) => b.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEditing((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const inputClass = "w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white [color-scheme:dark]";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-gray-900 rounded-t-3xl border-t border-gray-700 p-6 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t('calendar.timeBlocks')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-800"><X size={20} /></button>
        </div>

        {/* Existing blocks — drag & drop sortable */}
        <div className="space-y-2 mb-2">
          {editing.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">{t('calendar.noTimeBlocks')}</p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={editing.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {editing.map((b, i) => (
                <SortableBlockItem key={b.id} block={b} index={i} weekdays={WEEKDAYS_SHORT} weekdayIndices={WEEKDAY_INDICES} onRemove={removeBlock} onUpdate={updateBlock} inputClass={inputClass} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        {editing.length > 0 && (
          <p className="text-xs text-gray-500 text-center mb-4">{t('calendar.priorityHint')}</p>
        )}

        {/* Add new block — collapsible */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-3 rounded-2xl border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 text-sm font-bold transition-colors mb-4"
          >
            + {t('calendar.addTimeBlock')}
          </button>
        ) : (
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-bold uppercase">{t('calendar.addTimeBlock')}</p>
            <button onClick={() => setShowAddForm(false)} className="p-1 rounded-full hover:bg-gray-700 text-gray-500 hover:text-gray-300">
              <X size={14} />
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('calendar.blockName')}</label>
            <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
              placeholder={t('calendar.blockNamePlaceholder')}
              className={inputClass} />
          </div>

          {/* Weekday chips */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('calendar.days')}</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_INDICES.map((i) => (
                <button key={i} onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    addDays.includes(i) ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}>
                  {WEEKDAYS_SHORT[i]}
                </button>
              ))}
            </div>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.from')}</label>
              <input type="time" value={addStart} onChange={(e) => setAddStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.to')}</label>
              <input type="time" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Interruptible toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">{t('calendar.interruptible')}</label>
            <button onClick={() => setAddInterruptible(!addInterruptible)}
              className={`w-10 h-6 rounded-full transition-colors relative ${addInterruptible ? "bg-blue-600" : "bg-gray-700"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${addInterruptible ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Buffer before */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bufferBefore')} (min)</label>
              <input type="number" min="0" value={addBufferBefore} onChange={(e) => setAddBufferBefore(e.target.value)}
                placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bufferName')}</label>
              <input type="text" value={addBufferBeforeName} onChange={(e) => setAddBufferBeforeName(e.target.value)}
                placeholder={t('calendar.bufferNamePlaceholder')} className={inputClass} />
            </div>
          </div>

          {/* Buffer after */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bufferAfter')} (min)</label>
              <input type="number" min="0" value={addBufferAfter} onChange={(e) => setAddBufferAfter(e.target.value)}
                placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bufferName')}</label>
              <input type="text" value={addBufferAfterName} onChange={(e) => setAddBufferAfterName(e.target.value)}
                placeholder={t('calendar.bufferNamePlaceholder')} className={inputClass} />
            </div>
          </div>

          {/* Do Not Disturb — collapsible pill for new block */}
          <div className="rounded-xl border border-gray-700/50 overflow-hidden">
            <button
              onClick={() => { setAddShowDnd(!addShowDnd); if (!addShowDnd) setAddDnd(prev => ({ ...prev, enabled: true })); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors ${
                addShowDnd ? "bg-purple-600/20 text-purple-300" : "bg-gray-800/50 text-gray-400 hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                {addShowDnd ? <BellOff size={14} /> : <Bell size={14} />}
                {t('calendar.dndLabel')} {addShowDnd ? t('calendar.dndActive') : t('calendar.dndOff')}
              </span>
              {addShowDnd ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {addShowDnd && (
              <div className="px-3 pb-3 bg-gray-800/30">
                <DndSettingsForm dnd={addDnd} onChange={setAddDnd} inputClass={inputClass} />
              </div>
            )}
          </div>

          {/* Reminders — collapsible pill */}
          <div className="rounded-xl border border-gray-700/50 overflow-hidden">
            <button
              onClick={() => setAddShowReminders(!addShowReminders)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors ${
                addShowReminders ? "bg-blue-600/20 text-blue-300" : "bg-gray-800/50 text-gray-400 hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <Bell size={14} />
                {t('calendar.reminder')} · {tbReminderSummary(addReminders, t)}
              </span>
              {addShowReminders ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {addShowReminders && (
              <div className="px-3 pb-3 pt-2 bg-gray-800/30 space-y-2">
                {addReminders.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={r.preset}
                      onChange={(e) => {
                        const next = [...addReminders];
                        next[idx] = { ...r, preset: e.target.value as TimeBlockReminder['preset'] };
                        setAddReminders(next);
                      }}
                      className="flex-1 px-3 py-2 bg-gray-800 rounded-lg text-sm text-white border border-gray-700 outline-none"
                    >
                      <option value="5min">{t('calendar.tbRem5min')}</option>
                      <option value="10min">{t('calendar.rem10min')}</option>
                      <option value="30min">{t('calendar.rem30min')}</option>
                      <option value="1h">{t('calendar.rem1h')}</option>
                      <option value="custom">{t('calendar.remCustom')}</option>
                    </select>
                    {r.preset === 'custom' && (
                      <input
                        type="number"
                        min={1}
                        value={r.customMinutes ?? 15}
                        onChange={(e) => {
                          const next = [...addReminders];
                          next[idx] = { ...r, customMinutes: parseInt(e.target.value, 10) || 15 };
                          setAddReminders(next);
                        }}
                        className="w-20 px-2 py-2 bg-gray-800 rounded-lg text-sm text-white border border-gray-700 outline-none"
                      />
                    )}
                    <button onClick={() => setAddReminders(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 rounded-full hover:bg-gray-800 text-gray-500 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setAddReminders(prev => [...prev, { preset: '10min' }])}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                  + {t('calendar.bdAddReminder')}
                </button>
              </div>
            )}
          </div>

          <button onClick={addBlock}
            disabled={!addName.trim() || addDays.length === 0}
            className="w-full py-2 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors">
            + {t('calendar.addTimeBlock')}
          </button>
        </div>
        )}

        <button onClick={() => onSave(editing)}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-500 transition-colors">
          {t('common.save')}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Birthday Form Modal ─────────────────────────────────────────────────────

function parseBirthdayDE(str: string): { day: number; month: number; year?: number } | null {
  const parts = str.split('.');
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parts[2] ? parseInt(parts[2], 10) : undefined;
  if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month, year: year && !isNaN(year) ? year : undefined };
}

function birthdayToMMDD(day: number, month: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function BirthdayFormModal({
  initial, existingBirthdays, onSave, onSaveBatch, onDelete, onClose,
}: {
  initial: CalendarBirthday | null;
  existingBirthdays: CalendarBirthday[];
  onSave: (bd: CalendarBirthday) => void;
  onSaveBatch: (bds: CalendarBirthday[]) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!initial;
  const [tab, setTab] = useState<'import' | 'manual'>(isEdit ? 'manual' : 'import');

  // Manual entry state
  const [name, setName] = useState(initial?.name ?? '');
  const [dateStr, setDateStr] = useState(() => {
    if (!initial) return '';
    // Convert MM-DD + optional year to HTML date input format
    const [mm, dd] = initial.date.split('-');
    if (initial.year) return `${initial.year}-${mm}-${dd}`;
    return `2000-${mm}-${dd}`; // placeholder year for date input
  });
  const [note, setNote] = useState(initial?.note ?? '');
  const [reminders, setReminders] = useState<BirthdayReminder[]>(initial?.reminders ?? [...DEFAULT_BIRTHDAY_REMINDERS]);

  // Import state — use real contacts from the Contacts app (no mock data)
  const realContacts: Contact[] = useMemo(() =>
    loadContacts().map(sc => ({
      id: sc.aregoId,
      name: sc.displayName,
      categories: [] as string[],
      type: 'individual' as const,
    })), []);

  const contactsWithBirthday = useMemo(() => {
    const existingContactIds = new Set(existingBirthdays.filter(b => b.contactId).map(b => b.contactId));
    return realContacts
      .filter(c => c.type === 'individual' && c.birthday && !existingContactIds.has(c.id))
      .map(c => {
        const parsed = parseBirthdayDE(c.birthday!);
        return parsed ? { contact: c, parsed } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [existingBirthdays, realContacts]);

  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [importFilter, setImportFilter] = useState('');
  const tabs = useMemo(() => loadTabs().filter(t => t.id !== 'all' && !t.hidden), []);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const filteredContacts = useMemo(() => {
    let list = contactsWithBirthday;
    if (filterCategory !== 'all') {
      list = list.filter(x => x.contact.categories.includes(filterCategory));
    }
    if (importFilter.trim()) {
      const q = importFilter.toLowerCase();
      list = list.filter(x => x.contact.name.toLowerCase().includes(q));
    }
    return list;
  }, [contactsWithBirthday, filterCategory, importFilter]);

  const toggleContact = (id: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedContactIds(new Set(filteredContacts.map(x => x.contact.id)));
  };

  const handleImport = () => {
    const bds: CalendarBirthday[] = [];
    for (const { contact, parsed } of contactsWithBirthday) {
      if (!selectedContactIds.has(contact.id)) continue;
      bds.push({
        id: crypto.randomUUID(),
        name: contact.name,
        date: birthdayToMMDD(parsed.day, parsed.month),
        year: parsed.year,
        contactId: contact.id,
        reminders: [...DEFAULT_BIRTHDAY_REMINDERS],
      });
    }
    if (bds.length > 0) onSaveBatch(bds);
  };

  const handleManualSave = () => {
    if (!name.trim() || !dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      date: `${mm}-${dd}`,
      year: year > 1900 ? year : undefined,
      contactId: initial?.contactId,
      note: note.trim() || undefined,
      reminders,
    });
  };

  const addReminder = () => {
    setReminders(prev => [...prev, { preset: '1day' }]);
  };

  const removeReminder = (idx: number) => {
    setReminders(prev => prev.filter((_, i) => i !== idx));
  };

  const updateReminder = (idx: number, r: BirthdayReminder) => {
    setReminders(prev => prev.map((old, i) => i === idx ? r : old));
  };

  const inputClass = "w-full px-3 py-2 bg-gray-800 rounded-lg text-sm text-white border border-gray-700 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-colors";

  const REMINDER_PRESETS: { value: BirthdayReminderPreset; label: string }[] = [
    { value: 'none', label: t('calendar.remNone') },
    { value: '1day', label: t('calendar.rem1day') },
    { value: '1week', label: t('calendar.bdRem1week') },
    { value: 'custom', label: t('calendar.remCustom') },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-gray-900 rounded-t-3xl border-t border-gray-700 p-6 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Cake size={20} className="text-pink-400" />
            {isEdit ? t('calendar.bdEdit') : t('calendar.birthdays')}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-800"><X size={20} /></button>
        </div>

        {/* Tab switcher (only for new entries) */}
        {!isEdit && (
          <div className="flex gap-1 mb-4 bg-gray-800 rounded-xl p-1">
            <button
              onClick={() => setTab('import')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'import' ? 'bg-pink-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Import size={14} />
              {t('calendar.bdImport')}
            </button>
            <button
              onClick={() => setTab('manual')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'manual' ? 'bg-pink-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <PenLine size={14} />
              {t('calendar.bdManual')}
            </button>
          </div>
        )}

        {/* Import Tab */}
        {tab === 'import' && !isEdit && (
          <div className="space-y-3">
            {/* Filter row */}
            <div className="flex gap-2">
              <input
                type="text"
                value={importFilter}
                onChange={(e) => setImportFilter(e.target.value)}
                placeholder={t('calendar.bdSearchContacts')}
                className={`${inputClass} flex-1`}
              />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 bg-gray-800 rounded-lg text-sm text-white border border-gray-700 outline-none"
              >
                <option value="all">{t('calendar.dndAllLists')}</option>
                {tabs.map(tab => (
                  <option key={tab.id} value={tab.id}>{tab.label}</option>
                ))}
              </select>
            </div>

            {/* Contact list */}
            <div className="max-h-[40vh] overflow-y-auto space-y-1">
              {filteredContacts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">{t('calendar.bdNoContacts')}</p>
              ) : (
                <>
                  <button
                    onClick={selectAll}
                    className="text-xs text-pink-400 hover:text-pink-300 font-medium mb-1"
                  >
                    {t('calendar.bdSelectAll')}
                  </button>
                  {filteredContacts.map(({ contact, parsed }) => {
                    const selected = selectedContactIds.has(contact.id);
                    return (
                      <button
                        key={contact.id}
                        onClick={() => toggleContact(contact.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                          selected ? 'bg-pink-600/20 ring-1 ring-pink-500' : 'bg-gray-800 hover:bg-gray-750'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-pink-500 bg-pink-500' : 'border-gray-600'
                        }`}>
                          {selected && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-100 truncate">{contact.name}</p>
                          <p className="text-xs text-gray-400">
                            {String(parsed.day).padStart(2, '0')}.{String(parsed.month).padStart(2, '0')}.
                            {parsed.year ?? '????'}
                          </p>
                        </div>
                        <Cake size={16} className="text-pink-400 shrink-0" />
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={selectedContactIds.size === 0}
              className="w-full py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('calendar.bdImportBtn', { count: selectedContactIds.size })}
            </button>
          </div>
        )}

        {/* Manual Tab */}
        {(tab === 'manual' || isEdit) && (
          <div className="space-y-3">
            {/* Name */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.bdName')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('calendar.bdNamePlaceholder')}
                className={inputClass}
                autoFocus
              />
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.date')}</label>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Note */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('calendar.noteOptional')}</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('calendar.notePlaceholder')}
                className={inputClass}
              />
            </div>

            {/* Reminders */}
            <div>
              <label className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                <Bell size={12} /> {t('calendar.reminder')}
              </label>
              <div className="space-y-2">
                {reminders.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={r.preset}
                      onChange={(e) => updateReminder(idx, { ...r, preset: e.target.value as BirthdayReminderPreset })}
                      className="flex-1 px-3 py-2 bg-gray-800 rounded-lg text-sm text-white border border-gray-700 outline-none"
                    >
                      {REMINDER_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    {r.preset === 'custom' && (
                      <input
                        type="number"
                        min={1}
                        value={r.customMinutes ?? 60}
                        onChange={(e) => updateReminder(idx, { ...r, customMinutes: parseInt(e.target.value, 10) || 60 })}
                        className="w-20 px-2 py-2 bg-gray-800 rounded-lg text-sm text-white border border-gray-700 outline-none"
                      />
                    )}
                    <button onClick={() => removeReminder(idx)} className="p-1.5 rounded-full hover:bg-gray-800 text-gray-500 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addReminder}
                  className="text-xs text-pink-400 hover:text-pink-300 font-medium"
                >
                  + {t('calendar.bdAddReminder')}
                </button>
              </div>
            </div>

            {/* Existing birthdays list (when not editing) */}
            {!isEdit && existingBirthdays.length > 0 && (
              <div className="border-t border-gray-700 pt-3 mt-3">
                <label className="text-xs text-gray-500 mb-2 block font-bold uppercase">{t('calendar.bdExisting')}</label>
                <div className="space-y-1 max-h-[20vh] overflow-y-auto">
                  {existingBirthdays.map(bd => (
                    <div key={bd.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/50">
                      <Cake size={14} className="text-pink-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{bd.name}</p>
                        <p className="text-xs text-gray-500">{bd.date.split('-').reverse().join('.')}{bd.year ? `.${bd.year}` : ''}</p>
                      </div>
                      <button onClick={() => onDelete(bd.id)} className="p-1.5 rounded-full hover:bg-gray-700 text-gray-500 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save / Delete buttons */}
            <div className="flex gap-2 pt-1">
              {isEdit && (
                <button
                  onClick={() => { onDelete(initial!.id); onClose(); }}
                  className="px-4 py-3 rounded-xl bg-red-600/20 text-red-400 font-bold text-sm hover:bg-red-600/30 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={handleManualSave}
                disabled={!name.trim() || !dateStr}
                className="flex-1 py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isEdit ? t('common.save') : t('calendar.bdCreate')}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
