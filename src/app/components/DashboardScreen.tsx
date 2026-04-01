import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Calendar, CreditCard, Users, LayoutGrid, CircleDashed, User, Settings, QrCode, LogOut, HeartHandshake, FileText, Globe } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslation } from 'react-i18next';

interface DashboardScreenProps {
  onNavigate: (screen: "chatList" | "calendar" | "pay" | "community" | "people" | "connect" | "documents") => void;
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
  chatUnreadCount?: number;
}

function loadAvatar(): { avatarBase64: string | null; initials: string } {
  try {
    const profile = JSON.parse(localStorage.getItem("arego_profile") ?? "{}");
    const identity = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}");
    const firstName = profile.firstName ?? identity.displayName?.split(" ")[0] ?? "";
    const lastName = profile.lastName ?? identity.displayName?.split(" ").slice(1).join(" ") ?? "";
    const i1 = (firstName[0] ?? "").toUpperCase();
    const i2 = (lastName[0] ?? firstName[1] ?? "").toUpperCase();
    return { avatarBase64: profile.avatarBase64 ?? null, initials: i1 + i2 };
  } catch { return { avatarBase64: null, initials: "" }; }
}

export default function DashboardScreen({ onNavigate, onOpenProfile, onOpenQRCode, onOpenSettings, chatUnreadCount = 0 }: DashboardScreenProps) {
  const [avatar, setAvatar] = useState(loadAvatar);
  const [worldToast, setWorldToast] = useState(false);

  useEffect(() => {
    const refresh = () => setAvatar(loadAvatar());
    window.addEventListener("storage", refresh);
    window.addEventListener("arego-profile-updated", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("arego-profile-updated", refresh); };
  }, []);
  const { t } = useTranslation();
  const TILES = [
    { 
      id: "chatList", 
      label: t('dashboard.chat'),
      icon: MessageCircle,
      color: "bg-blue-600",
      description: t('dashboard.chatDesc') 
    },
    { 
      id: "calendar", 
      label: t('dashboard.calendar'),
      icon: Calendar,
      color: "bg-purple-600",
      description: t('dashboard.calendarDesc') 
    },
    { 
      id: "people", 
      label: t('dashboard.contacts'),
      icon: Users,
      color: "bg-pink-600",
      description: t('dashboard.contactsDesc') 
    },
    { 
      id: "community", 
      label: t('dashboard.spacesLabel'),
      icon: LayoutGrid,
      color: "bg-orange-600",
      description: t('dashboard.spacesDesc') 
    },
    { 
      id: "pay", 
      label: t('dashboard.pay'),
      icon: CreditCard,
      color: "bg-green-600",
      description: t('dashboard.payDesc') 
    },
    { 
      id: "connect", 
      label: t('dashboard.connect'),
      icon: HeartHandshake,
      color: "bg-indigo-600",
      description: t('dashboard.connectDesc') 
    },
    {
      id: "documents",
      label: t('dashboard.documents'),
      icon: FileText,
      color: "bg-teal-600",
      description: t('dashboard.documentsDesc'),
      disabled: false,
    },
    {
      id: "world",
      label: t('dashboard.world'),
      icon: Globe,
      color: "bg-emerald-600",
      description: t('dashboard.worldDesc'),
      disabled: true,
    },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="px-6 py-6 flex items-center justify-between bg-gray-900 z-20">
        <div>
          <h1 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600">
            {t('dashboard.welcome')}
          </h1>
          <p className="text-gray-400 text-sm">{t('dashboard.whatToDo')}</p>
        </div>
        
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-gray-700 hover:border-blue-500 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center">
              {avatar.avatarBase64 ? (
                <img src={avatar.avatarBase64} alt="Profil" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-white select-none">{avatar.initials}</span>
              )}
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content 
              className="min-w-[220px] bg-gray-800 rounded-xl shadow-2xl p-2 border border-gray-700 data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade z-50 mr-6"
              sideOffset={5}
              align="end"
            >
              <DropdownMenu.Label className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('common.myAccount')}
              </DropdownMenu.Label>
              
              <DropdownMenu.Item 
                onClick={onOpenProfile}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <User size={18} />
                <span className="font-medium">{t('common.profile')}</span>
              </DropdownMenu.Item>
              
              <DropdownMenu.Item 
                onClick={onOpenQRCode}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <QrCode size={18} />
                <span className="font-medium">{t('common.qrCode')}</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item 
                onClick={onOpenSettings}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <Settings size={18} />
                <span className="font-medium">{t('common.settings')}</span>
              </DropdownMenu.Item>

            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      {/* World Toast */}
      <AnimatePresence>
        {worldToast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium"
          >
            <Globe size={16} /> {t('dashboard.worldComingSoonToast')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid Content */}
      <div className="flex-1 px-4 py-2 overflow-y-auto">
        <div className="flex flex-col max-w-lg mx-auto pb-8">
          <div className="grid grid-cols-2 gap-4 content-start">
            {TILES.map((tile, index) => (
              <motion.button
                key={tile.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: tile.disabled ? 1 : 1.02 }}
                whileTap={{ scale: tile.disabled ? 1 : 0.95 }}
                onClick={() => {
                  if (tile.disabled) {
                    setWorldToast(true);
                    setTimeout(() => setWorldToast(false), 2500);
                    return;
                  }
                  onNavigate(tile.id as any);
                }}
                className={`flex flex-col items-center justify-center p-6 rounded-3xl bg-gray-800 border border-gray-700 transition-colors shadow-lg group aspect-[4/5] relative overflow-hidden ${tile.disabled ? "opacity-50 cursor-default" : "hover:bg-gray-750"}`}
              >
                {/* Background Glow */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-gradient-to-br from-white to-transparent`} />

                <div className={`relative p-5 rounded-2xl mb-4 ${tile.color} shadow-lg shadow-black/20 text-white`}>
                  <tile.icon size={32} />
                  {tile.id === 'chatList' && chatUnreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full shadow-lg">
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </span>
                  )}
                </div>
                <span className="text-lg font-bold text-gray-100">{tile.label}</span>
                <span className="text-xs text-gray-500 mt-1 font-medium">{tile.description}</span>
                {tile.disabled && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-gray-700 text-[9px] font-bold text-gray-400">{t('dashboard.comingSoon')}</span>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="p-4 text-center text-xs text-gray-600">
        Aregoland V1.0
      </div>
    </div>
  );
}