import { useState, useMemo, useEffect, useRef } from "react";
import { Search, ArrowLeft, Edit2, MessageSquarePlus, X, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from 'react-i18next';
import { ContactDetailModal } from "./ContactDetailModal";
import { Contact, Tab } from "../types";
import { TabManagementModal } from "./TabManagementModal";
import { Chat } from "@/app/data/mocks";
import { loadContacts } from "@/app/auth/contacts";
import { loadPersistedChats } from "@/app/lib/chats";
import ProfileAvatar from "./ProfileAvatar";
import AppHeader from "./AppHeader";
import { ImageWithFallback } from "@/app/components/ImageWithFallback";

interface ChatListScreenProps {
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onBack: () => void;
  tabs: Tab[];
  onUpdateTabs: (tabs: Tab[]) => void;
  onChatSelect: (chatId: string) => void;
  onNewChat?: (contact: Contact) => void;
  onlineContacts?: Set<string>;
  /** Inkrementiert bei jeder neuen/gesendeten Nachricht → triggert Live-Refresh */
  chatListVersion?: number;
}

export default function ChatListScreen({ onOpenProfile, onOpenQRCode, onOpenSettings, onOpenSupport, onBack, tabs, onUpdateTabs, onChatSelect, onNewChat, onlineContacts, chatListVersion }: ChatListScreenProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isTabModalOpen, setIsTabModalOpen] = useState(false);
  const [showNewChatSheet, setShowNewChatSheet] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const chatSearchRef = useRef<HTMLInputElement>(null);
  const [persistedChats, setPersistedChats] = useState<Chat[]>([]);

  const refreshPersistedChats = () => {
    const chats = loadPersistedChats().map((c) => ({
      id: c.id,
      name: c.name,
      lastMessage: c.lastMessage || t('chatList.tapToWrite'),
      time: c.time,
      avatarUrl: c.avatarUrl,
      unreadCount: c.unreadCount,
      isGroup: c.isGroup,
    } as Chat));
    setPersistedChats(chats);
  };

  // Refresh: beim Mounten, nach Sheet-Close, und bei jeder neuen Nachricht (chatListVersion)
  useEffect(() => { refreshPersistedChats(); }, [showNewChatSheet, chatListVersion]);

  const allContacts = useMemo(() => {
    return loadContacts().map((c) => ({
      id: c.aregoId,
      name: c.displayName,
      categories: ['friends'] as string[],
      avatar: '',
      type: 'individual' as const,
    } as Contact));
  }, [showNewChatSheet]);

  const filteredPickerContacts = contactSearch.trim()
    ? allContacts.filter((c) => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
    : allContacts;

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

  // Nur echte persistierte Chats anzeigen, nach Tab + Suche gefiltert
  const filteredChats = useMemo(() => {
    let result = persistedChats.filter((chat) => {
      if (activeTab === "all") return true;
      if (activeTab === "groups") return chat.isGroup;
      if (activeTab === "private") return !chat.isGroup;
      return chat.category === activeTab;
    });
    if (chatSearchQuery.trim()) {
      const q = chatSearchQuery.toLowerCase().trim();
      result = result.filter(chat => chat.name.toLowerCase().includes(q));
    }
    return result;
  }, [activeTab, persistedChats, chatSearchQuery]);

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <AppHeader
        title={t('chatList.title')}
        onBack={onBack}
        onOpenProfile={onOpenProfile}
        onOpenQRCode={onOpenQRCode}
        onOpenSettings={onOpenSettings}
        onOpenSupport={onOpenSupport}
        action={{ icon: MessageSquarePlus, label: t('chatList.newChat'), onClick: () => { setContactSearch(""); setShowNewChatSheet(true); } }}
        rightExtra={
          <button onClick={() => { setChatSearchOpen(!chatSearchOpen); if (!chatSearchOpen) { setChatSearchQuery(""); setTimeout(() => chatSearchRef.current?.focus(), 100); } }}
            className={`p-2 rounded-full transition-all ${chatSearchOpen ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-white/10"}`}>
            <Search size={20} />
          </button>
        }
      />

      {/* Expandable search bar */}
      <AnimatePresence>
        {chatSearchOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-gray-800">
            <div className="px-4 py-2.5 relative">
              <Search size={16} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                ref={chatSearchRef}
                type="text"
                value={chatSearchQuery}
                onChange={e => setChatSearchQuery(e.target.value)}
                placeholder={t('chatList.searchPlaceholder')}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
              />
              <button onClick={() => { setChatSearchOpen(false); setChatSearchQuery(""); }} className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-800">
        <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          {tabs.filter(t => !t.hidden).map((tab) => (
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
          title={t('tabs.editTabs')}
        >
          <Edit2 size={18} />
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pb-20 pt-2">
          
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
                  {chat.isGroup ? (
                    <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5">
                      <div className="bg-gray-700 p-1 rounded-full text-gray-300">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-gray-900 ${
                      onlineContacts?.has(chat.id) ? 'bg-green-500' : 'bg-gray-600'
                    }`} />
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
              <div className="bg-gray-800 p-5 rounded-full mb-4">
                <MessageSquarePlus size={36} className="text-gray-600" />
              </div>
              <p className="text-base font-medium text-gray-400 mb-1">{t('chatList.noChats')}</p>
              <p className="text-sm text-gray-600 text-center px-8">{t('chatList.noChatsDesc')}</p>
            </div>
          )}
        </div>
      </div>

      <ContactDetailModal
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onUpdateContact={(updated) => setSelectedContact(updated)}
        tabs={tabs}
        onStartChat={(contact) => {
          setSelectedContact(null);
          onNewChat?.(contact);
        }}
      />

      <TabManagementModal
        isOpen={isTabModalOpen}
        onClose={() => setIsTabModalOpen(false)}
        tabs={tabs}
        onUpdateTabs={onUpdateTabs}
      />

      {/* Neuer Chat — Kontaktliste Sheet */}
      <AnimatePresence>
        {showNewChatSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewChatSheet(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 border-t border-gray-800 rounded-t-3xl max-h-[85vh] flex flex-col"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 bg-gray-700 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 shrink-0">
                <h2 className="text-lg font-bold text-white">{t('chatList.startChat')}</h2>
                <button
                  onClick={() => setShowNewChatSheet(false)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Suche */}
              <div className="px-5 pb-3 shrink-0">
                <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5">
                  <Search size={16} className="text-gray-500 shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    placeholder={t('chatList.searchContact')}
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>

              {/* Kontaktliste */}
              <div className="flex-1 overflow-y-auto px-3 pb-8">
                {filteredPickerContacts.length === 0 ? (
                  <p className="text-center text-gray-500 py-12 text-sm">{t('chatList.noContactsFound')}</p>
                ) : (
                  filteredPickerContacts.map((contact) => (
                    <motion.button
                      key={contact.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowNewChatSheet(false);
                        onNewChat?.(contact);
                      }}
                      className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-gray-800/60 transition-colors group text-left"
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 border border-gray-600 shrink-0">
                        <ImageWithFallback src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors truncate">{contact.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {contact.categories.join(', ')}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-gray-600 group-hover:text-blue-400 transition-colors shrink-0" />
                    </motion.button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}