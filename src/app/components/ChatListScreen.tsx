import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Settings, Search, Plus, User, MoreVertical, Phone, Video, QrCode, ArrowLeft, Users, Calendar, Edit2, MessageSquarePlus } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { motion } from "motion/react";
import { ContactDetailModal } from "./ContactDetailModal";
import { Contact, Tab } from "../types";
import { TabManagementModal } from "./TabManagementModal";
import { Chat, MOCK_CHATS } from "@/app/data/mocks";

const USER_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=800&auto=format&fit=crop&q=60";

interface ChatListScreenProps {
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
  onBack: () => void;
  tabs: Tab[];
  onUpdateTabs: (tabs: Tab[]) => void;
  onChatSelect: (chatId: string) => void;
}

export default function ChatListScreen({ onOpenProfile, onOpenQRCode, onOpenSettings, onBack, tabs, onUpdateTabs, onChatSelect }: ChatListScreenProps) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isTabModalOpen, setIsTabModalOpen] = useState(false);

  const handleAvatarClick = (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation(); // Prevent opening the chat
    // Map Chat to Contact
    const contact: Contact = {
      id: chat.id,
      name: chat.name,
      avatar: chat.avatarUrl,
      categories: [chat.category || "other"], // simple casting
    };
    setSelectedContact(contact);
  };

  const filteredChats = MOCK_CHATS.filter((chat) => {
    if (activeTab === "all") return true;
    if (activeTab === "groups") return chat.isGroup;
    if (activeTab === "private") return !chat.isGroup;
    // Map existing mock data categories to tabs
    return chat.category === activeTab;
  });

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      {/* Header */}
      <header className="px-5 py-4 flex items-center justify-between bg-gray-900/95 backdrop-blur-md sticky top-0 z-20 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600">
            Chats
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10">
            <Search size={22} />
          </button>
          
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                <ImageWithFallback 
                  src={USER_AVATAR} 
                  alt="Profil" 
                  className="w-full h-full object-cover"
                />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content 
                className="min-w-[200px] bg-gray-800 rounded-xl shadow-xl p-1.5 border border-gray-700 data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade z-50 mr-4"
                sideOffset={5}
                align="end"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Mein Konto
                </DropdownMenu.Label>
                
                <DropdownMenu.Item 
                  onClick={onOpenProfile}
                  className="group flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
                >
                  <User size={16} />
                  <span>Profil</span>
                </DropdownMenu.Item>
                
                <DropdownMenu.Item 
                  onClick={onOpenQRCode}
                  className="group flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
                >
                  <QrCode size={16} />
                  <span>QR-Code</span>
                </DropdownMenu.Item>

                <DropdownMenu.Item 
                  onClick={onOpenSettings}
                  className="group flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
                >
                  <Settings size={16} />
                  <span>Einstellungen</span>
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="h-px bg-gray-700 my-1" />
                
                <DropdownMenu.Item className="group flex items-center gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer transition-colors">
                  <span>Abmelden</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-800">
        <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setIsTabModalOpen(true)}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all shrink-0 ml-1"
          title="Reiter bearbeiten"
        >
          <Edit2 size={18} />
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pb-20 pt-2">
          
          {/* New Chat Action Item */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => alert("Kontakt suchen...")}
            className="group flex items-center gap-4 p-3 rounded-xl hover:bg-gray-800/50 cursor-pointer transition-colors mb-2 bg-gradient-to-r from-gray-800/80 to-transparent border border-gray-700/50"
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-blue-600/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-lg shadow-blue-900/10">
              <MessageSquarePlus size={26} />
            </div>
            
            <div className="flex-1 min-w-0">
               <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                 Neuen Chat beginnen
               </h3>
               <p className="text-sm text-gray-400 group-hover:text-gray-300">
                 Schreibe einer Person oder Gruppe...
               </p>
            </div>
          </motion.div>

          {filteredChats.length > 0 ? (
            filteredChats.map((chat) => (
              <motion.div
                key={chat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onChatSelect(chat.id)}
                className="group flex items-center gap-4 p-3 rounded-xl hover:bg-gray-800/50 cursor-pointer transition-colors mb-1"
              >
                <div className="relative" onClick={(e) => handleAvatarClick(e, chat)}>
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-800 border border-gray-700 hover:border-blue-500 transition-colors">
                    <ImageWithFallback
                      src={chat.avatarUrl}
                      alt={chat.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {chat.isGroup && (
                    <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5">
                      <div className="bg-gray-700 p-1 rounded-full text-gray-300">
                        {/* Tiny group icon indicator */}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="text-base font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                      {chat.name}
                    </h3>
                    <span className={`text-xs ${chat.unreadCount > 0 ? "text-blue-400 font-bold" : "text-gray-500"}`}>
                      {chat.time}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={`text-sm truncate pr-2 ${chat.unreadCount > 0 ? "text-gray-200 font-medium" : "text-gray-400"}`}>
                      {chat.lastMessage}
                    </p>
                    {chat.unreadCount > 0 && (
                      <div className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-blue-600 text-white text-xs font-bold rounded-full">
                        {chat.unreadCount}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <div className="bg-gray-800 p-4 rounded-full mb-4">
                <Search size={32} />
              </div>
              <p>Keine Chats in "{tabs.find(t => t.id === activeTab)?.label}" gefunden</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button (Global) - Removed per request */}
      
      <ContactDetailModal
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onUpdateContact={(updated) => {
          setSelectedContact(updated);
          // In a real app, you would update the chat list or global contact store here
        }}
        tabs={tabs}
      />
      
      <TabManagementModal
        isOpen={isTabModalOpen}
        onClose={() => setIsTabModalOpen(false)}
        tabs={tabs}
        onUpdateTabs={onUpdateTabs}
      />
    </div>
  );
}