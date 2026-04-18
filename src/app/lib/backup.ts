/**
 * ARE-306 Phase 2 — Verschlüsselte Backup-Datei
 *
 * Zwei-Schlüssel-System:
 *   Schlüssel = PBKDF2(EUDI-Hash + Arego-ID)   → AES-GCM-256
 *   Fallback:  PBKDF2(Passwort + Arego-ID)      → AES-GCM-256  (Szenario B)
 *
 * Backup-Inhalt (konfigurierbar):
 *   - Arego-ID + Private Key
 *   - Kalender & Zeitblöcke
 *   - Lokale Einstellungen
 *   - Blockliste
 *   - Space-IDs
 *   - Chat-Verläufe (opt-in)
 */

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface BackupManifest {
  version: 2;
  createdAt: string;
  aregoId: string;
  /** Welche Daten-Kategorien enthalten sind */
  includedCategories: string[];
  /** Ob Chats enthalten sind (opt-in) */
  includesChats: boolean;
  /** Verschlüsselungsmethode */
  encryption: 'eudi' | 'password';
}

export interface BackupData {
  manifest: BackupManifest;
  identity: unknown;
  calendar: unknown;
  timeBlocks: unknown;
  calendarLabels: unknown;
  calendarBirthdays: unknown;
  calendarDaysConfig: unknown;
  calendarLayers: unknown;
  calendarEventDefaults: unknown;
  settings: unknown;
  blocklist: unknown;
  spaces: unknown;
  spacesOrder: unknown;
  spaceAppearance: unknown;
  deletedSpaces: unknown;
  profile: unknown;
  fsk: unknown;
  subscription: unknown;
  eudiHash: unknown;
  tabs: unknown;
  privacyVisibility: unknown;
  notifications: unknown;
  childProfiles: unknown;
  childSettings: unknown;
  contactCategories: unknown;
  /** Opt-in */
  chats?: unknown;
  chatMessages?: Record<string, unknown>;
}

export interface BackupPreview {
  categories: { key: string; label: string; count: number; sizeBytes: number }[];
  totalSizeBytes: number;
  hasEudi: boolean;
  aregoId: string;
}

// ── Konstanten ────────────────────────────────────────────────────────────────

const BACKUP_MAGIC = 'AREGO-BACKUP-V2';
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// Backup-relevante localStorage Keys
const BACKUP_KEYS: { key: string; field: keyof BackupData }[] = [
  { key: 'aregoland_identity', field: 'identity' },
  { key: 'arego_calendar_events', field: 'calendar' },
  { key: 'arego_calendar_time_blocks', field: 'timeBlocks' },
  { key: 'arego_calendar_labels', field: 'calendarLabels' },
  { key: 'arego_calendar_birthdays', field: 'calendarBirthdays' },
  { key: 'arego_calendar_days_config', field: 'calendarDaysConfig' },
  { key: 'arego_calendar_layers', field: 'calendarLayers' },
  { key: 'arego_calendar_event_defaults', field: 'calendarEventDefaults' },
  { key: 'aregoland_blocked', field: 'blocklist' },
  { key: 'aregoland_spaces', field: 'spaces' },
  { key: 'aregoland_spaces_order', field: 'spacesOrder' },
  { key: 'aregoland_space_appearance', field: 'spaceAppearance' },
  { key: 'aregoland_deleted_spaces', field: 'deletedSpaces' },
  { key: 'arego_profile', field: 'profile' },
  { key: 'aregoland_fsk', field: 'fsk' },
  { key: 'aregoland_subscription', field: 'subscription' },
  { key: 'aregoland_eudi_hash', field: 'eudiHash' },
  { key: 'arego_tabs', field: 'tabs' },
  { key: 'aregoland_privacy_visibility', field: 'privacyVisibility' },
  { key: 'aregoland_notifications', field: 'notifications' },
  { key: 'arego_child_profiles', field: 'childProfiles' },
  { key: 'aregoland_child_settings', field: 'childSettings' },
  { key: 'arego_contact_categories', field: 'contactCategories' },
];

// Einstellungs-Keys die beim Import wiederhergestellt werden
const SETTINGS_KEYS = [
  'aregoland_language',
  'aregoland_dark_mode',
  'aregoland_hide_online',
  'aregoland_discoverable',
  'aregoland_start_screen',
];

