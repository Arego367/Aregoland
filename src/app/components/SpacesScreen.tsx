import { useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import {
  ArrowLeft, Users, LayoutGrid, Calendar, MessageCircle, Settings,
  Shield, QrCode, Plus, ChevronRight, Hash, User, Trash2, Edit2, Share2,
  School, Briefcase, Heart, Home, FolderOpen, Clock, Landmark, Globe, Wrench,
  Info, Check, X, GripVertical, UserPlus, Crown, Eye, ChevronDown,
  Pin, ThumbsUp, MessageSquare, Megaphone, Newspaper, Send
} from "lucide-react";
import { useTranslation } from 'react-i18next';
import { loadIdentity } from "@/app/auth/identity";
import QRCodeSvg from "react-qr-code";

// ── Types ──

type SpaceTemplate = "family" | "school" | "club" | "work" | "government" | "community" | "custom";
type SpaceRole = "founder" | "admin" | "moderator" | "cohost" | "member" | "guest";
type IdentityRule = "real_name" | "nickname" | "mixed" | "role_based";

interface SpaceMember {
  aregoId: string;
  displayName: string;
  role: SpaceRole;
}

interface SpaceComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

interface SpacePost {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: SpaceRole;
  title: string;
  text: string;
  badge: "announcement" | "news" | "event";
  pinned: boolean;
  upvotes: string[]; // aregoIds
  comments: SpaceComment[];
  createdAt: string;
  // Event-specific fields
  eventDate?: string;   // ISO date YYYY-MM-DD
  eventTime?: string;   // HH:mm
  eventLocation?: string;
  rsvp?: Record<string, "yes" | "no" | "maybe">; // aregoId → response
}

interface Space {
  id: string;
  name: string;
  description: string;
  template: SpaceTemplate;
  color: string;
  identityRule: IdentityRule;
  founderId: string;
  members: SpaceMember[];
  posts: SpacePost[];
  createdAt: string;
  settings: {
    membersVisible: boolean;
    coHostingAllowed: boolean;
    publicJoin: boolean;
    idVerification: boolean;
  };
}

// ── Storage ──

const SPACES_KEY = "aregoland_spaces";

function loadSpaces(): Space[] {
  try {
    const raw: Space[] = JSON.parse(localStorage.getItem(SPACES_KEY) ?? "[]");
    // Ensure posts array exists (migration for spaces created before posts feature)
    return raw.map(s => ({ ...s, posts: s.posts ?? [] }));
  }
  catch { return []; }
}

function saveSpaces(spaces: Space[]) {
  localStorage.setItem(SPACES_KEY, JSON.stringify(spaces));
}

const ORDER_KEY = "aregoland_spaces_order";

function applyOrder(spaces: Space[]): Space[] {
  try {
    const order: string[] = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]");
    if (!order.length) return spaces;
    const map = new Map(spaces.map(s => [s.id, s]));
    const ordered: Space[] = [];
    for (const id of order) { const s = map.get(id); if (s) { ordered.push(s); map.delete(id); } }
    map.forEach(s => ordered.push(s));
    return ordered;
  } catch { return spaces; }
}

function saveOrder(spaces: Space[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(spaces.map(s => s.id)));
}

// ── Invite Payload ──

interface SpaceInvitePayload {
  type: "space-invite";
  spaceId: string;
  spaceName: string;
  template: SpaceTemplate;
  role: SpaceRole;
  exp: number;
  n: string;
}

function createInvitePayload(space: Space, role: SpaceRole, ttlMs: number): string {
  const payload: SpaceInvitePayload = {
    type: "space-invite",
    spaceId: space.id,
    spaceName: space.name,
    template: space.template,
    role,
    exp: Date.now() + ttlMs,
    n: Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, "0")).join(""),
  };
  const json = JSON.stringify(payload);
  return btoa(new TextEncoder().encode(json).reduce((s, b) => s + String.fromCharCode(b), ""));
}

const ROLE_ORDER: SpaceRole[] = ["founder", "admin", "moderator", "cohost", "member", "guest"];
const ROLE_COLORS: Record<SpaceRole, { bg: string; text: string }> = {
  founder: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  admin: { bg: "bg-red-500/20", text: "text-red-400" },
  moderator: { bg: "bg-blue-500/20", text: "text-blue-400" },
  cohost: { bg: "bg-purple-500/20", text: "text-purple-400" },
  member: { bg: "bg-gray-700/50", text: "text-gray-400" },
  guest: { bg: "bg-gray-800", text: "text-gray-500" },
};

const INVITE_TTLS = [
  { id: "1h", ms: 60 * 60 * 1000 },
  { id: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "unlimited", ms: 365 * 24 * 60 * 60 * 1000 }, // 1 year as "unlimited"
  { id: "custom", ms: 0 },
];

const INVITABLE_ROLES: { role: SpaceRole; descKey: string }[] = [
  { role: "admin", descKey: "roleDesc_admin" },
  { role: "moderator", descKey: "roleDesc_moderator" },
  { role: "member", descKey: "roleDesc_member" },
  { role: "guest", descKey: "roleDesc_guest" },
];

function isHighRole(r: SpaceRole) { return r === "admin" || r === "moderator"; }

