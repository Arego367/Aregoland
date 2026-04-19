import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell, Shield, ChevronRight, Smartphone, Trash2, Baby, Lock, X, HardDrive, CreditCard, Download, Upload, Check, Cloud, Loader2, RefreshCw, AlertTriangle, FileText, ArrowLeft as ArrowLeftIcon } from "lucide-react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { deleteIdentity, loadIdentity } from "@/app/auth/identity";
import { deleteContacts } from "@/app/auth/contacts";
import { loadFsk } from "@/app/auth/fsk";
import { downloadGdprExport, readGdprFile, importGdprExport } from "@/app/lib/gdpr-export";
import { getBackupPreview, getBackupScenario, createEncryptedBackup, downloadBackup, readBackupFile, decryptBackup, restoreBackup, uploadCloudBackup, getCloudBackupStatus, getChatBackupOptIn, setChatBackupOptIn, type BackupFileInfo, type CloudBackupStatus } from "@/app/lib/backup";

import AppSettingsTab from "./settings/AppSettingsTab";
import NotificationsTab from "./settings/NotificationsTab";
import PrivacyTab from "./settings/PrivacyTab";
import SubscriptionTab from "./settings/SubscriptionTab";
import FskTab from "./settings/FskTab";
import StorageTab from "./settings/StorageTab";
import FamilyTab from "./settings/FamilyTab";

declare const __GIT_HASH__: string;
declare const __BUILD_DATE__: string;

interface SettingsScreenProps {
  onBack: () => void;
  onResetAccount?: () => void;
  subscriptionLocked?: boolean;
  onSubscriptionUnlocked?: () => void;
  onFskUpdated?: () => void;
}

