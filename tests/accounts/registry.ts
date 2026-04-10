import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AccountIdentity {
  aregoId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  createdAt: string;
}

export interface AccountEntry {
  label: string;
  identity: AccountIdentity;
  storageState?: string; // path to Playwright storageState JSON
}

const DATA_DIR = path.join(__dirname, 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function registryPath(): string {
  return path.join(DATA_DIR, '_registry.json');
}

export function loadRegistry(): AccountEntry[] {
  const p = registryPath();
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function saveRegistry(entries: AccountEntry[]): void {
  ensureDataDir();
  fs.writeFileSync(registryPath(), JSON.stringify(entries, null, 2));
}

export function findByLabel(label: string): AccountEntry | undefined {
  return loadRegistry().find((e) => e.label === label);
}

export function addAccount(entry: AccountEntry): void {
  const entries = loadRegistry();
  const idx = entries.findIndex((e) => e.label === entry.label);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  saveRegistry(entries);
}

export function removeAccount(label: string): boolean {
  const entries = loadRegistry();
  const idx = entries.findIndex((e) => e.label === label);
  if (idx < 0) return false;

  const entry = entries[idx];
  if (entry.storageState && fs.existsSync(entry.storageState)) {
    fs.unlinkSync(entry.storageState);
  }
  entries.splice(idx, 1);
  saveRegistry(entries);
  return true;
}

export function listLabels(): string[] {
  return loadRegistry().map((e) => e.label);
}

export function storageStatePath(label: string): string {
  const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `${safeName}.storageState.json`);
}