// ── Crypto-Hilfsfunktionen ────────────────────────────────────────────────────

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function buildSecret(aregoId: string, eudiHashOrPassword: string): string {
  return `${eudiHashOrPassword}:${aregoId}`;
}

async function encryptData(plaintext: Uint8Array, key: CryptoKey): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return { iv, ciphertext };
}

async function decryptData(ciphertext: Uint8Array, iv: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext));
}

// ── Backup-Vorschau ───────────────────────────────────────────────────────────

function estimateSize(key: string): number {
  const v = localStorage.getItem(key);
  return v ? new Blob([v]).size : 0;
}

function countItems(key: string): number {
  try {
    const v = localStorage.getItem(key);
    if (!v) return 0;
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.length;
    if (typeof parsed === 'object' && parsed !== null) return Object.keys(parsed).length;
    return 1;
  } catch {
    return 0;
  }
}

export function getBackupPreview(): BackupPreview {
  const identity = localStorage.getItem('aregoland_identity');
  let aregoId = '';
  try {
    aregoId = identity ? JSON.parse(identity).aregoId ?? '' : '';
  } catch { /* */ }

  const categories: BackupPreview['categories'] = [
    { key: 'identity', label: 'backupCatIdentity', count: identity ? 1 : 0, sizeBytes: estimateSize('aregoland_identity') },
    { key: 'calendar', label: 'backupCatCalendar', count: countItems('arego_calendar_events') + countItems('arego_calendar_time_blocks'), sizeBytes: estimateSize('arego_calendar_events') + estimateSize('arego_calendar_time_blocks') + estimateSize('arego_calendar_labels') + estimateSize('arego_calendar_birthdays') },
    { key: 'settings', label: 'backupCatSettings', count: SETTINGS_KEYS.filter(k => localStorage.getItem(k) !== null).length + BACKUP_KEYS.filter(b => ['profile', 'tabs', 'notifications', 'privacyVisibility'].includes(b.field as string) && localStorage.getItem(b.key) !== null).length, sizeBytes: SETTINGS_KEYS.reduce((s, k) => s + estimateSize(k), 0) + estimateSize('arego_profile') + estimateSize('arego_tabs') + estimateSize('aregoland_notifications') },
    { key: 'blocklist', label: 'backupCatBlocklist', count: countItems('aregoland_blocked'), sizeBytes: estimateSize('aregoland_blocked') },
    { key: 'spaces', label: 'backupCatSpaces', count: countItems('aregoland_spaces'), sizeBytes: estimateSize('aregoland_spaces') + estimateSize('aregoland_spaces_order') + estimateSize('aregoland_space_appearance') },
  ];

  // Chat-Größe schätzen (dynamische Keys)
  let chatSize = estimateSize('aregoland_chats');
  let chatCount = countItems('aregoland_chats');
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('aregoland_msg_')) {
      chatSize += estimateSize(k);
      chatCount += countItems(k);
    }
  }
  categories.push({ key: 'chats', label: 'backupCatChats', count: chatCount, sizeBytes: chatSize });

  return {
    categories,
    totalSizeBytes: categories.reduce((s, c) => s + c.sizeBytes, 0),
    hasEudi: !!localStorage.getItem('aregoland_eudi_hash'),
    aregoId,
  };
}

// ── Backup-Daten sammeln ──────────────────────────────────────────────────────

function collectBackupData(includeChats: boolean): BackupData {
  const data: Record<string, unknown> = {};

  for (const { key, field } of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try { data[field] = JSON.parse(raw); } catch { data[field] = raw; }
    } else {
      data[field] = null;
    }
  }

  // Einstellungs-Einzelwerte
  const settingsObj: Record<string, unknown> = {};
  for (const k of SETTINGS_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) settingsObj[k] = v;
  }
  data.settings = settingsObj;

  // Chats (opt-in)
  if (includeChats) {
    data.chats = (() => { try { return JSON.parse(localStorage.getItem('aregoland_chats') ?? 'null'); } catch { return null; } })();
    const messages: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('aregoland_msg_')) {
        try { messages[k] = JSON.parse(localStorage.getItem(k)!); } catch { messages[k] = localStorage.getItem(k); }
      }
    }
    data.chatMessages = messages;
  }

  const identity = data.identity as Record<string, unknown> | null;

  data.manifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    aregoId: identity?.aregoId ?? '',
    includedCategories: BACKUP_KEYS.map(b => b.field).filter(f => data[f] != null),
    includesChats: includeChats,
    encryption: localStorage.getItem('aregoland_eudi_hash') ? 'eudi' : 'password',
  } satisfies BackupManifest;

  return data as BackupData;
}

