import { ArrowLeft, Share2, RotateCcw, Download, Clock, Camera, UserPlus, Baby, Calendar as CalendarIcon, ExternalLink, FileText, X } from "lucide-react";
import QRCode from "react-qr-code";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from "motion/react";
import { loadIdentity, decodeChildLinkPayload } from "@/app/auth/identity";
import { createSharePayload, encodePayload, decodePayload, type ContactSharePayload } from "@/app/auth/share";
import { saveContact, isNonceUsed, markNonceUsed, type StoredContact } from "@/app/auth/contacts";
import { Html5Qrcode } from "html5-qrcode";

interface QRCodeScreenProps {
  onBack: () => void;
  initialMode?: "display" | "scan";
}

type ScanResult =
  | { type: "contact"; payload: ContactSharePayload }
  | { type: "child-link"; parentId: string; parentName: string }
  | { type: "link"; url: string }
  | { type: "unknown"; raw: string };

function classifyScan(raw: string): ScanResult {
  // 1. Try contact payload
  const contact = decodePayload(raw);
  if (contact && contact.aregoId) {
    return { type: "contact", payload: contact };
  }
  // 2. Try child-link payload
  const child = decodeChildLinkPayload(raw);
  if (child) {
    return { type: "child-link", parentId: child.parentId, parentName: child.parentName };
  }
  // 3. URL
  if (/^https?:\/\//i.test(raw.trim())) {
    return { type: "link", url: raw.trim() };
  }
  // 4. Unknown
  return { type: "unknown", raw };
}

