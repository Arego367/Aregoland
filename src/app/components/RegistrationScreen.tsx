import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Shield, Key, CheckCircle2, ShieldAlert, Copy, Check, Download } from "lucide-react";
import QRCode from "react-qr-code";
import { createIdentity, encodeRecoveryPayload, UserIdentity } from "@/app/auth/identity";

interface RegistrationScreenProps {
  onComplete: (identity: UserIdentity) => void;
}

type Step = "intro" | "name" | "generating" | "backup" | "done";

export default function RegistrationScreen({ onComplete }: RegistrationScreenProps) {
  const [step, setStep] = useState<Step>("intro");
  const [displayName, setDisplayName] = useState("");
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [recoveryPayload, setRecoveryPayload] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const handleGenerateIdentity = async () => {
    setStep("generating");
    setError("");
    try {
      const newIdentity = await createIdentity(displayName);
      const payload = encodeRecoveryPayload(newIdentity);
      setIdentity(newIdentity);
      setRecoveryPayload(payload);
      setStep("backup");
    } catch (e) {
      setError("Fehler beim Generieren der Identität. Bitte versuche es erneut.");
      setStep("name");
    }
  };

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText(recoveryPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadKey = () => {
    const blob = new Blob([recoveryPayload], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aregoland-recovery-${identity?.aregoId ?? "key"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFinish = () => {
    if (identity) onComplete(identity);
  };

  return (
    <div className="relative w-full h-screen bg-gray-900 text-white overflow-hidden flex flex-col items-center justify-center font-sans">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950" />

      <div className="z-10 w-full max-w-md px-6 flex flex-col items-center">
        <AnimatePresence mode="wait">

          {/* Schritt 1: Intro */}
          {step === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="bg-blue-600 p-5 rounded-3xl mb-8 shadow-2xl shadow-blue-500/20"
              >
                <Shield size={52} className="text-white" />
              </motion.div>

              <h1 className="text-3xl font-extrabold mb-3 tracking-tight">
                Konto erstellen
              </h1>
              <p className="text-gray-400 text-base mb-3 leading-relaxed">
                Deine Identität wird <strong className="text-white">lokal auf deinem Gerät</strong> mit einem kryptografischen Schlüsselpaar erstellt.
              </p>
              <p className="text-gray-500 text-sm mb-10 leading-relaxed">
                Kein Passwort. Kein Benutzername. Kein Server speichert deine Zugangsdaten.
              </p>

              <div className="w-full space-y-3">
                <button
                  onClick={() => setStep("name")}
                  className="w-full group bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 active:scale-98"
                >
                  <span className="text-lg">Weiter</span>
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Schritt 2: Name eingeben */}
          {step === "name" && (
            <motion.div
              key="name"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="w-full flex flex-col"
            >
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-blue-600/20 p-2 rounded-xl">
                    <Key size={22} className="text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Wie heißt du?</h2>
                </div>
                <p className="text-gray-400 text-sm ml-1">
                  Dein Anzeigename — kann später geändert werden.
                </p>
              </div>

              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerateIdentity()}
                placeholder="z.B. Aras"
                maxLength={40}
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 focus:outline-none rounded-xl px-4 py-3.5 text-lg text-white placeholder-gray-500 transition-colors mb-2"
              />
              <p className="text-xs text-gray-600 mb-8 ml-1">
                Kann auch leer gelassen werden — du kannst ihn jederzeit im Profil ändern.
              </p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerateIdentity}
                className="w-full group bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 active:scale-98"
              >
                <span>Identität erstellen</span>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          )}

          {/* Schritt 3: Generieren */}
          {step === "generating" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center text-center py-8"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="w-16 h-16 border-4 border-blue-600/30 border-t-blue-500 rounded-full mb-8"
              />
              <h2 className="text-2xl font-bold mb-3">Schlüssel wird generiert</h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
                Dein kryptografisches Schlüsselpaar wird direkt auf deinem Gerät erstellt (P-256 / ECDSA).
              </p>
            </motion.div>
          )}

          {/* Schritt 4: Backup QR-Code */}
          {step === "backup" && identity && (
            <motion.div
              key="backup"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="w-full flex flex-col"
            >
              <div className="mb-5">
                <h2 className="text-2xl font-bold mb-1">Wiederherstellungs-QR</h2>
                <p className="text-gray-400 text-sm">
                  Sichere diesen QR-Code — er ist der einzige Weg, dein Konto auf einem neuen Gerät wiederherzustellen.
                </p>
              </div>

              {/* Arego ID */}
              <div className="bg-gray-800/60 border border-gray-700 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Deine Arego ID</p>
                  <p className="text-base font-mono font-bold text-blue-400 tracking-widest">
                    {identity.aregoId}
                  </p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(identity.aregoId)}
                  className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-all"
                >
                  <Copy size={16} />
                </button>
              </div>

              {/* QR Code */}
              <div className="flex justify-center mb-4">
                <div className="bg-white p-4 rounded-2xl shadow-xl">
                  <QRCode
                    value={recoveryPayload}
                    size={180}
                    bgColor="#ffffff"
                    fgColor="#111827"
                  />
                </div>
              </div>

              {/* Recovery Key Text */}
              <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-3 mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-gray-500">Wiederherstellungs-Schlüssel (Text)</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleDownloadKey}
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Download size={14} />
                      Speichern
                    </button>
                    <button
                      onClick={handleCopyKey}
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "Kopiert" : "Kopieren"}
                    </button>
                  </div>
                </div>
                <p className="font-mono text-[10px] text-gray-400 break-all leading-relaxed line-clamp-3">
                  {recoveryPayload}
                </p>
              </div>

              {/* Warnung */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-4 flex gap-2.5">
                <ShieldAlert size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-200/80 leading-relaxed">
                  Der QR-Code enthält deinen privaten Schlüssel. Speichere ihn sicher und teile ihn mit niemandem.
                </p>
              </div>

              {/* Bestätigung */}
              <label className="flex items-start gap-3 cursor-pointer mb-5 group">
                <div
                  onClick={() => setBackupConfirmed((v) => !v)}
                  className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-all ${
                    backupConfirmed
                      ? "bg-blue-600 border-blue-600"
                      : "border-gray-600 group-hover:border-gray-400"
                  }`}
                >
                  {backupConfirmed && <Check size={12} className="text-white" />}
                </div>
                <span className="text-sm text-gray-300 leading-snug">
                  Ich habe den QR-Code oder Schlüssel sicher gespeichert und verstehe, dass er nicht wiederherstellbar ist.
                </span>
              </label>

              <button
                onClick={handleFinish}
                disabled={!backupConfirmed}
                className="w-full group bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 active:scale-98"
              >
                <CheckCircle2 size={20} />
                <span>Loslegen</span>
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Schritt-Indikator */}
      <div className="absolute bottom-8 z-10 flex gap-2">
        {(["intro", "name", "backup"] as const).map((s, i) => (
          <motion.div
            key={s}
            animate={{
              width: step === s || (step === "generating" && s === "name") ? 24 : 8,
              backgroundColor:
                step === s || (step === "generating" && s === "name")
                  ? "#2563eb"
                  : "#374151",
            }}
            className="h-2 rounded-full"
          />
        ))}
      </div>
    </div>
  );
}
