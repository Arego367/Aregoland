import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, ArrowRight, UserPlus, History, Key, ShieldAlert, ChevronLeft, Camera, ScanLine, Loader2, ChevronDown } from "lucide-react";
import { ImageWithFallback } from "@/app/components/ImageWithFallback";
import { useState, useRef, useEffect, useCallback } from "react";
import { importFromRecoveryPayload, decodeChildLinkPayload, createChildIdentity } from "@/app/auth/identity";
import { Html5Qrcode } from "html5-qrcode";
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: "de", label: "DE", flag: "\uD83C\uDDE9\uD83C\uDDEA", name: "Deutsch" },
  { code: "en", label: "EN", flag: "\uD83C\uDDEC\uD83C\uDDE7", name: "English" },
  { code: "lt", label: "LT", flag: "\uD83C\uDDF1\uD83C\uDDF9", name: "Lietuvi\u0173" },
];

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onShowQRCode: () => void;
  onScanQRCode: () => void;
}

export default function WelcomeScreen({ onGetStarted, onShowQRCode, onScanQRCode }: WelcomeScreenProps) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<"welcome" | "restore" | "restoreScan" | "restoreKey" | "child">("welcome");
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);
  const [childCreating, setChildCreating] = useState(false);
  const [childScanActive, setChildScanActive] = useState(false);
  const childScannerRef = useRef<Html5Qrcode | null>(null);

  const stopChildScanner = useCallback(() => {
    if (childScannerRef.current) {
      childScannerRef.current.stop().catch(() => {});
      childScannerRef.current.clear();
      childScannerRef.current = null;
    }
    setChildScanActive(false);
  }, []);

  const startChildScanner = useCallback(async () => {
    setChildError(null);
    setChildScanActive(true);
    try {
      const cameras = await Promise.race([
        Html5Qrcode.getCameras(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      if (!cameras.length) { setChildError(t('settings.fskParentNoCamera')); setChildScanActive(false); return; }

      const scanner = new Html5Qrcode("child-scan-region");
      childScannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decoded) => {
          const link = decodeChildLinkPayload(decoded.trim());
          if (!link) { setChildError(t('welcome.invalidParentKey')); return; }
          scanner.stop().catch(() => {});
          scanner.clear();
          childScannerRef.current = null;
          setChildScanActive(false);
          setChildCreating(true);
          try {
            await createChildIdentity(link.parentName, link.parentId, 6);
            onGetStarted();
          } catch {
            setChildError(t('welcome.childCreateError'));
          } finally {
            setChildCreating(false);
          }
        },
        () => {}
      );
    } catch {
      setChildError(t('settings.fskParentCameraError'));
      setChildScanActive(false);
    }
  }, [t, onGetStarted]);

  const handleRecoverWithKey = async () => {
    if (!recoveryKey.trim() || recovering) return;
    setRecoveryError(null);
    setRecovering(true);
    try {
      const identity = await importFromRecoveryPayload(recoveryKey.trim());
      if (identity) {
        onGetStarted();
      } else {
        setRecoveryError(t('welcome.invalidKey'));
      }
    } catch {
      setRecoveryError("Ungültiger Schlüssel. Bitte prüfe die Eingabe.");
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-gray-900 text-white overflow-hidden flex flex-col items-center justify-center font-sans">
      {/* Language Selector — top right */}
      <div ref={langRef} className="absolute top-4 right-4 z-30">
        <button
          onClick={() => setLangOpen(!langOpen)}
          className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-white/20 transition-colors"
        >
          <span>{currentLang.flag}</span>
          <span>{currentLang.label}</span>
          <ChevronDown size={14} className={`transition-transform ${langOpen ? "rotate-180" : ""}`} />
        </button>
        {langOpen && (
          <div className="absolute right-0 mt-2 bg-gray-800/95 backdrop-blur-md border border-gray-700 rounded-xl overflow-hidden shadow-2xl min-w-[160px]">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  i18n.changeLanguage(lang.code);
                  localStorage.setItem('aregoland_language', lang.code);
                  setLangOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  currentLang.code === lang.code ? "bg-blue-600/20 text-blue-400" : "hover:bg-gray-700/50 text-white"
                }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span className="font-medium">{lang.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1585905208683-e47c3b3d2bc8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMHNvY2lhbCUyMGNvbm5lY3Rpb24lMjBjb21tdW5pY2F0aW9uJTIwbWluaW1hbGlzdHxlbnwxfHx8fDE3Njk2ODkzODN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/80 via-gray-900/80 to-gray-950/95" />
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">

        {/* ── Welcome ──────────────────────────────────────────────── */}
        {view === "welcome" && (
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
              <span dangerouslySetInnerHTML={{ __html: t('welcome.tagline') }} />
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
                <span className="text-lg">{t('welcome.getStarted')}</span>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => setView("restore")}
                  className="flex-1 group bg-white/10 hover:bg-white/15 text-white font-semibold py-3 px-3 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/5 backdrop-blur-md active:scale-98"
                >
                  <History size={18} className="text-blue-300" />
                  <span className="text-sm">{t('welcome.restore')}</span>
                </button>

                <button
                  onClick={() => setView("child")}
                  className="flex-1 group bg-white/10 hover:bg-white/15 text-white font-semibold py-3 px-3 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/5 backdrop-blur-md active:scale-98"
                >
                  <UserPlus size={18} className="text-gray-300" />
                  <span className="text-sm">{t('welcome.addChild')}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── Restore — Methodenwahl ───────────────────────────────── */}
        {view === "restore" && (
          <motion.div
            key="restore"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="z-10 flex flex-col h-full w-full max-w-md pt-8 pb-8 px-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => setView("welcome")}
                className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
              >
                <ChevronLeft size={28} />
              </button>
              <h2 className="text-2xl font-bold text-white">{t('welcome.restoreAccount')}</h2>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
              {/* Info Card */}
              <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700/50 rounded-2xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                    <History size={24} className="text-blue-400" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('welcome.restoreInfo') }} />
                    <ul className="text-sm text-gray-400 space-y-2 list-disc pl-4 marker:text-blue-500">
                      <li>{t('welcome.restoreBullet1')}</li>
                      <li>{t('welcome.restoreBullet2')}</li>
                      <li>{t('welcome.restoreBullet3')}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Warning Card */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex gap-3">
                <ShieldAlert size={24} className="text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-200/80 leading-relaxed">
                  {t('welcome.restoreWarning')}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-3">
              <button
                onClick={() => setView("restoreScan")}
                className="w-full group bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 active:scale-98"
              >
                <ScanLine size={20} className="shrink-0" />
                <span>{t('welcome.scanQR')}</span>
              </button>

              <button
                onClick={() => { setRecoveryKey(""); setRecoveryError(null); setView("restoreKey"); }}
                className="w-full group bg-gray-800 hover:bg-gray-700 text-white font-medium py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 border border-gray-700 active:scale-98"
              >
                <Key size={20} className="text-gray-400 group-hover:text-white transition-colors" />
                <span>{t('welcome.enterKey')}</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Restore — QR-Code scannen ────────────────────────────── */}
        {view === "restoreScan" && (
          <motion.div
            key="restoreScan"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="z-10 flex flex-col h-full w-full max-w-md pt-8 pb-8 px-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => setView("restore")}
                className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
              >
                <ChevronLeft size={28} />
              </button>
              <h2 className="text-2xl font-bold text-white">{t('welcome.restoreAccount')}</h2>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="relative w-full aspect-[3/4] max-w-[280px] bg-black rounded-3xl overflow-hidden shadow-2xl border border-gray-700">
                {/* Camera Placeholder */}
                <div className="absolute inset-0 bg-gray-800 flex flex-col items-center justify-center text-gray-500 gap-4">
                  <div className="bg-gray-700/50 p-6 rounded-full">
                    <Camera size={48} className="text-gray-400" />
                  </div>
                  <p className="text-sm px-6 text-center">{t('welcome.cameraRequired')}</p>
                  <button className="text-blue-400 font-medium text-sm hover:underline">{t('welcome.allowAccess')}</button>
                </div>

                {/* Scan Frame Overlay */}
                <div className="absolute inset-0 border-[32px] border-black/50 z-10 pointer-events-none" />
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                  <div className="w-44 h-44 border-2 border-white/50 rounded-xl relative">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1 rounded-br-lg" />
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-[scan_2s_ease-in-out_infinite]" />
                  </div>
                </div>
              </div>

              <p className="text-gray-400 text-center text-sm mt-6 max-w-xs leading-relaxed">
                {t('welcome.scanRecoveryQR')}
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Restore — Schlüssel eingeben ─────────────────────────── */}
        {view === "restoreKey" && (
          <motion.div
            key="restoreKey"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="z-10 flex flex-col h-full w-full max-w-md pt-8 pb-8 px-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => setView("restore")}
                className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
              >
                <ChevronLeft size={28} />
              </button>
              <h2 className="text-2xl font-bold text-white">{t('welcome.restoreAccount')}</h2>
            </div>

            <div className="flex-1 flex flex-col">
              <p className="text-sm text-gray-400 mb-4 leading-relaxed">
                {t('welcome.enterRecoveryKey')}
              </p>

              <textarea
                value={recoveryKey}
                onChange={(e) => { setRecoveryKey(e.target.value); setRecoveryError(null); }}
                placeholder={t('welcome.recoveryKeyPlaceholder')}
                rows={6}
                autoFocus
                className="w-full px-4 py-3 rounded-2xl bg-gray-800/80 backdrop-blur-md border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
              />

              {recoveryError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 text-sm text-red-400 font-medium"
                >
                  {recoveryError}
                </motion.p>
              )}
            </div>

            <button
              onClick={handleRecoverWithKey}
              disabled={!recoveryKey.trim() || recovering}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 active:scale-98"
            >
              {recovering ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span>{t('welcome.recovering')}</span>
                </>
              ) : (
                <>
                  <Key size={20} />
                  <span>{t('welcome.restoreAccount')}</span>
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* ── Kind hinzufügen ─────────────────────────────────────── */}
        {view === "child" && (
          <motion.div
            key="child"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="z-10 flex flex-col h-full w-full max-w-md pt-8 pb-8 px-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => { setView("welcome"); setChildError(null); stopChildScanner(); }}
                className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
              >
                <ChevronLeft size={28} />
              </button>
              <h2 className="text-2xl font-bold text-white">{t('welcome.setupChildProfile')}</h2>
            </div>

            <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar space-y-5">
              {/* Info */}
              <div className="bg-pink-500/10 border border-pink-500/20 rounded-2xl p-4 flex gap-3">
                <UserPlus size={22} className="text-pink-400 shrink-0 mt-0.5" />
                <p className="text-sm text-pink-200/80 leading-relaxed">
                  {t('welcome.childInfo')}
                </p>
              </div>

              {/* QR Scanner */}
              {childScanActive && (
                <div className="space-y-3">
                  <div id="child-scan-region" className="w-full rounded-xl overflow-hidden" />
                  <button
                    onClick={stopChildScanner}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2.5 rounded-xl transition-colors text-sm"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}

              <p className="text-gray-500 text-center text-xs">{t('welcome.scanParentQR')}</p>

              {childError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-red-400 font-medium text-center">
                  {childError}
                </motion.p>
              )}
            </div>

            {!childScanActive && (
              <button
                onClick={startChildScanner}
                disabled={childCreating}
                className="w-full mt-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-pink-600/25 active:scale-98"
              >
                {childCreating ? (
                  <><Loader2 size={20} className="animate-spin" /><span>{t('common.loading')}</span></>
                ) : (
                  <><Camera size={20} /><span>{t('welcome.scanQRButton')}</span></>
                )}
              </button>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>

      {/* Footer / Legal - Only on Welcome */}
      {view === "welcome" && (
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ delay: 1, duration: 0.8 }}
           className="absolute bottom-8 z-10 text-gray-500 text-xs font-medium"
        >
          &copy; 2026 Aregoland Inc.
        </motion.div>
      )}
    </div>
  );
}
