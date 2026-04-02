import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, QrCode, Hash, RefreshCw, Copy, Check, UserPlus,
  ShieldCheck, AlertCircle, Loader2, Clock, CheckCircle2, Camera,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import * as Dialog from '@radix-ui/react-dialog';
import { Html5Qrcode } from 'html5-qrcode';
import { UserIdentity } from '@/app/auth/identity';
import { StoredContact, saveContact, isNonceUsed, markNonceUsed } from '@/app/auth/contacts';
import {
  createSharePayload, encodePayload, decodePayload,
  registerShortCode, redeemShortCode, ContactSharePayload,
} from '@/app/auth/share';

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  identity: UserIdentity | null;
  onContactAdded: (contact: StoredContact) => void;
}

type MainTab = 'mycode' | 'add';
type AddTab = 'shortcode' | 'qr';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function formatCountdown(ms: number, expiredLabel: string = 'Abgelaufen'): string {
  if (ms <= 0) return expiredLabel;
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// 6-Zeichen OTP-Input
function ShortCodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const CHARSET = /^[A-Za-z2-9]$/;
  // Einzelner Ref-Array — useRef darf nicht in Schleifen/Callbacks aufgerufen werden
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = value.split('');
      if (next[i]) {
        next[i] = '';
        onChange(next.join(''));
      } else if (i > 0) {
        inputRefs.current[i - 1]?.focus();
        next[i - 1] = '';
        onChange(next.join(''));
      }
    }
  };

  const handleChange = (i: number, raw: string) => {
    const char = raw.slice(-1).toUpperCase();
    if (!CHARSET.test(char)) return;
    const next = value.split('').slice(0, 6);
    while (next.length < 6) next.push('');
    next[i] = char;
    onChange(next.join(''));
    if (i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
    if (text.length > 0) {
      const padded = text.padEnd(6, '');
      onChange(padded);
      inputRefs.current[Math.min(text.length, 5)]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="text"
          maxLength={1}
          value={value[i] ?? ''}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onClick={() => refs[i].current?.select()}
          className={`w-11 h-14 text-center text-xl font-mono font-bold rounded-xl border-2 bg-gray-800 text-white outline-none transition-all
            ${value[i] ? 'border-blue-500 text-blue-300' : 'border-gray-700'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'focus:border-blue-400'}
          `}
        />
      ))}
    </div>
  );
}

// ── Mein Code Tab ────────────────────────────────────────────────────────────

