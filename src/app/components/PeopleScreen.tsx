import { useState } from "react";
import { 
  ArrowLeft, Search, Plus, Users, Baby, Briefcase, 
  Heart, MoreVertical, Shield, Smartphone, Check, 
  QrCode, Phone, Mail, MapPin, Calendar, Star, X,
  UserPlus, User, MessageCircle, Video, Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import * as Dialog from "@radix-ui/react-dialog";
import { ContactDetailModal } from "./ContactDetailModal";
import { MOCK_CONTACTS } from "../data/contacts";
import { Contact, Tab } from "../types";
import { TabManagementModal } from "./TabManagementModal";

interface PeopleScreenProps {
  onBack: () => void;
  onOpenChildProfile: () => void; // Keep for compatibility if needed, though we might handle it internally
  tabs: Tab[];
  onUpdateTabs: (tabs: Tab[]) => void;
}

export default function PeopleScreen({ onBack, tabs, onUpdateTabs }: PeopleScreenProps) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contacts, setContacts] = useState<Contact[]>(MOCK_CONTACTS);
  const [isTabModalOpen, setIsTabModalOpen] = useState(false);
  
  // Child Creation State
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [creationStep, setCreationStep] = useState<"fsk" | "qr">("fsk");
  const [selectedFSK, setSelectedFSK] = useState<number | null>(null);

  const FSK_OPTIONS = [
    { age: 6, label: "FSK 6", description: "Stark eingeschränkt. Nur freigegebene Kontakte.", color: "bg-green-500" },
    { age: 12, label: "FSK 12", description: "Eingeschränkt. Kontaktanfragen genehmigen.", color: "bg-yellow-500" },
    { age: 14, label: "FSK 14", description: "Standard. Voller Chat-Zugriff.", color: "bg-orange-500" },
    { age: 16, label: "FSK 16", description: "Fast uneingeschränkt.", color: "bg-red-500" },
  ];

  const filteredContacts = contacts.filter(c => {
    if (activeTab === "all") return true;
    return c.categories.includes(activeTab);
  });

  const handleUpdateContact = (updatedContact: Contact) => {
    setContacts(contacts.map(c => c.id === updatedContact.id ? updatedContact : c));
    setSelectedContact(updatedContact);
  };

  const handleCreateChild = () => {
    setIsCreatingChild(true);
    setCreationStep("fsk");
    setSelectedFSK(null);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
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
            Kontakte
          </h1>
        </div>
        <button className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10">
          <Search size={22} />
        </button>
      </header>

      {/* Tabs */}
      {!isCreatingChild && (
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
                     <h2 className="text-xl font-bold">Kinderschutz einrichten</h2>
                     <p className="text-gray-400 text-sm mt-1">Wähle eine Altersstufe für das neue Profil.</p>
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
                      Weiter
                    </button>
                 </div>
               )}

               {creationStep === "qr" && (
                 <div className="flex flex-col items-center justify-center text-center space-y-6 pt-10">
                    <h2 className="text-2xl font-bold">QR-Code scannen</h2>
                    <p className="text-gray-400 max-w-xs">
                      Scanne diesen Code mit dem Handy deines Kindes, um das Profil zu aktivieren.
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
                      Fertig
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
                  <motion.div
                    key={contact.id}
                    layoutId={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-gray-800/50 border border-gray-700/50 hover:bg-gray-800 cursor-pointer transition-colors group"
                  >
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-gray-700 group-hover:border-blue-500 transition-colors">
                        <ImageWithFallback src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                      </div>
                      {contact.categories.includes("child") && (
                        <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-1">
                          <Shield size={12} className="text-blue-400" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">{contact.name}</h3>
                      <p className="text-sm text-gray-400">
                        {contact.categories.includes("child") ? `FSK ${contact.ageRating}` : contact.categories.map(c => tabs.find(t => t.id === c)?.label || c).join(", ")}
                      </p>
                    </div>
                    
                    {contact.status && (
                      <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full">
                        {contact.status}
                      </span>
                    )}
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <div className="bg-gray-800 p-4 rounded-full mb-4">
                    <Search size={32} />
                  </div>
                  <p>Keine Kontakte in "{tabs.find(t => t.id === activeTab)?.label}"</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Contact Detail Modal */}
      <ContactDetailModal
        contact={selectedContact} 
        onClose={() => setSelectedContact(null)}
        onUpdateContact={handleUpdateContact}
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