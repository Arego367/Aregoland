import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  X, MessageCircle, Phone, Video, Calendar, Mail, MapPin,
  Users, User, Shield, Crown, Briefcase, ListPlus, Check, Trash2, Ban
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { Contact, Tab } from "@/app/types";
import { blockContact, isBlocked } from "@/app/auth/contacts";

interface ContactDetailModalProps {
  contact: Contact | null;
  onClose: () => void;
  onUpdateContact: (updatedContact: Contact) => void;
  tabs: Tab[];
  onStartChat?: (contact: Contact) => void;
  onStartCall?: (contact: Contact, type: 'audio' | 'video') => void;
  onRemoveContact?: (contactId: string) => void;
  onBlockContact?: (contactId: string) => void;
}

export function ContactDetailModal({ contact, onClose, onUpdateContact, tabs, onStartChat, onStartCall, onRemoveContact, onBlockContact }: ContactDetailModalProps) {
  const { t } = useTranslation();
  const [showListSelector, setShowListSelector] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const comingSoonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kategorien = alle Tabs außer "Alle"
  const categoryTabs = tabs.filter(t => t.id !== 'all');

  const showComingSoon = (feature: string) => {
    if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    setComingSoon(feature);
    comingSoonTimer.current = setTimeout(() => setComingSoon(null), 2500);
  };

  useEffect(() => {
    if (!contact) {
      setShowListSelector(false);
      setComingSoon(null);
      setShowRemoveConfirm(false);
    }
  }, [contact]);

  if (!contact) return null;

  const isGroup = contact.type === "group";

  const handleToggleList = (tabId: string) => {
    const currentCategories = contact.categories || [];
    let newCategories;

    if (currentCategories.includes(tabId)) {
      newCategories = currentCategories.filter(id => id !== tabId);
    } else {
      newCategories = [...currentCategories, tabId];
    }
    
    // Ensure at least one category if needed, or allow none? 
    // Usually 'other' is default. But let's allow empty for now or handle it.
    // If empty, maybe default to 'other'?
    if (newCategories.length === 0) newCategories = ["other"];

    onUpdateContact({ ...contact, categories: newCategories });
  };

  return (
    <Dialog.Root open={!!contact} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 data-[state=open]:animate-fadeIn" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl p-0 overflow-hidden z-50 data-[state=open]:animate-contentShow max-h-[90vh] flex flex-col">
          <Dialog.Title className="sr-only">
            {isGroup ? t('contactDetail.groupDetails') : t('contactDetail.contactDetails')}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {t('contactDetail.detailsFor', { name: contact.name })}
          </Dialog.Description>
          
          {/* Header */}
          <div className={`relative h-32 ${isGroup ? 'bg-gradient-to-br from-indigo-600 to-cyan-600' : 'bg-gradient-to-br from-blue-600 to-purple-600'}`}>
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white backdrop-blur-md transition-colors z-10"
            >
              <X size={20} />
            </button>
            
            {isGroup && (
              <div className="absolute top-4 left-4 flex gap-2">
                 <div className="bg-black/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1">
                   <Users size={12} />
                   {t('contactDetail.group')}
                 </div>
              </div>
            )}
          </div>
          
          <div className="px-6 pb-8 -mt-12 relative flex-1 overflow-y-auto no-scrollbar">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-full border-4 border-gray-900 overflow-hidden bg-gray-800 shadow-xl mb-4 mx-auto relative group">
              <ImageWithFallback src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
              {isGroup && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <span className="text-xs font-medium">{t('contactDetail.change')}</span>
                </div>
              )}
            </div>
            
            {/* Name & Role */}
            <div className="flex flex-col items-center mb-6 w-full">
              <input 
                type="text"
                value={contact.name}
                onChange={(e) => onUpdateContact({...contact, name: e.target.value})}
                className="text-2xl font-bold text-center bg-transparent border-b border-transparent hover:border-gray-600 focus:border-blue-500 outline-none w-full transition-colors text-white mb-1"
                placeholder={isGroup ? "Gruppenname" : "Name"}
              />
              <div className="flex items-center gap-2 text-gray-400 text-sm flex-wrap justify-center">
                {(contact.categories || []).map(catId => {
                  const label = categoryTabs.find(t => t.id === catId)?.label ?? catId;
                  return (
                    <span key={catId} className="bg-blue-500/15 text-blue-400 px-2.5 py-0.5 rounded-full text-xs border border-blue-500/30 font-medium">
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-center mb-8 gap-3">
              <div className="flex justify-center gap-6">
                <button
                  onClick={() => { if (onStartChat) { onStartChat(contact); onClose(); } }}
                  className="flex flex-col items-center gap-2 group"
                  title="Nachricht"
                >
                  <div className={`w-12 h-12 ${isGroup ? 'bg-indigo-600 shadow-indigo-600/30' : 'bg-blue-600 shadow-blue-600/30'} rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <MessageCircle size={24} className="text-white" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">{t('chatList.title')}</span>
                </button>

                <button
                  onClick={() => { if (onStartCall) { onStartCall(contact, 'audio'); onClose(); } else showComingSoon(t('contactDetail.audio')); }}
                  className="flex flex-col items-center gap-2 group" title={t('contactDetail.audio')}
                >
                  <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-600/30 group-hover:scale-110 transition-transform">
                    <Phone size={24} className="text-white" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">{t('contactDetail.audio')}</span>
                </button>

                <button
                  onClick={() => { if (onStartCall) { onStartCall(contact, 'video'); onClose(); } else showComingSoon(t('contactDetail.video')); }}
                  className="flex flex-col items-center gap-2 group" title={t('contactDetail.video')}
                >
                  <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-600/30 group-hover:scale-110 transition-transform">
                    <Video size={24} className="text-white" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">{t('contactDetail.video')}</span>
                </button>

                <button onClick={() => showComingSoon(t('contactDetail.plan'))} className="flex flex-col items-center gap-2 group" title={t('contactDetail.plan')}>
                  <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:scale-110 transition-transform">
                    <Calendar size={24} className="text-white" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">{t('contactDetail.plan')}</span>
                </button>
              </div>

              {comingSoon && (
                <div className="text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded-full px-3 py-1.5 animate-in fade-in duration-200">
                  {t('common.comingSoon', { feature: comingSoon })}
                </div>
              )}
            </div>
            
            {/* Conditional Content */}
            <div className="space-y-4 pt-4 border-t border-gray-800">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
                {isGroup ? t('contactDetail.groupInfo') : t('contactDetail.personalInfo')}
              </h3>
              
              {isGroup ? (
                /* GROUP VIEW */
                <div className="space-y-3">
                   <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50">
                     <div className="flex items-center gap-3 mb-2">
                       <Crown size={18} className="text-yellow-500 shrink-0" />
                       <span className="text-sm font-medium text-gray-300">{t('contactDetail.creator')}</span>
                     </div>
                     <input
                       type="text"
                       placeholder={t('contactDetail.creatorPlaceholder')}
                       value={contact.groupCreator || "Du"}
                       onChange={(e) => onUpdateContact({...contact, groupCreator: e.target.value})}
                       className="bg-transparent w-full outline-none text-sm text-white pl-8 placeholder-gray-600"
                     />
                   </div>

                   <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50">
                     <div className="flex items-center gap-3 mb-2">
                       <Shield size={18} className="text-blue-500 shrink-0" />
                       <span className="text-sm font-medium text-gray-300">{t('contactDetail.admin')}</span>
                     </div>
                     <input
                       type="text"
                       placeholder={t('contactDetail.adminPlaceholder')}
                       value={contact.groupAdmin || "Du"}
                       onChange={(e) => onUpdateContact({...contact, groupAdmin: e.target.value})}
                       className="bg-transparent w-full outline-none text-sm text-white pl-8 placeholder-gray-600"
                     />
                   </div>

                   <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50">
                     <div className="flex items-center gap-3 mb-2">
                       <Briefcase size={18} className="text-gray-400 shrink-0" />
                       <span className="text-sm font-medium text-gray-300">{t('contactDetail.manager')}</span>
                     </div>
                     <input
                       type="text"
                       placeholder={t('contactDetail.addManager')}
                       value={contact.groupManagers ? contact.groupManagers.join(", ") : ""}
                       onChange={(e) => onUpdateContact({...contact, groupManagers: e.target.value.split(", ")})}
                       className="bg-transparent w-full outline-none text-sm text-white pl-8 placeholder-gray-600"
                     />
                   </div>
                </div>
              ) : (
                /* INDIVIDUAL VIEW */
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 focus-within:border-blue-500/50 transition-colors">
                    <Phone size={18} className="text-gray-500 shrink-0" />
                    <input 
                      type="text" 
                      placeholder={t('contactDetail.addPhone')}
                      value={contact.phone || ""}
                      onChange={(e) => onUpdateContact({...contact, phone: e.target.value})}
                      className="bg-transparent w-full outline-none text-sm text-white placeholder-gray-600"
                    />
                  </div>
    
                  <div className="flex items-center gap-3 bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 focus-within:border-blue-500/50 transition-colors">
                    <Mail size={18} className="text-gray-500 shrink-0" />
                    <input 
                      type="email" 
                      placeholder={t('contactDetail.addEmail')}
                      value={contact.email || ""}
                      onChange={(e) => onUpdateContact({...contact, email: e.target.value})}
                      className="bg-transparent w-full outline-none text-sm text-white placeholder-gray-600"
                    />
                  </div>
    
                  <div className="flex items-center gap-3 bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 focus-within:border-blue-500/50 transition-colors">
                    <MapPin size={18} className="text-gray-500 shrink-0" />
                    <input 
                      type="text" 
                      placeholder={t('contactDetail.addAddress')}
                      value={contact.address || ""}
                      onChange={(e) => onUpdateContact({...contact, address: e.target.value})}
                      className="bg-transparent w-full outline-none text-sm text-white placeholder-gray-600"
                    />
                  </div>
    
                  <div className="flex items-center gap-3 bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 focus-within:border-blue-500/50 transition-colors relative">
                    <Calendar size={18} className="text-gray-500 shrink-0 pointer-events-none" />
                    <input 
                      type="date" 
                      placeholder={t('contactDetail.addBirthday')}
                      value={contact.birthday ? contact.birthday.split('.').reverse().join('-') : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          onUpdateContact({...contact, birthday: ""});
                        } else {
                          const [y, m, d] = val.split('-');
                          onUpdateContact({...contact, birthday: `${d}.${m}.${y}`});
                        }
                      }}
                      className="bg-transparent w-full outline-none text-sm text-white placeholder-gray-600 appearance-none [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Zu Liste hinzufügen */}
            <div className="mt-8">
               <button
                 onClick={() => setShowListSelector(!showListSelector)}
                 className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all ${
                    showListSelector
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                 }`}
               >
                 <ListPlus size={20} />
                 <span className="font-medium">{t('contactDetail.addToList')}</span>
               </button>

               {showListSelector && (
                 <div className="mt-3 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden animate-slideUpAndFade">
                   <div className="p-2 grid grid-cols-2 gap-2">
                     {categoryTabs.map(tab => {
                       const isSelected = (contact.categories || []).includes(tab.id);
                       return (
                         <button
                           key={tab.id}
                           onClick={() => handleToggleList(tab.id)}
                           className={`flex items-center justify-between p-3 rounded-lg text-sm transition-all border ${
                             isSelected
                             ? "bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-sm shadow-blue-500/10"
                             : "bg-gray-800/50 hover:bg-gray-700 border-transparent text-gray-300"
                           }`}
                         >
                           <span className="font-medium">{tab.label}</span>
                           {isSelected && <Check size={16} />}
                         </button>
                       );
                     })}
                   </div>
                 </div>
               )}
            </div>

            {/* Kontakt entfernen + Blockieren — nur für echte P2P-Kontakte */}
            {contact.id.startsWith('AC-') && (
              <div className="mt-6 space-y-2">
                <button
                  onClick={() => setShowRemoveConfirm(true)}
                  className="w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                >
                  <Trash2 size={18} />
                  <span className="font-medium">{t('people.removeContact')}</span>
                </button>
                {!isBlocked(contact.id) && (
                  <button
                    onClick={() => {
                      blockContact(contact.id);
                      onBlockContact?.(contact.id);
                      onClose();
                    }}
                    className="w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 transition-colors"
                  >
                    <Ban size={18} />
                    <span className="font-medium">{t('people.blockContact')}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bestätigungsdialog */}
          <AlertDialog.Root open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="bg-black/60 backdrop-blur-sm fixed inset-0 z-[60] animate-in fade-in duration-200" />
              <AlertDialog.Content className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[400px] translate-x-[-50%] translate-y-[-50%] rounded-xl bg-gray-900 border border-gray-800 p-6 shadow-2xl focus:outline-none z-[60] animate-in zoom-in-95 duration-200">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-red-500/10 rounded-full text-red-500"><Trash2 size={24} /></div>
                    <div>
                      <AlertDialog.Title className="text-lg font-semibold text-white">
                        {t('people.removeConfirmTitle', { name: contact.name })}
                      </AlertDialog.Title>
                      <AlertDialog.Description className="text-sm text-gray-400 mt-1">
                        {t('people.removeConfirmDesc')}
                      </AlertDialog.Description>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    <AlertDialog.Action
                      onClick={() => {
                        onRemoveContact?.(contact.id);
                        setShowRemoveConfirm(false);
                        onClose();
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}