// ── Gossip Protocol für Space-Nachrichten und Settings-Sync ──

export const MAX_HOP_COUNT = 3;
export const BACKFILL_MAX = 50;
export const BACKFILL_DELAY_MIN = 100;
export const BACKFILL_DELAY_MAX = 500;

// ── Rollen-Hierarchie ──

export const ROLE_PRIORITY: Record<string, number> = {
  founder: 3,
  admin: 2,
  guest: 1,
};

// ── SpaceVersionMeta ──

export interface SpaceVersionMeta {
  version: number;
  lastChangedBy: string;
  lastChangedRole: string;
  lastChangedAt: string;
}

// ── Konfliktauflösung ──

export function resolveConflict(
  local: SpaceVersionMeta,
  incoming: SpaceVersionMeta,
): "accept" | "reject" {
  if (incoming.version > local.version) return "accept";
  if (incoming.version < local.version) return "reject";
  // Gleiche Version — höhere Rolle gewinnt
  const localPrio = ROLE_PRIORITY[local.lastChangedRole] ?? 0;
  const incomingPrio = ROLE_PRIORITY[incoming.lastChangedRole] ?? 0;
  if (incomingPrio > localPrio) return "accept";
  if (incomingPrio < localPrio) return "reject";
  // Gleiche Rolle — neuerer Timestamp gewinnt
  return incoming.lastChangedAt > local.lastChangedAt ? "accept" : "reject";
}

// ── SeenSet — Deduplizierung von Nachrichten ──

const SEEN_LIMIT = 500;

export class SeenSet {
  private ids: Set<string>;

  constructor() {
    this.ids = new Set();
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string): void {
    this.ids.add(id);
    // Limit: älteste Einträge verwerfen wenn über Limit
    if (this.ids.size > SEEN_LIMIT) {
      const arr = Array.from(this.ids);
      this.ids = new Set(arr.slice(arr.length - SEEN_LIMIT));
    }
  }

  /** Hydrate aus existierenden Nachrichten (z.B. aus localStorage) */
  hydrate(messageIds: string[]): void {
    for (const id of messageIds) {
      this.ids.add(id);
    }
    if (this.ids.size > SEEN_LIMIT) {
      const arr = Array.from(this.ids);
      this.ids = new Set(arr.slice(arr.length - SEEN_LIMIT));
    }
  }
}

// ── SpaceVersionStore — Versionierung pro Space ──

const VERSION_KEY = "aregoland_space_versions";

function loadVersions(): Record<string, SpaceVersionMeta> {
  try {
    return JSON.parse(localStorage.getItem(VERSION_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveVersions(v: Record<string, SpaceVersionMeta>): void {
  localStorage.setItem(VERSION_KEY, JSON.stringify(v));
}

export const SpaceVersionStore = {
  get(spaceId: string): SpaceVersionMeta {
    const all = loadVersions();
    return all[spaceId] ?? { version: 0, lastChangedBy: "", lastChangedRole: "member", lastChangedAt: "" };
  },

  increment(spaceId: string, changerAregoId: string, changerRole: string): SpaceVersionMeta {
    const all = loadVersions();
    const current = all[spaceId] ?? { version: 0, lastChangedBy: "", lastChangedRole: "member", lastChangedAt: "" };
    const updated: SpaceVersionMeta = {
      version: current.version + 1,
      lastChangedBy: changerAregoId,
      lastChangedRole: changerRole,
      lastChangedAt: new Date().toISOString(),
    };
    all[spaceId] = updated;
    saveVersions(all);
    return updated;
  },

  set(spaceId: string, meta: SpaceVersionMeta): void {
    const all = loadVersions();
    all[spaceId] = meta;
    saveVersions(all);
  },

  shouldAccept(spaceId: string, incoming: SpaceVersionMeta): boolean {
    const local = this.get(spaceId);
    return resolveConflict(local, incoming) === "accept";
  },
};

// ── Gossip Message Types für Status & Buchung ──

export type GossipMessageType =
  | 'absence_status'
  | 'booking_update'
  | 'chat'
  | 'settings';

export interface GossipEnvelope {
  id: string;
  type: GossipMessageType;
  spaceId: string;
  senderAregoId: string;
  senderRole: string;
  timestamp: string;
  hop: number;
  payload: unknown;
}

/** Absence-Status Gossip — Krankmeldung an alle Space-Mitglieder verteilen */
export interface AbsenceGossipPayload {
  memberId: string;
  absenceType: 'sick' | 'vacation' | 'homeoffice' | 'other';
  label?: string;
  startDate: string;
  endDate?: string;
  visibility: 'full' | 'limited' | 'none';
}

/** Booking-Update Gossip — Buchungsänderungen synchronisieren */
export interface BookingGossipPayload {
  templateId: string;
  slotId?: string;
  action: 'slot_booked' | 'slot_released' | 'request_created' | 'request_resolved';
  bookedBy?: string;
  requestId?: string;
  status?: string;
}

/** Offline-Queue für Abwesenheitsmeldungen (IndexedDB-kompatibel) */
const OFFLINE_QUEUE_KEY = 'aregoland_gossip_offline_queue';

export const OfflineGossipQueue = {
  enqueue(envelope: GossipEnvelope): void {
    const queue = this.getAll();
    queue.push(envelope);
    // Max 100 queued messages
    const trimmed = queue.slice(-100);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
  },

  getAll(): GossipEnvelope[] {
    try {
      return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? '[]');
    } catch {
      return [];
    }
  },

  flush(): GossipEnvelope[] {
    const queue = this.getAll();
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    return queue;
  },

  size(): number {
    return this.getAll().length;
  },
};

// ── Digest + Backfill Helpers ──

export interface ChatDigest {
  channelId: string;
  lastMessageId: string | null;
  lastMessageTimestamp: string | null;
  messageCount: number;
  requesterId: string;
}

export function buildDigest(
  channelId: string,
  messages: { id: string; timestamp: string }[],
  requesterId: string,
): ChatDigest {
  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  return {
    channelId,
    lastMessageId: last?.id ?? null,
    lastMessageTimestamp: last?.timestamp ?? null,
    messageCount: messages.length,
    requesterId,
  };
}

export function computeBackfill<T extends { id: string; timestamp: string }>(
  myMessages: T[],
  afterTimestamp: string | null,
): T[] {
  if (!afterTimestamp) {
    // Requester hat keine Nachrichten → sende die neuesten
    return myMessages.slice(-BACKFILL_MAX);
  }
  const missing = myMessages.filter(m => m.timestamp > afterTimestamp);
  return missing.slice(0, BACKFILL_MAX);
}

export function randomBackfillDelay(): number {
  return BACKFILL_DELAY_MIN + Math.random() * (BACKFILL_DELAY_MAX - BACKFILL_DELAY_MIN);
}
