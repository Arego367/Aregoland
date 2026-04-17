// ── Absence / Status types ──

export type AbsenceStatusType = "sick" | "vacation" | "homeoffice" | "other";

export type AbsenceVisibility = "full" | "limited" | "none";

export interface MemberAbsenceStatus {
  id: string;
  memberId: string;         // aregoId
  spaceId: string;
  type: AbsenceStatusType;
  label?: string;           // Freitext für "other"
  startDate: string;        // ISO YYYY-MM-DD
  endDate?: string;         // optional, für mehrtägig
  note?: string;            // nur für Moderator sichtbar
  reportedAt: string;       // ISO datetime
  reportedBy: string;       // aregoId (Eltern melden für Kind)
  childId?: string;         // wenn Elternteil für Kind meldet
}

// ── Booking / Buchung types ──

export type SlotFlexibility = "fixed" | "flexible";

export type SlotStatus = "free" | "booked" | "blocked";

export type BookingRequestStatus = "pending" | "accepted" | "declined" | "counter";

export interface BookingSlot {
  id: string;
  templateId: string;
  startTime: string;        // HH:mm
  endTime: string;          // HH:mm
  bookedBy?: string;        // aregoId — null = frei
  bookedAt?: string;        // ISO datetime
  status: SlotStatus;
}

export interface BookingTemplate {
  id: string;
  spaceId: string;
  title: string;            // z.B. "Elternsprechtag Mai 2026"
  createdBy: string;        // Moderator aregoId
  date: string;             // ISO YYYY-MM-DD
  startTime: string;        // HH:mm — Fenster-Start
  endTime: string;          // HH:mm — Fenster-Ende
  slotDuration: number;     // Minuten (10, 15, 20, 30, 60)
  slotFlex: SlotFlexibility;
  breakBetween: number;     // Pausen-Minuten zwischen Slots
  maxBookingsPerMember: number;
  slots: BookingSlot[];
  createdAt: string;
}

export interface BookingRequest {
  id: string;
  templateId: string;
  requestedBy: string;      // aregoId
  preferredTimes?: string[];
  message?: string;
  status: BookingRequestStatus;
  counterSlotId?: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  role?: string; // Can be used for "Status" or similar
  type?: "individual" | "group"; // New field to distinguish
  categories: string[]; // Changed from single category to array
  avatar: string;
  status?: string;
  
  // Individual fields
  phone?: string;
  email?: string;
  address?: string;
  birthday?: string;
  ageRating?: number; // For children
  
  // Group fields
  groupAdmin?: string; // Name of admin
  groupCreator?: string; // Name of creator
  groupManagers?: string[]; // Names of managers
  description?: string;
}

export interface Tab {
  id: string;
  label: string;
  hidden?: boolean;
}

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'maybe';

export interface EventInvitee {
  aregoId: string;
  displayName: string;
  status: InviteStatus;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;        // ISO date string YYYY-MM-DD
  startTime: string;   // HH:mm
  duration: '15min' | '30min' | '1h' | '2h' | 'allday' | 'custom';
  customDurationMinutes?: number;  // Used when duration === 'custom' (manual end time)
  reminder: 'none' | '10min' | '30min' | '1h' | '1day' | 'custom';
  customReminderMinutes?: number;  // Used when reminder === 'custom'
  color: string;       // Tailwind color ID (e.g. 'blue') or hex color (e.g. '#ff5500')
  label?: string;      // Optional label name (e.g. "Arbeit", "Familie")
  address?: string;    // Optional location — shown on a second row in the calendar list
  note?: string;
  rrule?: string;      // RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;INTERVAL=1;COUNT=10"
  exdates?: string[];  // Exception dates (YYYY-MM-DD) excluded from recurrence
  invitees?: EventInvitee[];  // Invited contacts with RSVP status
  organizerAregoId?: string;  // Who created/owns this event
}

