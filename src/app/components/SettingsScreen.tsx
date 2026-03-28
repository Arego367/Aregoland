import { useState, useEffect } from "react";
import { ArrowLeft, Moon, Bell, Shield, ChevronRight, Smartphone, HelpCircle, LogOut, LayoutGrid, MessageCircle, Calendar, CreditCard, Users, Check } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "motion/react";

interface SettingsScreenProps {
  onBack: () => void;
}

const LANGUAGES = [
  { code: "bg", name: "Български", label: "Bulgarian" },
  { code: "hr", name: "Hrvatski", label: "Croatian" },
  { code: "cs", name: "Čeština", label: "Czech" },
  { code: "da", name: "Dansk", label: "Danish" },
  { code: "nl", name: "Nederlands", label: "Dutch" },
  { code: "en", name: "English", label: "English" },
  { code: "et", name: "Eesti", label: "Estonian" },
  { code: "fi", name: "Suomi", label: "Finnish" },
  { code: "fr", name: "Français", label: "French" },
  { code: "de", name: "Deutsch", label: "German" },
  { code: "el", name: "Ελληνικά", label: "Greek" },
  { code: "hu", name: "Magyar", label: "Hungarian" },
  { code: "ga", name: "Gaeilge", label: "Irish" },
  { code: "it", name: "Italiano", label: "Italian" },
  { code: "lv", name: "Latviešu", label: "Latvian" },
  { code: "lt", name: "Lietuvių", label: "Lithuanian" },
  { code: "mt", name: "Malti", label: "Maltese" },
  { code: "pl", name: "Polski", label: "Polish" },
  { code: "pt", name: "Português", label: "Portuguese" },
  { code: "ro", name: "Română", label: "Romanian" },
  { code: "sk", name: "Slovenčina", label: "Slovak" },
  { code: "sl", name: "Slovenščina", label: "Slovenian" },
  { code: "es", name: "Español", label: "Spanish" },
  { code: "sv", name: "Svenska", label: "Swedish" },
];

