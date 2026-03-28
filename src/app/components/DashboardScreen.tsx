import { motion } from "motion/react";
import { MessageCircle, Calendar, CreditCard, Users, LayoutGrid, CircleDashed, User, Settings, QrCode, LogOut, HeartHandshake, FileText } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface DashboardScreenProps {
  onNavigate: (screen: "chatList" | "calendar" | "pay" | "community" | "people" | "connect" | "documents") => void;
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
}

const USER_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=800&auto=format&fit=crop&q=60";

export default function DashboardScreen({ onNavigate, onOpenProfile, onOpenQRCode, onOpenSettings }: DashboardScreenProps) {
  const TILES = [
    { 
      id: "chatList", 
      label: "Chat", 
      icon: MessageCircle, 
      color: "bg-blue-600",
      description: "Nachrichten & Gruppen" 
    },
    { 
      id: "calendar", 
      label: "Kalender", 
      icon: Calendar, 
      color: "bg-purple-600",
      description: "Termine & Events" 
    },
    { 
      id: "people", 
      label: "Kontakte", 
      icon: Users, 
      color: "bg-pink-600",
      description: "Familie & Freunde" 
    },
    { 
      id: "community", 
      label: "Spaces", 
      icon: LayoutGrid, 
      color: "bg-orange-600",
      description: "Räume & Organisationen" 
    },
    { 
      id: "pay", 
      label: "Pay", 
      icon: CreditCard, 
      color: "bg-green-600",
      description: "Senden & Empfangen" 
    },
    { 
      id: "connect", 
      label: "Connect", 
      icon: HeartHandshake, 
      color: "bg-indigo-600",
      description: "Dating, Freunde & Events" 
    },
    { 
      id: "documents", 
      label: "Dokumente", 
      icon: FileText, 
      color: "bg-teal-600",
      description: "Dateien & Verwaltung" 
    },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="px-6 py-6 flex items-center justify-between bg-gray-900 z-20">
        <div>
          <h1 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600">
            Willkommen
          </h1>
          <p className="text-gray-400 text-sm">Was möchtest du tun?</p>
        </div>
        
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-gray-700 hover:border-blue-500 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer">
              <ImageWithFallback 
                src={USER_AVATAR} 
                alt="Profil" 
                className="w-full h-full object-cover"
              />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content 
              className="min-w-[220px] bg-gray-800 rounded-xl shadow-2xl p-2 border border-gray-700 data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade z-50 mr-6"
              sideOffset={5}
              align="end"
            >
              <DropdownMenu.Label className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Mein Konto
              </DropdownMenu.Label>
              
              <DropdownMenu.Item 
                onClick={onOpenProfile}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <User size={18} />
                <span className="font-medium">Profil</span>
              </DropdownMenu.Item>
              
              <DropdownMenu.Item 
                onClick={onOpenQRCode}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <QrCode size={18} />
                <span className="font-medium">QR-Code</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item 
                onClick={onOpenSettings}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <Settings size={18} />
                <span className="font-medium">Einstellungen</span>
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="h-px bg-gray-700 my-1.5" />
              
              <DropdownMenu.Item className="group flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer transition-colors">
                <LogOut size={18} />
                <span className="font-medium">Abmelden</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onNavigate(tile.id as any)}
                className="flex flex-col items-center justify-center p-6 rounded-3xl bg-gray-800 border border-gray-700 hover:bg-gray-750 transition-colors shadow-lg group aspect-[4/5] relative overflow-hidden"
              >
                {/* Background Glow */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-gradient-to-br from-white to-transparent`} />
                
                <div className={`p-5 rounded-2xl mb-4 ${tile.color} shadow-lg shadow-black/20 text-white`}>
                  <tile.icon size={32} />
                </div>
                <span className="text-lg font-bold text-gray-100">{tile.label}</span>
                <span className="text-xs text-gray-500 mt-1 font-medium">{tile.description}</span>
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