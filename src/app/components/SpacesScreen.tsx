import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import {
  ArrowLeft, Users, LayoutGrid, Calendar, MessageCircle, Settings,
  Shield, QrCode, Plus, ChevronRight, Hash, User, Trash2, Edit2, Share2,
  School, Briefcase, Heart, Home, FolderOpen, Clock, Landmark, Globe, Wrench,
  Info, Check, X, GripVertical, UserPlus, Crown, Eye, ChevronDown,
  Pin, ThumbsUp, MessageSquare, Megaphone, Newspaper, Send, Lock, Layers,
  Paperclip, Mic, Play, Pause, Download, AtSign, Image as ImageIcon, FileText, Square,
  Search, Tag, CheckCircle2, Hammer, Sparkles, Map, ArrowUpDown, SortAsc, EyeOff
} from "lucide-react";
import { useTranslation } from 'react-i18next';
import { loadIdentity } from "@/app/auth/identity";
import QRCodeSvg from "react-qr-code";
import ProfileAvatar from "./ProfileAvatar";
import AppHeader from "./AppHeader";
import aregolandNews from "@/app/data/aregoland-news.json";

const AREGOLAND_OFFICIAL_ID = "__aregoland_official__";

// ── Types ──

type SpaceTemplate = "family" | "school" | "club" | "work" | "government" | "community" | "custom";
type SpaceRole = "founder" | "admin" | "moderator" | "member" | "guest";
type IdentityRule = "real_name" | "nickname" | "mixed" | "role_based";

interface SpaceMember {
  aregoId: string;
  displayName: string;
  role: SpaceRole;
  joinedAt?: string;
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

interface SpaceChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: string; // ISO string
  type?: "text" | "image" | "audio" | "file";
  fileData?: string;   // Base64
  fileName?: string;
  fileMime?: string;
  mentions?: string[]; // aregoIds
}

interface SpaceChannel {
  id: string;
  spaceId: string;
  name: string;
  isGlobal: boolean; // Globaler Chat — nur Admin/Moderator/Founder kann schreiben
  readRoles: (SpaceRole | string)[];  // Wer darf lesen (built-in + custom role names)
  writeRoles: (SpaceRole | string)[]; // Wer darf schreiben
  membersVisible: boolean; // Mitglieder sehen sich gegenseitig in diesem Chat
  createdAt: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

interface CustomRole {
  id: string;
  name: string;
  color: string;
  permissions: {
    readChats: boolean;
    writeChats: boolean;
    createEvents: boolean;
    postNews: boolean;
    inviteMembers: boolean;
    allowNetworkHelper: boolean;
  };
}

interface SpaceSubroom {
  id: string;
  spaceId: string;
  name: string;
  memberIds: string[]; // Teilmenge der Space-Mitglieder (aregoIds)
  channels: SpaceChannel[];
  createdAt: string;
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
  channels: SpaceChannel[];
  subrooms: SpaceSubroom[];
  customRoles: CustomRole[];
  tags?: string[];
  guestPermissions: { readChats: boolean; writeChats: boolean; createEvents: boolean; postNews: boolean; inviteMembers: boolean; allowNetworkHelper: boolean };
  createdAt: string;
  visibility: "public" | "private";
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
    // Migration: ensure posts, channels, subrooms arrays exist
    return raw.map(s => ({
      ...s,
      posts: s.posts ?? [],
      channels: s.channels ?? [],
      subrooms: s.subrooms ?? [],
      customRoles: s.customRoles ?? [],
      members: (s.members ?? []).map(m => ({ ...m, joinedAt: m.joinedAt ?? s.createdAt })),
      guestPermissions: s.guestPermissions ?? { readChats: true, writeChats: false, createEvents: false, postNews: false, inviteMembers: false, allowNetworkHelper: false },
    }));
  }
  catch { return []; }
}

// ── Official Aregoland Space (hardcoded, nicht löschbar) ──

const AREGOLAND_OFFICIAL_SPACE: Space = {
  id: AREGOLAND_OFFICIAL_ID,
  name: "Aregoland",
  description: "P2P Messenger & Social Media. Kindersicher ab FSK 6 — by Design.",
  template: "community",
  color: "from-blue-600 via-purple-600 to-indigo-700",
  identityRule: "nickname",
  founderId: "aregoland",
  members: [],
  posts: [],
  channels: [],
  subrooms: [],
  customRoles: [],
  guestPermissions: { readChats: false, writeChats: false, createEvents: false, postNews: false, inviteMembers: false, allowNetworkHelper: false },
  createdAt: "2026-04-02T00:00:00.000Z",
  visibility: "public",
  settings: { membersVisible: false, coHostingAllowed: false, publicJoin: false, idVerification: false },
};

// ── Space Chat Storage ──

const SPACE_CHATS_KEY = "aregoland_space_chats";

function loadSpaceChatMessages(channelId: string): SpaceChatMessage[] {
  try {
    const all: Record<string, SpaceChatMessage[]> = JSON.parse(localStorage.getItem(SPACE_CHATS_KEY) ?? "{}");
    return all[channelId] ?? [];
  } catch { return []; }
}

