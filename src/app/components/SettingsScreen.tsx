import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Moon, Bell, Shield, ChevronRight, Smartphone, HelpCircle, LogOut, LayoutGrid, MessageCircle, Calendar, CreditCard, Check, Trash2, Baby, UserPlus, Lock, QrCode, X, Copy, Volume2, VolumeX, Phone, BellRing, BellOff, Eye, EyeOff, Database, MessageSquare, Users, FileText, ExternalLink, Mail, ChevronDown, ChevronUp, HardDrive, MapPin, Link as LinkIcon, Ban, Globe, HeartHandshake } from "lucide-react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { motion, AnimatePresence } from "motion/react";
import { deleteIdentity, loadIdentity, loadChildren, saveChild, removeChild, createChildLinkPayload, type ChildAccount } from "@/app/auth/identity";
import { deleteContacts, loadBlocked, unblockContact, loadContacts } from "@/app/auth/contacts";
import QRCode from "qrcode";

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
    const res = await fetch("/directory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aregoId, displayName }) });
    return res.ok;
  } catch { return false; }
}
async function directoryRemove(aregoId: string): Promise<boolean> {
  try {
    const res = await fetch("/directory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aregoId }) });
    return res.ok;
  } catch { return false; }
}

interface SettingsScreenProps {
  onBack: () => void;
  onResetAccount?: () => void;
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

const FSK_LEVELS = [
  { value: 6 as const, label: "FSK 6", color: "text-green-400", bg: "bg-green-500/20", enabled: true },
  { value: 12 as const, label: "FSK 12", color: "text-yellow-400", bg: "bg-yellow-500/20", enabled: true },
  { value: 16 as const, label: "FSK 16", color: "text-gray-500", bg: "bg-gray-700/50", enabled: false },
  { value: 18 as const, label: "FSK 18", color: "text-gray-500", bg: "bg-gray-700/50", enabled: false },
];

export default function SettingsScreen({ onBack, onResetAccount }: SettingsScreenProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<"main" | "app" | "privacy" | "family" | "notifications" | "help">("main");
  const [selectedLang, setSelectedLang] = useState(() => LANGUAGES.find(l => l.code === localStorage.getItem('aregoland_language')) || LANGUAGES.find(l => l.code === 'de')!);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const langLastKey = useRef("");
  const langLastIndex = useRef(-1);

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
  const [children, setChildren] = useState<ChildAccount[]>(() => loadChildren());
  const [showAddChild, setShowAddChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [childFsk, setChildFsk] = useState<6 | 12>(6);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [editingChild, setEditingChild] = useState<string | null>(null);
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
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const availableTabs = useMemo(() => loadTabs(), []);
  const isChildAccount = useMemo(() => {
    try { const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}"); return id.accountType === "child"; }
    catch { return false; }
  }, []);
  const { t, i18n } = useTranslation();
  const identity = useMemo(() => loadIdentity(), []);

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
            {/* Section: General */}
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
                   {children.length > 0 && (
                     <span className="text-xs text-gray-500">{children.length}</span>
                   )}
                   <ChevronRight size={20} className="text-gray-500" />
                 </div>
               </button>
            </div>

            {/* Section: Support */}
            <div className="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-700/50">
               <button
                 onClick={() => setActiveSubmenu("help")}
                 className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-yellow-500/20 p-2 rounded-lg text-yellow-400">
                     <HelpCircle size={20} />
                   </div>
                   <span className="font-medium">{t('settings.helpSupport')}</span>
                 </div>
                 <ChevronRight size={20} className="text-gray-500" />
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
              <div className={`bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 ${isChildAccount ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${discoverable && !isChildAccount ? "bg-green-500/20 text-green-400" : "bg-gray-700/50 text-gray-500"}`}>
                      {discoverable && !isChildAccount ? <Eye size={18} /> : <EyeOff size={18} />}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{t('settings.publiclyDiscoverable')}</div>
                      <div className="text-xs text-gray-500">{t('settings.discoverableDesc')}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleDiscoverableToggle}
                    disabled={isChildAccount || directoryStatus === "loading"}
                    className={`relative w-12 h-6 rounded-full transition-colors ${isChildAccount ? "bg-gray-700 cursor-not-allowed" : discoverable ? "bg-green-600" : "bg-gray-600"}`}
                  >
                    <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${discoverable && !isChildAccount ? "translate-x-6" : "translate-x-0"}`} />
                  </button>
                </div>
                {isChildAccount && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-pink-400 bg-pink-500/10 border border-pink-500/20 rounded-lg p-2">
                    <Baby size={14} className="shrink-0" />
                    {t('settings.childNotDiscoverable')}
                  </div>
                )}
                {directoryStatus === "success" && (
                  <p className="mt-2 text-xs text-green-400">{discoverable ? t('settings.directoryRegister') : t('settings.directoryRemoved')}</p>
                )}
                {directoryStatus === "error" && (
                  <p className="mt-2 text-xs text-red-400">{t('common.error')}</p>
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

  // Help & Support Submenu
  if (activeSubmenu === "help") {
    const faqs = [
      { q: t('settings.faqAregoId'), a: t('settings.faqAregoIdA') },
      { q: t('settings.faqAddContact'), a: t('settings.faqAddContactA') },
      { q: t('settings.faqRecovery'), a: t('settings.faqRecoveryA') },
      { q: t('settings.faqE2E'), a: t('settings.faqE2EA') },
      { q: t('settings.faqDelete'), a: t('settings.faqDeleteA') },
    ];
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button onClick={() => setActiveSubmenu("main")} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-bold">{t('settings.helpSupport')}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">

            {/* FAQ */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.faq')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                {faqs.map((faq, i) => (
                  <div key={i} className="border-b border-gray-700/50 last:border-0">
                    <button
                      onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors text-left"
                    >
                      <span className="text-sm font-medium pr-4">{faq.q}</span>
                      {faqOpen === i ? <ChevronUp size={16} className="text-gray-500 shrink-0" /> : <ChevronDown size={16} className="text-gray-500 shrink-0" />}
                    </button>
                    <AnimatePresence>
                      {faqOpen === i && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <p className="px-4 pb-4 text-sm text-gray-400 leading-relaxed">{faq.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>

            {/* Links */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.links')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                <a href="https://aregoland.de" target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50">
                  <div className="flex items-center gap-3">
                    <ExternalLink size={16} className="text-blue-400" />
                    <span className="text-sm">{t('settings.aboutUs')}</span>
                  </div>
                  <span className="text-xs text-gray-500">aregoland.de</span>
                </a>
                <a href="mailto:feedback@aregoland.de?subject=Aregoland%20Feedback" className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors">
                  <div className="flex items-center gap-3">
                    <Mail size={16} className="text-yellow-400" />
                    <span className="text-sm">{t('settings.sendFeedback')}</span>
                  </div>
                  <span className="text-xs text-gray-500">feedback@aregoland.de</span>
                </a>
              </div>
            </div>

            {/* Version */}
            <div className="text-center space-y-1 pt-4">
              <p className="text-sm font-medium text-gray-400">Aregoland</p>
              <p className="text-xs text-gray-600">Version 1.0.0 (Build 2026.03)</p>
              <p className="text-xs text-gray-700">AGPL-3.0</p>
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
      const payload = createChildLinkPayload(identity);
      const url = await QRCode.toDataURL(payload, { width: 280, margin: 2, color: { dark: '#ffffff', light: '#00000000' } });
      setQrDataUrl(url);
      setShowAddChild(true);
    };

    const handleAddChild = () => {
      if (!childName.trim() || !identity) return;
      const child: ChildAccount = {
        aregoId: `AC-CHILD-${Date.now().toString(36).toUpperCase()}`,
        displayName: childName.trim(),
        parentId: identity.aregoId,
        fsk: childFsk,
        createdAt: new Date().toISOString(),
      };
      saveChild(child);
      setChildren(loadChildren());
      setChildName("");
      setChildFsk(6);
      setShowAddChild(false);
      setQrDataUrl(null);
    };

    const handleUpdateFsk = (aregoId: string, fsk: 6 | 12) => {
      const child = children.find(c => c.aregoId === aregoId);
      if (!child) return;
      saveChild({ ...child, fsk });
      setChildren(loadChildren());
      setEditingChild(null);
    };

    const handleRemoveChild = (aregoId: string) => {
      removeChild(aregoId);
      setChildren(loadChildren());
    };

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
              <Baby className="text-pink-400 shrink-0" size={22} />
              <p className="text-sm text-pink-200/80 leading-relaxed">
                {t('settings.familyInfo')}
              </p>
            </div>

            {/* Linked Children */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.linkedChildren')}</h3>
              {children.length === 0 ? (
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6 text-center">
                  <Baby size={40} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{t('settings.noChildren')}</p>
                </div>
              ) : (
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                  {children.map((child) => (
                    <div key={child.aregoId} className="p-4 border-b border-gray-700/50 last:border-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                            {child.displayName[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">{child.displayName}</div>
                            <div className="text-xs text-gray-500">{child.aregoId}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingChild(editingChild === child.aregoId ? null : child.aregoId)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${
                            child.fsk === 6 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          FSK {child.fsk}
                        </button>
                      </div>

                      {/* FSK Edit + Remove */}
                      <AnimatePresence>
                        {editingChild === child.aregoId && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-3">
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{t('settings.fskLevel')}</p>
                              <div className="grid grid-cols-2 gap-2">
                                {FSK_LEVELS.map((level) => (
                                  <button
                                    key={level.value}
                                    disabled={!level.enabled}
                                    onClick={() => level.enabled && handleUpdateFsk(child.aregoId, level.value as 6 | 12)}
                                    className={`relative flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                      !level.enabled
                                        ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                                        : child.fsk === level.value
                                          ? `${level.bg} ${level.color} ring-2 ring-current`
                                          : `bg-gray-800 ${level.color} hover:bg-gray-700`
                                    }`}
                                  >
                                    {!level.enabled && <Lock size={12} />}
                                    {level.label}
                                    {!level.enabled && (
                                      <span className="absolute -bottom-0.5 text-[9px] text-gray-600 font-normal">{t('settings.fskIdRequired')}</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                              <button
                                onClick={() => handleRemoveChild(child.aregoId)}
                                className="w-full text-red-400 text-sm font-medium py-2 hover:bg-red-500/10 rounded-xl transition-colors"
                              >
                                {t('settings.removeChild')}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Child Button / QR Flow */}
            {!showAddChild ? (
              <button
                onClick={handleGenerateQR}
                className="w-full bg-pink-600 hover:bg-pink-500 text-white font-semibold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-pink-600/20 active:scale-98"
              >
                <UserPlus size={20} />
                {t('settings.addChild')}
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-5 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{t('settings.addChild')}</h3>
                  <button onClick={() => { setShowAddChild(false); setQrDataUrl(null); }} className="p-1 text-gray-500 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                {/* Child Name Input */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-400">{t('settings.childName')}</label>
                  <input
                    type="text"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder={t('settings.childNamePlaceholder')}
                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                  />
                </div>

                {/* FSK Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-400">{t('settings.fskLevel')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FSK_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        disabled={!level.enabled}
                        onClick={() => level.enabled && setChildFsk(level.value as 6 | 12)}
                        className={`relative flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          !level.enabled
                            ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                            : childFsk === level.value
                              ? `${level.bg} ${level.color} ring-2 ring-current`
                              : `bg-gray-800 ${level.color} hover:bg-gray-700`
                        }`}
                      >
                        {!level.enabled && <Lock size={12} />}
                        {level.label}
                        {!level.enabled && (
                          <span className="absolute -bottom-0.5 text-[9px] text-gray-600 font-normal">{t('settings.fskIdRequired')}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* QR Code */}
                {qrDataUrl && (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="bg-gray-900 p-4 rounded-2xl">
                      <img src={qrDataUrl} alt="Child Link QR" className="w-56 h-56" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <QrCode size={14} />
                      <span>{t('settings.qrTTL')}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleAddChild}
                  disabled={!childName.trim()}
                  className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  {t('settings.confirmAddChild')}
                </button>
              </motion.div>
            )}

          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
