import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, ArrowRight, Globe, Check, QrCode, ScanLine, History, Key, ShieldAlert, ChevronLeft } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onShowQRCode: () => void;
  onScanQRCode: () => void;
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

export default function WelcomeScreen({ onGetStarted, onShowQRCode, onScanQRCode }: WelcomeScreenProps) {
  const [selectedLang, setSelectedLang] = useState(LANGUAGES.find(l => l.code === "de") || LANGUAGES[9]);
  const [view, setView] = useState<"welcome" | "restore">("welcome");

  return (
    <div className="relative w-full h-screen bg-gray-900 text-white overflow-hidden flex flex-col items-center justify-center font-sans">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1585905208683-e47c3b3d2bc8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMHNvY2lhbCUyMGNvbm5lY3Rpb24lMjBjb21tdW5pY2F0aW9uJTIwbWluaW1hbGlzdHxlbnwxfHx8fDE3Njk2ODkzODN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/80 via-gray-900/80 to-gray-950/95" />
      </div>

      {/* Language Selector (Only show in welcome view) */}
      {view === "welcome" && (
        <div className="absolute top-6 right-6 z-20">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                <Globe size={16} className="text-gray-300" />
                <span>{selectedLang.name}</span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content 
                className="min-w-[180px] max-h-[300px] overflow-y-auto bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-2xl p-1.5 border border-gray-700 text-white data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade z-50 mr-6 no-scrollbar"
                sideOffset={8}
                align="end"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-800/95 backdrop-blur-xl z-10">
                  Sprache wählen
                </DropdownMenu.Label>
                
                {LANGUAGES.map((lang) => (
                  <DropdownMenu.Item 
                    key={lang.code}
                    onClick={() => setSelectedLang(lang)}
                    className="group flex items-center justify-between px-3 py-2 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{lang.name}</span>
                      <span className="text-[10px] text-gray-500 group-hover:text-blue-200">{lang.label}</span>
                    </div>
                    {selectedLang.code === lang.code && <Check size={14} className="text-blue-400 group-hover:text-white" />}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}

      {/* Content */}
      <AnimatePresence mode="wait">
        {view === "welcome" ? (
          <motion.div
            key="welcome"
            exit={{ opacity: 0, scale: 0.95 }}
            className="z-10 flex flex-col items-center px-6 text-center max-w-md w-full"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, duration: 0.8 }}
              className="bg-blue-600 p-5 rounded-3xl mb-8 shadow-2xl shadow-blue-500/20"
            >
              <MessageCircle size={56} className="text-white fill-white/20" />
            </motion.div>

            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-5xl font-extrabold mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-gray-400"
            >
              Aregoland
            </motion.h1>

            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-gray-300 text-lg mb-12 leading-relaxed"
            >
              Die neue Art der Kommunikation.<br/>Schnell. Sicher. Grenzenlos.
            </motion.p>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="w-full space-y-3"
            >
              <button 
                onClick={onGetStarted}
                className="w-full group bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-blue-600/25 active:scale-98"
              >
                <span className="text-lg">Loslegen</span>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView("restore")}
                className="w-full group bg-white/10 hover:bg-white/15 text-white font-semibold py-3 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/5 backdrop-blur-md active:scale-98"
              >
                <History size={18} className="text-blue-300" />
                <span>Wiederherstellen</span>
              </button>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                    onClick={onShowQRCode}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all backdrop-blur-md border border-white/5"
                >
                    <QrCode size={20} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-400">Mein Code</span>
                </button>
                <button 
                    onClick={onScanQRCode}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all backdrop-blur-md border border-white/5"
                >
                    <ScanLine size={20} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-400">Scannen</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="restore"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="z-10 flex flex-col h-full w-full max-w-md pt-8 pb-8 px-6"
          >
            {/* Restore Header */}
            <div className="flex items-center gap-4 mb-6">
              <button 
                onClick={() => setView("welcome")}
                className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
              >
                <ChevronLeft size={28} />
              </button>
              <h2 className="text-2xl font-bold text-white">Konto wiederherstellen</h2>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
              {/* Info Card */}
              <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700/50 rounded-2xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                    <History size={24} className="text-blue-400" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Nutzer können ihr Konto mit einem persönlichen <strong className="text-white">Wiederherstellungs‑QR‑Code</strong> oder <strong className="text-white">Wiederherstellungs‑Schlüssel</strong> wiederherstellen.
                    </p>
                    <ul className="text-sm text-gray-400 space-y-2 list-disc pl-4 marker:text-blue-500">
                      <li>Der Wiederherstellungs‑QR‑Code enthält verschlüsselte Identität, Rollen und Einstellungen.</li>
                      <li>Chatverläufe und gemeinsame Kalenderdaten werden automatisch von anderen Mitgliedern nachgeladen.</li>
                      <li>Private Termine und persönliche Einstellungen werden aus dem Wiederherstellungs‑QR geladen.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Warning Card */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex gap-3">
                <ShieldAlert size={24} className="text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-200/80 leading-relaxed">
                  Bewahre deinen Wiederherstellungs‑QR‑Code sicher auf. Er ist der einzige Weg, dein Konto nach Geräteverlust wiederherzustellen. Nach jeder Identitäts‑ oder Space‑Änderung wird ein neuer QR‑Code benötigt.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-3">
              <button 
                onClick={onScanQRCode} // Assuming reuse of scan handler
                className="w-full group bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 active:scale-98"
              >
                <ScanLine size={20} />
                <span>QR-Code scannen</span>
              </button>

              <button 
                onClick={() => alert("Schlüssel Eingabe...")}
                className="w-full group bg-gray-800 hover:bg-gray-700 text-white font-medium py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 border border-gray-700 active:scale-98"
              >
                <Key size={20} className="text-gray-400 group-hover:text-white transition-colors" />
                <span>Schlüssel eingeben</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Footer / Legal - Only on Welcome */}
      {view === "welcome" && (
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ delay: 1, duration: 0.8 }}
           className="absolute bottom-8 z-10 text-gray-500 text-xs font-medium"
        >
          © 2026 Aregoland Inc.
        </motion.div>
      )}
    </div>
  );
}
