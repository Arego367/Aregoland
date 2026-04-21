import { useState } from "react";
import { ArrowLeft, Lock, Check, CreditCard, HardDrive } from "lucide-react";
import { loadSubscription, getEffectiveStatus, setAutoRenew, activatePlan, formatDateDE, daysUntil, PLANS, getActiveStorageTier, loadStorageQuota, activateStorageTier, hasAccess, STORAGE_TIERS, type StorageTier } from "@/app/auth/subscription";

interface SubscriptionTabProps {
  onBack: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  subscriptionLocked?: boolean;
  onSubscriptionUnlocked?: () => void;
}

export default function SubscriptionTab({ onBack, t, subscriptionLocked, onSubscriptionUnlocked }: SubscriptionTabProps) {
  const [voucherCode, setVoucherCode] = useState("");
  const [subRefresh, setSubRefresh] = useState(0);
  const [showStoragePicker, setShowStoragePicker] = useState(false);

  const sub = loadSubscription();
  const status = sub ? getEffectiveStatus(sub) : null;
  const isLocked = subscriptionLocked;
  const planLabels: Record<string, string> = {
    monthly: t('settings.subPlan1m'),
    quarterly: t('settings.subPlan3m'),
    biannual: t('settings.subPlan6m'),
    yearly: t('settings.subPlan12m'),
  };

  const activeTier = getActiveStorageTier();
  const quota = loadStorageQuota();
  const hasAbo = sub ? hasAccess(sub) : false;

  // Storage breakdown
  const baseGb = 1; // Every subscription includes 1 GB base storage
  const extraGb = activeTier.gb;
  const totalGb = status === "active" ? baseGb + extraGb : extraGb;
  const usedBytes = quota?.usedBytes ?? 0;
  const totalBytes = totalGb * 1024 * 1024 * 1024;
  const usagePercent = totalBytes > 0 ? Math.min((usedBytes / totalBytes) * 100, 100) : 0;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Force re-read on subRefresh change
  void subRefresh;

  const handleStorageSelect = (tier: StorageTier) => {
    const result = activateStorageTier(tier.id);
    if (result) {
      setShowStoragePicker(false);
      setSubRefresh(v => v + 1);
    }
  };

  // Compute next billing date: same as expiresAt if autoRenew is on
  const nextBilling = sub?.autoRenew && sub?.expiresAt ? formatDateDE(sub.expiresAt) : null;

  // Compute storage renewal date (approximation: activatedAt + 30 days)
  const storageRenewalDate = quota?.activatedAt
    ? (() => {
        const d = new Date(quota.activatedAt);
        d.setMonth(d.getMonth() + 1);
        return formatDateDE(d.toISOString());
      })()
    : null;

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        {!isLocked && (
          <button
            onClick={onBack}
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

          {/* ── Aktueller Plan (erweitert) ── */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-4">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t('settings.subCurrentPlan')}</p>

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
              <>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div>
                    <p className="text-green-400 font-medium">{t('settings.subPlanActive')}</p>
                    <p className="text-xs text-gray-400">
                      {sub.planType ? planLabels[sub.planType] : ''}
                    </p>
                  </div>
                </div>

                {/* Detail rows */}
                <div className="space-y-2 text-sm">
                  {sub.expiresAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">{t('settings.subValidUntil')}</span>
                      <span className="text-white font-medium">{formatDateDE(sub.expiresAt)}</span>
                    </div>
                  )}
                  {nextBilling && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">{t('settings.subNextBilling')}</span>
                      <span className="text-white font-medium">{nextBilling}</span>
                    </div>
                  )}

                  {/* Storage breakdown */}
                  <div className="h-px bg-gray-700/50 my-1" />
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('settings.subStorageBreakdown')}</span>
                    <span className="text-white font-medium">
                      {baseGb} GB {t('settings.subStorageBase')}
                      {extraGb > 0 && <> + {extraGb} GB {t('settings.subStorageExtra')}</>}
                      {' = '}{totalGb} GB {t('settings.subStorageTotal')}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      {t('settings.subStorageUsage')}: {formatBytes(usedBytes)} / {totalGb} GB
                    </p>
                  </div>
                </div>
              </>
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

          {/* Verfuegbare Plaene */}
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
                        onClick={() => { activatePlan(plan.type); setSubRefresh(v => v + 1); if (isLocked && onSubscriptionUnlocked) onSubscriptionUnlocked(); }}
                        className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {t('settings.subSelectPlan')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 text-center">{t('settings.subPlanCloudHint')}</p>
            </div>
          )}

          {/* ── Zusätzlicher Speicher ── */}
          {status === "active" && sub && (
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-purple-400" />
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t('settings.subExtraStorageSection')}</p>
              </div>

              {activeTier.gb === 0 ? (
                <p className="text-sm text-gray-400">{t('settings.subExtraStorageNone')}</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('settings.subExtraStorageBooked')}</span>
                    <span className="text-purple-300 font-medium">{activeTier.label}</span>
                  </div>
                  {storageRenewalDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">{t('settings.subExtraStorageRenewal')}</span>
                      <span className="text-white font-medium">{storageRenewalDate}</span>
                    </div>
                  )}
                </div>
              )}

              {hasAbo && (
                <>
                  <button
                    onClick={() => setShowStoragePicker(!showStoragePicker)}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-4 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <HardDrive size={14} />
                    {activeTier.gb === 0 ? t('settings.extraStorageActivate') : t('settings.extraStorageChange')}
                  </button>

                  {showStoragePicker && (
                    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden divide-y divide-gray-700/50">
                      {STORAGE_TIERS.map(tier => (
                        <button
                          key={tier.id}
                          onClick={() => handleStorageSelect(tier)}
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
          )}

          {/* ── Auto-Verlängerung (unified toggle) ── */}
          {status === "active" && sub && (
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('settings.subAutoRenewAll')}</p>
                  <p className="text-xs text-gray-500">{t('settings.subAutoRenewAllDesc')}</p>
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
