import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { 
  X, MessageCircle, Phone, Video, Calendar, Mail, MapPin, 
  Users, User, Shield, Crown, Briefcase, ListPlus, Check 
} from "lucide-react";
import { useState, useEffect } from "react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { Contact, Tab } from "@/app/types";

interface ContactDetailModalProps {
  contact: Contact | null;
  onClose: () => void;
  onUpdateContact: (updatedContact: Contact) => void;
  tabs: Tab[];
}

export function ContactDetailModal({ contact, onClose, onUpdateContact, tabs }: ContactDetailModalProps) {
  const [showListSelector, setShowListSelector] = useState(false);

  // Close list selector when contact changes/closes
  useEffect(() => {
    if (!contact) setShowListSelector(false);
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
            {isGroup ? "Gruppen Details" : "Kontakt Details"}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Details und Aktionen für {contact.name}
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
                   Gruppe
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
                  <span className="text-xs font-medium">Ändern</span>
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
                  const label = tabs.find(t => t.id === catId)?.label || catId;
                  return (
                    <span key={catId} className="bg-gray-800 px-2 py-0.5 rounded text-xs border border-gray-700">
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-6 mb-8">
              <button className="flex flex-col items-center gap-2 group" title="Nachricht">
                <div className={`w-12 h-12 ${isGroup ? 'bg-indigo-600 shadow-indigo-600/30' : 'bg-blue-600 shadow-blue-600/30'} rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                  <MessageCircle size={24} className="text-white" />
                </div>
                <span className="text-xs text-gray-400 font-medium">Chat</span>
              </button>

              <button className="flex flex-col items-center gap-2 group" title={isGroup ? "Sprachanruf" : "Anruf"}>
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-600/30 group-hover:scale-110 transition-transform">
                  <Phone size={24} className="text-white" />
                </div>
                <span className="text-xs text-gray-400 font-medium">Audio</span>
              </button>

              <button className="flex flex-col items-center gap-2 group" title="Videoanruf">
                <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-600/30 group-hover:scale-110 transition-transform">
                  <Video size={24} className="text-white" />
                </div>
                <span className="text-xs text-gray-400 font-medium">Video</span>
              </button>

              <button className="flex flex-col items-center gap-2 group" title="Planen">
                <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:scale-110 transition-transform">
                  <Calendar size={24} className="text-white" />
                </div>
                <span className="text-xs text-gray-400 font-medium">Planen</span>
              </button>
            </div>
            
            {/* Conditional Content */}
            <div className="space-y-4 pt-4 border-t border-gray-800">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
                {isGroup ? "Gruppen Information" : "Persönliche Informationen"}
              </h3>
              
              {isGroup ? (
                /* GROUP VIEW */
                <div className="space-y-3">
                   <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50">
                     <div className="flex items-center gap-3 mb-2">
                       <Crown size={18} className="text-yellow-500 shrink-0" />
                       <span className="text-sm font-medium text-gray-300">Ersteller</span>
                     </div>
                     <input 
                       type="text" 
                       placeholder="Ersteller Name"
                       value={contact.groupCreator || "Du"}
                       onChange={(e) => onUpdateContact({...contact, groupCreator: e.target.value})}
                       className="bg-transparent w-full outline-none text-sm text-white pl-8 placeholder-gray-600"
                     />
                   </div>

                   <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50">
                     <div className="flex items-center gap-3 mb-2">
                       <Shield size={18} className="text-blue-500 shrink-0" />
                       <span className="text-sm font-medium text-gray-300">Admin</span>
                     </div>
                     <input 
                       type="text" 
                       placeholder="Admin Name"
                       value={contact.groupAdmin || "Du"}
                       onChange={(e) => onUpdateContact({...contact, groupAdmin: e.target.value})}
                       className="bg-transparent w-full outline-none text-sm text-white pl-8 placeholder-gray-600"
                     />
                   </div>

                   <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50">
                     <div className="flex items-center gap-3 mb-2">
                       <Briefcase size={18} className="text-gray-400 shrink-0" />
                       <span className="text-sm font-medium text-gray-300">Verwalter</span>
                     </div>
                     <input 
                       type="text" 
                       placeholder="Verwalter hinzufügen"
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
                      placeholder="Telefonnummer hinzufügen"
                      value={contact.phone || ""}
                      onChange={(e) => onUpdateContact({...contact, phone: e.target.value})}
                      className="bg-transparent w-full outline-none text-sm text-white placeholder-gray-600"
                    />
                  </div>
    
                  <div className="flex items-center gap-3 bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 focus-within:border-blue-500/50 transition-colors">
                    <Mail size={18} className="text-gray-500 shrink-0" />
                    <input 
                      type="email" 
                      placeholder="Email-Adresse hinzufügen"
                      value={contact.email || ""}
                      onChange={(e) => onUpdateContact({...contact, email: e.target.value})}
                      className="bg-transparent w-full outline-none text-sm text-white placeholder-gray-600"
                    />
                  </div>
    
                  <div className="flex items-center gap-3 bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 focus-within:border-blue-500/50 transition-colors">
                    <MapPin size={18} className="text-gray-500 shrink-0" />
                    <input 
                      type="text" 
                      placeholder="Adresse hinzufügen"
                      value={contact.address || ""}
                      onChange={(e) => onUpdateContact({...contact, address: e.target.value})}
                      className="bg-transparent w-full outline-none text-sm text-white placeholder-gray-600"
                    />
                  </div>
    
                  <div className="flex items-center gap-3 bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 focus-within:border-blue-500/50 transition-colors relative">
                    <Calendar size={18} className="text-gray-500 shrink-0 pointer-events-none" />
                    <input 
                      type="date" 
                      placeholder="Geburtstag hinzufügen"
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

            {/* Add to List Button */}
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
                 <span className="font-medium">Zu Liste hinzufügen</span>
               </button>

               {showListSelector && (
                 <div className="mt-3 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden animate-slideUpAndFade">
                   <div className="p-2 grid grid-cols-2 gap-2">
                     {tabs.filter(t => t.id !== 'all').map(tab => {
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}