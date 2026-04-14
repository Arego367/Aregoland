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
  duration: '15min' | '30min' | '1h' | '2h' | 'allday';
  reminder: 'none' | '10min' | '30min' | '1h' | '1day';
  color: string;       // Tailwind color class prefix, e.g. 'blue', 'purple'
  note?: string;
  rrule?: string;      // RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;INTERVAL=1;COUNT=10"
  exdates?: string[];  // Exception dates (YYYY-MM-DD) excluded from recurrence
  invitees?: EventInvitee[];  // Invited contacts with RSVP status
  organizerAregoId?: string;  // Who created/owns this event
}

export type TimeBlockType = 'work' | 'interruptible' | 'buffer' | 'available';

export interface TimeBlock {
  id: string;
  type: TimeBlockType;
  dayOfWeek: number;  // 0=Mon, 6=Sun (Montag-basiert)
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
}

export interface CalendarLayer {
  spaceId: string;
  spaceName: string;
  color: string;        // Space color string
  visible: boolean;
}

export type { UserIdentity } from "@/app/auth/identity";
