import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, ArrowRight, UserPlus, History, ShieldAlert, ChevronLeft, Camera, Loader2, ChevronDown, ShieldCheck, Smartphone, HardDrive, Lock, Check, Cloud, Users } from "lucide-react";
import { ImageWithFallback } from "@/app/components/ImageWithFallback";
import { useState, useRef, useEffect, useCallback } from "react";
import { importFromRecoveryPayload, decodeChildLinkPayload, createChildIdentity, recoverByEudiHash } from "@/app/auth/identity";
import { readBackupFile, decryptBackup, restoreBackup, downloadAndRestoreCloudBackup, fetchOnlineContacts, getRestoredSpaces, type BackupFileInfo } from "@/app/lib/backup";
import { saveFsk, type FskStatus } from "@/app/auth/fsk";
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
  const [view, setView] = useState<"welcome" | "restore" | "child">("welcome");
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
  const [eudiHash, setEudiHash] = useState("");
  const [eudiError, setEudiError] = useState<string | null>(null);
  const [eudiRecovering, setEudiRecovering] = useState(false);
  const [eudiConflict, setEudiConflict] = useState<{ deviceA: string; deviceB: string } | null>(null);
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

  const childScanProcessed = useRef(false);

  const startChildScanner = useCallback(async () => {
    setChildError(null);
    setChildScanActive(true);
    childScanProcessed.current = false;

    await new Promise(r => setTimeout(r, 100));

    const el = document.getElementById("child-scan-region");
    if (!el) { setChildError(t('settings.fskParentCameraError')); setChildScanActive(false); return; }

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
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          if (childScanProcessed.current) return;

          const parentId = decodeChildLinkPayload(decoded.trim());
          if (!parentId) return;

          childScanProcessed.current = true;

          try { await scanner.stop(); } catch {}
          try { scanner.clear(); } catch {}
          childScannerRef.current = null;
          setChildScanActive(false);
          setChildCreating(true);
          try {
            await createChildIdentity("", parentId, 6);
            // FSK 6 verifiziert setzen — Kind ist durch Verwalter geschützt
            const fskUpdate: FskStatus = { level: 6, verified: true, verifiedAt: new Date().toISOString(), method: "parent" };
            saveFsk(fskUpdate);
            // Server benachrichtigen
            const childIdentity = JSON.parse(localStorage.getItem('aregoland_identity') ?? '{}');
            fetch('/child-link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ child_id: childIdentity.aregoId, parent_id: parentId }),
            }).catch(() => {});
            onGetStarted();
          } catch {
            setChildError(t('welcome.childCreateError'));
          } finally {
            setChildCreating(false);
          }
        },
        () => {}
      );
    } catch (e) {
      console.error("Scanner-Fehler:", e);
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

  const handleRecoverWithEudiHash = async () => {
    if (!eudiHash.trim() || eudiRecovering) return;
    setEudiError(null);
    setEudiConflict(null);
    setEudiRecovering(true);
    try {
      const result = await recoverByEudiHash(eudiHash.trim());
      if (result.found) {
        if (result.conflict) {
          setEudiConflict(result.conflict);
        } else {
          onGetStarted();
        }
      } else {
        setEudiError(t('welcome.eudiHashNotFound'));
      }
    } catch {
      setEudiError(t('welcome.eudiHashError'));
    } finally {
      setEudiRecovering(false);
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

        {/* ── Wiederherstellen — EUDI Hash ─────────────────────────── */}
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
                onClick={() => { setView("welcome"); setEudiError(null); setEudiConflict(null); }}
                className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
              >
                <ChevronLeft size={28} />
              </button>
              <h2 className="text-2xl font-bold text-white">{t('welcome.restoreAccount')}</h2>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-5">
              {/* Info Card */}
              <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700/50 rounded-2xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                    <ShieldCheck size={24} className="text-blue-400" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {t('welcome.eudiRestoreInfo')}
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {t('welcome.eudiRestoreHint')}
                    </p>
                  </div>
                </div>
              </div>

              {/* EUDI Hash Eingabe */}
              <div className="space-y-3">
                <input
                  type="text"
                  value={eudiHash}
                  onChange={(e) => { setEudiHash(e.target.value); setEudiError(null); }}
                  placeholder={t('welcome.eudiHashPlaceholder')}
                  autoFocus
                  className="w-full px-4 py-4 rounded-2xl bg-gray-800/80 backdrop-blur-md border border-gray-700 text-white placeholder-gray-500 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                />

                {eudiError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-400 font-medium"
                  >
                    {eudiError}
                  </motion.p>
                )}
              </div>

              {/* ── Cloud-Wiederherstellung (ARE-307) ── */}
              <CloudRestoreSection t={t} eudiHash={eudiHash} onRestored={onGetStarted} />

              {/* ── Backup-Datei Import ── */}
              <BackupFileImport t={t} onRestored={onGetStarted} />

              {/* Konflikt-Anzeige */}
              {eudiConflict && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex gap-3">
                    <ShieldAlert size={20} className="text-yellow-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-200/80">
                      {t('welcome.eudiConflictText')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => { setEudiConflict(null); onGetStarted(); }}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      <Smartphone size={16} />
                      {eudiConflict.deviceA}
                    </button>
                    <button
                      onClick={() => { setEudiConflict(null); onGetStarted(); }}
                      className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      <Smartphone size={16} />
                      {eudiConflict.deviceB}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Bestaetigen Button */}
            {!eudiConflict && (
              <button
                onClick={handleRecoverWithEudiHash}
                disabled={!eudiHash.trim() || eudiRecovering}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 active:scale-98"
              >
                {eudiRecovering ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>{t('welcome.recovering')}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={20} />
                    <span>{t('welcome.restoreAccount')}</span>
                  </>
                )}
              </button>
            )}
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

// ── Cloud-Wiederherstellung (ARE-307) ──────────────────────────────────────

function CloudRestoreSection({ t, eudiHash, onRestored }: { t: (k: string, o?: Record<string, unknown>) => string; eudiHash: string; onRestored: () => void }) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [onlineContacts, setOnlineContacts] = useState<{ id: string; displayName: string }[] | null>(null);
  const [restoredSpaces, setRestoredSpaces] = useState<{ id: string; name: string }[]>([]);
  const [showPostRestore, setShowPostRestore] = useState(false);

  const handleCloudRestore = async () => {
    if (!eudiHash.trim()) return;
    setRestoring(true);
    setError('');
    try {
      const result = await downloadAndRestoreCloudBackup(eudiHash.trim());
      if (!result.ok) {
        if (result.error === 'not_found') setError(t('welcome.cloudBackupNotFound'));
        else if (result.error === 'no_backup') setError(t('welcome.cloudBackupNone'));
        else if (result.error === 'decrypt_failed') setError(t('settings.backupImportFailed'));
        else setError(t('welcome.cloudBackupError'));
        return;
      }

      // Post-Restore: Online-Kontakte und Spaces laden
      const [contacts, spaces] = await Promise.all([
        result.aregoId ? fetchOnlineContacts(result.aregoId) : Promise.resolve([]),
        Promise.resolve(getRestoredSpaces()),
      ]);

      if (contacts.length > 0 || spaces.length > 0) {
        setOnlineContacts(contacts);
        setRestoredSpaces(spaces);
        setShowPostRestore(true);
      } else {
        onRestored();
      }
    } catch {
      setError(t('welcome.cloudBackupError'));
    } finally {
      setRestoring(false);
    }
  };

  if (showPostRestore) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Erfolg */}
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center space-y-1">
          <Check size={24} className="text-green-400 mx-auto" />
          <p className="text-sm font-medium text-green-300">{t('welcome.cloudBackupRestored')}</p>
        </div>

        {/* Online-Kontakte */}
        {onlineContacts && onlineContacts.length > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-cyan-400" />
              <span className="text-sm font-medium">{t('welcome.onlineContactsTitle', { count: onlineContacts.length })}</span>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {onlineContacts.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-gray-300">{c.displayName}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">{t('welcome.onlineContactsHint')}</p>
          </div>
        )}

        {/* Wiederhergestellte Spaces */}
        {restoredSpaces.length > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive size={16} className="text-purple-400" />
              <span className="text-sm font-medium">{t('welcome.restoredSpacesTitle', { count: restoredSpaces.length })}</span>
            </div>
            <div className="space-y-1.5">
              {restoredSpaces.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-green-400" />
                  <span className="text-gray-300">{s.name}</span>
                </div>
              ))}
              {restoredSpaces.length > 5 && (
                <p className="text-xs text-gray-500">+{restoredSpaces.length - 5} {t('welcome.moreSpaces')}</p>
              )}
            </div>
            <p className="text-xs text-gray-500">{t('welcome.restoredSpacesHint')}</p>
          </div>
        )}

        {/* Weiter-Button */}
        <button
          onClick={onRestored}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <ArrowRight size={18} />
          <span>{t('welcome.continueToApp')}</span>
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cloud-Backup Button */}
      <button
        onClick={handleCloudRestore}
        disabled={!eudiHash.trim() || restoring}
        className="w-full flex items-center gap-3 p-4 bg-cyan-500/10 backdrop-blur-md border border-cyan-500/30 rounded-2xl hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
      >
        <div className="p-2 bg-cyan-500/20 rounded-lg">
          <Cloud size={20} className="text-cyan-400" />
        </div>
        <div className="text-left flex-1">
          <span className="text-sm font-medium text-white block">{t('welcome.cloudBackupRestore')}</span>
          <span className="text-xs text-gray-500">{t('welcome.cloudBackupRestoreDesc')}</span>
        </div>
        {restoring && <Loader2 size={18} className="text-cyan-400 animate-spin" />}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Backup-Datei Import (inline in Restore-Ansicht) ───────────────────────

