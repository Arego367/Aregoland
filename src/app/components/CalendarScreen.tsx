import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, X, Trash2, Edit2, Clock, CalendarPlus, Search, Repeat, Layers, UserPlus, Check, XCircle, HelpCircle, Timer, GripVertical } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import ProfileAvatar from "./ProfileAvatar";
import AppHeader from "./AppHeader";
import { motion, AnimatePresence } from "motion/react";
import type { CalendarEvent, RecurrenceFreq, CalendarLayer, EventInvitee, InviteStatus, TimeBlock, TimeBlockType, TimeBlockBuffer } from "@/app/types";
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
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveEvents(events: CalendarEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

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

function getWeekDates(d: Date): Date[] {
  const mon = new Date(d);
  mon.setDate(mon.getDate() - weekdayMon(mon));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(mon);
    day.setDate(mon.getDate() + i);
    return day;
  });
}

function durationMinutes(dur: CalendarEvent["duration"]): number {
  switch (dur) {
    case "15min": return 15;
    case "30min": return 30;
    case "1h": return 60;
    case "2h": return 120;
    case "allday": return 0;
  }
}

function getColor(id: string) {
  return COLORS.find((c) => c.id === id) ?? COLORS[0];
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Time Blocks ─────────────────────────────────────────────────────────────

const TIME_BLOCKS_KEY = "arego_calendar_time_blocks";

/** Migrate old TimeBlock format (single dayOfWeek, type-based) to new format */
function migrateTimeBlock(b: TimeBlock & { dayOfWeek?: number; type?: TimeBlockType }): TimeBlock {
  if (b.daysOfWeek && b.name !== undefined && b.priority !== undefined) return b;
  return {
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

type View = "month" | "week" | "day";

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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [calSearchOpen, setCalSearchOpen] = useState(false);
  const [calSearchQuery, setCalSearchQuery] = useState("");
  const calSearchRef = useRef<HTMLInputElement>(null);
  const [layers, setLayers] = useState<CalendarLayer[]>(loadLayers);
  const [showLayers, setShowLayers] = useState(false);
  const [invitations, setInvitations] = useState<ReceivedInvitation[]>(loadInvitations);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(loadTimeBlocks);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const MONTHS = t('calendar.months', { returnObjects: true }) as string[];
  const WEEKDAYS_SHORT = t('calendar.weekdaysShort', { returnObjects: true }) as string[];

  // Persist
  useEffect(() => { saveEvents(events); }, [events]);

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
      start.setDate(start.getDate() - 7); // pad for prev month overflow
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end.setDate(end.getDate() + 7); // pad for next month overflow
      return { start: toDateStr(start), end: toDateStr(end) };
    } else if (view === "week") {
      const mon = new Date(d);
      mon.setDate(mon.getDate() - weekdayMon(mon));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { start: toDateStr(mon), end: toDateStr(sun) };
    } else {
      return { start: toDateStr(d), end: toDateStr(d) };
    }
  }, [selectedDate, view]);

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
        note: se.location ? `📍 ${se.location}` : undefined,
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

  const goToday = () => setSelectedDate(new Date());

  const navigate = (dir: -1 | 1) => {
    const d = new Date(selectedDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setSelectedDate(d);
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
                  onClick={() => { setEditingEvent(null); setShowForm(true); }}
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
                  onClick={() => { setCalSearchOpen(!calSearchOpen); if (!calSearchOpen) { setCalSearchQuery(""); setTimeout(() => calSearchRef.current?.focus(), 100); } }}
                  className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
                >
                  <Search size={18} />
                  <span className="font-medium">{t('common.search')}</span>
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
                          setView("day");
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

      {/* View Toggle */}
      <div className="px-4 pb-2 flex gap-1 bg-gray-900">
        {(["month", "week", "day"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-colors ${
              view === v ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {v === "month" ? t('calendar.month') : v === "week" ? t('calendar.week') : t('calendar.day')}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="px-4 pb-2 flex items-center justify-between bg-gray-900">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-800">
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-bold text-gray-200">
          {view === "month"
            ? `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
            : view === "week"
            ? (() => {
                const wk = getWeekDates(selectedDate);
                return `${wk[0].getDate()}. ${MONTHS[wk[0].getMonth()].slice(0, 3)} - ${wk[6].getDate()}. ${MONTHS[wk[6].getMonth()].slice(0, 3)} ${wk[6].getFullYear()}`;
              })()
            : `${selectedDate.getDate()}. ${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`}
        </span>
        <button onClick={() => navigate(1)} className="p-2 rounded-full hover:bg-gray-800">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {view === "month" && (
          <MonthView
            date={selectedDate}
            todayStr={todayStr}
            eventsMap={eventsMap}
            onSelectDate={(d) => { setSelectedDate(d); setView("day"); }}
          />
        )}
        {view === "week" && (
          <WeekView
            date={selectedDate}
            todayStr={todayStr}
            eventsMap={eventsMap}
            onSelectEvent={setDetailEvent}
            timeBlocks={timeBlocks}
          />
        )}
        {view === "day" && (
          <DayView
            date={selectedDate}
            events={eventsMap.get(toDateStr(selectedDate)) ?? []}
            onSelectEvent={setDetailEvent}
            timeBlocks={timeBlocks}
          />
        )}
      </div>

      {/* Event Form Modal */}
      <AnimatePresence>
        {showForm && (
          <EventFormModal
            initial={editingEvent}
            defaultDate={toDateStr(selectedDate)}
            onSave={addOrUpdateEvent}
            onClose={() => { setShowForm(false); setEditingEvent(null); }}
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

      {/* Event Detail Modal */}
      <AnimatePresence>
        {detailEvent && (
          <EventDetailModal
            event={detailEvent}
            onClose={() => setDetailEvent(null)}
            onEdit={() => { setEditingEvent(detailEvent); setDetailEvent(null); setShowForm(true); }}
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

function MonthView({
  date, todayStr, eventsMap, onSelectDate,
}: {
  date: Date; todayStr: string;
  eventsMap: Map<string, CalendarEvent[]>;
  onSelectDate: (d: Date) => void;
}) {
  const { t } = useTranslation();
  const WEEKDAYS_SHORT = t('calendar.weekdaysShort', { returnObjects: true }) as string[];
  const grid = useMemo(() => getMonthGrid(date.getFullYear(), date.getMonth()), [date]);
  const MAX_VISIBLE = 2;

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
        <div key={ri} className="grid grid-cols-7 gap-px flex-1">
          {row.map((cell, ci) => {
            if (!cell) return <div key={ci} />;
            const ds = toDateStr(cell);
            const isToday = ds === todayStr;
            const dayEvents = eventsMap.get(ds) ?? [];
            const visible = dayEvents.slice(0, MAX_VISIBLE);
            const overflow = dayEvents.length - MAX_VISIBLE;
            return (
              <button
                key={ci}
                onClick={() => onSelectDate(cell)}
                className={`flex flex-col items-stretch p-0.5 rounded-lg transition-colors ${
                  isToday ? "bg-blue-600/20 ring-1 ring-blue-500" : "hover:bg-gray-800"
                }`}
              >
                <span className={`text-[11px] font-bold text-center mb-0.5 ${isToday ? "text-blue-400" : "text-gray-300"}`}>
                  {cell.getDate()}
                </span>
                <div className="flex flex-col gap-px flex-1 min-w-0">
                  {visible.map((ev) => (
                    <div
                      key={ev.id}
                      className={`${getColor(ev.color).bg} rounded px-0.5 py-px truncate text-[8px] leading-tight font-semibold text-white`}
                    >
                      {ev.duration === "allday" ? ev.title : `${ev.startTime} ${ev.title}`}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <span className="text-[8px] text-gray-500 font-bold text-center leading-tight">
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

// ── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  date, todayStr, eventsMap, onSelectEvent, timeBlocks,
}: {
  date: Date; todayStr: string;
  eventsMap: Map<string, CalendarEvent[]>;
  onSelectEvent: (ev: CalendarEvent) => void;
  timeBlocks: TimeBlock[];
}) {
  const { t } = useTranslation();
  const WEEKDAYS_SHORT = t('calendar.weekdaysShort', { returnObjects: true }) as string[];
  const weekDates = useMemo(() => getWeekDates(date), [date]);
  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 - 21:00

  return (
    <div className="overflow-x-auto">
      {/* Day headers */}
      <div className="grid grid-cols-[40px_repeat(7,1fr)] sticky top-0 bg-gray-900 z-10">
        <div />
        {weekDates.map((d) => {
          const ds = toDateStr(d);
          const isToday = ds === todayStr;
          return (
            <div key={ds} className={`text-center py-1 ${isToday ? "text-blue-400" : "text-gray-400"}`}>
              <div className="text-[10px] font-bold">{WEEKDAYS_SHORT[weekdayMon(d)]}</div>
              <div className={`text-sm font-bold w-7 h-7 mx-auto flex items-center justify-center rounded-full ${isToday ? "bg-blue-600 text-white" : ""}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="relative">
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-[40px_repeat(7,1fr)] h-12 border-t border-gray-800">
            <div className="text-[10px] text-gray-500 pr-1 text-right -mt-1.5">{`${String(h).padStart(2, "0")}:00`}</div>
            {weekDates.map((d) => {
              const ds = toDateStr(d);
              const dayEvs = eventsMap.get(ds) ?? [];
              const dow = weekdayMon(d);
              const blockForHour = timeBlocks.find(
                (b) => b.daysOfWeek.includes(dow) && parseInt(b.startTime) <= h && parseInt(b.endTime) > h
              );
              const matching = dayEvs.filter((ev) => {
                if (ev.duration === "allday") return false;
                const [eh] = ev.startTime.split(":").map(Number);
                return eh === h;
              });
              return (
                <div key={ds} className={`relative border-l border-gray-800/50 ${blockForHour ? TIME_BLOCK_COLOR : ""}`}>
                  {matching.map((ev) => {
                    const [, em] = ev.startTime.split(":").map(Number);
                    const dur = durationMinutes(ev.duration);
                    const top = (em / 60) * 48;
                    const height = Math.max((dur / 60) * 48, 16);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onSelectEvent(ev)}
                        className={`absolute inset-x-0.5 rounded text-[9px] font-semibold text-white px-0.5 truncate ${getColor(ev.color).bg} opacity-90 hover:opacity-100`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                      >
                        {ev.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day View ─────────────────────────────────────────────────────────────────

function DayView({
  date, events, onSelectEvent, timeBlocks,
}: {
  date: Date; events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent) => void;
  timeBlocks: TimeBlock[];
}) {
  const hours = Array.from({ length: 18 }, (_, i) => i + 5); // 05:00 - 22:00
  const allDay = events.filter((e) => e.duration === "allday");
  const timed = events.filter((e) => e.duration !== "allday");
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to 8:00 on mount
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 3 * 60, behavior: "smooth" });
  }, [date]);

  return (
    <div ref={containerRef} className="overflow-y-auto max-h-[calc(100vh-220px)]">
      {/* All-day events */}
      {allDay.length > 0 && (
        <div className="mb-2 space-y-1">
          {allDay.map((ev) => (
            <button
              key={ev.id}
              onClick={() => onSelectEvent(ev)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-white ${getColor(ev.color).bg}`}
            >
              {ev.title}
            </button>
          ))}
        </div>
      )}

      {/* Timed grid */}
      <div className="relative">
        {hours.map((h) => {
          const dow = weekdayMon(date);
          const blockForHour = timeBlocks.find(
            (b) => b.daysOfWeek.includes(dow) && parseInt(b.startTime) <= h && parseInt(b.endTime) > h
          );
          return (
          <div key={h} className={`flex h-[60px] border-t border-gray-800 ${blockForHour ? TIME_BLOCK_COLOR : ""}`}>
            <div className="w-12 text-[11px] text-gray-500 text-right pr-2 -mt-1.5 flex-shrink-0">
              {`${String(h).padStart(2, "0")}:00`}
            </div>
            <div className="flex-1 relative">
              {timed
                .filter((ev) => {
                  const [eh] = ev.startTime.split(":").map(Number);
                  return eh === h;
                })
                .map((ev) => {
                  const [, em] = ev.startTime.split(":").map(Number);
                  const dur = durationMinutes(ev.duration);
                  const top = em; // 1px per minute
                  const height = Math.max(dur, 20);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className={`absolute left-0 right-2 rounded-lg px-3 py-1 text-white text-sm font-semibold ${getColor(ev.color).bg} opacity-90 hover:opacity-100 shadow-lg`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="truncate">{ev.title}</div>
                      <div className="text-[10px] opacity-80">{ev.startTime}</div>
                    </button>
                  );
                })}
            </div>
          </div>
          );
        })}
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
            <div className={`w-1 h-10 rounded-full ${getColor(ev.color).bg}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100 truncate">{ev.title}</p>
              <p className="text-xs text-gray-400">
                {ev.duration === "allday" ? t('calendar.allDay') : t('calendar.atTime', { time: ev.startTime })}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Event Form Modal ─────────────────────────────────────────────────────────

function EventFormModal({
  initial, defaultDate, onSave, onClose,
}: {
  initial: CalendarEvent | null;
  defaultDate: string;
  onSave: (ev: CalendarEvent) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "09:00");
  const [duration, setDuration] = useState<CalendarEvent["duration"]>(initial?.duration ?? "1h");
  const [reminder, setReminder] = useState<CalendarEvent["reminder"]>(initial?.reminder ?? "10min");
  const [color, setColor] = useState(initial?.color ?? "blue");
  const [note, setNote] = useState(initial?.note ?? "");

  // Recurrence state — derive initial freq from existing rrule
  const initialFreq = (() => {
    if (!initial?.rrule) return "none" as const;
    const match = initial.rrule.match(/FREQ=(\w+)/);
    return (match?.[1] as RecurrenceFreq) ?? ("none" as const);
  })();
  const [recurrence, setRecurrence] = useState<RecurrenceFreq | "none">(initialFreq);

  // Invitees
  const contacts = useMemo(() => loadContacts(), []);
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>(
    initial?.invitees?.map((i) => i.aregoId) ?? []
  );
  const [showInviteePicker, setShowInviteePicker] = useState(false);

  const toggleInvitee = (aregoId: string) => {
    setSelectedInvitees((prev) =>
      prev.includes(aregoId) ? prev.filter((id) => id !== aregoId) : [...prev, aregoId]
    );
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const rrule = recurrence !== "none" ? buildRRule({ freq: recurrence }) : undefined;
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
      reminder,
      color,
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

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-3 mb-4">
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
        </div>

        {/* Duration */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 font-bold mb-2 block">{t('calendar.duration')}</label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  duration === d.value ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Reminder */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 font-bold mb-2 block">{t('calendar.reminder')}</label>
          <div className="flex flex-wrap gap-2">
            {REMINDERS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReminder(r.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  reminder === r.value ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Recurrence */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 font-bold mb-2 block">{t('calendar.recurrence')}</label>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>

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

        {/* Color */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 font-bold mb-2 block">{t('calendar.color')}</label>
          <div className="flex gap-3">
            {COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setColor(c.id)}
                className={`w-8 h-8 rounded-full ${c.bg} transition-all ${
                  color === c.id ? `ring-2 ${c.ring} ring-offset-2 ring-offset-gray-900 scale-110` : "opacity-60 hover:opacity-100"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('calendar.noteOptional')}
          rows={2}
          className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6 resize-none"
        />

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!title.trim()}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {initial ? t('common.save') : t('calendar.createEvent')}
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
        <div className={`w-full h-1.5 rounded-full ${c.bg} mb-4`} />

        <h2 className="text-xl font-bold text-white mb-1">{event.title}</h2>
        <p className="text-sm text-gray-400 mb-4">
          {dateObj.getDate()}. {MONTHS[dateObj.getMonth()]} {dateObj.getFullYear()}
          {event.duration !== "allday" && ` | ${t('calendar.atTime', { time: event.startTime })}`}
        </p>

        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Clock size={14} />
          <span>{t(DURATIONS.find((d) => d.value === event.duration)?.labelKey ?? '')}</span>
        </div>

        {event.reminder !== "none" && (
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <span>{t('calendar.reminderLabel', { label: t(REMINDERS.find((r) => r.value === event.reminder)?.labelKey ?? '') })}</span>
          </div>
        )}

        {event.rrule && (
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Repeat size={14} />
            <span>{rruleLabel(event.rrule, t)}</span>
          </div>
        )}

        {event.note && (
          <p className="text-sm text-gray-300 mt-3 p-3 rounded-xl bg-gray-800">{event.note}</p>
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

// ── Sortable Block Item (Drag & Drop) ──────────────────────────────────────

function SortableBlockItem({
  block, index, weekdays, onRemove,
}: {
  block: TimeBlock; index: number; weekdays: string[];
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 p-3 rounded-xl border ${TIME_BLOCK_COLOR}`}>
      <button {...attributes} {...listeners} className="p-1 text-gray-500 hover:text-gray-300 cursor-grab touch-none">
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
      </div>
      <button onClick={() => onRemove(block.id)} className="p-1 text-gray-500 hover:text-red-400">
        <Trash2 size={14} />
      </button>
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
    };
    setEditing([...editing, newBlock]);
    setAddName(""); setAddDays([]); setAddStart("09:00"); setAddEnd("17:00");
    setAddInterruptible(false); setAddBufferBefore(""); setAddBufferBeforeName("");
    setAddBufferAfter(""); setAddBufferAfterName("");
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
                <SortableBlockItem key={b.id} block={b} index={i} weekdays={WEEKDAYS_SHORT} onRemove={removeBlock} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        {editing.length > 0 && (
          <p className="text-xs text-gray-500 text-center mb-4">{t('calendar.priorityHint')}</p>
        )}

        {/* Add new block */}
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3 mb-4">
          <p className="text-xs text-gray-500 font-bold uppercase">{t('calendar.addTimeBlock')}</p>

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

          <button onClick={addBlock}
            disabled={!addName.trim() || addDays.length === 0}
            className="w-full py-2 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors">
            + {t('calendar.addTimeBlock')}
          </button>
        </div>

        <button onClick={() => onSave(editing)}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-500 transition-colors">
          {t('common.save')}
        </button>
      </motion.div>
    </motion.div>
  );
}
