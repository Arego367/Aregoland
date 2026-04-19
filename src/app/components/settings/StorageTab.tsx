import { useState, useMemo } from "react";
import { ArrowLeft, HardDrive } from "lucide-react";
import { loadSubscription, getActiveStorageTier, activateStorageTier, loadStorageQuota, hasAccess, STORAGE_TIERS, type StorageTier } from "@/app/auth/subscription";

function estimateStorageBytes(key: string): number {
  const v = localStorage.getItem(key);
  return v ? new Blob([v]).size : 0;
}

interface StorageTabProps {
  onBack: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function ExtraStorageSection({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  const [activeTier, setActiveTier] = useState<StorageTier>(() => getActiveStorageTier());
  const [showPicker, setShowPicker] = useState(false);
  const quota = loadStorageQuota();
  const sub = loadSubscription();
  const hasAbo = sub ? hasAccess(sub) : false;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleSelect = (tier: StorageTier) => {
    const result = activateStorageTier(tier.id);
    if (result) {
      setActiveTier(tier);
      setShowPicker(false);
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <HardDrive size={18} className="text-purple-400" />
        <div className="flex-1">
          <span className="text-sm font-medium block">{t('settings.extraStorage')}</span>
          <span className="text-xs text-gray-500">{t('settings.extraStorageDesc')}</span>
        </div>
      </div>

      {activeTier.gb === 0 ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{t('settings.extraStorageNone')}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">{t('settings.extraStorageTier')}</span>
            <span className="text-purple-300 font-medium">{activeTier.label}</span>
          </div>
          {quota && (
            <>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${Math.min((quota.usedBytes / (activeTier.gb * 1024 * 1024 * 1024)) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">
                {t('settings.extraStorageUsed', { used: formatBytes(quota.usedBytes), total: activeTier.label })}
              </p>
            </>
          )}
        </div>
      )}

      {!hasAbo && (
        <p className="text-xs text-amber-400">{t('settings.extraStorageAboRequired')}</p>
      )}

      {hasAbo && (
        <>
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-4 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <HardDrive size={14} />
            {activeTier.gb === 0 ? t('settings.extraStorageActivate') : t('settings.extraStorageChange')}
          </button>

          {showPicker && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden divide-y divide-gray-700/50">
              {STORAGE_TIERS.map(tier => (
                <button
                  key={tier.id}
                  onClick={() => handleSelect(tier)}
                  className={`w-full flex items-center justify-between p-3 hover:bg-gray-700/50 transition-colors ${tier.id === activeTier.id ? 'bg-purple-500/10' : ''}`}
                >
                  <span className="text-sm font-medium">{tier.label}</span>
                  <span className="text-xs text-gray-400">
                    {tier.priceMonthly === 0 ? t('settings.extraStorageFree') : t('settings.extraStoragePerMonth', { price: tier.priceMonthly })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LocalStorageSection({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  const storageItems = useMemo(() => [
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
  ], [t]);

  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const totalBytes = storageItems.reduce((sum, s) => sum + s.estimate(), 0) + estimateStorageBytes("aregoland_identity");

  return (
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
  );
}

export default function StorageTab({ onBack, t }: StorageTabProps) {
  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button
          onClick={onBack}
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

          {/* Lokaler Datenspeicher */}
          <LocalStorageSection t={t} />

          {/* Zusatz-Speicher für Fotos & Videos */}
          <ExtraStorageSection t={t} />

        </div>
      </div>
    </div>
  );
}
