import { useState } from "react";
import { ArrowLeft, Shield, QrCode, X } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from "motion/react";
import QRCode from "qrcode";
import { loadIdentity, createChildLinkPayload } from "@/app/auth/identity";

interface ChildProfileScreenProps {
  onBack: () => void;
}

export default function ChildProfileScreen({ onBack }: ChildProfileScreenProps) {
  const { t } = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const handleGenerateQR = async () => {
    const identity = loadIdentity();
    if (!identity) return;
    const payload = createChildLinkPayload(identity);
    const url = await QRCode.toDataURL(payload, { width: 280, margin: 2, color: { dark: '#ffffff', light: '#00000000' } });
    setQrDataUrl(url);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button
          onClick={() => { setQrDataUrl(null); onBack(); }}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">{t('childProfile.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto space-y-6">

          <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl flex gap-3">
            <Shield className="text-green-400 shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-green-200/80 leading-relaxed space-y-1">
              <p className="font-medium text-green-400">{t('settings.addChildFskHint')}</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!qrDataUrl ? (
              <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button
                  onClick={handleGenerateQR}
                  className="w-full bg-pink-600 hover:bg-pink-500 text-white font-semibold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-pink-600/20"
                >
                  <QrCode size={20} />
                  {t('settings.addChild')}
                </button>
              </motion.div>
            ) : (
              <motion.div key="qr" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{t('settings.addChild')}</h3>
                  <button onClick={() => setQrDataUrl(null)} className="p-1 text-gray-500 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex flex-col items-center space-y-3">
                  <div className="bg-gray-900 p-4 rounded-2xl">
                    <img src={qrDataUrl} alt="Child Link QR" className="w-56 h-56" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <QrCode size={14} />
                    <span>{t('settings.qrTTL')}</span>
                  </div>
                </div>

                <p className="text-xs text-gray-500 text-center">{t('settings.addChildScanInstruction')}</p>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