// ── Template Definitions ──

const TEMPLATES: {
  id: SpaceTemplate;
  icon: typeof Home;
  color: string;
  gradient: string;
  defaultIdentityRule: IdentityRule;
  defaultSettings: Space["settings"];
}[] = [
  {
    id: "family", icon: Home, color: "text-pink-400", gradient: "from-pink-600 to-rose-500",
    defaultIdentityRule: "real_name",
    defaultSettings: { membersVisible: true, coHostingAllowed: false, publicJoin: false, idVerification: false },
  },
  {
    id: "school", icon: School, color: "text-blue-400", gradient: "from-blue-600 to-cyan-500",
    defaultIdentityRule: "role_based",
    defaultSettings: { membersVisible: true, coHostingAllowed: true, publicJoin: false, idVerification: true },
  },
  {
    id: "club", icon: Heart, color: "text-orange-400", gradient: "from-orange-600 to-amber-500",
    defaultIdentityRule: "real_name",
    defaultSettings: { membersVisible: true, coHostingAllowed: true, publicJoin: false, idVerification: false },
  },
  {
    id: "work", icon: Briefcase, color: "text-indigo-400", gradient: "from-indigo-600 to-violet-500",
    defaultIdentityRule: "real_name",
    defaultSettings: { membersVisible: true, coHostingAllowed: true, publicJoin: false, idVerification: true },
  },
  {
    id: "government", icon: Landmark, color: "text-emerald-400", gradient: "from-emerald-600 to-teal-500",
    defaultIdentityRule: "real_name",
    defaultSettings: { membersVisible: false, coHostingAllowed: true, publicJoin: true, idVerification: true },
  },
  {
    id: "community", icon: Globe, color: "text-purple-400", gradient: "from-purple-600 to-fuchsia-500",
    defaultIdentityRule: "nickname",
    defaultSettings: { membersVisible: true, coHostingAllowed: true, publicJoin: true, idVerification: false },
  },
  {
    id: "custom", icon: Wrench, color: "text-gray-400", gradient: "from-gray-600 to-gray-500",
    defaultIdentityRule: "nickname",
    defaultSettings: { membersVisible: true, coHostingAllowed: false, publicJoin: false, idVerification: false },
  },
];

