import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, Search, Users, LayoutGrid, Calendar, MessageCircle, Settings, 
  Shield, QrCode, Plus, ChevronRight, Hash, User, Trash2, Edit2, Share2,
  School, Briefcase, Heart, Home, FolderOpen, CheckCircle, Clock
} from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";

interface SpacesScreenProps {
  onBack: () => void;
}

// Types
type SpaceRole = "admin" | "member" | "guest" | "moderator";
type SpaceType = "school" | "work" | "club" | "family" | "friends";
type IdentityRule = "real_name" | "nickname" | "mixed" | "role_based";

interface Member {
  id: string;
  name: string;
  role: SpaceRole;
  avatar: string;
}

interface Chat {
  id: string;
  name: string;
  type: "text" | "voice";
  unread?: number;
}

interface SubSpace {
  id: string;
  name: string;
  icon?: string;
}

interface Space {
  id: string;
  name: string;
  description?: string;
  image: string;
  type: SpaceType;
  members: Member[];
  chats: Chat[];
  subSpaces: SubSpace[];
  pinnedEvents: { id: string; title: string; date: string }[];
  identityRule: IdentityRule;
}

// Mock Data
const MOCK_SPACES: Space[] = [
  {
    id: "1",
    name: "Design Team",
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80",
    type: "work",
    identityRule: "real_name",
    members: [
      { id: "m1", name: "Anna Schmidt", role: "admin", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100" },
      { id: "m2", name: "Max Mustermann", role: "member", avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100" },
    ],
    chats: [
      { id: "c1", name: "Allgemein", type: "text" },
      { id: "c2", name: "Design Reviews", type: "text", unread: 3 },
    ],
    subSpaces: [
      { id: "s1", name: "Frontend" },
      { id: "s2", name: "Marketing" },
    ],
    pinnedEvents: [
      { id: "e1", title: "Weekly Sync", date: "Mo. 10:00" },
      { id: "e2", title: "Deadline Q1", date: "31. März" }
    ]
  },
  {
    id: "2",
    name: "Klasse 4b",
    image: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80",
    type: "school",
    identityRule: "role_based",
    members: [],
    chats: [],
    subSpaces: [],
    pinnedEvents: []
  }
];

export default function SpacesScreen({ onBack }: SpacesScreenProps) {
  const [view, setView] = useState<"list" | "create" | "detail" | "invite">("list");
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  
  // Create Space Form State
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceType, setNewSpaceType] = useState<SpaceType>("friends");
  const [newIdentityRule, setNewIdentityRule] = useState<IdentityRule>("nickname");

  // Detail View State
  const [activeTab, setActiveTab] = useState<"overview" | "subspaces" | "chats" | "members" | "settings">("overview");

  // Invite View State
  const [inviteRole, setInviteRole] = useState("member");
  
  const handleSpaceClick = (space: Space) => {
    setSelectedSpace(space);
    setView("detail");
    setActiveTab("overview");
  };

  const handleCreateSpace = () => {
    // Logic to add space would go here
    setView("list");
  };

  const renderHeader = (title: string, backAction: () => void, rightAction?: React.ReactNode) => (
    <header className="px-4 py-4 flex items-center justify-between bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
      <div className="flex items-center gap-4">
        <button 
          onClick={backAction}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-white">{title}</h1>
      </div>
      {rightAction}
    </header>
  );

  // --- Views ---

  if (view === "list") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans relative">
        {renderHeader("Spaces", onBack)}
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-4 max-w-lg mx-auto pb-20">
            {MOCK_SPACES.map((space) => (
              <motion.button
                key={space.id}
                onClick={() => handleSpaceClick(space)}
                whileTap={{ scale: 0.98 }}
                className="group relative overflow-hidden bg-gray-800 rounded-2xl border border-gray-700 shadow-lg text-left"
              >
                <div className="h-32 w-full relative">
                  <ImageWithFallback src={space.image} className="w-full h-full object-cover" alt={space.name} />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <h3 className="text-xl font-bold text-white">{space.name}</h3>
                    <p className="text-xs text-gray-300 capitalize flex items-center gap-1">
                      {space.type === 'work' && <Briefcase size={12}/>}
                      {space.type === 'school' && <School size={12}/>}
                      {space.type === 'family' && <Home size={12}/>}
                      {space.type}
                    </p>
                  </div>
                </div>
              </motion.button>
            ))}
            
            {MOCK_SPACES.length === 0 && (
              <div className="text-center py-20 text-gray-500">
                <LayoutGrid size={48} className="mx-auto mb-4 opacity-50" />
                <p>Du bist noch keinem Space beigetreten.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    );
  }

  if (view === "create") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader("Space erstellen", () => setView("list"))}
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-lg mx-auto space-y-6">
            
            {/* Name & Image */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400 ml-1">Space Name & Bild</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center cursor-pointer hover:bg-gray-750">
                   <Plus size={24} className="text-gray-500" />
                </div>
                <input 
                  type="text" 
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  placeholder="Wie soll der Space heißen?"
                  className="flex-1 bg-gray-800 border-none rounded-xl p-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {/* Type */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400 ml-1">Space Typ</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "school", label: "Schule", icon: School },
                  { id: "work", label: "Unternehmen", icon: Briefcase },
                  { id: "family", label: "Familie", icon: Home },
                  { id: "club", label: "Verein", icon: Heart },
                  { id: "friends", label: "Freunde", icon: Users },
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setNewSpaceType(type.id as SpaceType)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      newSpaceType === type.id 
                        ? "bg-blue-600 border-blue-500 text-white" 
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                    }`}
                  >
                    <type.icon size={18} />
                    <span className="text-sm font-medium">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Identity Rules */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400 ml-1">Identitätsregeln</label>
              <div className="bg-gray-800 rounded-2xl p-2 space-y-1 border border-gray-700">
                {[
                  { id: "real_name", label: "Echter Name Pflicht", desc: "Nutzer müssen ihren Klarnamen verwenden" },
                  { id: "nickname", label: "Nickname erlaubt", desc: "Nutzer können Pseudonyme wählen" },
                  { id: "mixed", label: "Nickname + Echter Name", desc: "Beides wird angezeigt" },
                  { id: "role_based", label: "Rollenbasiert", desc: "Regeln hängen von der Rolle ab" },
                ].map((rule) => (
                   <button
                    key={rule.id}
                    onClick={() => setNewIdentityRule(rule.id as IdentityRule)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left ${
                      newIdentityRule === rule.id ? "bg-gray-700" : "hover:bg-gray-750"
                    }`}
                  >
                    <div>
                      <div className={`font-medium text-sm ${newIdentityRule === rule.id ? "text-white" : "text-gray-300"}`}>
                        {rule.label}
                      </div>
                      <div className="text-xs text-gray-500">{rule.desc}</div>
                    </div>
                    {newIdentityRule === rule.id && <div className="w-3 h-3 rounded-full bg-blue-500" />}
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={handleCreateSpace}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl mt-4"
            >
              Space erstellen
            </button>

          </div>
        </div>
      </div>
    );
  }

  if (view === "detail" && selectedSpace) {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans relative">
        
        {/* Detail Header */}
        <div className="relative h-40 shrink-0">
          <ImageWithFallback src={selectedSpace.image} className="w-full h-full object-cover opacity-60" alt={selectedSpace.name} />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 via-transparent to-gray-900" />
          <button onClick={() => setView("list")} className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white">
            <ArrowLeft size={20} />
          </button>
          <div className="absolute bottom-0 left-0 p-4 w-full">
            <h1 className="text-2xl font-bold">{selectedSpace.name}</h1>
            <p className="text-xs text-gray-300 opacity-80 flex items-center gap-1">
              <Shield size={10} /> {selectedSpace.members.length} Mitglieder • {selectedSpace.type}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1">
              {[
                  { id: "overview", label: "Übersicht" },
                  { id: "subspaces", label: "Unterräume" },
                  { id: "chats", label: "Chats" },
                  { id: "members", label: "Mitglieder" },
                  { id: "settings", label: "Einstellungen" },
              ].map(tab => (
                  <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                          activeTab === tab.id ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-200"
                      }`}
                  >
                      {tab.label}
                  </button>
              ))}
            </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
           {activeTab === "overview" && (
             <div className="space-y-6 max-w-lg mx-auto">
               {/* Important Chats Widget */}
               <div className="space-y-2">
                 <h3 className="text-xs font-bold text-gray-500 uppercase">Wichtige Chats</h3>
                 <div className="grid grid-cols-1 gap-2">
                   {selectedSpace.chats.slice(0, 2).map(chat => (
                     <div key={chat.id} className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex items-center gap-3">
                        <div className="bg-blue-600/20 p-2 rounded-lg text-blue-400">
                          <MessageCircle size={18} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{chat.name}</div>
                          {chat.unread && <div className="text-xs text-blue-400 font-bold">{chat.unread} neue Nachrichten</div>}
                        </div>
                        <ChevronRight size={16} className="text-gray-600" />
                     </div>
                   ))}
                 </div>
               </div>

               {/* Important Dates Widget */}
               <div className="space-y-2">
                 <h3 className="text-xs font-bold text-gray-500 uppercase">Wichtige Termine</h3>
                 <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                   {selectedSpace.pinnedEvents.map(evt => (
                     <div key={evt.id} className="min-w-[140px] bg-gray-800 p-3 rounded-xl border border-gray-700">
                       <div className="text-xs text-purple-400 font-bold mb-1">{evt.date}</div>
                       <div className="text-sm font-medium">{evt.title}</div>
                     </div>
                   ))}
                   <button className="min-w-[50px] flex items-center justify-center bg-gray-800/50 rounded-xl border border-gray-700/50">
                     <Plus size={20} className="text-gray-500" />
                   </button>
                 </div>
               </div>

               {/* Roles Widget */}
               <div className="space-y-2">
                 <h3 className="text-xs font-bold text-gray-500 uppercase">Meine Rolle</h3>
                 <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Administrator</div>
                      <div className="text-xs text-gray-500">Volle Zugriffsrechte</div>
                    </div>
                    <Shield size={20} className="text-green-500" />
                 </div>
               </div>
             </div>
           )}

           {activeTab === "subspaces" && (
             <div className="space-y-4">
                {selectedSpace.subSpaces.map(sub => (
                   <div key={sub.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex items-center gap-3">
                      <FolderOpen size={20} className="text-yellow-500" />
                      <span className="font-medium">{sub.name}</span>
                   </div>
                ))}
                <button className="w-full py-3 border border-dashed border-gray-600 rounded-xl text-gray-400 hover:bg-gray-800/50 text-sm font-medium flex items-center justify-center gap-2">
                  <Plus size={16} /> Unterraum erstellen
                </button>
             </div>
           )}

           {activeTab === "chats" && (
             <div className="space-y-2">
                {selectedSpace.chats.map(chat => (
                   <div key={chat.id} className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex items-center gap-3">
                      <Hash size={20} className="text-gray-500" />
                      <span className="font-medium">{chat.name}</span>
                   </div>
                ))}
                <button className="w-full py-3 border border-dashed border-gray-600 rounded-xl text-gray-400 hover:bg-gray-800/50 text-sm font-medium flex items-center justify-center gap-2 mt-4">
                  <Plus size={16} /> Chat erstellen
                </button>
             </div>
           )}

           {activeTab === "members" && (
             <div className="space-y-4">
                <div className="flex gap-2 mb-4">
                  <button className="flex-1 bg-blue-600 text-white text-sm font-bold py-2 rounded-lg">Mitglied hinzufügen</button>
                  <button className="flex-1 bg-gray-700 text-white text-sm font-medium py-2 rounded-lg">Rollen verwalten</button>
                </div>
                {selectedSpace.members.map(member => (
                   <div key={member.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-3">
                        <ImageWithFallback src={member.avatar} className="w-10 h-10 rounded-full" alt={member.name} />
                        <div>
                          <div className="font-medium text-sm">{member.name}</div>
                          <div className="text-xs text-gray-500 capitalize">{member.role}</div>
                        </div>
                      </div>
                      <button className="text-gray-500 hover:text-white p-2">
                        <Edit2 size={16} />
                      </button>
                   </div>
                ))}
             </div>
           )}

           {activeTab === "settings" && (
             <div className="space-y-2">
               {[
                 { label: "Identität & Namen", icon: User },
                 { label: "Rollenverwaltung", icon: Shield },
                 { label: "Unterräume verwalten", icon: LayoutGrid },
                 { label: "Einladungen (QR-Code)", icon: QrCode, action: () => setView("invite") },
                 { label: "Space löschen", icon: Trash2, color: "text-red-400" },
               ].map((setting, i) => (
                  <button
                    key={i}
                    onClick={setting.action}
                    className="w-full flex items-center justify-between p-4 bg-gray-800 rounded-xl border border-gray-700 hover:bg-gray-750"
                  >
                    <div className={`flex items-center gap-3 ${setting.color || "text-gray-200"}`}>
                      <setting.icon size={20} />
                      <span className="font-medium text-sm">{setting.label}</span>
                    </div>
                    <ChevronRight size={16} className="text-gray-600" />
                  </button>
               ))}
             </div>
           )}
        </div>

      </div>
    );
  }

  if (view === "invite") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader("Einladung erstellen", () => {
            setView("detail");
            setActiveTab("settings");
        })}
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-md mx-auto space-y-6">
            
            <div className="bg-white p-4 rounded-xl flex items-center justify-center">
              <QrCode size={200} className="text-black" />
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Rolle für Einladung</label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {["Eltern", "Kind", "Lehrer", "Mitarbeiter", "Mitglied"].map(role => (
                    <button
                      key={role}
                      onClick={() => setInviteRole(role)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        inviteRole === role 
                        ? "bg-blue-600 border-blue-600 text-white" 
                        : "bg-gray-800 border-gray-700 text-gray-400"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Gültigkeit</label>
                <div className="bg-gray-800 rounded-xl p-3 border border-gray-700 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <Clock size={18} className="text-gray-500" />
                     <span className="text-sm">Läuft ab am 01.02.2026</span>
                   </div>
                   <button className="text-blue-400 text-xs font-bold">Ändern</button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Art der Einladung</label>
                <div className="bg-gray-800 rounded-xl p-1 border border-gray-700 flex">
                   <button className="flex-1 py-2 text-xs font-bold bg-gray-700 rounded-lg text-white">Masseneinladung</button>
                   <button className="flex-1 py-2 text-xs font-medium text-gray-400">Personalisiert</button>
                </div>
              </div>
            </div>

            <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2">
              <Share2 size={18} /> Teilen
            </button>

          </div>
        </div>
      </div>
    );
  }

  return null;
}