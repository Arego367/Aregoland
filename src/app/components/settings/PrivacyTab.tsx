import { useState, useMemo } from "react";
import { ArrowLeft, Shield, Check, Eye, EyeOff, Users, MapPin, Phone, Link as LinkIcon, Ban, Clock, Baby, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { loadIdentity } from "@/app/auth/identity";
import { loadBlocked, unblockContact, loadContacts } from "@/app/auth/contacts";


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
    const profile = JSON.parse(localStorage.getItem("arego_profile") ?? "{}");
    const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}");
    const res = await fetch("/directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aregoId,
        displayName,
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        nickname: profile.nickname ?? "",
        publicKeyJwk: id.publicKeyJwk ?? null,
      }),
    });
    if (res.ok) localStorage.setItem("aregoland_directory_last_heartbeat", new Date().toISOString());
    return res.ok;
  } catch { return false; }
}
async function directoryRemove(aregoId: string): Promise<boolean> {
  try {
    const res = await fetch("/directory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aregoId }) });
    if (res.ok) localStorage.removeItem("aregoland_directory_last_heartbeat");
    return res.ok;
  } catch { return false; }
}

interface PrivacyTabProps {
  onBack: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function PrivacyTab({ onBack, t }: PrivacyTabProps) {
  const identity = useMemo(() => loadIdentity(), []);
  const isChildAccount = useMemo(() => {
    try { const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}"); return id.ist_kind === true || id.accountType === "child"; }
    catch { return false; }
  }, []);
  const availableTabs = useMemo(() => loadTabs(), []);

  const [discoverable, setDiscoverable] = useState(() => localStorage.getItem("aregoland_discoverable") === "true");
  const [directoryStatus, setDirectoryStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [privacyVis, setPrivacyVis] = useState<PrivacyVisibility>(loadPrivacyVisibility);
  const [catPickerKey, setCatPickerKey] = useState<keyof PrivacyVisibility | null>(null);
  const [privacyToast, setPrivacyToast] = useState(false);
  const [privacyToastMsg, setPrivacyToastMsg] = useState("");
  const [blockedList, setBlockedList] = useState<string[]>(() => loadBlocked());

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
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold">{t('settings.privacy')}</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6 max-w-lg mx-auto">

          {/* Info banner */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl flex gap-3">
            <Shield className="text-yellow-500 shrink-0" size={20} />
            <p className="text-sm text-yellow-200/80 leading-relaxed">{t('settings.privacyNote')}</p>
          </div>

          {/* Discoverable toggle */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.discoverability')}</h3>
            <div className={`bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3 ${isChildAccount ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg shrink-0 ${discoverable && !isChildAccount ? "bg-green-500/20 text-green-400" : "bg-gray-700/50 text-gray-500"}`}>
                    {discoverable && !isChildAccount ? <Eye size={18} /> : <EyeOff size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{t('settings.publiclyDiscoverable')}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{t('settings.discoverableShort')}</div>
                  </div>
                </div>
                <button
                  onClick={handleDiscoverableToggle}
                  disabled={isChildAccount || directoryStatus === "loading"}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${isChildAccount ? "bg-gray-700 cursor-not-allowed" : discoverable ? "bg-green-600" : "bg-gray-600"}`}
                >
                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${discoverable && !isChildAccount ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium">{t('settings.discoverableDataLabel')}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/15 text-blue-400">Arego-ID</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/15 text-purple-400">{t('settings.firstName')}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/15 text-purple-400">{t('settings.lastName')}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-cyan-500/15 text-cyan-400">{t('settings.nickname')}</span>
                </div>
                <p className="text-[9px] text-gray-600">{t('settings.discoverableOnlyIfSet')}</p>
              </div>

              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                <Clock size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-300/80 leading-relaxed">{t('settings.discoverableExpiry')}</p>
              </div>

              {isChildAccount && (
                <div className="flex items-center gap-2 text-xs text-pink-400 bg-pink-500/10 border border-pink-500/20 rounded-lg p-2">
                  <Baby size={14} className="shrink-0" />
                  {t('settings.childNotDiscoverable')}
                </div>
              )}
              {directoryStatus === "success" && (
                <p className="text-xs text-green-400">{discoverable ? t('settings.directoryRegister') : t('settings.directoryRemoved')}</p>
              )}
              {directoryStatus === "error" && (
                <p className="text-xs text-red-400">{t('common.error')}</p>
              )}
            </div>
          </div>

          {/* Profile Visibility */}
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