// ── Export ─────────────────────────────────────────────────────────────────────

export async function createEncryptedBackup(
  eudiHashOrPassword: string,
  includeChats: boolean,
  encryptionMethod: 'eudi' | 'password',
): Promise<Uint8Array> {
  const data = collectBackupData(includeChats);
  (data.manifest as BackupManifest).encryption = encryptionMethod;

  const json = JSON.stringify(data);
  const plaintext = new TextEncoder().encode(json);

  const aregoId = (data.manifest as BackupManifest).aregoId;
  const secret = buildSecret(aregoId, eudiHashOrPassword);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(secret, salt);
  const { iv, ciphertext } = await encryptData(plaintext, key);

  // Dateiformat: MAGIC | salt (16) | iv (12) | ciphertext (rest)
  const magic = new TextEncoder().encode(BACKUP_MAGIC);
  const methodByte = new Uint8Array([encryptionMethod === 'eudi' ? 1 : 2]);
  const result = new Uint8Array(magic.length + 1 + salt.length + iv.length + ciphertext.length);
  let offset = 0;
  result.set(magic, offset); offset += magic.length;
  result.set(methodByte, offset); offset += 1;
  result.set(salt, offset); offset += salt.length;
  result.set(iv, offset); offset += iv.length;
  result.set(ciphertext, offset);

  return result;
}

export function downloadBackup(data: Uint8Array, aregoId: string): void {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `aregoland-backup-${aregoId}-${date}.arego`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────

export interface BackupFileInfo {
  valid: boolean;
  encryptionMethod: 'eudi' | 'password' | null;
  raw: Uint8Array;
}

export function readBackupFile(buffer: ArrayBuffer): BackupFileInfo {
  const bytes = new Uint8Array(buffer);
  const magic = new TextEncoder().encode(BACKUP_MAGIC);

  if (bytes.length < magic.length + 1 + SALT_BYTES + IV_BYTES + 1) {
    return { valid: false, encryptionMethod: null, raw: bytes };
  }

  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return { valid: false, encryptionMethod: null, raw: bytes };
  }

  const methodByte = bytes[magic.length];
  const encryptionMethod = methodByte === 1 ? 'eudi' : methodByte === 2 ? 'password' : null;
  if (!encryptionMethod) return { valid: false, encryptionMethod: null, raw: bytes };

  return { valid: true, encryptionMethod, raw: bytes };
}

export async function decryptBackup(
  fileInfo: BackupFileInfo,
  eudiHashOrPassword: string,
  aregoId: string,
): Promise<BackupData | null> {
  if (!fileInfo.valid) return null;

  const magic = new TextEncoder().encode(BACKUP_MAGIC);
  const bytes = fileInfo.raw;
  let offset = magic.length + 1; // skip magic + method byte

  const salt = bytes.slice(offset, offset + SALT_BYTES); offset += SALT_BYTES;
  const iv = bytes.slice(offset, offset + IV_BYTES); offset += IV_BYTES;
  const ciphertext = bytes.slice(offset);

  const secret = buildSecret(aregoId, eudiHashOrPassword);
  const key = await deriveKey(secret, salt);

  try {
    const plaintext = await decryptData(ciphertext, iv, key);
    const json = new TextDecoder().decode(plaintext);
    return JSON.parse(json) as BackupData;
  } catch {
    return null; // Falscher Schlüssel oder korrumpierte Datei
  }
}

// ── Restore ───────────────────────────────────────────────────────────────────

