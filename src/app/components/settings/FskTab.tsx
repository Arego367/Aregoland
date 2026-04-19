import { useState, useMemo } from "react";
import { ArrowLeft, ChevronDown, Shield, ShieldCheck, Check, Lock } from "lucide-react";
import { loadIdentity } from "@/app/auth/identity";
import { loadFsk, saveFsk, type FskStatus } from "@/app/auth/fsk";
import { registerEudiHash, getEudiHash } from "@/app/auth/identity";

interface FskTabProps {
  onBack: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onFskUpdated?: () => void;
}

export default function FskTab({ onBack, t, onFskUpdated }: FskTabProps) {
  const [fskSelectedLevel, setFskSelectedLevel] = useState<6 | 12 | 16 | 18 | null>(null);
  const [fskDropdownOpen, setFskDropdownOpen] = useState(false);

  const identity = useMemo(() => loadIdentity(), []);
  const isChildAccount = useMemo(() => {
    try { const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}"); return id.ist_kind === true || id.accountType === "child"; }
    catch { return false; }
  }, []);

  const fsk = loadFsk();
  const currentEudiHash = getEudiHash();
  const fskLevels = [
    { level: 6 as const, dot: "bg-green-400", key: "fskOverview6", descKey: "fskOverview6Desc" },
    { level: 12 as const, dot: "bg-yellow-400", key: "fskOverview12", descKey: "fskOverview12Desc" },
    { level: 16 as const, dot: "bg-orange-400", key: "fskOverview16", descKey: "fskOverview16Desc" },
    { level: 18 as const, dot: "bg-red-400", key: "fskOverview18", descKey: "fskOverview18Desc" },
  ];

  // Force re-render after EUDI verification
  const [, setRenderKey] = useState(0);

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button
          onClick={onBack}
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
            <button
              onClick={() => setFskDropdownOpen(!fskDropdownOpen)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-700/40 hover:bg-gray-700/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${fsk?.verified ? 'bg-green-400' : 'bg-orange-400'}`} />
                <p className={`font-medium ${fsk?.verified ? 'text-green-400' : 'text-orange-400'}`}>
                  FSK {fsk?.level ?? 6} — {fsk?.verified ? t('settings.fskVerified') : t('settings.fskNotVerified')}
                </p>
              </div>
              <ChevronDown size={18} className={`text-gray-400 transition-transform ${fskDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {fskDropdownOpen && <div className="mt-3 space-y-1">
              {fskLevels.map(({ level, dot, key, descKey }) => (
                <div
                  key={level}
                  className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                    fsk?.level === level ? 'bg-white/5 ring-1 ring-white/10' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-200">{t(`settings.${key}`)}</p>
                    <p className="text-xs text-gray-500">{t(`settings.${descKey}`)}</p>
                  </div>
                </div>
              ))}
            </div>}
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

          {/* EUDI Verifizierung */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="font-medium">{t('settings.fskEudiVerifyTitle')}</p>
                <p className="text-xs text-gray-500">{t('settings.fskEudiVerifyDesc')}</p>
              </div>
            </div>

            {currentEudiHash && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3">
                <Check size={16} className="text-green-400 shrink-0" />
                <div>
                  <p className="text-xs text-green-400 font-medium">{t('settings.fskEudiHashActive')}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{currentEudiHash}</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <input
                id="eudi-hash-input"
                type="text"
                defaultValue={currentEudiHash ?? ""}
                placeholder={t('settings.fskEudiHashPlaceholder')}
                className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
              />

              <div>
                <p className="text-xs text-gray-500 mb-2">{t('settings.fskEudiSelectLevel')}</p>
                <div className="grid grid-cols-4 gap-2">
                  {([6, 12, 16, 18] as const).map((stufe) => {
                    const selected = fskSelectedLevel ?? fsk?.level ?? 6;
                    const isActive = selected === stufe;
                    return (
                      <button
                        key={stufe}
                        onClick={() => setFskSelectedLevel(stufe)}
                        className={`py-3 rounded-xl font-medium text-sm transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                            : 'bg-gray-700/60 text-gray-300 hover:bg-gray-600/60'
                        }`}
                      >
                        FSK {stufe}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => {
                  const hashInput = document.getElementById('eudi-hash-input') as HTMLInputElement;
                  const hash = hashInput?.value?.trim();
                  if (!hash) return;
                  const level = (fskSelectedLevel ?? fsk?.level ?? 6) as 6 | 12 | 16 | 18;
                  registerEudiHash(hash);
                  const updated: FskStatus = {
                    level,
                    verified: true,
                    verifiedAt: new Date().toISOString(),
                    method: 'eudi',
                    eudiHash: hash,
                  };
                  saveFsk(updated);
                  onFskUpdated?.();
                  const el = document.createElement('div');
                  el.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm font-medium';
                  el.textContent = t('settings.fskEudiVerifySuccess', { level });
                  document.body.appendChild(el);
                  setTimeout(() => el.remove(), 3000);
                  setRenderKey(k => k + 1);
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck size={18} />
                {t('settings.fskEudiVerifyBtn')}
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              {t('settings.fskEudiVerifyHint')}
            </p>
          </div>

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

        </div>
      </div>
    </div>
  );
}
