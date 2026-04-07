import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Moon, Bell, Shield, ChevronRight, Smartphone, LogOut, LayoutGrid, MessageCircle, Calendar, CreditCard, Check, Trash2, Baby, UserPlus, Lock, QrCode, X, Copy, Volume2, VolumeX, Phone, BellRing, BellOff, Eye, EyeOff, Database, MessageSquare, Users, FileText, ChevronDown, HardDrive, MapPin, Link as LinkIcon, Ban, Globe, HeartHandshake, Clock, Camera } from "lucide-react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { motion, AnimatePresence } from "motion/react";
import { deleteIdentity, loadIdentity, createChildLinkPayload, decodeChildLinkPayload, type LinkedChild } from "@/app/auth/identity";
import { deleteContacts, loadBlocked, unblockContact, loadContacts } from "@/app/auth/contacts";
import QRCode from "qrcode";
import { loadSubscription, saveSubscription, getEffectiveStatus, hasAccess, setAutoRenew, formatDateDE, daysUntil, PLANS, type Subscription } from "@/app/auth/subscription";
import { loadFsk, saveFsk, type FskStatus } from "@/app/auth/fsk";
import { Html5Qrcode } from "html5-qrcode";

const NOTIF_KEY = "aregoland_notifications";

interface NotifSettings {
  push: boolean;
  messages: boolean;
  calls: boolean;
  sounds: boolean;
}

function loadNotifSettings(): NotifSettings {
  try { return { push: true, messages: true, calls: true, sounds: true, ...JSON.parse(localStorage.getItem(NOTIF_KEY) ?? "{}") }; }
  catch { return { push: true, messages: true, calls: true, sounds: true }; }
}

function saveNotifSettings(s: NotifSettings) { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); }

function estimateStorageBytes(key: string): number {
  const v = localStorage.getItem(key);
  return v ? new Blob([v]).size : 0;
}

const PRIVACY_KEY = "aregoland_privacy_visibility";
type VisLevel = "all" | "custom" | "none";
interface PrivacyVisibility {
  personal: VisLevel; address: VisLevel; contact: VisLevel; social: VisLevel;
  personalCats?: string[]; addressCats?: string[]; contactCats?: string[]; socialCats?: string[];
}
function loadPrivacyVisibility(): PrivacyVisibility {
  const defaults: PrivacyVisibility = { personal: "all", address: "custom", contact: "custom", social: "all", addressCats: ["family"], contactCats: ["family"] };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PRIVACY_KEY) ?? "{}") }; }
  catch { return defaults; }
}
function loadTabs(): { id: string; label: string }[] {
  try {
    const saved = JSON.parse(localStorage.getItem("arego_tabs") ?? "[]");
    if (Array.isArray(saved) && saved.length > 0) return saved.filter((t: any) => t.id !== "all");
  } catch {}
  return [
    { id: "family", label: "Familie" }, { id: "friends", label: "Freunde" },
    { id: "work", label: "Arbeit" }, { id: "school", label: "Schule" },
    { id: "children", label: "Kinder" }, { id: "space", label: "Spaces" },
    { id: "other", label: "Sonstige" },
  ];
}

