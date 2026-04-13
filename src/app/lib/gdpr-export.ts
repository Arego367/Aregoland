/**
 * DSGVO Art. 20 — Structured data export.
 * Collects all user data from localStorage and produces a downloadable JSON file.
 * Runs entirely client-side (Privacy-First).
 */

interface ExportCategory {
  category: string;
  data: unknown;
}

const EXPORT_KEYS: { category: string; keys: string[]; prefix?: string }[] = [
  {
    category: "profil",
    keys: ["aregoland_identity", "arego_profile", "arego_child_profiles"],
  },
  {
    category: "kontakte",
    keys: ["arego_contacts", "aregoland_contacts", "aregoland_blocked", "arego_contact_categories", "arego_contact_statuses"],
  },
  {
    category: "kalender",
    keys: ["arego_calendar_events"],
  },
  {
    category: "spaces",
    keys: ["aregoland_spaces", "aregoland_deleted_spaces", "aregoland_space_appearance", "aregoland_space_chats", "aregoland_space_versions", "aregoland_official_tiles", "aregoland_space_notifications"],
  },
  {
    category: "chats",
    keys: [],
    prefix: "arego_chat_",
  },
  {
    category: "einstellungen",
    keys: [
      "arego_tabs",
      "aregoland_language",
      "aregoland_dark_mode",
      "aregoland_start_screen",
      "aregoland_notifications",
      "aregoland_privacy_visibility",
      "aregoland_hide_online",
      "aregoland_discoverable",
      "aregoland_abo",
    ],
  },
];

function collectPrefixKeys(prefix: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      try {
        result[key] = JSON.parse(localStorage.getItem(key)!);
      } catch {
        result[key] = localStorage.getItem(key);
      }
    }
  }
  return result;
}

function collectCategory(entry: typeof EXPORT_KEYS[number]): ExportCategory {
  const data: Record<string, unknown> = {};

  for (const key of entry.keys) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }

  if (entry.prefix) {
    Object.assign(data, collectPrefixKeys(entry.prefix));
  }

  return { category: entry.category, data };
}

/** Strip private keys and crypto material from export */
function sanitizeExport(categories: ExportCategory[]): ExportCategory[] {
  return categories.map((cat) => {
    if (cat.category === "profil" && typeof cat.data === "object" && cat.data !== null) {
      const d = cat.data as Record<string, unknown>;
      if (d["aregoland_identity"] && typeof d["aregoland_identity"] === "object") {
        const identity = { ...(d["aregoland_identity"] as Record<string, unknown>) };
        delete identity.privateKey;
        delete identity.signingPrivateKey;
        d["aregoland_identity"] = identity;
      }
      return { ...cat, data: d };
    }
    return cat;
  });
}

export interface GdprExportResult {
  exportDate: string;
  appVersion: string;
  categories: ExportCategory[];
}

/** Collect all user data into a structured export object */
export function collectGdprExport(): GdprExportResult {
  const raw = EXPORT_KEYS.map(collectCategory);
  const sanitized = sanitizeExport(raw);
  return {
    exportDate: new Date().toISOString(),
    appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    categories: sanitized,
  };
}

/** Trigger download of the GDPR export as a JSON file */
export function downloadGdprExport(): void {
  const exportData = collectGdprExport();
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `aregoland-datenexport-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

declare const __APP_VERSION__: string;