function saveSpaceChatMessage(channelId: string, msg: SpaceChatMessage) {
  try {
    const all: Record<string, SpaceChatMessage[]> = JSON.parse(localStorage.getItem(SPACE_CHATS_KEY) ?? "{}");
    const msgs = all[channelId] ?? [];
    msgs.push(msg);
    // Max 500 Nachrichten pro Channel
    all[channelId] = msgs.slice(-500);
    localStorage.setItem(SPACE_CHATS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

function createGlobalChannel(spaceId: string): SpaceChannel {
  return {
    id: `ch-global-${spaceId}`,
    spaceId,
    name: "Global",
    isGlobal: true,
    readRoles: ["founder", "admin", "moderator", "member", "guest"],
    writeRoles: ["founder", "admin", "moderator"],
    membersVisible: true,
    createdAt: new Date().toISOString(),
    unreadCount: 0,
  };
}

function saveSpaces(spaces: Space[]) {
  localStorage.setItem(SPACES_KEY, JSON.stringify(spaces.filter(s => s.id !== AREGOLAND_OFFICIAL_ID)));
}

const APPEARANCE_KEY = "aregoland_space_appearance";
type SpaceAppearance = { icon?: { type: "emoji" | "image"; value: string }; banner?: { type: "color" | "image"; value: string } };
function loadAppearance(spaceId: string): SpaceAppearance {
  try { const all = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}"); return all[spaceId] ?? {}; }
  catch { return {}; }
}
function saveAppearance(spaceId: string, app: SpaceAppearance) {
  try { const all = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}"); all[spaceId] = app; localStorage.setItem(APPEARANCE_KEY, JSON.stringify(all)); }
  catch { /* ignore */ }
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

const ROLE_ORDER: SpaceRole[] = ["founder", "admin", "moderator", "member", "guest"];
const ROLE_COLORS: Record<SpaceRole, { bg: string; text: string }> = {
  founder: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  admin: { bg: "bg-red-500/20", text: "text-red-400" },
  moderator: { bg: "bg-blue-500/20", text: "text-blue-400" },
  member: { bg: "bg-gray-700/50", text: "text-gray-400" },
  guest: { bg: "bg-gray-800", text: "text-gray-500" },
};

const BANNER_PRESETS = [
  "from-pink-600 to-rose-500", "from-blue-600 to-cyan-500", "from-orange-600 to-amber-500",
  "from-indigo-600 to-violet-500", "from-emerald-600 to-teal-500", "from-purple-600 to-fuchsia-500",
  "from-red-600 to-orange-500", "from-cyan-600 to-blue-500", "from-yellow-500 to-orange-400",
];

const EMOJI_QUICK = ["🏠", "🏫", "⚽", "💼", "🏛️", "🌍", "🎮", "🎵", "📚", "🎨", "🏋️", "🍕", "🚀", "💡", "❤️", "🌟"];

const SPACE_TAGS = [
  "Familie", "Schule", "Verein", "Handwerk", "Community",
  "Gemeinde", "Sport", "Musik", "Gaming", "Sonstiges",
] as const;

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
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
}

export default function SpacesScreen({ onBack, onOpenProfile, onOpenQRCode, onOpenSettings }: SpacesScreenProps) {
  const { t } = useTranslation();
  const identity = useMemo(() => loadIdentity(), []);
  const [spaces, setSpaces] = useState<Space[]>(() => {
    const userSpaces = loadSpaces().filter(s => s.id !== AREGOLAND_OFFICIAL_ID);
    const all = [AREGOLAND_OFFICIAL_SPACE, ...userSpaces];
    return applyOrder(all);
  });
  const [view, setView] = useState<"list" | "templates" | "create" | "detail" | "invite">("list");
  const [selectedTemplate, setSelectedTemplate] = useState<SpaceTemplate | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);

  // Search & filter & sort
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"activity" | "name" | "tags" | "joined">("activity");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const [toast, setToast] = useState(false);
  // Space appearance
  const [spaceIcon, setSpaceIcon] = useState<{ type: "emoji" | "image"; value: string } | null>(null);
  const [spaceBanner, setSpaceBanner] = useState<{ type: "color" | "image"; value: string } | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showBannerPicker, setShowBannerPicker] = useState(false);
  const iconFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  // Detail
  const [activeTab, setActiveTab] = useState<"overview" | "news" | "chats" | "members" | "profile" | "settings" | "world">("overview");

  // Settings tag picker
  const [showSettingsTagPicker, setShowSettingsTagPicker] = useState(false);
  const [settingsCustomTag, setSettingsCustomTag] = useState("");

  // Invite
  const [inviteRole, setInviteRole] = useState<SpaceRole>("member");
  const [inviteTtlId, setInviteTtlId] = useState("24h");
  const [customTtlValue, setCustomTtlValue] = useState("14");
  const [customTtlUnit, setCustomTtlUnit] = useState<"hours" | "days">("days");
  const [inviteEncoded, setInviteEncoded] = useState("");

  const getInviteTtlMs = () => {
    if (inviteTtlId === "custom") {
      const val = parseInt(customTtlValue || "1");
      return customTtlUnit === "hours" ? val * 60 * 60 * 1000 : val * 24 * 60 * 60 * 1000;
    }
    return INVITE_TTLS.find(t => t.id === inviteTtlId)?.ms ?? 24 * 60 * 60 * 1000;
  };

  const getInviteTtlLabel = () => {
    if (inviteTtlId === "custom") {
      const val = customTtlValue || "1";
      return `${val} ${customTtlUnit === "hours" ? t('spaces.ttlHours') : t('spaces.ttlDays')}`;
    }
    return t(`spaces.ttl_${inviteTtlId}`);
  };

  // Role editing
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberSort, setMemberSort] = useState<"role" | "name" | "date">("role");
  const [memberSortDateAsc, setMemberSortDateAsc] = useState(false);

  // Chats
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelWriteRoles, setChannelWriteRoles] = useState<Set<string>>(new Set(["moderator", "member"]));
  const [channelReadRoles, setChannelReadRoles] = useState<Set<string>>(new Set(["moderator", "member"]));
  const [channelMembersVisible, setChannelMembersVisible] = useState(true);
  const [openChannel, setOpenChannel] = useState<SpaceChannel | null>(null);
  const [chatMessages, setChatMessages] = useState<SpaceChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ msgId: string; percent: number; fileName: string } | null>(null);
  const [showLargeFileWarning, setShowLargeFileWarning] = useState<File | null>(null);

  // Subrooms
  const [showCreateSubroom, setShowCreateSubroom] = useState(false);
  const [subroomName, setSubroomName] = useState("");
  const [subroomMemberIds, setSubroomMemberIds] = useState<Set<string>>(new Set());
  const [openSubroom, setOpenSubroom] = useState<SpaceSubroom | null>(null);

  // Overview layout
  type WidgetId = "spaceInfo" | "pinned" | "announcements" | "events" | "activeChats" | "membersOnline";
  type LayoutItem = { id: WidgetId; visible: boolean };
  const DEFAULT_WIDGETS: LayoutItem[] = [
    { id: "spaceInfo", visible: true },
    { id: "pinned", visible: true },
    { id: "announcements", visible: true },
    { id: "events", visible: true },
    { id: "activeChats", visible: true },
    { id: "membersOnline", visible: true },
  ];
  const [editingLayout, setEditingLayout] = useState(false);
  const [layoutState, setLayoutState] = useState<LayoutItem[]>([]);
  const loadLayout = (spaceId: string): LayoutItem[] => {
    try {
      const raw: LayoutItem[] = JSON.parse(localStorage.getItem(`aregoland_space_layout_${spaceId}`) ?? "[]");
      if (!raw.length) return DEFAULT_WIDGETS;
      // Migrate: remove deprecated "stats" widget, add missing ids
      const filtered = raw.filter(w => w.id !== "stats");
      const ids = new Set(filtered.map(w => w.id));
      const migrated = [...filtered];
      for (const d of DEFAULT_WIDGETS) { if (!ids.has(d.id)) migrated.push(d); }
      return migrated;
    }
    catch { return DEFAULT_WIDGETS; }
  };
  const saveLayout = (spaceId: string, layout: LayoutItem[]) => {
    localStorage.setItem(`aregoland_space_layout_${spaceId}`, JSON.stringify(layout));
  };

  // Custom Roles
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#3b82f6");
  const [newRolePerms, setNewRolePerms] = useState({ readChats: true, writeChats: true, createEvents: false, postNews: false, inviteMembers: false, allowNetworkHelper: false });
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState(0); // 0=none, 1=confirm, 2=transfer, 3=final
  const [transferToMember, setTransferToMember] = useState<string | null>(null);

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

  // Roadmap collapsible state
  const [openRoadmap, setOpenRoadmap] = useState<Record<string, boolean>>({ done: false, wip: true, planned: false });
  const toggleRoadmap = (key: string) => setOpenRoadmap(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSelectTemplate = (templateId: SpaceTemplate) => {
    setSelectedTemplate(templateId);
    setName("");
    setDescription("");
    setView("create");
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  // Filtered spaces for list view
  const filteredSpaces = useMemo(() => {
    let result = [...spaces];

    // When searching, also include public spaces from localStorage (simulated discovery)
    if (searchQuery.trim()) {
      try {
        const allStored: Space[] = JSON.parse(localStorage.getItem(SPACES_KEY) ?? "[]");
        const myIds = new Set(spaces.map(s => s.id));
        const publicExtras = allStored.filter(s => !myIds.has(s.id) && (s.visibility ?? "private") === "public");
        result = [...result, ...publicExtras];
      } catch { /* ignore */ }
    }

    if (filterTag) {
      result = result.filter(s => s.id === AREGOLAND_OFFICIAL_ID || (s.tags ?? []).includes(filterTag));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      );
    }

    // Sort
    const official = result.filter(s => s.id === AREGOLAND_OFFICIAL_ID);
    const rest = result.filter(s => s.id !== AREGOLAND_OFFICIAL_ID);
    switch (sortMode) {
      case "name":
        rest.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "tags":
        rest.sort((a, b) => ((a.tags ?? [])[0] ?? "zzz").localeCompare((b.tags ?? [])[0] ?? "zzz"));
        break;
      case "joined":
        rest.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "activity":
      default:
        // Keep current order (most recently active first = default localStorage order)
        break;
    }
    return [...official, ...rest];
  }, [spaces, searchQuery, filterTag, sortMode]);

  const handleCreateSpace = () => {
    if (!name.trim() || !selectedTemplate || !identity) return;
    const tmpl = getTemplate(selectedTemplate);
    const spaceId = `space-${Date.now().toString(36)}`;
    const globalChannel = createGlobalChannel(spaceId);
    const space: Space = {
      id: spaceId,
      name: name.trim(),
      description: description.trim(),
      template: selectedTemplate,
      color: spaceBanner?.type === "color" ? spaceBanner.value : tmpl.gradient,
      identityRule: tmpl.defaultIdentityRule,
      founderId: identity.aregoId,
      members: [{
        aregoId: identity.aregoId,
        displayName: identity.displayName,
        role: "founder",
        joinedAt: new Date().toISOString(),
      }],
      posts: [],
      channels: [globalChannel],
      subrooms: [],
      customRoles: [],
      tags: Array.from(selectedTags),
      guestPermissions: { readChats: true, writeChats: false, createEvents: false, postNews: false, inviteMembers: false, allowNetworkHelper: false },
      createdAt: new Date().toISOString(),
      visibility: "private",
      settings: { ...tmpl.defaultSettings },
    };
    const updated = [...spaces, space];
    setSpaces(updated);
    saveSpaces(updated);
    // Save appearance
    const app: SpaceAppearance = {};
    if (spaceIcon) app.icon = spaceIcon;
    if (spaceBanner) app.banner = spaceBanner;
    if (app.icon || app.banner) saveAppearance(spaceId, app);
    setSelectedSpace(space);
    setView("detail");
    setActiveTab("overview");
    setSpaceIcon(null); setSpaceBanner(null); setSelectedTags(new Set());
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
      ? (customTtlUnit === "hours"
          ? parseInt(customTtlValue || "1") * 60 * 60 * 1000
          : parseInt(customTtlValue || "1") * 24 * 60 * 60 * 1000)
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
    if (id === AREGOLAND_OFFICIAL_ID) return; // Official Space nicht löschbar
    const updated = spaces.filter(s => s.id !== id);
    setSpaces(updated);
    saveSpaces(updated);
    setView("list");
    setSelectedSpace(null);
  };

  // ── WebSocket für Space-Chat ──

  const connectToChannel = useCallback((channel: SpaceChannel) => {
    // Alte Verbindung schließen
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    const roomId = `space-chat:${channel.spaceId}:${channel.id}`;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws-signal`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", roomId }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "joined" || data.type === "peer_joined" || data.type === "peer_left") return;
        // Space-Chat-Nachricht empfangen
        if (data.type === "space-chat-msg" && data.msg) {
          const msg = data.msg as SpaceChatMessage;
          saveSpaceChatMessage(channel.id, msg);
          setChatMessages(prev => [...prev, msg]);
          // lastMessage updaten
          if (selectedSpace) {
            const updated = {
              ...selectedSpace,
              channels: selectedSpace.channels.map(ch =>
                ch.id === channel.id
                  ? { ...ch, lastMessage: msg.text, lastMessageTime: msg.timestamp }
                  : ch
              ),
            };
            updateSpace(updated);
          }
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [selectedSpace]);

  // Cleanup WebSocket on unmount or channel change
  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, []);

  // Auto-scroll to bottom when new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleOpenChannel = (channel: SpaceChannel) => {
    setOpenChannel(channel);
    setChatMessages(loadSpaceChatMessages(channel.id));
    setChatInput("");
    connectToChannel(channel);
    // Reset unread
    if (selectedSpace) {
      const updated = {
        ...selectedSpace,
        channels: selectedSpace.channels.map(ch =>
          ch.id === channel.id ? { ...ch, unreadCount: 0 } : ch
        ),
      };
      updateSpace(updated);
    }
  };

  const handleCloseChannel = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setOpenChannel(null);
    setChatMessages([]);
    setChatInput("");
  };

  const handleSendMessage = () => {
    if (!chatInput.trim() || !openChannel || !identity || !wsRef.current) return;
    const mentions = selectedSpace ? extractMentions(chatInput, selectedSpace.members) : [];
    const msg: SpaceChatMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      channelId: openChannel.id,
      authorId: identity.aregoId,
      authorName: identity.displayName,
      text: chatInput.trim(),
      timestamp: new Date().toISOString(),
      type: "text",
      ...(mentions.length > 0 ? { mentions } : {}),
    };
    sendSpaceChatMsg(msg);
    setChatInput("");
    setShowMentions(false);
  };

  const sendSpaceChatMsg = (msg: SpaceChatMessage) => {
    saveSpaceChatMessage(msg.channelId, msg);
    setChatMessages(prev => [...prev, msg]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "space-chat-msg", msg }));
    }
    if (selectedSpace && openChannel) {
      const preview = msg.type === "image" ? "[Bild]" : msg.type === "audio" ? "[Sprachnachricht]" : msg.type === "file" ? `[${msg.fileName}]` : msg.text;
      updateSpace({
        ...selectedSpace,
        channels: selectedSpace.channels.map(ch =>
          ch.id === openChannel.id ? { ...ch, lastMessage: preview, lastMessageTime: msg.timestamp } : ch
        ),
      });
    }
  };

  const CHUNK_SIZE = 64 * 1024; // 64KB per chunk

  const handleSendFile = async (file: File, type: "image" | "file") => {
    if (!openChannel || !identity || !wsRef.current) return;
    const msgId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    setUploadProgress({ msgId, percent: 0, fileName: file.name });

    // Read file as ArrayBuffer
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Send chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const chunk = bytes.slice(start, start + CHUNK_SIZE);
      // Convert chunk to base64
      const b64 = btoa(Array.from(chunk, b => String.fromCharCode(b)).join(""));

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "space-chat-chunk",
          msgId,
          channelId: openChannel.id,
          chunkIndex: i,
          totalChunks,
          data: b64,
          // Metadata only on first chunk
          ...(i === 0 ? { fileName: file.name, fileMime: file.type, msgType: type, authorId: identity.aregoId, authorName: identity.displayName } : {}),
        }));
      }

      setUploadProgress({ msgId, percent: Math.round(((i + 1) / totalChunks) * 100), fileName: file.name });
      // Small delay to avoid flooding WebSocket
      if (totalChunks > 10 && i < totalChunks - 1) {
        await new Promise(r => setTimeout(r, 5));
      }
    }

    // Also read as dataURL for local display + storage
    const reader = new FileReader();
    reader.onload = () => {
      const msg: SpaceChatMessage = {
        id: msgId,
        channelId: openChannel.id,
        authorId: identity.aregoId,
        authorName: identity.displayName,
        text: "",
        timestamp: new Date().toISOString(),
        type,
        fileData: reader.result as string,
        fileName: file.name,
        fileMime: file.type,
      };
      saveSpaceChatMessage(openChannel.id, msg);
      setChatMessages(prev => [...prev, msg]);
      const preview = type === "image" ? "[Bild]" : `[${file.name}]`;
      if (selectedSpace) {
        updateSpace({
          ...selectedSpace,
          channels: selectedSpace.channels.map(ch =>
            ch.id === openChannel.id ? { ...ch, lastMessage: preview, lastMessageTime: msg.timestamp } : ch
          ),
        });
      }
      setUploadProgress(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // Warn for files >50MB
    if (file.size > 50 * 1024 * 1024) {
      setShowLargeFileWarning(file);
      return;
    }
    const isImage = file.type.startsWith("image/");
    handleSendFile(file, isImage ? "image" : "file");
  };

  const confirmLargeFile = () => {
    if (!showLargeFileWarning) return;
    const file = showLargeFileWarning;
    setShowLargeFileWarning(null);
    const isImage = file.type.startsWith("image/");
    handleSendFile(file, isImage ? "image" : "file");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          if (!openChannel || !identity) return;
          const msg: SpaceChatMessage = {
            id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            channelId: openChannel.id,
            authorId: identity.aregoId,
            authorName: identity.displayName,
            text: "",
            timestamp: new Date().toISOString(),
            type: "audio",
            fileData: reader.result as string,
            fileMime: "audio/webm",
          };
          sendSpaceChatMsg(msg);
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch { /* mic not available */ }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const toggleAudioPlayback = (msgId: string, dataUrl: string) => {
    if (playingAudio === msgId) {
      audioRefs.current[msgId]?.pause();
      setPlayingAudio(null);
      return;
    }
    if (playingAudio && audioRefs.current[playingAudio]) {
      audioRefs.current[playingAudio].pause();
    }
    if (!audioRefs.current[msgId]) {
      const audio = new Audio(dataUrl);
      audio.onended = () => setPlayingAudio(null);
      audioRefs.current[msgId] = audio;
    }
    audioRefs.current[msgId].play();
    setPlayingAudio(msgId);
  };

  const handleChatInputChange = (value: string) => {
    setChatInput(value);
    // Detect @mention trigger
    const lastAt = value.lastIndexOf("@");
    if (lastAt >= 0 && (lastAt === 0 || value[lastAt - 1] === " ")) {
      const after = value.slice(lastAt + 1);
      if (!after.includes(" ")) {
        setShowMentions(true);
        setMentionFilter(after.toLowerCase());
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (member: { aregoId: string; displayName: string }) => {
    const lastAt = chatInput.lastIndexOf("@");
    const before = chatInput.slice(0, lastAt);
    setChatInput(`${before}@${member.displayName} `);
    setShowMentions(false);
  };

  // Extract mentions from text
  const extractMentions = (text: string, members: { aregoId: string; displayName: string }[]): string[] => {
    return members.filter(m => text.includes(`@${m.displayName}`)).map(m => m.aregoId);
  };

  const handleCreateChannel = () => {
    if (!channelName.trim() || !selectedSpace) return;
    if (editingChannelId) {
      // Update existing channel
      const updated = {
        ...selectedSpace,
        channels: selectedSpace.channels.map(ch =>
          ch.id === editingChannelId ? {
            ...ch,
            name: channelName.trim(),
            readRoles: ["founder", "admin", ...Array.from(channelReadRoles)],
            writeRoles: ["founder", "admin", ...Array.from(channelWriteRoles)],
            membersVisible: channelMembersVisible,
          } : ch
        ),
      };
      updateSpace(updated);
    } else {
      // Create new channel
      const channel: SpaceChannel = {
        id: `ch-${Date.now().toString(36)}`,
        spaceId: selectedSpace.id,
        name: channelName.trim(),
        isGlobal: false,
        readRoles: ["founder", "admin", ...Array.from(channelReadRoles)],
        writeRoles: ["founder", "admin", ...Array.from(channelWriteRoles)],
        membersVisible: channelMembersVisible,
        createdAt: new Date().toISOString(),
        unreadCount: 0,
      };
      updateSpace({ ...selectedSpace, channels: [...(selectedSpace.channels ?? []), channel] });
    }
    setChannelName("");
    setChannelWriteRoles(new Set(["moderator", "member"]));
    setChannelReadRoles(new Set(["moderator", "member"]));
    setChannelMembersVisible(true);
    setShowCreateChannel(false);
    setEditingChannelId(null);
  };

  const startEditChannel = (ch: SpaceChannel) => {
    setChannelName(ch.name);
    setChannelReadRoles(new Set(ch.readRoles.filter(r => r !== "founder" && r !== "admin")));
    setChannelWriteRoles(new Set(ch.writeRoles.filter(r => r !== "founder" && r !== "admin")));
    setChannelMembersVisible(ch.membersVisible ?? true);
    setEditingChannelId(ch.id);
    setShowCreateChannel(true);
  };

  const startEditRole = (cr: CustomRole) => {
    setNewRoleName(cr.name);
    setNewRoleColor(cr.color);
    setNewRolePerms({ ...cr.permissions });
    setEditingRoleId(cr.id);
    setShowCreateRole(true);
  };

  const handleTransferFounder = (toAregoId: string) => {
    if (!selectedSpace || !identity) return;
    const updated = {
      ...selectedSpace,
      founderId: toAregoId,
      members: selectedSpace.members.map(m => {
        if (m.aregoId === toAregoId) return { ...m, role: "founder" as SpaceRole };
        if (m.aregoId === identity.aregoId && m.role === "founder") return { ...m, role: "admin" as SpaceRole };
        return m;
      }),
    };
    updateSpace(updated);
    setTransferToMember(null);
  };

  const handleDeleteChannel = (channelId: string) => {
    if (!selectedSpace) return;
    const updated = {
      ...selectedSpace,
      channels: selectedSpace.channels.filter(ch => ch.id !== channelId),
    };
    updateSpace(updated);
    if (openChannel?.id === channelId) handleCloseChannel();
  };

  // ── Unterräume ──

  const handleCreateSubroom = () => {
    if (!subroomName.trim() || !selectedSpace) return;
    const subroomId = `sub-${Date.now().toString(36)}`;
    const generalChannel: SpaceChannel = {
      id: `ch-sub-${subroomId}`,
      spaceId: selectedSpace.id,
      name: "Allgemein",
      isGlobal: false,
      readRoles: ["founder", "admin", "moderator", "member", "guest"],
      writeRoles: ["founder", "admin", "moderator", "member"],
      createdAt: new Date().toISOString(),
      unreadCount: 0,
    };
    const subroom: SpaceSubroom = {
      id: subroomId,
      spaceId: selectedSpace.id,
      name: subroomName.trim(),
      memberIds: Array.from(subroomMemberIds),
      channels: [generalChannel],
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...selectedSpace,
      subrooms: [...(selectedSpace.subrooms ?? []), subroom],
    };
    updateSpace(updated);
    setSubroomName("");
    setSubroomMemberIds(new Set());
    setShowCreateSubroom(false);
  };

  const handleDeleteSubroom = (subroomId: string) => {
    if (!selectedSpace) return;
    const updated = {
      ...selectedSpace,
      subrooms: (selectedSpace.subrooms ?? []).filter(sr => sr.id !== subroomId),
    };
    updateSpace(updated);
    if (openSubroom?.id === subroomId) setOpenSubroom(null);
  };

  const renderHeader = (title: string, backAction: () => void, action?: { icon: typeof Plus; label: string; onClick: () => void }) => (
    <AppHeader
      title={title}
      onBack={backAction}
      onOpenProfile={onOpenProfile}
      onOpenQRCode={onOpenQRCode}
      onOpenSettings={onOpenSettings}
      action={action}
    />
  );

  const handleReorder = (newOrder: Space[]) => {
    isDragging.current = true;
    setSpaces(newOrder);
    saveOrder(newOrder);
    setTimeout(() => { isDragging.current = false; }, 200);
  };

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        <AppHeader
          title={t('spaces.title')}
          onBack={onBack}
          onOpenProfile={onOpenProfile}
          onOpenQRCode={onOpenQRCode}
          onOpenSettings={onOpenSettings}
          action={{ icon: Plus, label: t('spaces.newSpace'), onClick: () => setView("templates") }}
          rightExtra={spaces.length > 0 ? (
            <div className="flex items-center gap-1">
              <div className="relative">
                <button onClick={() => setShowSortMenu(!showSortMenu)}
                  className={`p-2 rounded-full transition-all ${showSortMenu ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-white/10"}`}>
                  <ArrowUpDown size={20} />
                </button>
                <AnimatePresence>
                  {showSortMenu && (
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                      {([
                        { id: "activity" as const, label: "Aktivität" },
                        { id: "name" as const, label: "Name A–Z" },
                        { id: "tags" as const, label: "Tags" },
                        { id: "joined" as const, label: "Zuletzt beigetreten" },
                      ]).map(opt => (
                        <button key={opt.id} onClick={() => { setSortMode(opt.id); setShowSortMenu(false); }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center justify-between ${
                            sortMode === opt.id ? "text-blue-400 bg-blue-500/10" : "text-gray-300 hover:bg-gray-700/50"
                          }`}>
                          {opt.label}
                          {sortMode === opt.id && <Check size={14} />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button onClick={() => { setSearchOpen(!searchOpen); if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100); }}
                className={`p-2 rounded-full transition-all ${searchOpen ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-white/10"}`}>
                <Search size={20} />
              </button>
            </div>
          ) : undefined}
        />

        {/* Expandable search bar */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-gray-800">
              <div className="px-4 py-2.5 relative">
                <Search size={16} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('spaces.searchPlaceholder')}
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                />
                {searchQuery ? (
                  <button onClick={() => setSearchQuery("")} className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                ) : (
                  <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

          {/* Tag-Filter Chips — nur bei offener Suche */}
          {searchOpen && spaces.length > 0 && (() => {
            const allTags = Array.from(new Set(spaces.flatMap(s => s.tags ?? [])));
            if (allTags.length === 0) return null;
            return (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {filterTag && (
                  <button onClick={() => setFilterTag(null)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors">
                    {t('spaces.filterAll')}
                  </button>
                )}
                {allTags.map(tag => (
                  <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                      filterTag === tag ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-800/50 text-gray-500 hover:bg-gray-700/50"
                    }`}>
                    {tag}
                  </button>
                ))}
              </div>
            );
          })()}

          {filteredSpaces.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Search size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">{t('spaces.noSearchResults')}</p>
            </div>
          )}

          {filteredSpaces.length > 0 && (
            <Reorder.Group axis="y" values={spaces} onReorder={handleReorder} className="space-y-3">
              {filteredSpaces.map((space) => {
                const isOfficial = space.id === AREGOLAND_OFFICIAL_ID;
                return (
                  <Reorder.Item key={space.id} value={space} className="list-none">
                    <div
                      className={`group relative overflow-hidden rounded-2xl border border-gray-700/50 text-left bg-gradient-to-br ${space.color}`}
                    >
                      {/* Card content — clickable, horizontal layout */}
                      <button
                        onClick={() => { if (isDragging.current) return; setSelectedSpace(space); setActiveTab("overview"); setView("detail"); }}
                        className="w-full text-left min-w-0 flex items-center gap-3 p-3"
                      >
                        {/* Icon */}
                        {(() => {
                          const app = isOfficial ? null : loadAppearance(space.id);
                          if (isOfficial) return <img src="/aregoland_space_icon_notxt.svg" alt="Aregoland" className="shrink-0 w-14 h-14 rounded-xl object-cover" />;
                          if (app?.icon?.type === "image") return <img src={app.icon.value} className="shrink-0 w-14 h-14 rounded-xl object-cover" />;
                          if (app?.icon?.type === "emoji") return <div className="shrink-0 w-14 h-14 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-2xl">{app.icon.value}</div>;
                          return <div className="shrink-0 w-14 h-14 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-xl font-bold text-white">{(space.name[0] ?? "").toUpperCase()}</div>;
                        })()}
                        {/* Text-Block */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <h3 className="text-base font-bold truncate">{space.name}</h3>
                          {space.description && <p className="text-xs text-gray-300/80 mt-0.5 line-clamp-1">{space.description}</p>}
                          {!isOfficial && (() => {
                            const unread = (space.channels ?? []).reduce((s, ch) => s + (ch.unreadCount ?? 0), 0);
                            return unread > 0 ? (
                              <div className="flex items-center mt-1">
                                <span className="ml-auto w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                                  {unread > 9 ? "9+" : unread}
                                </span>
                              </div>
                            ) : null;
                          })()}
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
              return (
                <button
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl.id)}
                  className="w-full flex items-center gap-4 p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-2xl transition-all text-left"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tmpl.gradient} shrink-0`} />
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
    const bannerClass = spaceBanner?.type === "color" ? `bg-gradient-to-br ${spaceBanner.value}` : `bg-gradient-to-br ${tmpl.gradient}`;
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader(t('spaces.createSpace'), () => setView("templates"))}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-5">

            {/* Banner Farbe + Icon */}
            <div>
              <label className="text-xs font-medium text-gray-400 px-1 mb-1.5 block">{t('spaces.banner')}</label>
              <div className={`relative w-full h-24 rounded-2xl overflow-hidden border border-gray-700/50 ${bannerClass}`}>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/60" />
                {/* Centered Icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <button onClick={() => setShowIconPicker(!showIconPicker)}
                    className="w-16 h-16 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/25 transition-all overflow-hidden">
                    {spaceIcon?.type === "image" ? <img src={spaceIcon.value} className="w-full h-full object-cover" /> :
                     spaceIcon?.type === "emoji" ? <span className="text-2xl">{spaceIcon.value}</span> :
                     name.trim() ? <span className="text-xl font-bold text-white">{name.trim()[0].toUpperCase()}</span> :
                     <Edit2 size={18} className="text-white/50" />}
                  </button>
                </div>
                {/* Banner color picker toggle */}
                <button onClick={() => setShowBannerPicker(!showBannerPicker)}
                  className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-sm rounded-lg text-white/50 hover:text-white transition-colors z-10">
                  <Edit2 size={14} />
                </button>
              </div>
              <input type="file" ref={iconFileRef} className="hidden" accept="image/*" onChange={e => {
                const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
                const reader = new FileReader(); reader.onload = () => { setSpaceIcon({ type: "image", value: reader.result as string }); setShowIconPicker(false); }; reader.readAsDataURL(file);
              }} />
              {/* Icon Picker */}
              <AnimatePresence>
                {showIconPicker && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-2 bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {EMOJI_QUICK.map(em => (
                          <button key={em} onClick={() => { setSpaceIcon({ type: "emoji", value: em }); setShowIconPicker(false); }}
                            className="w-10 h-10 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-xl transition-colors">{em}</button>
                        ))}
                      </div>
                      <button onClick={() => iconFileRef.current?.click()} className="w-full py-2 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-lg transition-colors">
                        {t('spaces.uploadIcon')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Banner Color Picker */}
              <AnimatePresence>
                {showBannerPicker && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-2 bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                      <div className="flex flex-wrap gap-2">
                        {BANNER_PRESETS.map(g => (
                          <button key={g} onClick={() => { setSpaceBanner({ type: "color", value: g }); setShowBannerPicker(false); }}
                            className={`w-10 h-10 rounded-lg bg-gradient-to-br ${g} border-2 ${spaceBanner?.value === g ? "border-white" : "border-transparent"} hover:border-gray-400 transition-all`} />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Name + Description */}
            <div className="space-y-3">
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('spaces.spaceNamePlaceholder')} autoFocus
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all" />
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('spaces.descPlaceholder')} rows={2}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all resize-none" />
            </div>

            {/* Template info */}
            <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
              <span>{t(`spaces.tmpl_${selectedTemplate}`)}</span>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 px-1 flex items-center gap-1.5">
                <Tag size={12} /> {t('spaces.tags')}
              </label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {Array.from(selectedTags).map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50">
                    {tag}
                    <button onClick={() => toggleTag(tag)} className="hover:text-white transition-colors"><X size={12} /></button>
                  </span>
                ))}
                <button onClick={() => setShowTagPicker(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-all flex items-center gap-1">
                  <Plus size={12} /> Tag
                </button>
              </div>
              <AnimatePresence>
                {showTagPicker && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {SPACE_TAGS.map(tag => (
                          <button key={tag} onClick={() => toggleTag(tag)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                              selectedTags.has(tag) ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                            }`}>
                            {tag}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="text" value={customTagInput} onChange={e => setCustomTagInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && customTagInput.trim()) {
                              toggleTag(customTagInput.trim());
                              setCustomTagInput("");
                            }
                          }}
                          placeholder={t('spaces.customTag') || "Eigenen Tag erstellen"}
                          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500" />
                        <button onClick={() => { if (customTagInput.trim()) { toggleTag(customTagInput.trim()); setCustomTagInput(""); } }}
                          disabled={!customTagInput.trim()}
                          className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-30">
                          <Plus size={14} />
                        </button>
                      </div>
                      <button onClick={() => setShowTagPicker(false)} className="w-full text-center text-xs text-gray-500 hover:text-gray-300 pt-1">
                        {t('common.close') || "Schließen"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Privacy Info */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
              <Info size={20} className="text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200/80 leading-relaxed">{t('spaces.createSpaceInfo')}</div>
            </div>

            {/* Create Button */}
            <button onClick={handleCreateSpace} disabled={!name.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
              <Plus size={20} /> {t('spaces.createSpace')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── OFFICIAL AREGOLAND SPACE DETAIL ──
  if (view === "detail" && selectedSpace?.id === AREGOLAND_OFFICIAL_ID) {
    const officialTabs = ["news", "about", "support", "world"] as const;
    type OfficialTab = typeof officialTabs[number];
    const officialTabLabel: Record<OfficialTab, string> = { news: "Neuigkeiten", about: "Über", support: "Support", world: "World" };
    const currentOfficialTab = (["news", "about", "support", "world"].includes(activeTab as string) ? activeTab : "news") as OfficialTab;

    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {/* Header */}
        <div className="relative h-36 shrink-0 overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700">
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 to-gray-900 pointer-events-none" />
          <button onClick={() => setView("list")} className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white z-20">
            <ArrowLeft size={20} />
          </button>
          <div className="absolute inset-0 flex items-center justify-center z-0 -mt-4">
            <img src="/aregoland_space_icon_notxt.svg" alt="Aregoland" className="w-20 h-20 rounded-xl object-cover" />
          </div>
          <div className="absolute bottom-0 left-0 p-4 w-full z-10">
            <h1 className="text-2xl font-bold">Aregoland</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1">
            {officialTabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as typeof activeTab)}
                className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  currentOfficialTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}>
                {officialTabLabel[tab]}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {currentOfficialTab === "news" && (
            <div className="space-y-3">
              {(aregolandNews as { id: string; date: string; title: string; text: string }[]).slice().reverse().map(entry => (
                <div key={entry.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Newspaper size={14} className="text-blue-400" />
                    <span className="text-xs text-gray-500">{entry.date}</span>
                  </div>
                  <h3 className="text-sm font-bold mb-1">{entry.title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{entry.text}</p>
                </div>
              ))}
            </div>
          )}

          {currentOfficialTab === "about" && (
            <div className="space-y-4">
              {/* Hintergrund */}
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Heart size={14} className="text-pink-400" /> Hintergrund</h3>
                <p className="text-sm text-gray-300 leading-relaxed mb-3">
                  Aregoland entstand aus einer einfachen Frage: Warum gibt es keine App, der man wirklich vertrauen kann?
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Als alleinerziehender Vater von zwei Töchtern im Grundschulalter wollte ich einen Ort schaffen, an dem Familien sicher miteinander kommunizieren können — ohne Datenhunger, ohne Algorithmen die süchtig machen, ohne Kompromisse beim Datenschutz. Aregoland ist kein Startup. Es ist ein Projekt aus Überzeugung, gebaut in den Abendstunden neben einem Vollzeitjob.
                </p>
              </div>

              {/* Roadmap */}
              <p className="text-xs text-gray-500 italic leading-relaxed mb-2">
                Die Roadmap zeigt wohin die Reise geht — nicht in welcher Reihenfolge. Features entstehen wenn die Zeit reif ist, die Idee zuendet oder einfach Lust da ist. So wird gute Software gebaut.
              </p>
              {(() => {
                const roadmapSections = [
                  {
                    key: "done",
                    label: "Bereits fertig",
                    icon: <CheckCircle2 size={10} className="text-white" />,
                    chevronColor: "text-emerald-400",
                    dotClass: "bg-emerald-500",
                    labelColor: "text-emerald-400",
                    cardBg: "bg-emerald-500/10 border-emerald-500/20",
                    cardIcon: <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />,
                    items: [
                      { title: "Passwordlose Registrierung & Login", desc: "Kein Passwort, kein Datenleck — dein Geraet ist dein Schluessel." },
                      { title: "E2E verschluesselter P2P Chat", desc: "Nachrichten gehen direkt von Geraet zu Geraet, kein Server speichert sie." },
                      { title: "WebRTC Audio/Video Calls", desc: "Audio & Video direkt P2P, ohne Umweg ueber unsere Server." },
                      { title: "Sprachnachrichten, Datei & Bildversand", desc: "Alles verschluesselt, alles direkt." },
                      { title: "Kontakte per QR-Code & Kurzcode", desc: "Einfach scannen oder Code eingeben, fertig." },
                      { title: "Online/Offline Status", desc: "Sieh wer gerade da ist — in Echtzeit." },
                      { title: "Browser-Benachrichtigungen", desc: "Verpasse keine Nachricht, auch wenn die App im Hintergrund laeuft." },
                      { title: "Spaces — Raeume & Organisationen", desc: "Raeume fuer Familie, Vereine, Firmen — mit Rollen, Rechten, Tags & Suche." },
                      { title: "Kalender (Monats-, Wochen-, Tagesansicht)", desc: "Termine & Events mit Erinnerungen und Suche." },
                      { title: "Profil & Einstellungen", desc: "Avatar, Social Media, Adressen, Benachrichtigungen, Datenschutz." },
                      { title: "Kind-Konten + FSK-Grundlage", desc: "Kinder-Features in Einstellungen, altersgerechter Schutz." },
                      { title: "Recovery per QR + Textschluessel", desc: "Konto wiederherstellen durch Scannen oder Schluessel eingeben." },
                      { title: "Aregoland Official Space", desc: "Der zentrale Ort fuer Neuigkeiten, Roadmap und Support." },
                      { title: "i18n: Deutsch, Englisch, Litauisch", desc: "Dreisprachig von Anfang an." },
                      { title: "PWA — installierbar & offline-faehig", desc: "Funktioniert wie eine native App, direkt aus dem Browser." },
                      { title: "Beta-Banner + Willkommens-Toast", desc: "Footer zeigt Arego Beta auf allen Screens, einmaliger Willkommens-Toast nach Login." },
                      { title: "E-Mail Weiterleitungen", desc: "hallo@, support@, paypal@, feedback@, noreply@aregoland.de eingerichtet." },
                      { title: "Spenden-Button (PayPal)", desc: "paypal.me/aregoland — direkt aus der App heraus spenden." },
                      { title: "PayPal Konto", desc: "paypal@aregoland.de live und mit App verknuepft." },
                      { title: "GitHub public + README", desc: "Repository oeffentlich, Dokumentation fuer Mitwirkende." },
                      { title: "Prod-Build + Nginx statisch", desc: "App wird als statische Dateien ausgeliefert, kein Dev-Server mehr." },
                    ],
                  },
                  {
                    key: "wip",
                    label: "In Arbeit",
                    icon: <Hammer size={10} className="text-white" />,
                    chevronColor: "text-amber-400",
                    dotClass: "bg-amber-500 animate-pulse",
                    labelColor: "text-amber-400",
                    cardBg: "bg-amber-500/10 border-amber-500/20",
                    cardIcon: <Hammer size={12} className="text-amber-400 mt-0.5 shrink-0" />,
                    items: [
                      { title: "Kaffeepause", desc: "Ohne Kaffee kein Code. Aktuell Tasse 3." },
                      { title: "Kinder ins Bett bringen", desc: "Noch eine Geschichte! Nur noch eine! Na gut, zwei." },
                      { title: "Unter der Dusche nachdenken", desc: "Die besten Features entstehen zwischen Shampoo und Handtuch." },
                    ],
                  },
                  {
                    key: "planned",
                    label: "Geplant",
                    icon: <Sparkles size={10} className="text-white" />,
                    chevronColor: "text-purple-400",
                    dotClass: "bg-purple-500",
                    labelColor: "text-purple-400",
                    cardBg: "bg-purple-500/10 border-purple-500/20",
                    cardIcon: <Sparkles size={12} className="text-purple-400 mt-0.5 shrink-0" />,
                    items: [
                      { title: "Spaces Melde-System + Mitglieder-Kontrolle", desc: "Mehr Sicherheit und Kontrolle fuer Space-Admins." },
                      { title: "Recovery: Datei-Upload + End-to-End Test", desc: "Wiederherstellung per Datei (aregoland-recovery-*.txt) und vollstaendiger Test." },
                      { title: "GitHub Sponsors", desc: "Antrag gestellt, wartet auf Approval." },
                      { title: "World — oeffentlicher Feed", desc: "Oeffentlicher Feed — nur verifizierte Nutzer posten, FSK-System schuetzt Kinder." },
                      { title: "Spaces Pay: EPC QR Rechnungen", desc: "Gebuehrenfreie SEPA-Rechnungen per QR-Code direkt im Space." },
                      { title: "Kalender Stufe 2-4", desc: "Kinder-Integration, Termine P2P teilen, Spaces-Kalender, iCal Import/Export." },
                      { title: "Kinderschutz FSK vollstaendig", desc: "Serverseitige Alterspruefung, unsichtbar unter 16 — mit EUDI Wallet." },
                      { title: "EUDI Wallet Integration", desc: "Europaeische digitale Identitaet — Sandbox 2026, Produktion Dez. 2026." },
                      { title: "World: Post-Erstellung + Bildschirmzeit", desc: "KI-gestuetzte Posts, Bildschirmzeit-Enforcement fuer Kinder." },
                      { title: "KI-Support / Arego System-Chat", desc: "Dein persoenlicher Assistent direkt in der App." },
                      { title: "Spaces Video Calls + Streaming", desc: "Meeting- und Webinar-Modus fuer Spaces." },
                      { title: "Spaces Shop-System", desc: "Verkaufen direkt im Space." },
                      { title: "P2P Dokumentenaustausch", desc: "Ordner-System mit Ablaufdaten fuer Behoerden, Schulen, Arzt." },
                      { title: "Institutionen-Modul", desc: "Gemeinden, Schulen, Vereine — Formulare und EUDI-Anbindung." },
                      { title: "Politik-Kachel", desc: "Gesetze in Alltagssprache, anonymes Voting." },
                      { title: "Angepinnte Chats + Zwei Profile", desc: "Wichtige Chats oben, Privat- und Arbeitsprofil parallel." },
                      { title: "Google Play + Apple App Store", desc: "Native Apps via Capacitor.js." },
                      { title: "Erweiterter Backup + dezentrale Wiederherstellung", desc: ".arego Format, E2E verschluesselt, Shamir's Secret Sharing." },
                      { title: "Oeffentliche Space-Suche", desc: "Directory-Endpoint fuer oeffentliche Spaces." },
                      { title: "Weitere EU-Sprachen", desc: "Mehrsprachigkeit ueber DE/EN/LT hinaus." },
                    ],
                  },
                ];

                return (
                  <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
                    <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                      <Map size={14} className="text-purple-400" /> Roadmap
                    </h3>

                    <div className="relative space-y-4 pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gradient-to-b before:from-emerald-500 before:via-amber-500 before:to-purple-500">
                      {roadmapSections.map((section) => (
                        <div key={section.key} className="relative">
                          <div className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full ${section.dotClass} flex items-center justify-center`}>
                            {section.icon}
                          </div>
                          <button
                            onClick={() => toggleRoadmap(section.key)}
                            className="flex items-center gap-2 w-full text-left group"
                          >
                            <h4 className={`text-xs font-bold ${section.labelColor} uppercase tracking-wider`}>
                              {section.label}
                            </h4>
                            <span className={`text-[10px] ${section.labelColor} opacity-60`}>({section.items.length})</span>
                            <ChevronDown
                              size={14}
                              className={`${section.chevronColor} transition-transform duration-200 ${openRoadmap[section.key] ? "rotate-180" : ""}`}
                            />
                          </button>
                          <AnimatePresence>
                            {openRoadmap[section.key] && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="grid grid-cols-1 gap-2 mt-3">
                                  {section.items.map((item, i) => (
                                    <div key={i} className={`flex items-start gap-2 ${section.cardBg} border rounded-lg px-3 py-2`}>
                                      {section.cardIcon}
                                      <div className="min-w-0">
                                        <span className="text-xs text-gray-200 font-medium">{item.title}</span>
                                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Projekt unterstützen */}
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Heart size={14} className="text-blue-400" /> Projekt unterstützen</h3>
                <p className="text-sm text-gray-300 leading-relaxed mb-2">
                  Aregoland ist und bleibt für 1€ pro Monat nutzbar — kein Datenhunger, keine Werbung, keine Kompromisse. Aber wenn du die Entwicklung zusätzlich beschleunigen möchtest und mich unterstützen willst, freue ich mich sehr darüber.
                </p>
                <p className="text-sm text-gray-300 leading-relaxed mb-4">
                  Jeder Betrag hilft mir, mehr Zeit in Aregoland zu investieren — und vielleicht eines Tages nur noch daran zu arbeiten.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <a href="https://paypal.me/aregoland" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 text-sm font-medium hover:bg-blue-600/30 transition-colors">
                    Mit PayPal spenden
                  </a>
                  <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-700/30 border border-gray-600/30 text-gray-500 text-sm font-medium cursor-default">
                    GitHub Sponsors — kommt bald
                  </div>
                </div>
              </div>

              {/* App-Version */}
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 flex items-center gap-3">
                <Info size={16} className="text-blue-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">App-Version</p>
                  <p className="text-sm font-bold">Aregoland Beta &bull; V{__APP_VERSION__}</p>
                </div>
              </div>
            </div>
          )}

          {currentOfficialTab === "support" && (
            <div className="space-y-4">
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🤖</div>
                <h3 className="text-lg font-bold mb-2">Kommt bald</h3>
                <p className="text-sm text-gray-400 leading-relaxed max-w-xs mx-auto">
                  Unser KI-basierter Support hilft dir bei Fragen, Problemen und Ideen. Er erkennt bekannte Bugs, prüft ob deine Idee bereits vorgeschlagen wurde und gibt dir direkt eine Antwort — ohne Wartezeit, ohne Formular.
                </p>
              </div>
            </div>
          )}

          {currentOfficialTab === "world" && (
            <div className="space-y-4">
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🌍</div>
                <h3 className="text-lg font-bold mb-2">Kommt bald</h3>
                <p className="text-sm text-gray-400 leading-relaxed max-w-xs mx-auto">
                  World öffnet Aregoland für öffentliche Inhalte — kuratiert, sicher, ohne Algorithmen.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (view === "detail" && selectedSpace) {
    const tmpl = getTemplate(selectedSpace.template);
    const appearance = loadAppearance(selectedSpace.id);
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {/* Header with gradient banner + centered icon */}
        <div className={`relative h-36 shrink-0 bg-gradient-to-br ${selectedSpace.color}`}>
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 to-gray-900 pointer-events-none" />
          <button onClick={() => setView("list")} className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white z-20">
            <ArrowLeft size={20} />
          </button>
          {/* Centered Icon */}
          <div className="absolute inset-0 flex items-center justify-center z-0 -mt-4">
            {appearance.icon?.type === "image" ? (
              <img src={appearance.icon.value} className="w-20 h-20 rounded-xl object-cover" />
            ) : appearance.icon?.type === "emoji" ? (
              <div className="w-20 h-20 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-4xl">{appearance.icon.value}</div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-3xl font-bold text-white">{(selectedSpace.name[0] ?? "").toUpperCase()}</div>
            )}
          </div>
          <div className="absolute bottom-0 left-0 p-4 w-full z-10">
            <h1 className="text-2xl font-bold">{selectedSpace.name}</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1">
            {(["overview", "news", "chats", "members", "profile", "settings", "world"] as const).map(tab => {
              const totalUnread = tab === "chats"
                ? (selectedSpace.channels ?? []).reduce((sum, ch) => sum + (ch.unreadCount ?? 0), 0)
                : 0;
              return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors relative ${
                  activeTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {t(`spaces.tab_${tab}`)}
                {totalUnread > 0 && (
                  <span className="absolute -top-0.5 -right-2 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">

            {activeTab === "overview" && (() => {
              const pinnedPosts = (selectedSpace.posts ?? []).filter(p => p.pinned).slice(0, 2);
              const recentAnnouncements = (selectedSpace.posts ?? []).filter(p => p.badge === "announcement").slice(0, 3);
              const upcomingEvents = (selectedSpace.posts ?? []).filter(p => p.badge === "event" && p.eventDate && p.eventDate >= new Date().toISOString().slice(0, 10)).slice(0, 3);
              // Use layoutState when editing (live preview), otherwise load from storage
              const layout = editingLayout ? layoutState : loadLayout(selectedSpace.id);

              const renderWidget = (id: WidgetId) => {
                switch (id) {
                  case "spaceInfo":
                    return (
                      <div key={id} className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Info size={12} /> {t('spaces.widget_spaceInfo')}</h3>
                        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                          {selectedSpace.description && <p className="text-sm text-gray-300 mb-2">{selectedSpace.description}</p>}
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Users size={12} />
                            <span>{selectedSpace.members.length} {t('spaces.members')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  case "pinned":
                    return pinnedPosts.length > 0 ? (
                      <div key={id} className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Pin size={12} /> {t('spaces.pinnedPosts')}</h3>
                        {pinnedPosts.map(p => (
                          <button key={p.id} onClick={() => { setActiveTab("news"); setNewsFilter("all"); }} className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-left hover:bg-yellow-500/15 transition-colors">
                            <div className="text-sm font-bold text-yellow-300">{p.title}</div>
                            <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.text}</div>
                          </button>
                        ))}
                      </div>
                    ) : null;
                  case "announcements":
                    return recentAnnouncements.length > 0 ? (
                      <div key={id} className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Megaphone size={12} /> {t('spaces.recentAnnouncements')}</h3>
                        {recentAnnouncements.map(p => (
                          <div key={p.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                            <div className="text-sm font-medium">{p.title}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{p.authorName} · {new Date(p.createdAt).toLocaleDateString()}</div>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  case "events":
                    return upcomingEvents.length > 0 ? (
                      <div key={id} className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Calendar size={12} /> {t('spaces.upcomingEvents')}</h3>
                        {upcomingEvents.map(p => (
                          <div key={p.id} className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                            <div className="text-sm font-medium">{p.title}</div>
                            <div className="text-xs text-purple-300 mt-0.5">{p.eventDate}{p.eventTime ? ` · ${p.eventTime}` : ""}{p.eventLocation ? ` · ${p.eventLocation}` : ""}</div>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  case "activeChats": {
                    const chatsWithMessages = (selectedSpace.channels ?? []).filter(ch => ch.lastMessage).slice(0, 3);
                    return chatsWithMessages.length > 0 ? (
                      <div key={id} className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><MessageCircle size={12} /> {t('spaces.activeChats')}</h3>
                        {chatsWithMessages.map(ch => (
                          <button key={ch.id} onClick={() => { setActiveTab("chats"); handleOpenChannel(ch); }}
                            className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-left hover:bg-gray-800 transition-colors">
                            <div className="flex items-center gap-2">
                              <Hash size={12} className="text-blue-400 shrink-0" />
                              <span className="text-sm font-medium truncate">{ch.name}</span>
                              {ch.lastMessageTime && <span className="text-[10px] text-gray-600 ml-auto shrink-0">{new Date(ch.lastMessageTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 truncate">{ch.lastMessage}</div>
                          </button>
                        ))}
                      </div>
                    ) : null;
                  }
                  case "membersOnline":
                    return (
                      <div key={id} className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Users size={12} /> {t('spaces.membersOnline')}</h3>
                        <div className="flex flex-wrap gap-3">
                          {selectedSpace.members.slice(0, 8).map(m => (
                            <div key={m.aregoId} className="flex flex-col items-center gap-1 w-12">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-xs font-bold text-white">
                                {(m.displayName[0] ?? "").toUpperCase()}
                              </div>
                              <span className="text-[9px] text-gray-500 text-center leading-tight truncate w-full">{m.displayName.split(" ")[0]}</span>
                            </div>
                          ))}
                          {selectedSpace.members.length > 8 && (
                            <div className="flex flex-col items-center gap-1 w-12">
                              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                                +{selectedSpace.members.length - 8}
                              </div>
                              <span className="text-[9px] text-gray-600 text-center">{t('spaces.more')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  default: return null;
                }
              };

              // ── Layout Editor ──
              if (editingLayout) {
                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold">{t('spaces.customizeLayout')}</h3>
                      <button onClick={() => { saveLayout(selectedSpace.id, layoutState); setEditingLayout(false); }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors">
                        {t('spaces.saveLayout')}
                      </button>
                    </div>

                    {/* Editor: Drag & Drop + Toggles */}
                    <Reorder.Group
                      axis="y"
                      values={layoutState}
                      onReorder={setLayoutState}
                      className="space-y-2 mb-4"
                    >
                      {layoutState.map(widget => (
                        <Reorder.Item key={widget.id} value={widget} className="list-none">
                          <div className="flex items-center gap-3 bg-gray-800/50 rounded-xl border border-gray-700/50 p-3">
                            <div className="text-gray-600 cursor-grab active:cursor-grabbing touch-none">
                              <GripVertical size={16} />
                            </div>
                            <span className={`text-sm font-medium flex-1 ${widget.visible ? "text-white" : "text-gray-600"}`}>
                              {t(`spaces.widget_${widget.id}`)}
                            </span>
                            <button
                              onClick={() => setLayoutState(prev => prev.map(w => w.id === widget.id ? { ...w, visible: !w.visible } : w))}
                              className={`w-11 h-6 rounded-full transition-colors relative ${widget.visible ? "bg-green-600" : "bg-gray-700"}`}
                            >
                              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${widget.visible ? "translate-x-5" : "translate-x-0.5"}`} />
                            </button>
                          </div>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>

                    {/* Live preview */}
                    <div className="border-t border-gray-700/50 pt-4 space-y-4">
                      <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('spaces.previewLabel')}</h4>
                      {layoutState.filter(w => w.visible).map(w => renderWidget(w.id))}
                    </div>
                  </>
                );
              }

              // ── Normal Overview ──
              const visibleWidgets = layout.filter(w => w.visible);
              const hasContent = visibleWidgets.some(w => renderWidget(w.id) !== null);

              return (
                <>
                  {/* Anpassen Button */}
                  <div className="flex justify-end -mt-2 mb-1">
                    <button onClick={() => { setLayoutState(loadLayout(selectedSpace.id)); setEditingLayout(true); }}
                      className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all" title={t('spaces.customizeLayout')}>
                      <Edit2 size={15} />
                    </button>
                  </div>

                  {visibleWidgets.map(w => renderWidget(w.id))}

                  {!hasContent && (selectedSpace.posts ?? []).length === 0 && (
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

            {activeTab === "chats" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "guest";
              const canManage = myRole === "founder" || myRole === "admin";
              const channels = (selectedSpace.channels ?? []).filter(ch =>
                ch.readRoles.includes(myRole)
              );

              // ── Open Channel View (Gruppen-Chat) ──
              if (openChannel) {
                const canWrite = openChannel.writeRoles.includes(myRole);
                return (
                  <div className="flex flex-col -m-4 h-[calc(100vh-12rem)]">
                    {/* Channel header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
                      <button onClick={handleCloseChannel} className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-all">
                        <ArrowLeft size={18} />
                      </button>
                      <Hash size={16} className="text-gray-500" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{openChannel.name}</h3>
                        {openChannel.isGlobal && (
                          <span className="text-[10px] text-yellow-400">{t('spaces.globalChatHint')}</span>
                        )}
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                      {chatMessages.length === 0 && (
                        <div className="text-center py-10 text-gray-600">
                          <MessageCircle size={28} className="mx-auto mb-2 opacity-50" />
                          <p className="text-xs">{t('spaces.noMessagesYet')}</p>
                        </div>
                      )}
                      {chatMessages.map(msg => {
                        const isMe = msg.authorId === identity?.aregoId;
                        const msgType = msg.type ?? "text";
                        // Render @mentions as bold blue
                        const renderText = (text: string) => {
                          if (!text) return null;
                          const parts = text.split(/(@\S+)/g);
                          return parts.map((part, i) =>
                            part.startsWith("@") ? <span key={i} className="font-bold text-blue-300">{part}</span> : part
                          );
                        };
                        return (
                          <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] ${isMe ? "order-2" : ""}`}>
                              {!isMe && (
                                <span className="text-[10px] text-gray-500 font-medium ml-1 mb-0.5 block">{msg.authorName}</span>
                              )}
                              <div className={`rounded-2xl overflow-hidden ${
                                isMe ? "bg-blue-600 text-white rounded-br-md" : "bg-gray-800 text-gray-200 rounded-bl-md"
                              }`}>
                                {/* Text */}
                                {msgType === "text" && (
                                  <div className="px-3 py-2 text-sm leading-relaxed">{renderText(msg.text)}</div>
                                )}
                                {/* Image */}
                                {msgType === "image" && msg.fileData && (
                                  <div>
                                    <img src={msg.fileData} alt={msg.fileName ?? "Bild"} className="max-w-full rounded-t-2xl cursor-pointer" onClick={() => window.open(msg.fileData, "_blank")} />
                                    {msg.text && <div className="px-3 py-1.5 text-sm">{renderText(msg.text)}</div>}
                                  </div>
                                )}
                                {/* Audio */}
                                {msgType === "audio" && msg.fileData && (
                                  <div className="px-3 py-2 flex items-center gap-2">
                                    <button onClick={() => toggleAudioPlayback(msg.id, msg.fileData!)}
                                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isMe ? "bg-white/20 hover:bg-white/30" : "bg-gray-700 hover:bg-gray-600"} transition-colors`}>
                                      {playingAudio === msg.id ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                                    </button>
                                    <div className="flex-1">
                                      <div className={`h-1 rounded-full ${isMe ? "bg-white/30" : "bg-gray-600"}`}>
                                        <div className={`h-1 rounded-full w-0 ${isMe ? "bg-white/70" : "bg-blue-400"}`} />
                                      </div>
                                    </div>
                                    <Mic size={12} className="opacity-50 shrink-0" />
                                  </div>
                                )}
                                {/* File */}
                                {msgType === "file" && msg.fileData && (
                                  <a href={msg.fileData} download={msg.fileName} className="px-3 py-2 flex items-center gap-2 hover:opacity-80 transition-opacity">
                                    <FileText size={18} className="shrink-0 opacity-70" />
                                    <span className="text-sm truncate flex-1">{msg.fileName ?? "Datei"}</span>
                                    <Download size={14} className="shrink-0 opacity-50" />
                                  </a>
                                )}
                              </div>
                              <span className={`text-[10px] text-gray-600 mt-0.5 block ${isMe ? "text-right mr-1" : "ml-1"}`}>
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    {canWrite ? (
                      <div className="border-t border-gray-800 shrink-0">
                        {/* @Mentions popup */}
                        {showMentions && selectedSpace && (
                          <div className="px-4 py-2 border-b border-gray-800 max-h-32 overflow-y-auto">
                            {selectedSpace.members
                              .filter(m => m.displayName.toLowerCase().includes(mentionFilter))
                              .slice(0, 6)
                              .map(m => (
                                <button key={m.aregoId} onClick={() => insertMention(m)}
                                  className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-left">
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                    {(m.displayName[0] ?? "").toUpperCase()}
                                  </div>
                                  <span className="text-xs font-medium text-gray-300">{m.displayName}</span>
                                  <span className={`text-[9px] ml-auto ${ROLE_COLORS[m.role]?.text ?? "text-gray-500"}`}>{t(`spaces.role_${m.role}`)}</span>
                                </button>
                              ))}
                            {selectedSpace.members.filter(m => m.displayName.toLowerCase().includes(mentionFilter)).length === 0 && (
                              <p className="text-[10px] text-gray-600 text-center py-1">{t('spaces.noMentionResults')}</p>
                            )}
                          </div>
                        )}
                        {/* Large file warning */}
                        {showLargeFileWarning && (
                          <div className="px-4 py-3 bg-yellow-500/10 border-b border-yellow-500/20 space-y-2">
                            <p className="text-xs text-yellow-300">{t('spaces.largeFileWarning', { name: showLargeFileWarning.name, size: (showLargeFileWarning.size / (1024 * 1024)).toFixed(0) })}</p>
                            <div className="flex gap-2">
                              <button onClick={confirmLargeFile} className="flex-1 py-1.5 bg-yellow-500/20 text-yellow-300 text-xs font-medium rounded-lg hover:bg-yellow-500/30 transition-colors">{t('spaces.sendAnyway')}</button>
                              <button onClick={() => setShowLargeFileWarning(null)} className="flex-1 py-1.5 bg-gray-800 text-gray-400 text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors">{t('common.cancel')}</button>
                            </div>
                          </div>
                        )}
                        {/* Upload progress */}
                        {uploadProgress && (
                          <div className="px-4 py-2 border-b border-gray-700/50">
                            <div className="flex items-center gap-2 mb-1">
                              <Paperclip size={12} className="text-blue-400 shrink-0" />
                              <span className="text-[11px] text-gray-400 truncate flex-1">{uploadProgress.fileName}</span>
                              <span className="text-[11px] text-blue-400 font-medium shrink-0">{uploadProgress.percent}%</span>
                            </div>
                            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-1 bg-blue-500 rounded-full transition-all duration-150" style={{ width: `${uploadProgress.percent}%` }} />
                            </div>
                          </div>
                        )}
                        {/* Recording indicator */}
                        {isRecording && (
                          <div className="px-4 py-2 flex items-center gap-2 bg-red-500/10 border-b border-red-500/20">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs text-red-400 font-medium flex-1">{t('spaces.recording')}</span>
                            <button onClick={stopRecording} className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30 transition-colors">
                              <Square size={14} />
                            </button>
                          </div>
                        )}
                        {/* Input bar */}
                        {!isRecording && (
                          <div className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-lg transition-all">
                                <Paperclip size={18} />
                              </button>
                              <input
                                type="text"
                                value={chatInput}
                                onChange={e => handleChatInputChange(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !showMentions) handleSendMessage(); if (e.key === "Escape") setShowMentions(false); }}
                                placeholder={t('spaces.chatInputPlaceholder')}
                                className="flex-1 bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                              />
                              {chatInput.trim() ? (
                                <button onClick={handleSendMessage} className="p-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all">
                                  <Send size={18} />
                                </button>
                              ) : (
                                <button
                                  onPointerDown={startRecording}
                                  onPointerUp={stopRecording}
                                  onPointerLeave={() => { if (isRecording) stopRecording(); }}
                                  className="p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                                >
                                  <Mic size={18} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-3 border-t border-gray-800 shrink-0">
                        <div className="flex items-center gap-2 text-gray-500 text-xs justify-center">
                          <Lock size={14} />
                          <span>{t('spaces.readOnlyChat')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // ── Open Subroom View ──
              if (openSubroom) {
                const subroomChannels = openSubroom.channels ?? [];
                return (
                  <div className="space-y-3 -mt-1">
                    <div className="flex items-center gap-3 mb-2">
                      <button onClick={() => setOpenSubroom(null)} className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-all">
                        <ArrowLeft size={18} />
                      </button>
                      <Layers size={16} className="text-purple-400" />
                      <h3 className="text-sm font-bold">{openSubroom.name}</h3>
                      <span className="text-xs text-gray-500 ml-auto">{openSubroom.memberIds.length} {t('spaces.members')}</span>
                    </div>
                    {subroomChannels.map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => handleOpenChannel(ch)}
                        className="w-full flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-all text-left"
                      >
                        <Hash size={16} className="text-gray-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{ch.name}</div>
                          {ch.lastMessage && (
                            <div className="text-xs text-gray-500 truncate mt-0.5">{ch.lastMessage}</div>
                          )}
                        </div>
                      </button>
                    ))}
                    {canManage && (
                      <button onClick={() => handleDeleteSubroom(openSubroom.id)} className="w-full flex items-center justify-center gap-2 p-2 text-red-400 text-xs hover:bg-red-500/10 rounded-xl transition-colors mt-2">
                        <Trash2 size={14} /> {t('spaces.deleteSubroom')}
                      </button>
                    )}
                  </div>
                );
              }

              // ── Channel List View ──
              return (
                <>
                  {/* Channel list */}
                  {channels.length === 0 && (
                    <div className="text-center py-12 text-gray-600">
                      <Hash size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('spaces.noChatsYet')}</p>
                    </div>
                  )}

                  {channels.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => handleOpenChannel(ch)}
                      className="w-full flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-all text-left"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ch.isGlobal ? "bg-yellow-500/15 text-yellow-400" : "bg-blue-500/15 text-blue-400"}`}>
                        {ch.isGlobal ? <Megaphone size={18} /> : <Hash size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{ch.name}</span>
                          {ch.isGlobal && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400 font-bold shrink-0">GLOBAL</span>}
                        </div>
                        {ch.lastMessage && (
                          <div className="text-xs text-gray-500 truncate mt-0.5">{ch.lastMessage}</div>
                        )}
                      </div>
                      {ch.lastMessageTime && (
                        <span className="text-[10px] text-gray-600 shrink-0">
                          {new Date(ch.lastMessageTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {ch.unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {ch.unreadCount > 9 ? "9+" : ch.unreadCount}
                        </span>
                      )}
                    </button>
                  ))}

                  {/* Unterräume */}
                  {(selectedSpace.subrooms ?? []).length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <Layers size={12} /> {t('spaces.subrooms')}
                      </h3>
                      {(selectedSpace.subrooms ?? []).map(sr => (
                        <button
                          key={sr.id}
                          onClick={() => setOpenSubroom(sr)}
                          className="w-full flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-purple-500/20 hover:border-purple-500/40 transition-all text-left"
                        >
                          <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                            <Layers size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate block">{sr.name}</span>
                            <span className="text-xs text-gray-500">{sr.memberIds.length} {t('spaces.members')}</span>
                          </div>
                          <ChevronRight size={16} className="text-gray-600 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {activeTab === "members" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role;
              const canManage = myRole === "founder" || myRole === "admin";

              // Mitglieder mit joinedAt Fallback
              const membersWithDate = selectedSpace.members.map(m => ({
                ...m,
                joinedAt: m.joinedAt ?? selectedSpace.createdAt,
              }));

              // Sortierung
              const sortedMembers = [...membersWithDate].sort((a, b) => {
                if (memberSort === "role") {
                  return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
                }
                if (memberSort === "name") {
                  return a.displayName.localeCompare(b.displayName);
                }
                // date
                const da = new Date(a.joinedAt).getTime();
                const db = new Date(b.joinedAt).getTime();
                return memberSortDateAsc ? da - db : db - da;
              });

              // Gruppiert nur bei Rollen-Sortierung
              const grouped = memberSort === "role"
                ? ROLE_ORDER.map(role => ({
                    role,
                    members: sortedMembers.filter(m => m.role === role),
                  })).filter(g => g.members.length > 0)
                : null;

              const formatJoinDate = (iso: string) => {
                const d = new Date(iso);
                return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              };

              const renderMember = (member: typeof membersWithDate[0]) => (
                <div key={member.aregoId} className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-sm font-bold text-white">
                        {(member.displayName[0] ?? "").toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{member.displayName}</div>
                        <div className="text-xs text-gray-500 font-mono">{member.aregoId}</div>
                        <div className="text-[10px] text-gray-600 mt-0.5">{formatJoinDate(member.joinedAt)}</div>
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
              );

              return (
                <>
                  {/* Stats summary */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-blue-400">{selectedSpace.members.length}</div>
                      <div className="text-xs text-gray-500">{t('spaces.members')}</div>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-purple-400">{(selectedSpace.posts ?? []).length}</div>
                      <div className="text-xs text-gray-500">{t('spaces.tab_news')}</div>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-green-400">{(selectedSpace.channels ?? []).length}</div>
                      <div className="text-xs text-gray-500">{t('spaces.tab_chats')}</div>
                    </div>
                  </div>

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

                  {/* Sortier-Leiste */}
                  <div className="flex items-center gap-1.5 mb-3 mt-1">
                    {(["role", "name", "date"] as const).map(s => (
                      <button key={s}
                        onClick={() => {
                          if (s === "date" && memberSort === "date") setMemberSortDateAsc(p => !p);
                          setMemberSort(s);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                          memberSort === s ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                        }`}>
                        {s === "role" ? "Rolle" : s === "name" ? "Name" : "Beitrittsdatum"}
                        {s === "date" && memberSort === "date" && (
                          <ChevronDown size={12} className={`transition-transform ${memberSortDateAsc ? "rotate-180" : ""}`} />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Members list */}
                  {grouped ? (
                    grouped.map(({ role, members: roleMembers }) => (
                      <div key={role} className="space-y-2">
                        <div className="flex items-center gap-2 px-1 mt-3">
                          <span className={`text-xs font-bold uppercase tracking-wider ${ROLE_COLORS[role].text}`}>{t(`spaces.role_${role}`)}</span>
                          <span className="text-xs text-gray-600">{roleMembers.length}</span>
                        </div>
                        {roleMembers.map(renderMember)}
                      </div>
                    ))
                  ) : (
                    <div className="space-y-2">
                      {sortedMembers.map(renderMember)}
                    </div>
                  )}
                </>
              );
            })()}

            {/* ── PROFIL TAB ── */}
            {activeTab === "profile" && (() => {
              const myMember = selectedSpace.members.find(m => m.aregoId === identity?.aregoId);
              const myRole = myMember?.role ?? "member";
              // Check if role allows network helper (built-in moderator always can, custom roles check permission)
              const canBeNetworkHelper = myRole === "moderator" || myRole === "founder" || myRole === "admin"
                || (selectedSpace.customRoles ?? []).some(cr => cr.name === myRole && cr.permissions.allowNetworkHelper);
              const relayKey = `arego_relay_${selectedSpace.id}`;
              const mobileDataKey = `arego_relay_mobile_${selectedSpace.id}`;
              const NOTIF_STORAGE = "aregoland_space_notifications";
              type NotifMode = "all" | "mute" | "none";
              type NotifConfig = { mode: NotifMode; messages: boolean; events: boolean; news: boolean; calls: boolean; mentions: boolean; newMembers: boolean };
              const defaultNotif: NotifConfig = { mode: "all", messages: true, events: true, news: true, calls: true, mentions: true, newMembers: true };
              const loadNotif = (): NotifConfig => {
                try { const all = JSON.parse(localStorage.getItem(NOTIF_STORAGE) ?? "{}"); return { ...defaultNotif, ...(all[selectedSpace.id] ?? {}) }; }
                catch { return defaultNotif; }
              };
              const saveNotif = (cfg: NotifConfig) => {
                try { const all = JSON.parse(localStorage.getItem(NOTIF_STORAGE) ?? "{}"); all[selectedSpace.id] = cfg; localStorage.setItem(NOTIF_STORAGE, JSON.stringify(all)); }
                catch { /* ignore */ }
              };
              const notif = loadNotif();
              return (
                <>
                  {/* Avatar + Name */}
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-2xl font-bold text-white">
                      {(myMember?.displayName?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div>
                      <div className="text-lg font-bold">{myMember?.displayName ?? "?"}</div>
                      <div className="text-xs text-gray-500 font-mono">{identity?.aregoId}</div>
                    </div>
                    {/* Role badge */}
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${ROLE_COLORS[myRole as SpaceRole]?.bg ?? "bg-gray-700/50"} ${ROLE_COLORS[myRole as SpaceRole]?.text ?? "text-gray-400"}`}>
                      <Shield size={12} />
                      {t(`spaces.role_${myRole}`)}
                    </div>
                  </div>

                  {/* Netzwerk-Helfer — nur wenn Rolle es erlaubt */}
                  {canBeNetworkHelper && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                      <p className="text-[11px] text-blue-200/80 leading-relaxed">{t('spaces.networkHelperProfileHint')}</p>
                    </div>
                  )}
                  {canBeNetworkHelper && (() => {
                    const isOnMobile = 'connection' in navigator && (navigator as any).connection?.type === 'cellular';
                    const helperActive = localStorage.getItem(relayKey) !== "off" && !isOnMobile;
                    const mobileDataAllowed = localStorage.getItem(mobileDataKey) === "on";
                    const effectiveActive = localStorage.getItem(relayKey) !== "off" && (!isOnMobile || mobileDataAllowed);
                    return (
                      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">{t('spaces.networkHelperActive')}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{t('spaces.networkHelperDesc')}</div>
                          </div>
                          <button
                            onClick={() => {
                              const current = localStorage.getItem(relayKey) !== "off";
                              localStorage.setItem(relayKey, current ? "off" : "on");
                              updateSpace({ ...selectedSpace });
                            }}
                            className={`w-11 h-6 rounded-full transition-colors relative ${localStorage.getItem(relayKey) !== "off" ? "bg-blue-600" : "bg-gray-700"}`}
                          >
                            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${localStorage.getItem(relayKey) !== "off" ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        </div>

                        {/* Mobile Daten Toggle */}
                        {localStorage.getItem(relayKey) !== "off" && (
                          <div className="flex items-center justify-between pt-1 border-t border-gray-700/30">
                            <div>
                              <div className="text-xs font-medium text-gray-300">{t('spaces.useMobileData')}</div>
                              <div className="text-[10px] text-gray-600 mt-0.5">{t('spaces.useMobileDataDesc')}</div>
                            </div>
                            <button
                              onClick={() => {
                                const current = localStorage.getItem(mobileDataKey) === "on";
                                // Warnung bei manuellem Aktivieren auf Mobilfunk
                                if (!current && isOnMobile) {
                                  if (!confirm(t('spaces.mobileDataManualWarning'))) return;
                                }
                                localStorage.setItem(mobileDataKey, current ? "off" : "on");
                                updateSpace({ ...selectedSpace });
                              }}
                              className={`w-9 h-5 rounded-full transition-colors relative ${mobileDataAllowed ? "bg-blue-600" : "bg-gray-700"}`}
                            >
                              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${mobileDataAllowed ? "translate-x-4" : "translate-x-0.5"}`} />
                            </button>
                          </div>
                        )}

                        {/* Mobile Daten erkannt Warnung */}
                        {isOnMobile && !mobileDataAllowed && localStorage.getItem(relayKey) !== "off" && (
                          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
                            <p className="text-[11px] text-yellow-300/80 leading-relaxed">{t('spaces.mobileDataDetected')}</p>
                          </div>
                        )}

                        {/* Deaktiviert Warnung */}
                        {localStorage.getItem(relayKey) === "off" && (
                          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
                            <p className="text-[11px] text-yellow-300/80 leading-relaxed">{t('spaces.networkHelperOffWarning')}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Space-Benachrichtigungen */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                    <div className="p-4 pb-3">
                      <div className="text-sm font-bold mb-3">{t('spaces.spaceNotifications')}</div>
                      {/* Modus */}
                      <div className="flex gap-1.5">
                        {(["all", "mute", "none"] as NotifMode[]).map(mode => (
                          <button key={mode}
                            onClick={() => { const n = { ...notif, mode }; saveNotif(n); updateSpace({ ...selectedSpace }); }}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                              notif.mode === mode ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                            }`}>
                            {t(`spaces.notifMode_${mode}`)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Einzelne Toggles — nur wenn nicht "Keine" */}
                    {notif.mode !== "none" && (
                      <div className="border-t border-gray-700/50">
                        {(["messages", "events", "news", "calls", "mentions", "newMembers"] as const).map(key => (
                          <div key={key} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/30 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-300">{t(`spaces.notif_${key}`)}</span>
                              {key === "mentions" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-medium">{t('spaces.notifRecommended')}</span>
                              )}
                            </div>
                            <button
                              onClick={() => { const n = { ...notif, [key]: !notif[key] }; saveNotif(n); updateSpace({ ...selectedSpace }); }}
                              className={`w-9 h-5 rounded-full transition-colors relative ${notif[key] ? "bg-blue-600" : "bg-gray-700"}`}
                            >
                              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${notif[key] ? "translate-x-4" : "translate-x-0.5"}`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {activeTab === "settings" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "member";
              const canManageSettings = myRole === "founder" || myRole === "admin";
              return (
                <div className="space-y-4">
                  {/* Erscheinungsbild — nur Admin/Founder */}
                  {canManageSettings && (() => {
                    const app = loadAppearance(selectedSpace.id);
                    return (
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">{t('spaces.appearance')}</h3>
                        <div className="flex gap-3">
                          {/* Icon ändern */}
                          <div className="shrink-0 space-y-1.5">
                            <label className="text-[10px] text-gray-500 px-0.5">{t('spaces.icon')}</label>
                            <button onClick={() => setShowIconPicker(!showIconPicker)}
                              className="w-16 h-16 rounded-xl border-2 border-gray-700/50 hover:border-gray-500 flex items-center justify-center transition-all overflow-hidden bg-white/10">
                              {app.icon?.type === "image" ? <img src={app.icon.value} className="w-full h-full object-cover" /> :
                               app.icon?.type === "emoji" ? <span className="text-2xl">{app.icon.value}</span> :
                               <span className="text-xl font-bold text-white">{(selectedSpace.name[0] ?? "").toUpperCase()}</span>}
                            </button>
                          </div>
                          {/* Banner Farbe ändern */}
                          <div className="flex-1 space-y-1.5">
                            <label className="text-[10px] text-gray-500 px-0.5">{t('spaces.banner')}</label>
                            <button onClick={() => setShowBannerPicker(!showBannerPicker)}
                              className={`w-full h-16 rounded-xl border-2 border-gray-700/50 hover:border-gray-500 overflow-hidden transition-all bg-gradient-to-br ${selectedSpace.color}`}>
                              <div className="w-full h-full flex items-center justify-center text-white/40 hover:text-white/70 transition-colors">
                                <Edit2 size={16} />
                              </div>
                            </button>
                          </div>
                        </div>
                        <input type="file" ref={iconFileRef} className="hidden" accept="image/*" onChange={e => {
                          const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
                          const reader = new FileReader(); reader.onload = () => {
                            saveAppearance(selectedSpace.id, { ...app, icon: { type: "image", value: reader.result as string } });
                            updateSpace({ ...selectedSpace }); setShowIconPicker(false);
                          }; reader.readAsDataURL(file);
                        }} />
                        {/* Icon Picker */}
                        <AnimatePresence>
                          {showIconPicker && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  {EMOJI_QUICK.map(em => (
                                    <button key={em} onClick={() => {
                                      saveAppearance(selectedSpace.id, { ...app, icon: { type: "emoji", value: em } });
                                      updateSpace({ ...selectedSpace }); setShowIconPicker(false);
                                    }} className="w-10 h-10 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-xl transition-colors">{em}</button>
                                  ))}
                                </div>
                                <button onClick={() => iconFileRef.current?.click()} className="w-full py-2 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-lg transition-colors">
                                  {t('spaces.uploadIcon')}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        {/* Banner Color Picker */}
                        <AnimatePresence>
                          {showBannerPicker && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                                <div className="flex flex-wrap gap-2">
                                  {BANNER_PRESETS.map(g => (
                                    <button key={g} onClick={() => {
                                      saveAppearance(selectedSpace.id, { ...app, banner: { type: "color", value: g } });
                                      updateSpace({ ...selectedSpace, color: g }); setShowBannerPicker(false);
                                    }} className={`w-10 h-10 rounded-lg bg-gradient-to-br ${g} border-2 ${selectedSpace.color === g ? "border-white" : "border-transparent"} hover:border-gray-400 transition-all`} />
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })()}

                  {/* Tags bearbeiten — nur Admin/Founder */}
                  {canManageSettings && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
                        <Tag size={11} /> {t('spaces.tags')}
                      </h3>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {(selectedSpace.tags ?? []).map(tag => (
                          <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50">
                            {tag}
                            <button onClick={() => updateSpace({ ...selectedSpace, tags: (selectedSpace.tags ?? []).filter(t => t !== tag) })}
                              className="hover:text-white transition-colors"><X size={11} /></button>
                          </span>
                        ))}
                        <button onClick={() => setShowSettingsTagPicker(p => !p)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-all flex items-center gap-1">
                          <Plus size={11} /> Tag
                        </button>
                      </div>
                      <AnimatePresence>
                        {showSettingsTagPicker && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 space-y-2">
                              <div className="flex flex-wrap gap-1.5">
                                {SPACE_TAGS.map(tag => {
                                  const active = (selectedSpace.tags ?? []).includes(tag);
                                  return (
                                    <button key={tag}
                                      onClick={() => {
                                        const current = selectedSpace.tags ?? [];
                                        const next = active ? current.filter(t => t !== tag) : [...current, tag];
                                        updateSpace({ ...selectedSpace, tags: next });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                                        active ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-700 text-gray-500 hover:bg-gray-600"
                                      }`}>
                                      {tag}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-2">
                                <input type="text" value={settingsCustomTag} onChange={e => setSettingsCustomTag(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter" && settingsCustomTag.trim()) {
                                      const current = selectedSpace.tags ?? [];
                                      if (!current.includes(settingsCustomTag.trim())) updateSpace({ ...selectedSpace, tags: [...current, settingsCustomTag.trim()] });
                                      setSettingsCustomTag("");
                                    }
                                  }}
                                  placeholder={t('spaces.customTag') || "Eigenen Tag erstellen"}
                                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500" />
                                <button onClick={() => {
                                    if (settingsCustomTag.trim()) {
                                      const current = selectedSpace.tags ?? [];
                                      if (!current.includes(settingsCustomTag.trim())) updateSpace({ ...selectedSpace, tags: [...current, settingsCustomTag.trim()] });
                                      setSettingsCustomTag("");
                                    }
                                  }}
                                  disabled={!settingsCustomTag.trim()}
                                  className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-30">
                                  <Plus size={14} />
                                </button>
                              </div>
                              <button onClick={() => setShowSettingsTagPicker(false)} className="w-full text-center text-xs text-gray-500 hover:text-gray-300 pt-1">
                                {t('common.close') || "Schließen"}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Sichtbarkeit — nur Admin/Founder */}
                  {canManageSettings && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
                        <Eye size={11} /> Sichtbarkeit
                      </h3>
                      <div className="flex gap-2">
                        {([
                          { id: "public" as const, label: "Öffentlich", icon: <Globe size={14} />, desc: "In der Suche sichtbar" },
                          { id: "private" as const, label: "Privat", icon: <EyeOff size={14} />, desc: "Nur per Einladung" },
                        ]).map(opt => (
                          <button key={opt.id}
                            onClick={() => updateSpace({ ...selectedSpace, visibility: opt.id })}
                            className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                              (selectedSpace.visibility ?? "private") === opt.id
                                ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                                : "border-gray-700/50 bg-gray-800/50 text-gray-500 hover:border-gray-600"
                            }`}>
                            {opt.icon}
                            <span className="text-xs font-bold">{opt.label}</span>
                            <span className="text-[10px] opacity-70">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chats verwalten — nur Admin/Founder */}
                  {canManageSettings && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">{t('spaces.manageChats')}</h3>

                      {/* Create Channel button */}
                      {!showCreateChannel && (
                        <button onClick={() => setShowCreateChannel(true)}
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/50 border border-gray-700/50 border-dashed hover:border-blue-500/50 hover:bg-blue-500/5 transition-all">
                          <Plus size={16} className="text-gray-500" />
                          <span className="text-xs text-gray-400 font-medium">{t('spaces.createChat')}</span>
                        </button>
                      )}

                      {/* Create Channel form */}
                      <AnimatePresence>
                        {showCreateChannel && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-gray-800/50 border border-blue-500/30 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold">{editingChannelId ? t('spaces.editChat') : t('spaces.createChat')}</h4>
                                <button onClick={() => { setShowCreateChannel(false); setEditingChannelId(null); setChannelName(""); }} className="p-1 text-gray-500 hover:text-white"><X size={18} /></button>
                              </div>
                              <input type="text" value={channelName} onChange={e => setChannelName(e.target.value)} placeholder={t('spaces.chatNamePlaceholder')} autoFocus
                                className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all" />
                              {(() => {
                                // Build role list: built-in (moderator, member) + all custom roles
                                const allRoles: { id: string; label: string; color: string }[] = [
                                  { id: "moderator", label: t('spaces.role_moderator'), color: ROLE_COLORS.moderator.text },
                                  { id: "member", label: t('spaces.role_member'), color: ROLE_COLORS.member.text },
                                  ...(selectedSpace.customRoles ?? []).map(cr => ({ id: cr.name, label: cr.name, color: "" })),
                                ];
                                const hasAnyRead = channelReadRoles.size > 0;
                                return (
                                  <>
                                    {/* Lesezugriff oben */}
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium text-gray-400">{t('spaces.readAccess')}</label>
                                      <div className="flex flex-wrap gap-1.5">
                                        {allRoles.map(r => (
                                          <button key={r.id}
                                            onClick={() => {
                                              setChannelReadRoles(prev => {
                                                const n = new Set(prev);
                                                if (n.has(r.id)) {
                                                  n.delete(r.id);
                                                  // Aus Schreibzugriff entfernen wenn Lesen entfernt
                                                  setChannelWriteRoles(wp => { const w = new Set(wp); w.delete(r.id); return w; });
                                                } else { n.add(r.id); }
                                                return n;
                                              });
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${channelReadRoles.has(r.id) ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-800 text-gray-600"}`}>
                                            {r.label}
                                          </button>
                                        ))}
                                      </div>
                                      <p className="text-[10px] text-gray-600 px-0.5">{t('spaces.adminAlwaysAccess')}</p>
                                      <p className="text-[10px] text-gray-500 px-0.5">{t('spaces.guestHint')}</p>
                                    </div>
                                    {/* Schreibzugriff — nur wenn mindestens eine Rolle Lesen hat */}
                                    {hasAnyRead && (
                                      <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-400">{t('spaces.writeAccess')}</label>
                                        <div className="flex flex-wrap gap-1.5">
                                          {allRoles.filter(r => channelReadRoles.has(r.id)).map(r => (
                                            <button key={r.id}
                                              onClick={() => setChannelWriteRoles(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${channelWriteRoles.has(r.id) ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-800 text-gray-600"}`}>
                                              {r.label}
                                            </button>
                                          ))}
                                        </div>
                                        <p className="text-[10px] text-gray-500 px-0.5">{t('spaces.writeRequiresRead')}</p>
                                      </div>
                                    )}
                                    {/* Mitglieder sichtbar Toggle */}
                                    <div className="flex items-center justify-between p-2.5 bg-gray-900/30 rounded-lg">
                                      <span className="text-xs text-gray-300">{t('spaces.chatMembersVisible')}</span>
                                      <button onClick={() => setChannelMembersVisible(!channelMembersVisible)}
                                        className={`w-9 h-5 rounded-full transition-colors relative ${channelMembersVisible ? "bg-blue-600" : "bg-gray-700"}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${channelMembersVisible ? "translate-x-4" : "translate-x-0.5"}`} />
                                      </button>
                                    </div>
                                  </>
                                );
                              })()}
                              <button onClick={handleCreateChannel} disabled={!channelName.trim()}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-all text-sm">
                                {t('spaces.createChat')}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Existing channels list for management */}
                      {(selectedSpace.channels ?? []).filter(ch => !ch.isGlobal).length > 0 && (
                        <div className="space-y-1.5">
                          {(selectedSpace.channels ?? []).filter(ch => !ch.isGlobal).map(ch => (
                            <div key={ch.id} className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-2.5">
                              <div className="flex items-center gap-2">
                                <Hash size={14} className="text-blue-400 shrink-0" />
                                <span className="text-xs font-medium flex-1">{ch.name}</span>
                                <button onClick={() => startEditChannel(ch)} className="p-1 text-gray-600 hover:text-blue-400 transition-colors">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => handleDeleteChannel(ch.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {ch.readRoles.filter(r => r !== "founder" && r !== "admin").map(r => {
                                  const canWrite = ch.writeRoles.includes(r);
                                  return (
                                    <span key={String(r)} className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${canWrite ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"}`}>
                                      {String(r)} · {canWrite ? "schreiben" : "lesen"}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rollen & Rechte — nur Admin/Founder */}
                  {canManageSettings && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">{t('spaces.rolesAndPermissions')}</h3>

                      {/* Founder & Admin — immer voller Zugriff, ausgegraut */}
                      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3 opacity-60 cursor-not-allowed">
                        <div className="flex items-center gap-2 mb-2">
                          <Crown size={14} className="text-yellow-400" />
                          <span className="text-sm font-medium text-yellow-400">{t('spaces.role_founder')}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold ml-auto">{t('spaces.fullAccess')}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(["readChats", "writeChats", "createEvents", "postNews", "inviteMembers", "allowNetworkHelper"] as const).map(perm => (
                            <span key={perm} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-500/15 text-green-400">{t(`spaces.perm_${perm}`)}</span>
                          ))}
                        </div>
                      </div>
                      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3 opacity-60 cursor-not-allowed">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield size={14} className="text-red-400" />
                          <span className="text-sm font-medium text-red-400">{t('spaces.role_admin')}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold ml-auto">{t('spaces.fullAccess')}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(["readChats", "writeChats", "createEvents", "postNews", "inviteMembers", "allowNetworkHelper"] as const).map(perm => (
                            <span key={perm} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-500/15 text-green-400">{t(`spaces.perm_${perm}`)}</span>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-600 px-1">{t('spaces.fullAccessHint')}</p>

                      {/* Existing custom roles */}
                      {(selectedSpace.customRoles ?? []).map(cr => (
                        <div key={cr.id} className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cr.color }} />
                              <span className="text-sm font-medium">{cr.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEditRole(cr)} className="p-1 text-gray-600 hover:text-blue-400 transition-colors">
                                <Edit2 size={13} />
                              </button>
                              <button onClick={() => {
                                const updated = { ...selectedSpace, customRoles: (selectedSpace.customRoles ?? []).filter(r => r.id !== cr.id) };
                                updateSpace(updated);
                              }} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(cr.permissions).map(([key, val]) => (
                              <span key={key} className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${val ? "bg-green-500/15 text-green-400" : "bg-gray-800 text-gray-600"}`}>
                                {t(`spaces.perm_${key}`)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Create custom role */}
                      {!showCreateRole ? (
                        <button onClick={() => setShowCreateRole(true)}
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/50 border border-gray-700/50 border-dashed hover:border-blue-500/50 hover:bg-blue-500/5 transition-all">
                          <Plus size={16} className="text-gray-500" />
                          <span className="text-xs text-gray-400 font-medium">{t('spaces.createRole')}</span>
                        </button>
                      ) : (
                        <div className="bg-gray-800/50 border border-blue-500/30 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold">{editingRoleId ? t('spaces.editRole') : t('spaces.createRole')}</h4>
                            <button onClick={() => { setShowCreateRole(false); setEditingRoleId(null); setNewRoleName(""); setNewRoleColor("#3b82f6"); }} className="p-1 text-gray-500 hover:text-white"><X size={18} /></button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input type="color" value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)}
                              className="w-8 h-8 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                            <input type="text" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder={t('spaces.roleNamePlaceholder')} autoFocus
                              className="flex-1 bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all" />
                          </div>
                          <div className="space-y-1">
                            {(["readChats", "writeChats", "createEvents", "postNews", "inviteMembers", "allowNetworkHelper"] as const).map(perm => {
                              // writeChats disabled when readChats is off
                              const disabled = perm === "writeChats" && !newRolePerms.readChats;
                              const active = disabled ? false : newRolePerms[perm];
                              return (
                                <button key={perm}
                                  disabled={disabled}
                                  onClick={() => {
                                    setNewRolePerms(prev => {
                                      const next = { ...prev, [perm]: !prev[perm] };
                                      // If readChats turned off → also turn off writeChats
                                      if (perm === "readChats" && !next.readChats) next.writeChats = false;
                                      return next;
                                    });
                                  }}
                                  className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-800/50"} bg-gray-900/30`}>
                                  <span className="text-xs text-gray-300">{t(`spaces.perm_${perm}`)}</span>
                                  <div className={`w-8 h-5 rounded-full transition-colors relative ${active ? "bg-blue-600" : "bg-gray-700"}`}>
                                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${active ? "translate-x-3.5" : "translate-x-0.5"}`} />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {/* Netzwerk-Helfer Erklärung */}
                          {newRolePerms.allowNetworkHelper && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5">
                              <p className="text-[11px] text-blue-200/80 leading-relaxed">{t('spaces.networkHelperRoleHint')}</p>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              if (!newRoleName.trim() || !selectedSpace) return;
                              const perms = { ...newRolePerms };
                              if (!perms.readChats) perms.writeChats = false;
                              if (editingRoleId) {
                                // Update existing role
                                updateSpace({
                                  ...selectedSpace,
                                  customRoles: (selectedSpace.customRoles ?? []).map(r =>
                                    r.id === editingRoleId ? { ...r, name: newRoleName.trim(), color: newRoleColor, permissions: perms } : r
                                  ),
                                });
                              } else {
                                const role: CustomRole = {
                                  id: `role-${Date.now().toString(36)}`,
                                  name: newRoleName.trim(),
                                  color: newRoleColor,
                                  permissions: perms,
                                };
                                updateSpace({ ...selectedSpace, customRoles: [...(selectedSpace.customRoles ?? []), role] });
                              }
                              setNewRoleName(""); setNewRoleColor("#3b82f6");
                              setNewRolePerms({ readChats: true, writeChats: true, createEvents: false, postNews: false, inviteMembers: false, allowNetworkHelper: false });
                              setShowCreateRole(false);
                              setEditingRoleId(null);
                            }}
                            disabled={!newRoleName.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-all text-sm">
                            {t('spaces.createRole')}
                          </button>
                        </div>
                      )}

                      {/* Gast-Rolle — immer am Ende, nicht löschbar */}
                      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-gray-600" />
                          <span className="text-sm font-medium text-gray-400">{t('spaces.role_guest')}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-500 ml-auto">{t('spaces.guestDefault')}</span>
                        </div>
                        <div className="space-y-1">
                          {(["readChats", "writeChats", "createEvents", "postNews", "inviteMembers"] as const).map(perm => {
                            const disabled = perm === "writeChats" && !selectedSpace.guestPermissions.readChats;
                            const active = disabled ? false : selectedSpace.guestPermissions[perm];
                            return (
                              <button key={perm} disabled={disabled}
                                onClick={() => {
                                  const gp = { ...selectedSpace.guestPermissions, [perm]: !selectedSpace.guestPermissions[perm] };
                                  if (perm === "readChats" && !gp.readChats) gp.writeChats = false;
                                  updateSpace({ ...selectedSpace, guestPermissions: gp });
                                }}
                                className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-800/50"} bg-gray-900/30`}>
                                <span className="text-[11px] text-gray-400">{t(`spaces.perm_${perm}`)}</span>
                                <div className={`w-8 h-5 rounded-full transition-colors relative ${active ? "bg-blue-600" : "bg-gray-700"}`}>
                                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${active ? "translate-x-3.5" : "translate-x-0.5"}`} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-gray-600 px-0.5 leading-relaxed">{t('spaces.guestRoleHint')}</p>
                      </div>
                    </div>
                  )}

                  {/* Gründer-Rechte übertragen — nur Founder */}
                  {myRole === "founder" && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">{t('spaces.transferFounder')}</h3>
                      <div className="bg-gray-800/50 rounded-xl border border-yellow-900/30 p-4 space-y-3">
                        <p className="text-xs text-gray-400 leading-relaxed">{t('spaces.transferFounderDesc')}</p>
                        <select
                          value={transferToMember ?? ""}
                          onChange={e => setTransferToMember(e.target.value || null)}
                          className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500 transition-all appearance-none cursor-pointer"
                          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: "32px" }}
                        >
                          <option value="">{t('spaces.selectMember')}</option>
                          {selectedSpace.members.filter(m => m.role === "admin").map(m => (
                            <option key={m.aregoId} value={m.aregoId}>{m.displayName}</option>
                          ))}
                        </select>
                        {transferToMember && (
                          <button
                            onClick={() => { if (confirm(t('spaces.transferFounderConfirm'))) handleTransferFounder(transferToMember); }}
                            className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-semibold py-2.5 rounded-xl transition-all text-sm"
                          >
                            {t('spaces.transferFounderButton')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Delete Space — mehrstufig */}
                  {deleteStep === 0 && (
                    <button
                      onClick={() => setDeleteStep(1)}
                      className="w-full flex items-center justify-center gap-2 p-4 text-red-600 font-medium hover:bg-red-500/10 rounded-2xl transition-colors border border-red-900/40"
                    >
                      <Trash2 size={18} />
                      {t('spaces.deleteSpace')}
                    </button>
                  )}

                  {/* Schritt 1: Bestätigung */}
                  {deleteStep === 1 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-bold text-red-400">{t('spaces.deleteConfirmTitle')}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{t('spaces.deleteConfirmDesc')}</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteStep(2)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-xl transition-colors">{t('spaces.deleteYes')}</button>
                        <button onClick={() => setDeleteStep(0)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-xs font-medium rounded-xl hover:bg-gray-700 transition-colors">{t('common.cancel')}</button>
                      </div>
                    </div>
                  )}

                  {/* Schritt 2: Übertragen? */}
                  {deleteStep === 2 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-bold text-yellow-300">{t('spaces.deleteTransferTitle')}</p>
                      <div className="flex gap-2">
                        <button onClick={() => {
                          setDeleteStep(0);
                          // Scroll to transfer section
                          if (myRole === "founder") {
                            setTransferToMember(null);
                          }
                        }} className="flex-1 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-medium rounded-xl transition-colors">{t('spaces.deleteTransferYes')}</button>
                        <button onClick={() => setDeleteStep(3)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-xs font-medium rounded-xl hover:bg-gray-700 transition-colors">{t('spaces.deleteTransferNo')}</button>
                      </div>
                    </div>
                  )}

                  {/* Schritt 3: Endgültig */}
                  {deleteStep === 3 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-bold text-red-400">{t('spaces.deleteFinalTitle')}</p>
                      <div className="flex gap-2">
                        <button onClick={() => { handleDeleteSpace(selectedSpace.id); setDeleteStep(0); }}
                          className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-xl transition-colors">{t('spaces.deleteFinalConfirm')}</button>
                        <button onClick={() => setDeleteStep(0)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-xs font-medium rounded-xl hover:bg-gray-700 transition-colors">{t('common.cancel')}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── WORLD TAB ── */}
            {activeTab === "world" && (
              <div className="flex flex-col items-center text-center py-10 space-y-5">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center text-3xl shadow-lg shadow-emerald-600/20">
                  <Globe size={36} className="text-white" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white">{t('spaces.worldTitle')}</h2>
                  <p className="text-sm text-gray-400 max-w-xs leading-relaxed">{t('spaces.worldDesc')}</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                  {["FSK 6", "FSK 12", "FSK 16", "FSK 18"].map(fsk => (
                    <span key={fsk} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-800 border border-gray-700/50 text-gray-400">{fsk}</span>
                  ))}
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 max-w-xs">
                  <p className="text-xs text-emerald-300/80 leading-relaxed">{t('spaces.worldPrivacy')}</p>
                </div>
                <span className="px-4 py-2 rounded-full bg-gray-800 border border-gray-700/50 text-xs font-medium text-gray-500">{t('spaces.comingSoon')}</span>
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
          <div className="space-y-4">

            {/* Space info — compact */}
            <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-xl p-2.5">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${selectedSpace.color}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{selectedSpace.name}</div>
              </div>
              <span className="text-xs text-gray-500">{selectedSpace.members.length} {t('spaces.members')}</span>
            </div>

            {/* Role + TTL — two dropdowns side by side */}
            <div className="flex gap-3">
              {/* Role dropdown */}
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-gray-400 px-1">{t('spaces.inviteAs')}</label>
                <select
                  value={inviteRole}
                  onChange={e => { const r = e.target.value as SpaceRole; setInviteRole(r); regenerateInvite(r); }}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                >
                  {INVITABLE_ROLES.map(({ role }) => (
                    <option key={role} value={role}>{t(`spaces.role_${role}`)}</option>
                  ))}
                </select>
              </div>

              {/* TTL dropdown + custom input inline */}
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-gray-400 px-1">{t('spaces.inviteTtl')}</label>
                <div className="flex items-center gap-2">
                  <select
                    value={inviteTtlId}
                    onChange={e => {
                      const id = e.target.value;
                      if (id === "unlimited" && isHighRole(inviteRole)) return;
                      setInviteTtlId(id);
                      if (id !== "custom") regenerateInvite(undefined, id);
                    }}
                    className={`bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer ${inviteTtlId === "custom" ? "w-auto shrink-0" : "w-full"}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: "32px" }}
                  >
                    {INVITE_TTLS.map(ttl => {
                      const disabled = ttl.id === "unlimited" && isHighRole(inviteRole);
                      return (
                        <option key={ttl.id} value={ttl.id} disabled={disabled}>
                          {t(`spaces.ttl_${ttl.id}`)}{disabled ? ` (${t('spaces.ttlMaxForRole')})` : ""}
                        </option>
                      );
                    })}
                  </select>
                  {inviteTtlId === "custom" && (
                    <>
                      <input
                        type="number"
                        min={1}
                        max={customTtlUnit === "hours" ? 720 : 365}
                        value={customTtlValue}
                        onChange={e => setCustomTtlValue(e.target.value)}
                        onBlur={() => regenerateInvite(undefined, "custom")}
                        className="w-16 bg-gray-800/50 border border-gray-700 rounded-xl px-2 py-2.5 text-sm text-white text-center focus:outline-none focus:border-blue-500 transition-all"
                      />
                      <select
                        value={customTtlUnit}
                        onChange={e => { setCustomTtlUnit(e.target.value as "hours" | "days"); setTimeout(() => regenerateInvite(undefined, "custom"), 0); }}
                        className="bg-gray-800/50 border border-gray-700 rounded-xl px-2 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: "28px" }}
                      >
                        <option value="hours">{t('spaces.ttlHours')}</option>
                        <option value="days">{t('spaces.ttlDays')}</option>
                      </select>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* High role warning */}
            {isHighRole(inviteRole) && (
              <div className="text-[11px] text-yellow-400/70 px-1">
                {t('spaces.ttlMaxForRole')}
              </div>
            )}

            {/* QR Code */}
            {inviteEncoded && (
              <div className="flex flex-col items-center space-y-3">
                <div className="bg-white p-4 rounded-2xl shadow-xl">
                  <QRCodeSvg value={inviteEncoded} size={200} bgColor="#fff" fgColor="#111827" />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock size={12} />
                  <span>{t('spaces.inviteValidFor', { time: getInviteTtlLabel() })}</span>
                </div>
              </div>
            )}

            {/* Beitritts-Hinweis — compact */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('spaces.joinPreview')}</p>
              <div className="text-xs text-gray-300 space-y-0.5">
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
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Share2 size={18} />
              {t('common.share')}
            </button>

          </div>
        </div>
      </div>
    );
  }

  return null;
}