export default function SettingsScreen({ onBack, onResetAccount, subscriptionLocked, onSubscriptionUnlocked, onFskUpdated }: SettingsScreenProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<"main" | "app" | "privacy" | "storage" | "subscription" | "family" | "notifications" | "fsk" | "backup">(subscriptionLocked ? "subscription" : "main");
  const { t } = useTranslation();

  // Deep-Link: Toast oeffnet FSK-Sektion
  useEffect(() => {
    const handler = () => setActiveSubmenu("fsk");
    window.addEventListener("arego-open-fsk", handler);
    return () => window.removeEventListener("arego-open-fsk", handler);
  }, []);

  const goMain = () => setActiveSubmenu("main");

  // ── Extracted tab components ──
  if (activeSubmenu === "app") return <AppSettingsTab onBack={goMain} />;
  if (activeSubmenu === "notifications") return <NotificationsTab onBack={goMain} t={t} />;
  if (activeSubmenu === "privacy") return <PrivacyTab onBack={goMain} t={t} />;
  if (activeSubmenu === "backup") return <BackupSubmenu onBack={goMain} t={t} />;
  if (activeSubmenu === "subscription") return <SubscriptionTab onBack={goMain} t={t} subscriptionLocked={subscriptionLocked} onSubscriptionUnlocked={onSubscriptionUnlocked} />;
  if (activeSubmenu === "fsk") return <FskTab onBack={goMain} t={t} onFskUpdated={onFskUpdated} />;
  if (activeSubmenu === "storage") return <StorageTab onBack={goMain} t={t} />;
  if (activeSubmenu === "family") return <FamilyTab onBack={goMain} t={t} onFskUpdated={onFskUpdated} />;

  // ── Main Settings Menu ──
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
          {/* Gruppe 1: Konto */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-2">{t('settings.groupAccount')}</h3>
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
            </div>
          </div>

          {/* Gruppe 2: Privatsphaere & Sicherheit */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-2">{t('settings.groupPrivacy')}</h3>
            <div className="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-700/50">
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
                onClick={() => setActiveSubmenu("backup")}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400">
                    <HardDrive size={20} />
                  </div>
                  <span className="font-medium">{t('settings.backup')}</span>
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
          </div>

          {/* Gruppe 3: App */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-2">{t('settings.groupApp')}</h3>
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
          </div>

          {/* Gruppe 4: Familie */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-2">{t('settings.groupFamily')}</h3>
            <div className="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-700/50">
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
                <ChevronRight size={20} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* Gefahrenzone */}
          <div>
            <h3 className="text-xs font-bold text-red-500/70 uppercase tracking-wider px-2 mb-2">{t('settings.groupDangerZone')}</h3>
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
          </div>

          <p className="text-center text-xs text-gray-600 mt-4">Version: {__GIT_HASH__} — {__BUILD_DATE__}</p>
        </div>
      </div>
    </div>
  );
}

// ── Backup Submenu ────────────────────────────────────────────────────────────

function BackupSubmenu({ onBack, t }: { onBack: () => void; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const [mode, setMode] = useState<'menu' | 'export' | 'import' | 'gdpr-import'>('menu');
  const [includeChats, setIncludeChats] = useState(() => getChatBackupOptIn());
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [importFile, setImportFile] = useState<BackupFileInfo | null>(null);
  const [importKey, setImportKey] = useState('');
  const [importAregoId, setImportAregoId] = useState('');
  const [importError, setImportError] = useState('');
  const [decrypting, setDecrypting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cloud-Backup State (ARE-307)
  const [cloudStatus, setCloudStatus] = useState<CloudBackupStatus | null>(null);
  const [cloudUploading, setCloudUploading] = useState(false);
  const [cloudSuccess, setCloudSuccess] = useState(false);
  const [cloudError, setCloudError] = useState('');

  const preview = useMemo(() => getBackupPreview(), []);
  const scenario = useMemo(() => getBackupScenario(), []);

  // Cloud-Status laden
  useEffect(() => {
    getCloudBackupStatus().then(setCloudStatus).catch(() => {});
  }, []);

  const handleCreate = async () => {
    setPasswordError('');
    if (password.length < 6) { setPasswordError(t('settings.backupPasswordTooShort')); return; }
    if (password !== passwordConfirm) { setPasswordError(t('settings.backupPasswordMismatch')); return; }
    setCreating(true);
    try {
      const data = await createEncryptedBackup(password, includeChats);
      downloadBackup(data);
      setCreated(true);
    } catch {
      setPasswordError(t('settings.backupCreateFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleCloudUpload = async () => {
    if (password.length < 6) { setPasswordError(t('settings.backupPasswordTooShort')); return; }
    if (password !== passwordConfirm) { setPasswordError(t('settings.backupPasswordMismatch')); return; }
    setCloudUploading(true);
    setCloudError('');
    try {
      const data = await createEncryptedBackup(password, includeChats);
      const result = await uploadCloudBackup(data);
      if (result.ok) {
        setCloudSuccess(true);
        getCloudBackupStatus().then(setCloudStatus).catch(() => {});
      } else {
        setCloudError(result.error ?? t('settings.backupCloudUploadFailed'));
      }
    } catch {
      setCloudError(t('settings.backupCloudUploadFailed'));
    } finally {
      setCloudUploading(false);
    }
  };

  const handleChatOptInToggle = () => {
    const next = !includeChats;
    setIncludeChats(next);
    setChatBackupOptIn(next);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const info = await readBackupFile(file);
      setImportFile(info);
      setImportError('');
    } catch {
      setImportError(t('settings.backupImportInvalidFile'));
    }
    e.target.value = '';
  };

  const handleDecrypt = async () => {
    if (!importFile || !importKey.trim() || !importAregoId.trim()) return;
    setDecrypting(true);
    setImportError('');
    try {
      const data = await decryptBackup(importFile, importKey.trim(), importAregoId.trim());
      if (!data) {
        setImportError(t('settings.backupImportFailed'));
        return;
      }
      const { restored } = restoreBackup(data);
      setImportSuccess(true);
      setTimeout(() => window.location.reload(), 2000);
    } catch {
      setImportError(t('settings.backupImportFailed'));
    } finally {
      setDecrypting(false);
    }
  };

  // ── Export-Ansicht ──
  if (mode === 'export') {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button onClick={() => { setMode('menu'); setCreated(false); }} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-bold">{t('settings.backupExport')}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">
          {/* Vorschau */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.backupPreview')}</h3>
            <p className="text-xs text-gray-400 px-2">{t('settings.backupPreviewDesc')}</p>
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden divide-y divide-gray-700/50">
              {preview.categories.filter(c => c.key !== 'chats').map(cat => (
                <div key={cat.key} className="flex items-center justify-between p-3">
                  <span className="text-sm text-gray-300">{t(`settings.backupCat_${cat.key}`)}</span>
                  <span className="text-xs text-gray-500">{cat.count} {t('settings.backupItems')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Opt-in (ARE-308) */}
          {preview.categories.some(c => c.key === 'chats') && (
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400">
                    <Download size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('settings.backupChatOptIn')}</p>
                    <p className="text-xs text-gray-500">{t('settings.backupChatOptInDesc')}</p>
                  </div>
                </div>
                <button
                  onClick={handleChatOptInToggle}
                  className={`relative w-12 h-6 rounded-full transition-colors ${includeChats ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${includeChats ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {includeChats && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  {t('settings.backupChatOptInWarning')}
                </p>
              )}
            </div>
          )}

          {/* Verschluesselung */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.backupEncryption')}</h3>
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <p className="text-xs text-gray-400">{t('settings.backupEncryptionDesc')}</p>
              <p className="text-xs text-gray-500 bg-gray-700/30 rounded-lg px-3 py-2 font-mono">
                {t('settings.backupScenario')}: {scenario}
              </p>
              <div className="space-y-2">
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
                  placeholder={t('settings.backupPasswordPlaceholder')}
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={e => { setPasswordConfirm(e.target.value); setPasswordError(''); }}
                  placeholder={t('settings.backupPasswordConfirm')}
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
            </div>
          </div>

          {/* Erstellen */}
          {created ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center space-y-2">
              <Check size={24} className="text-green-400 mx-auto" />
              <p className="text-sm font-medium text-green-300">{t('settings.backupCreated')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleCreate}
                disabled={creating || !password}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {creating ? (
                  <><Loader2 size={18} className="animate-spin" /> {t('settings.backupCreating')}</>
                ) : (
                  <><Download size={18} /> {t('settings.backupCreateBtn')}</>
                )}
              </button>

              {/* Cloud-Upload (ARE-307) */}
              <button
                onClick={handleCloudUpload}
                disabled={cloudUploading || !password}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {cloudUploading ? (
                  <><Loader2 size={18} className="animate-spin" /> {t('settings.backupCloudUploading')}</>
                ) : (
                  <><Cloud size={18} /> {t('settings.backupCloudUpload')}</>
                )}
              </button>

              {cloudSuccess && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-400">{t('settings.backupCloudUploadSuccess')}</p>
                </div>
              )}
              {cloudError && <p className="text-xs text-red-400 text-center">{cloudError}</p>}
            </div>
          )}
          </div>
        </div>
      </div>
    );
  }

  // ── Import-Ansicht ──
  if (mode === 'import') {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button onClick={() => { setMode('menu'); setImportFile(null); setImportError(''); setImportSuccess(false); }} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-bold">{t('settings.backupImportTitle')}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">
          <p className="text-sm text-gray-400">{t('settings.backupImportDesc')}</p>

          {importSuccess ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center space-y-2">
              <Check size={24} className="text-green-400 mx-auto" />
              <p className="text-sm font-medium text-green-300">{t('settings.backupImportSuccess')}</p>
              <p className="text-xs text-green-400/70">{t('settings.backupImportReloadNeeded')}</p>
            </div>
          ) : (
            <>
              <input ref={fileInputRef} type="file" accept=".arego" onChange={handleFileSelect} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-gray-800/50 border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-2xl p-6 text-center transition-colors"
              >
                <Download size={24} className="text-gray-400 mx-auto mb-2 rotate-180" />
                <span className="text-sm text-gray-400">{t('settings.backupImportSelectFile')}</span>
              </button>

              {importFile && (
                <div className="space-y-3">
                  <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-1">
                    <div className="flex items-center gap-2">
                      <Lock size={16} className="text-gray-400" />
                      <span className="text-sm font-medium">
                        {importFile.encryptionMethod === 'eudi' ? t('settings.backupEncryptionEudi') : t('settings.backupEncryptionPassword')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">{t('settings.backupImportEnterAregoId')}</label>
                    <input
                      type="text"
                      value={importAregoId}
                      onChange={e => setImportAregoId(e.target.value)}
                      placeholder="AC-XXXX-XXXXXXXX"
                      className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-2.5 text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">
                      {importFile.encryptionMethod === 'eudi' ? t('settings.backupImportEnterEudi') : t('settings.backupImportEnterPassword')}
                    </label>
                    <input
                      type={importFile.encryptionMethod === 'eudi' ? 'text' : 'password'}
                      value={importKey}
                      onChange={e => { setImportKey(e.target.value); setImportError(''); }}
                      className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3">
                    <p className="text-xs text-amber-400">{t('settings.backupImportRestoreWarning')}</p>
                  </div>

                  {importError && <p className="text-xs text-red-400 text-center">{importError}</p>}

                  <button
                    onClick={handleDecrypt}
                    disabled={decrypting || !importKey.trim() || !importAregoId.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {decrypting ? (
                      <><span className="animate-spin">&#9696;</span> {t('settings.backupImportDecrypting')}</>
                    ) : (
                      <><Lock size={18} /> {t('settings.backupImportDecrypt')}</>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    );
  }

  // ── GDPR-Import-Ansicht (ARE-308) ──
  if (mode === 'gdpr-import') {
    return <GdprImportView onBack={() => setMode('menu')} t={t} />;
  }

  // ── Menu-Ansicht ──
  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold">{t('settings.backup')}</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6 max-w-lg mx-auto">
        <p className="text-sm text-gray-400">{t('settings.backupDesc')}</p>

        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden divide-y divide-gray-700/50">
          <button
            onClick={() => setMode('export')}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Download size={18} className="text-blue-400" />
              <div className="text-left">
                <span className="text-sm font-medium block">{t('settings.backupExport')}</span>
                <span className="text-xs text-gray-500">{t('settings.backupExportDesc')}</span>
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-500" />
          </button>

          <button
            onClick={() => setMode('import')}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Upload size={18} className="text-green-400" />
              <div className="text-left">
                <span className="text-sm font-medium block">{t('settings.backupImportTitle')}</span>
                <span className="text-xs text-gray-500">{t('settings.backupImportDesc')}</span>
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-500" />
          </button>

          {/* DSGVO Re-Import (ARE-308) */}
          <button
            onClick={() => setMode('gdpr-import')}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <RefreshCw size={18} className="text-purple-400" />
              <div className="text-left">
                <span className="text-sm font-medium block">{t('settings.gdprReImport')}</span>
                <span className="text-xs text-gray-500">{t('settings.gdprReImportDesc')}</span>
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>

        {/* DSGVO Export */}
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
          <button
            onClick={() => { downloadGdprExport(); }}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-blue-400" />
              <div className="text-left">
                <span className="text-sm font-medium block">{t('settings.gdprExportBtn')}</span>
                <span className="text-xs text-gray-500">{t('settings.gdprExportDesc')}</span>
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Cloud-Status (ARE-307) */}
        {cloudStatus && (
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Cloud size={16} className="text-purple-400" />
              <span className="text-sm font-medium">{t('settings.backupCloudStatus')}</span>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <p>{t('settings.backupCloudLastBackup')}: {cloudStatus.lastBackupAt ? new Date(cloudStatus.lastBackupAt).toLocaleString('de-DE') : t('settings.backupCloudNever')}</p>
              {cloudStatus.sizeBytes != null && (
                <p>{t('settings.backupCloudSize')}: {(cloudStatus.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── GDPR Import View ─────────────────────────────────────────────────────────

function GdprImportView({ onBack, t }: { onBack: () => void; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; restored: string[] } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError('');
    setImportResult(null);
    try {
      const data = await readGdprFile(file);
      const result = importGdprExport(data);
      setImportResult(result);
    } catch {
      setError(t('settings.gdprImportError'));
    } finally {
      setImporting(false);
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold">{t('settings.gdprReImport')}</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6 max-w-lg mx-auto">
        <p className="text-sm text-gray-400">{t('settings.gdprReImportDesc')}</p>

        {importResult ? (
          <div className={`${importResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} border rounded-2xl p-4 space-y-2`}>
            <div className="flex items-center gap-2">
              {importResult.success ? <Check size={18} className="text-green-400" /> : <X size={18} className="text-red-400" />}
              <span className="text-sm font-medium">{importResult.success ? t('settings.gdprImportSuccess') : t('settings.gdprImportError')}</span>
            </div>
            {importResult.restored.length > 0 && (
              <ul className="text-xs text-gray-400 space-y-1 pl-6">
                {importResult.restored.map(key => <li key={key}>{key}</li>)}
              </ul>
            )}
            <button onClick={onBack} className="w-full mt-2 bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-xl transition-colors text-sm">
              {t('common.back')}
            </button>
          </div>
        ) : (
          <>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full bg-gray-800/50 border-2 border-dashed border-gray-600 hover:border-purple-500 rounded-2xl p-6 text-center transition-colors"
            >
              {importing ? (
                <Loader2 size={24} className="text-purple-400 mx-auto mb-2 animate-spin" />
              ) : (
                <FileText size={24} className="text-gray-400 mx-auto mb-2" />
              )}
              <span className="text-sm text-gray-400">{t('settings.gdprImportSelectFile')}</span>
            </button>
          </>
        )}

        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
}