export function restoreBackup(data: BackupData): { restored: string[]; skipped: string[] } {
  const restored: string[] = [];
  const skipped: string[] = [];

  // Identität wiederherstellen
  if (data.identity) {
    localStorage.setItem('aregoland_identity', JSON.stringify(data.identity));
    restored.push('identity');
  }

  // EUDI-Hash
  if (data.eudiHash && typeof data.eudiHash === 'string') {
    localStorage.setItem('aregoland_eudi_hash', data.eudiHash);
    restored.push('eudiHash');
  } else if (data.eudiHash) {
    localStorage.setItem('aregoland_eudi_hash', JSON.stringify(data.eudiHash));
    restored.push('eudiHash');
  }

  // Kalender
  for (const { key, field } of BACKUP_KEYS) {
    if (field === 'identity' || field === 'eudiHash' || field === 'settings') continue;
    const val = (data as Record<string, unknown>)[field];
    if (val != null) {
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
      restored.push(field);
    } else {
      skipped.push(field);
    }
  }

  // Einstellungen (flache Werte)
  if (data.settings && typeof data.settings === 'object') {
    const s = data.settings as Record<string, string>;
    for (const [k, v] of Object.entries(s)) {
      if (SETTINGS_KEYS.includes(k)) {
        localStorage.setItem(k, v);
      }
    }
    restored.push('settings');
  }

  // Chats (opt-in)
  if (data.chats) {
    localStorage.setItem('aregoland_chats', JSON.stringify(data.chats));
    restored.push('chats');
  }
  if (data.chatMessages && typeof data.chatMessages === 'object') {
    for (const [k, v] of Object.entries(data.chatMessages as Record<string, unknown>)) {
      if (k.startsWith('aregoland_msg_')) {
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    }
    restored.push('chatMessages');
  }

  return { restored, skipped };
}

// ── Szenario-Check ────────────────────────────────────────────────────────────

export type BackupScenario = 'A' | 'B' | 'C';

/** Bestimmt das Backup-Szenario basierend auf vorhandenen Daten */
export function getBackupScenario(): BackupScenario {
  const hasEudi = !!localStorage.getItem('aregoland_eudi_hash');
  if (hasEudi) return 'A'; // EUDI + Arego-ID → voll verschlüsselt
  // Szenario B: kein EUDI, aber Nutzer kann Passwort setzen
  // Szenario C wird im UI behandelt wenn Nutzer kein Passwort eingibt
  return 'B';
}

// ── ARE-307 Phase 3: Cloud-Backup via Hetzner Object Storage ────────────────

const SIGNALING_HTTP = (import.meta as any).env?.VITE_SIGNALING_HTTP_URL ?? '';

export interface CloudBackupStatus {
  has_backup: boolean;
  backup_updated_at: string | null;
  cloud_enabled: boolean;
}

/** Cloud-Backup-Status für den aktuellen Nutzer abfragen. */
export async function getCloudBackupStatus(aregoId: string): Promise<CloudBackupStatus> {
  const res = await fetch(`${SIGNALING_HTTP}/backup/status/${encodeURIComponent(aregoId)}`);
  if (!res.ok) return { has_backup: false, backup_updated_at: null, cloud_enabled: false };
  return res.json();
}

/** Verschlüsseltes Backup in die Cloud hochladen (nur Szenario A — EUDI + Abo). */
export async function uploadCloudBackup(includeChats: boolean): Promise<{ ok: boolean; error?: string; size?: number }> {
  const eudiHash = localStorage.getItem('aregoland_eudi_hash');
  if (!eudiHash) return { ok: false, error: 'no_eudi' };

  const identity = localStorage.getItem('aregoland_identity');
  let aregoId = '';
  try { aregoId = identity ? JSON.parse(identity).aregoId ?? '' : ''; } catch { /* */ }
  if (!aregoId) return { ok: false, error: 'no_identity' };

  // Backup erstellen (mit EUDI verschlüsselt)
  const data = await createEncryptedBackup(eudiHash, includeChats, 'eudi');

  // Hochladen
  const res = await fetch(`${SIGNALING_HTTP}/backup/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Arego-Id': aregoId,
      'X-Eudi-Hash': eudiHash,
    },
    body: data,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown' }));
    return { ok: false, error: body.error ?? 'upload_failed' };
  }

  const result = await res.json();
  // Letzten Upload-Zeitstempel lokal speichern
  localStorage.setItem('aregoland_cloud_backup_at', new Date().toISOString());
  return { ok: true, size: result.size };
}

/** Cloud-Backup herunterladen und wiederherstellen (via EUDI-Hash). */
export async function downloadAndRestoreCloudBackup(
  eudiHash: string,
): Promise<{ ok: boolean; aregoId?: string; restored?: string[]; error?: string }> {
  // 1. Presigned URL vom Server holen
  const infoRes = await fetch(`${SIGNALING_HTTP}/backup/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eudi_hash: eudiHash }),
  });
  if (!infoRes.ok) return { ok: false, error: 'server_error' };

  const info = await infoRes.json();
  if (!info.found) return { ok: false, error: 'not_found' };
  if (!info.has_backup) return { ok: false, error: 'no_backup', aregoId: info.arego_id };

  // 2. Backup-Datei von Hetzner herunterladen
  const fileRes = await fetch(info.backup_url);
  if (!fileRes.ok) return { ok: false, error: 'download_failed' };

  const buffer = await fileRes.arrayBuffer();
  const fileInfo = readBackupFile(buffer);
  if (!fileInfo.valid) return { ok: false, error: 'invalid_file' };

  // 3. Entschlüsseln (EUDI + Arego-ID)
  const data = await decryptBackup(fileInfo, eudiHash, info.arego_id);
  if (!data) return { ok: false, error: 'decrypt_failed' };

  // 4. Wiederherstellen
  const { restored } = restoreBackup(data);
  return { ok: true, aregoId: info.arego_id, restored };
}