const START_SCREENS = [
  { id: "dashboard", label: "Dashboard (Standard)", icon: LayoutGrid },
  { id: "chatList", label: "Chats", icon: MessageCircle },
  { id: "calendar", label: "Kalender", icon: Calendar },
  { id: "pay", label: "Pay", icon: CreditCard },
  { id: "community", label: "Spaces", icon: LayoutGrid },
];

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<"main" | "app" | "privacy">("main");
  const [selectedLang, setSelectedLang] = useState(LANGUAGES.find(l => l.code === "de") || LANGUAGES[9]);
  const [darkMode, setDarkMode] = useState(true);
  const [startScreen, setStartScreen] = useState("dashboard");
  const [profileVisibility, setProfileVisibility] = useState<"public" | "contacts" | "family" | "private">("contacts");

  // Load saved settings on mount
  useEffect(() => {
    const savedStartScreen = localStorage.getItem("aregoland_start_screen");
    if (savedStartScreen) {
      setStartScreen(savedStartScreen);
    }
  }, []);

  const handleStartScreenChange = (screenId: string) => {
    setStartScreen(screenId);
    localStorage.setItem("aregoland_start_screen", screenId);
  };

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
          <h1 className="text-xl font-bold">Einstellungen</h1>
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
                   <span className="font-medium">App Einstellungen</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="text-xs text-gray-500">Sprache, Startseite</span>
                   <ChevronRight size={20} className="text-gray-500" />
                 </div>
               </button>

               <button className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0">
                 <div className="flex items-center gap-3">
                   <div className="bg-purple-500/20 p-2 rounded-lg text-purple-400">
                     <Bell size={20} />
                   </div>
                   <span className="font-medium">Benachrichtigungen</span>
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
                   <span className="font-medium">Datenschutz & Sicherheit</span>
                 </div>
                 <ChevronRight size={20} className="text-gray-500" />
               </button>
            </div>

            {/* Section: Support */}
            <div className="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-700/50">
               <button className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0">
                 <div className="flex items-center gap-3">
                   <div className="bg-yellow-500/20 p-2 rounded-lg text-yellow-400">
                     <HelpCircle size={20} />
                   </div>
                   <span className="font-medium">Hilfe & Support</span>
                 </div>
                 <ChevronRight size={20} className="text-gray-500" />
               </button>
            </div>

            {/* Logout */}
            <button className="w-full flex items-center justify-center gap-2 p-4 mt-8 text-red-400 font-medium hover:bg-red-500/10 rounded-2xl transition-colors">
              <LogOut size={20} />
              Abmelden
            </button>
            
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
          <h1 className="text-xl font-bold">App Einstellungen</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">
            
            {/* Start Screen Selector */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Startbildschirm</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                 {START_SCREENS.map((screen) => (
                   <button
                     key={screen.id}
                     onClick={() => handleStartScreenChange(screen.id)}
                     className={`w-full flex items-center justify-between p-4 transition-colors border-b border-gray-700/50 last:border-0 ${
                       startScreen === screen.id ? "bg-blue-900/20 hover:bg-blue-900/30" : "hover:bg-gray-800"
                     }`}
                   >
                     <div className="flex items-center gap-3">
                       <div className={`p-2 rounded-lg ${startScreen === screen.id ? "bg-blue-500/20 text-blue-400" : "bg-gray-700/50 text-gray-400"}`}>
                         <screen.icon size={18} />
                       </div>
                       <span className={`font-medium ${startScreen === screen.id ? "text-blue-400" : "text-white"}`}>
                         {screen.label}
                       </span>
                     </div>
                     {startScreen === screen.id && (
                       <div className="bg-blue-500 rounded-full p-0.5">
                         <Check size={12} className="text-white" />
                       </div>
                     )}
                   </button>
                 ))}
              </div>
              <p className="text-xs text-gray-500 px-2">
                  Legt fest, welche Ansicht beim Starten der App zuerst angezeigt wird.
              </p>
            </div>

            {/* Theme Toggle */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Darstellung</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
                          <Moon size={20} />
                      </div>
                      <span className="font-medium">Dunkelmodus</span>
                  </div>
                  <button 
                      onClick={() => setDarkMode(!darkMode)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${darkMode ? "bg-blue-600" : "bg-gray-600"}`}
                  >
                      <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${darkMode ? "translate-x-6" : "translate-x-0"}`}></div>
                  </button>
              </div>
            </div>

            {/* Language Selector */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Sprache</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                  <div className="max-h-[300px] overflow-y-auto">
                      {LANGUAGES.map((lang) => (
                          <button
                              key={lang.code}
                              onClick={() => setSelectedLang(lang)}
                              className={`w-full flex items-center justify-between p-4 transition-colors border-b border-gray-700/50 last:border-0 ${
                                  selectedLang.code === lang.code ? "bg-blue-900/20 hover:bg-blue-900/30" : "hover:bg-gray-800"
                              }`}
                          >
                              <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 uppercase">
                                      {lang.code}
                                  </div>
                                  <div className="text-left">
                                      <div className={`font-medium ${selectedLang.code === lang.code ? "text-blue-400" : "text-white"}`}>
                                          {lang.name}
                                      </div>
                                      <div className="text-xs text-gray-500">{lang.label}</div>
                                  </div>
                              </div>
                              {selectedLang.code === lang.code && (
                                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                              )}
                          </button>
                      ))}
                  </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Privacy Settings Submenu
  if (activeSubmenu === "privacy") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button 
            onClick={() => setActiveSubmenu("main")}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">Datenschutz & Sicherheit</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">
            
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl flex gap-3">
              <Shield className="text-yellow-500 shrink-0" />
              <div className="text-sm text-yellow-200">
                <p className="font-bold mb-1">Wichtig:</p>
                Deine Daten werden nur lokal auf deinem Gerät gespeichert. Aregoland hat keinen Zugriff auf deine Nachrichten oder Kontakte.
              </div>
            </div>

            {/* Profile Visibility */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Profil-Sichtbarkeit</h3>
              <p className="text-xs text-gray-400 px-2 mb-2">
                Wer kann deine Profilinformationen (Name, Bild) sehen?
              </p>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                {[
                  { id: "public", label: "Öffentlich", desc: "Jeder kann dein Profil sehen" },
                  { id: "contacts", label: "Meine Kontakte", desc: "Nur gespeicherte Kontakte" },
                  { id: "family", label: "Nur Familie", desc: "Nur Kontakte der Kategorie Familie" },
                  { id: "private", label: "Niemand", desc: "Profilinfos werden nicht geteilt" },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setProfileVisibility(option.id as any)}
                    className={`w-full flex items-center justify-between p-4 transition-colors border-b border-gray-700/50 last:border-0 ${
                      profileVisibility === option.id ? "bg-blue-900/20 hover:bg-blue-900/30" : "hover:bg-gray-800"
                    }`}
                  >
                    <div className="text-left">
                      <div className={`font-medium ${profileVisibility === option.id ? "text-blue-400" : "text-white"}`}>
                        {option.label}
                      </div>
                      <div className="text-xs text-gray-500">{option.desc}</div>
                    </div>
                    {profileVisibility === option.id && (
                      <div className="bg-blue-500 rounded-full p-0.5">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback (should not happen due to activeSubmenu check above, but safe to return null or Main)
  return null;
}
