import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ArrowLeft, Shield, ChevronRight, Baby, Lock, QrCode, X, Phone, PhoneOff, Bell, Eye, Globe, Ban, HeartHandshake, Camera, Pencil, Save, ToggleLeft, ToggleRight, Plus, Settings, History, ShieldCheck, Download, AlertTriangle, Check, LayoutGrid, MapPin, Link as LinkIcon, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { loadIdentity, createChildLinkPayload, decodeChildLinkPayload, setKindStatus, type LinkedChild } from "@/app/auth/identity";
import { loadFsk, saveFsk, type FskStatus } from "@/app/auth/fsk";
import { signData } from "@/app/auth/crypto";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";

interface FamilyTabProps {
  onBack: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onFskUpdated?: () => void;
}

export default function FamilyTab({ onBack, t, onFskUpdated }: FamilyTabProps) {
  const identity = useMemo(() => loadIdentity(), []);
  const isChildAccount = useMemo(() => {
    try { const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}"); return id.ist_kind === true || id.accountType === "child"; }
    catch { return false; }
  }, []);

  const [linkedChildren, setLinkedChildren] = useState<LinkedChild[]>([]);
  const [showAddChild, setShowAddChild] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [childFirstName, setChildFirstName] = useState("");
  const [childLastName, setChildLastName] = useState("");
  const [childNickname, setChildNickname] = useState("");
  const [childStatus, setChildStatus] = useState("");
  const [childAddresses, setChildAddresses] = useState<{ label: string; street: string; houseNumber: string; zipCode: string; city: string; country: string }[]>([]);
  const [childSocialLinks, setChildSocialLinks] = useState<{ platform: string; username: string }[]>([]);
  const [childContactEntries, setChildContactEntries] = useState<{ type: string; label: string; value: string }[]>([]);
  const [childAvatarBase64, setChildAvatarBase64] = useState<string | null>(null);
  const [childNickSelfEdit, setChildNickSelfEdit] = useState(false);
  const [childCallsEnabled, setChildCallsEnabled] = useState(true);
  const [childNameSaving, setChildNameSaving] = useState(false);
  const [childNameToast, setChildNameToast] = useState(false);
  const childAvatarInputRef = useRef<HTMLInputElement>(null);
  const [verwalterNames, setVerwalterNames] = useState<{ id: string; name: string }[]>([]);
  const [childSettingsView, setChildSettingsView] = useState<'profile' | 'settings' | 'audit'>('profile');
  const [childAuditLog, setChildAuditLog] = useState<{ id: number; verwalter_id: string; aktion: string; kategorie: string; zeitstempel: string }[]>([]);
  const [childAuditLoading, setChildAuditLoading] = useState(false);
  const [childSettingSaving, setChildSettingSaving] = useState(false);
  const [childVerwalterEinstellungenErlaubt, setChildVerwalterEinstellungenErlaubt] = useState(true);
  const [selfDeterminationSaving, setSelfDeterminationSaving] = useState(false);

  // Parent-Link Scanner State
  const [parentScanActive, setParentScanActive] = useState(false);
  const [parentScanError, setParentScanError] = useState<string | null>(null);
  const [parentLinked, setParentLinked] = useState<string | null>(null);
  const parentScannerRef = useRef<Html5Qrcode | null>(null);
  const parentScanProcessed = useRef(false);

  const stopParentScanner = useCallback(() => {
    if (parentScannerRef.current) {
      parentScannerRef.current.stop().catch(() => {});
      parentScannerRef.current.clear();
      parentScannerRef.current = null;
    }
    setParentScanActive(false);
  }, []);

  const startParentScanner = useCallback(async () => {
    setParentScanError(null);
    setParentScanActive(true);
    parentScanProcessed.current = false;
    await new Promise(r => setTimeout(r, 100));
    const el = document.getElementById("parent-scan-region");
    if (!el) { setParentScanError(t('settings.fskParentCameraError')); setParentScanActive(false); return; }
    try {
      const cameras = await Promise.race([
        Html5Qrcode.getCameras(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      if (!cameras.length) { setParentScanError(t('settings.fskParentNoCamera')); setParentScanActive(false); return; }
      const scanner = new Html5Qrcode("parent-scan-region");
      parentScannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          if (parentScanProcessed.current) return;
          const parentId = decodeChildLinkPayload(decoded.trim());
          if (!parentId) return;
          parentScanProcessed.current = true;
          try { await scanner.stop(); } catch {}
          try { scanner.clear(); } catch {}
          parentScannerRef.current = null;
          const childId = identity?.aregoId ?? '';
          if (!childId || !parentId) { setParentScanActive(false); return; }
          setKindStatus(parentId);
          const fskUpdate: FskStatus = { level: 6, verified: true, verifiedAt: new Date().toISOString(), method: "parent" };
          saveFsk(fskUpdate);
          onFskUpdated?.();
          try {
            const resp = await fetch('/child-link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ child_id: childId, parent_id: parentId }),
            });
            if (!resp.ok) console.error('child-link fehlgeschlagen:', resp.status);
          } catch (err) {
            console.error('child-link Netzwerkfehler:', err);
          }
          setParentScanActive(false);
          setParentLinked(parentId);
        },
        () => {}
      );
    } catch (e) {
      console.error("Scanner-Fehler:", e);
      setParentScanError(t('settings.fskParentCameraError'));
      setParentScanActive(false);
    }
  }, [t, onFskUpdated, identity]);

  // Load children from server
  useEffect(() => {
    if (!identity) return;
    fetch(`/whoami/${encodeURIComponent(identity.aregoId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.linked_children) setLinkedChildren(data.linked_children);
        if (data?.verwalter_einstellungen_erlaubt !== undefined) setChildVerwalterEinstellungenErlaubt(!!data.verwalter_einstellungen_erlaubt);
        const verwalterIds = [data?.verwalter_1, data?.verwalter_2].filter(Boolean) as string[];
        if (verwalterIds.length > 0) {
          Promise.all(verwalterIds.map(vid =>
            fetch(`/child-settings/${encodeURIComponent(vid)}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => d ? { id: vid, name: [d.firstName, d.lastName].filter(Boolean).join(' ') || d.displayName || vid } : { id: vid, name: vid })
              .catch(() => ({ id: vid, name: vid }))
          )).then(names => setVerwalterNames(names));
        }
      })
      .catch(() => {});
  }, [identity]);

  // Load child profile when selected
  useEffect(() => {
    if (!selectedChild) return;
    const child = linkedChildren.find(c => c.child_id === selectedChild);
    if (!child) return;
    const childProfiles = JSON.parse(localStorage.getItem('arego_child_profiles') ?? '{}');
    const cp = childProfiles[child.child_id] ?? {};
    setChildFirstName(cp.firstName ?? child.firstName ?? '');
    setChildLastName(cp.lastName ?? child.lastName ?? '');
    setChildNickname(cp.nickname ?? child.nickname ?? '');
    setChildStatus(cp.status ?? '');
    setChildAddresses(cp.addresses ?? []);
    setChildSocialLinks(cp.socialLinks ?? []);
    setChildContactEntries(cp.contactEntries ?? []);
    setChildAvatarBase64(cp.avatarBase64 ?? null);
    setChildNickSelfEdit(child.nickname_self_edit ?? false);
    setChildCallsEnabled(child.calls_enabled ?? true);
  }, [selectedChild, linkedChildren]);

  // Live-Updates from child/other manager
  useEffect(() => {
    if (!selectedChild) return;
    const handler = () => {
      const childProfiles = JSON.parse(localStorage.getItem('arego_child_profiles') ?? '{}');
      const cp = childProfiles[selectedChild] ?? {};
      if (cp.nickname !== undefined) setChildNickname(cp.nickname);
      if (cp.socialLinks !== undefined) setChildSocialLinks(cp.socialLinks);
      if (cp.contactEntries !== undefined) setChildContactEntries(cp.contactEntries);
    };
    window.addEventListener('arego-child-profile-updated', handler);
    return () => window.removeEventListener('arego-child-profile-updated', handler);
  }, [selectedChild]);

  const handleGenerateQR = async () => {
    if (!identity) return;
    const payload = createChildLinkPayload(identity);
    const url = await QRCode.toDataURL(payload, { width: 280, margin: 2, color: { dark: '#ffffff', light: '#00000000' } });
    setQrDataUrl(url);
    setShowAddChild(true);
  };

  // ── Child Detail View ──
  const activeChild = selectedChild ? linkedChildren.find(c => c.child_id === selectedChild) : null;
  if (activeChild) {
    const childDisplayName = [activeChild.firstName, activeChild.lastName].filter(Boolean).join(' ') || activeChild.displayName || activeChild.child_id;
    const childInitial = (activeChild.firstName?.[0] || activeChild.child_id[0] || '?').toUpperCase();
    const childFsk = activeChild.fsk_stufe ?? 6;
    const isFsk16Plus = childFsk >= 16;

    const handleVerwalterSettingUpdate = async (kategorie: string, aktion: string, payloadEncrypted?: string) => {
      if (!identity) return;
      setChildSettingSaving(true);
      try {
        const ts = new Date().toISOString();
        const sig = await signData(identity.privateKeyJwk, activeChild.child_id + kategorie + ts);
        const resp = await fetch('/child-settings/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verwalter_id: identity.aregoId,
            kind_id: activeChild.child_id,
            kategorie,
            aktion,
            payload_encrypted: payloadEncrypted ?? '',
            signature: sig,
            timestamp: ts,
          }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          console.error('child-settings/update Fehler:', err);
        }
      } catch (err) {
        console.error('child-settings/update Netzwerkfehler:', err);
      }
      setChildSettingSaving(false);
    };

    const loadAuditLog = async () => {
      if (!identity) return;
      setChildAuditLoading(true);
      try {
        const ts = new Date().toISOString();
        const sig = await signData(identity.privateKeyJwk, activeChild.child_id + 'audit' + ts);
        const params = new URLSearchParams({ requester_id: identity.aregoId, signature: sig, timestamp: ts });
        const resp = await fetch(`/child-settings/audit/${encodeURIComponent(activeChild.child_id)}?${params}`);
        if (resp.ok) {
          const data = await resp.json();
          setChildAuditLog(data.audits ?? []);
        }
      } catch (err) {
        console.error('audit-log Fehler:', err);
      }
      setChildAuditLoading(false);
    };

    const handleSaveChildProfile = () => {
      if (!identity) return;
      setChildNameSaving(true);
      const profile = {
        firstName: childFirstName.trim(),
        lastName: childLastName.trim(),
        nickname: childNickname.trim(),
        status: childStatus.trim(),
        addresses: childAddresses,
        socialLinks: childSocialLinks.filter(l => l.username.trim()),
        contactEntries: childContactEntries.filter(c => c.value.trim()),
        avatarBase64: childAvatarBase64,
      };
      const childProfiles = JSON.parse(localStorage.getItem('arego_child_profiles') ?? '{}');
      childProfiles[activeChild.child_id] = { ...profile, updatedAt: new Date().toISOString() };
      localStorage.setItem('arego_child_profiles', JSON.stringify(childProfiles));
      const syncMsg = JSON.stringify({ type: 'child_profile_sync', child_id: activeChild.child_id, profile });
      const sendSync = (attempt: number) => {
        const wsRaw = (window as any).__aregoWs;
        if (wsRaw && wsRaw.readyState === 1) {
          wsRaw.send(syncMsg);
        } else if (attempt < 3) {
          setTimeout(() => sendSync(attempt + 1), 1000 * Math.pow(2, attempt));
        }
      };
      sendSync(0);
      fetch('/child-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_id: activeChild.child_id,
          parent_id: identity.aregoId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          nickname: profile.nickname,
        }),
      }).catch(() => {});
      setLinkedChildren(prev => prev.map(c =>
        c.child_id === activeChild.child_id
          ? { ...c, firstName: profile.firstName, lastName: profile.lastName, nickname: profile.nickname, displayName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') }
          : c
      ));
      setChildNameSaving(false);
      setChildNameToast(true);
      setTimeout(() => setChildNameToast(false), 2500);
    };

    const handleToggleNickSelfEdit = async () => {
      if (!identity || isFsk16Plus) return;
      const newVal = !childNickSelfEdit;
      try {
        const resp = await fetch('/child-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ child_id: activeChild.child_id, parent_id: identity.aregoId, nickname_self_edit: newVal }),
        });
        if (resp.ok) {
          setChildNickSelfEdit(newVal);
          setLinkedChildren(prev => prev.map(c =>
            c.child_id === activeChild.child_id ? { ...c, nickname_self_edit: newVal } : c
          ));
        }
      } catch (err) { console.error('child-settings Fehler:', err); }
    };

    const handleToggleCallsEnabled = async () => {
      if (!identity) return;
      const newVal = !childCallsEnabled;
      try {
        const resp = await fetch('/child-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ child_id: activeChild.child_id, parent_id: identity.aregoId, calls_enabled: newVal }),
        });
        if (resp.ok) {
          setChildCallsEnabled(newVal);
          setLinkedChildren(prev => prev.map(c =>
            c.child_id === activeChild.child_id ? { ...c, calls_enabled: newVal } : c
          ));
        }
      } catch (err) { console.error('child-settings calls_enabled Fehler:', err); }
    };

    const handleChildAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || file.size > 500_000) return;
      const reader = new FileReader();
      reader.onload = () => setChildAvatarBase64(reader.result as string);
      reader.readAsDataURL(file);
      e.target.value = '';
    };

    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <AnimatePresence>
          {childNameToast && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium">
              <Check size={16} /> {t('settings.childNameSaved')}
            </motion.div>
          )}
        </AnimatePresence>

        <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
          <button onClick={() => { setSelectedChild(null); setChildFirstName(''); setChildLastName(''); setChildNickname(''); setChildStatus(''); setChildAddresses([]); setChildSocialLinks([]); setChildContactEntries([]); setChildAvatarBase64(null); setChildSettingsView('profile'); }} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all">
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm overflow-hidden">
              {childAvatarBase64 ? <img src={childAvatarBase64} alt="" className="w-full h-full object-cover" /> : childInitial}
            </div>
            <h1 className="text-xl font-bold">{childDisplayName}</h1>
          </div>
        </header>

        <div className="flex border-b border-gray-800 bg-gray-900 sticky top-[72px] z-10">
          {[
            { id: 'profile' as const, label: 'Profil', icon: Pencil },
            { id: 'settings' as const, label: 'Einstellungen', icon: Settings },
            { id: 'audit' as const, label: 'Aktivit\u00e4t', icon: History },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setChildSettingsView(tab.id); if (tab.id === 'audit') loadAuditLog(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2 ${childSettingsView === tab.id ? 'text-pink-400 border-pink-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex items-center gap-3">
              <Shield size={20} className="text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">FSK {childFsk} — {t('settings.childFskProtected')}</p>
                <p className="text-xs text-gray-500">{t('settings.childFskUpgradeHint')}</p>
              </div>
            </div>

            {/* PROFIL TAB */}
            {childSettingsView === 'profile' && <>
              <div className="flex justify-center">
                <div className="relative group cursor-pointer" onClick={() => childAvatarInputRef.current?.click()}>
                  <div className="w-24 h-24 rounded-full border-4 border-gray-800 shadow-xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center overflow-hidden">
                    {childAvatarBase64 ? <img src={childAvatarBase64} alt="Avatar" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-white select-none">{childInitial}</span>}
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera size={24} className="text-white" /></div>
                  <div className="absolute bottom-0 right-0 bg-pink-600 p-1.5 rounded-full border-3 border-gray-900 text-white"><Camera size={12} /></div>
                  {childAvatarBase64 && <button onClick={(e) => { e.stopPropagation(); setChildAvatarBase64(null); }} className="absolute top-0 right-0 bg-red-600 p-1 rounded-full border-2 border-gray-900 text-white hover:bg-red-500"><X size={10} /></button>}
                  <input ref={childAvatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleChildAvatarUpload} />
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1"><Pencil size={16} className="text-pink-400" /><h3 className="font-medium text-sm">{t('profile.personalData')}</h3></div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={childFirstName} onChange={e => setChildFirstName(e.target.value)} placeholder={t('settings.childFirstName')} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50" />
                  <input type="text" value={childLastName} onChange={e => setChildLastName(e.target.value)} placeholder={t('settings.childLastName')} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="text" value={childNickname} onChange={e => setChildNickname(e.target.value)} placeholder={t('settings.childNickname')} readOnly={isFsk16Plus} className={`flex-1 bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50 ${isFsk16Plus ? 'opacity-60 cursor-not-allowed' : ''}`} />
                  {isFsk16Plus && <Lock size={14} className="text-orange-400 shrink-0" />}
                </div>
                {isFsk16Plus && <p className="text-[10px] text-orange-400/70">Spitzname wird ab FSK 16 vom Kind selbst verwaltet</p>}
                <input type="text" value={childStatus} onChange={e => setChildStatus(e.target.value)} placeholder={t('profile.statusPlaceholder')} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50" />
              </div>

              {/* Adressen */}
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1"><MapPin size={16} className="text-blue-400" /><h3 className="font-medium text-sm">{t('profile.address')}</h3></div>
                {childAddresses.map((addr, idx) => (
                  <div key={idx} className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-400">{addr.label}</span>
                      <button onClick={() => setChildAddresses(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={addr.street} onChange={e => setChildAddresses(prev => prev.map((a, i) => i === idx ? { ...a, street: e.target.value } : a))} placeholder="Stra\u00dfe" className="col-span-2 bg-gray-800/50 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />
                      <input type="text" value={addr.houseNumber} onChange={e => setChildAddresses(prev => prev.map((a, i) => i === idx ? { ...a, houseNumber: e.target.value } : a))} placeholder="Nr." className="bg-gray-800/50 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={addr.zipCode} onChange={e => setChildAddresses(prev => prev.map((a, i) => i === idx ? { ...a, zipCode: e.target.value } : a))} placeholder="PLZ" className="bg-gray-800/50 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />
                      <input type="text" value={addr.city} onChange={e => setChildAddresses(prev => prev.map((a, i) => i === idx ? { ...a, city: e.target.value } : a))} placeholder="Stadt" className="col-span-2 bg-gray-800/50 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />
                    </div>
                  </div>
                ))}
                <button onClick={() => setChildAddresses(prev => [...prev, { label: 'Zuhause', street: '', houseNumber: '', zipCode: '', city: '', country: 'Deutschland' }])} className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-700/50 border-dashed rounded-xl text-gray-400 hover:text-white hover:border-pink-500/50 text-xs font-medium">
                  <Plus size={14} /> {t('profile.addAddress')}
                </button>
              </div>

              {/* Social Media */}
              <div className={`bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3 ${isFsk16Plus ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 mb-1"><LinkIcon size={16} className="text-purple-400" /><h3 className="font-medium text-sm">{t('profile.socialMedia')}</h3>{isFsk16Plus && <Lock size={12} className="text-orange-400 ml-auto" />}</div>
                {isFsk16Plus && <p className="text-[10px] text-orange-400/70">Ab FSK 16 wird Social Media vom Kind selbst verwaltet</p>}
                {childSocialLinks.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input type="text" value={link.platform} readOnly className="w-20 bg-gray-900/50 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-400" />
                    <input type="text" value={link.username} onChange={e => { if (!isFsk16Plus) setChildSocialLinks(prev => prev.map((l, i) => i === idx ? { ...l, username: e.target.value } : l)); }} readOnly={isFsk16Plus} placeholder="@username" className="flex-1 bg-gray-900/50 border border-gray-700 rounded-lg px-2 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50" />
                    {!isFsk16Plus && <button onClick={() => setChildSocialLinks(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>}
                  </div>
                ))}
                {!isFsk16Plus && <button onClick={() => setChildSocialLinks(prev => [...prev, { platform: 'instagram', username: '' }])} className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-700/50 border-dashed rounded-xl text-gray-400 hover:text-white hover:border-purple-500/50 text-xs font-medium"><Plus size={14} /> {t('profile.addSocial')}</button>}
              </div>

              {/* Kontaktdaten */}
              <div className={`bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3 ${isFsk16Plus ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 mb-1"><Phone size={16} className="text-green-400" /><h3 className="font-medium text-sm">{t('profile.contact')}</h3>{isFsk16Plus && <Lock size={12} className="text-orange-400 ml-auto" />}</div>
                {isFsk16Plus && <p className="text-[10px] text-orange-400/70">Ab FSK 16 werden Kontaktdaten vom Kind selbst verwaltet</p>}
                {childContactEntries.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select value={entry.type} onChange={e => { if (!isFsk16Plus) setChildContactEntries(prev => prev.map((c, i) => i === idx ? { ...c, type: e.target.value } : c)); }} disabled={isFsk16Plus} className="w-20 bg-gray-900/50 border border-gray-700 rounded-lg px-1 py-2 text-xs text-gray-400">
                      <option value="phone">Telefon</option><option value="mobile">Handy</option><option value="email">E-Mail</option>
                    </select>
                    <input type="text" value={entry.value} onChange={e => { if (!isFsk16Plus) setChildContactEntries(prev => prev.map((c, i) => i === idx ? { ...c, value: e.target.value } : c)); }} readOnly={isFsk16Plus} placeholder="Wert" className="flex-1 bg-gray-900/50 border border-gray-700 rounded-lg px-2 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50" />
                    {!isFsk16Plus && <button onClick={() => setChildContactEntries(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>}
                  </div>
                ))}
                {!isFsk16Plus && <button onClick={() => setChildContactEntries(prev => [...prev, { type: 'mobile', label: 'Privat', value: '' }])} className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-700/50 border-dashed rounded-xl text-gray-400 hover:text-white hover:border-green-500/50 text-xs font-medium"><Plus size={14} /> {t('profile.addContact')}</button>}
              </div>

              {/* Spitzname-Toggle */}
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
                <button onClick={handleToggleNickSelfEdit} disabled={isFsk16Plus} className="w-full flex items-center justify-between">
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">{t('settings.childNicknameSelfEdit')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t('settings.childNicknameSelfEditHint')}</p>
                  </div>
                  <div className="ml-3 shrink-0">{(childNickSelfEdit || isFsk16Plus) ? <ToggleRight size={28} className="text-pink-400" /> : <ToggleLeft size={28} className="text-gray-600" />}</div>
                </button>
                {isFsk16Plus && <p className="text-xs text-pink-400/70">{t('settings.childNicknameFsk16Auto')}</p>}
              </div>

              <button onClick={handleSaveChildProfile} disabled={childNameSaving} className="w-full bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3.5 rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-pink-600/20">
                <Save size={18} /> {childNameSaving ? '...' : 'Profil speichern'}
              </button>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex gap-3">
                <Bell size={18} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300/80">{t('settings.childActionInfo')}</p>
              </div>

              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Arego-ID</p>
                <p className="text-sm text-gray-400 font-mono">{activeChild.child_id}</p>
              </div>
            </>}

            {/* EINSTELLUNGEN TAB */}
            {childSettingsView === 'settings' && <>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                <div className="p-4 border-b border-gray-700/50">
                  <div className="flex items-center gap-2"><Settings size={16} className="text-pink-400" /><h3 className="font-medium text-sm">Verwalter-Einstellungen</h3></div>
                  <p className="text-xs text-gray-500 mt-1">Einstellungen fuer das Kinderkonto aendern</p>
                </div>
                <button onClick={() => handleVerwalterSettingUpdate('notifications', 'update')} disabled={childSettingSaving} className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between hover:bg-gray-800/80 transition-colors text-left">
                  <div className="flex items-center gap-3"><div className="bg-blue-500/20 p-2 rounded-lg"><Bell size={16} className="text-blue-400" /></div><div><p className="text-sm font-medium">Benachrichtigungen</p><p className="text-xs text-gray-500">Push, Sound, Nachrichten-Alerts</p></div></div>
                  <ChevronRight size={18} className="text-gray-600" />
                </button>
                <button onClick={() => handleVerwalterSettingUpdate('visibility', 'update')} disabled={childSettingSaving} className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between hover:bg-gray-800/80 transition-colors text-left">
                  <div className="flex items-center gap-3"><div className="bg-purple-500/20 p-2 rounded-lg"><Eye size={16} className="text-purple-400" /></div><div><p className="text-sm font-medium">Sichtbarkeit</p><p className="text-xs text-gray-500">Privacy-Levels, Auffindbarkeit</p></div></div>
                  <ChevronRight size={18} className="text-gray-600" />
                </button>
                <button onClick={() => handleVerwalterSettingUpdate('language', 'update')} disabled={childSettingSaving} className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between hover:bg-gray-800/80 transition-colors text-left">
                  <div className="flex items-center gap-3"><div className="bg-green-500/20 p-2 rounded-lg"><Globe size={16} className="text-green-400" /></div><div><p className="text-sm font-medium">Sprache</p><p className="text-xs text-gray-500">App-Sprache aendern</p></div></div>
                  <ChevronRight size={18} className="text-gray-600" />
                </button>
                <button onClick={() => handleVerwalterSettingUpdate('start_screen', 'update')} disabled={childSettingSaving} className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between hover:bg-gray-800/80 transition-colors text-left">
                  <div className="flex items-center gap-3"><div className="bg-cyan-500/20 p-2 rounded-lg"><LayoutGrid size={16} className="text-cyan-400" /></div><div><p className="text-sm font-medium">Start-Bildschirm</p><p className="text-xs text-gray-500">Standard-Ansicht beim Oeffnen</p></div></div>
                  <ChevronRight size={18} className="text-gray-600" />
                </button>
                <button onClick={() => handleVerwalterSettingUpdate('contact_block', 'update')} disabled={childSettingSaving} className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between hover:bg-gray-800/80 transition-colors text-left">
                  <div className="flex items-center gap-3"><div className="bg-red-500/20 p-2 rounded-lg"><Ban size={16} className="text-red-400" /></div><div><p className="text-sm font-medium">Kontakt-Sperre</p><p className="text-xs text-gray-500">Kontakte sperren/entsperren</p></div></div>
                  <ChevronRight size={18} className="text-gray-600" />
                </button>
                <button onClick={handleToggleCallsEnabled} disabled={childSettingSaving} className="w-full p-4 flex items-center justify-between hover:bg-gray-800/80 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className={`${childCallsEnabled ? 'bg-green-500/20' : 'bg-gray-500/20'} p-2 rounded-lg`}>
                      {childCallsEnabled ? <Phone size={16} className="text-green-400" /> : <PhoneOff size={16} className="text-gray-400" />}
                    </div>
                    <div><p className="text-sm font-medium">Anrufe</p><p className="text-xs text-gray-500">{childCallsEnabled ? 'Anrufe erlaubt' : 'Anrufe deaktiviert'}</p></div>
                  </div>
                  {childCallsEnabled ? <ToggleRight size={24} className="text-green-400" /> : <ToggleLeft size={24} className="text-gray-500" />}
                </button>
              </div>
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex gap-3">
                <ShieldCheck size={18} className="text-orange-400 shrink-0 mt-0.5" />
                <div className="text-xs text-orange-300/80 space-y-1">
                  <p className="font-medium">Kinderschutz aktiv</p>
                  <p>FSK-Feature-Locks koennen nicht umgangen werden. E2E-Verschluesselung bleibt aktiv. Kein Zugriff auf Chat-Inhalte.</p>
                </div>
              </div>
            </>}

            {/* AKTIVITAET TAB */}
            {childSettingsView === 'audit' && <>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                <div className="p-4 border-b border-gray-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-2"><History size={16} className="text-pink-400" /><h3 className="font-medium text-sm">Aenderungsverlauf</h3></div>
                  <button onClick={loadAuditLog} className="text-xs text-pink-400 hover:text-pink-300">Aktualisieren</button>
                </div>
                {childAuditLoading ? (
                  <div className="p-8 text-center text-gray-500 text-sm">Lade...</div>
                ) : childAuditLog.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    <History size={32} className="mx-auto mb-2 opacity-30" />
                    Noch keine Aenderungen protokolliert.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-700/50 max-h-96 overflow-y-auto">
                    {childAuditLog.map(entry => (
                      <div key={entry.id} className="p-3 hover:bg-gray-800/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded">{entry.kategorie}</span>
                          <span className="text-[10px] text-gray-600">{new Date(entry.zeitstempel).toLocaleString('de-DE')}</span>
                        </div>
                        <p className="text-xs text-gray-400">{entry.aktion}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">von {entry.verwalter_id === identity?.aregoId ? 'dir' : entry.verwalter_id}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={async () => {
                if (!identity) return;
                try {
                  const ts = new Date().toISOString();
                  const sig = await signData(identity.privateKeyJwk, activeChild.child_id + 'export' + ts);
                  const params = new URLSearchParams({ requester_id: identity.aregoId, signature: sig, timestamp: ts });
                  const resp = await fetch(`/child-settings/export/${encodeURIComponent(activeChild.child_id)}?${params}`);
                  if (resp.ok) {
                    const data = await resp.json();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `datenexport-${activeChild.child_id}.json`; a.click();
                    URL.revokeObjectURL(url);
                  }
                } catch (err) { console.error('DSGVO-Export Fehler:', err); }
              }} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 rounded-2xl transition-colors flex items-center justify-center gap-2 text-sm">
                <Download size={16} /> DSGVO-Datenexport (Art. 20)
              </button>
            </>}
          </div>
        </div>
      </div>
    );
  }

  // ── Family Main View ──
  const fskLevel = loadFsk()?.level ?? 6;
  const isFsk18 = fskLevel >= 18;

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button onClick={() => { onBack(); setShowAddChild(false); setQrDataUrl(null); }} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">{t('settings.familyChildren')}</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6 max-w-lg mx-auto">

          {!isChildAccount && (
            <div className="bg-pink-500/10 border border-pink-500/20 p-4 rounded-2xl flex gap-3">
              <Shield className="text-pink-400 shrink-0" size={22} />
              <div className="text-sm text-pink-200/80 leading-relaxed space-y-1">
                <p>{t('settings.familyInfo')}</p>
                <p className="text-xs text-pink-300/50">{t('settings.familyFskAutoHint')}</p>
              </div>
            </div>
          )}

          {!isChildAccount && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.linkedChildren')}</h3>
              {linkedChildren.length === 0 ? (
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6 text-center">
                  <Baby size={40} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{t('settings.noChildren')}</p>
                </div>
              ) : (
                <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                  {linkedChildren.map((child) => {
                    const name = [child.firstName, child.lastName].filter(Boolean).join(' ') || child.displayName || child.child_id;
                    const initial = (child.firstName?.[0] || child.child_id[0] || '?').toUpperCase();
                    return (
                      <button key={child.child_id} onClick={() => setSelectedChild(child.child_id)} className="w-full p-4 border-b border-gray-700/50 last:border-0 flex items-center justify-between hover:bg-gray-800/80 transition-colors text-left">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">{initial}</div>
                          <div><div className="font-medium">{name}</div><div className="text-xs text-gray-500">FSK {child.fsk_stufe} — {t('settings.childFskProtected')}</div></div>
                        </div>
                        <ChevronRight size={20} className="text-gray-500" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isChildAccount && verwalterNames.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.myVerwalter')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                {verwalterNames.map(v => (
                  <div key={v.id} className="p-4 border-b border-gray-700/50 last:border-0 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">{(v.name[0] || '?').toUpperCase()}</div>
                    <div><div className="font-medium">{v.name}</div><div className="text-xs text-gray-500">{t('settings.verwalterRole')}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isChildAccount && (loadFsk()?.level ?? 6) >= 16 && identity && (
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
              <button onClick={async () => {
                if (!identity || selfDeterminationSaving) return;
                setSelfDeterminationSaving(true);
                const newVal = !childVerwalterEinstellungenErlaubt;
                try {
                  const ts = new Date().toISOString();
                  const sig = await signData(identity.privateKeyJwk, identity.aregoId + 'self_determination' + ts);
                  const resp = await fetch('/child-settings/self-determination', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind_id: identity.aregoId, verwalter_einstellungen_erlaubt: newVal, signature: sig, timestamp: ts }),
                  });
                  if (resp.ok) setChildVerwalterEinstellungenErlaubt(newVal);
                } catch (err) { console.error('self-determination Fehler:', err); }
                setSelfDeterminationSaving(false);
              }} disabled={selfDeterminationSaving} className="w-full flex items-center justify-between">
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">Verwalter-Einstellungen erlauben</p>
                  <p className="text-xs text-gray-500 mt-0.5">Dein Verwalter kann Einstellungen an deinem Konto aendern</p>
                </div>
                <div className="ml-3 shrink-0">{childVerwalterEinstellungenErlaubt ? <ToggleRight size={28} className="text-green-400" /> : <ToggleLeft size={28} className="text-gray-600" />}</div>
              </button>
              <p className="text-xs text-orange-400/70 flex items-center gap-1"><AlertTriangle size={12} />Ab FSK 16 kannst du selbst entscheiden ob dein Verwalter Einstellungen aendern darf.</p>
            </div>
          )}

          {isChildAccount && (loadFsk()?.level ?? 6) >= 12 && identity && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Aenderungsverlauf</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4">
                <button onClick={async () => {
                  if (!identity) return;
                  setChildAuditLoading(true);
                  try {
                    const ts = new Date().toISOString();
                    const sig = await signData(identity.privateKeyJwk, identity.aregoId + 'audit' + ts);
                    const params = new URLSearchParams({ requester_id: identity.aregoId, signature: sig, timestamp: ts });
                    const resp = await fetch(`/child-settings/audit/${encodeURIComponent(identity.aregoId)}?${params}`);
                    if (resp.ok) { const data = await resp.json(); setChildAuditLog(data.audits ?? []); }
                  } catch (err) { console.error('audit-log Fehler:', err); }
                  setChildAuditLoading(false);
                }} className="w-full flex items-center justify-center gap-2 py-2 text-sm text-pink-400 hover:text-pink-300">
                  <History size={16} /> Aenderungsverlauf anzeigen
                </button>
                {childAuditLog.length > 0 && (
                  <div className="mt-3 divide-y divide-gray-700/50 max-h-64 overflow-y-auto">
                    {childAuditLog.map(entry => (
                      <div key={entry.id} className="py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-pink-400">{entry.kategorie}</span>
                          <span className="text-[10px] text-gray-600">{new Date(entry.zeitstempel).toLocaleString('de-DE')}</span>
                        </div>
                        <p className="text-xs text-gray-400">{entry.aktion}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isChildAccount && (!showAddChild ? (
            <button
              onClick={() => {
                if (!isFsk18) {
                  const el = document.createElement('div');
                  el.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-orange-600 text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm font-medium max-w-xs text-center';
                  el.textContent = t('settings.addChildFsk18Required');
                  document.body.appendChild(el);
                  setTimeout(() => el.remove(), 3000);
                  return;
                }
                handleGenerateQR();
              }}
              className={`w-full font-semibold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-98 ${isFsk18 ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-600/20' : 'bg-gray-800 text-gray-500 border border-gray-700/50 cursor-not-allowed'}`}
            >
              <QrCode size={20} /> {t('settings.addChild')}
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{t('settings.addChild')}</h3>
                <button onClick={() => { setShowAddChild(false); setQrDataUrl(null); }} className="p-1 text-gray-500 hover:text-white"><X size={20} /></button>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex gap-2">
                <Shield size={16} className="text-green-400 shrink-0 mt-0.5" />
                <p className="text-xs text-green-300/80">{t('settings.addChildFskHint')}</p>
              </div>
              {qrDataUrl && (
                <div className="flex flex-col items-center space-y-3">
                  <div className="bg-gray-900 p-4 rounded-2xl"><img src={qrDataUrl} alt="Child Link QR" className="w-56 h-56" /></div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><QrCode size={14} /><span>{t('settings.addChildScanInstruction')}</span></div>
                </div>
              )}
            </motion.div>
          ))}

          {(isChildAccount || !loadFsk()?.verified) && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('settings.fskParentTitle')}</h3>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="bg-pink-500/20 p-2 rounded-lg text-pink-400"><HeartHandshake size={18} /></div>
                  <div><p className="font-medium">{t('settings.fskParentTitle')}</p><p className="text-xs text-gray-500">{t('settings.fskParentDesc')}</p></div>
                </div>
                {parentLinked || (loadFsk()?.verified && loadFsk()?.method === "parent") ? (
                  <div className="flex items-center gap-2 justify-center py-2">
                    <Check size={18} className="text-green-400" />
                    <p className="text-sm text-green-400">{t('settings.fskParentLinked', { name: parentLinked || t('settings.fskParentDefault') })}</p>
                  </div>
                ) : parentScanActive ? (
                  <>
                    <div id="parent-scan-region" className="w-full rounded-xl overflow-hidden" />
                    <button onClick={stopParentScanner} className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"><X size={18} />{t('common.cancel')}</button>
                  </>
                ) : (
                  <>
                    <button onClick={startParentScanner} className="w-full bg-pink-600 hover:bg-pink-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"><Camera size={18} />{t('settings.fskParentBtn')}</button>
                    <p className="text-xs text-gray-500 text-center">{t('settings.fskParentScanHint')}</p>
                  </>
                )}
                {parentScanError && <p className="text-xs text-red-400 text-center">{parentScanError}</p>}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
