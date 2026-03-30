/** Persistente Chat-Liste + Nachrichtenverlauf — localStorage, kein Server */

// ── Chat-Liste ────────────────────────────────────────────────────────────────

const CHATS_KEY = 'aregoland_chats';

export interface PersistedChat {
  id: string;       // aregoId des Kontakts (oder Mock-ID)
  name: string;
  avatarUrl: string;
  isGroup: boolean;
  lastMessage: string;
  time: string;     // Anzeigeformat: "HH:MM"
  sortKey: number;  // Date.now() für Sortierung
  unreadCount: number;
  roomId: string;
}

export function loadPersistedChats(): PersistedChat[] {
  try {
    return JSON.parse(localStorage.getItem(CHATS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function savePersistedChat(chat: PersistedChat): void {
  const all = loadPersistedChats();
  const idx = all.findIndex((c) => c.id === chat.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], name: chat.name, avatarUrl: chat.avatarUrl, roomId: chat.roomId };
  } else {
    all.unshift(chat);
  }
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
}

export function updateChatLastMessage(id: string, text: string): void {
  const all = loadPersistedChats();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const now = new Date();
  const updated: PersistedChat = {
    ...all[idx],
    lastMessage: text,
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    sortKey: now.getTime(),
    unreadCount: 0,
  };
  all.splice(idx, 1);
  all.unshift(updated);
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
}

/** Ungelesene Nachrichten um 1 erhöhen (ohne lastMessage zu ändern) */
export function incrementChatUnread(id: string): void {
  const all = loadPersistedChats();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], unreadCount: all[idx].unreadCount + 1 };
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
}

/** Ungelesene Nachrichten auf 0 setzen (Chat wurde geöffnet) */
export function clearChatUnread(id: string): void {
  const all = loadPersistedChats();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0 || all[idx].unreadCount === 0) return;
  all[idx] = { ...all[idx], unreadCount: 0 };
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
}

/** Summe aller ungelesenen Nachrichten über alle Chats */
export function getTotalUnread(): number {
  return loadPersistedChats().reduce((sum, c) => sum + c.unreadCount, 0);
}

export function deletePersistedChats(): void {
  localStorage.removeItem(CHATS_KEY);
}

// ── Nachrichtenverlauf ────────────────────────────────────────────────────────

const HISTORY_PREFIX = 'aregoland_msg_';
const MAX_MESSAGES = 500;

/** Gespeicherte Nachricht — identisch mit dem Message-Interface in ChatScreen */
export interface StoredMessage {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'pending';
  type: 'text' | 'image' | 'audio' | 'file';
  replyTo?: { id: string; text: string; sender: string };
  isEdited?: boolean;
  /** Base64-Daten für Bilder / Dateien */
  fileData?: string;
  /** Original-Dateiname */
  fileName?: string;
  /** MIME-Type */
  fileMime?: string;
}

/** Lädt den Nachrichtenverlauf für einen P2P-Room (nur echte "AC-:AC-" Rooms) */
export function loadHistory(roomId: string): StoredMessage[] {
  if (!roomId.includes(':')) return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_PREFIX + roomId) ?? '[]');
  } catch {
    return [];
  }
}

/** Speichert bis zu MAX_MESSAGES Nachrichten pro Room */
export function saveHistory(roomId: string, messages: StoredMessage[]): void {
  if (!roomId.includes(':') || messages.length === 0) return;
  localStorage.setItem(
    HISTORY_PREFIX + roomId,
    JSON.stringify(messages.slice(-MAX_MESSAGES))
  );
}

/** Löscht den Verlauf eines Rooms (Chatverlauf löschen) */
export function clearHistory(roomId: string): void {
  localStorage.removeItem(HISTORY_PREFIX + roomId);
}

/** Löscht alle Verläufe — für vollständigen Account-Reset */
export function deleteAllHistory(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(HISTORY_PREFIX)) localStorage.removeItem(key);
  }
}

/** Aktualisiert den Status bestimmter Nachrichten in der History */
export function updateMessagesStatus(
  roomId: string,
  msgIds: string[],
  newStatus: StoredMessage['status'],
): void {
  const history = loadHistory(roomId);
  const idSet = new Set(msgIds);
  let changed = false;
  for (const msg of history) {
    if (idSet.has(msg.id)) { msg.status = newStatus; changed = true; }
  }
  if (changed) saveHistory(roomId, history);
}

// ── Pending-Queue (Sender-seitige Offline-Warteschlange) ─────────────────────

const PENDING_PREFIX = 'aregoland_pend_';

export interface PendingMessage {
  msgId: string;
  text: string;
}

/** Lädt die Pending-Queue für einen Room */
export function loadPendingMessages(roomId: string): PendingMessage[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_PREFIX + roomId) ?? '[]');
  } catch {
    return [];
  }
}

/** Fügt eine Nachricht zur Pending-Queue hinzu */
export function savePendingMessage(roomId: string, msgId: string, text: string): void {
  const all = loadPendingMessages(roomId);
  all.push({ msgId, text });
  localStorage.setItem(PENDING_PREFIX + roomId, JSON.stringify(all));
}

/** Entfernt zugestellte Nachrichten aus der Pending-Queue */
export function removePendingMessages(roomId: string, deliveredIds: string[]): void {
  const idSet = new Set(deliveredIds);
  const remaining = loadPendingMessages(roomId).filter((p) => !idSet.has(p.msgId));
  if (remaining.length === 0) localStorage.removeItem(PENDING_PREFIX + roomId);
  else localStorage.setItem(PENDING_PREFIX + roomId, JSON.stringify(remaining));
}

/** Löscht die gesamte Pending-Queue eines Rooms */
export function clearPendingMessages(roomId: string): void {
  localStorage.removeItem(PENDING_PREFIX + roomId);
}

/** Löscht alle Pending-Queues — für Account-Reset */
export function deleteAllPending(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PENDING_PREFIX)) localStorage.removeItem(key);
  }
}

// ── Contact-Status (Berechtigungssystem) ─────────────────────────────────────
//
//  'mutual'  — beide haben sich gegenseitig hinzugefügt → voller Chat
//  'pending' — nur der andere hat mich hinzugefügt, ich muss zurück hinzufügen → lesen, nicht schreiben
//  'removed' — der andere hat mich entfernt → Chat sichtbar aber gesperrt
//

const STATUS_KEY = 'aregoland_contact_status';

export type ContactStatus = 'mutual' | 'pending' | 'removed';

export function loadContactStatuses(): Record<string, ContactStatus> {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function getContactStatus(aregoId: string): ContactStatus | null {
  return loadContactStatuses()[aregoId] ?? null;
}

export function setContactStatus(aregoId: string, status: ContactStatus): void {
  const all = loadContactStatuses();
  all[aregoId] = status;
  localStorage.setItem(STATUS_KEY, JSON.stringify(all));
}

export function deleteContactStatus(aregoId: string): void {
  const all = loadContactStatuses();
  delete all[aregoId];
  localStorage.setItem(STATUS_KEY, JSON.stringify(all));
}

export function deleteAllContactStatuses(): void {
  localStorage.removeItem(STATUS_KEY);
}

/** Entfernt einen einzelnen Chat aus der persistierten Chat-Liste */
export function removePersistedChat(chatId: string): void {
  const all = loadPersistedChats();
  const filtered = all.filter((c) => c.id !== chatId);
  localStorage.setItem(CHATS_KEY, JSON.stringify(filtered));
}
