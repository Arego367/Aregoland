import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Search, Users, Baby, Briefcase,
  Heart, MoreVertical, Shield, Smartphone, Check,
  QrCode, Phone, Mail, MapPin, Calendar, Star, X,
  UserPlus, User, MessageCircle, Video, Edit2, Trash2
} from "lucide-react";
import { AddContactModal } from "./AddContactModal";
import AppHeader from "./AppHeader";
import { StoredContact, loadContacts } from "@/app/auth/contacts";
import { UserIdentity } from "@/app/auth/identity";
import { motion, AnimatePresence } from "motion/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ImageWithFallback } from "@/app/components/ImageWithFallback";
import * as Dialog from "@radix-ui/react-dialog";
import { ContactDetailModal } from "./ContactDetailModal";
import { Contact, Tab } from "../types";
import { TabManagementModal } from "./TabManagementModal";
import ProfileAvatar from "./ProfileAvatar";

interface PeopleScreenProps {
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onOpenChildProfile: () => void;
  tabs: Tab[];
  onUpdateTabs: (tabs: Tab[]) => void;
  identity?: UserIdentity | null;
  onStartChat?: (contact: Contact) => void;
  onStartCall?: (contact: Contact, type: 'audio' | 'video') => void;
  onlineContacts?: Set<string>;
  contactsVersion?: number;
  onRemoveContact?: (contactId: string) => void;
}