async function directoryRegister(aregoId: string, displayName: string): Promise<boolean> {
  try {
    const profile = JSON.parse(localStorage.getItem("arego_profile") ?? "{}");
    const res = await fetch("/directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aregoId,
        displayName,
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        nickname: profile.nickname ?? "",
      }),
    });
    if (res.ok) localStorage.setItem("aregoland_directory_last_heartbeat", new Date().toISOString());
    return res.ok;
  } catch { return false; }
}
async function directoryRemove(aregoId: string): Promise<boolean> {
  try {
    const res = await fetch("/directory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aregoId }) });
    if (res.ok) localStorage.removeItem("aregoland_directory_last_heartbeat");
    return res.ok;
  } catch { return false; }
}
function maybeDirectoryHeartbeat(aregoId: string, displayName: string) {
  if (localStorage.getItem("aregoland_discoverable") !== "true") return;
  const last = localStorage.getItem("aregoland_directory_last_heartbeat");
  if (last) {
    const diff = Date.now() - new Date(last).getTime();
    if (diff < 2 * 24 * 60 * 60 * 1000) return; // weniger als 2 Tage
  }
  directoryRegister(aregoId, displayName).catch(() => {});
}

interface SettingsScreenProps {
  onBack: () => void;
  onResetAccount?: () => void;
  subscriptionLocked?: boolean;
  onSubscriptionUnlocked?: () => void;
  onFskUpdated?: () => void;
}

const LANGUAGES = [
  { code: "ar", name: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", flag: "\uD83C\uDDF8\uD83C\uDDE6" },
  { code: "bg", name: "\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438", flag: "\uD83C\uDDE7\uD83C\uDDEC" },
  { code: "cs", name: "\u010Ce\u0161tina", flag: "\uD83C\uDDE8\uD83C\uDDFF" },
  { code: "da", name: "Dansk", flag: "\uD83C\uDDE9\uD83C\uDDF0" },
  { code: "de", name: "Deutsch", flag: "\uD83C\uDDE9\uD83C\uDDEA" },
  { code: "el", name: "\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC", flag: "\uD83C\uDDEC\uD83C\uDDF7" },
  { code: "en", name: "English", flag: "\uD83C\uDDEC\uD83C\uDDE7" },
  { code: "es", name: "Espa\u00F1ol", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
  { code: "et", name: "Eesti", flag: "\uD83C\uDDEA\uD83C\uDDEA" },
  { code: "fi", name: "Suomi", flag: "\uD83C\uDDEB\uD83C\uDDEE" },
  { code: "fr", name: "Fran\u00E7ais", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
  { code: "hr", name: "Hrvatski", flag: "\uD83C\uDDED\uD83C\uDDF7" },
  { code: "hu", name: "Magyar", flag: "\uD83C\uDDED\uD83C\uDDFA" },
  { code: "it", name: "Italiano", flag: "\uD83C\uDDEE\uD83C\uDDF9" },
  { code: "lt", name: "Lietuvi\u0173", flag: "\uD83C\uDDF1\uD83C\uDDF9" },
  { code: "lv", name: "Latvie\u0161u", flag: "\uD83C\uDDF1\uD83C\uDDFB" },
  { code: "mt", name: "Malti", flag: "\uD83C\uDDF2\uD83C\uDDF9" },
  { code: "nl", name: "Nederlands", flag: "\uD83C\uDDF3\uD83C\uDDF1" },
  { code: "no", name: "Norsk", flag: "\uD83C\uDDF3\uD83C\uDDF4" },
  { code: "pl", name: "Polski", flag: "\uD83C\uDDF5\uD83C\uDDF1" },
  { code: "pt", name: "Portugu\u00EAs", flag: "\uD83C\uDDF5\uD83C\uDDF9" },
  { code: "ro", name: "Rom\u00E2n\u0103", flag: "\uD83C\uDDF7\uD83C\uDDF4" },
  { code: "ru", name: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", flag: "\uD83C\uDDF7\uD83C\uDDFA" },
  { code: "sk", name: "Sloven\u010Dina", flag: "\uD83C\uDDF8\uD83C\uDDF0" },
  { code: "sl", name: "Sloven\u0161\u010Dina", flag: "\uD83C\uDDF8\uD83C\uDDEE" },
  { code: "sv", name: "Svenska", flag: "\uD83C\uDDF8\uD83C\uDDEA" },
  { code: "uk", name: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430", flag: "\uD83C\uDDFA\uD83C\uDDE6" },
];


export default function SettingsScreen({ onBack, onResetAccount, subscriptionLocked, onSubscriptionUnlocked, onFskUpdated }: SettingsScreenProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<"main" | "app" | "privacy" | "storage" | "subscription" | "family" | "notifications" | "fsk">(subscriptionLocked ? "subscription" : "main");
  const [voucherCode, setVoucherCode] = useState("");
  const [subRefresh, setSubRefresh] = useState(0);
  const [selectedLang, setSelectedLang] = useState(() => LANGUAGES.find(l => l.code === localStorage.getItem('aregoland_language')) || LANGUAGES.find(l => l.code === 'de')!);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const langLastKey = useRef("");
  const langLastIndex = useRef(-1);

  // Deep-Link: Toast oeffnet FSK-Sektion
  useEffect(() => {
    const handler = () => setActiveSubmenu("fsk");
    window.addEventListener("arego-open-fsk", handler);
    return () => window.removeEventListener("arego-open-fsk", handler);
  }, []);

  useEffect(() => {
    if (langDropdownOpen) {
      langLastKey.current = "";
      langLastIndex.current = -1;
      setTimeout(() => langDropdownRef.current?.focus(), 50);
    }
  }, [langDropdownOpen]);

  const handleLangKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const matches = LANGUAGES.map((lang, i) => ({ lang, i })).filter(({ lang }) =>
      lang.name.toLowerCase().startsWith(key)
    );
    if (matches.length === 0) return;
    e.preventDefault();

    let targetIndex: number;
    if (key === langLastKey.current) {
      const currentPos = matches.findIndex(m => m.i === langLastIndex.current);
      const next = currentPos === -1 ? 0 : (currentPos + 1) % matches.length;
      targetIndex = matches[next].i;
    } else {
      targetIndex = matches[0].i;
    }
    langLastKey.current = key;
    langLastIndex.current = targetIndex;

    const container = langDropdownRef.current;
    if (container) {
      const buttons = container.querySelectorAll("button");
      buttons[targetIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('aregoland_dark_mode') !== 'false');
  const [startScreen, setStartScreen] = useState("dashboard");
  const [startDropdownOpen, setStartDropdownOpen] = useState(false);
  const startDropdownRef = useRef<HTMLDivElement>(null);
  const startLastKey = useRef("");
  const startLastIndex = useRef(-1);

  useEffect(() => {
    if (startDropdownOpen) {
      startLastKey.current = "";
      startLastIndex.current = -1;
      setTimeout(() => startDropdownRef.current?.focus(), 50);
    }
  }, [startDropdownOpen]);
  const [profileVisibility, setProfileVisibility] = useState<"public" | "contacts" | "family" | "private">("contacts");
  const [linkedChildren, setLinkedChildren] = useState<LinkedChild[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('aregoland_linked_children') ?? '[]'); } catch { return []; }
  });
  // Live-Update wenn Kind verknüpft wird + beim Öffnen der Familie-Seite vom Server laden
  useEffect(() => {
    const handler = () => {
      try { setLinkedChildren(JSON.parse(sessionStorage.getItem('aregoland_linked_children') ?? '[]')); } catch {}
    };
    window.addEventListener('arego-child-linked', handler);
    return () => window.removeEventListener('arego-child-linked', handler);
  }, []);
  // Familie-Kinder vom Server laden: wird unten nach identity-Deklaration registriert
  const [showAddChild, setShowAddChild] = useState(false);
  const [childFirstName, setChildFirstName] = useState("");
  const [childLastName, setChildLastName] = useState("");
  const [childNickname, setChildNickname] = useState("");

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [notif, setNotif] = useState<NotifSettings>(loadNotifSettings);
  const [idCopied, setIdCopied] = useState(false);
  const [discoverable, setDiscoverable] = useState(() => localStorage.getItem("aregoland_discoverable") === "true");
  const [directoryStatus, setDirectoryStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [privacyVis, setPrivacyVis] = useState<PrivacyVisibility>(loadPrivacyVisibility);
  const [catPickerKey, setCatPickerKey] = useState<keyof PrivacyVisibility | null>(null);
  const [privacyToast, setPrivacyToast] = useState(false);
  const [privacyToastMsg, setPrivacyToastMsg] = useState("");
  const [showOnlineStatus, setShowOnlineStatus] = useState(() => localStorage.getItem("aregoland_hide_online") !== "true");
  const [blockedList, setBlockedList] = useState<string[]>(() => loadBlocked());
  const availableTabs = useMemo(() => loadTabs(), []);
  const isChildAccount = useMemo(() => {
    try { const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}"); return id.ist_kind === true || id.accountType === "child"; }
    catch { return false; }
  }, []);
  const { t, i18n } = useTranslation();
  const identity = useMemo(() => loadIdentity(), []);

  // Familie-Kinder vom Server laden wenn Familie-Seite geoeffnet wird
  useEffect(() => {
    if (activeSubmenu !== 'family' || !identity) return;
    fetch(`/child-link/${encodeURIComponent(identity.aregoId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.children) {
          setLinkedChildren(data.children);
          sessionStorage.setItem('aregoland_linked_children', JSON.stringify(data.children));
        }
      })
      .catch(() => {});
  }, [activeSubmenu, identity]);

  // Parent-Link Scanner State
  const [parentScanActive, setParentScanActive] = useState(false);
  const [parentScanError, setParentScanError] = useState<string | null>(null);
  const [parentLinked, setParentLinked] = useState<string | null>(null);
  const parentScannerRef = useRef<Html5Qrcode | null>(null);

  const stopParentScanner = useCallback(() => {
    if (parentScannerRef.current) {
      parentScannerRef.current.stop().catch(() => {});
      parentScannerRef.current.clear();
      parentScannerRef.current = null;
    }
    setParentScanActive(false);
  }, []);

  const parentScanProcessed = useRef(false);

  const startParentScanner = useCallback(async () => {
    setParentScanError(null);
    setParentScanActive(true);
    parentScanProcessed.current = false;

    // Warten bis DOM-Element gerendert ist
    await new Promise(r => setTimeout(r, 100));

    const el = document.getElementById("parent-scan-region");
    if (!el) { setParentScanError(t('settings.fskParentCameraError')); setParentScanActive(false); return; }

    try {
      const cameras = await Promise.race([
        Html5Qrcode.getCameras(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      if (!cameras.length) { setParentScanError(t('settings.fskParentNoCamera')); setParentScanActive(false); return; }

      const scanner = new Html5Qrcode("parent-scan-region");
      parentScannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          // Nur einmal verarbeiten
          if (parentScanProcessed.current) return;

          const link = decodeChildLinkPayload(decoded.trim());
          if (!link) return; // Stille Wiederholung — kein Error bei partiellem Scan

          parentScanProcessed.current = true;

          // Scanner sofort stoppen
          try { await scanner.stop(); } catch {}
          try { scanner.clear(); } catch {}
          parentScannerRef.current = null;

          // Alle Aenderungen in einem Schritt auf die Identity anwenden
          const childId = identity?.aregoId ?? '';
          try {
            const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? '{}');
            // Kind-Status
            id.ist_kind = true;
            const verwalter: string[] = Array.isArray(id.verwalter) ? id.verwalter : [];
            if (!verwalter.includes(link.parentId) && verwalter.length < 2) verwalter.push(link.parentId);
            id.verwalter = verwalter;
            id.accountType = 'child';
            id.parentName = link.parentName;
            // Namen: Vorname → firstName, Nachname → lastName, Spitzname → nickname
            const fn = link.childFirstName ?? '';
            const ln = link.childLastName ?? '';
            const nn = link.childNickname ?? '';
            if (fn) id.firstName = fn;
            if (ln) id.lastName = ln;
            if (nn) id.nickname = nn;
            // displayName ableiten: Spitzname hat Vorrang, sonst Vorname + Nachname
            if (nn || fn) {
              id.displayName = nn || `${fn} ${ln}`.trim();
            }
            localStorage.setItem("aregoland_identity", JSON.stringify(id));
          } catch {}

          // FSK 6 setzen — Kind-Konten bekommen immer FSK 6
          const fskUpdate: FskStatus = { level: 6, verified: true, verifiedAt: new Date().toISOString(), method: "parent" };
          saveFsk(fskUpdate);
          onFskUpdated?.();

          // Server benachrichtigen (Kind → Elternteil verknuepfen)
          const fn = link.childFirstName ?? '';
          const ln = link.childLastName ?? '';
          const nn = link.childNickname ?? '';
          if (childId && link.parentId) {
            fetch('/child-link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                child_id: childId,
                parent_id: link.parentId,
                first_name: fn,
                last_name: ln,
                nickname: nn,
              }),
            }).catch(() => {});
          }

          setParentScanActive(false);
          setParentLinked(link.parentName);

          // Toast fuer Kind
          const toastEl = document.createElement('div');
          toastEl.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm font-medium max-w-xs text-center';
          toastEl.textContent = t('settings.childLinkedToast');
          document.body.appendChild(toastEl);
          setTimeout(() => toastEl.remove(), 4000);
        },
        () => {} // Kein Fehler bei fehlgeschlagenem Frame
      );
    } catch (e) {
      console.error("Scanner-Fehler:", e);
      setParentScanError(t('settings.fskParentCameraError'));
      setParentScanActive(false);
    }
  }, [t, onFskUpdated, identity]);

  // Stiller Heartbeat für Directory (alle 2 Tage)
  useEffect(() => {
    if (identity) maybeDirectoryHeartbeat(identity.aregoId, identity.displayName);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleNotif = (key: keyof NotifSettings) => {
    const next = { ...notif, [key]: !notif[key] };
    if (key === "push" && !notif.push && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setNotif(next);
    saveNotifSettings(next);
  };

  const START_SCREENS = [
    { id: "dashboard", label: t('settings.dashboardDefault'), icon: LayoutGrid },
    { id: "chatList", label: t('chatList.title'), icon: MessageCircle },
    { id: "calendar", label: t('dashboard.calendar'), icon: Calendar },
    { id: "people", label: t('dashboard.contacts'), icon: Users },
    { id: "spaces", label: t('dashboard.spacesLabel'), icon: LayoutGrid },
    { id: "connect", label: t('dashboard.connect'), icon: HeartHandshake },
    { id: "documents", label: t('dashboard.documents'), icon: FileText },
    { id: "pay", label: t('dashboard.pay'), icon: CreditCard, disabled: true },
    { id: "world", label: t('dashboard.world'), icon: Globe, disabled: true },
  ];

  // Load saved settings on mount
  useEffect(() => {
    const savedStartScreen = localStorage.getItem("aregoland_start_screen");
    if (savedStartScreen) {
      // Migration: "community" → "spaces"
      const mapped = savedStartScreen === "community" ? "spaces" : savedStartScreen;
      if (mapped !== savedStartScreen) localStorage.setItem("aregoland_start_screen", mapped);
      setStartScreen(mapped);
    }
  }, []);

  const handleStartScreenChange = (screenId: string) => {
    setStartScreen(screenId);
    localStorage.setItem("aregoland_start_screen", screenId);
  };

  const handleStartKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const matches = START_SCREENS.map((s, i) => ({ s, i })).filter(({ s }) =>
      s.label.toLowerCase().startsWith(key)
    );
    if (matches.length === 0) return;
    e.preventDefault();

    let targetIndex: number;
    if (key === startLastKey.current) {
      const currentPos = matches.findIndex(m => m.i === startLastIndex.current);
      const next = currentPos === -1 ? 0 : (currentPos + 1) % matches.length;
      targetIndex = matches[next].i;
    } else {
      targetIndex = matches[0].i;
    }
    startLastKey.current = key;
    startLastIndex.current = targetIndex;

    const container = startDropdownRef.current;
    if (container) {
      const buttons = container.querySelectorAll("button");
      buttons[targetIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [START_SCREENS]);

  // Main Settings Menu
  if (activeSubmenu === "main") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">{t('settings.title')}</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4 max-w-lg mx-auto">
            {/* Gruppe 1: Abo & Speicher */}
            <div className="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-700/50">
               <button
                 onClick={() => setActiveSubmenu("subscription")}
                 className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-amber-500/20 p-2 rounded-lg text-amber-400">
                     <CreditCard size={20} />
                   </div>
                   <span className="font-medium">{t('settings.subscriptionSection')}</span>
                 </div>
                 <ChevronRight size={20} className="text-gray-500" />
               </button>

               <button
                 onClick={() => setActiveSubmenu("storage")}
                 className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400">
                     <HardDrive size={20} />
                   </div>
                   <span className="font-medium">{t('settings.storageSection')}</span>
                 </div>
                 <ChevronRight size={20} className="text-gray-500" />
               </button>
            </div>

            {/* Gruppe 2: App & Benachrichtigungen */}
            <div className="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-700/50">
               <button
                 onClick={() => setActiveSubmenu("app")}
                 className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400">
                     <Smartphone size={20} />
                   </div>
                   <span className="font-medium">{t('settings.appSettings')}</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="text-xs text-gray-500">{t('settings.appSettingsDesc')}</span>
                   <ChevronRight size={20} className="text-gray-500" />
                 </div>
               </button>

               <button
                 onClick={() => setActiveSubmenu("notifications")}
                 className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-purple-500/20 p-2 rounded-lg text-purple-400">
                     <Bell size={20} />
                   </div>
                   <span className="font-medium">{t('settings.notifications')}</span>
                 </div>
                 <ChevronRight size={20} className="text-gray-500" />
               </button>
            </div>

            {/* Gruppe 3: FSK, Datenschutz & Familie */}
            <div className="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-700/50">
               <button
                 onClick={() => setActiveSubmenu("fsk")}
                 className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
               >
                 <div className="flex items-center gap-3">
                   <div className={`${loadFsk()?.verified ? 'bg-green-500/20' : 'bg-orange-500/20'} p-2 rounded-lg ${loadFsk()?.verified ? 'text-green-400' : 'text-orange-400'}`}>
                     <Shield size={20} />
                   </div>
                   <div>
                     <span className="font-medium">{t('settings.fskSection')}</span>
                     {!loadFsk()?.verified && (
                       <p className="text-xs text-orange-400">{t('settings.fskNotVerified')}</p>
                     )}
                   </div>
                 </div>
                 <ChevronRight size={20} className="text-gray-500" />
               </button>

               <button
                 onClick={() => setActiveSubmenu("privacy")}
                 className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-green-500/20 p-2 rounded-lg text-green-400">
                     <Shield size={20} />
                   </div>
                   <span className="font-medium">{t('settings.privacy')}</span>
                 </div>
                 <ChevronRight size={20} className="text-gray-500" />
               </button>

               <button
                 onClick={() => setActiveSubmenu("family")}
                 className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-pink-500/20 p-2 rounded-lg text-pink-400">
                     <Baby size={20} />
                   </div>
                   <span className="font-medium">{t('settings.familyChildren')}</span>
                 </div>
                 <div className="flex items-center gap-2">
                   {linkedChildren.length > 0 && (
                     <span className="text-xs text-gray-500">{linkedChildren.length}</span>
                   )}
                   <ChevronRight size={20} className="text-gray-500" />
                 </div>
               </button>
            </div>

            {/* Konto zurücksetzen */}
            <AlertDialog.Root>
              <AlertDialog.Trigger asChild>
                <button className="w-full flex items-center justify-center gap-2 p-4 text-red-600 font-medium hover:bg-red-500/10 rounded-2xl transition-colors border border-red-900/40">
                  <Trash2 size={18} />
                  {t('settings.resetAccount')}
                </button>
              </AlertDialog.Trigger>

              <AlertDialog.Portal>
                <AlertDialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
                  <div className="flex justify-center mb-4">
                    <div className="bg-red-500/15 p-4 rounded-2xl">
                      <Trash2 size={32} className="text-red-500" />
                    </div>
                  </div>
                  <AlertDialog.Title className="text-lg font-bold text-white text-center mb-2">
                    {t('settings.resetConfirmTitle')}
                  </AlertDialog.Title>
                  <AlertDialog.Description className="text-sm text-gray-400 text-center leading-relaxed mb-6">
                    {t('settings.resetConfirmDesc')}
                  </AlertDialog.Description>
                  <div className="flex flex-col gap-2">
                    <AlertDialog.Action asChild>
                      <button
                        onClick={() => { deleteIdentity(); deleteContacts(); onResetAccount?.(); }}
                        className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                      >
                        {t('settings.resetConfirmBtn')}
                      </button>
                    </AlertDialog.Action>
                    <AlertDialog.Cancel asChild>
                      <button className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-3 px-4 rounded-xl transition-colors border border-gray-700">
                        {t('common.cancel')}
                      </button>
                    </AlertDialog.Cancel>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>

            <p className="text-center text-xs text-gray-600 mt-4">Version 1.0.0 (Build 2026.01)</p>
          </div>
        </div>
      </div>
    );
  }

  // App Settings Submenu
  if (activeSubmenu === "app") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button 
            onClick={() => setActiveSubmenu("main")}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">{t('settings.appSettings')}</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">
            
            {/* Start Screen Selector — Dropdown */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.startScreen')}</h3>
              <div className="relative">
                <button
                  onClick={() => setStartDropdownOpen(!startDropdownOpen)}
                  className="w-full flex items-center justify-between p-4 bg-gray-800/50 rounded-2xl border border-gray-700/50 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {(() => { const cur = START_SCREENS.find(s => s.id === startScreen) || START_SCREENS[0]; const Icon = cur.icon; return (<><div className="bg-blue-500/20 p-2 rounded-lg text-blue-400"><Icon size={18} /></div><span className="font-medium text-white">{cur.label}</span></>); })()}
                  </div>
                  <ChevronDown size={18} className={`text-gray-400 transition-transform ${startDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {startDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      ref={startDropdownRef}
                      tabIndex={0}
                      onKeyDown={handleStartKeyDown}
                      className="absolute z-50 mt-2 w-full max-h-64 overflow-y-auto bg-gray-800 rounded-2xl border border-gray-700/50 shadow-xl outline-none"
                    >
                      {START_SCREENS.map((screen) => {
                        const Icon = screen.icon;
                        const disabled = "disabled" in screen && screen.disabled;
                        return (
                          <button
                            key={screen.id}
                            onClick={() => {
                              if (disabled) return;
                              handleStartScreenChange(screen.id);
                              setStartDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-4 py-3 transition-colors border-b border-gray-700/30 last:border-0 ${
                              disabled ? "opacity-40 cursor-not-allowed" :
                              startScreen === screen.id ? "bg-blue-900/20" : "hover:bg-gray-700/50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${startScreen === screen.id ? "bg-blue-500/20 text-blue-400" : "bg-gray-700/50 text-gray-400"}`}>
                                <Icon size={18} />
                              </div>
                              <span className={`text-sm font-medium ${startScreen === screen.id ? "text-blue-400" : "text-white"}`}>
                                {screen.label}
                              </span>
                              {disabled && <span className="text-[10px] text-gray-600 ml-1">(bald)</span>}
                            </div>
                            {startScreen === screen.id && (
                              <div className="bg-blue-500 rounded-full p-0.5">
                                <Check size={12} className="text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-xs text-gray-500 px-2">
                  {t('settings.startScreenDesc')}
              </p>
            </div>

            {/* Theme Toggle */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.appearance')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
                          <Moon size={20} />
                      </div>
                      <span className="font-medium">{t('settings.darkMode')}</span>
                  </div>
                  <button
                      onClick={() => {
                        const next = !darkMode;
                        setDarkMode(next);
                        localStorage.setItem('aregoland_dark_mode', String(next));
                        document.documentElement.classList.toggle('dark', next);
                        document.documentElement.classList.toggle('light', !next);
                      }}
                      className={`relative w-12 h-6 rounded-full transition-colors ${darkMode ? "bg-blue-600" : "bg-gray-600"}`}
                  >
                      <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${darkMode ? "translate-x-6" : "translate-x-0"}`}></div>
                  </button>
              </div>
            </div>

            {/* Online Status Toggle */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.onlineStatus')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${showOnlineStatus ? "bg-green-500/20 text-green-400" : "bg-gray-700/50 text-gray-500"}`}>
                    <Eye size={20} />
                  </div>
                  <div>
                    <span className="font-medium">{t('settings.showOnlineStatus')}</span>
                    <div className="text-xs text-gray-500">{t('settings.showOnlineStatusDesc')}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const next = !showOnlineStatus;
                    setShowOnlineStatus(next);
                    localStorage.setItem('aregoland_hide_online', next ? 'false' : 'true');
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${showOnlineStatus ? "bg-green-600" : "bg-gray-600"}`}
                >
                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${showOnlineStatus ? "translate-x-6" : "translate-x-0"}`}></div>
                </button>
              </div>
            </div>

            {/* Language Selector — Dropdown */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.language')}</h3>
              <div className="relative">
                <button
                  onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                  className="w-full flex items-center justify-between p-4 bg-gray-800/50 rounded-2xl border border-gray-700/50 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{selectedLang.flag}</span>
                    <span className="font-medium text-white">{selectedLang.name}</span>
                  </div>
                  <ChevronDown size={18} className={`text-gray-400 transition-transform ${langDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {langDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      ref={langDropdownRef}
                      tabIndex={0}
                      onKeyDown={handleLangKeyDown}
                      className="absolute z-50 mt-2 w-full max-h-64 overflow-y-auto bg-gray-800 rounded-2xl border border-gray-700/50 shadow-xl outline-none"
                    >
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => {
                            setSelectedLang(lang);
                            i18n.changeLanguage(lang.code);
                            localStorage.setItem('aregoland_language', lang.code);
                            setLangDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3 transition-colors border-b border-gray-700/30 last:border-0 ${
                            selectedLang.code === lang.code ? "bg-blue-900/20" : "hover:bg-gray-700/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{lang.flag}</span>
                            <span className={`text-sm font-medium ${selectedLang.code === lang.code ? "text-blue-400" : "text-white"}`}>
                              {lang.name}
                            </span>
                          </div>
                          {selectedLang.code === lang.code && (
                            <div className="bg-blue-500 rounded-full p-0.5">
                              <Check size={12} className="text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Notifications Submenu
  if (activeSubmenu === "notifications") {
    const toggleItems: { key: keyof NotifSettings; icon: typeof Bell; label: string; desc: string }[] = [
      { key: "push", icon: BellRing, label: t('settings.notifPush'), desc: t('settings.notifPushDesc') },
      { key: "messages", icon: MessageCircle, label: t('settings.notifMessages'), desc: t('settings.notifMessagesDesc') },
      { key: "calls", icon: Phone, label: t('settings.notifCalls'), desc: t('settings.notifCallsDesc') },
      { key: "sounds", icon: Volume2, label: t('settings.notifSounds'), desc: t('settings.notifSoundsDesc') },
    ];
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button onClick={() => setActiveSubmenu("main")} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-bold">{t('settings.notifications')}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
              {toggleItems.map(({ key, icon: Icon, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-4 border-b border-gray-700/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${notif[key] ? "bg-purple-500/20 text-purple-400" : "bg-gray-700/50 text-gray-500"}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-gray-500">{desc}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleNotif(key)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${notif[key] ? "bg-blue-600" : "bg-gray-600"}`}
                  >
                    <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${notif[key] ? "translate-x-6" : "translate-x-0"}`} />
                  </button>
                </div>
              ))}
            </div>
            {("Notification" in window && Notification.permission === "denied") && (
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-xs text-red-300">
                {t('settings.notifBlocked')}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Privacy Settings Submenu
  if (activeSubmenu === "privacy") {
    const storageItems = [
      { label: t('settings.storageChats'), key: "arego_chat_", estimate: () => {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("arego_chat_") || k.startsWith("arego_history_") || k.startsWith("arego_pending_"))) total += estimateStorageBytes(k);
        }
        return total;
      }},
      { label: t('settings.storageProfile'), key: "arego_profile", estimate: () => estimateStorageBytes("arego_profile") },
      { label: t('settings.storageContacts'), key: "arego_contacts", estimate: () => estimateStorageBytes("arego_contacts") },
    ];
    const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    const totalBytes = storageItems.reduce((sum, s) => sum + s.estimate(), 0) + estimateStorageBytes("aregoland_identity");

    const visCategories: { key: keyof PrivacyVisibility; label: string; desc: string; icon: typeof Users }[] = [
      { key: "personal", label: t('settings.visibilityPersonal'), desc: t('settings.visibilityPersonalDesc'), icon: Users },
      { key: "address", label: t('settings.visibilityAddress'), desc: t('settings.visibilityAddressDesc'), icon: MapPin },
      { key: "contact", label: t('settings.visibilityContact'), desc: t('settings.visibilityContactDesc'), icon: Phone },
      { key: "social", label: t('settings.visibilitySocial'), desc: t('settings.visibilitySocialDesc'), icon: LinkIcon },
    ];
    const visOptions: { value: VisLevel; label: string }[] = [
      { value: "all", label: t('settings.visAllContacts') },
      { value: "custom", label: t('settings.visCustomList') },
      { value: "none", label: t('settings.visNone') },
    ];
    const updatePrivacyVis = (key: keyof PrivacyVisibility, value: VisLevel) => {
      const next = { ...privacyVis, [key]: value };
      setPrivacyVis(next);
      localStorage.setItem(PRIVACY_KEY, JSON.stringify(next));
      if (value === "custom") setCatPickerKey(key);
    };
    const catsKeyFor = (key: keyof PrivacyVisibility) => `${key}Cats` as keyof PrivacyVisibility;
    const getSelectedCats = (key: keyof PrivacyVisibility): string[] => (privacyVis[catsKeyFor(key)] as string[] | undefined) ?? [];
    const toggleCat = (key: keyof PrivacyVisibility, catId: string) => {
      const cats = getSelectedCats(key);
      const next = cats.includes(catId) ? cats.filter(c => c !== catId) : [...cats, catId];
      const updated = { ...privacyVis, [catsKeyFor(key)]: next };
      setPrivacyVis(updated);
      localStorage.setItem(PRIVACY_KEY, JSON.stringify(updated));
    };

    const handleDiscoverableToggle = async () => {
      if (isChildAccount) return;
      const next = !discoverable;
      setDirectoryStatus("loading");
      const ok = next
        ? await directoryRegister(identity?.aregoId ?? "", identity?.displayName ?? "")
        : await directoryRemove(identity?.aregoId ?? "");
      if (ok) {
        setDiscoverable(next);
        localStorage.setItem("aregoland_discoverable", String(next));
        setDirectoryStatus("success");
      } else {
        setDirectoryStatus("error");
      }
      setTimeout(() => setDirectoryStatus("idle"), 2000);
    };

    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {/* Toast */}
        <AnimatePresence>
          {privacyToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium"
            >
              <Check size={16} />
              {privacyToastMsg || t('settings.profileDeleted')}
            </motion.div>
          )}
        </AnimatePresence>
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button onClick={() => setActiveSubmenu("main")} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-bold">{t('settings.privacy')}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">

            {/* Info banner */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl flex gap-3">
              <Shield className="text-yellow-500 shrink-0" size={20} />
              <p className="text-sm text-yellow-200/80 leading-relaxed">{t('settings.privacyNote')}</p>
            </div>

            {/* Arego-ID */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.yourAregoId')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 flex items-center justify-between">
                <span className="font-mono font-bold text-blue-400 tracking-wider">{identity?.aregoId ?? ""}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(identity?.aregoId ?? ""); setIdCopied(true); setTimeout(() => setIdCopied(false), 2000); }}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  {idCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* Discoverable toggle (Opt-in) */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.discoverability')}</h3>
              <div className={`bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3 ${isChildAccount ? "opacity-60" : ""}`}>
                {/* Toggle-Zeile */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${discoverable && !isChildAccount ? "bg-green-500/20 text-green-400" : "bg-gray-700/50 text-gray-500"}`}>
                      {discoverable && !isChildAccount ? <Eye size={18} /> : <EyeOff size={18} />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{t('settings.publiclyDiscoverable')}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{t('settings.discoverableShort')}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleDiscoverableToggle}
                    disabled={isChildAccount || directoryStatus === "loading"}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${isChildAccount ? "bg-gray-700 cursor-not-allowed" : discoverable ? "bg-green-600" : "bg-gray-600"}`}
                  >
                    <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${discoverable && !isChildAccount ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>

                {/* Übermittelte Daten als Chips */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 font-medium">{t('settings.discoverableDataLabel')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/15 text-blue-400">Arego-ID</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/15 text-purple-400">{t('settings.firstName')}</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/15 text-purple-400">{t('settings.lastName')}</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-cyan-500/15 text-cyan-400">{t('settings.nickname')}</span>
                  </div>
                  <p className="text-[9px] text-gray-600">{t('settings.discoverableOnlyIfSet')}</p>
                </div>

                {/* Löschhinweis */}
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                  <Clock size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-300/80 leading-relaxed">{t('settings.discoverableExpiry')}</p>
                </div>

                {isChildAccount && (
                  <div className="flex items-center gap-2 text-xs text-pink-400 bg-pink-500/10 border border-pink-500/20 rounded-lg p-2">
                    <Baby size={14} className="shrink-0" />
                    {t('settings.childNotDiscoverable')}
                  </div>
                )}
                {directoryStatus === "success" && (
                  <p className="text-xs text-green-400">{discoverable ? t('settings.directoryRegister') : t('settings.directoryRemoved')}</p>
                )}
                {directoryStatus === "error" && (
                  <p className="text-xs text-red-400">{t('common.error')}</p>
                )}
              </div>
            </div>

            {/* Profile Visibility — per category */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.profileVisibility')}</h3>
              <p className="text-xs text-gray-400 px-2 mb-2">{t('settings.profileVisibilityDesc')}</p>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                {visCategories.map(({ key, label, desc, icon: Icon }) => {
                  const selectedCats = getSelectedCats(key);
                  return (
                    <div key={key} className="p-4 border-b border-gray-700/50 last:border-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-1.5 rounded-lg bg-gray-700/50 text-gray-400"><Icon size={16} /></div>
                        <div>
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-xs text-gray-500">{desc}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {visOptions.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => updatePrivacyVis(key, opt.value)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                              privacyVis[key] === opt.value
                                ? opt.value === "none" ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/50" : "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/50"
                                : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {/* Selected categories summary */}
                      {privacyVis[key] === "custom" && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {selectedCats.length === 0 ? (
                            <button onClick={() => setCatPickerKey(key)} className="text-xs text-yellow-400 hover:underline">{t('settings.visSelectCategories')}</button>
                          ) : (
                            <>
                              {selectedCats.map(catId => {
                                const tab = availableTabs.find(t => t.id === catId);
                                return tab ? (
                                  <span key={catId} className="text-xs bg-blue-600/15 text-blue-400 px-2 py-0.5 rounded-md">{tab.label}</span>
                                ) : null;
                              })}
                              <button onClick={() => setCatPickerKey(key)} className="text-xs text-gray-500 hover:text-white ml-1">{t('common.edit')}</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Category Picker Modal */}
            <AnimatePresence>
              {catPickerKey && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
                  onClick={() => setCatPickerKey(null)}
                >
                  <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    exit={{ y: 100 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-3xl p-5 pb-8"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">{t('settings.visSelectCategories')}</h3>
                      <button onClick={() => setCatPickerKey(null)} className="p-1 text-gray-500 hover:text-white"><X size={20} /></button>
                    </div>
                    <div className="space-y-2">
                      {availableTabs.map((tab) => {
                        const checked = getSelectedCats(catPickerKey).includes(tab.id);
                        return (
                          <button
                            key={tab.id}
                            onClick={() => toggleCat(catPickerKey, tab.id)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${checked ? "bg-blue-600/15 border border-blue-500/30" : "bg-gray-800/50 border border-gray-700/50 hover:bg-gray-800"}`}
                          >
                            <span className={`text-sm font-medium ${checked ? "text-blue-400" : "text-white"}`}>{tab.label}</span>
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${checked ? "bg-blue-600 border-blue-600" : "border-gray-600"}`}>
                              {checked && <Check size={12} className="text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCatPickerKey(null)}
                      className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all"
                    >
                      {t('common.done')}
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Storage */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.dataStorage')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-gray-400"><HardDrive size={16} /> {t('settings.totalStorage')}</div>
                  <span className="font-mono font-bold text-white">{formatSize(totalBytes)}</span>
                </div>
                <div className="h-px bg-gray-700/50" />
                {storageItems.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs text-gray-400">
                    <span>{s.label}</span>
                    <span className="font-mono">{formatSize(s.estimate())}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Delete data */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.deleteData')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                <button
                  onClick={() => { localStorage.removeItem("arego_profile"); window.dispatchEvent(new Event("arego-profile-updated")); setPrivacyToastMsg(t('settings.profileDeleted')); setPrivacyToast(true); setTimeout(() => setPrivacyToast(false), 2500); }}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Users size={16} className="text-gray-400" />
                    <span className="text-sm">{t('settings.deleteProfile')}</span>
                  </div>
                  <Trash2 size={16} className="text-red-400" />
                </button>
              </div>
            </div>

            {/* Blocked users */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.blockedUsers')}</h3>
              {blockedList.length === 0 ? (
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 text-center">
                  <p className="text-sm text-gray-500">{t('settings.noBlockedUsers')}</p>
                </div>
              ) : (
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                  {blockedList.map((id) => {
                    const contact = loadContacts().find(c => c.aregoId === id);
                    return (
                      <div key={id} className="flex items-center justify-between p-4 border-b border-gray-700/50 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center">
                            <Ban size={16} className="text-orange-400" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{contact?.displayName ?? id}</div>
                            <div className="text-xs text-gray-500 font-mono">{id}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            unblockContact(id);
                            setBlockedList(loadBlocked());
                            setPrivacyToastMsg(t('settings.userUnblocked'));
                            setPrivacyToast(true);
                            setTimeout(() => setPrivacyToast(false), 2500);
                          }}
                          className="text-xs text-blue-400 font-medium hover:text-blue-300 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 rounded-lg transition-colors"
                        >
                          {t('settings.unblock')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Subscription Submenu — "Abo & Zahlung"
  if (activeSubmenu === "subscription") {
    const sub = loadSubscription();
    const status = sub ? getEffectiveStatus(sub) : null;
    const isLocked = subscriptionLocked;
    const planLabels: Record<string, string> = {
      monthly: t('settings.subPlan1m'),
      quarterly: t('settings.subPlan3m'),
      biannual: t('settings.subPlan6m'),
      yearly: t('settings.subPlan12m'),
    };

    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          {!isLocked && (
            <button
              onClick={() => setActiveSubmenu("main")}
              className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
            >
              <ArrowLeft size={24} />
            </button>
          )}
          <h1 className="text-xl font-bold">{t('settings.subscriptionSection')}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">

            {/* Lock-Hinweis */}
            {isLocked && (
              <div className="bg-red-500/10 rounded-2xl p-4 border border-red-500/30">
                <div className="flex gap-3">
                  <Lock size={20} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-red-300 font-semibold">{t('settings.subLockedTitle')}</p>
                    <p className="text-sm text-gray-400">{t('settings.subLockedDesc')}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Aktueller Plan */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.subCurrentPlan')}</p>
              {status === "trial" && sub && (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-400" />
                  <div>
                    <p className="text-blue-400 font-medium">{t('settings.subStatusTrial')}</p>
                    <p className="text-xs text-gray-400">
                      {t('settings.subTrialRemaining', { days: daysUntil(sub.trialEnd) })}
                      {' \u00b7 '}{t('settings.subUntil')} {formatDateDE(sub.trialEnd)}
                    </p>
                  </div>
                </div>
              )}
              {status === "active" && sub && (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div>
                    <p className="text-green-400 font-medium">{t('settings.subPlanActive')}</p>
                    <p className="text-xs text-gray-400">
                      {sub.planType ? planLabels[sub.planType] : ''} \u00b7 5 GB
                      {sub.expiresAt && ` \u00b7 ${t('settings.subUntil')} ${formatDateDE(sub.expiresAt)}`}
                    </p>
                  </div>
                </div>
              )}
              {status === "expired" && (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div>
                    <p className="text-red-400 font-medium">{t('settings.subStatusExpired')}</p>
                    <p className="text-xs text-gray-500">{t('settings.subExpiredDesc')}</p>
                  </div>
                </div>
              )}
              {!sub && (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-gray-500" />
                  <div>
                    <p className="text-gray-300 font-medium">{t('settings.subPlanFree')}</p>
                    <p className="text-xs text-gray-500">{t('settings.subPlanFreeDesc')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Warum Abo */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t('settings.subWhyTitle')}</p>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex gap-2"><span className="text-amber-400 shrink-0">1.</span>{t('settings.subWhy1')}</li>
                <li className="flex gap-2"><span className="text-amber-400 shrink-0">2.</span>{t('settings.subWhy2')}</li>
                <li className="flex gap-2"><span className="text-amber-400 shrink-0">3.</span>{t('settings.subWhy3')}</li>
              </ul>
            </div>

            {/* Verfuegbare Plaene — nur wenn kein aktives Abo */}
            {status !== "active" && (
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-4">
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t('settings.subAvailablePlans')}</p>
                <ul className="space-y-2 text-sm text-gray-300 mb-2">
                  <li className="flex items-center gap-2"><Check size={14} className="text-amber-400 shrink-0" />{t('settings.subPlanCloud1')}</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-amber-400 shrink-0" />{t('settings.subPlanCloud2')}</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-amber-400 shrink-0" />{t('settings.subPlanCloud3')}</li>
                </ul>
                <div className="space-y-2">
                  {PLANS.map((plan) => (
                    <div key={plan.type} className="bg-gray-800 rounded-xl border border-gray-700/50 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-white font-medium">{planLabels[plan.type!]}</p>
                          {plan.discount && (
                            <span className="text-xs text-green-400 font-medium">{plan.discount}% {t('settings.subDiscount')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-amber-400 font-bold">{plan.price},00 {"\u20AC"}</p>
                        <button
                          disabled
                          className="bg-gray-700 text-gray-500 text-xs font-medium px-3 py-1.5 rounded-lg cursor-not-allowed"
                        >
                          {t('settings.subPlanCloudBtn')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 text-center">{t('settings.subPlanCloudHint')}</p>
              </div>
            )}

            {/* Auto-Verlaengerung — nur bei aktivem Abo */}
            {status === "active" && sub && (
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t('settings.subAutoRenew')}</p>
                    <p className="text-xs text-gray-500">{t('settings.subAutoRenewDesc')}</p>
                  </div>
                  <div
                    className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${sub.autoRenew ? 'bg-amber-500' : 'bg-gray-600'}`}
                    onClick={() => { setAutoRenew(!sub.autoRenew); setSubRefresh(v => v + 1); }}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sub.autoRenew ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              </div>
            )}

            {/* Gutscheincode */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t('settings.subVoucher')}</p>
              <p className="text-sm text-gray-500">{t('settings.subVoucherDesc')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder={t('settings.subVoucherPlaceholder')}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  disabled={!voucherCode.trim()}
                  className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 disabled:text-gray-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                  {t('settings.subRedeem')}
                </button>
              </div>
            </div>

            {/* Zahlungsmethode */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t('settings.subPaymentMethod')}</p>
              <button
                disabled
                className="w-full bg-gray-700 text-gray-500 font-medium py-3 px-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CreditCard size={18} />
                {t('settings.subPaymentSoon')}
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // FSK Submenu — "FSK Verifizierung"
  if (activeSubmenu === "fsk") {
    const fsk = loadFsk();

    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button
            onClick={() => setActiveSubmenu("main")}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">{t('settings.fskSection')}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">

            {/* Aktueller Status */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.fskCurrentStatus')}</p>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${fsk?.verified ? 'bg-green-400' : 'bg-orange-400'}`} />
                <div>
                  <p className={`font-medium ${fsk?.verified ? 'text-green-400' : 'text-orange-400'}`}>
                    FSK {fsk?.level ?? 6} — {fsk?.verified ? t('settings.fskVerified') : t('settings.fskNotVerified')}
                  </p>
                  {!fsk?.verified && (
                    <p className="text-xs text-gray-500">{t('settings.fskLockedHint')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* FSK-Stufen Uebersicht */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">{t('settings.fskOverviewTitle')}</p>
              {([
                { level: 6, dot: "bg-green-400", key: "fskOverview6", descKey: "fskOverview6Desc" },
                { level: 12, dot: "bg-yellow-400", key: "fskOverview12", descKey: "fskOverview12Desc" },
                { level: 16, dot: "bg-orange-400", key: "fskOverview16", descKey: "fskOverview16Desc" },
                { level: 18, dot: "bg-red-400", key: "fskOverview18", descKey: "fskOverview18Desc" },
              ] as const).map(({ level, dot, key, descKey }) => (
                <div key={level} className={`flex items-start gap-3 p-3 rounded-xl ${fsk?.level === level ? 'bg-white/5 ring-1 ring-white/10' : ''}`}>
                  <span className={`mt-0.5 shrink-0 inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-200">{t(`settings.${key}`)}</p>
                    <p className="text-xs text-gray-500">{t(`settings.${descKey}`)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Erklaerung */}
            <div className="bg-orange-500/10 rounded-2xl p-4 border border-orange-500/20">
              <div className="flex gap-3">
                <Shield size={20} className="text-orange-400 shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm text-gray-300">
                  <p className="text-orange-300 font-semibold">{t('settings.fskWhyTitle')}</p>
                  <p>{t('settings.fskWhyText')}</p>
                </div>
              </div>
            </div>

            {/* Selbst verifizieren — temporaer (nicht fuer Kind-Konten) */}
            {!isChildAccount && (
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400">
                    <Check size={18} />
                  </div>
                  <p className="font-medium">{t('settings.fskSelfVerifyTitle')}</p>
                </div>
                {fsk?.verified && fsk.method === "self" ? (
                  <p className="text-sm text-green-400 text-center py-2">{t('settings.fskSelfVerifyDone')}</p>
                ) : !fsk?.verified ? (
                  <>
                    <button
                      onClick={() => {
                        const updated: FskStatus = {
                          level: 18,
                          verified: true,
                          verifiedAt: new Date().toISOString(),
                          method: "self",
                        };
                        saveFsk(updated);
                        onFskUpdated?.();
                        setActiveSubmenu("fsk"); // force re-render
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {t('settings.fskSelfVerifyBtn')}
                    </button>
                    <p className="text-xs text-gray-500 text-center">{t('settings.fskSelfVerifyHint')}</p>
                  </>
                ) : null}
              </div>
            )}

            {/* Kind-Konto Hinweis */}
            {isChildAccount && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex gap-3">
                <Lock size={18} className="text-orange-400 shrink-0 mt-0.5" />
                <div className="text-sm text-orange-300/80">
                  <p className="font-medium">{t('settings.fskChildLocked')}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('settings.fskChildLockedHint')}</p>
                </div>
              </div>
            )}

            {/* Option 1: EUDI Wallet */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400">
                  <Lock size={18} />
                </div>
                <div>
                  <p className="font-medium">{t('settings.fskEudiTitle')}</p>
                  <p className="text-xs text-gray-500">{t('settings.fskEudiDesc')}</p>
                </div>
              </div>
              <button
                disabled
                className="w-full bg-gray-700 text-gray-500 font-medium py-3 px-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
              >
                {t('settings.fskEudiBtn')}
              </button>
              <p className="text-xs text-gray-500 text-center">{t('settings.fskEudiHint')}</p>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Storage Submenu — "Meine Daten & Speicher"
  if (activeSubmenu === "storage") {
    const storageActive = localStorage.getItem("aregoland_storage_active") === "true";
    const storageUsedMB = parseFloat(localStorage.getItem("aregoland_storage_used_mb") || "0");
    const storageLimitMB = parseFloat(localStorage.getItem("aregoland_storage_limit_mb") || "1024");
    const storageOptions = JSON.parse(localStorage.getItem("aregoland_storage_options") || '{"avatar":false}');

    const toggleStorageOption = (key: string) => {
      const updated = { ...storageOptions, [key]: !storageOptions[key] };
      localStorage.setItem("aregoland_storage_options", JSON.stringify(updated));
    };

    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button
            onClick={() => setActiveSubmenu("main")}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">{t('settings.storageSection')}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">

            {/* Erklaerung */}
            <div className="bg-cyan-500/10 rounded-2xl p-4 border border-cyan-500/20">
              <div className="flex gap-3">
                <div className="mt-0.5 text-cyan-400 shrink-0"><HardDrive size={20} /></div>
                <div className="space-y-2 text-sm text-gray-300">
                  <p className="text-cyan-300 font-semibold">{t('settings.storageExplainTitle')}</p>
                  <p>{t('settings.storageExplainText')}</p>
                  <p className="text-gray-500">{t('settings.storageExplainOptional')}</p>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.storageStatus')}</p>
              {!storageActive ? (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-gray-500" />
                  <span className="text-gray-400">{t('settings.storageInactive')}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                    <span className="text-green-400">{t('settings.storageActive')}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>{storageUsedMB.toFixed(0)} MB</span>
                      <span>{(storageLimitMB / 1024).toFixed(0)} GB</span>
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all"
                        style={{ width: `${Math.min((storageUsedMB / storageLimitMB) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      {storageUsedMB.toFixed(0)} MB / {(storageLimitMB / 1024).toFixed(0)} GB {t('settings.storageUsed')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Was gespeichert werden soll */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.storageSyncOptions')}</p>
              <p className="text-sm text-gray-500 mb-4">{t('settings.storageSyncDesc')}</p>

              <div className={`space-y-3 ${!storageActive ? 'opacity-50 pointer-events-none' : ''}`}>
                {/* Profilbild */}
                <label className="flex items-center justify-between p-3 bg-gray-800 rounded-xl cursor-pointer">
                  <span className="text-sm font-medium">{t('settings.storageSyncAvatar')}</span>
                  <div
                    className={`relative w-12 h-6 rounded-full transition-colors ${storageOptions.avatar ? 'bg-cyan-500' : 'bg-gray-600'}`}
                    onClick={() => toggleStorageOption('avatar')}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${storageOptions.avatar ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Family & Children Submenu
  if (activeSubmenu === "family") {
    const handleGenerateQR = async () => {
      if (!identity) return;
      const payload = createChildLinkPayload(identity, {
        firstName: childFirstName.trim() || undefined,
        lastName: childLastName.trim() || undefined,
        nickname: childNickname.trim() || undefined,
      });
      const url = await QRCode.toDataURL(payload, { width: 280, margin: 2, color: { dark: '#ffffff', light: '#00000000' } });
      setQrDataUrl(url);
      setShowAddChild(true);
    };

    // Eltern-Kontrollzentrale fuer ein einzelnes Kind
    const activeChild = selectedChild ? linkedChildren.find(c => c.child_id === selectedChild) : null;
    if (activeChild) {

      const childName = activeChild.nickname || `${activeChild.first_name} ${activeChild.last_name}`.trim() || activeChild.child_id;

      return (
        <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
          <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
            <button onClick={() => setSelectedChild(null)} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all">
              <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                {childName[0]?.toUpperCase()}
              </div>
              <h1 className="text-xl font-bold">{childName}</h1>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4 max-w-lg mx-auto">

              {/* FSK-Status */}
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex items-center gap-3">
                <Shield size={20} className="text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-400">FSK {activeChild.fsk_stufe} — {t('settings.childFskProtected')}</p>
                  <p className="text-xs text-gray-500">{t('settings.childFskUpgradeHint')}</p>
                </div>
              </div>

              {/* Info: Anfragen kommen als Toast */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex gap-3">
                <Bell size={18} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300/80">{t('settings.childActionInfo')}</p>
              </div>

              {/* Kind-ID */}
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Arego-ID</p>
                <p className="text-sm text-gray-400 font-mono">{activeChild.child_id}</p>
              </div>

            </div>
          </div>
        </div>
      );
    }

    const fskLevel = loadFsk()?.level ?? 6;
    const isFsk18 = fskLevel >= 18;

    // Familie-Hauptansicht: Kinderliste + QR generieren + Elternteil verknuepfen
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button
            onClick={() => { setActiveSubmenu("main"); setShowAddChild(false); setQrDataUrl(null); }}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">{t('settings.familyChildren')}</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">

            {/* Info Banner */}
            <div className="bg-pink-500/10 border border-pink-500/20 p-4 rounded-2xl flex gap-3">
              <Shield className="text-pink-400 shrink-0" size={22} />
              <div className="text-sm text-pink-200/80 leading-relaxed space-y-1">
                <p>{t('settings.familyInfo')}</p>
                <p className="text-xs text-pink-300/50">{t('settings.familyFskAutoHint')}</p>
              </div>
            </div>

            {/* Verknuepfte Kinder */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.linkedChildren')}</h3>
              {linkedChildren.length === 0 ? (
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6 text-center">
                  <Baby size={40} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{t('settings.noChildren')}</p>
                </div>
              ) : (
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                  {linkedChildren.map((child) => {
                    const name = child.nickname || `${child.first_name} ${child.last_name}`.trim() || child.child_id;
                    return (
                      <button
                        key={child.child_id}
                        onClick={() => setSelectedChild(child.child_id)}
                        className="w-full p-4 border-b border-gray-700/50 last:border-0 flex items-center justify-between hover:bg-gray-800/80 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                            {name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">{name}</div>
                            <div className="text-xs text-gray-500">FSK {child.fsk_stufe} — {t('settings.childFskProtected')}</div>
                          </div>
                        </div>
                        <ChevronRight size={20} className="text-gray-500" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Kind hinzufuegen — nur FSK 18 */}
            {!showAddChild ? (
              <button
                onClick={() => {
                  if (!isFsk18) {
                    const el = document.createElement('div');
                    el.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-orange-600 text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm font-medium max-w-xs text-center';
                    el.textContent = t('settings.addChildFsk18Required');
                    document.body.appendChild(el);
                    setTimeout(() => el.remove(), 3000);
                    return;
                  }
                  setShowAddChild(true);
                }}
                className={`w-full font-semibold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-98 ${isFsk18 ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-600/20' : 'bg-gray-800 text-gray-500 border border-gray-700/50 cursor-not-allowed'}`}
              >
                <QrCode size={20} />
                {t('settings.addChild')}
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{t('settings.addChild')}</h3>
                  <button onClick={() => { setShowAddChild(false); setQrDataUrl(null); setChildFirstName(""); setChildLastName(""); setChildNickname(""); }} className="p-1 text-gray-500 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex gap-2">
                  <Shield size={16} className="text-green-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-green-300/80">{t('settings.addChildFskHint')}</p>
                </div>

                {/* Namensfelder — werden in QR kodiert */}
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t('settings.childNameOptional')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={childFirstName} onChange={e => setChildFirstName(e.target.value)} placeholder={t('settings.childFirstName')} className="bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500 transition-all" />
                    <input type="text" value={childLastName} onChange={e => setChildLastName(e.target.value)} placeholder={t('settings.childLastName')} className="bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500 transition-all" />
                  </div>
                  <input type="text" value={childNickname} onChange={e => setChildNickname(e.target.value)} placeholder={t('settings.childNickname')} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500 transition-all" />
                  <p className="text-[10px] text-gray-600">{t('settings.childNameEditLater')}</p>
                </div>

                {/* QR generieren oder anzeigen */}
                {!qrDataUrl ? (
                  <button
                    onClick={handleGenerateQR}
                    className="w-full bg-pink-600 hover:bg-pink-500 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <QrCode size={18} />
                    {t('settings.generateQR')}
                  </button>
                ) : (
                  <>
                    <div className="flex flex-col items-center space-y-3">
                      <div className="bg-gray-900 p-4 rounded-2xl">
                        <img src={qrDataUrl} alt="Child Link QR" className="w-56 h-56" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <QrCode size={14} />
                        <span>{t('settings.qrTTL')}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 text-center">{t('settings.addChildScanInstruction')}</p>
                  </>
                )}
              </motion.div>
            )}

            {/* Elternteil verknuepfen */}
            {(isChildAccount || !loadFsk()?.verified) && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.fskParentTitle')}</h3>
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-pink-500/20 p-2 rounded-lg text-pink-400">
                      <HeartHandshake size={18} />
                    </div>
                    <div>
                      <p className="font-medium">{t('settings.fskParentTitle')}</p>
                      <p className="text-xs text-gray-500">{t('settings.fskParentDesc')}</p>
                    </div>
                  </div>

                  {parentLinked || (loadFsk()?.verified && loadFsk()?.method === "parent") ? (
                    <div className="flex items-center gap-2 justify-center py-2">
                      <Check size={18} className="text-green-400" />
                      <p className="text-sm text-green-400">{t('settings.fskParentLinked', { name: parentLinked || t('settings.fskParentDefault') })}</p>
                    </div>
                  ) : parentScanActive ? (
                    <>
                      <div id="parent-scan-region" className="w-full rounded-xl overflow-hidden" />
                      <button onClick={stopParentScanner} className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                        <X size={18} />
                        {t('common.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={startParentScanner} className="w-full bg-pink-600 hover:bg-pink-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                        <Camera size={18} />
                        {t('settings.fskParentBtn')}
                      </button>
                      <p className="text-xs text-gray-500 text-center">{t('settings.fskParentScanHint')}</p>
                    </>
                  )}

                  {parentScanError && (
                    <p className="text-xs text-red-400 text-center">{parentScanError}</p>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
