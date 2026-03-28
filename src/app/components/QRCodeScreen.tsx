import { ArrowLeft, Share2, ScanLine, RotateCcw, Download, Clock, Camera } from "lucide-react";
import QRCode from "react-qr-code";
import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";

interface QRCodeScreenProps {
  onBack: () => void;
  initialMode?: "display" | "scan";
}

export default function QRCodeScreen({ onBack, initialMode = "display" }: QRCodeScreenProps) {
  const [mode, setMode] = useState<"display" | "scan">(initialMode);
  const [userId] = useState("AC-8923-XK92"); // Mock ID
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [isExpired, setIsExpired] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleRefresh = () => {
    setTimeLeft(600);
    setIsExpired(false);
  };

  const handleShare = async () => {
    if (isExpired) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Aregoland QR Code',
          text: `Hier ist mein Aregoland QR Code: ${userId}`,
          url: window.location.href, // In a real app, this might be a deep link
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      // Fallback: Copy to clipboard or show alert
      alert("Teilen-Dialog würde hier auf einem Mobilgerät geöffnet werden.");
    }
  };

  const handleDownload = () => {
    if (isExpired || !qrRef.current) return;

    const svg = qrRef.current.querySelector("svg");
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      
      img.onload = () => {
        canvas.width = img.width + 40; // Add padding
        canvas.height = img.height + 40;
        
        if (ctx) {
            // Draw white background
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Draw image centered
            ctx.drawImage(img, 20, 20);
            
            const pngFile = canvas.toDataURL("image/png");
            
            const downloadLink = document.createElement("a");
            downloadLink.download = `Aregoland-QR-${userId}.png`;
            downloadLink.href = pngFile;
            downloadLink.click();
        }
      };
      
      img.src = "data:image/svg+xml;base64," + btoa(svgData);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">QR-Code</h1>
      </header>

      {/* Mode Switcher */}
      <div className="px-6 pt-4">
        <div className="bg-gray-800 p-1 rounded-xl flex">
          <button 
            onClick={() => setMode("display")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === "display" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Mein Code
          </button>
          <button 
            onClick={() => setMode("scan")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === "scan" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Scannen
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto">
        
        {/* DISPLAY MODE */}
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
                  {isExpired ? "Abgelaufen" : `Gültig für: ${formatTime(timeLeft)}`}
              </div>

              {/* QR Code Container */}
              <div className="relative group">
                  <div 
                      ref={qrRef}
                      className={`bg-white p-6 rounded-3xl shadow-2xl shadow-blue-500/10 mb-6 w-full max-w-[280px] aspect-square flex items-center justify-center transition-all duration-500 ${isExpired ? "blur-md grayscale opacity-50" : ""}`}
                  >
                      <div className="w-full h-full">
                          <QRCode
                              value={`aregoland:user:${userId}:ts=${Date.now()}`} // Dynamic content
                              size={256}
                              style={{ height: "100%", width: "100%" }}
                              viewBox={`0 0 256 256`}
                          />
                      </div>
                  </div>

                  {/* Expired Overlay */}
                  {isExpired && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                          <div className="bg-gray-900/90 backdrop-blur-sm p-4 rounded-2xl border border-gray-700 shadow-xl flex flex-col items-center gap-3">
                              <span className="text-gray-300 font-medium">Code abgelaufen</span>
                              <button 
                                  onClick={handleRefresh}
                                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
                              >
                                  <RotateCcw size={16} />
                                  Neu erstellen
                              </button>
                          </div>
                      </div>
                  )}
              </div>

              <h2 className="text-2xl font-bold mb-1 text-center">Max Mustermann</h2>
              <p className="text-blue-400 font-mono tracking-widest text-lg mb-8 bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">{userId}</p>

              <p className="text-gray-400 text-center text-sm leading-relaxed mb-8 px-4">
                Andere können diesen Code scannen, um dich als Kontakt hinzuzufügen. <br/>
                <span className="text-xs opacity-60">Dieser Code erneuert sich automatisch zu deiner Sicherheit.</span>
              </p>
              
              {/* Action Buttons */}
              <div className="flex gap-3 w-full">
                  <button 
                      onClick={handleShare}
                      disabled={isExpired}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white px-4 py-3.5 rounded-xl transition-all font-medium shadow-lg shadow-blue-600/20 active:scale-95"
                  >
                      <Share2 size={20} />
                      Teilen
                  </button>
                  <button 
                      onClick={handleDownload}
                      disabled={isExpired}
                      className="flex-none flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-3.5 rounded-xl transition-all font-medium border border-gray-700 active:scale-95"
                      title="Als Bild speichern"
                  >
                      <Download size={20} />
                  </button>
              </div>
          </motion.div>
        )}

        {/* SCAN MODE */}
        {mode === "scan" && (
           <motion.div 
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             className="w-full h-full flex flex-col items-center"
           >
              <div className="relative w-full aspect-[3/4] max-w-[320px] bg-black rounded-3xl overflow-hidden shadow-2xl border border-gray-700 mt-4">
                 {/* Camera Placeholder */}
                 <div className="absolute inset-0 bg-gray-800 flex flex-col items-center justify-center text-gray-500 gap-4">
                    <div className="bg-gray-700/50 p-6 rounded-full">
                       <Camera size={48} className="text-gray-400" />
                    </div>
                    <p className="text-sm px-8 text-center">Kamerazugriff erforderlich, um QR-Codes zu scannen.</p>
                    <button className="text-blue-400 font-medium text-sm hover:underline">Zugriff erlauben</button>
                 </div>

                 {/* Scan Frame Overlay */}
                 <div className="absolute inset-0 border-[40px] border-black/50 z-10 pointer-events-none"></div>
                 <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <div className="w-48 h-48 border-2 border-white/50 rounded-xl relative">
                       <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1 rounded-tl-lg"></div>
                       <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1 rounded-tr-lg"></div>
                       <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1 rounded-bl-lg"></div>
                       <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1 rounded-br-lg"></div>
                       
                       {/* Scanning Line Animation */}
                       <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                    </div>
                 </div>
              </div>

              <p className="text-gray-400 text-center text-sm mt-8 max-w-xs">
                Richte die Kamera auf den QR-Code eines anderen Nutzers, um ihn hinzuzufügen.
              </p>
           </motion.div>
        )}

      </div>
      
      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
