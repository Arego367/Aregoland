import { useState, useMemo, useRef } from "react";
import { ArrowLeft, Camera, Copy, Check, User, Info, Phone, Mail, MapPin, Link as LinkIcon, AlertTriangle, X, Plus, Trash2, Pencil, Home, Briefcase, Package, FileText, Smartphone, Printer } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from 'react-i18next';
import { loadIdentity } from "@/app/auth/identity";

const PROFILE_KEY = "arego_profile";

interface SocialLink {
  platform: string;
  username: string;
}

interface Address {
  label: string;
  street: string;
  houseNumber: string;
  zipCode: string;
  city: string;
  country: string;
}

interface ContactEntry {
  type: string;   // phone, mobile, email, fax, other
  label: string;  // Privat, Arbeit, Schule, etc.
  value: string;
}

interface ProfileData {
  firstName: string;
  lastName: string;
  nickname: string;
  status: string;
  socialLinks: SocialLink[];
  addresses: Address[];
  contactEntries: ContactEntry[];
  avatarBase64: string | null;
}

const CONTACT_TYPES = [
  { id: "phone", label: "Telefon", icon: Phone, inputType: "tel", placeholder: "+49 123 4567890" },
  { id: "mobile", label: "Handy", icon: Smartphone, inputType: "tel", placeholder: "+49 170 1234567" },
  { id: "email", label: "E-Mail", icon: Mail, inputType: "email", placeholder: "name@beispiel.de" },
  { id: "fax", label: "Fax", icon: Printer, inputType: "tel", placeholder: "+49 123 456789-0" },
  { id: "other", label: "Sonstiges", icon: LinkIcon, inputType: "text", placeholder: "" },
];

const CONTACT_LABELS = ["Privat", "Arbeit", "Schule", "Sonstiges"];

function getContactType(id: string) {
  return CONTACT_TYPES.find(t => t.id === id) ?? CONTACT_TYPES[CONTACT_TYPES.length - 1];
}

const ADDRESS_PRESETS = [
  { id: "home", label: "Zuhause", icon: Home },
  { id: "work", label: "Arbeit", icon: Briefcase },
  { id: "delivery", label: "Lieferadresse", icon: Package },
  { id: "billing", label: "Rechnungsadresse", icon: FileText },
  { id: "custom", label: "Eigenes Label", icon: Pencil },
];

