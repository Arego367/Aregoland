/**
 * Calendar Invitations — localStorage-based storage for received invitations.
 * Integrates with CalendarScreen to show invited events and manage RSVP.
 */

import type { CalendarEvent, InviteStatus } from "@/app/types";

const INVITATIONS_KEY = "arego_calendar_invitations";

export interface ReceivedInvitation {
  eventId: string;
  title: string;
  date: string;
  startTime: string;
  duration: CalendarEvent["duration"];
  organizerAregoId: string;
  organizerName: string;
  note?: string;
  myStatus: InviteStatus;
  receivedAt: string;
}

export function loadInvitations(): ReceivedInvitation[] {
  try {
    return JSON.parse(localStorage.getItem(INVITATIONS_KEY) ?? "[]");
  } catch { return []; }
}

export function saveInvitations(invitations: ReceivedInvitation[]) {
  localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invitations));
}

export function addInvitation(inv: Omit<ReceivedInvitation, "myStatus" | "receivedAt">): ReceivedInvitation {
  const invitations = loadInvitations();
  const existing = invitations.findIndex((i) => i.eventId === inv.eventId);
  const record: ReceivedInvitation = {
    ...inv,
    myStatus: "pending",
    receivedAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    // Update existing invitation (re-invite)
    record.myStatus = invitations[existing].myStatus;
    invitations[existing] = record;
  } else {
    invitations.push(record);
  }
  saveInvitations(invitations);
  return record;
}

export function updateRsvp(eventId: string, status: InviteStatus) {
  const invitations = loadInvitations();
  const idx = invitations.findIndex((i) => i.eventId === eventId);
  if (idx >= 0) {
    invitations[idx].myStatus = status;
    saveInvitations(invitations);
  }
}

export function removeInvitation(eventId: string) {
  const invitations = loadInvitations().filter((i) => i.eventId !== eventId);
  saveInvitations(invitations);
}

/** Convert received invitations to CalendarEvents for display */
export function invitationsToEvents(invitations: ReceivedInvitation[]): CalendarEvent[] {
  return invitations
    .filter((inv) => inv.myStatus !== "declined")
    .map((inv) => ({
      id: `invite-${inv.eventId}`,
      title: `📩 ${inv.title}`,
      date: inv.date,
      startTime: inv.startTime,
      duration: inv.duration,
      reminder: "none" as const,
      color: "purple",
      note: `${inv.organizerName}${inv.note ? ` — ${inv.note}` : ""}`,
      organizerAregoId: inv.organizerAregoId,
    }));
}

/** Pending invitation queue for offline sending */
const QUEUE_KEY = "arego_calendar_invite_queue";

export interface QueuedInvite {
  roomId: string;
  invite: {
    _t: "calendar_invite";
    eventId: string;
    title: string;
    date: string;
    startTime: string;
    duration: string;
    organizerAregoId: string;
    organizerName: string;
    note?: string;
  };
}

export function queueInvite(item: QueuedInvite) {
  const queue = loadQueue();
  queue.push(item);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function loadQueue(): QueuedInvite[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch { return []; }
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}