function MyCodeView({ identity, onContactAdded }: { identity: UserIdentity; onContactAdded: (c: StoredContact) => void }) {
  const { t } = useTranslation();
  const [qrPayload, setQrPayload] = useState<ContactSharePayload | null>(null);
  const [qrEncoded, setQrEncoded] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [qrMs, setQrMs] = useState(0);
  const [codeMs, setCodeMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  // Hinweis: Gegenseitiger Kontakt-Austausch läuft automatisch über den
  // persistenten Inbox-Listener in App.tsx (inbox:<myAregoId>).
  // Kein separater WebSocket nötig — funktioniert auch wenn dieses Modal geschlossen ist.

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    setShortCode('');
    try {
      const payload = createSharePayload(identity, 10 * 60 * 1000); // 10 Min
      const encoded = encodePayload(payload);
      setQrPayload(payload);
      setQrEncoded(encoded);
      setQrMs(10 * 60 * 1000);

      const code = await registerShortCode(payload);
      setShortCode(code);
      setCodeMs(60 * 60 * 1000); // 1h
    } catch {
      setError(t('addContact.serverUnreachable'));
    } finally {
      setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    generate();
  }, [generate]);

  // Countdowns
  useEffect(() => {
    if (qrMs <= 0 && codeMs <= 0) return;
    const t = setInterval(() => {
      setQrMs((ms) => Math.max(0, ms - 1000));
      setCodeMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [qrMs > 0 || codeMs > 0]);

  const qrExpired = qrMs <= 0 && qrPayload !== null;

  return (
    <div className="space-y-4">
      {/* QR-Code */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <div className={`bg-white p-4 rounded-2xl shadow-xl transition-all ${qrExpired ? 'grayscale opacity-40 blur-sm' : ''}`}>
            {qrEncoded ? (
              <QRCode value={qrEncoded} size={180} bgColor="#fff" fgColor="#111827" />
            ) : (
              <div className="w-[180px] h-[180px] flex items-center justify-center">
                <Loader2 size={32} className="text-gray-400 animate-spin" />
              </div>
            )}
          </div>
          {qrExpired && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <button
                onClick={generate}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg"
              >
                <RefreshCw size={14} />
                {t('addContact.regenerate')}
              </button>
            </div>
          )}
        </div>

        {/* QR Timer */}
        <div className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${
          qrMs < 60_000 ? 'text-red-400' : 'text-gray-400'
        }`}>
          <Clock size={12} />
          <span>QR: {formatCountdown(qrMs, t('addContact.expired'))}</span>
        </div>
      </div>

      {/* Kurzcode */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Hash size={16} className="text-blue-400" />
            <span className="text-sm font-semibold text-white">{t('addContact.shortCode')}</span>
            <span className="text-xs text-gray-500">— {t('addContact.shortCodeHint')}</span>
          </div>
          <div className={`text-xs font-medium flex items-center gap-1 ${
            codeMs < 300_000 ? 'text-orange-400' : 'text-gray-500'
          }`}>
            <Clock size={11} />
            {formatCountdown(codeMs, t('addContact.expired'))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-2">
            <Loader2 size={20} className="text-blue-400 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-400 text-center">{error}</p>
        ) : shortCode ? (
          <div className="flex items-center justify-between bg-gray-900/60 rounded-xl px-4 py-3">
            <span className="text-2xl font-mono font-bold tracking-[0.3em] text-blue-300">
              {shortCode}
            </span>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shortCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-all"
            >
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>
        ) : null}

        <p className="text-xs text-gray-600 mt-2 text-center">
          {t('addContact.singleUse')}
        </p>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
        <ShieldCheck size={15} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-200/80 leading-relaxed">
          {t('addContact.privacyInfo')}
        </p>
      </div>

      {/* Hinweis: Gegenseitiger Kontakt-Austausch läuft automatisch im Hintergrund */}
      <div className="flex items-start gap-2 bg-gray-800/40 border border-gray-700/50 rounded-xl p-3">
        <ShieldCheck size={14} className="text-gray-500 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 leading-relaxed">
          {t('addContact.autoExchange')}
        </p>
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-all disabled:opacity-50"
      >
        <RefreshCw size={14} />
        {t('addContact.generateNewCodes')}
      </button>
    </div>
  );
}

// ── Hinzufügen Tab ───────────────────────────────────────────────────────────

function AddView({ identity, onContactAdded }: { identity: UserIdentity | null; onContactAdded: (c: StoredContact) => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AddTab>('shortcode');
  const [shortCodeInput, setShortCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<StoredContact | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanRegionId = 'add-contact-qr-scan';

  /**
   * Schickt die eigene Identität in den persönlichen Inbox-Raum der Gegenseite.
   * Der Server puffert die Nachricht falls B gerade offline ist (24h TTL).
   */
  const sendReverseIdentity = (targetAregoId: string) => {
    if (!identity) return;
    // 24h TTL damit die Nachricht auch nach Offline-Delivery noch gültig ist
    const myPayload = createSharePayload(identity, 24 * 60 * 60 * 1000);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws-signal`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId: `inbox:${targetAregoId}` }));
      ws.send(JSON.stringify({ type: 'contact_reverse', payload: encodePayload(myPayload) }));
      setTimeout(() => ws.close(), 3000);
    };
    ws.onerror = () => ws.close();
  };

  const processPayload = (payload: ContactSharePayload) => {
    if (payload.exp < Date.now()) {
      setError(t('addContact.codeExpired'));
      return;
    }
    if (isNonceUsed(payload.n)) {
      setError(t('addContact.codeUsed'));
      return;
    }
    markNonceUsed(payload.n);
    const contact: StoredContact = {
      aregoId: payload.aregoId,
      displayName: payload.displayName,
      publicKeyJwk: payload.publicKeyJwk,
      addedAt: new Date().toISOString(),
    };
    saveContact(contact);
    sendReverseIdentity(payload.aregoId);
    setSuccess(contact);
    onContactAdded(contact);
  };

  const handleShortCode = async () => {
    if (shortCodeInput.replace(/\s/g, '').length < 6) return;
    setLoading(true);
    setError('');
    try {
      const payload = await redeemShortCode(shortCodeInput);
      if (!payload) {
        setError(t('addContact.codeNotFound'));
        return;
      }
      processPayload(payload);
    } catch {
      setError(t('addContact.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch { /* ignore */ }
      try { scannerRef.current.clear(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setError('');
    setScanning(true);
    // Wait for DOM to render the scan region
    await new Promise(r => setTimeout(r, 200));
    try {
      const scanner = new Html5Qrcode(scanRegionId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          // QR decoded — try to parse as contact payload
          const payload = decodePayload(decodedText.trim());
          if (!payload) {
            setError(t('addContact.invalidQR'));
            stopScanner();
            return;
          }
          stopScanner();
          processPayload(payload);
        },
        () => { /* ignore scan failures */ }
      );
    } catch {
      setError(t('addContact.cameraError'));
      setScanning(false);
    }
  }, [stopScanner]);

  // Cleanup scanner when tab changes or unmount
  useEffect(() => {
    return () => { stopScanner(); };
  }, [tab, stopScanner]);

  if (success) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center text-center py-6 space-y-4"
      >
        <div className="bg-green-500/20 p-5 rounded-full">
          <CheckCircle2 size={48} className="text-green-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{success.displayName}</h3>
          <p className="text-sm text-gray-400 font-mono mt-1">{success.aregoId}</p>
        </div>
        <p className="text-sm text-gray-400">{t('addContact.contactAdded')}</p>
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2">
          <ShieldCheck size={14} className="text-green-400" />
          <span className="text-xs text-green-300">{t('addContact.p2pReady')}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-Tabs */}
      <div className="flex gap-2 bg-gray-800/60 rounded-xl p-1">
        <button
          onClick={() => { setTab('shortcode'); setError(''); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'shortcode' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Hash size={15} />
          {t('addContact.shortCode')}
        </button>
        <button
          onClick={() => { setTab('qr'); setError(''); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'qr' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <QrCode size={15} />
          QR-Code
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'shortcode' && (
          <motion.div
            key="shortcode"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
            <p className="text-sm text-gray-400 text-center">
              {t('addContact.enterShortCode')}
            </p>
            <ShortCodeInput
              value={shortCodeInput}
              onChange={setShortCodeInput}
              disabled={loading}
            />
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}
            <button
              onClick={handleShortCode}
              disabled={loading || shortCodeInput.replace(/\s/g, '').length < 6}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
              {loading ? t('addContact.checking') : t('addContact.addContact')}
            </button>
          </motion.div>
        )}

        {tab === 'qr' && (
          <motion.div
            key="qr"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-3"
          >
            <p className="text-sm text-gray-400 text-center">
              {t('addContact.scanQRHint')}
            </p>

            {/* Camera scanner area */}
            {scanning ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-700 bg-black">
                <div id={scanRegionId} className="w-full" />
                <button onClick={stopScanner}
                  className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors z-10">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button onClick={startScanner}
                className="w-full flex flex-col items-center gap-3 py-10 bg-gray-800/60 border-2 border-dashed border-gray-700 rounded-2xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all">
                <div className="w-16 h-16 rounded-full bg-blue-500/15 flex items-center justify-center">
                  <Camera size={28} className="text-blue-400" />
                </div>
                <span className="text-sm font-medium text-gray-300">{t('addContact.openCamera')}</span>
              </button>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Haupt-Modal ──────────────────────────────────────────────────────────────

export function AddContactModal({ open, onClose, identity, onContactAdded }: AddContactModalProps) {
  const { t } = useTranslation();
  const [mainTab, setMainTab] = useState<MainTab>('mycode');

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 border-t border-gray-800 rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300">
          {/* Drag Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-700 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3">
            <Dialog.Title className="text-lg font-bold text-white">{t('addContact.title')}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          {/* Haupt-Tabs */}
          <div className="flex gap-2 px-5 pb-3">
            <button
              onClick={() => setMainTab('mycode')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mainTab === 'mycode' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <QrCode size={16} />
              {t('addContact.myCode')}
            </button>
            <button
              onClick={() => setMainTab('add')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mainTab === 'add' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <UserPlus size={16} />
              {t('addContact.add')}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pb-8">
            <AnimatePresence mode="wait">
              {mainTab === 'mycode' ? (
                <motion.div
                  key="mycode"
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                >
                  {identity ? (
                    <MyCodeView identity={identity} onContactAdded={onContactAdded} />
                  ) : (
                    <p className="text-center text-gray-500 py-8">{t('addContact.registerFirst')}</p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="add"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                >
                  <AddView identity={identity} onContactAdded={onContactAdded} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
