import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Moon, ChevronDown, Check, Eye, Globe, LayoutGrid, MessageCircle, Calendar, Users, HeartHandshake, FileText, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { loadContacts } from "@/app/auth/contacts";
import { getLiveKitNodeUrl, setLiveKitNodeUrl } from "@/app/lib/call-manager";

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

interface AppSettingsTabProps {
  onBack: () => void;
}

export default function AppSettingsTab({ onBack }: AppSettingsTabProps) {
  const { t, i18n } = useTranslation();
  const [selectedLang, setSelectedLang] = useState(() => LANGUAGES.find(l => l.code === localStorage.getItem('aregoland_language')) || LANGUAGES.find(l => l.code === 'de')!);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const langLastKey = useRef("");
  const langLastIndex = useRef(-1);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('aregoland_dark_mode') !== 'false');
  const [livekitNodeUrl, setLivekitNodeUrlState] = useState(() => getLiveKitNodeUrl() ?? '');
  const [showOnlineStatus, setShowOnlineStatus] = useState(() => localStorage.getItem("aregoland_hide_online") === "false");
  const [startScreen, setStartScreen] = useState("dashboard");
  const [startDropdownOpen, setStartDropdownOpen] = useState(false);
  const startDropdownRef = useRef<HTMLDivElement>(null);
  const startLastKey = useRef("");
  const startLastIndex = useRef(-1);

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

  useEffect(() => {
    if (langDropdownOpen) {
      langLastKey.current = "";
      langLastIndex.current = -1;
      setTimeout(() => langDropdownRef.current?.focus(), 50);
    }
  }, [langDropdownOpen]);

  useEffect(() => {
    if (startDropdownOpen) {
      startLastKey.current = "";
      startLastIndex.current = -1;
      setTimeout(() => startDropdownRef.current?.focus(), 50);
    }
  }, [startDropdownOpen]);

  useEffect(() => {
    const savedStartScreen = localStorage.getItem("aregoland_start_screen");
    if (savedStartScreen) {
      const mapped = savedStartScreen === "community" ? "spaces" : savedStartScreen;
      if (mapped !== savedStartScreen) localStorage.setItem("aregoland_start_screen", mapped);
      setStartScreen(mapped);
    }
  }, []);

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

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">{t('settings.appSettings')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6 max-w-lg mx-auto">

          {/* Start Screen Selector */}
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
            <p className="text-xs text-gray-500 px-2">{t('settings.startScreenDesc')}</p>
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
                  const ws = (window as any).__aregoWs;
                  if (ws && ws.readyState === 1) {
                    const contacts = loadContacts();
                    ws.send(JSON.stringify({
                      type: 'update_presence',
                      hideOnlineStatus: !next,
                      watchIds: contacts.map((c: any) => c.aregoId),
                    }));
                  }
                }}
                className={`relative w-12 h-6 rounded-full transition-colors ${showOnlineStatus ? "bg-green-600" : "bg-gray-600"}`}
              >
                <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${showOnlineStatus ? "translate-x-6" : "translate-x-0"}`}></div>
              </button>
            </div>
          </div>

          {/* LiveKit Node-URL */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.livekitNode')}</h3>
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-purple-500/20 p-2 rounded-lg text-purple-400">
                  <Globe size={20} />
                </div>
                <div className="flex-1">
                  <span className="font-medium">{t('settings.livekitNodeUrl')}</span>
                  <div className="text-xs text-gray-500">{t('settings.livekitNodeDesc')}</div>
                </div>
              </div>
              <input
                type="url"
                value={livekitNodeUrl}
                onChange={(e) => setLivekitNodeUrlState(e.target.value)}
                onBlur={() => setLiveKitNodeUrl(livekitNodeUrl.trim() || null)}
                placeholder="wss://livekit.example.com"
                className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700/50 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          {/* Language Selector */}
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