export default function QRCodeScreen({ onBack, initialMode = "display" }: QRCodeScreenProps) {
  const { t } = useTranslation();
  const identity = useMemo(() => loadIdentity(), []);
  const [mode, setMode] = useState<"display" | "scan">(initialMode);

  // ── Display state ──
  const [payload, setPayload] = useState<ContactSharePayload | null>(null);
  const [encoded, setEncoded] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const qrRef = useRef<HTMLDivElement>(null);

  const generate = useCallback(() => {
    if (!identity) return;
    const p = createSharePayload(identity, 10 * 60 * 1000);
    setPayload(p);
    setEncoded(encodePayload(p));
    setTimeLeft(600);
  }, [identity]);

  useEffect(() => { generate(); }, [generate]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [timeLeft > 0]);

  const isExpired = timeLeft <= 0 && payload !== null;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const displayName = useMemo(() => {
    try {
      const p = JSON.parse(localStorage.getItem("arego_profile") ?? "{}");
      return [p.firstName, p.lastName].filter(Boolean).join(" ") || identity?.displayName || "";
    } catch { return identity?.displayName ?? ""; }
  }, [identity]);

  const handleShare = async () => {
    if (isExpired || !encoded) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Aregoland",
          text: `${displayName} auf Aregoland hinzufuegen`,
          url: `https://aregoland.de/?qr=${encodeURIComponent(encoded)}`,
        });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(encoded);
    }
  };

  const handleDownload = () => {
    if (isExpired || !qrRef.current) return;
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width + 48;
      canvas.height = img.height + 48;
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 24, 24);
        const a = document.createElement("a");
        a.download = `Aregoland-QR-${identity?.aregoId ?? "code"}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      }
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  // ── Scan state ──
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanContainerRef = useRef<HTMLDivElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState("");
  const [contactAdded, setContactAdded] = useState(false);

  const startScanner = useCallback(async () => {
    if (scannerRef.current || !scanContainerRef.current) return;
    setScanResult(null);
    setScanError("");
    setContactAdded(false);
    try {
      // Check for cameras first — prevents hanging on browsers without camera
      const cameras = await Promise.race([
        Html5Qrcode.getCameras(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
      ]);
      if (!cameras || cameras.length === 0) {
        setScanError(t('qrScreen.noCamera'));
        return;
      }
      const scanner = new Html5Qrcode("qr-scan-region");
      scannerRef.current = scanner;
      await Promise.race([
        scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            scanner.stop().catch(() => {});
            scannerRef.current = null;
            setScanning(false);
            setScanResult(classifyScan(decoded));
          },
          () => {}
        ),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      setScanning(true);
    } catch {
      // Clean up scanner if it was created but start failed/timed out
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      setScanError(t('qrScreen.noCamera'));
    }
  }, [t]);

  const stopScanner = useCallback(() => {
    scannerRef.current?.stop().catch(() => {});
    scannerRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    if (mode === "scan") startScanner();
    return () => stopScanner();
  }, [mode]);

  const handleAddContact = () => {
    if (!identity || scanResult?.type !== "contact") return;
    const p = scanResult.payload;
    if (Date.now() > p.exp) { setScanError(t('addContact.codeExpired')); return; }
    if (isNonceUsed(p.n)) { setScanError(t('addContact.codeUsed')); return; }
    markNonceUsed(p.n);
    const contact: StoredContact = {
      aregoId: p.aregoId,
      displayName: p.displayName,
      publicKeyJwk: p.publicKeyJwk,
      addedAt: new Date().toISOString(),
    };
    saveContact(contact);
    setContactAdded(true);
  };

  const resetScan = () => {
    setScanResult(null);
    setScanError("");
    setContactAdded(false);
    startScanner();
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button
          onClick={() => { stopScanner(); onBack(); }}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">{t('qrScreen.title')}</h1>
      </header>

      {/* Mode Switcher */}
      <div className="px-6 pt-4">
        <div className="bg-gray-800 p-1 rounded-xl flex">
          <button
            onClick={() => { stopScanner(); setMode("display"); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === "display" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {t('qrScreen.myCode')}
          </button>
          <button
            onClick={() => setMode("scan")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === "scan" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {t('qrScreen.scan')}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto">

        {/* ── DISPLAY MODE ── */}
        {mode === "display" && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full max-w-sm flex flex-col items-center"
          >
            {/* Timer Badge */}
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-mono font-medium mb-6 transition-colors ${
              isExpired
                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                : timeLeft < 60
                  ? "bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse"
                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
            }`}>
              <Clock size={14} />
              {isExpired ? t('qrScreen.expired') : t('qrScreen.validFor', { time: formatTime(timeLeft) })}
            </div>

            {/* QR Code */}
            <div className="relative group">
              <div
                ref={qrRef}
                className={`bg-white p-6 rounded-3xl shadow-2xl shadow-blue-500/10 mb-6 w-full max-w-[280px] aspect-square flex items-center justify-center transition-all duration-500 ${isExpired ? "blur-md grayscale opacity-50" : ""}`}
              >
                {encoded ? (
                  <QRCode value={encoded} size={256} style={{ height: "100%", width: "100%" }} viewBox="0 0 256 256" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">...</div>
                )}
              </div>

              {isExpired && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                  <div className="bg-gray-900/90 backdrop-blur-sm p-4 rounded-2xl border border-gray-700 shadow-xl flex flex-col items-center gap-3">
                    <span className="text-gray-300 font-medium">{t('qrScreen.codeExpired')}</span>
                    <button
                      onClick={generate}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
                    >
                      <RotateCcw size={16} />
                      {t('qrScreen.recreate')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Name + ID */}
            <h2 className="text-2xl font-bold mb-1 text-center">{displayName}</h2>
            <p className="text-blue-400 font-mono tracking-widest text-lg mb-8 bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">
              {identity?.aregoId ?? ""}
            </p>

            <p className="text-gray-400 text-center text-sm leading-relaxed mb-8 px-4">
              {t('qrScreen.scanHint')} <br />
              <span className="text-xs opacity-60">{t('qrScreen.autoRenew')}</span>
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3 w-full">
              <button
                onClick={handleShare}
                disabled={isExpired}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white px-4 py-3.5 rounded-xl transition-all font-medium shadow-lg shadow-blue-600/20 active:scale-95"
              >
                <Share2 size={20} />
                {t('common.share')}
              </button>
              <button
                onClick={handleDownload}
                disabled={isExpired}
                className="flex-none flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-3.5 rounded-xl transition-all font-medium border border-gray-700 active:scale-95"
                title={t('qrScreen.saveAsImage')}
              >
                <Download size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── SCAN MODE ── */}
        {mode === "scan" && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full h-full flex flex-col items-center"
          >
            {/* Scanner viewport */}
            {!scanResult && (
              <>
                <div
                  id="qr-scan-region"
                  ref={scanContainerRef}
                  className="w-full max-w-[320px] aspect-square rounded-3xl overflow-hidden border border-gray-700 mt-4 bg-black"
                />
                {scanError && (
                  <p className="text-red-400 text-sm mt-4 text-center">{scanError}</p>
                )}
                {!scanning && !scanError && (
                  <button
                    onClick={startScanner}
                    className="mt-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-medium transition-all"
                  >
                    <Camera size={20} />
                    {t('qrScreen.startCamera')}
                  </button>
                )}
                <p className="text-gray-400 text-center text-sm mt-6 max-w-xs">
                  {t('qrScreen.pointCamera')}
                </p>
              </>
            )}

            {/* ── Scan Result ── */}
            <AnimatePresence>
              {scanResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-sm mt-4 space-y-4"
                >
                  {/* Contact */}
                  {scanResult.type === "contact" && !contactAdded && (
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-xl font-bold text-white">
                          {(scanResult.payload.displayName[0] ?? "").toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-lg">{scanResult.payload.displayName}</div>
                          <div className="text-sm text-gray-400 font-mono">{scanResult.payload.aregoId}</div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-400">{t('qrScreen.addContactQuestion')}</p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleAddContact}
                          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium transition-all"
                        >
                          <UserPlus size={18} />
                          {t('people.addContact')}
                        </button>
                        <button
                          onClick={resetScan}
                          className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium border border-gray-700 transition-all"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      {scanError && <p className="text-red-400 text-sm">{scanError}</p>}
                    </div>
                  )}

                  {/* Contact added success */}
                  {scanResult.type === "contact" && contactAdded && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5 text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                        <UserPlus size={28} className="text-green-400" />
                      </div>
                      <div className="font-bold text-lg text-green-400">{t('addContact.contactAdded')}</div>
                      <div className="text-sm text-gray-400">{scanResult.payload.displayName}</div>
                      <button onClick={resetScan} className="mt-2 bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-700 transition-all">
                        {t('qrScreen.scanAnother')}
                      </button>
                    </div>
                  )}

                  {/* Child link */}
                  {scanResult.type === "child-link" && (
                    <div className="bg-pink-500/10 border border-pink-500/30 rounded-2xl p-5 text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center mx-auto">
                        <Baby size={28} className="text-pink-400" />
                      </div>
                      <div className="font-bold text-lg">{t('qrScreen.childLinkDetected')}</div>
                      <div className="text-sm text-gray-400">{t('qrScreen.childLinkDesc', { name: scanResult.parentName })}</div>
                      <button onClick={resetScan} className="mt-2 bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-700 transition-all">
                        OK
                      </button>
                    </div>
                  )}

                  {/* URL */}
                  {scanResult.type === "link" && (
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                          <ExternalLink size={22} className="text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">Link</div>
                          <div className="text-xs text-gray-400 truncate">{scanResult.url}</div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => window.open(scanResult.url, "_blank")}
                          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium transition-all"
                        >
                          <ExternalLink size={16} />
                          {t('qrScreen.openLink')}
                        </button>
                        <button onClick={resetScan} className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium border border-gray-700 transition-all">
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Unknown */}
                  {scanResult.type === "unknown" && (
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-gray-700/50 flex items-center justify-center">
                          <FileText size={22} className="text-gray-400" />
                        </div>
                        <div className="font-medium">{t('qrScreen.scannedContent')}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-xl p-3 text-sm text-gray-300 font-mono break-all max-h-40 overflow-y-auto">
                        {scanResult.raw}
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => { navigator.clipboard.writeText(scanResult.raw); }}
                          className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl font-medium border border-gray-700 transition-all"
                        >
                          {t('common.copy')}
                        </button>
                        <button onClick={resetScan} className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium border border-gray-700 transition-all">
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
