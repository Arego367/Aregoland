import { useState } from "react";
import { ArrowLeft, Camera, Copy, Check, User, Info, Phone, Mail, Instagram, MapPin, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { motion } from "motion/react";

interface ProfileScreenProps {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: ProfileScreenProps) {
  // Mock data - in a real app this would come from a backend/state manager
  const [uniqueId] = useState("AC-8923-XK92"); // Read-only ID
  const [copied, setCopied] = useState(false);
  
  // Form state
  const [firstName, setFirstName] = useState("Max");
  const [lastName, setLastName] = useState("Mustermann");
  const [nickname, setNickname] = useState("Mäxchen");
  const [status, setStatus] = useState("Verfügbar");
  
  // Social Media
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [otherSocial, setOtherSocial] = useState("");

  // Address
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Deutschland");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const handleCopyId = () => {
    navigator.clipboard.writeText(uniqueId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    // Mock save logic
    alert("Profil lokal gespeichert!");
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
        <h1 className="text-xl font-bold">Mein Profil</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-lg mx-auto w-full flex flex-col items-center">
          
          {/* Avatar Section */}
          <div className="relative mb-8 group cursor-pointer">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-800 shadow-xl">
              <ImageWithFallback 
                src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=800&auto=format&fit=crop&q=60"
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={32} className="text-white" />
            </div>
            <div className="absolute bottom-1 right-1 bg-blue-600 p-2 rounded-full border-4 border-gray-900 text-white">
              <Camera size={16} />
            </div>
          </div>

          {/* Unique ID Section - Non-editable & Prominent */}
          <div className="w-full bg-blue-900/20 border border-blue-500/30 rounded-2xl p-4 mb-4 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
            <span className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">Deine Aregoland ID</span>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-mono font-bold tracking-widest text-white">{uniqueId}</span>
              <button
                onClick={handleCopyId}
                className="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500/20 rounded-lg transition-colors"
                title="ID kopieren"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Diese ID ist einzigartig und kann nicht geändert werden. Andere Nutzer können dich darüber finden.
            </p>
          </div>

          {/* Privacy Notice */}
          <div className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-8 flex items-start gap-3">
             <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={18} />
             <p className="text-xs text-yellow-200/80 leading-relaxed">
               <strong>Hinweis:</strong> Alle folgenden Daten sind optional. Sie werden <u>nicht</u> auf dem Server gespeichert, sondern verbleiben ausschließlich lokal auf deinem Gerät.
             </p>
          </div>

          {/* Form Fields */}
          <div className="w-full space-y-8">
            
            {/* Personal Info */}
            <div className="space-y-4">
               <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1">Persönliche Daten</h3>
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">Vorname</label>
                    <input 
                      type="text" 
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Max"
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">Nachname</label>
                    <input 
                      type="text" 
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Mustermann"
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-400 flex items-center gap-1"><User size={12}/> Spitzname</label>
                  <input 
                    type="text" 
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Dein Spitzname"
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
               </div>

               <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-400 flex items-center gap-1"><Info size={12}/> Info / Status</label>
                  <input 
                    type="text" 
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    placeholder="Wie geht es dir?"
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
               </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1 flex items-center gap-2">
                <MapPin size={14} /> Adresse
              </h3>
              
              <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-gray-400">Straße</label>
                    <input 
                      type="text" 
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Musterstraße"
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">Nr.</label>
                    <input 
                      type="text" 
                      value={houseNumber}
                      onChange={(e) => setHouseNumber(e.target.value)}
                      placeholder="1"
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
               </div>

               <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">PLZ</label>
                    <input 
                      type="text" 
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="12345"
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-gray-400">Ort</label>
                    <input 
                      type="text" 
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Musterstadt"
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-400">Land</label>
                  <input 
                    type="text" 
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Deutschland"
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
               </div>
            </div>

            {/* Social Media */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1 flex items-center gap-2">
                <LinkIcon size={14} /> Social Media
              </h3>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 flex items-center gap-2"><Instagram size={12}/> Instagram</label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-gray-500 text-sm">@</span>
                  <input 
                    type="text" 
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="username"
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-8 pr-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 flex items-center gap-2">
                   {/* TikTok Icon Placeholder since lucide might not have it, using generic or text */}
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>
                   TikTok
                </label>
                <div className="relative">
                   <span className="absolute left-4 top-2.5 text-gray-500 text-sm">@</span>
                  <input 
                    type="text" 
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    placeholder="username"
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-8 pr-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 flex items-center gap-2"><LinkIcon size={12}/> Andere (Website/Link)</label>
                <input 
                  type="url" 
                  value={otherSocial}
                  onChange={(e) => setOtherSocial(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1">Kontakt</h3>
              
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 flex items-center gap-2">
                  <Phone size={12} /> Telefonnummer
                </label>
                <input 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+49 123 4567890"
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 flex items-center gap-2">
                  <Mail size={12} /> E-Mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="beispiel@aregoland.chat"
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

          </div>

          <div className="h-10"></div>
          
          <button 
            onClick={handleSave}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-600/20 active:scale-98 transition-all flex items-center justify-center gap-2 sticky bottom-6 z-10"
          >
            <Check size={20} />
            Speichern
          </button>
          
          <div className="h-10"></div>
        </div>
      </div>
    </div>
  );
}
