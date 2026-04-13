import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, X, Trash2, Edit2, Clock, CalendarPlus, Search, Repeat } from "lucide-react";
import ProfileAvatar from "./ProfileAvatar";
import AppHeader from "./AppHeader";
import { motion, AnimatePresence } from "motion/react";
import type { CalendarEvent, RecurrenceFreq } from "@/app/types";
import { expandRecurrence, buildRRule, rruleLabel } from "@/app/lib/rrule";
import { scheduleReminder as scheduleSWReminder, cancelReminder, checkReminders } from "@/app/lib/reminder-scheduler";

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

// ── Reminder Scheduling (delegated to Service Worker) ───────────────────────

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
  const MONTHS = t('calendar.months', { returnObjects: true }) as string[];
  const WEEKDAYS_SHORT = t('calendar.weekdaysShort', { returnObjects: true }) as string[];

  // Persist
  useEffect(() => { saveEvents(events); }, [events]);

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
    return m;
  }, [events, expansionRange]);

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
        action={{ icon: CalendarPlus, label: t('calendar.newEvent'), onClick: () => { setEditingEvent(null); setShowForm(true); } }}
        rightExtra={<>
          <button onClick={() => { setCalSearchOpen(!calSearchOpen); if (!calSearchOpen) { setCalSearchQuery(""); setTimeout(() => calSearchRef.current?.focus(), 100); } }}
            className={`p-2 rounded-full transition-all ${calSearchOpen ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-white/10"}`}>
            <Search size={20} />
          </button>
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
          />
        )}
        {view === "day" && (
          <DayView
            date={selectedDate}
            events={eventsMap.get(toDateStr(selectedDate)) ?? []}
            onSelectEvent={setDetailEvent}
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

      {/* Event Detail Modal */}
      <AnimatePresence>
        {detailEvent && (
          <EventDetailModal
            event={detailEvent}
            onClose={() => setDetailEvent(null)}
            onEdit={() => { setEditingEvent(detailEvent); setDetailEvent(null); setShowForm(true); }}
            onDelete={() => deleteEvent(detailEvent.id)}
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
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS_SHORT.map((wd) => (
          <div key={wd} className="text-center text-[11px] font-bold text-gray-500 py-1">{wd}</div>
        ))}
      </div>
      {/* Days */}
      {grid.map((row, ri) => (
        <div key={ri} className="grid grid-cols-7 gap-px">
          {row.map((cell, ci) => {
            if (!cell) return <div key={ci} className="min-h-[72px]" />;
            const ds = toDateStr(cell);
            const isToday = ds === todayStr;
            const dayEvents = eventsMap.get(ds) ?? [];
            const visible = dayEvents.slice(0, MAX_VISIBLE);
            const overflow = dayEvents.length - MAX_VISIBLE;
            return (
              <button
                key={ci}
                onClick={() => onSelectDate(cell)}
                className={`min-h-[72px] flex flex-col items-stretch p-0.5 rounded-lg transition-colors ${
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
  date, todayStr, eventsMap, onSelectEvent,
}: {
  date: Date; todayStr: string;
  eventsMap: Map<string, CalendarEvent[]>;
  onSelectEvent: (ev: CalendarEvent) => void;
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
              const matching = dayEvs.filter((ev) => {
                if (ev.duration === "allday") return false;
                const [eh] = ev.startTime.split(":").map(Number);
                return eh === h;
              });
              return (
                <div key={ds} className="relative border-l border-gray-800/50">
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
  date, events, onSelectEvent,
}: {
  date: Date; events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent) => void;
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
        {hours.map((h) => (
          <div key={h} className="flex h-[60px] border-t border-gray-800">
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
        ))}
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

  const handleSave = () => {
    if (!title.trim()) return;
    const rrule = recurrence !== "none" ? buildRRule({ freq: recurrence }) : undefined;
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
  event, onClose, onEdit, onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