/** Auto-Backup: Prüft ob ein Cloud-Backup nötig ist und führt es aus. */
export async function autoBackupIfNeeded(): Promise<void> {
  // Nur für Szenario A (EUDI vorhanden)
  if (getBackupScenario() !== 'A') return;

  const identity = localStorage.getItem('aregoland_identity');
  let aregoId = '';
  try { aregoId = identity ? JSON.parse(identity).aregoId ?? '' : ''; } catch { /* */ }
  if (!aregoId) return;

  // Prüfen ob Cloud-Backup aktiviert ist (Abo-Nutzer)
  try {
    const status = await getCloudBackupStatus(aregoId);
    if (!status.cloud_enabled) return;

    // Nur wenn letztes Backup > 24h alt oder gar keins existiert
    const lastBackup = localStorage.getItem('aregoland_cloud_backup_at');
    if (lastBackup) {
      const hoursSince = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) return;
    }

    // Backup im Hintergrund erstellen und hochladen
    await uploadCloudBackup(false); // Chats nicht einschließen (zu groß für Auto-Backup)
    console.log('[CloudBackup] Auto-Backup erfolgreich');
  } catch (err) {
    console.warn('[CloudBackup] Auto-Backup fehlgeschlagen:', err);
  }
}

/** Online-Kontakte nach Wiederherstellung abfragen. */
export async function fetchOnlineContacts(aregoId: string): Promise<{ id: string; displayName: string }[]> {
  // Kontakte aus localStorage laden
  const chatsRaw = localStorage.getItem('aregoland_chats');
  if (!chatsRaw) return [];

  try {
    const chats = JSON.parse(chatsRaw);
    if (!Array.isArray(chats)) return [];

    // Kontakt-IDs sammeln
    const contactIds = chats
      .map((c: { peerId?: string }) => c.peerId)
      .filter((id: string | undefined): id is string => !!id && id !== aregoId);

    if (!contactIds.length) return [];

    // Online-Status vom Server abfragen
    const res = await fetch(`${SIGNALING_HTTP}/contacts/online`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arego_id: aregoId, contact_ids: contactIds }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.online ?? [];
  } catch {
    return [];
  }
}

/** Space-IDs nach Wiederherstellung überprüfen und ggf. wiederherstellen. */
export function getRestoredSpaces(): { id: string; name: string }[] {
  try {
    const spacesRaw = localStorage.getItem('aregoland_spaces');
    if (!spacesRaw) return [];
    const spaces = JSON.parse(spacesRaw);
    if (!Array.isArray(spaces)) return [];
    return spaces
      .filter((s: { id?: string; name?: string }) => s.id && s.name)
      .map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
  } catch {
    return [];
  }
}