export default function PeopleScreen({ onBack, onOpenProfile, onOpenQRCode, onOpenSettings, onOpenSupport, tabs, onUpdateTabs, identity, onStartChat, onStartCall, onlineContacts, contactsVersion, onRemoveContact }: PeopleScreenProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const savedCats: Record<string, string[]> = (() => { try { return JSON.parse(localStorage.getItem('arego_contact_categories') ?? '{}'); } catch { return {}; } })();
    return loadContacts().map((c) => ({
      id: c.aregoId,
      name: c.displayName,
      categories: savedCats[c.aregoId] ?? ['friends'],
      avatar: '',
    } as Contact));
  });
  const [isTabModalOpen, setIsTabModalOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Contact | null>(null);

  // Live-Refresh wenn ein neuer Kontakt hinzugefügt wird (contactsVersion ändert sich)
  useEffect(() => {
    const savedCats: Record<string, string[]> = (() => { try { return JSON.parse(localStorage.getItem('arego_contact_categories') ?? '{}'); } catch { return {}; } })();
    const stored = loadContacts().map((c) => ({
      id: c.aregoId,
      name: c.displayName,
      categories: savedCats[c.aregoId] ?? ['friends'],
      avatar: '',
    } as Contact));
    setContacts(stored);
  }, [contactsVersion, isAddContactOpen]);

  // Child Creation State
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [creationStep, setCreationStep] = useState<"fsk" | "qr">("fsk");
  const [selectedFSK, setSelectedFSK] = useState<number | null>(null);

  const FSK_OPTIONS = [
    { age: 6, label: "FSK 6", description: t('fsk.fsk6Desc'), color: "bg-green-500" },
    { age: 12, label: "FSK 12", description: t('fsk.fsk12Desc'), color: "bg-yellow-500" },
    { age: 14, label: "FSK 14", description: t('fsk.fsk14Desc'), color: "bg-orange-500" },
    { age: 16, label: "FSK 16", description: t('fsk.fsk16Desc'), color: "bg-red-500" },
  ];

  const filteredContacts = contacts.filter(c => {
    if (activeTab === "all") return true;
    return c.categories.includes(activeTab);
  });

  const handleUpdateContact = (updatedContact: Contact) => {
    setContacts(contacts.map(c => c.id === updatedContact.id ? updatedContact : c));
    setSelectedContact(updatedContact);
    // Kategorien in localStorage persistieren
    try {
      const savedCats: Record<string, string[]> = JSON.parse(localStorage.getItem('arego_contact_categories') ?? '{}');
      savedCats[updatedContact.id] = updatedContact.categories;
      localStorage.setItem('arego_contact_categories', JSON.stringify(savedCats));
    } catch { /* ignorieren */ }
  };

  const handleCreateChild = () => {
    setIsCreatingChild(true);
    setCreationStep("fsk");
    setSelectedFSK(null);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
      <AppHeader
        title={t('people.title')}
        onBack={onBack}
        onOpenProfile={onOpenProfile}
        onOpenQRCode={onOpenQRCode}
        onOpenSettings={onOpenSettings}
        onOpenSupport={onOpenSupport}
        action={{ icon: UserPlus, label: t('people.newContact'), onClick: () => setIsAddContactOpen(true) }}
        rightExtra={
          <button className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10">
            <Search size={20} />
          </button>
        }
      />

      {/* Tabs */}
      {!isCreatingChild && (
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
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-gray-900 relative">
        <AnimatePresence mode="wait">
          {isCreatingChild ? (
            /* CHILD CREATION FLOW */
            <motion.div
              key="create-child"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="p-6 max-w-lg mx-auto"
            >
               <button 
                 onClick={() => setIsCreatingChild(false)}
                 className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white"
               >
                 <X size={24} />
               </button>

               {creationStep === "fsk" && (
                 <div className="space-y-6">
                   <div className="text-center">
                     <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-700">
                       <Baby size={32} className="text-blue-400" />
                     </div>
                     <h2 className="text-xl font-bold">{t('people.setupChildProtection')}</h2>
                     <p className="text-gray-400 text-sm mt-1">{t('people.chooseAgeLevel')}</p>
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
                   
                   <button
                      disabled={!selectedFSK}
                      onClick={() => setCreationStep("qr")}
                      className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                        selectedFSK 
                        ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25" 
                        : "bg-gray-800 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      {t('common.next')}
                    </button>
                 </div>
               )}

               {creationStep === "qr" && (
                 <div className="flex flex-col items-center justify-center text-center space-y-6 pt-10">
                    <h2 className="text-2xl font-bold">{t('welcome.scanQR')}</h2>
                    <p className="text-gray-400 max-w-xs">
                      {t('childProfile.scanChildQR')}
                    </p>
                    <div className="bg-white p-4 rounded-3xl shadow-2xl shadow-blue-900/20 relative">
                       <div className="w-64 h-64 bg-gray-100 rounded-xl overflow-hidden relative">
                          <ImageWithFallback
                            src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=aregoland-child-setup-token-123"
                            alt="Setup QR Code"
                            className="w-full h-full object-contain mix-blend-multiply"
                          />
                       </div>
                    </div>
                    <button 
                      onClick={() => setIsCreatingChild(false)}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      {t('common.done')}
                    </button>
                 </div>
               )}
            </motion.div>
          ) : (
            /* CONTACT LIST */
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-2 pb-24"
            >
              {filteredContacts.length > 0 ? (
                filteredContacts.map((contact) => (
                  <ContextMenu.Root key={contact.id}>
                    <ContextMenu.Trigger asChild>
                      <motion.div
                        layoutId={contact.id}
                        onClick={() => setSelectedContact(contact)}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-gray-800/50 border border-gray-700/50 hover:bg-gray-800 cursor-pointer transition-colors group"
                      >
                        <div className="relative">
                          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-gray-700 group-hover:border-blue-500 transition-colors">
                            <ImageWithFallback src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                          </div>
                          {contact.categories.includes("child") ? (
                            <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-1">
                              <Shield size={12} className="text-blue-400" />
                            </div>
                          ) : (
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-800 ${onlineContacts?.has(contact.id) ? 'bg-green-500' : 'bg-gray-600'}`} />
                          )}
                        </div>

                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white">{contact.name}</h3>
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className={onlineContacts?.has(contact.id) ? 'text-green-400' : 'text-gray-500'}>
                              {onlineContacts?.has(contact.id) ? t('common.online') : t('common.offline')}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content className="min-w-[180px] bg-gray-800 rounded-xl shadow-xl p-1.5 border border-gray-700 z-50 animate-in fade-in zoom-in-95 duration-200">
                        <ContextMenu.Item
                          onSelect={() => onStartChat?.(contact)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer"
                        >
                          <MessageCircle size={16} />
                          <span>{t('people.sendMessage')}</span>
                        </ContextMenu.Item>
                        {contact.id.startsWith('AC-') && (
                          <ContextMenu.Item
                            onSelect={() => setRemoveTarget(contact)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer"
                          >
                            <Trash2 size={16} />
                            <span>{t('people.removeContact')}</span>
                          </ContextMenu.Item>
                        )}
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu.Root>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <div className="bg-gray-800 p-5 rounded-full mb-4">
                    <UserPlus size={36} className="text-gray-600" />
                  </div>
                  <p className="text-base font-medium text-gray-400 mb-1">{t('people.noContacts')}</p>
                  <p className="text-sm text-gray-600 text-center px-8">{t('people.noContactsDesc')}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      <AddContactModal
        open={isAddContactOpen}
        onClose={() => setIsAddContactOpen(false)}
        identity={identity ?? null}
        onContactAdded={(contact) => {
          setContacts((prev: Contact[]) => {
            if (prev.find((c: Contact) => c.id === contact.aregoId)) return prev;
            return [
              ...prev,
              {
                id: contact.aregoId,
                name: contact.displayName,
                categories: ['friends'],
                avatar: '',
                status: t('people.p2pContact'),
              } as Contact,
            ];
          });
        }}
      />

      {/* Contact Detail Modal */}
      <ContactDetailModal
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onUpdateContact={handleUpdateContact}
        tabs={tabs}
        onStartChat={onStartChat}
        onStartCall={onStartCall}
        onRemoveContact={onRemoveContact}
      />
      
      <TabManagementModal
        isOpen={isTabModalOpen}
        onClose={() => setIsTabModalOpen(false)}
        tabs={tabs}
        onUpdateTabs={onUpdateTabs}
      />

      {/* Kontakt entfernen — Bestätigungsdialog */}
      <AlertDialog.Root open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="bg-black/50 backdrop-blur-sm fixed inset-0 z-50 animate-in fade-in duration-200" />
          <AlertDialog.Content className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[400px] translate-x-[-50%] translate-y-[-50%] rounded-xl bg-gray-900 border border-gray-800 p-6 shadow-2xl focus:outline-none z-50 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-500/10 rounded-full text-red-500"><Trash2 size={24} /></div>
                <div>
                  <AlertDialog.Title className="text-lg font-semibold text-white">
                    {t('people.removeConfirmTitle', { name: removeTarget?.name })}
                  </AlertDialog.Title>
                  <AlertDialog.Description className="text-sm text-gray-400 mt-1">
                    {t('people.removeConfirmDesc')}
                  </AlertDialog.Description>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <AlertDialog.Action
                  onClick={() => {
                    if (removeTarget) onRemoveContact?.(removeTarget.id);
                    setRemoveTarget(null);
                  }}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  {t('common.delete')}
                </AlertDialog.Action>
                <AlertDialog.Cancel className="w-full py-3 bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg font-medium transition-colors border border-gray-700">
                  {t('common.cancel')}
                </AlertDialog.Cancel>
              </div>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}