const PLATFORMS: { id: string; label: string; prefix: string; icon: React.ReactNode }[] = [
  { id: "instagram", label: "Instagram", prefix: "@",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg> },
  { id: "tiktok", label: "TikTok", prefix: "@",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg> },
  { id: "youtube", label: "YouTube", prefix: "@",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg> },
  { id: "discord", label: "Discord", prefix: "",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a5 5 0 0 0-5-5 8.26 8.26 0 0 0-2 0 5 5 0 0 0-5 5c0 5 3 7.5 6 10 3-2.5 6-5 6-10z"/><circle cx="9.5" cy="10" r="1"/><circle cx="14.5" cy="10" r="1"/></svg> },
  { id: "twitch", label: "Twitch", prefix: "",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7"/></svg> },
  { id: "mastodon", label: "Mastodon", prefix: "@",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M8 12v-2a4 4 0 0 1 8 0v2c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2z"/></svg> },
  { id: "linkedin", label: "LinkedIn", prefix: "",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg> },
  { id: "twitter", label: "X / Twitter", prefix: "@",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l11.7 16H20L8.3 4z"/><path d="M4 20l6.5-8.5M14 4l6 8"/></svg> },
  { id: "snapchat", label: "Snapchat", prefix: "",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C9 2 7 4.5 7 7v2c-1.5.5-3 1-3 2 0 .8.7 1.2 1.5 1.5-.3 1.2-1.3 2.3-2.5 3 1.5 1 3 1.5 5 1.5h8c2 0 3.5-.5 5-1.5-1.2-.7-2.2-1.8-2.5-3 .8-.3 1.5-.7 1.5-1.5 0-1-1.5-1.5-3-2V7c0-2.5-2-5-5-5z"/></svg> },
  { id: "pinterest", label: "Pinterest", prefix: "",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 20.5c.6-2 1.4-4.2 2-5.5.4-.8.8-1.5 1.5-2s1.5-.7 2.5-.5c1.5.3 2 1.5 1.5 3-.3 1-.8 2-1.5 3l-2 3"/></svg> },
  { id: "telegram", label: "Telegram", prefix: "@",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg> },
  { id: "other", label: "Sonstiges", prefix: "",
    icon: <LinkIcon size={16} /> },
];

function getPlatform(id: string) {
  return PLATFORMS.find(p => p.id === id) ?? PLATFORMS[PLATFORMS.length - 1];
}

function defaultProfile(identity: { displayName: string } | null): ProfileData {
  const nameParts = (identity?.displayName ?? "").split(" ");
  return {
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" ") ?? "",
    nickname: "",
    status: "",
    socialLinks: [],
    addresses: [],
    contactEntries: [],
    avatarBase64: null,
  };
}

function loadProfile(identity: { displayName: string } | null): ProfileData {
  const defaults = defaultProfile(identity);
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const merged = { ...defaults, ...Object.fromEntries(
        Object.entries(saved).filter(([, v]) => v !== undefined)
      ) } as ProfileData;
      // Migrate old fixed social fields → socialLinks
      if (!Array.isArray(merged.socialLinks)) merged.socialLinks = [];
      const oldSocial = saved as { instagram?: string; tiktok?: string; otherSocial?: string };
      if (oldSocial.instagram && !merged.socialLinks.some(l => l.platform === "instagram")) {
        merged.socialLinks.push({ platform: "instagram", username: oldSocial.instagram as string });
      }
      if (oldSocial.tiktok && !merged.socialLinks.some(l => l.platform === "tiktok")) {
        merged.socialLinks.push({ platform: "tiktok", username: oldSocial.tiktok as string });
      }
      if (oldSocial.otherSocial && !merged.socialLinks.some(l => l.platform === "other")) {
        merged.socialLinks.push({ platform: "other", username: oldSocial.otherSocial as string });
      }
      // Migrate old flat address fields → addresses array
      if (!Array.isArray(merged.addresses)) merged.addresses = [];
      const oldAddr = saved as { street?: string; houseNumber?: string; zipCode?: string; city?: string; country?: string };
      if (oldAddr.street && merged.addresses.length === 0) {
        merged.addresses.push({
          label: "Zuhause",
          street: (oldAddr.street as string) ?? "",
          houseNumber: (oldAddr.houseNumber as string) ?? "",
          zipCode: (oldAddr.zipCode as string) ?? "",
          city: (oldAddr.city as string) ?? "",
          country: (oldAddr.country as string) ?? "Deutschland",
        });
      }
      // Migrate old flat phone/email → contactEntries
      if (!Array.isArray(merged.contactEntries)) merged.contactEntries = [];
      const oldContact = saved as { phone?: string; email?: string };
      if (oldContact.phone && merged.contactEntries.length === 0) {
        merged.contactEntries.push({ type: "mobile", label: "Privat", value: oldContact.phone as string });
      }
      if (oldContact.email && !merged.contactEntries.some(c => c.type === "email")) {
        merged.contactEntries.push({ type: "email", label: "Privat", value: oldContact.email as string });
      }
      return merged;
    }
  } catch { /* ignore */ }
  return defaults;
}

interface ProfileScreenProps {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: ProfileScreenProps) {
  const { t } = useTranslation();
  const identity = useMemo(() => loadIdentity(), []);
  const [uniqueId] = useState(identity?.aregoId ?? "");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData>(() => loadProfile(identity));
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressIdx, setEditingAddressIdx] = useState<number | null>(null);
  const [addressDraft, setAddressDraft] = useState<Address>({ label: "", street: "", houseNumber: "", zipCode: "", city: "", country: "Deutschland" });

  const update = (patch: Partial<ProfileData>) => setProfile(prev => ({ ...prev, ...patch }));

  const addSocialLink = (platformId: string) => {
    setProfile(prev => ({
      ...prev,
      socialLinks: [...prev.socialLinks, { platform: platformId, username: "" }],
    }));
    setShowPlatformPicker(false);
  };

  const updateSocialLink = (index: number, username: string) => {
    setProfile(prev => ({
      ...prev,
      socialLinks: prev.socialLinks.map((l, i) => i === index ? { ...l, username } : l),
    }));
  };

  const removeSocialLink = (index: number) => {
    setProfile(prev => ({
      ...prev,
      socialLinks: prev.socialLinks.filter((_, i) => i !== index),
    }));
  };

  const openAddAddress = (presetLabel?: string) => {
    setAddressDraft({ label: presetLabel ?? "", street: "", houseNumber: "", zipCode: "", city: "", country: "Deutschland" });
    setEditingAddressIdx(null);
    setShowAddressForm(true);
  };

  const openEditAddress = (idx: number) => {
    setAddressDraft({ ...profile.addresses[idx] });
    setEditingAddressIdx(idx);
    setShowAddressForm(true);
  };

  const saveAddress = () => {
    if (!addressDraft.label.trim()) return;
    setProfile(prev => {
      const addrs = [...prev.addresses];
      if (editingAddressIdx !== null) {
        addrs[editingAddressIdx] = addressDraft;
      } else {
        addrs.push(addressDraft);
      }
      return { ...prev, addresses: addrs };
    });
    setShowAddressForm(false);
    setEditingAddressIdx(null);
  };

  const removeAddress = (idx: number) => {
    setProfile(prev => ({
      ...prev,
      addresses: prev.addresses.filter((_, i) => i !== idx),
    }));
  };

  // Contact entries
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactIdx, setEditingContactIdx] = useState<number | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactEntry>({ type: "mobile", label: "Privat", value: "" });

  const openAddContact = () => {
    setContactDraft({ type: "mobile", label: "Privat", value: "" });
    setEditingContactIdx(null);
    setShowContactForm(true);
  };

  const openEditContact = (idx: number) => {
    setContactDraft({ ...profile.contactEntries[idx] });
    setEditingContactIdx(idx);
    setShowContactForm(true);
  };

  const saveContact = () => {
    if (!contactDraft.value.trim()) return;
    setProfile(prev => {
      const entries = [...prev.contactEntries];
      if (editingContactIdx !== null) {
        entries[editingContactIdx] = contactDraft;
      } else {
        entries.push(contactDraft);
      }
      return { ...prev, contactEntries: entries };
    });
    setShowContactForm(false);
    setEditingContactIdx(null);
  };

  const removeContact = (idx: number) => {
    setProfile(prev => ({
      ...prev,
      contactEntries: prev.contactEntries.filter((_, i) => i !== idx),
    }));
  };

  const initials = (
    (profile.firstName?.[0] ?? "").toUpperCase() +
    ((profile.lastName?.[0] ?? "") || (profile.firstName?.[1] ?? "")).toUpperCase()
  );

  const handleCopyId = () => {
    navigator.clipboard.writeText(uniqueId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    const clean: ProfileData = {
      firstName: profile.firstName ?? "",
      lastName: profile.lastName ?? "",
      nickname: profile.nickname ?? "",
      status: profile.status ?? "",
      socialLinks: (profile.socialLinks ?? []).filter(l => l.username.trim()),
      addresses: (profile.addresses ?? []).filter(a => a.label.trim()),
      contactEntries: (profile.contactEntries ?? []).filter(c => c.value.trim()),
      avatarBase64: profile.avatarBase64 ?? null,
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(clean));
    // Also update displayName in identity
    if (identity) {
      const fullName = [clean.firstName, clean.lastName].filter(Boolean).join(" ");
      if (fullName) {
        const updated = { ...identity, displayName: fullName };
        localStorage.setItem("aregoland_identity", JSON.stringify(updated));
      }
    }
    // Notify other components (Dashboard, ChatList) about avatar change
    window.dispatchEvent(new Event("arego-profile-updated"));
    setToast(true);
    setTimeout(() => setToast(false), 2500);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) return; // max 500KB
    const reader = new FileReader();
    reader.onload = () => {
      update({ avatarBase64: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      {/* Success Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium"
          >
            <Check size={16} />
            {t('profile.savedLocally')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">{t('profile.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-lg mx-auto w-full flex flex-col items-center">

          {/* Avatar Section */}
          <div className="relative mb-8 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-32 h-32 rounded-full border-4 border-gray-800 shadow-xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center overflow-hidden">
              {profile.avatarBase64 ? (
                <img src={profile.avatarBase64} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-white select-none">{initials}</span>
              )}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={32} className="text-white" />
            </div>
            <div className="absolute bottom-1 right-1 bg-blue-600 p-2 rounded-full border-4 border-gray-900 text-white">
              <Camera size={16} />
            </div>
            {profile.avatarBase64 && (
              <button
                onClick={(e) => { e.stopPropagation(); update({ avatarBase64: null }); }}
                className="absolute top-0 right-0 bg-red-600 p-1 rounded-full border-2 border-gray-900 text-white hover:bg-red-500 transition-colors"
              >
                <X size={12} />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          {/* Unique ID Section */}
          <div className="w-full bg-blue-900/20 border border-blue-500/30 rounded-2xl p-4 mb-4 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
            <span className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">{t('profile.yourId')}</span>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-mono font-bold tracking-widest text-white">{uniqueId}</span>
              <button
                onClick={handleCopyId}
                className="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500/20 rounded-lg transition-colors"
                title={t('profile.copyId')}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">{t('profile.idUnique')}</p>
          </div>

          {/* Privacy Notice */}
          <div className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-8 flex items-start gap-3">
             <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={18} />
             <p className="text-xs text-yellow-200/80 leading-relaxed" dangerouslySetInnerHTML={{ __html: `<strong>Hinweis:</strong> ${t('profile.privacyNote')}` }} />
          </div>

          {/* Form Fields */}
          <div className="w-full space-y-8">

            {/* Personal Info */}
            <div className="space-y-4">
               <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1">{t('profile.personalData')}</h3>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">{t('profile.firstName')}</label>
                    <input
                      type="text"
                      value={profile.firstName}
                      onChange={(e) => update({ firstName: e.target.value })}
                      placeholder="Max"
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">{t('profile.lastName')}</label>
                    <input
                      type="text"
                      value={profile.lastName}
                      onChange={(e) => update({ lastName: e.target.value })}
                      placeholder="Mustermann"
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-400 flex items-center gap-1"><User size={12}/> {t('profile.nickname')}</label>
                  <input
                    type="text"
                    value={profile.nickname}
                    onChange={(e) => update({ nickname: e.target.value })}
                    placeholder={t('profile.nicknamePlaceholder')}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
               </div>

               <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-400 flex items-center gap-1"><Info size={12}/> {t('profile.status')}</label>
                  <input
                    type="text"
                    value={profile.status}
                    onChange={(e) => update({ status: e.target.value })}
                    placeholder={t('profile.statusPlaceholder')}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
               </div>
            </div>

            {/* Addresses — dynamic */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1 flex items-center gap-2">
                <MapPin size={14} /> {t('profile.address')}
              </h3>

              {/* Address cards */}
              {profile.addresses.map((addr, idx) => {
                const line1 = [addr.street, addr.houseNumber].filter(Boolean).join(" ");
                const line2 = [addr.zipCode, addr.city].filter(Boolean).join(" ");
                return (
                  <div key={idx} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-blue-400 shrink-0" />
                        <span className="text-sm font-semibold text-blue-400">{addr.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditAddress(idx)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => removeAddress(idx)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-300 pl-[22px]">
                      {line1 && <div>{line1}</div>}
                      {line2 && <div>{line2}</div>}
                      {addr.country && addr.country !== "Deutschland" && <div className="text-gray-500">{addr.country}</div>}
                    </div>
                  </div>
                );
              })}

              {/* Add address button */}
              {!showAddressForm && (
                <button
                  onClick={() => openAddAddress()}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800/50 border border-gray-700/50 border-dashed rounded-xl text-gray-400 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-sm font-medium"
                >
                  <Plus size={16} />
                  {t('profile.addAddress')}
                </button>
              )}

              {/* Address form (inline) */}
              <AnimatePresence>
                {showAddressForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-gray-800/50 border border-blue-500/30 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white">
                          {editingAddressIdx !== null ? t('profile.editAddress') : t('profile.addAddress')}
                        </h4>
                        <button onClick={() => setShowAddressForm(false)} className="p-1 text-gray-500 hover:text-white">
                          <X size={18} />
                        </button>
                      </div>

                      {/* Label presets */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-400">{t('profile.addressLabel')}</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {ADDRESS_PRESETS.slice(0, 4).map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setAddressDraft(d => ({ ...d, label: p.label }))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                addressDraft.label === p.label
                                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/50"
                                  : "bg-gray-700/50 text-gray-400 border border-gray-700/50 hover:border-gray-600"
                              }`}
                            >
                              <p.icon size={12} />
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={addressDraft.label}
                          onChange={(e) => setAddressDraft(d => ({ ...d, label: e.target.value }))}
                          placeholder={t('profile.addressLabelPlaceholder')}
                          className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2 space-y-1">
                          <label className="text-xs font-medium text-gray-400">{t('profile.street')}</label>
                          <input type="text" value={addressDraft.street} onChange={(e) => setAddressDraft(d => ({ ...d, street: e.target.value }))} placeholder="Musterstr."
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-400">{t('profile.houseNumber')}</label>
                          <input type="text" value={addressDraft.houseNumber} onChange={(e) => setAddressDraft(d => ({ ...d, houseNumber: e.target.value }))} placeholder="1"
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-400">{t('profile.zip')}</label>
                          <input type="text" value={addressDraft.zipCode} onChange={(e) => setAddressDraft(d => ({ ...d, zipCode: e.target.value }))} placeholder="12345"
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-xs font-medium text-gray-400">{t('profile.city')}</label>
                          <input type="text" value={addressDraft.city} onChange={(e) => setAddressDraft(d => ({ ...d, city: e.target.value }))} placeholder={t('profile.cityPlaceholder')}
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-400">{t('profile.country')}</label>
                        <input type="text" value={addressDraft.country} onChange={(e) => setAddressDraft(d => ({ ...d, country: e.target.value }))} placeholder="Deutschland"
                          className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                      </div>

                      <button
                        onClick={saveAddress}
                        disabled={!addressDraft.label.trim()}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Check size={16} />
                        {editingAddressIdx !== null ? t('common.save') : t('profile.addAddress')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Social Media — dynamic */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1 flex items-center gap-2">
                <LinkIcon size={14} /> {t('profile.socialMedia')}
              </h3>

              {/* Added links */}
              {profile.socialLinks.map((link, idx) => {
                const p = getPlatform(link.platform);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                      {p.icon}
                    </div>
                    <div className="flex-1 relative">
                      {p.prefix && (
                        <span className="absolute left-3 top-2.5 text-gray-500 text-sm">{p.prefix}</span>
                      )}
                      <input
                        type="text"
                        value={link.username}
                        onChange={(e) => updateSocialLink(idx, e.target.value)}
                        placeholder={p.label}
                        className={`w-full bg-gray-800/50 border border-gray-700 rounded-xl ${p.prefix ? "pl-7" : "pl-3"} pr-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all`}
                      />
                    </div>
                    <button
                      onClick={() => removeSocialLink(idx)}
                      className="shrink-0 p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}

              {/* Add button */}
              <button
                onClick={() => setShowPlatformPicker(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800/50 border border-gray-700/50 border-dashed rounded-xl text-gray-400 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-sm font-medium"
              >
                <Plus size={16} />
                {t('profile.addSocial')}
              </button>

              {/* Platform Picker Modal */}
              <AnimatePresence>
                {showPlatformPicker && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowPlatformPicker(false)}
                  >
                    <motion.div
                      initial={{ y: 100 }}
                      animate={{ y: 0 }}
                      exit={{ y: 100 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-3xl p-5 pb-8 max-h-[70vh] overflow-y-auto"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg">{t('profile.choosePlatform')}</h3>
                        <button onClick={() => setShowPlatformPicker(false)} className="p-1 text-gray-500 hover:text-white">
                          <X size={20} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {PLATFORMS.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => addSocialLink(p.id)}
                            className="flex items-center gap-3 p-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-xl transition-colors text-left"
                          >
                            <div className="text-gray-400">{p.icon}</div>
                            <span className="text-sm font-medium text-white">{p.label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Contact — dynamic */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1">{t('profile.contact')}</h3>

              {/* Contact cards */}
              {profile.contactEntries.map((entry, idx) => {
                const ct = getContactType(entry.type);
                const Icon = ct.icon;
                return (
                  <div key={idx} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 flex items-center gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-gray-700/50 flex items-center justify-center text-gray-400">
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{entry.value}</div>
                      <div className="text-xs text-gray-500">{ct.label} · {entry.label}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditContact(idx)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => removeContact(idx)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add contact button */}
              {!showContactForm && (
                <button
                  onClick={openAddContact}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800/50 border border-gray-700/50 border-dashed rounded-xl text-gray-400 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-sm font-medium"
                >
                  <Plus size={16} />
                  {t('profile.addContact')}
                </button>
              )}

              {/* Contact form (inline) */}
              <AnimatePresence>
                {showContactForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-gray-800/50 border border-blue-500/30 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white">
                          {editingContactIdx !== null ? t('profile.editContact') : t('profile.addContact')}
                        </h4>
                        <button onClick={() => setShowContactForm(false)} className="p-1 text-gray-500 hover:text-white">
                          <X size={18} />
                        </button>
                      </div>

                      {/* Type selection */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-400">{t('profile.contactType')}</label>
                        <div className="flex flex-wrap gap-2">
                          {CONTACT_TYPES.map((ct) => {
                            const Icon = ct.icon;
                            return (
                              <button
                                key={ct.id}
                                onClick={() => setContactDraft(d => ({ ...d, type: ct.id }))}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  contactDraft.type === ct.id
                                    ? "bg-blue-600/20 text-blue-400 border border-blue-500/50"
                                    : "bg-gray-700/50 text-gray-400 border border-gray-700/50 hover:border-gray-600"
                                }`}
                              >
                                <Icon size={12} />
                                {ct.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Label selection */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-400">{t('profile.contactLabel')}</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {CONTACT_LABELS.map((lbl) => (
                            <button
                              key={lbl}
                              onClick={() => setContactDraft(d => ({ ...d, label: lbl }))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                contactDraft.label === lbl
                                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/50"
                                  : "bg-gray-700/50 text-gray-400 border border-gray-700/50 hover:border-gray-600"
                              }`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={contactDraft.label}
                          onChange={(e) => setContactDraft(d => ({ ...d, label: e.target.value }))}
                          placeholder={t('profile.contactLabelPlaceholder')}
                          className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>

                      {/* Value input */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-400">{getContactType(contactDraft.type).label}</label>
                        <input
                          type={getContactType(contactDraft.type).inputType}
                          value={contactDraft.value}
                          onChange={(e) => setContactDraft(d => ({ ...d, value: e.target.value }))}
                          placeholder={getContactType(contactDraft.type).placeholder}
                          className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>

                      <button
                        onClick={saveContact}
                        disabled={!contactDraft.value.trim()}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Check size={16} />
                        {editingContactIdx !== null ? t('common.save') : t('profile.addContact')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          <div className="h-10"></div>

          <button
            onClick={handleSave}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-600/20 active:scale-98 transition-all flex items-center justify-center gap-2 sticky bottom-6 z-10"
          >
            <Check size={20} />
            {t('common.save')}
          </button>


          <div className="h-10"></div>
        </div>
      </div>
    </div>
  );
}
