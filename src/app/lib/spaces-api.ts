/**
 * Öffentliche Space-Suche — API Client
 *
 * Kommuniziert mit dem Signaling-Server (POST/GET/DELETE /spaces).
 * Nginx proxied /spaces → 127.0.0.1:3001/spaces (wie /code).
 */

const BASE = (import.meta as any).env?.VITE_SIGNALING_HTTP_URL ?? '';

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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