function BackupFileImport({ t, onRestored }: { t: (k: string, o?: Record<string, unknown>) => string; onRestored: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [file, setFile] = useState<BackupFileInfo | null>(null);
  const [importKey, setImportKey] = useState('');
  const [importAregoId, setImportAregoId] = useState('');
  const [error, setError] = useState('');
  const [decrypting, setDecrypting] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const info = readBackupFile(reader.result as ArrayBuffer);
      if (!info.valid) {
        setError(t('settings.backupImportInvalidFile'));
        setFile(null);
      } else {
        setFile(info);
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const handleDecrypt = async () => {
    if (!file || !importKey.trim() || !importAregoId.trim()) return;
    setDecrypting(true);
    setError('');
    try {
      const data = await decryptBackup(file, importKey.trim(), importAregoId.trim());
      if (!data) {
        setError(t('settings.backupImportFailed'));
        return;
      }
      restoreBackup(data);
      setSuccess(true);
      setTimeout(() => onRestored(), 1500);
    } catch {
      setError(t('settings.backupImportFailed'));
    } finally {
      setDecrypting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-xs text-gray-500 uppercase">{t('common.or') || 'oder'}</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      {/* Backup-Datei Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 bg-gray-800/50 backdrop-blur-md border border-gray-700/50 rounded-2xl hover:bg-gray-800 transition-colors"
      >
        <div className="p-2 bg-cyan-500/20 rounded-lg">
          <HardDrive size={20} className="text-cyan-400" />
        </div>
        <div className="text-left flex-1">
          <span className="text-sm font-medium text-white block">{t('settings.backupImport')}</span>
          <span className="text-xs text-gray-500">{t('settings.backupImportDesc')}</span>
        </div>
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 overflow-hidden">
          {success ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center space-y-1">
              <Check size={24} className="text-green-400 mx-auto" />
              <p className="text-sm font-medium text-green-300">{t('settings.backupImportSuccess')}</p>
            </div>
          ) : (
            <>
              <input ref={fileRef} type="file" accept=".arego" onChange={handleFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-600 hover:border-cyan-500 rounded-2xl p-4 text-center transition-colors"
              >
                <HardDrive size={20} className="text-gray-400 mx-auto mb-1" />
                <span className="text-sm text-gray-400">{t('settings.backupImportSelectFile')}</span>
              </button>

              {file && (
                <div className="space-y-3">
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3 flex items-center gap-2">
                    <Lock size={14} className="text-gray-400" />
                    <span className="text-xs text-gray-400">
                      {file.encryptionMethod === 'eudi' ? t('settings.backupEncryptionEudi') : t('settings.backupEncryptionPassword')}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={importAregoId}
                    onChange={e => setImportAregoId(e.target.value)}
                    placeholder="AC-XXXX-XXXXXXXX"
                    className="w-full px-4 py-3 rounded-xl bg-gray-800/80 border border-gray-700 text-white placeholder-gray-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type={file.encryptionMethod === 'eudi' ? 'text' : 'password'}
                    value={importKey}
                    onChange={e => { setImportKey(e.target.value); setError(''); }}
                    placeholder={file.encryptionMethod === 'eudi' ? 'EUDI Hash' : t('settings.backupPasswordPlaceholder')}
                    className="w-full px-4 py-3 rounded-xl bg-gray-800/80 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <button
                    onClick={handleDecrypt}
                    disabled={decrypting || !importKey.trim() || !importAregoId.trim()}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {decrypting ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                    <span>{decrypting ? t('settings.backupImportDecrypting') : t('settings.backupImportDecrypt')}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