function getTemplate(id: SpaceTemplate) {
  return TEMPLATES.find(t => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
}

// ── Component ──

interface SpacesScreenProps {
  onBack: () => void;
}

export default function SpacesScreen({ onBack }: SpacesScreenProps) {
  const { t } = useTranslation();
  const identity = useMemo(() => loadIdentity(), []);
  const [spaces, setSpaces] = useState<Space[]>(() => applyOrder(loadSpaces()));
  const [view, setView] = useState<"list" | "templates" | "create" | "detail" | "invite">("list");
  const [selectedTemplate, setSelectedTemplate] = useState<SpaceTemplate | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [toast, setToast] = useState(false);

  // Detail
  const [activeTab, setActiveTab] = useState<"overview" | "news" | "chats" | "members" | "settings">("overview");

  // Invite
  const [inviteRole, setInviteRole] = useState<SpaceRole>("member");
  const [inviteTtlId, setInviteTtlId] = useState("24h");
  const [customTtlDays, setCustomTtlDays] = useState("14");
  const [inviteEncoded, setInviteEncoded] = useState("");

  const getInviteTtlMs = () => {
    if (inviteTtlId === "custom") return parseInt(customTtlDays || "1") * 24 * 60 * 60 * 1000;
    return INVITE_TTLS.find(t => t.id === inviteTtlId)?.ms ?? 24 * 60 * 60 * 1000;
  };

  const getInviteTtlLabel = () => {
    if (inviteTtlId === "custom") return `${customTtlDays || "1"} ${t('spaces.ttlDays')}`;
    return t(`spaces.ttl_${inviteTtlId}`);
  };

  // Role editing
  const [editingMember, setEditingMember] = useState<string | null>(null);

  // News/Posts
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postText, setPostText] = useState("");
  const [postBadge, setPostBadge] = useState<SpacePost["badge"]>("news");
  const [postPinned, setPostPinned] = useState(false);
  const [postEventDate, setPostEventDate] = useState("");
  const [postEventTime, setPostEventTime] = useState("");
  const [postEventLocation, setPostEventLocation] = useState("");
  const [newsFilter, setNewsFilter] = useState<"all" | "announcement" | "news" | "event">("all");
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState<Record<string, string>>({});

  const handleSelectTemplate = (templateId: SpaceTemplate) => {
    setSelectedTemplate(templateId);
    setName("");
    setDescription("");
    setView("create");
  };

  const handleCreateSpace = () => {
    if (!name.trim() || !selectedTemplate || !identity) return;
    const tmpl = getTemplate(selectedTemplate);
    const space: Space = {
      id: `space-${Date.now().toString(36)}`,
      name: name.trim(),
      description: description.trim(),
      template: selectedTemplate,
      color: tmpl.gradient,
      identityRule: tmpl.defaultIdentityRule,
      founderId: identity.aregoId,
      members: [{
        aregoId: identity.aregoId,
        displayName: identity.displayName,
        role: "founder",
      }],
      posts: [],
      createdAt: new Date().toISOString(),
      settings: { ...tmpl.defaultSettings },
    };
    const updated = [...spaces, space];
    setSpaces(updated);
    saveSpaces(updated);
    setSelectedSpace(space);
    setView("detail");
    setActiveTab("overview");
    setToast(true);
    setTimeout(() => setToast(false), 2500);
  };

  const updateSpace = (updated: Space) => {
    const list = spaces.map(s => s.id === updated.id ? updated : s);
    setSpaces(list);
    saveSpaces(list);
    setSelectedSpace(updated);
  };

  const handleChangeRole = (aregoId: string, newRole: SpaceRole) => {
    if (!selectedSpace) return;
    const updated = {
      ...selectedSpace,
      members: selectedSpace.members.map(m => m.aregoId === aregoId ? { ...m, role: newRole } : m),
    };
    updateSpace(updated);
    setEditingMember(null);
  };

  const handleRemoveMember = (aregoId: string) => {
    if (!selectedSpace) return;
    const updated = {
      ...selectedSpace,
      members: selectedSpace.members.filter(m => m.aregoId !== aregoId),
    };
    updateSpace(updated);
  };

  const handleOpenInvite = () => {
    if (!selectedSpace) return;
    const encoded = createInvitePayload(selectedSpace, inviteRole, getInviteTtlMs());
    setInviteEncoded(encoded);
    setView("invite");
  };

  const regenerateInvite = (role?: SpaceRole, ttlId?: string) => {
    if (!selectedSpace) return;
    const r = role ?? inviteRole;
    const oldId = ttlId ?? inviteTtlId;
    // Enforce max 30d for admin/moderator
    let finalTtlId = oldId;
    if (isHighRole(r) && (oldId === "unlimited")) finalTtlId = "30d";
    if (ttlId !== finalTtlId) setInviteTtlId(finalTtlId);
    const ms = finalTtlId === "custom"
      ? parseInt(customTtlDays || "1") * 24 * 60 * 60 * 1000
      : INVITE_TTLS.find(t => t.id === finalTtlId)?.ms ?? 24 * 60 * 60 * 1000;
    setInviteEncoded(createInvitePayload(selectedSpace, r, ms));
  };

  const handleCreatePost = () => {
    if (!selectedSpace || !identity || !postTitle.trim()) return;
    if (postBadge === "event" && !postEventDate) return;
    const myRole = selectedSpace.members.find(m => m.aregoId === identity.aregoId)?.role ?? "member";
    const post: SpacePost = {
      id: `post-${Date.now().toString(36)}`,
      authorId: identity.aregoId,
      authorName: identity.displayName,
      authorRole: myRole,
      title: postTitle.trim(),
      text: postText.trim(),
      badge: postBadge,
      pinned: postPinned,
      upvotes: [],
      comments: [],
      createdAt: new Date().toISOString(),
      ...(postBadge === "event" ? {
        eventDate: postEventDate,
        eventTime: postEventTime,
        eventLocation: postEventLocation.trim() || undefined,
        rsvp: {},
      } : {}),
    };
    const updated = { ...selectedSpace, posts: [post, ...(selectedSpace.posts ?? [])] };
    updateSpace(updated);
    // Push notification for events
    if (postBadge === "event" && "Notification" in window && Notification.permission === "granted") {
      new Notification(selectedSpace.name, {
        body: `${t('spaces.newEvent')}: ${postTitle.trim()}`,
        icon: "/favicon.ico",
        tag: `arego-event-${post.id}`,
      });
    }
    setPostTitle(""); setPostText(""); setPostBadge("news"); setPostPinned(false);
    setPostEventDate(""); setPostEventTime(""); setPostEventLocation("");
    setShowCreatePost(false);
  };

  const handleUpvote = (postId: string) => {
    if (!selectedSpace || !identity) return;
    const updated = {
      ...selectedSpace,
      posts: selectedSpace.posts.map(p => {
        if (p.id !== postId) return p;
        const has = p.upvotes.includes(identity.aregoId);
        return { ...p, upvotes: has ? p.upvotes.filter(id => id !== identity.aregoId) : [...p.upvotes, identity.aregoId] };
      }),
    };
    updateSpace(updated);
  };

  const handleAddComment = (postId: string) => {
    if (!selectedSpace || !identity) return;
    const text = (commentText[postId] ?? "").trim();
    if (!text) return;
    const comment: SpaceComment = {
      id: `cmt-${Date.now().toString(36)}`,
      authorId: identity.aregoId,
      authorName: identity.displayName,
      text,
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...selectedSpace,
      posts: selectedSpace.posts.map(p => p.id === postId ? { ...p, comments: [...p.comments, comment] } : p),
    };
    updateSpace(updated);
    setCommentText(prev => ({ ...prev, [postId]: "" }));
  };

  const handleTogglePin = (postId: string) => {
    if (!selectedSpace) return;
    const updated = {
      ...selectedSpace,
      posts: selectedSpace.posts.map(p => p.id === postId ? { ...p, pinned: !p.pinned } : p),
    };
    updateSpace(updated);
  };

  const handleRsvp = (postId: string, response: "yes" | "no" | "maybe") => {
    if (!selectedSpace || !identity) return;
    const updated = {
      ...selectedSpace,
      posts: (selectedSpace.posts ?? []).map(p => {
        if (p.id !== postId) return p;
        const rsvp = { ...(p.rsvp ?? {}), [identity.aregoId]: response };
        return { ...p, rsvp };
      }),
    };
    updateSpace(updated);
  };

  const handleDeletePost = (postId: string) => {
    if (!selectedSpace) return;
    updateSpace({ ...selectedSpace, posts: selectedSpace.posts.filter(p => p.id !== postId) });
  };

  const handleDeleteSpace = (id: string) => {
    const updated = spaces.filter(s => s.id !== id);
    setSpaces(updated);
    saveSpaces(updated);
    setView("list");
    setSelectedSpace(null);
  };

  const renderHeader = (title: string, backAction: () => void) => (
    <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
      <button onClick={backAction} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all">
        <ArrowLeft size={24} />
      </button>
      <h1 className="text-xl font-bold text-white">{title}</h1>
    </header>
  );

  const handleReorder = (newOrder: Space[]) => {
    setSpaces(newOrder);
    saveOrder(newOrder);
  };

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader(t('spaces.title'), onBack)}

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium"
            >
              <Check size={16} /> {t('spaces.spaceCreated')}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Create Space button — top of list */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView("templates")}
            className="group flex items-center gap-4 p-3 rounded-xl hover:bg-gray-800/50 cursor-pointer transition-colors mb-3 bg-gradient-to-r from-gray-800/80 to-transparent border border-gray-700/50 w-full text-left"
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-blue-600/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-lg shadow-blue-900/10">
              <Plus size={26} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                {t('spaces.createSpace')}
              </h3>
              <p className="text-sm text-gray-400 group-hover:text-gray-300">
                {t('spaces.createFirstHint')}
              </p>
            </div>
          </motion.button>

          {spaces.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <LayoutGrid size={48} className="mx-auto mb-4 opacity-50" />
              <p>{t('spaces.noSpaces')}</p>
            </div>
          )}

          {spaces.length > 0 && (
            <Reorder.Group axis="y" values={spaces} onReorder={handleReorder} className="space-y-3">
              {spaces.map((space) => {
                const tmpl = getTemplate(space.template);
                const Icon = tmpl.icon;
                return (
                  <Reorder.Item key={space.id} value={space} className="list-none">
                    <div
                      className="group relative overflow-hidden bg-gray-800/50 rounded-2xl border border-gray-700/50 text-left flex"
                    >
                      {/* Drag handle */}
                      <div className="flex items-center px-2 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0 touch-none">
                        <GripVertical size={18} />
                      </div>

                      {/* Card content — clickable */}
                      <button
                        onClick={() => { setSelectedSpace(space); setActiveTab("overview"); setView("detail"); }}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className={`h-20 w-full bg-gradient-to-br ${space.color} flex items-center justify-center relative`}>
                          <Icon size={36} className="text-white/20" />
                          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
                        </div>
                        <div className="p-3 -mt-5 relative">
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className={`p-1 rounded-md bg-gray-800 border border-gray-700 ${tmpl.color}`}>
                              <Icon size={12} />
                            </div>
                            <span className="text-xs text-gray-500">{t(`spaces.tmpl_${space.template}`)}</span>
                          </div>
                          <h3 className="text-base font-bold">{space.name}</h3>
                          {space.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{space.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><Users size={11} /> {space.members.length}</span>
                          </div>
                        </div>
                      </button>
                    </div>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          )}
        </div>
      </div>
    );
  }

  // ── TEMPLATE SELECTION ──
  if (view === "templates") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader(t('spaces.chooseTemplate'), () => setView("list"))}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl.id)}
                  className="w-full flex items-center gap-4 p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-2xl transition-all text-left"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tmpl.gradient} flex items-center justify-center shrink-0`}>
                    <Icon size={22} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{t(`spaces.tmpl_${tmpl.id}`)}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t(`spaces.tmplDesc_${tmpl.id}`)}</div>
                  </div>
                  <ChevronRight size={18} className="text-gray-600 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── CREATE FORM ──
  if (view === "create" && selectedTemplate) {
    const tmpl = getTemplate(selectedTemplate);
    const Icon = tmpl.icon;
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader(t('spaces.createSpace'), () => setView("templates"))}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">

            {/* Template badge */}
            <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${tmpl.gradient} flex items-center justify-center`}>
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-bold">{t(`spaces.tmpl_${selectedTemplate}`)}</div>
                <div className="text-xs text-gray-500">{t(`spaces.tmplDesc_${selectedTemplate}`)}</div>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 px-1">{t('spaces.spaceName')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('spaces.spaceNamePlaceholder')}
                autoFocus
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 px-1">{t('spaces.descriptionLabel')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('spaces.descPlaceholder')}
                rows={3}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
              />
            </div>

            {/* Relay-Node Info */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
              <Info size={20} className="text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200/80 leading-relaxed">
                <p className="font-bold mb-1">{t('spaces.relayNodeTitle')}</p>
                {t('spaces.relayNodeDesc')}
              </div>
            </div>

            {/* Create Button */}
            <button
              onClick={handleCreateSpace}
              disabled={!name.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
            >
              <Plus size={20} />
              {t('spaces.createSpace')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (view === "detail" && selectedSpace) {
    const tmpl = getTemplate(selectedSpace.template);
    const Icon = tmpl.icon;
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {/* Header with gradient */}
        <div className={`relative h-36 shrink-0 bg-gradient-to-br ${selectedSpace.color}`}>
          <Icon size={80} className="absolute right-4 bottom-2 text-white/10" />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 to-gray-900" />
          <button onClick={() => setView("list")} className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white z-10">
            <ArrowLeft size={20} />
          </button>
          <div className="absolute bottom-0 left-0 p-4 w-full z-10">
            <div className="flex items-center gap-2 mb-1">
              <div className={`p-1 rounded-md bg-white/10 ${tmpl.color}`}><Icon size={12} /></div>
              <span className="text-xs text-gray-300 capitalize">{t(`spaces.tmpl_${selectedSpace.template}`)}</span>
            </div>
            <h1 className="text-2xl font-bold">{selectedSpace.name}</h1>
            <p className="text-xs text-gray-300 opacity-80 flex items-center gap-1 mt-0.5">
              <Users size={10} /> {selectedSpace.members.length} {t('spaces.members')}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1">
            {(["overview", "news", "chats", "members", "settings"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {t(`spaces.tab_${tab}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">

            {activeTab === "overview" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "member";
              const isAdmin = myRole === "founder" || myRole === "admin";
              const pinnedPosts = (selectedSpace.posts ?? []).filter(p => p.pinned).slice(0, 2);
              const recentAnnouncements = (selectedSpace.posts ?? []).filter(p => p.badge === "announcement").slice(0, 3);
              return (
                <>
                  {selectedSpace.description && (
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                      <p className="text-sm text-gray-300">{selectedSpace.description}</p>
                    </div>
                  )}

                  {/* Your role */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold">{t('spaces.yourRole')}</div>
                      <div className={`text-xs capitalize ${ROLE_COLORS[myRole as SpaceRole]?.text ?? "text-gray-500"}`}>{t(`spaces.role_${myRole}`)}</div>
                    </div>
                    <Shield size={20} className="text-green-500" />
                  </div>

                  {/* Pinned posts */}
                  {pinnedPosts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Pin size={12} /> {t('spaces.pinnedPosts')}</h3>
                      {pinnedPosts.map(p => (
                        <button key={p.id} onClick={() => { setActiveTab("news"); setNewsFilter("all"); }} className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-left hover:bg-yellow-500/15 transition-colors">
                          <div className="text-sm font-bold text-yellow-300">{p.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.text}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Recent announcements */}
                  {recentAnnouncements.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Megaphone size={12} /> {t('spaces.recentAnnouncements')}</h3>
                      {recentAnnouncements.map(p => (
                        <div key={p.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                          <div className="text-sm font-medium">{p.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{p.authorName} · {new Date(p.createdAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick stats for admins */}
                  {isAdmin && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                        <div className="text-lg font-bold text-blue-400">{selectedSpace.members.length}</div>
                        <div className="text-xs text-gray-500">{t('spaces.members')}</div>
                      </div>
                      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                        <div className="text-lg font-bold text-purple-400">{(selectedSpace.posts ?? []).length}</div>
                        <div className="text-xs text-gray-500">{t('spaces.tab_news')}</div>
                      </div>
                      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                        <div className="text-lg font-bold text-green-400">0</div>
                        <div className="text-xs text-gray-500">{t('spaces.tab_chats')}</div>
                      </div>
                    </div>
                  )}

                  {(selectedSpace.posts ?? []).length === 0 && pinnedPosts.length === 0 && (
                    <div className="text-center py-6 text-gray-600">
                      <Newspaper size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('spaces.emptyOverview')}</p>
                    </div>
                  )}
                </>
              );
            })()}

            {/* ── NEWS TAB ── */}
            {activeTab === "news" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "member";
              const canPost = myRole === "founder" || myRole === "admin" || myRole === "moderator";
              const allPosts = selectedSpace.posts ?? [];
              const pinned = allPosts.filter(p => p.pinned);
              const filtered = allPosts.filter(p => !p.pinned && (newsFilter === "all" || p.badge === newsFilter));
              const sortedPosts = [...pinned, ...filtered];

              const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
                announcement: { bg: "bg-red-500/20", text: "text-red-400", label: t('spaces.badgeAnnouncement') },
                news: { bg: "bg-blue-500/20", text: "text-blue-400", label: t('spaces.badgeNews') },
                event: { bg: "bg-purple-500/20", text: "text-purple-400", label: t('spaces.badgeEvent') },
              };

              return (
                <>
                  {/* Filter chips */}
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {(["all", "announcement", "news", "event"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setNewsFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                          newsFilter === f ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                        }`}
                      >
                        {f === "all" ? t('spaces.filterAll') : BADGE_STYLES[f]?.label ?? f}
                      </button>
                    ))}
                  </div>

                  {/* Create post button */}
                  {canPost && !showCreatePost && (
                    <button onClick={() => setShowCreatePost(true)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700/50 border-dashed hover:border-blue-500/50 hover:bg-blue-500/5 transition-all">
                      <Plus size={18} className="text-gray-500" />
                      <span className="text-sm text-gray-400 font-medium">{t('spaces.createPost')}</span>
                    </button>
                  )}

                  {/* Create post form */}
                  <AnimatePresence>
                    {showCreatePost && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="bg-gray-800/50 border border-blue-500/30 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold">{t('spaces.createPost')}</h4>
                            <button onClick={() => setShowCreatePost(false)} className="p-1 text-gray-500 hover:text-white"><X size={18} /></button>
                          </div>
                          <input type="text" value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder={t('spaces.postTitlePlaceholder')}
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all" />
                          <textarea value={postText} onChange={e => setPostText(e.target.value)} placeholder={t('spaces.postTextPlaceholder')} rows={3}
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all resize-none" />
                          <div className="flex items-center gap-2">
                            {(["announcement", "news", "event"] as const).map(b => (
                              <button key={b} onClick={() => setPostBadge(b)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${postBadge === b ? `${BADGE_STYLES[b].bg} ${BADGE_STYLES[b].text} ring-1 ring-current` : "bg-gray-800 text-gray-500"}`}>
                                {BADGE_STYLES[b].label}
                              </button>
                            ))}
                            <button onClick={() => setPostPinned(!postPinned)}
                              className={`ml-auto p-2 rounded-lg transition-all ${postPinned ? "bg-yellow-500/20 text-yellow-400" : "text-gray-600 hover:text-gray-400"}`}>
                              <Pin size={16} />
                            </button>
                          </div>
                          {/* Event-specific fields */}
                          {postBadge === "event" && (
                            <div className="space-y-2 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3">
                              <div className="flex gap-2">
                                <div className="flex-1 space-y-1">
                                  <label className="text-xs text-gray-400">{t('spaces.eventDate')}</label>
                                  <input type="date" value={postEventDate} onChange={e => setPostEventDate(e.target.value)}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-all" />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <label className="text-xs text-gray-400">{t('spaces.eventTime')}</label>
                                  <input type="time" value={postEventTime} onChange={e => setPostEventTime(e.target.value)}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-all" />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-gray-400">{t('spaces.eventLocation')}</label>
                                <input type="text" value={postEventLocation} onChange={e => setPostEventLocation(e.target.value)} placeholder={t('spaces.eventLocationPlaceholder')}
                                  className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-all" />
                              </div>
                            </div>
                          )}
                          <button onClick={handleCreatePost} disabled={!postTitle.trim() || (postBadge === "event" && !postEventDate)}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-all text-sm">
                            {t('spaces.publishPost')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Posts list */}
                  {sortedPosts.length === 0 && (
                    <div className="text-center py-10 text-gray-600">
                      <Newspaper size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('spaces.noPosts')}</p>
                    </div>
                  )}

                  {sortedPosts.map(post => {
                    const badge = BADGE_STYLES[post.badge];
                    const isExpanded = expandedComments.has(post.id);
                    const hasUpvoted = identity ? post.upvotes.includes(identity.aregoId) : false;
                    const canManagePost = identity && (post.authorId === identity.aregoId || selectedSpace.founderId === identity.aregoId);
                    return (
                      <div key={post.id} className={`bg-gray-800/50 border rounded-xl overflow-hidden ${post.pinned ? "border-yellow-500/30" : "border-gray-700/50"}`}>
                        {/* Post header */}
                        <div className="p-4 pb-2">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-xs font-bold text-white">
                                {(post.authorName[0] ?? "").toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{post.authorName}</div>
                                <div className="text-xs text-gray-500">{t(`spaces.role_${post.authorRole}`)} · {new Date(post.createdAt).toLocaleDateString()}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badge.bg} ${badge.text}`}>{badge.label}</span>
                              {post.pinned && <Pin size={12} className="text-yellow-400" />}
                            </div>
                          </div>
                          <h4 className="font-bold text-sm mb-1">{post.title}</h4>
                          {post.text && <p className="text-sm text-gray-300 leading-relaxed">{post.text}</p>}
                          {/* Event details */}
                          {post.badge === "event" && post.eventDate && (
                            <div className="mt-2 bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-4 text-sm">
                                <span className="flex items-center gap-1.5 text-purple-300"><Calendar size={14} /> {new Date(post.eventDate + "T00:00").toLocaleDateString()}{post.eventTime ? ` · ${post.eventTime}` : ""}</span>
                                {post.eventLocation && <span className="flex items-center gap-1.5 text-gray-400"><Home size={14} /> {post.eventLocation}</span>}
                              </div>
                              {/* RSVP */}
                              <div className="flex gap-2">
                                {(["yes", "no", "maybe"] as const).map(r => {
                                  const myRsvp = post.rsvp?.[identity?.aregoId ?? ""];
                                  const count = Object.values(post.rsvp ?? {}).filter(v => v === r).length;
                                  const isSelected = myRsvp === r;
                                  const colors = r === "yes" ? "bg-green-500/20 text-green-400 ring-green-500/50" : r === "no" ? "bg-red-500/20 text-red-400 ring-red-500/50" : "bg-yellow-500/20 text-yellow-400 ring-yellow-500/50";
                                  return (
                                    <button key={r} onClick={() => handleRsvp(post.id, r)}
                                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${isSelected ? `${colors} ring-1` : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}>
                                      {t(`spaces.rsvp_${r}`)} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="px-4 py-2 border-t border-gray-700/30 flex items-center gap-4">
                          <button onClick={() => handleUpvote(post.id)} className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${hasUpvoted ? "text-blue-400" : "text-gray-500 hover:text-gray-300"}`}>
                            <ThumbsUp size={14} /> {post.upvotes.length || ""}
                          </button>
                          <button onClick={() => setExpandedComments(prev => { const n = new Set(prev); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n; })}
                            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">
                            <MessageSquare size={14} /> {post.comments.length || ""}
                          </button>
                          {canManagePost && (
                            <>
                              <button onClick={() => handleTogglePin(post.id)} className={`text-xs ${post.pinned ? "text-yellow-400" : "text-gray-600 hover:text-gray-400"}`}><Pin size={14} /></button>
                              <button onClick={() => handleDeletePost(post.id)} className="text-xs text-gray-600 hover:text-red-400 ml-auto"><Trash2 size={14} /></button>
                            </>
                          )}
                        </div>
                        {/* Comments */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                              <div className="px-4 pb-3 space-y-2 border-t border-gray-700/30 pt-2">
                                {post.comments.map(c => (
                                  <div key={c.id} className="flex gap-2">
                                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0 mt-0.5">{(c.authorName[0] ?? "").toUpperCase()}</div>
                                    <div>
                                      <span className="text-xs font-medium text-gray-300">{c.authorName}</span>
                                      <p className="text-xs text-gray-400">{c.text}</p>
                                    </div>
                                  </div>
                                ))}
                                <div className="flex gap-2 mt-1">
                                  <input type="text" value={commentText[post.id] ?? ""} onChange={e => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                                    placeholder={t('spaces.commentPlaceholder')} onKeyDown={e => e.key === "Enter" && handleAddComment(post.id)}
                                    className="flex-1 bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all" />
                                  <button onClick={() => handleAddComment(post.id)} className="p-1.5 text-blue-400 hover:bg-blue-600/20 rounded-lg transition-colors"><Send size={14} /></button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </>
              );
            })()}

            {activeTab === "chats" && (
              <div className="text-center py-12 text-gray-600">
                <Hash size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('spaces.noChatsYet')}</p>
              </div>
            )}

            {activeTab === "members" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role;
              const canManage = myRole === "founder" || myRole === "admin";
              const grouped = ROLE_ORDER.map(role => ({
                role,
                members: selectedSpace.members.filter(m => m.role === role),
              })).filter(g => g.members.length > 0);

              return (
                <>
                  {/* Invite button */}
                  {canManage && (
                    <button
                      onClick={handleOpenInvite}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-600/20 to-transparent border border-blue-500/30 hover:bg-blue-600/30 transition-colors mb-2"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400">
                        <UserPlus size={20} />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold text-blue-400">{t('spaces.inviteMember')}</div>
                        <div className="text-xs text-gray-500">{t('spaces.inviteMemberDesc')}</div>
                      </div>
                    </button>
                  )}

                  {/* Members grouped by role */}
                  {grouped.map(({ role, members: roleMembers }) => (
                    <div key={role} className="space-y-2">
                      <div className="flex items-center gap-2 px-1 mt-3">
                        <span className={`text-xs font-bold uppercase tracking-wider ${ROLE_COLORS[role].text}`}>{t(`spaces.role_${role}`)}</span>
                        <span className="text-xs text-gray-600">{roleMembers.length}</span>
                      </div>
                      {roleMembers.map(member => (
                        <div key={member.aregoId} className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                          <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-sm font-bold text-white">
                                {(member.displayName[0] ?? "").toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{member.displayName}</div>
                                <div className="text-xs text-gray-500 font-mono">{member.aregoId}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${ROLE_COLORS[member.role].bg} ${ROLE_COLORS[member.role].text}`}>
                                {t(`spaces.role_${member.role}`)}
                              </span>
                              {canManage && member.role !== "founder" && (
                                <button
                                  onClick={() => setEditingMember(editingMember === member.aregoId ? null : member.aregoId)}
                                  className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Role edit panel */}
                          <AnimatePresence>
                            {editingMember === member.aregoId && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="px-3 pb-3 pt-1 border-t border-gray-700/50 space-y-2">
                                  <p className="text-xs text-gray-500 font-medium">{t('spaces.changeRole')}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {ROLE_ORDER.filter(r => r !== "founder").map(r => (
                                      <button
                                        key={r}
                                        onClick={() => handleChangeRole(member.aregoId, r)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                          member.role === r
                                            ? `${ROLE_COLORS[r].bg} ${ROLE_COLORS[r].text} ring-1 ring-current`
                                            : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                                        }`}
                                      >
                                        {t(`spaces.role_${r}`)}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => handleRemoveMember(member.aregoId)}
                                    className="w-full text-red-400 text-xs font-medium py-1.5 hover:bg-red-500/10 rounded-lg transition-colors"
                                  >
                                    {t('spaces.removeMember')}
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              );
            })()}

            {activeTab === "settings" && (
              <div className="space-y-2">
                <button
                  onClick={() => handleDeleteSpace(selectedSpace.id)}
                  className="w-full flex items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-red-900/30 hover:bg-red-500/10 transition-colors"
                >
                  <div className="flex items-center gap-3 text-red-400">
                    <Trash2 size={18} />
                    <span className="font-medium text-sm">{t('spaces.deleteSpace')}</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── INVITE VIEW ──
  if (view === "invite" && selectedSpace) {
    const tmpl = getTemplate(selectedSpace.template);
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader(t('spaces.inviteMember'), () => { setView("detail"); setActiveTab("members"); })}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">

            {/* Space info */}
            <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${selectedSpace.color} flex items-center justify-center`}>
                <tmpl.icon size={18} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-bold">{selectedSpace.name}</div>
                <div className="text-xs text-gray-500">{selectedSpace.members.length} {t('spaces.members')}</div>
              </div>
            </div>

            {/* Role selector — radio list */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 px-1">{t('spaces.inviteAs')}</label>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                {INVITABLE_ROLES.map(({ role, descKey }) => (
                  <button
                    key={role}
                    onClick={() => { setInviteRole(role); regenerateInvite(role); }}
                    className={`w-full flex items-center gap-3 p-4 transition-colors border-b border-gray-700/50 last:border-0 text-left ${
                      inviteRole === role ? "bg-blue-900/20" : "hover:bg-gray-800"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      inviteRole === role ? "border-blue-500 bg-blue-500" : "border-gray-600"
                    }`}>
                      {inviteRole === role && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${inviteRole === role ? "text-blue-400" : "text-white"}`}>{t(`spaces.role_${role}`)}</div>
                      <div className="text-xs text-gray-500">{t(`spaces.${descKey}`)}</div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${ROLE_COLORS[role].bg} ${ROLE_COLORS[role].text}`}>
                      {t(`spaces.role_${role}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* TTL selector — radio list */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 px-1">{t('spaces.inviteTtl')}</label>
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
                {INVITE_TTLS.map(ttl => {
                  const disabled = ttl.id === "unlimited" && isHighRole(inviteRole);
                  const isCustom = ttl.id === "custom";
                  return (
                    <div key={ttl.id} className={`border-b border-gray-700/50 last:border-0 ${disabled ? "opacity-40" : ""}`}>
                      <button
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          setInviteTtlId(ttl.id);
                          if (!isCustom) regenerateInvite(undefined, ttl.id);
                        }}
                        className={`w-full flex items-center gap-3 p-4 transition-colors text-left ${
                          inviteTtlId === ttl.id ? "bg-blue-900/20" : "hover:bg-gray-800"
                        } ${disabled ? "cursor-not-allowed" : ""}`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          inviteTtlId === ttl.id ? "border-blue-500 bg-blue-500" : "border-gray-600"
                        }`}>
                          {inviteTtlId === ttl.id && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1">
                          <span className={`text-sm ${inviteTtlId === ttl.id ? "text-blue-400 font-medium" : "text-white"}`}>
                            {t(`spaces.ttl_${ttl.id}`)}
                          </span>
                          {disabled && <span className="text-xs text-gray-600 ml-2">({t('spaces.ttlMaxForRole')})</span>}
                        </div>
                      </button>
                      {/* Custom input */}
                      {isCustom && inviteTtlId === "custom" && (
                        <div className="px-4 pb-3 flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={customTtlDays}
                            onChange={e => { setCustomTtlDays(e.target.value); }}
                            onBlur={() => regenerateInvite(undefined, "custom")}
                            className="w-20 bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-blue-500 transition-all"
                          />
                          <span className="text-sm text-gray-400">{t('spaces.ttlDays')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* QR Code */}
            {inviteEncoded && (
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-white p-5 rounded-2xl shadow-xl">
                  <QRCodeSvg value={inviteEncoded} size={220} bgColor="#fff" fgColor="#111827" />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock size={14} />
                  <span>{t('spaces.inviteValidFor', { time: getInviteTtlLabel() })}</span>
                </div>
              </div>
            )}

            {/* Beitritts-Hinweis Preview */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('spaces.joinPreview')}</p>
              <div className="text-sm text-gray-300 space-y-1">
                <p>• {t('spaces.joinAs', { role: t(`spaces.role_${inviteRole}`) })}</p>
                {selectedSpace.settings.idVerification && <p>• {t('spaces.joinIdRequired')}</p>}
                {selectedSpace.identityRule === "real_name" && <p>• {t('spaces.joinRealName')}</p>}
                {selectedSpace.identityRule === "nickname" && <p>• {t('spaces.joinNickname')}</p>}
              </div>
            </div>

            {/* Share button */}
            <button
              onClick={async () => {
                if (navigator.share) {
                  try {
                    await navigator.share({ title: selectedSpace.name, text: t('spaces.inviteShareText', { name: selectedSpace.name }), url: `https://aregoland.de/?invite=${encodeURIComponent(inviteEncoded)}` });
                  } catch { /* cancelled */ }
                } else {
                  await navigator.clipboard.writeText(inviteEncoded);
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Share2 size={20} />
              {t('common.share')}
            </button>

          </div>
        </div>
      </div>
    );
  }

  return null;
}
