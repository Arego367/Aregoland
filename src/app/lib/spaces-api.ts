/**
 * Öffentliche Space-Suche — API Client
 *
 * Kommuniziert mit dem Signaling-Server (POST/GET/DELETE /spaces).
 * Nginx proxied /spaces → 127.0.0.1:3001/spaces (wie /code).
 */

const BASE = (import.meta as any).env?.VITE_SIGNALING_HTTP_URL ?? '';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export interface PublicSpace {
  space_id: string;
  name: string;
  beschreibung: string;
  sprache: string;
  tags: string[];
  mitgliederzahl: number;
  gruender_id: string;
  erstellt_am: string;
  letzte_aktivitaet: string;
  oeffentlich: boolean;
  inaktivitaets_regel: 'delete' | 'transfer';
}

/** Space als öffentlich registrieren / Heartbeat senden */
export async function registerPublicSpace(data: {
  space_id: string;
  name: string;
  beschreibung: string;
  sprache: string;
  tags: string[];
  mitgliederzahl: number;
  gruender_id: string;
  inaktivitaets_regel: 'delete' | 'transfer';
}): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/spaces`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Space aus öffentlicher Liste entfernen */
export async function unregisterPublicSpace(spaceId: string, gruenderId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/spaces/${encodeURIComponent(spaceId)}`, {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify({ gruender_id: gruenderId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Öffentliche Spaces suchen */
export async function searchPublicSpaces(params?: {
  sprache?: string;
  sort?: 'name' | 'mitglieder' | 'neueste' | 'aktivitaet';
  tag?: string;
  q?: string;
}): Promise<PublicSpace[]> {
  try {
    const url = new URL(`${BASE}/spaces`, window.location.origin);
    if (params?.sprache) url.searchParams.set('sprache', params.sprache);
    if (params?.sort) url.searchParams.set('sort', params.sort);
    if (params?.tag) url.searchParams.set('tag', params.tag);
    if (params?.q) url.searchParams.set('q', params.q);

    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    return data.spaces ?? [];
  } catch {
    return [];
  }
}

/** Alle einzigartigen Tags aus öffentlichen Spaces abrufen */
export async function fetchPublicTags(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/spaces/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tags ?? [];
  } catch {
    return [];
  }
}

// ── Stiller Heartbeat (alle 3 Tage) ──────────────────────────────────────────

const HEARTBEAT_KEY = 'aregoland_space_heartbeats'; // { [spaceId]: lastHeartbeat ISO }
const HEARTBEAT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3 Tage

interface HeartbeatMap { [spaceId: string]: string }

function loadHeartbeats(): HeartbeatMap {
  try { return JSON.parse(localStorage.getItem(HEARTBEAT_KEY) ?? '{}'); } catch { return {}; }
}

function saveHeartbeats(map: HeartbeatMap) {
  localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(map));
}

/** Prüft ob ein Heartbeat fällig ist und sendet ihn ggf. */
export async function maybeHeartbeat(data: {
  space_id: string;
  name: string;
  beschreibung: string;
  sprache: string;
  tags: string[];
  mitgliederzahl: number;
  gruender_id: string;
  inaktivitaets_regel: 'delete' | 'transfer';
}): Promise<void> {
  const map = loadHeartbeats();
  const last = map[data.space_id];
  if (last && Date.now() - new Date(last).getTime() < HEARTBEAT_INTERVAL_MS) return;

  const ok = await registerPublicSpace(data);
  if (ok) {
    map[data.space_id] = new Date().toISOString();
    saveHeartbeats(map);
  }
}

// ── Beitrittsanfragen ────────────────────────────────────────────────────────

export interface JoinRequest {
  id: number;
  user_id: string;
  user_name: string;
  space_id: string;
  gruender_id: string;
  status: string;
  erstellt_am: string;
}

/** Beitrittsanfrage senden */
export async function sendJoinRequest(data: {
  user_id: string;
  user_name: string;
  space_id: string;
  gruender_id: string;
}): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/join-request`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ausstehende Anfragen für einen Gründer abrufen */
export async function fetchJoinRequests(gruenderId: string): Promise<JoinRequest[]> {
  try {
    const res = await fetch(`${BASE}/join-requests/${encodeURIComponent(gruenderId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.requests ?? [];
  } catch {
    return [];
  }
}

/** Anfrage genehmigen oder ablehnen */
export async function respondJoinRequest(data: {
  user_id: string;
  space_id: string;
  gruender_id: string;
  action: 'approve' | 'reject';
  space_name?: string;
  space_template?: string;
  space_description?: string;
  gruender_name?: string;
}): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/join-request/respond`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ...data,
        ...data,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Lokale Beitrittsanfragen-Speicherung ─────────────────────────────────────

const PENDING_REQUESTS_KEY = 'aregoland_pending_join_requests';

export interface PendingJoinRequest {
  space_id: string;
  space_name: string;
  gruender_id: string;
  sent_at: string;
}

export function loadPendingRequests(): PendingJoinRequest[] {
  try { return JSON.parse(localStorage.getItem(PENDING_REQUESTS_KEY) ?? '[]'); } catch { return []; }
}

export function savePendingRequest(req: PendingJoinRequest) {
  const list = loadPendingRequests().filter(r => r.space_id !== req.space_id);
  list.push(req);
  localStorage.setItem(PENDING_REQUESTS_KEY, JSON.stringify(list));
}

export function removePendingRequest(spaceId: string) {
  const list = loadPendingRequests().filter(r => r.space_id !== spaceId);
  localStorage.setItem(PENDING_REQUESTS_KEY, JSON.stringify(list));
}

// ── Space Sync ──────────────────────────────────────────────────────────────

export type { SpaceVersionMeta } from './gossip';

export interface SpaceSyncPayload {
  space_id: string;
  name: string;
  description: string;
  template: string;
  color: string;
  identityRule: string;
  founderId: string;
  members: { aregoId: string; displayName: string; role: string; joinedAt?: string }[];
  channels: unknown[];
  customRoles: unknown[];
  tags: string[];
  visibility: string;
  guestPermissions: { readChats: boolean };
  settings: unknown;
  appearance?: { icon?: { type: string; value: string }; banner?: { type: string; value: string } };
  versionMeta?: import('./gossip').SpaceVersionMeta;
}

export async function sendSpaceSync(targetUserId: string, payload: SpaceSyncPayload): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/space-sync`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ target_user_id: targetUserId, payload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestSpaceSync(founderId: string, requesterId: string, spaceId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/space-sync-request`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        founder_id: founderId,
        requester_id: requesterId,
        space_id: spaceId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── FSK-Freischaltung ───────────────────────────────────────────────────────

/** Freischaltcode einlösen — gibt FSK-Stufe zurück oder null */
export async function redeemFskCode(spaceId: string, code: string): Promise<{ fsk_stufe: number } | null> {
  try {
    const res = await fetch(`${BASE}/fsk/redeem`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ space_id: spaceId, code }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** FSK-Heartbeat senden (alle 30 Tage) */
export async function sendFskHeartbeat(spaceId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/fsk/heartbeat`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ space_id: spaceId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const FSK_HEARTBEAT_KEY = 'aregoland_fsk_heartbeats';
const FSK_HEARTBEAT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // alle 7 Tage prüfen

/** Prüft ob ein FSK-Heartbeat fällig ist und sendet ihn ggf. */
export async function maybeFskHeartbeat(spaceId: string): Promise<void> {
  const map: Record<string, string> = (() => {
    try { return JSON.parse(localStorage.getItem(FSK_HEARTBEAT_KEY) ?? '{}'); } catch { return {}; }
  })();
  const last = map[spaceId];
  if (last && Date.now() - new Date(last).getTime() < FSK_HEARTBEAT_INTERVAL_MS) return;
  const ok = await sendFskHeartbeat(spaceId);
  if (ok) {
    map[spaceId] = new Date().toISOString();
    localStorage.setItem(FSK_HEARTBEAT_KEY, JSON.stringify(map));
  }
}
