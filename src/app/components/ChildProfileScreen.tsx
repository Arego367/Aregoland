import { useState } from "react";
import { ArrowLeft, Plus, User, Shield, Smartphone, ChevronRight, Check, QrCode } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from "motion/react";
import { ImageWithFallback } from "@/app/components/ImageWithFallback";

interface ChildProfileScreenProps {
  onBack: () => void;
}

interface ChildProfile {
  id: string;
  name: string;
  ageRating: number;
  avatar: string;
}

export default function ChildProfileScreen({ onBack }: ChildProfileScreenProps) {
  const { t } = useTranslation();

  const FSK_OPTIONS = [
    {
      age: 6,
      label: "FSK 6",
      description: t('childProfile.fsk6Desc'),
      color: "bg-green-500"
    },
    {
      age: 12,
      label: "FSK 12",
      description: t('childProfile.fsk12Desc'),
      color: "bg-yellow-500"
    },
    {
      age: 14,
      label: "FSK 14",
      description: t('childProfile.fsk14Desc'),
      color: "bg-orange-500"
    },
    {
      age: 16,
      label: "FSK 16",
      description: t('childProfile.fsk16Desc'),
      color: "bg-red-500"
    },
  ];
  const [view, setView] = useState<"list" | "add" | "qr">("list");
  const [selectedFSK, setSelectedFSK] = useState<number | null>(null);
  
  // Mock data for existing children
  const [children, setChildren] = useState<ChildProfile[]>([
    { 
      id: "1", 
      name: "Leon", 
      ageRating: 12, 
      avatar: "https://images.unsplash.com/photo-1540479859555-17af45c78602?w=400&auto=format&fit=crop&q=60"
    }
  ]);

  const handleAddChild = () => {
    setView("add");
    setSelectedFSK(null); // Reset selection
  };

  const handleGenerateQR = () => {
    if (selectedFSK) {
      setView("qr");
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button 
          onClick={view === "list" ? onBack : () => setView("list")}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">
          {view === "list" && t('childProfile.title')}
          {view === "add" && t('childProfile.newProfile')}
          {view === "qr" && t('childProfile.pairDevice')}
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          
          {/* VIEW: LIST */}
          {view === "list" && (
            <motion.div 
              key="list"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-lg mx-auto space-y-6"
            >
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex gap-4 items-start">
                <Shield className="text-blue-400 shrink-0 mt-1" />
                <div className="text-sm text-gray-300">
                  <h3 className="font-bold text-blue-400 mb-1">{t('childProfile.childProtectionActive')}</h3>
                  <p>{t('childProfile.childProtectionDesc')}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">{t('childProfile.linkedProfiles')}</h3>
                
                {children.map(child => (
                  <div key={child.id} className="bg-gray-800 rounded-2xl p-4 flex items-center justify-between border border-gray-700">
                    <div className="flex items-center gap-4">
                      <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-gray-600">
                        <ImageWithFallback src={child.avatar} alt={child.name} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="font-bold text-lg">{child.name}</div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span className={`px-1.5 py-0.5 rounded text-white font-bold ${
                            child.ageRating <= 6 ? "bg-green-600" : 
                            child.ageRating <= 12 ? "bg-yellow-600" : 
                            child.ageRating <= 14 ? "bg-orange-600" : "bg-red-600"
                          }`}>
                            FSK {child.ageRating}
                          </span>
                          <span>• {t('childProfile.onlineAgo')}</span>
                        </div>
                      </div>
                    </div>
                    <button className="p-2 text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded-full transition-colors">
                      <ChevronRight size={20} />
                    </button>
                  </div>
                ))}

                <button 
                  onClick={handleAddChild}
                  className="w-full bg-gray-800/50 hover:bg-gray-800 border border-gray-700 border-dashed rounded-2xl p-4 flex items-center justify-center gap-2 text-gray-400 hover:text-white transition-all group"
                >
                  <div className="bg-gray-700 group-hover:bg-blue-600 p-2 rounded-full transition-colors text-white">
                    <Plus size={20} />
                  </div>
                  <span className="font-medium">{t('childProfile.addChild')}</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* VIEW: ADD (SELECT FSK) */}
          {view === "add" && (
            <motion.div 
              key="add"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-lg mx-auto space-y-6 pb-8"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-700">
                  <User size={32} className="text-gray-400" />
                </div>
                <h2 className="text-xl font-bold">{t('childProfile.selectAge')}</h2>
                <p className="text-gray-400 text-sm mt-1">{t('childProfile.selectAgeDesc')}</p>
              </div>

              <div className="space-y-3">
                {FSK_OPTIONS.map((option) => (
                  <button
                    key={option.age}
                    onClick={() => setSelectedFSK(option.age)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all relative overflow-hidden group ${
                      selectedFSK === option.age 
                      ? "bg-blue-900/20 border-blue-500" 
                      : "bg-gray-800 border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-start justify-between relative z-10">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-lg shrink-0 ${option.color}`}>
                          {option.age}
                        </div>
                        <div>
                          <div className={`font-bold text-lg ${selectedFSK === option.age ? "text-blue-400" : "text-white"}`}>
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-400 mt-1 leading-relaxed pr-6">
                            {option.description}
                          </div>
                        </div>
                      </div>
                      
                      {selectedFSK === option.age && (
                        <div className="bg-blue-500 rounded-full p-1 shadow-lg shadow-blue-500/50">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-4">
                <button
                  disabled={!selectedFSK}
                  onClick={handleGenerateQR}
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                    selectedFSK 
                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25" 
                    : "bg-gray-800 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {t('common.next')}
                </button>
              </div>
            </motion.div>
          )}

          {/* VIEW: QR CODE */}
          {view === "qr" && (
            <motion.div 
              key="qr"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-lg mx-auto flex flex-col items-center justify-center h-full text-center"
            >
              <h2 className="text-2xl font-bold mb-2">{t('childProfile.scanQR')}</h2>
              <p className="text-gray-400 mb-8 max-w-xs">
                {t('childProfile.scanQRDesc')}
              </p>

              <div className="bg-white p-4 rounded-3xl shadow-2xl shadow-blue-900/20 mb-8 relative">
                <div className="border-2 border-dashed border-gray-300 rounded-2xl p-2">
                   {/* Simulated QR Code */}
                   <div className="w-64 h-64 bg-gray-100 rounded-xl overflow-hidden relative">
                      <ImageWithFallback
                        src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=aregoland-child-setup-token-123"
                        alt="Setup QR Code"
                        className="w-full h-full object-contain mix-blend-multiply"
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <div className="bg-white p-2 rounded-full shadow-lg">
                            <Smartphone className="text-blue-600" size={32} />
                         </div>
                      </div>
                   </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800/50 px-4 py-2 rounded-full border border-gray-700">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>{t('childProfile.waitingForScan')}</span>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