export interface CalendarLabel {
  id: string;
  name: string;
  color: string;       // Hex color, e.g. '#ff5500'
}

export interface CalendarEventDefaults {
  duration: CalendarEvent['duration'];
  customDurationMinutes?: number;
  reminder: CalendarEvent['reminder'];
  customReminderMinutes?: number;
  recurrence: RecurrenceFreq | 'none';
  customRecurrenceInterval?: number;
  customRecurrenceUnit?: 'days' | 'weeks' | 'months' | 'years';
  color: string;
  label?: string;
}

export type TimeBlockType = 'work' | 'interruptible' | 'buffer' | 'available';

export interface TimeBlockBuffer {
  minutes: number;    // Puffer-Dauer in Minuten
  name?: string;      // optionaler Name (z.B. "Weg zur Arbeit")
}

export type DndNotificationMode = 'silent' | 'vibration' | 'normal';

export interface DoNotDisturbSettings {
  enabled: boolean;
  allowedMessagers: string[];   // Kontakt-IDs die anschreiben dürfen
  allowedCallers: string[];     // Kontakt-IDs die anrufen dürfen
  notificationMode: DndNotificationMode; // Stumm / Vibration / Normal
}

export interface TimeBlock {
  id: string;
  name: string;             // Freier Name (z.B. "Arbeit", "Pilates")
  daysOfWeek: number[];     // 0=Mon, 6=Sun — mehrere Tage möglich
  startTime: string;        // HH:mm
  endTime: string;          // HH:mm
  isInterruptible: boolean; // Unterbrechbar Ja/Nein
  priority: number;         // Sortier-Reihenfolge (niedriger = höhere Priorität)
  bufferBefore?: TimeBlockBuffer;
  bufferAfter?: TimeBlockBuffer;
  doNotDisturb?: DoNotDisturbSettings;
  // Legacy support
  type?: TimeBlockType;
  dayOfWeek?: number;
}

export interface CalendarLayer {
  spaceId: string;
  spaceName: string;
  color: string;        // Space color string
  visible: boolean;
}

// ── Timetable / Stundenplan types ──

export type TimetableEntryStatus = "normal" | "cancelled" | "substitution";

export interface TimetableEntry {
  id: string;
  spaceId: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  room: string;
  weekday: number;              // 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr
  startTime: string;            // HH:mm
  endTime: string;              // HH:mm
  status: TimetableEntryStatus;
  substituteTeacherId?: string;
  substituteTeacherName?: string;
  substituteRoom?: string;
  statusNote?: string;
  updatedAt: string;            // ISO datetime
  createdBy: string;            // aregoId
}

// ── Child Schedule / OGS / Bus types ──

export interface ChildScheduleConfig {
  id: string;
  childId: string;              // aregoId
  spaceId: string;
  ogsStart?: string;            // HH:mm
  ogsEnd?: string;              // HH:mm
  busArrival?: string;          // HH:mm
  busDeparture?: string;        // HH:mm
  hortStart?: string;           // HH:mm
  hortEnd?: string;             // HH:mm
  notes?: string;
  updatedBy: string;            // aregoId
  updatedAt: string;            // ISO datetime
}

// ── School Holiday types ──

export type SchoolHolidayType = "holiday" | "closure" | "teacher_day";

export interface SchoolHoliday {
  id: string;
  spaceId: string;
  title: string;
  startDate: string;            // ISO YYYY-MM-DD
  endDate: string;              // ISO YYYY-MM-DD
  type: SchoolHolidayType;
  createdBy: string;            // aregoId
}

// ── Day Plan (aggregated view) types ──

export type DayPlanEntryType = "lesson" | "break" | "ogs" | "bus" | "hort";

export interface DayPlanEntry {
  time: string;                 // HH:mm
  endTime: string;              // HH:mm
  type: DayPlanEntryType;
  label: string;
  detail?: string;
  status?: TimetableEntryStatus;
}

export type { UserIdentity } from "@/app/auth/identity";
