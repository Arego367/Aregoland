import { useState } from "react";
import {
  ArrowLeft, Search, Heart, User, Users, Map, Globe,
  Calendar, Lock, CheckCircle, Plus, Info, ChevronRight, X
} from "lucide-react";
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from "motion/react";

interface ConnectScreenProps {
  onBack: () => void;
}

// Types
type ConnectCategory = "dating" | "friends" | "travel" | "events" | "networking";

interface CategoryInfo {
  id: ConnectCategory;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  image: string;
}

export default function ConnectScreen({ onBack }: ConnectScreenProps) {
  const { t } = useTranslation();

  const CATEGORIES: CategoryInfo[] = [
    {
      id: "dating",
      label: t('connect.dating'),
      description: t('connect.datingDesc'),
      icon: Heart,
      color: "from-pink-500 to-rose-500",
      image: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&q=80&w=800"
    },
    {
      id: "friends",
      label: t('connect.friendships'),
      description: t('connect.friendshipsDesc'),
      icon: Users,
      color: "from-blue-500 to-cyan-500",
      image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&q=80&w=800"
    },
    {
      id: "travel",
      label: t('connect.travel'),
      description: t('connect.travelDesc'),
      icon: Map,
      color: "from-green-500 to-emerald-500",
      image: "https://images.unsplash.com/photo-1503220317375-aaad61436b1b?auto=format&fit=crop&q=80&w=800"
    },
    {
      id: "events",
      label: t('connect.events'),
      description: t('connect.eventsDesc'),
      icon: Calendar,
      color: "from-purple-500 to-violet-500",
      image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80&w=800"
    },
    {
      id: "networking",
      label: t('connect.networking'),
      description: t('connect.networkingDesc'),
      icon: Globe,
      color: "from-orange-500 to-amber-500",
      image: "https://images.unsplash.com/photo-1515169067750-d51a73b05121?auto=format&fit=crop&q=80&w=800"
    }
  ];
  const [view, setView] = useState<"overview" | "create">("overview");
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);

  // Creation State
  const [newSpaceName, setNewSpaceName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ConnectCategory>("dating");
  const [description, setDescription] = useState("");
  const [identityRule, setIdentityRule] = useState<"real_name" | "nickname">("nickname");
  const [requireVerification, setRequireVerification] = useState(false);

  const handleCreateSpace = () => {
    // Logic to create space would go here
    alert("Connect Space erstellt!");
    setView("overview");
  };

  const renderHeader = (title: string, backAction: () => void) => (
    <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
      <button 
        onClick={backAction}
        className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
      >
        <ArrowLeft size={24} />
      </button>
      <h1 className="text-xl font-bold text-white">{title}</h1>
    </header>
  );

  if (view === "create") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader(t('connect.createSpace'), () => setView("overview"))}
        
        <div className="flex-1 overflow-y-auto p-4 pb-24">
          <div className="max-w-md mx-auto space-y-6">
            
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 ml-1">{t('connect.spaceName')}</label>
              <input 
                type="text" 
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                placeholder="z.B. Wandergruppe München"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 ml-1">{t('connect.category')}</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${
                      selectedCategory === cat.id
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                    }`}
                  >
                    <cat.icon size={16} />
                    <span className="text-sm font-medium">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 ml-1">{t('connect.description')}</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('connect.descPlaceholder')}
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
              />
            </div>

            {/* Identity Rules */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400 ml-1">{t('connect.identity')}</label>
              <div className="bg-gray-800 rounded-xl p-1 border border-gray-700 flex">
                {[
                  { id: "nickname", label: t('connect.nicknameAllowed') },
                  { id: "real_name", label: t('connect.realNameRequired') }
                ].map((rule) => (
                  <button
                    key={rule.id}
                    onClick={() => setIdentityRule(rule.id as any)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      identityRule === rule.id 
                        ? "bg-gray-700 text-white shadow-sm" 
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {rule.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Verification Toggle */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-yellow-500/10 p-2 rounded-lg text-yellow-500">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <div className="font-medium text-sm text-white">{t('connect.verifiedOnly')}</div>
                  <div className="text-xs text-yellow-500/80">{t('connect.premiumFeature')}</div>
                </div>
              </div>
              <button 
                onClick={() => setRequireVerification(!requireVerification)}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  requireVerification ? "bg-yellow-500" : "bg-gray-600"
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  requireVerification ? "left-7" : "left-1"
                }`} />
              </button>
            </div>

            <button 
              onClick={handleCreateSpace}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20"
            >
              {t('connect.createBtn')}
            </button>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans relative">
      {renderHeader(t('connect.title'), onBack)}
      
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="max-w-lg mx-auto space-y-6">
          
          {/* Intro Card */}
          <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl p-6 relative overflow-hidden border border-white/10">
            <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-purple-500/30 blur-3xl rounded-full" />
            <h2 className="text-2xl font-bold mb-2 relative z-10">{t('connect.findCommunity')}</h2>
            <p className="text-purple-200 text-sm relative z-10 mb-4 max-w-[80%]">
              {t('connect.findCommunityDesc')}
            </p>
            
            {/* Filter Toggle */}
            <div className="flex items-center gap-3 bg-black/20 backdrop-blur-sm p-3 rounded-xl border border-white/10 w-fit relative z-10">
               <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                 showVerifiedOnly ? "bg-yellow-500 border-yellow-500" : "border-gray-400"
               }`} onClick={() => setShowVerifiedOnly(!showVerifiedOnly)}>
                 {showVerifiedOnly && <CheckCircle size={10} className="text-black" />}
               </div>
               <button 
                 onClick={() => setShowVerifiedOnly(!showVerifiedOnly)}
                 className="text-xs font-medium text-white text-left"
               >
                 {t('connect.verifiedOnly')} <span className="text-yellow-400 opacity-80">({t('connect.premium')})</span>
               </button>
            </div>
          </div>

          {/* Categories Grid */}
          <div className="grid grid-cols-1 gap-4">
            {CATEGORIES.map((cat, index) => (
              <motion.button
                key={cat.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileTap={{ scale: 0.98 }}
                className="group relative h-28 w-full rounded-2xl overflow-hidden border border-gray-700 shadow-lg"
              >
                {/* Background Image */}
                <div className="absolute inset-0">
                  <img src={cat.image} alt={cat.label} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60" />
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/60 to-transparent" />
                </div>
                
                {/* Content */}
                <div className="absolute inset-0 p-5 flex flex-col justify-center items-start">
                  <div className={`mb-2 p-2 rounded-lg bg-gradient-to-br ${cat.color} text-white shadow-lg`}>
                    <cat.icon size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-white">{cat.label}</h3>
                  <p className="text-xs text-gray-300">{cat.description}</p>
                </div>
                
                <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-sm p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight size={20} />
                </div>
              </motion.button>
            ))}
          </div>

          <button 
            onClick={() => setView("create")}
            className="w-full bg-gray-800 border border-gray-700 hover:bg-gray-750 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={20} className="text-blue-400" /> {t('connect.newConnectSpace')}
          </button>

        </div>
      </div>

    </div>
  );
}