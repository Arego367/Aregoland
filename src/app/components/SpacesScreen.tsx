import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import {
  ArrowLeft, Users, LayoutGrid, Calendar, MessageCircle, Settings,
  Shield, QrCode, Plus, ChevronRight, Hash, User, Trash2, Edit2, Share2,
  School, Briefcase, Heart, Home, FolderOpen, Clock, Landmark, Globe, Wrench,
  Info, Check, X, GripVertical, UserPlus, Crown, Eye, ChevronDown,
  Pin, ThumbsUp, MessageSquare, Megaphone, Newspaper, Send, Lock, Layers,
  Paperclip, Mic, Play, Pause, Download, AtSign, Image as ImageIcon, FileText, Square,
  Search, Tag, CheckCircle2, Hammer, Sparkles, Map, ArrowUpDown, SortAsc, EyeOff, Camera, RotateCcw, Copy, LogOut, Phone, Video,
  ClipboardList, Filter
} from "lucide-react";
import { useTranslation } from 'react-i18next';
import { loadIdentity, isChildAccount, type LinkedChild } from "@/app/auth/identity";
import { loadFsk, type FskLevel } from "@/app/auth/fsk";
import { addAbsenceStatus, queueAbsenceReport, getActiveAbsences, getAbsencesBySpace, resolveVisibility, filterByVisibility } from "@/app/lib/member-absence";
import { getEntriesBySpace, addTimetableEntry, updateTimetableEntry, deleteTimetableEntry } from "@/app/lib/timetable";
import { getConfigByChild, addScheduleConfig, updateScheduleConfig, buildDayPlan, getHolidayForDate, getHolidaysBySpace, addHoliday, updateHoliday, deleteHoliday } from "@/app/lib/school-schedule";
import { notifyCancellation } from "@/app/lib/reminder-scheduler";
import type { TimetableEntry, TimetableEntryStatus, ChildScheduleConfig, DayPlanEntry, DayPlanEntryType } from "@/app/types";
import { addTemplate, generateSlots, getTemplatesBySpace, getFreeSlots, countMemberBookings, updateSlotStatus, filterSlotsForMember, addRequest } from "@/app/lib/booking";
import type { AbsenceStatusType, MemberAbsenceStatus, SlotFlexibility, BookingTemplate, BookingSlot } from "@/app/types";
import { loadContacts, removeContact } from "@/app/auth/contacts";
import { Html5Qrcode } from "html5-qrcode";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { registerPublicSpace, unregisterPublicSpace, searchPublicSpaces, fetchPublicTags, maybeHeartbeat, sendJoinRequest, fetchJoinRequests, respondJoinRequest, loadPendingRequests, savePendingRequest, removePendingRequest, sendSpaceSync, redeemFskCode, maybeFskHeartbeat, type PublicSpace, type JoinRequest, type PendingJoinRequest, type SpaceSyncPayload } from "@/app/lib/spaces-api";
import { SeenSet, SpaceVersionStore, MAX_HOP_COUNT, buildDigest, computeBackfill, randomBackfillDelay, type SpaceVersionMeta } from "@/app/lib/gossip";
import QRCodeSvg from "react-qr-code";
import ProfileAvatar from "./ProfileAvatar";
import AppHeader from "./AppHeader";
import aregolandNews from "@/app/data/aregoland-news.json";
import { roadmapSections, type RoadmapStatus } from "@/app/data/roadmap-cards";
import SpaceCallOverlay from "./SpaceCallOverlay";
import { SpaceCallManager, type SpaceCallState, type SpaceCallMode, type SpaceCallParticipant, type CallMediaType } from "@/app/lib/space-call-manager";

const AREGOLAND_OFFICIAL_ID = "__aregoland_official__";

// ── Stabile Settings-Section Komponente (verhindert Re-Mount bei Parent-Rerender) ──

function SettingsSection({ id, icon, title, children, visible = true, isOpen, onToggle }: {
  id: string; icon: React.ReactNode; title: string; children: React.ReactNode;
  visible?: boolean; isOpen: boolean; onToggle: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-800/50 transition-colors"
      >
        <div className="text-gray-400">{icon}</div>
        <span className="text-sm font-semibold text-white flex-1 text-left">{title}</span>
        <ChevronDown size={14} className={`transition-all ${isOpen ? "rotate-180 text-blue-400" : "text-gray-600"}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Types ──

type SpaceTemplate = "family" | "school" | "club" | "work" | "government" | "community" | "custom";
type SpaceRole = "founder" | "admin" | "guest";
type IdentityRule = "real_name" | "nickname" | "nickname_only" | "mixed" | "role_based";

interface SpaceMember {
  aregoId: string;
  displayName: string;
  role: SpaceRole;
  joinedAt?: string;
  spaceNickname?: string;
  useNickname?: boolean;
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
  excludedMemberIds?: string[]; // Moderatoren die sich selbst ausgeschlossen haben (aregoIds)
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
    inviteMembers: boolean;
    removeMembers: boolean;
    manageChats: boolean;
    postNews: boolean;
    createEvents: boolean;
    viewSettings: boolean;
    visibleSettingsSections: string[]; // e.g. ["appearance","tags","visibility","invite","chats","roles"]
    manageCalendar: boolean;
    manageSchedule: boolean;
    reportAbsence: boolean;
    viewAbsenceDetails: boolean;
    manageBookingSlots: boolean;
    sendPushToAll: boolean;
  };
}

interface SpaceSubroom {
  id: string;
  spaceId: string;
  name: string;
  creatorId?: string; // aregoId des Subroom-Erstellers (Moderator)
  moderatorId?: string; // expliziter Moderator (falls nicht der Ersteller)
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
  guestPermissions: { readChats: boolean };
  createdAt: string;
  visibility: "public" | "private";
  inaktivitaets_regel?: "delete" | "transfer";
  fsk: FskLevel;
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
      fsk: s.fsk ?? 18,
      posts: s.posts ?? [],
      channels: s.channels ?? [],
      subrooms: s.subrooms ?? [],
      members: (s.members ?? []).map(m => ({ ...m, joinedAt: m.joinedAt ?? s.createdAt, role: m.role === "member" ? "guest" : m.role })),
      guestPermissions: { readChats: (s as any).guestPermissions?.readChats ?? true },
      customRoles: (s.customRoles ?? []).map((cr: any) => ({
        ...cr,
        permissions: {
          inviteMembers: cr.permissions?.inviteMembers ?? false,
          removeMembers: cr.permissions?.removeMembers ?? false,
          manageChats: cr.permissions?.manageChats ?? false,
          postNews: cr.permissions?.postNews ?? false,
          createEvents: cr.permissions?.createEvents ?? false,
          viewSettings: cr.permissions?.viewSettings ?? false,
          visibleSettingsSections: cr.permissions?.visibleSettingsSections ?? [],
        },
      })),
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
  guestPermissions: { readChats: false },
  createdAt: "2026-04-02T00:00:00.000Z",
  visibility: "public",
  fsk: 6,
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
    readRoles: ["founder", "admin", "guest"],
    writeRoles: ["founder", "admin"],
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

function buildSyncPayload(space: Space): SpaceSyncPayload {
  const appearance = loadAppearance(space.id);
  return {
    space_id: space.id,
    name: space.name,
    description: space.description,
    template: space.template,
    color: space.color,
    identityRule: space.identityRule,
    founderId: space.founderId,
    members: space.members.map(m => ({ aregoId: m.aregoId, displayName: m.displayName, role: m.role, joinedAt: m.joinedAt })),
    channels: space.channels.map(ch => ({ id: ch.id, spaceId: ch.spaceId, name: ch.name, isGlobal: ch.isGlobal, readRoles: ch.readRoles, writeRoles: ch.writeRoles, membersVisible: ch.membersVisible, createdAt: ch.createdAt })),
    customRoles: space.customRoles,
    subrooms: (space.subrooms ?? []).map(sr => ({ id: sr.id, spaceId: sr.spaceId, name: sr.name, creatorId: sr.creatorId, moderatorId: sr.moderatorId, memberIds: sr.memberIds, channels: sr.channels.map(ch => ({ id: ch.id, spaceId: ch.spaceId, name: ch.name, isGlobal: ch.isGlobal, readRoles: ch.readRoles, writeRoles: ch.writeRoles, membersVisible: ch.membersVisible, excludedMemberIds: ch.excludedMemberIds, createdAt: ch.createdAt })), createdAt: sr.createdAt })),
    tags: space.tags ?? [],
    visibility: space.visibility,
    guestPermissions: space.guestPermissions,
    settings: space.settings,
    appearance: (appearance.icon || appearance.banner) ? appearance : undefined,
  };
}

/** Anzeigename eines Mitglieds im Space */
function memberDisplayName(member: SpaceMember, identityRule: IdentityRule): string {
  if (identityRule === "nickname_only") {
    return member.spaceNickname || member.aregoId;
  }
  if (identityRule === "real_name") {
    return member.displayName || member.aregoId;
  }
  // "mixed" / default: Mitglied entscheidet per useNickname
  if (member.useNickname && member.spaceNickname) {
    return member.spaceNickname;
  }
  return member.displayName || member.aregoId;
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
  spaceDesc?: string;
  template: SpaceTemplate;
  role: SpaceRole;
  founderId?: string;
  founderName?: string;
  exp: number;
  n: string;
}

function createInvitePayload(space: Space, role: SpaceRole, ttlMs: number): string {
  const founder = space.members.find(m => m.role === "founder");
  const payload: SpaceInvitePayload = {
    type: "space-invite",
    spaceId: space.id,
    spaceName: space.name,
    spaceDesc: space.description || undefined,
    template: space.template,
    role,
    founderId: space.founderId || undefined,
    founderName: founder?.displayName || undefined,
    exp: Date.now() + ttlMs,
    n: Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, "0")).join(""),
  };
  const json = JSON.stringify(payload);
  return btoa(new TextEncoder().encode(json).reduce((s, b) => s + String.fromCharCode(b), ""));
}

const ROLE_ORDER: SpaceRole[] = ["founder", "admin", "guest"];
const ROLE_COLORS: Record<SpaceRole, { bg: string; text: string }> = {
  founder: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  admin: { bg: "bg-red-500/20", text: "text-red-400" },
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
  { id: "10m", ms: 10 * 60 * 1000 },
  { id: "1h", ms: 60 * 60 * 1000 },
  { id: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "unlimited", ms: 365 * 24 * 60 * 60 * 1000 }, // 1 year as "unlimited"
  { id: "custom", ms: 0 },
];

const INVITABLE_ROLES: { role: SpaceRole; descKey: string }[] = [
  { role: "admin", descKey: "roleDesc_admin" },
  { role: "guest", descKey: "roleDesc_guest" },
];

function isHighRole(r: SpaceRole) { return r === "admin"; }

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

// ── Sortable Tile (dnd-kit) ──

interface SortableTileProps {
  id: string;
  children: React.ReactNode;
}

function SortableTile({ id, children }: SortableTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

// ── Component ──

interface SpacesScreenProps {
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onShowToast?: (text: string, type?: 'info' | 'warning') => void;
  deepLink?: { spaceId: string; tab?: string } | null;
  onDeepLinkConsumed?: () => void;
}

export default function SpacesScreen({ onBack, onOpenProfile, onOpenQRCode, onOpenSettings, onOpenSupport, onShowToast, deepLink, onDeepLinkConsumed }: SpacesScreenProps) {
  const { t } = useTranslation();
  const identity = useMemo(() => loadIdentity(), []);
  const userFsk = useMemo(() => loadFsk(), []);
  const [spaces, setSpaces] = useState<Space[]>(() => {
    const userSpaces = loadSpaces().filter(s => s.id !== AREGOLAND_OFFICIAL_ID);
    const all = [AREGOLAND_OFFICIAL_SPACE, ...userSpaces];
    return applyOrder(all);
  });
  const [view, setView] = useState<"list" | "newMenu" | "templates" | "create" | "detail" | "invite" | "discover" | "scanInvite">("list");
  const [selectedTemplate, setSelectedTemplate] = useState<SpaceTemplate | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);

  // dnd-kit Sensoren für Kachel-Reorder (mit Aktivierungsdistanz damit Klick funktioniert)
  const tileSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

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
  const [activeTab, setActiveTab] = useState<"overview" | "news" | "chats" | "members" | "profile" | "settings" | "world" | "myRooms" | "status" | "timetable">("overview");

  // Kachel-Grid Reihenfolge
  type TileId = "news" | "chats" | "members" | "profile" | "settings" | "world" | "myRooms" | "status" | "timetable";
  const TILE_DEFAULTS: TileId[] = ["news", "chats", "myRooms", "timetable", "status", "members", "profile", "settings", "world"];
  const loadTileOrder = (spaceId: string): TileId[] => {
    try {
      const raw: TileId[] = JSON.parse(localStorage.getItem(`aregoland_space_tiles_${spaceId}`) ?? "[]");
      if (!raw.length) return TILE_DEFAULTS;
      const valid = new Set(TILE_DEFAULTS);
      const filtered = raw.filter(id => valid.has(id));
      for (const d of TILE_DEFAULTS) { if (!filtered.includes(d)) filtered.push(d); }
      return filtered;
    } catch { return TILE_DEFAULTS; }
  };
  const saveTileOrder = (spaceId: string, order: TileId[]) => {
    localStorage.setItem(`aregoland_space_tiles_${spaceId}`, JSON.stringify(order));
  };
  const [tileOrder, setTileOrder] = useState<TileId[]>([]);

  // Settings tag picker
  const [showSettingsTagPicker, setShowSettingsTagPicker] = useState(false);
  const [settingsCustomTag, setSettingsCustomTag] = useState("");

  // Invite
  const [inviteRole, setInviteRole] = useState<SpaceRole>("guest");
  const [inviteTtlId, setInviteTtlId] = useState("24h");
  const [customTtlValue, setCustomTtlValue] = useState("14");
  const [customTtlUnit, setCustomTtlUnit] = useState<"hours" | "days">("days");
  const [inviteEncoded, setInviteEncoded] = useState("");
  const [inviteShortCode, setInviteShortCode] = useState("");
  const [inviteCodeLoading, setInviteCodeLoading] = useState(false);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);
  const [settingsInviteOpen, setSettingsInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setSettingsOpen(prev => ({ ...prev, [key]: !prev[key] }));

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
  const [memberSortAsc, setMemberSortAsc] = useState(true);
  const [memberMgmtSort, setMemberMgmtSort] = useState<"name" | "date">("name");

  // Chats
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelWriteRoles, setChannelWriteRoles] = useState<Set<string>>(new Set(["guest"]));
  const [channelReadRoles, setChannelReadRoles] = useState<Set<string>>(new Set(["guest"]));
  const [channelMembersVisible, setChannelMembersVisible] = useState(true);
  const [openChannel, setOpenChannel] = useState<SpaceChannel | null>(null);
  const [showChannelRoles, setShowChannelRoles] = useState(false);
  const [chatMessages, setChatMessages] = useState<SpaceChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const metaWsRef = useRef<WebSocket | null>(null);
  const seenSetsRef = useRef<Record<string, SeenSet>>({});
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

  // (Overview Widgets entfernt — ersetzt durch Kachel-Grid)

  // Custom Roles
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#3b82f6");
  const [newRolePerms, setNewRolePerms] = useState<CustomRole["permissions"]>({ inviteMembers: false, removeMembers: false, manageChats: false, postNews: false, createEvents: false, viewSettings: false, visibleSettingsSections: [], manageCalendar: false, manageSchedule: false, reportAbsence: false, viewAbsenceDetails: false, manageBookingSlots: false, sendPushToAll: false });
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState(0); // 0=none, 1=confirm, 2=transfer, 3=final
  const [transferToMember, setTransferToMember] = useState<string | null>(null);
  // FSK Antrag
  const [fskAntragInstitution, setFskAntragInstitution] = useState("");
  const [fskAntragWebsite, setFskAntragWebsite] = useState("");
  const [fskAntragEmail, setFskAntragEmail] = useState("");
  const [fskAntragStufe, setFskAntragStufe] = useState<6 | 12 | 16>(6);
  const [fskAntragSent, setFskAntragSent] = useState(false);
  const [fskFreischaltcode, setFskFreischaltcode] = useState("");

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

  // Status Board
  const [statusFilter, setStatusFilter] = useState<AbsenceStatusType | "all">("all");
  const [statusSort, setStatusSort] = useState<"name" | "date">("date");

  // Timetable
  const [timetableDay, setTimetableDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d >= 1 && d <= 5 ? d : 1;
  });
  const [showTimetableForm, setShowTimetableForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [ttSubject, setTtSubject] = useState("");
  const [ttTeacher, setTtTeacher] = useState("");
  const [ttRoom, setTtRoom] = useState("");
  const [ttStart, setTtStart] = useState("08:00");
  const [ttEnd, setTtEnd] = useState("08:45");
  const [ttStatus, setTtStatus] = useState<TimetableEntryStatus>("normal");
  const [ttSubTeacher, setTtSubTeacher] = useState("");
  const [ttSubRoom, setTtSubRoom] = useState("");
  const [ttNote, setTtNote] = useState("");
  const [cancellationCount, setCancellationCount] = useState(0);
  const [showChildScheduleModal, setShowChildScheduleModal] = useState(false);
  const [csChildId, setCsChildId] = useState("");
  const [csOgsStart, setCsOgsStart] = useState("");
  const [csOgsEnd, setCsOgsEnd] = useState("");
  const [csHortStart, setCsHortStart] = useState("");
  const [csHortEnd, setCsHortEnd] = useState("");
  const [csBusArr, setCsBusArr] = useState("");
  const [csBusDep, setCsBusDep] = useState("");
  const [csNotes, setCsNotes] = useState("");
  const [csExistingId, setCsExistingId] = useState<string | null>(null);
  const [dayPlanDate, setDayPlanDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayPlanChildId, setDayPlanChildId] = useState<string | null>(null);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<import("@/app/types").SchoolHoliday | null>(null);
  const [hdTitle, setHdTitle] = useState("");
  const [hdStart, setHdStart] = useState("");
  const [hdEnd, setHdEnd] = useState("");
  const [hdType, setHdType] = useState<"holiday" | "closure" | "teacher_day">("holiday");

  // Absence Report Modal
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [absenceStep, setAbsenceStep] = useState(0);
  const [absenceIsParent, setAbsenceIsParent] = useState(false);
  const [absenceLinkedChildren, setAbsenceLinkedChildren] = useState<LinkedChild[]>([]);
  const [absenceSelectedChild, setAbsenceSelectedChild] = useState<string | null>(null);
  const [absenceType, setAbsenceType] = useState<AbsenceStatusType>("sick");
  const [absenceLabel, setAbsenceLabel] = useState("");
  const [absenceNote, setAbsenceNote] = useState("");
  const [absenceStartDate, setAbsenceStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [absenceEndDate, setAbsenceEndDate] = useState("");
  const [absenceRangeMode, setAbsenceRangeMode] = useState<"today" | "range">("today");

  // Booking Template Creator Modal
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [bookingStep, setBookingStep] = useState(0);
  const [bookingTitle, setBookingTitle] = useState("");
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bookingStartTime, setBookingStartTime] = useState("08:00");
  const [bookingEndTime, setBookingEndTime] = useState("12:00");
  const [bookingSlotDuration, setBookingSlotDuration] = useState(15);
  const [bookingBreakMin, setBookingBreakMin] = useState(5);
  const [bookingSlotFlex, setBookingSlotFlex] = useState<SlotFlexibility>("fixed");
  const [bookingMaxPerMember, setBookingMaxPerMember] = useState(1);

  // Booking Slot Picker (Member view)
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [slotPickerTemplate, setSlotPickerTemplate] = useState<BookingTemplate | null>(null);
  const [slotPickerConfirm, setSlotPickerConfirm] = useState<string | null>(null); // slotId pending confirm

  // Booking Request Form (Member view — flexible/no-slot)
  const [showBookingRequest, setShowBookingRequest] = useState(false);
  const [bookingReqTemplateId, setBookingReqTemplateId] = useState("");
  const [bookingReqTimes, setBookingReqTimes] = useState<string[]>([""]);
  const [bookingReqMessage, setBookingReqMessage] = useState("");

  const openBookingWizard = useCallback(() => {
    setBookingStep(0);
    setBookingTitle("");
    setBookingDate(new Date().toISOString().slice(0, 10));
    setBookingStartTime("08:00");
    setBookingEndTime("12:00");
    setBookingSlotDuration(15);
    setBookingBreakMin(5);
    setBookingSlotFlex("fixed");
    setBookingMaxPerMember(1);
    setShowBookingWizard(true);
  }, []);

  const bookingPreviewSlots = useMemo(() => {
    if (!showBookingWizard) return [];
    return generateSlots(bookingStartTime, bookingEndTime, bookingSlotDuration, bookingBreakMin);
  }, [showBookingWizard, bookingStartTime, bookingEndTime, bookingSlotDuration, bookingBreakMin]);

  const submitBookingTemplate = useCallback(() => {
    if (!selectedSpace || !identity || !bookingTitle.trim()) return;
    addTemplate({
      spaceId: selectedSpace.id,
      title: bookingTitle.trim(),
      createdBy: identity.aregoId,
      date: bookingDate,
      startTime: bookingStartTime,
      endTime: bookingEndTime,
      slotDuration: bookingSlotDuration,
      slotFlex: bookingSlotFlex,
      breakBetween: bookingBreakMin,
      maxBookingsPerMember: bookingMaxPerMember,
    });
    setShowBookingWizard(false);
    if (onShowToast) onShowToast(t("spaces.bookingTemplateCreated"), "info");
  }, [selectedSpace, identity, bookingTitle, bookingDate, bookingStartTime, bookingEndTime, bookingSlotDuration, bookingSlotFlex, bookingBreakMin, bookingMaxPerMember, onShowToast, t]);

  // Space booking templates for member view (memoized)
  const spaceBookingTemplates = useMemo(() => {
    if (!selectedSpace) return [];
    return getTemplatesBySpace(selectedSpace.id);
  }, [selectedSpace, showBookingWizard, showSlotPicker]); // re-derive after wizard/picker closes

  const openSlotPicker = useCallback((tmpl: BookingTemplate) => {
    setSlotPickerTemplate(tmpl);
    setSlotPickerConfirm(null);
    setShowSlotPicker(true);
  }, []);

  const confirmBookSlot = useCallback(() => {
    if (!slotPickerTemplate || !slotPickerConfirm || !identity) return;
    const memberBookings = countMemberBookings(slotPickerTemplate.id, identity.aregoId);
    if (memberBookings >= slotPickerTemplate.maxBookingsPerMember) {
      if (onShowToast) onShowToast(t("spaces.bookingMaxReached"), "error");
      return;
    }
    updateSlotStatus(slotPickerTemplate.id, slotPickerConfirm, "booked", identity.aregoId);
    setShowSlotPicker(false);
    if (onShowToast) onShowToast(t("spaces.bookingBooked"), "info");
  }, [slotPickerTemplate, slotPickerConfirm, identity, onShowToast, t]);

  const openBookingRequestForm = useCallback((templateId: string) => {
    setBookingReqTemplateId(templateId);
    setBookingReqTimes([""]);
    setBookingReqMessage("");
    setShowBookingRequest(true);
  }, []);

  const submitBookingRequest = useCallback(() => {
    if (!identity || !bookingReqTemplateId) return;
    const times = bookingReqTimes.filter(t => t.trim());
    addRequest({
      templateId: bookingReqTemplateId,
      requestedBy: identity.aregoId,
      preferredTimes: times.length > 0 ? times : undefined,
      message: bookingReqMessage.trim() || undefined,
    });
    setShowBookingRequest(false);
    if (onShowToast) onShowToast(t("spaces.bookingRequestSent"), "info");
  }, [identity, bookingReqTemplateId, bookingReqTimes, bookingReqMessage, onShowToast, t]);

  const openAbsenceModal = useCallback(() => {
    // Determine if user is a parent (has linked children)
    try {
      const profiles = JSON.parse(localStorage.getItem("arego_child_profiles") ?? "{}");
      const childIds = Object.keys(profiles);
      if (childIds.length > 0) {
        setAbsenceIsParent(true);
        setAbsenceLinkedChildren(childIds.map(id => ({
          child_id: id,
          fsk_stufe: 0,
          displayName: profiles[id]?.displayName || profiles[id]?.nickname || id.slice(0, 8),
          firstName: profiles[id]?.firstName,
        })));
      } else {
        setAbsenceIsParent(false);
        setAbsenceLinkedChildren([]);
      }
    } catch {
      setAbsenceIsParent(false);
      setAbsenceLinkedChildren([]);
    }
    setAbsenceStep(0);
    setAbsenceSelectedChild(null);
    setAbsenceType("sick");
    setAbsenceLabel("");
    setAbsenceNote("");
    setAbsenceStartDate(new Date().toISOString().slice(0, 10));
    setAbsenceEndDate("");
    setAbsenceRangeMode("today");
    setShowAbsenceModal(true);
  }, []);

  const submitAbsenceReport = useCallback(() => {
    if (!selectedSpace || !identity) return;
    const memberId = absenceIsParent && absenceSelectedChild ? absenceSelectedChild : identity.aregoId;
    const record = {
      memberId,
      spaceId: selectedSpace.id,
      type: absenceType,
      label: absenceType === "other" ? absenceLabel : undefined,
      startDate: absenceRangeMode === "today" ? new Date().toISOString().slice(0, 10) : absenceStartDate,
      endDate: absenceRangeMode === "range" && absenceEndDate ? absenceEndDate : undefined,
      note: absenceNote || undefined,
      reportedBy: identity.aregoId,
      childId: absenceIsParent && absenceSelectedChild ? absenceSelectedChild : undefined,
    };
    try {
      addAbsenceStatus(record);
    } catch {
      queueAbsenceReport(record);
    }
    setShowAbsenceModal(false);
    if (onShowToast) onShowToast(t("spaces.absenceReported"), "info");
  }, [selectedSpace, identity, absenceIsParent, absenceSelectedChild, absenceType, absenceLabel, absenceStartDate, absenceEndDate, absenceRangeMode, absenceNote, onShowToast, t]);

  // Discover — öffentliche Space-Suche
  const [discoverSpaces, setDiscoverSpaces] = useState<PublicSpace[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverSort, setDiscoverSort] = useState<"name" | "mitglieder" | "neueste" | "aktivitaet">("name");
  const [discoverLang, setDiscoverLang] = useState<string>(localStorage.getItem('aregoland_language') ?? 'de');
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [discoverTag, setDiscoverTag] = useState<string | null>(null);
  const [discoverTags, setDiscoverTags] = useState<string[]>([]);

  // Beitrittsanfragen
  const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>(() => loadPendingRequests());
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinRequestSent, setJoinRequestSent] = useState<Set<string>>(new Set());

  // Mitglied-Profil Popup
  const [memberProfile, setMemberProfile] = useState<SpaceMember | null>(null);

  // ── Space Call State ──
  const [spaceCallState, setSpaceCallState] = useState<SpaceCallState>("idle");
  const [spaceCallMode, setSpaceCallMode] = useState<SpaceCallMode>("mesh");
  const [spaceCallMediaType, setSpaceCallMediaType] = useState<CallMediaType>("audio");
  const [spaceCallParticipants, setSpaceCallParticipants] = useState<SpaceCallParticipant[]>([]);
  const [spaceCallLocalStream, setSpaceCallLocalStream] = useState<MediaStream | null>(null);
  const [spaceCallModeratorId, setSpaceCallModeratorId] = useState<string | null>(null);
  const spaceCallManagerRef = useRef<SpaceCallManager | null>(null);

  // Kinderschutz: calls_enabled pruefen
  const callsAllowed = useMemo(() => {
    try {
      const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}");
      if (!id.ist_kind && id.accountType !== "child") return true;
      // Kind-Konto: calls_enabled aus child_settings
      const settings = JSON.parse(localStorage.getItem("aregoland_child_settings") ?? "{}");
      return settings.calls_enabled !== false;
    } catch { return true; }
  }, []);

  const maxCallParticipants = useMemo(() => {
    try {
      const id = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}");
      if (!id.ist_kind && id.accountType !== "child") return Infinity;
      const settings = JSON.parse(localStorage.getItem("aregoland_child_settings") ?? "{}");
      return settings.max_call_participants ?? Infinity;
    } catch { return Infinity; }
  }, []);

  // SpaceCallManager initialisieren
  useEffect(() => {
    const mgr = new SpaceCallManager({
      onStateChange: setSpaceCallState,
      onModeChange: setSpaceCallMode,
      onParticipantsChange: setSpaceCallParticipants,
      onLocalStream: setSpaceCallLocalStream,
      onError: (err) => {
        console.error("[SpaceCall] Fehler:", err);
        if (onShowToast) onShowToast(err, "warning");
      },
      onModeratorChange: setSpaceCallModeratorId,
      onKicked: () => {
        if (onShowToast) onShowToast(t("spaceCall.kicked"), "warning");
      },
      onMutedByModerator: (track) => {
        if (onShowToast) onShowToast(t("spaceCall.mutedByModerator"), "info");
      },
    });
    spaceCallManagerRef.current = mgr;
    return () => { mgr.destroy(); spaceCallManagerRef.current = null; };
  }, []);

  const handleJoinSpaceCall = useCallback((mediaType: CallMediaType) => {
    if (!selectedSpace || !identity || !callsAllowed) return;
    const mgr = spaceCallManagerRef.current;
    if (!mgr || mgr.getState() !== "idle") return;
    // Kinderschutz: max participants check
    // (Server prueft auch, aber Client-Side Gate)
    setSpaceCallMediaType(mediaType);
    mgr.join(selectedSpace.id, identity.aregoId, mediaType);
  }, [selectedSpace, identity, callsAllowed]);

  const handleLeaveSpaceCall = useCallback(() => {
    spaceCallManagerRef.current?.leave();
  }, []);

  const getSpaceCallDisplayName = useCallback((aregoId: string) => {
    if (!selectedSpace) return aregoId;
    const member = selectedSpace.members.find(m => m.aregoId === aregoId);
    if (member) return memberDisplayName(member, selectedSpace.identityRule);
    return aregoId.slice(0, 8);
  }, [selectedSpace]);

  // Support-Chat
  interface SupportMsg { id: string; text: string; fromUser: boolean; issueNumber?: number; timestamp: string }
  const SUPPORT_KEY = 'aregoland_support_messages';
  const loadSupportMsgs = (): SupportMsg[] => { try { return JSON.parse(localStorage.getItem(SUPPORT_KEY) ?? '[]'); } catch { return []; } };
  const saveSupportMsgs = (msgs: SupportMsg[]) => localStorage.setItem(SUPPORT_KEY, JSON.stringify(msgs));
  const [supportMessages, setSupportMessages] = useState<SupportMsg[]>(() => loadSupportMsgs());
  const [supportInput, setSupportInput] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const supportEndRef = useRef<HTMLDivElement>(null);

  const handleSendSupport = async () => {
    if (!supportInput.trim() || !identity || supportSending) return;
    setSupportSending(true);
    const text = supportInput.trim();
    setSupportInput("");

    // Nachricht lokal hinzufügen
    const userMsg: SupportMsg = { id: `sup-${Date.now()}`, text, fromUser: true, timestamp: new Date().toISOString() };
    const updated = [...supportMessages, userMsg];
    setSupportMessages(updated);
    saveSupportMsgs(updated);
    setTimeout(() => supportEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    // An Server senden → GitHub Issue
    try {
      const res = await fetch('/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, arego_id: identity.aregoId }),
      });
      if (res.ok) {
        const data = await res.json();
        // Bestätigung hinzufügen
        const confirmMsg: SupportMsg = {
          id: `sup-confirm-${Date.now()}`,
          text: 'Deine Nachricht wurde als Support-Anfrage weitergeleitet.',
          fromUser: false,
          issueNumber: data.issue_number,
          timestamp: new Date().toISOString(),
        };
        // Issue-Nummer an die Nutzernachricht anhängen
        userMsg.issueNumber = data.issue_number;
        const withConfirm = [...updated.map(m => m.id === userMsg.id ? userMsg : m), confirmMsg];
        setSupportMessages(withConfirm);
        saveSupportMsgs(withConfirm);
        setTimeout(() => supportEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else if (res.status === 429) {
        const rateLimitMsg: SupportMsg = { id: `sup-err-${Date.now()}`, text: 'Langsamer bitte! Warte kurz bevor du weitere Nachrichten sendest.', fromUser: false, timestamp: new Date().toISOString() };
        const withErr = [...updated, rateLimitMsg];
        setSupportMessages(withErr);
        saveSupportMsgs(withErr);
      } else {
        const errMsg: SupportMsg = { id: `sup-err-${Date.now()}`, text: 'Nachricht konnte nicht gesendet werden. Bitte versuche es erneut.', fromUser: false, timestamp: new Date().toISOString() };
        const withErr = [...updated, errMsg];
        setSupportMessages(withErr);
        saveSupportMsgs(withErr);
      }
    } catch {
      const errMsg: SupportMsg = { id: `sup-err-${Date.now()}`, text: 'Server nicht erreichbar. Bitte versuche es später.', fromUser: false, timestamp: new Date().toISOString() };
      const withErr = [...updated, errMsg];
      setSupportMessages(withErr);
      saveSupportMsgs(withErr);
    }
    setSupportSending(false);
  };

  // Scan invite
  const [scanInput, setScanInput] = useState("");
  const inviteScannerRef = useRef<Html5Qrcode | null>(null);
  const inviteScanContainerRef = useRef<HTMLDivElement>(null);
  const [inviteScanning, setInviteScanning] = useState(false);
  const [inviteScanError, setInviteScanError] = useState("");
  const [inviteJoined, setInviteJoined] = useState(false);

  // Roadmap collapsible state
  const [openRoadmap, setOpenRoadmap] = useState<Record<string, boolean>>({ done: false, wip: true, planned: false });
  const toggleRoadmap = (key: string) => setOpenRoadmap(prev => ({ ...prev, [key]: !prev[key] }));

  // Deep-Link: direkt in einen Space + Tab navigieren
  useEffect(() => {
    if (!deepLink) return;
    // Spaces neu laden (könnte gerade per join_response hinzugefügt worden sein)
    const userSpaces = loadSpaces().filter(s => s.id !== AREGOLAND_OFFICIAL_ID);
    const all = [AREGOLAND_OFFICIAL_SPACE, ...userSpaces];
    const ordered = applyOrder(all);
    setSpaces(ordered);
    const target = ordered.find(s => s.id === deepLink.spaceId);
    if (target) {
      setSelectedSpace(target);
      setView("detail");
      setActiveTab((deepLink.tab ?? "overview") as typeof activeTab);
    }
    onDeepLinkConsumed?.();
  }, [deepLink]);

  // Stiller Heartbeat für öffentliche Spaces (alle 3 Tage, für Nutzer unsichtbar)
  useEffect(() => {
    if (!selectedSpace || !identity) return;
    if ((selectedSpace.visibility ?? "private") !== "public") return;
    if (selectedSpace.founderId !== identity.aregoId) return;
    maybeHeartbeat({
      space_id: selectedSpace.id,
      name: selectedSpace.name,
      beschreibung: selectedSpace.description,
      sprache: localStorage.getItem('aregoland_language') ?? 'de',
      tags: selectedSpace.tags ?? [],
      mitgliederzahl: selectedSpace.members.length,
      gruender_id: identity.aregoId,
      inaktivitaets_regel: selectedSpace.inaktivitaets_regel ?? 'delete',
    });
    // FSK-Heartbeat fuer freigeschaltete Spaces
    if (selectedSpace.fsk < 18) {
      maybeFskHeartbeat(selectedSpace.id);
    }
  }, [selectedSpace?.id, selectedSpace?.visibility]);

  // Beitrittsanfragen für Gründer laden wenn Mitglieder-Tab geöffnet
  useEffect(() => {
    if (!selectedSpace || !identity) return;
    if (activeTab !== "members") return;
    if (selectedSpace.founderId !== identity.aregoId) return;
    fetchJoinRequests(identity.aregoId).then(setJoinRequests);
  }, [activeTab, selectedSpace?.id]);

  const loadDiscoverSpaces = useCallback(async () => {
    setDiscoverLoading(true);
    const results = await searchPublicSpaces({
      sprache: discoverLang || undefined,
      sort: discoverSort,
      tag: discoverTag ?? undefined,
      q: discoverSearch.trim() || undefined,
    });
    setDiscoverSpaces(results);
    setDiscoverLoading(false);
  }, [discoverSort, discoverLang, discoverSearch, discoverTag]);

  useEffect(() => {
    if (view === "discover") {
      loadDiscoverSpaces();
      fetchPublicTags().then(setDiscoverTags);
    }
  }, [view, loadDiscoverSpaces]);

  const processInvitePayload = useCallback((encoded: string): boolean => {
    try {
      const json = new TextDecoder().decode(Uint8Array.from(atob(encoded.trim()), c => c.charCodeAt(0)));
      const payload = JSON.parse(json);
      if (payload.type !== "space-invite") return false;
      if (payload.exp && payload.exp < Date.now()) { setInviteScanError("Einladung abgelaufen"); return false; }
      const existing = spaces.find(s => s.id === payload.spaceId);
      if (existing) {
        setSelectedSpace(existing);
        setView("detail");
        return true;
      }
      const tmpl = getTemplate(payload.template ?? "custom");
      const initialMembers: SpaceMember[] = [];
      // Gründer als Mitglied hinzufügen (falls im Payload)
      if (payload.founderId && payload.founderName) {
        initialMembers.push({
          aregoId: payload.founderId,
          displayName: payload.founderName,
          role: "founder",
          joinedAt: new Date().toISOString(),
        });
      }
      // Eigenes Mitglied
      if (identity) {
        initialMembers.push({
          aregoId: identity.aregoId,
          displayName: identity.displayName,
          role: payload.role ?? "guest",
          joinedAt: new Date().toISOString(),
        });
      }
      const newSpace: Space = {
        id: payload.spaceId,
        name: payload.spaceName,
        description: payload.spaceDesc ?? "",
        template: payload.template ?? "custom",
        color: tmpl.gradient,
        identityRule: tmpl.defaultIdentityRule,
        founderId: payload.founderId ?? "",
        members: initialMembers,
        posts: [],
        channels: [],
        subrooms: [],
        customRoles: [],
        tags: [],
        guestPermissions: { readChats: true },
        createdAt: new Date().toISOString(),
        visibility: "private",
        settings: { ...tmpl.defaultSettings },
      };
      const updated = [...spaces, newSpace];
      setSpaces(updated);
      saveSpaces(updated);
      setSelectedSpace(newSpace);
      setView("detail");
      setActiveTab("overview");
      setInviteJoined(true);
      // Toast bei nickname_only Spaces
      if (newSpace.identityRule === "nickname_only") {
        onShowToast?.(t('spaces.nicknameOnlyJoinHint'), "info");
      }
      return true;
    } catch { return false; }
  }, [spaces, identity]);

  // Registry-basierte Einladung einlösen (Kurzcode → Server-Lookup)
  const redeemInviteCode = useCallback(async (code: string): Promise<boolean> => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4 || clean.length > 8) return false;
    try {
      const res = await fetch(`/invite/${encodeURIComponent(clean)}`);
      if (!res.ok) {
        if (res.status === 404) setInviteScanError(t('spaces.inviteCodeInvalid'));
        return false;
      }
      const data = await res.json();
      // Bereits Mitglied?
      const existing = spaces.find(s => s.id === data.spaceId);
      if (existing) {
        setSelectedSpace(existing);
        setView("detail");
        onShowToast?.(t('spaces.alreadyMember'), "info");
        return true;
      }
      // Beitrittsanfrage senden
      if (identity && data.founderId) {
        const ok = await sendJoinRequest({
          user_id: identity.aregoId,
          user_name: identity.displayName,
          space_id: data.spaceId,
          gruender_id: data.founderId,
        });
        if (ok) {
          savePendingRequest({ space_id: data.spaceId, space_name: data.spaceName ?? "Space", gruender_id: data.founderId, sent_at: new Date().toISOString() });
          onShowToast?.(t('spaces.joinRequestSent'), "info");
          setView("list");
          return true;
        }
      }
      // Fallback: Space direkt lokal erstellen (wie bisher)
      const tmpl = getTemplate((data.template ?? "custom") as SpaceTemplate);
      const initialMembers: SpaceMember[] = [];
      if (data.founderId && data.founderName) {
        initialMembers.push({ aregoId: data.founderId, displayName: data.founderName, role: "founder", joinedAt: new Date().toISOString() });
      }
      if (identity) {
        initialMembers.push({ aregoId: identity.aregoId, displayName: identity.displayName, role: (data.role ?? "guest") as SpaceRole, joinedAt: new Date().toISOString() });
      }
      const newSpace: Space = {
        id: data.spaceId, name: data.spaceName ?? "Space", description: "", template: (data.template ?? "custom") as SpaceTemplate,
        color: tmpl.gradient, identityRule: tmpl.defaultIdentityRule, founderId: data.founderId ?? "",
        members: initialMembers, posts: [], channels: [], subrooms: [], customRoles: [], tags: [],
        guestPermissions: { readChats: true }, createdAt: new Date().toISOString(), visibility: "private",
        settings: { ...tmpl.defaultSettings },
      };
      const updated = [...spaces, newSpace];
      setSpaces(updated); saveSpaces(updated);
      setSelectedSpace(newSpace); setView("detail"); setActiveTab("overview"); setInviteJoined(true);
      return true;
    } catch { return false; }
  }, [spaces, identity, t]);

  const handleScanInvite = async () => {
    if (!scanInput.trim()) return;
    // Versuche zuerst Registry-Lookup (Kurzcode)
    const redeemed = await redeemInviteCode(scanInput);
    if (redeemed) return;
    // Fallback: altes Base64-Payload-Format
    if (!processInvitePayload(scanInput)) {
      setInviteScanError(t('spaces.inviteCodeInvalid'));
    }
  };

  const startInviteScanner = useCallback(async () => {
    if (inviteScannerRef.current) return;
    setInviteScanError("");
    setInviteJoined(false);
    try {
      const cameras = await Promise.race([
        Html5Qrcode.getCameras(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
      ]);
      if (!cameras || cameras.length === 0) {
        setInviteScanError("Keine Kamera gefunden");
        return;
      }
      const scanner = new Html5Qrcode("invite-scan-region");
      inviteScannerRef.current = scanner;
      await Promise.race([
        scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decoded) => {
            scanner.stop().catch(() => {});
            inviteScannerRef.current = null;
            setInviteScanning(false);
            // Registry-Lookup zuerst, dann Base64-Fallback
            const redeemed = await redeemInviteCode(decoded);
            if (!redeemed && !processInvitePayload(decoded)) {
              setInviteScanError(t('spaces.inviteCodeInvalid'));
            }
          },
          () => {}
        ),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      setInviteScanning(true);
    } catch {
      if (inviteScannerRef.current) {
        inviteScannerRef.current.stop().catch(() => {});
        inviteScannerRef.current = null;
      }
      setInviteScanError("Kamera konnte nicht gestartet werden");
    }
  }, [processInvitePayload]);

  const stopInviteScanner = useCallback(() => {
    inviteScannerRef.current?.stop().catch(() => {});
    inviteScannerRef.current = null;
    setInviteScanning(false);
  }, []);

  // Scanner starten/stoppen wenn View wechselt
  useEffect(() => {
    if (view === "scanInvite") {
      setScanInput("");
      setInviteScanError("");
      setInviteJoined(false);
      startInviteScanner();
    }
    return () => { if (view === "scanInvite") stopInviteScanner(); };
  }, [view]);

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
    const myLevel = userFsk?.level ?? 18;

    // FSK-Filter: nur Spaces anzeigen deren FSK <= eigene Stufe
    result = result.filter(s => (s.fsk ?? 18) <= myLevel);

    // When searching, also include public spaces from localStorage (simulated discovery)
    if (searchQuery.trim()) {
      try {
        const allStored: Space[] = JSON.parse(localStorage.getItem(SPACES_KEY) ?? "[]");
        const myIds = new Set(spaces.map(s => s.id));
        const publicExtras = allStored.filter(s => !myIds.has(s.id) && (s.visibility ?? "private") === "public" && (s.fsk ?? 18) <= myLevel);
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
      guestPermissions: { readChats: true },
      createdAt: new Date().toISOString(),
      visibility: "private",
      fsk: userFsk?.level ?? 6,
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
    // Gossip: Version inkrementieren + Probe broadcasten
    if (identity) {
      const myRole = updated.members.find(m => m.aregoId === identity.aregoId)?.role ?? "guest";
      const newMeta = SpaceVersionStore.increment(updated.id, identity.aregoId, myRole);
      if (metaWsRef.current?.readyState === WebSocket.OPEN) {
        metaWsRef.current.send(JSON.stringify({ type: "space-version-probe", spaceId: updated.id, ...newMeta, responderId: identity.aregoId }));
      }
    }
  };

  const handleChangeRole = (aregoId: string, newRole: SpaceRole) => {
    if (!selectedSpace || !identity) return;
    const member = selectedSpace.members.find(m => m.aregoId === aregoId);
    if (!member) return;
    const oldRole = member.role;
    const roleName = newRole;

    // Mitgliederliste aktualisieren
    const updatedMembers = selectedSpace.members.map(m => m.aregoId === aregoId ? { ...m, role: newRole } : m);

    // Automatischer Neuigkeiten-Post
    const rolePost: SpacePost = {
      id: `post-${Date.now().toString(36)}`,
      authorId: identity.aregoId,
      authorName: identity.displayName,
      authorRole: (selectedSpace.members.find(m => m.aregoId === identity.aregoId)?.role ?? "guest") as SpaceRole,
      title: `Rolle geändert`,
      text: `${member.displayName} hat die Rolle „${roleName}" erhalten.`,
      badge: "announcement" as const,
      pinned: false,
      upvotes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };

    const updated = {
      ...selectedSpace,
      members: updatedMembers,
      posts: [...(selectedSpace.posts ?? []), rolePost],
    };
    updateSpace(updated);
    onShowToast?.("Änderung gespeichert", "info");
    setEditingMember(null);

    // Toast an betroffenes Mitglied senden (via space_sync)
    if (aregoId !== identity.aregoId) {
      sendSpaceSync(aregoId, buildSyncPayload(updated)).catch(() => {});
    }
  };

  const handleRemoveMember = (aregoId: string) => {
    if (!selectedSpace) return;
    const updated = {
      ...selectedSpace,
      members: selectedSpace.members.filter(m => m.aregoId !== aregoId),
    };
    updateSpace(updated);
    onShowToast?.("Änderung gespeichert", "info");
  };

  const registerInviteToRegistry = async (space: Space, role: SpaceRole, ttlMs: number) => {
    if (!identity) return;
    setInviteCodeLoading(true);
    setInviteShortCode("");
    try {
      const expiresAt = ttlMs >= 365 * 24 * 60 * 60 * 1000 ? null : new Date(Date.now() + ttlMs).toISOString();
      const res = await fetch('/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceId: space.id,
          spaceName: space.name,
          role,
          founderId: identity.aregoId,
          founderName: identity.displayName,
          expiresAt,
          singleUse: false,
        }),
      });
      if (res.ok) {
        const { code } = await res.json();
        setInviteShortCode(code);
        // QR enthält nur den Kurzcode
        setInviteEncoded(code);
      }
    } catch { /* server unreachable */ }
    setInviteCodeLoading(false);
  };

  const handleOpenInvite = () => {
    if (!selectedSpace) return;
    setSettingsInviteOpen(true);
    setActiveTab("settings");
    registerInviteToRegistry(selectedSpace, inviteRole, getInviteTtlMs());
  };

  const regenerateInvite = (role?: SpaceRole, ttlId?: string) => {
    if (!selectedSpace) return;
    const r = role ?? inviteRole;
    const oldId = ttlId ?? inviteTtlId;
    let finalTtlId = oldId;
    if (isHighRole(r) && (oldId === "unlimited")) finalTtlId = "30d";
    if (ttlId !== finalTtlId) setInviteTtlId(finalTtlId);
    const ms = finalTtlId === "custom"
      ? (customTtlUnit === "hours"
          ? parseInt(customTtlValue || "1") * 60 * 60 * 1000
          : parseInt(customTtlValue || "1") * 24 * 60 * 60 * 1000)
      : INVITE_TTLS.find(t => t.id === finalTtlId)?.ms ?? 24 * 60 * 60 * 1000;
    registerInviteToRegistry(selectedSpace, r, ms);
  };

  const handleCreatePost = () => {
    if (!selectedSpace || !identity || !postTitle.trim()) return;
    if (postBadge === "event" && !postEventDate) return;
    const myRole = selectedSpace.members.find(m => m.aregoId === identity.aregoId)?.role ?? "guest";
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
    const space = spaces.find(s => s.id === id);
    if (space?.visibility === "public") {
      unregisterPublicSpace(id).catch(() => {});
    }
    const updated = spaces.filter(s => s.id !== id);
    setSpaces(updated);
    saveSpaces(updated);
    setView("list");
    setSelectedSpace(null);
    // Zugehörige Daten bereinigen
    try {
      // Appearance
      const allApp = JSON.parse(localStorage.getItem("aregoland_space_appearance") ?? "{}");
      delete allApp[id];
      localStorage.setItem("aregoland_space_appearance", JSON.stringify(allApp));
      // Chat-Messages
      const allChats: Record<string, unknown> = JSON.parse(localStorage.getItem("aregoland_space_chats") ?? "{}");
      for (const key of Object.keys(allChats)) { if (key.includes(id)) delete allChats[key]; }
      localStorage.setItem("aregoland_space_chats", JSON.stringify(allChats));
      // Tile-Order
      localStorage.removeItem(`aregoland_space_tiles_${id}`);
      // Version
      const allVer = JSON.parse(localStorage.getItem("aregoland_space_versions") ?? "{}");
      delete allVer[id];
      localStorage.setItem("aregoland_space_versions", JSON.stringify(allVer));
      // Blocklist: verhindert dass Gossip-Sync den Space wieder anlegt
      const blocked: string[] = JSON.parse(localStorage.getItem("aregoland_deleted_spaces") ?? "[]");
      if (!blocked.includes(id)) { blocked.push(id); localStorage.setItem("aregoland_deleted_spaces", JSON.stringify(blocked)); }
    } catch { /* ignore */ }
  };

  // ── WebSocket für Space-Chat (mit Gossip Protocol) ──

  const connectToChannel = useCallback((channel: SpaceChannel) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    // SeenSet initialisieren / hydrieren
    if (!seenSetsRef.current[channel.id]) {
      seenSetsRef.current[channel.id] = new SeenSet();
    }
    const seenSet = seenSetsRef.current[channel.id];
    const existingMsgs = loadSpaceChatMessages(channel.id);
    seenSet.hydrate(existingMsgs.map(m => m.id));

    const roomId = `space-chat:${channel.spaceId}:${channel.id}`;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws-signal`);

    const processIncomingMsg = (msg: SpaceChatMessage) => {
      if (seenSet.has(msg.id)) return;
      seenSet.add(msg.id);
      saveSpaceChatMessage(channel.id, msg);
      setChatMessages(prev => [...prev, msg]);
      if (selectedSpace) {
        const updated = {
          ...selectedSpace,
          channels: selectedSpace.channels.map(ch =>
            ch.id === channel.id ? { ...ch, lastMessage: msg.text, lastMessageTime: msg.timestamp } : ch
          ),
        };
        updateSpace(updated);
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", roomId }));
      // Offline Catch-up: Digest senden
      if (identity) {
        const digest = buildDigest(channel.id, existingMsgs, identity.aregoId);
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "space-chat-digest", ...digest }));
          }
        }, 300);
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "joined" || data.type === "peer_joined" || data.type === "peer_left") return;

        // ── Direkte Nachricht ──
        if (data.type === "space-chat-msg" && data.msg) {
          const msg = data.msg as SpaceChatMessage;
          processIncomingMsg(msg);
          // Gossip: an andere Peers weiterleiten
          if (ws.readyState === WebSocket.OPEN && identity) {
            ws.send(JSON.stringify({ type: "space-chat-gossip", msg, hopCount: 1, originPeerId: identity.aregoId }));
          }
          return;
        }

        // ── Gossip-Nachricht ──
        if (data.type === "space-chat-gossip" && data.msg) {
          const msg = data.msg as SpaceChatMessage;
          if (seenSet.has(msg.id)) return; // Bereits gesehen
          processIncomingMsg(msg);
          // Weiterleiten wenn hopCount < MAX
          if ((data.hopCount ?? 0) < MAX_HOP_COUNT && ws.readyState === WebSocket.OPEN && identity) {
            ws.send(JSON.stringify({ type: "space-chat-gossip", msg, hopCount: (data.hopCount ?? 0) + 1, originPeerId: data.originPeerId }));
          }
          return;
        }

        // ── Digest von anderem Peer → Backfill senden ──
        if (data.type === "space-chat-digest" && data.requesterId && identity && data.requesterId !== identity.aregoId) {
          const delay = randomBackfillDelay();
          setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const myMsgs = loadSpaceChatMessages(channel.id);
            const missing = computeBackfill(myMsgs, data.lastMessageTimestamp);
            if (missing.length > 0) {
              ws.send(JSON.stringify({ type: "space-chat-backfill", channelId: channel.id, messages: missing, targetId: data.requesterId }));
            }
          }, delay);
          return;
        }

        // ── Backfill empfangen ──
        if (data.type === "space-chat-backfill" && data.messages && identity && data.targetId === identity.aregoId) {
          for (const msg of data.messages as SpaceChatMessage[]) {
            processIncomingMsg(msg);
          }
          return;
        }

        // ── Chunked file transfer (existierend) ──
        if (data.type === "space-chat-chunk") {
          // Chunks werden vom bestehenden Handler verarbeitet
          return;
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [selectedSpace, identity]);

  // ── Space-Meta WebSocket (Version-Sync, unabhängig vom Chat-Channel) ──

  const connectSpaceMeta = useCallback((spaceId: string) => {
    if (metaWsRef.current) { metaWsRef.current.close(); metaWsRef.current = null; }

    const roomId = `space-meta:${spaceId}`;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws-signal`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", roomId }));
      // Version-Probe senden
      if (identity) {
        const meta = SpaceVersionStore.get(spaceId);
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "space-version-probe", spaceId, ...meta, responderId: identity.aregoId }));
          }
        }, 200);
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "joined" || data.type === "peer_joined" || data.type === "peer_left") return;

        // ── Version-Probe von anderem Peer ──
        if (data.type === "space-version-probe" && data.spaceId === spaceId && identity && data.responderId !== identity.aregoId) {
          const myMeta = SpaceVersionStore.get(spaceId);
          const incomingMeta: SpaceVersionMeta = { version: data.version ?? 0, lastChangedBy: data.lastChangedBy ?? "", lastChangedRole: data.lastChangedRole ?? "guest", lastChangedAt: data.lastChangedAt ?? "" };
          // Wenn ich eine neuere Version habe → meinen Probe als Antwort senden
          if (myMeta.version > incomingMeta.version && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "space-version-probe", spaceId, ...myMeta, responderId: identity.aregoId }));
          }
          // Wenn der andere eine neuere Version hat → Sync anfordern
          if (SpaceVersionStore.shouldAccept(spaceId, incomingMeta)) {
            ws.send(JSON.stringify({ type: "space-version-sync-request", spaceId, requesterId: identity.aregoId, myVersion: myMeta.version }));
          }
          return;
        }

        // ── Sync-Request von anderem Peer → Daten senden ──
        if (data.type === "space-version-sync-request" && data.spaceId === spaceId && identity && data.requesterId !== identity.aregoId) {
          const sp = spaces.find(s => s.id === spaceId);
          if (sp) {
            const payload = buildSyncPayload(sp);
            payload.versionMeta = SpaceVersionStore.get(spaceId);
            ws.send(JSON.stringify({ type: "space-version-sync", spaceId, payload, versionMeta: payload.versionMeta }));
          }
          return;
        }

        // ── Sync-Daten empfangen ──
        if (data.type === "space-version-sync" && data.spaceId === spaceId && data.payload && data.versionMeta) {
          const incomingMeta = data.versionMeta as SpaceVersionMeta;
          if (!SpaceVersionStore.shouldAccept(spaceId, incomingMeta)) return;
          // Daten mergen
          const p = data.payload;
          const existing = spaces.find(s => s.id === spaceId);
          const merged: Space = {
            ...(existing ?? {} as Space),
            id: spaceId,
            name: p.name ?? existing?.name ?? "",
            description: p.description ?? "",
            template: p.template ?? existing?.template ?? "community",
            color: p.color ?? existing?.color ?? "from-purple-600 to-fuchsia-500",
            identityRule: p.identityRule ?? "nickname",
            founderId: p.founderId ?? "",
            members: p.members ?? existing?.members ?? [],
            posts: existing?.posts ?? [],
            channels: p.channels ?? existing?.channels ?? [],
            subrooms: existing?.subrooms ?? [],
            customRoles: p.customRoles ?? [],
            tags: p.tags ?? [],
            guestPermissions: p.guestPermissions ?? { readChats: true },
            visibility: p.visibility ?? "private",
            settings: p.settings ?? existing?.settings ?? {},
            createdAt: existing?.createdAt ?? new Date().toISOString(),
          } as Space;
          updateSpace(merged);
          SpaceVersionStore.set(spaceId, incomingMeta);
          // Appearance
          if (p.appearance) {
            saveAppearance(spaceId, p.appearance);
          }
          return;
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => ws.close();
    metaWsRef.current = ws;
  }, [spaces, identity]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (metaWsRef.current) { metaWsRef.current.close(); metaWsRef.current = null; }
    };
  }, []);

  // Space-Meta WebSocket verbinden wenn ein Space geöffnet wird
  useEffect(() => {
    if (view === "detail" && selectedSpace && selectedSpace.id !== AREGOLAND_OFFICIAL_ID) {
      connectSpaceMeta(selectedSpace.id);
    }
    return () => {
      if (metaWsRef.current) { metaWsRef.current.close(); metaWsRef.current = null; }
    };
  }, [view, selectedSpace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setShowChannelRoles(false);
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
    // Gossip: zum SeenSet hinzufügen bevor gesendet wird
    const seenSet = seenSetsRef.current[msg.channelId];
    if (seenSet) seenSet.add(msg.id);
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
      onShowToast?.("Änderung gespeichert", "info");
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
      onShowToast?.("Änderung gespeichert", "info");
    }
    setChannelName("");
    setChannelWriteRoles(new Set(["guest"]));
    setChannelReadRoles(new Set(["guest"]));
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
    setNewRolePerms({ manageCalendar: false, manageSchedule: false, reportAbsence: false, viewAbsenceDetails: false, manageBookingSlots: false, sendPushToAll: false, ...cr.permissions, visibleSettingsSections: [...(cr.permissions.visibleSettingsSections ?? [])] });
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
    onShowToast?.("Änderung gespeichert", "info");
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
      readRoles: [],
      writeRoles: [],
      createdAt: new Date().toISOString(),
      unreadCount: 0,
    };
    const subroom: SpaceSubroom = {
      id: subroomId,
      spaceId: selectedSpace.id,
      name: subroomName.trim(),
      creatorId: identity?.aregoId,
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
      onOpenSupport={onOpenSupport}
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
          onOpenSupport={onOpenSupport}
          action={{ icon: Plus, label: t('spaces.newSpace'), onClick: () => setView("newMenu") }}
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

  // ── NEW SPACE MENU (3 Optionen) ──
  if (view === "newMenu") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader(t('spaces.newSpace'), () => setView("list"))}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3 max-w-lg mx-auto">
            {/* Space erstellen */}
            <button
              onClick={() => setView("templates")}
              className="w-full flex items-center gap-4 p-5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-2xl transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shrink-0">
                <Plus size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">Space erstellen</div>
                <div className="text-xs text-gray-500 mt-0.5">Wähle eine Vorlage oder erstelle einen benutzerdefinierten Space</div>
              </div>
              <ChevronRight size={18} className="text-gray-600 shrink-0" />
            </button>

            {/* Spaces entdecken */}
            <button
              onClick={() => setView("discover")}
              className="w-full flex items-center gap-4 p-5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-2xl transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-500 flex items-center justify-center shrink-0">
                <Search size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">Spaces entdecken</div>
                <div className="text-xs text-gray-500 mt-0.5">Öffentliche Spaces durchsuchen und beitreten</div>
              </div>
              <ChevronRight size={18} className="text-gray-600 shrink-0" />
            </button>

            {/* Einladung annehmen */}
            <button
              onClick={() => setView("scanInvite")}
              className="w-full flex items-center gap-4 p-5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-2xl transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                <QrCode size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">Einladung annehmen</div>
                <div className="text-xs text-gray-500 mt-0.5">QR-Code scannen oder Einladungscode eingeben</div>
              </div>
              <ChevronRight size={18} className="text-gray-600 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── DISCOVER — Öffentliche Spaces ──
  if (view === "discover") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader("Spaces entdecken", () => setView("newMenu"))}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4 max-w-lg mx-auto">

            {/* Suchfeld */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={discoverSearch}
                onChange={e => setDiscoverSearch(e.target.value)}
                placeholder="Space suchen…"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            {/* Filter-Leiste */}
            <div className="flex gap-2 flex-wrap">
              {/* Sprache */}
              <select
                value={discoverLang}
                onChange={e => setDiscoverLang(e.target.value)}
                className="bg-gray-800/50 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: "24px" }}
              >
                <option value="">Alle Sprachen</option>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
                <option value="lt">Lietuvių</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="it">Italiano</option>
                <option value="pl">Polski</option>
                <option value="nl">Nederlands</option>
                <option value="pt">Português</option>
                <option value="ru">Русский</option>
                <option value="uk">Українська</option>
              </select>

              {/* Sortierung */}
              <select
                value={discoverSort}
                onChange={e => setDiscoverSort(e.target.value as typeof discoverSort)}
                className="bg-gray-800/50 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: "24px" }}
              >
                <option value="name">A–Z</option>
                <option value="mitglieder">Mitglieder</option>
                <option value="neueste">Neueste</option>
                <option value="aktivitaet">Aktivität</option>
              </select>

              {/* Tag-Filter */}
              <select
                value={discoverTag ?? ""}
                onChange={e => setDiscoverTag(e.target.value || null)}
                className="bg-gray-800/50 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: "24px" }}
              >
                <option value="">Alle Tags</option>
                {discoverTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </div>

            {/* Ergebnisse */}
            {discoverLoading ? (
              <div className="text-center py-12 text-gray-500 text-sm">Lade…</div>
            ) : discoverSpaces.length === 0 ? (
              <div className="text-center py-12">
                <Globe size={32} className="mx-auto text-gray-700 mb-3" />
                <p className="text-sm text-gray-500">Keine öffentlichen Spaces gefunden</p>
                <p className="text-xs text-gray-600 mt-1">Versuche andere Filter oder erstelle selbst einen Space</p>
              </div>
            ) : (
              <div className="space-y-2">
                {discoverSpaces.map(ps => {
                  const alreadyJoined = spaces.some(s => s.id === ps.space_id);
                  return (
                    <div key={ps.space_id}
                      className="flex items-center gap-3 p-4 bg-gray-800/50 border border-gray-700/50 rounded-2xl"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-500 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-white">{ps.name[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{ps.name}</div>
                        {ps.beschreibung && <div className="text-[11px] text-gray-500 truncate">{ps.beschreibung}</div>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-600">{ps.mitgliederzahl} Mitglieder</span>
                          {ps.tags.length > 0 && (
                            <span className="text-[10px] text-gray-600">• {ps.tags.slice(0, 2).join(", ")}</span>
                          )}
                        </div>
                      </div>
                      {alreadyJoined ? (
                        <span className="text-[10px] text-green-400 font-bold px-2 py-1 bg-green-500/10 rounded-lg">Beigetreten</span>
                      ) : pendingRequests.some(r => r.space_id === ps.space_id) || joinRequestSent.has(ps.space_id) ? (
                        <span className="text-[10px] text-amber-400 font-bold px-2 py-1 bg-amber-500/10 rounded-lg">Angefragt</span>
                      ) : (
                        <button
                          onClick={async () => {
                            if (!identity) return;
                            const ok = await sendJoinRequest({
                              user_id: identity.aregoId,
                              user_name: identity.displayName,
                              space_id: ps.space_id,
                              gruender_id: ps.gruender_id,
                            });
                            if (ok) {
                              savePendingRequest({
                                space_id: ps.space_id,
                                space_name: ps.name,
                                gruender_id: ps.gruender_id,
                                sent_at: new Date().toISOString(),
                              });
                              setPendingRequests(loadPendingRequests());
                              setJoinRequestSent(prev => new Set([...prev, ps.space_id]));
                            }
                          }}
                          className="text-xs font-bold text-blue-400 px-3 py-1.5 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition-colors"
                        >
                          Beitreten
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── SCAN INVITE — Einladung annehmen (Kamera + Code-Eingabe) ──
  if (view === "scanInvite") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader("Einladung annehmen", () => { stopInviteScanner(); setView("newMenu"); })}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4 max-w-lg mx-auto">

            {/* Kamera-Scanner */}
            <div className="relative rounded-2xl overflow-hidden bg-black border border-gray-700/50">
              <div
                id="invite-scan-region"
                ref={inviteScanContainerRef}
                className="w-full aspect-square max-h-72"
              />
              {!inviteScanning && !inviteScanError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80">
                  <Camera size={32} className="text-gray-500 mb-2" />
                  <p className="text-xs text-gray-500">Kamera wird gestartet…</p>
                </div>
              )}
              {inviteScanError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 gap-3">
                  <p className="text-sm text-red-400 text-center px-4">{inviteScanError}</p>
                  <button
                    onClick={() => { setInviteScanError(""); startInviteScanner(); }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-xl text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <RotateCcw size={14} /> Nochmal versuchen
                  </button>
                </div>
              )}
            </div>

            {/* Trennlinie */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-700/50" />
              <span className="text-xs text-gray-600">oder Code eingeben</span>
              <div className="flex-1 h-px bg-gray-700/50" />
            </div>

            {/* Code-Eingabe */}
            <div className="flex gap-2">
              <input
                type="text"
                value={scanInput}
                onChange={e => { setScanInput(e.target.value); setInviteScanError(""); }}
                placeholder="Einladungscode einfügen…"
                className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
              />
              <button
                onClick={handleScanInvite}
                disabled={!scanInput.trim()}
                className="px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center"
              >
                <Check size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── TEMPLATE SELECTION ──
  if (view === "templates") {
    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {renderHeader(t('spaces.chooseTemplate'), () => setView("newMenu"))}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {[...TEMPLATES].sort((a, b) => a.id === "custom" ? -1 : b.id === "custom" ? 1 : 0).map((tmpl) => {
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
    type OfficialTab = "overview" | "news" | "about" | "support" | "world";
    const currentOfficialTab = (["overview", "news", "about", "support", "world"].includes(activeTab as string) ? activeTab : "overview") as OfficialTab;
    const officialTabLabel: Record<OfficialTab, string> = { overview: "Aregoland", news: "Neuigkeiten", about: "Über", support: "Support", world: "World" };

    // Kachel-Reihenfolge
    type OfficialTileId = "news" | "about" | "support" | "world";
    const OFFICIAL_TILE_DEFAULTS: OfficialTileId[] = ["news", "about", "support", "world"];
    const loadOfficialTileOrder = (): OfficialTileId[] => {
      try {
        const raw: OfficialTileId[] = JSON.parse(localStorage.getItem("aregoland_official_tiles") ?? "[]");
        if (!raw.length) return OFFICIAL_TILE_DEFAULTS;
        const valid = new Set(OFFICIAL_TILE_DEFAULTS);
        const filtered = raw.filter(id => valid.has(id));
        for (const d of OFFICIAL_TILE_DEFAULTS) { if (!filtered.includes(d)) filtered.push(d); }
        return filtered;
      } catch { return OFFICIAL_TILE_DEFAULTS; }
    };

    const officialTileConfig: Record<OfficialTileId, { icon: typeof Newspaper; gradient: string; label: string; desc: string; activity?: string }> = {
      news: { icon: Newspaper, gradient: "from-amber-600 to-orange-500", label: "Neuigkeiten", desc: "Updates & Ankündigungen", activity: `${(aregolandNews as unknown[]).length} Einträge` },
      about: { icon: Heart, gradient: "from-pink-600 to-rose-500", label: "Über", desc: "Hintergrund, Roadmap, Spenden" },
      support: { icon: MessageCircle, gradient: "from-blue-600 to-cyan-500", label: "Support", desc: "KI-Assistent", activity: "Bald verfügbar" },
      world: { icon: Globe, gradient: "from-cyan-600 to-teal-500", label: "World", desc: "Öffentlicher Feed", activity: "Bald verfügbar" },
    };

    return (
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {/* Header */}
        <div className={`relative ${currentOfficialTab === "overview" ? "h-36" : "h-20"} shrink-0 overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 transition-all`}>
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 to-gray-900 pointer-events-none" />
          <button
            onClick={() => currentOfficialTab === "overview" ? setView("list") : setActiveTab("overview" as typeof activeTab)}
            className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white z-20"
          >
            <ArrowLeft size={20} />
          </button>
          {currentOfficialTab === "overview" && (
            <div className="absolute inset-0 flex items-center justify-center z-0 -mt-4">
              <img src="/aregoland_space_icon_notxt.svg" alt="Aregoland" className="w-20 h-20 rounded-xl object-cover" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 p-4 w-full z-10">
            <h1 className={`font-bold ${currentOfficialTab === "overview" ? "text-2xl" : "text-lg ml-10"}`}>
              {officialTabLabel[currentOfficialTab]}
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">

          {/* Kachel-Übersicht */}
          {currentOfficialTab === "overview" && (() => {
            const tiles = loadOfficialTileOrder();
            return (
              <div className="space-y-4">
                <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Der offizielle Space für Neuigkeiten, Roadmap und Support.
                  </p>
                </div>
                <DndContext
                  sensors={tileSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event;
                    if (over && active.id !== over.id) {
                      const oldIndex = tiles.indexOf(active.id as OfficialTileId);
                      const newIndex = tiles.indexOf(over.id as OfficialTileId);
                      const newOrder = arrayMove(tiles, oldIndex, newIndex);
                      localStorage.setItem("aregoland_official_tiles", JSON.stringify(newOrder));
                      // Force re-render
                      setActiveTab("overview" as typeof activeTab);
                    }
                  }}
                >
                  <SortableContext items={tiles} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {tiles.map(tileId => {
                        const cfg = officialTileConfig[tileId];
                        const Icon = cfg.icon;
                        return (
                          <SortableTile key={tileId} id={tileId}>
                            <button
                              onClick={() => setActiveTab(tileId as typeof activeTab)}
                              className="w-full relative bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-2xl p-4 text-left transition-all group flex items-center gap-4"
                            >
                              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0`}>
                                <Icon size={22} className="text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{cfg.label}</div>
                                <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{cfg.desc}</div>
                                {cfg.activity && (
                                  <div className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
                                    <Clock size={10} className="shrink-0" />
                                    <span className="truncate">{cfg.activity}</span>
                                  </div>
                                )}
                              </div>
                              <ChevronRight size={16} className="text-gray-600 shrink-0" />
                            </button>
                          </SortableTile>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            );
          })()}

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
                const sectionStyle: Record<RoadmapStatus, { key: string; label: string; icon: React.ReactNode; chevronColor: string; dotClass: string; labelColor: string; cardBg: string; cardIcon: React.ReactNode }> = {
                  done: {
                    key: "done",
                    label: "Bereits fertig",
                    icon: <CheckCircle2 size={10} className="text-white" />,
                    chevronColor: "text-emerald-400",
                    dotClass: "bg-emerald-500",
                    labelColor: "text-emerald-400",
                    cardBg: "bg-emerald-500/10 border-emerald-500/20",
                    cardIcon: <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />,
                  },
                  wip: {
                    key: "wip",
                    label: "In Arbeit",
                    icon: <Hammer size={10} className="text-white" />,
                    chevronColor: "text-amber-400",
                    dotClass: "bg-amber-500 animate-pulse",
                    labelColor: "text-amber-400",
                    cardBg: "bg-amber-500/10 border-amber-500/20",
                    cardIcon: <Hammer size={12} className="text-amber-400 mt-0.5 shrink-0" />,
                  },
                  planned: {
                    key: "planned",
                    label: "Geplant",
                    icon: <Sparkles size={10} className="text-white" />,
                    chevronColor: "text-purple-400",
                    dotClass: "bg-purple-500",
                    labelColor: "text-purple-400",
                    cardBg: "bg-purple-500/10 border-purple-500/20",
                    cardIcon: <Sparkles size={12} className="text-purple-400 mt-0.5 shrink-0" />,
                  },
                };

                const sections = roadmapSections.map(rs => ({ ...sectionStyle[rs.status], items: rs.items }));

                return (
                  <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
                    <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                      <Map size={14} className="text-purple-400" /> Roadmap
                    </h3>

                    <div className="relative space-y-4 pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gradient-to-b before:from-emerald-500 before:via-amber-500 before:to-purple-500">
                      {sections.map((section) => (
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
            <div className="flex flex-col h-full -my-4 -mx-4">
              {/* Nachrichten */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {/* Willkommensnachricht */}
                {supportMessages.length === 0 && (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto mb-3">
                      <MessageCircle size={24} className="text-blue-400" />
                    </div>
                    <h3 className="text-sm font-bold mb-1">Support-Chat</h3>
                    <p className="text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
                      Schreib uns dein Anliegen — Fragen, Probleme, Ideen. Jede Nachricht wird als Support-Anfrage weitergeleitet.
                    </p>
                  </div>
                )}

                {supportMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.fromUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      msg.fromUser
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-gray-800 text-gray-200 border border-gray-700/50 rounded-bl-md'
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] ${msg.fromUser ? 'text-blue-200/60' : 'text-gray-500'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {msg.issueNumber && (
                          <span className={`text-[10px] ${msg.fromUser ? 'text-blue-200/60' : 'text-gray-500'}`}>
                            #{msg.issueNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={supportEndRef} />
              </div>

              {/* Eingabe */}
              <div className="shrink-0 px-4 py-3 border-t border-gray-800 bg-gray-900">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={supportInput}
                    onChange={e => setSupportInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && supportInput.trim()) {
                        e.preventDefault();
                        handleSendSupport();
                      }
                    }}
                    placeholder="Nachricht schreiben…"
                    disabled={supportSending}
                    className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                  />
                  <button
                    onClick={handleSendSupport}
                    disabled={!supportInput.trim() || supportSending}
                    className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl text-white transition-all"
                  >
                    <Send size={18} />
                  </button>
                </div>
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
      <>
      {spaceCallState !== "idle" && identity && (
        <SpaceCallOverlay
          callState={spaceCallState}
          callMode={spaceCallMode}
          mediaType={spaceCallMediaType}
          spaceName={selectedSpace.name}
          participants={spaceCallParticipants}
          localStream={spaceCallLocalStream}
          moderatorId={spaceCallModeratorId}
          myAregoId={identity.aregoId}
          getDisplayName={getSpaceCallDisplayName}
          onLeave={handleLeaveSpaceCall}
          onToggleMic={() => spaceCallManagerRef.current?.toggleMic() ?? false}
          onToggleCamera={() => spaceCallManagerRef.current?.toggleCamera() ?? false}
          onSwitchCamera={() => { spaceCallManagerRef.current?.switchCamera(); }}
          onMuteRemote={(id) => spaceCallManagerRef.current?.muteRemote(id)}
          onKick={(id) => spaceCallManagerRef.current?.kick(id)}
        />
      )}
      <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
        {/* Header with gradient banner + centered icon */}
        <div className={`relative ${activeTab === "overview" ? "h-36" : "h-20"} shrink-0 bg-gradient-to-br ${selectedSpace.color} transition-all`}>
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 to-gray-900 pointer-events-none" />
          <button
            onClick={() => activeTab === "overview" ? setView("list") : setActiveTab("overview")}
            className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white z-20"
          >
            <ArrowLeft size={20} />
          </button>
          {/* Centered Icon — nur auf Übersicht */}
          {activeTab === "overview" && (
            <div className="absolute inset-0 flex items-center justify-center z-0 -mt-4">
              {appearance.icon?.type === "image" ? (
                <img src={appearance.icon.value} className="w-20 h-20 rounded-xl object-cover" />
              ) : appearance.icon?.type === "emoji" ? (
                <div className="w-20 h-20 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-4xl">{appearance.icon.value}</div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-3xl font-bold text-white">{(selectedSpace.name[0] ?? "").toUpperCase()}</div>
              )}
            </div>
          )}
          <div className="absolute bottom-0 left-0 p-4 w-full z-10">
            <h1 className={`font-bold ${activeTab === "overview" ? "text-2xl" : "text-lg ml-10"}`}>
              {activeTab === "overview" ? selectedSpace.name : activeTab === "members" ? `${selectedSpace.members.length} ${t('spaces.members')}` : activeTab === "status" ? t('spaces.absenceStatusBoard') : t(`spaces.tab_${activeTab}`)}
            </h1>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">

            {activeTab === "overview" && (() => {
              // Kachel-Grid Daten
              const allTiles = tileOrder.length ? tileOrder : loadTileOrder(selectedSpace.id);
              if (!tileOrder.length) setTileOrder(allTiles);

              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "guest";
              const isFounderOrAdmin = myRole === "founder" || myRole === "admin";
              const overviewCustomRole = (selectedSpace.customRoles ?? []).find(cr => cr.name === myRole);
              const canSeeAnySettings = isFounderOrAdmin || !!overviewCustomRole?.permissions.viewSettings;
              const canViewAbsence = isFounderOrAdmin || !!overviewCustomRole?.permissions.viewAbsenceDetails;
              const tiles = allTiles.filter(t => {
                if (t === "settings" && !canSeeAnySettings) return false;
                if (t === "myRooms" && (selectedSpace.subrooms ?? []).filter(sr => sr.creatorId === identity?.aregoId || sr.moderatorId === identity?.aregoId).length === 0) return false;
                if (t === "status" && !canViewAbsence) return false;
                return true;
              });

              // Aktivitäts-Infos berechnen
              const newsCount = (selectedSpace.posts ?? []).length;
              const lastNewsTime = (selectedSpace.posts ?? []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt;
              const chatUnread = (selectedSpace.channels ?? []).reduce((sum, ch) => sum + (ch.unreadCount ?? 0), 0);
              const lastChatTime = (selectedSpace.channels ?? []).filter(ch => ch.lastMessageTime).sort((a, b) => new Date(b.lastMessageTime!).getTime() - new Date(a.lastMessageTime!).getTime())[0]?.lastMessageTime;

              const timeAgo = (iso: string | undefined) => {
                if (!iso) return "";
                const diff = Date.now() - new Date(iso).getTime();
                if (diff < 60_000) return "Gerade eben";
                if (diff < 3_600_000) return `Vor ${Math.floor(diff / 60_000)} Min`;
                if (diff < 86_400_000) return `Vor ${Math.floor(diff / 3_600_000)} Std`;
                return `Vor ${Math.floor(diff / 86_400_000)} T`;
              };

              const myModeratorRooms = (selectedSpace.subrooms ?? []).filter(sr => sr.creatorId === identity?.aregoId || sr.moderatorId === identity?.aregoId);
              const todayStr = new Date().toISOString().slice(0, 10);
              const activeAbsenceCount = getActiveAbsences(selectedSpace.id, todayStr).length;
              const TILE_CONFIG: Record<TileId, { icon: typeof Newspaper; color: string; gradient: string; label: string; desc: string; activity?: string }> = {
                news: {
                  icon: Newspaper, color: "text-amber-400", gradient: "from-amber-600 to-orange-500",
                  label: t('spaces.tab_news'), desc: "Beiträge, Ankündigungen, Events",
                  activity: newsCount > 0 ? `${timeAgo(lastNewsTime)}${newsCount > 0 ? ` · ${newsCount} Beiträge` : ""}` : undefined,
                },
                chats: {
                  icon: MessageCircle, color: "text-blue-400", gradient: "from-blue-600 to-cyan-500",
                  label: t('spaces.tab_chats'), desc: `${(selectedSpace.channels ?? []).length} Kanäle`,
                  activity: lastChatTime ? `${timeAgo(lastChatTime)}${chatUnread > 0 ? ` · ${chatUnread} neu` : ""}` : undefined,
                },
                myRooms: {
                  icon: LayoutGrid, color: "text-orange-400", gradient: "from-orange-600 to-red-500",
                  label: t('spaces.tab_myRooms'), desc: `${myModeratorRooms.length} ${t('spaces.myRoomsCount')}`,
                },
                members: {
                  icon: Users, color: "text-green-400", gradient: "from-green-600 to-emerald-500",
                  label: t('spaces.tab_members'), desc: `${selectedSpace.members.length} Mitglieder`,
                },
                profile: {
                  icon: User, color: "text-purple-400", gradient: "from-purple-600 to-fuchsia-500",
                  label: t('spaces.tab_profile'), desc: "Dein Space-Profil",
                },
                settings: {
                  icon: Settings, color: "text-gray-400", gradient: "from-gray-600 to-gray-500",
                  label: t('spaces.tab_settings'), desc: isFounderOrAdmin ? "Verwalten" : "Ansehen",
                },
                world: {
                  icon: Globe, color: "text-cyan-400", gradient: "from-cyan-600 to-teal-500",
                  label: t('spaces.tab_world'), desc: "Öffentlicher Feed",
                  activity: "Bald verfügbar",
                },
                status: {
                  icon: ClipboardList, color: "text-rose-400", gradient: "from-rose-600 to-pink-500",
                  label: t('spaces.absenceStatusBoard'), desc: t('spaces.statusBoardDesc'),
                  activity: activeAbsenceCount > 0 ? t('spaces.absenceAbsentCount', { count: activeAbsenceCount }) : undefined,
                },
                timetable: (() => {
                  const todayWd = new Date().getDay();
                  const todayEntries = getEntriesBySpace(selectedSpace.id).filter(e => e.weekday === todayWd);
                  const cancelledToday = todayEntries.filter(e => e.status === "cancelled" || e.status === "substitution").length;
                  return {
                    icon: Calendar, color: cancelledToday > 0 ? "text-red-400" : "text-indigo-400",
                    gradient: cancelledToday > 0 ? "from-red-600 to-orange-500" : "from-indigo-600 to-purple-500",
                    label: t('spaces.timetableTitle'), desc: t('spaces.timetableDesc'),
                    activity: cancelledToday > 0
                      ? t('spaces.timetableCancellationCount', { count: cancelledToday })
                      : todayEntries.length > 0 ? t('spaces.timetableLessonCount', { count: todayEntries.length }) : undefined,
                  };
                })(),
              };

              return (
                <>
                  {/* Space-Info */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 mb-2">
                    {selectedSpace.description && <p className="text-sm text-gray-300 mb-2">{selectedSpace.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Users size={12} /> {selectedSpace.members.length} {t('spaces.members')}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={12} /> {(selectedSpace.channels ?? []).length} Kanäle</span>
                      {(selectedSpace.tags ?? []).length > 0 && <span className="flex items-center gap-1"><Tag size={12} /> {selectedSpace.tags!.slice(0, 2).join(", ")}</span>}
                    </div>
                  </div>

                  {/* Abwesenheit melden Button */}
                  {(() => {
                    const canReport = isFounderOrAdmin || !!overviewCustomRole?.permissions.reportAbsence;
                    if (!canReport) return null;
                    return (
                      <button
                        onClick={openAbsenceModal}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 transition-all"
                      >
                        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                          <Phone size={18} className="text-orange-400" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-semibold text-orange-300">{t("spaces.reportAbsence")}</div>
                          <div className="text-[11px] text-gray-500">{t("spaces.reportAbsenceDesc")}</div>
                        </div>
                        <ChevronRight size={16} className="text-orange-400/50 shrink-0" />
                      </button>
                    );
                  })()}

                  {/* Termine anlegen Button */}
                  {(() => {
                    const canManageBookings = isFounderOrAdmin || !!overviewCustomRole?.permissions.manageBookingSlots;
                    if (!canManageBookings) return null;
                    return (
                      <button
                        onClick={openBookingWizard}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-all"
                      >
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                          <Calendar size={18} className="text-blue-400" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-semibold text-blue-300">{t("spaces.bookingCreateSlots")}</div>
                          <div className="text-[11px] text-gray-500">{t("spaces.bookingCreateSlotsDesc")}</div>
                        </div>
                        <ChevronRight size={16} className="text-blue-400/50 shrink-0" />
                      </button>
                    );
                  })()}

                  {/* ── Buchbare Termine (Member-View) ── */}
                  {spaceBookingTemplates.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("spaces.bookingAvailableTitle")}</h4>
                      {spaceBookingTemplates.map(tmpl => {
                        const freeCount = tmpl.slots.filter(s => s.status === "free").length;
                        const myBookings = identity ? tmpl.slots.filter(s => s.bookedBy === identity.aregoId).length : 0;
                        return (
                          <div key={tmpl.id} className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-white">{tmpl.title}</span>
                              <span className="text-[10px] text-gray-500">{tmpl.date}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                              <span className="flex items-center gap-1"><Clock size={10} /> {tmpl.startTime} – {tmpl.endTime}</span>
                              <span className="flex items-center gap-1"><Calendar size={10} /> {t("spaces.bookingFreeSlots", { count: freeCount })}</span>
                              {myBookings > 0 && <span className="text-green-400 flex items-center gap-1"><Check size={10} /> {t("spaces.bookingMyBookings", { count: myBookings })}</span>}
                            </div>
                            <div className="flex gap-2">
                              {freeCount > 0 && (
                                <button
                                  onClick={() => openSlotPicker(tmpl)}
                                  className="flex-1 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                                >{t("spaces.bookingBookSlot")}</button>
                              )}
                              {tmpl.slotFlex === "flexible" && (
                                <button
                                  onClick={() => openBookingRequestForm(tmpl.id)}
                                  className="flex-1 py-2 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                                >{t("spaces.bookingRequestSlot")}</button>
                              )}
                              {freeCount === 0 && tmpl.slotFlex === "fixed" && (
                                <div className="flex-1 py-2 text-xs text-center text-gray-600 italic">{t("spaces.bookingAllBooked")}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Kachel-Grid — Drag & Drop (dnd-kit) */}
                  <DndContext
                    sensors={tileSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event: DragEndEvent) => {
                      const { active, over } = event;
                      if (over && active.id !== over.id) {
                        const oldIndex = tiles.indexOf(active.id as TileId);
                        const newIndex = tiles.indexOf(over.id as TileId);
                        const newOrder = arrayMove(tiles, oldIndex, newIndex);
                        setTileOrder(newOrder);
                        saveTileOrder(selectedSpace.id, newOrder);
                      }
                    }}
                  >
                    <SortableContext items={tiles} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {tiles.map(tileId => {
                          const cfg = TILE_CONFIG[tileId];
                          const Icon = cfg.icon;
                          return (
                            <SortableTile key={tileId} id={tileId}>
                              <button
                                onClick={() => setActiveTab(tileId)}
                                className="w-full relative bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-2xl p-4 text-left transition-all group flex items-center gap-4"
                              >
                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0`}>
                                  <Icon size={22} className="text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{cfg.label}</div>
                                  <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{cfg.desc}</div>
                                  {cfg.activity && (
                                    <div className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
                                      <Clock size={10} className="shrink-0" />
                                      <span className="truncate">{cfg.activity}</span>
                                    </div>
                                  )}
                                </div>
                                {tileId === "chats" && chatUnread > 0 && (
                                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                    {chatUnread > 9 ? "9+" : chatUnread}
                                  </div>
                                )}
                                <ChevronRight size={16} className="text-gray-600 shrink-0" />
                              </button>
                            </SortableTile>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              );
            })()}

            {/* ── NEWS TAB ── */}
            {activeTab === "news" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "guest";
              const myCustomRole = (selectedSpace.customRoles ?? []).find(cr => cr.name === myRole);
              const canPost = myRole === "founder" || myRole === "admin" || !!myCustomRole?.permissions.postNews;
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
                                {((() => { const m = selectedSpace.members.find(mm => mm.aregoId === post.authorId); return m ? memberDisplayName(m, selectedSpace.identityRule) : post.authorName; })()[0] ?? "?").toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{(() => { const m = selectedSpace.members.find(mm => mm.aregoId === post.authorId); return m ? memberDisplayName(m, selectedSpace.identityRule) : post.authorName; })()}</div>
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
                      {/* Space Call Buttons */}
                      {callsAllowed && spaceCallState === "idle" && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleJoinSpaceCall("audio")}
                            className="p-2 text-gray-400 hover:text-green-400 rounded-full hover:bg-green-500/10 transition-all"
                            title={t("spaceCall.startCall")}
                          >
                            <Phone size={18} />
                          </button>
                          <button
                            onClick={() => handleJoinSpaceCall("video")}
                            className="p-2 text-gray-400 hover:text-blue-400 rounded-full hover:bg-blue-500/10 transition-all"
                            title={t("spaceCall.startCall")}
                          >
                            <Video size={18} />
                          </button>
                        </div>
                      )}
                      {spaceCallState === "active" && (
                        <button
                          onClick={handleLeaveSpaceCall}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-full animate-pulse"
                        >
                          <Phone size={14} />
                          <span>{t("spaceCall.activeParticipants", { count: spaceCallParticipants.length + 1 })}</span>
                        </button>
                      )}
                      <button
                        onClick={() => setShowChannelRoles(v => !v)}
                        className={`p-2 rounded-full transition-all shrink-0 ${showChannelRoles ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-blue-400 hover:bg-blue-500/10"}`}
                        title={t('spaces.channelRoleInfo')}
                      >
                        <Shield size={18} />
                      </button>
                    </div>

                    {/* Channel Role Transparency Panel */}
                    <AnimatePresence>
                      {showChannelRoles && selectedSpace && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-b border-gray-800 shrink-0"
                        >
                          <div className="px-4 py-3 bg-gray-800/30 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                              <Eye size={12} />
                              <span>{t('spaces.channelRoleTransparencyTitle')}</span>
                            </div>
                            {/* Read Roles */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{t('spaces.readAccess')}</span>
                              <div className="flex flex-wrap gap-1">
                                {openChannel.readRoles.map(r => {
                                  const customRole = selectedSpace.customRoles?.find(cr => cr.name === r);
                                  return (
                                    <span key={String(r)} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/15 text-blue-400" style={customRole?.color ? { backgroundColor: `${customRole.color}20`, color: customRole.color } : undefined}>
                                      {String(r)}
                                    </span>
                                  );
                                })}
                                {openChannel.readRoles.length === 0 && (
                                  <span className="text-[10px] text-gray-600 italic">{t('spaces.noRolesAssigned')}</span>
                                )}
                              </div>
                            </div>
                            {/* Write Roles */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{t('spaces.writeAccess')}</span>
                              <div className="flex flex-wrap gap-1">
                                {openChannel.writeRoles.map(r => {
                                  const customRole = selectedSpace.customRoles?.find(cr => cr.name === r);
                                  return (
                                    <span key={String(r)} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-500/15 text-green-400" style={customRole?.color ? { backgroundColor: `${customRole.color}20`, color: customRole.color } : undefined}>
                                      {String(r)}
                                    </span>
                                  );
                                })}
                                {openChannel.writeRoles.length === 0 && (
                                  <span className="text-[10px] text-gray-600 italic">{t('spaces.noRolesAssigned')}</span>
                                )}
                              </div>
                            </div>
                            {/* Excluded members count */}
                            {(openChannel.excludedMemberIds?.length ?? 0) > 0 && (
                              <div className="text-[10px] text-gray-500 flex items-center gap-1.5 pt-1 border-t border-gray-700/50">
                                <EyeOff size={10} />
                                <span>{t('spaces.excludedMembersCount', { count: openChannel.excludedMemberIds!.length })}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

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
                                <span className="text-[10px] text-gray-500 font-medium ml-1 mb-0.5 block">{(() => { const m = selectedSpace.members.find(mm => mm.aregoId === msg.authorId); return m ? memberDisplayName(m, selectedSpace.identityRule) : msg.authorName; })()}</span>
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
                const isSubroomCreator = openSubroom.creatorId === identity?.aregoId || openSubroom.moderatorId === identity?.aregoId;
                const myAregoId = identity?.aregoId ?? '';
                const subroomChannels = (openSubroom.channels ?? []).filter(ch => {
                  if (ch.excludedMemberIds?.includes(myAregoId)) return false;
                  return isSubroomCreator || ch.readRoles.includes(myRole);
                });
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
                    {subroomChannels.length === 0 && !canManage && (
                      <div className="text-center py-8 text-gray-600">
                        <Lock size={24} className="mx-auto mb-2 opacity-50" />
                        <p className="text-xs">{t('spaces.noSubroomAccess')}</p>
                      </div>
                    )}
                    {subroomChannels.map(ch => (
                      <div key={ch.id} className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenChannel(ch)}
                          className="flex-1 flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-all text-left"
                        >
                          <Hash size={16} className="text-gray-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{ch.name}</div>
                            {ch.lastMessage ? (
                              <div className="text-xs text-gray-500 truncate mt-0.5">{ch.lastMessage}</div>
                            ) : (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {ch.readRoles.filter(r => r !== "founder" && r !== "admin").map(r => {
                                  const canWrite = ch.writeRoles.includes(r);
                                  const customRole = selectedSpace?.customRoles?.find(cr => cr.name === r);
                                  return (
                                    <span key={String(r)} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${canWrite ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-400"}`} style={customRole?.color ? { backgroundColor: `${customRole.color}15`, color: customRole.color } : undefined}>
                                      {String(r)} · {canWrite ? t('spaces.writeShort') : t('spaces.readShort')}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </button>
                        {isSubroomCreator && (
                          <button
                            onClick={() => {
                              const excluded = ch.excludedMemberIds ?? [];
                              const isExcluded = excluded.includes(myAregoId);
                              const updatedChannels = (openSubroom.channels ?? []).map(c =>
                                c.id !== ch.id ? c : { ...c, excludedMemberIds: isExcluded ? excluded.filter(id => id !== myAregoId) : [...excluded, myAregoId] }
                              );
                              const updatedSubrooms = (selectedSpace.subrooms ?? []).map(sr =>
                                sr.id !== openSubroom.id ? sr : { ...sr, channels: updatedChannels }
                              );
                              const updated = { ...selectedSpace, subrooms: updatedSubrooms };
                              updateSpace(updated);
                              setOpenSubroom({ ...openSubroom, channels: updatedChannels });
                            }}
                            className="p-2 text-gray-500 hover:text-orange-400 rounded-lg hover:bg-orange-500/10 transition-all shrink-0"
                            title={t('spaces.selfExcludeChannel')}
                          >
                            <EyeOff size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {/* Excluded channels — moderator can re-include */}
                    {isSubroomCreator && (() => {
                      const excludedChannels = (openSubroom.channels ?? []).filter(ch => ch.excludedMemberIds?.includes(myAregoId));
                      return excludedChannels.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <h4 className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5 px-1">
                            <EyeOff size={10} /> {t('spaces.excludedChannels')}
                          </h4>
                          {excludedChannels.map(ch => (
                            <div key={ch.id} className="flex items-center gap-2">
                              <div className="flex-1 flex items-center gap-3 p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 opacity-50 text-left">
                                <Hash size={16} className="text-gray-600 shrink-0" />
                                <div className="text-sm font-medium truncate text-gray-500">{ch.name}</div>
                              </div>
                              <button
                                onClick={() => {
                                  const updatedChannels = (openSubroom.channels ?? []).map(c =>
                                    c.id !== ch.id ? c : { ...c, excludedMemberIds: (c.excludedMemberIds ?? []).filter(id => id !== myAregoId) }
                                  );
                                  const updatedSubrooms = (selectedSpace.subrooms ?? []).map(sr =>
                                    sr.id !== openSubroom.id ? sr : { ...sr, channels: updatedChannels }
                                  );
                                  const updated = { ...selectedSpace, subrooms: updatedSubrooms };
                                  updateSpace(updated);
                                  setOpenSubroom({ ...openSubroom, channels: updatedChannels });
                                }}
                                className="p-2 text-gray-500 hover:text-green-400 rounded-lg hover:bg-green-500/10 transition-all shrink-0"
                                title={t('spaces.reIncludeChannel')}
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
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
                        {ch.lastMessage ? (
                          <div className="text-xs text-gray-500 truncate mt-0.5">{ch.lastMessage}</div>
                        ) : (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {ch.readRoles.filter(r => r !== "founder" && r !== "admin").map(r => {
                              const canWrite = ch.writeRoles.includes(r);
                              const customRole = selectedSpace?.customRoles?.find(cr => cr.name === r);
                              return (
                                <span key={String(r)} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${canWrite ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-400"}`} style={customRole?.color ? { backgroundColor: `${customRole.color}15`, color: customRole.color } : undefined}>
                                  {String(r)} · {canWrite ? t('spaces.writeShort') : t('spaces.readShort')}
                                </span>
                              );
                            })}
                          </div>
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
                  {(() => { const mySubrooms = (selectedSpace.subrooms ?? []).filter(sr => sr.memberIds.includes(identity?.aregoId ?? '') || sr.creatorId === identity?.aregoId || sr.moderatorId === identity?.aregoId); return mySubrooms.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <Layers size={12} /> {t('spaces.subrooms')}
                      </h3>
                      {mySubrooms.map(sr => (
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
                  ); })()}
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
                let cmp = 0;
                if (memberSort === "role") {
                  cmp = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
                } else if (memberSort === "name") {
                  cmp = memberDisplayName(a, selectedSpace.identityRule).localeCompare(memberDisplayName(b, selectedSpace.identityRule));
                } else {
                  cmp = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
                }
                return memberSortAsc ? cmp : -cmp;
              });

              // Gruppiert nur bei Rollen-Sortierung
              const roleOrder = memberSortAsc ? ROLE_ORDER : [...ROLE_ORDER].reverse();
              const grouped = memberSort === "role"
                ? roleOrder.map(role => ({
                    role,
                    members: sortedMembers.filter(m => m.role === role),
                  })).filter(g => g.members.length > 0)
                : null;

              const formatJoinDate = (iso: string) => {
                const d = new Date(iso);
                return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              };

              const renderMember = (member: typeof membersWithDate[0]) => {
                const isMe = member.aregoId === identity?.aregoId;
                const name = memberDisplayName(member, selectedSpace.identityRule);
                return (
                <div key={member.aregoId} className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <button
                      onClick={() => !isMe && setMemberProfile(member)}
                      disabled={isMe}
                      className={`flex items-center gap-3 text-left ${isMe ? "" : "hover:opacity-80 transition-opacity"}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-sm font-bold text-white">
                        {(name[0] ?? "?").toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{name}</div>
                        <div className="text-xs text-gray-500 font-mono">{member.aregoId}</div>
                        <div className="text-[10px] text-gray-600 mt-0.5">{formatJoinDate(member.joinedAt)}</div>
                      </div>
                    </button>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${ROLE_COLORS[member.role].bg} ${ROLE_COLORS[member.role].text}`}>
                      {t(`spaces.role_${member.role}`)}
                    </span>
                  </div>
                </div>
              ); };

              // Anfragen für diesen Space filtern
              const spaceJoinRequests = joinRequests.filter(r => r.space_id === selectedSpace.id);

              return (
                <>
                  {/* Beitrittsanfragen — nur Gründer/Admin */}
                  {canManage && spaceJoinRequests.length > 0 && (
                    <div className="space-y-2 mb-3">
                      <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                        <UserPlus size={12} /> Beitrittsanfragen ({spaceJoinRequests.length})
                      </h3>
                      {spaceJoinRequests.map(req => (
                        <div key={req.id} className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-600 to-orange-400 flex items-center justify-center text-xs font-bold text-white">
                                {(req.user_name[0] ?? "?").toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{req.user_name || req.user_id}</div>
                                <div className="text-[10px] text-gray-500 font-mono">{req.user_id}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={async () => {
                                  if (!identity) return;
                                  const ok = await respondJoinRequest({
                                    user_id: req.user_id,
                                    space_id: req.space_id,
                                    gruender_id: identity.aregoId,
                                    action: 'approve',
                                    space_name: selectedSpace.name,
                                    space_template: selectedSpace.template,
                                    space_description: selectedSpace.description || undefined,
                                    gruender_name: identity.displayName,
                                  });
                                  if (ok) {
                                    // Mitglied hinzufügen
                                    const newMember = {
                                      aregoId: req.user_id,
                                      displayName: req.user_name || req.user_id,
                                      role: "guest" as SpaceRole,
                                      joinedAt: new Date().toISOString(),
                                    };
                                    const updatedSpace = { ...selectedSpace, members: [...selectedSpace.members, newMember] };
                                    updateSpace(updatedSpace);
                                    setJoinRequests(prev => prev.filter(r => r.id !== req.id));
                                    // Vollständigen Space-Sync an neues Mitglied senden
                                    sendSpaceSync(req.user_id, buildSyncPayload(updatedSpace)).catch(() => {});
                                  }
                                }}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-colors"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={async () => {
                                  if (!identity) return;
                                  const ok = await respondJoinRequest({
                                    user_id: req.user_id,
                                    space_id: req.space_id,
                                    gruender_id: identity.aregoId,
                                    action: 'reject',
                                    space_name: selectedSpace.name,
                                  });
                                  if (ok) {
                                    setJoinRequests(prev => prev.filter(r => r.id !== req.id));
                                  }
                                }}
                                className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-bold rounded-lg transition-colors border border-red-500/30"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sortier-Leiste */}
                  <div className="flex items-center gap-1.5 mb-3 mt-1">
                    {(["role", "name", "date"] as const).map(s => (
                      <button key={s}
                        onClick={() => {
                          if (memberSort === s) { setMemberSortAsc(p => !p); }
                          else { setMemberSort(s); setMemberSortAsc(true); }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                          memberSort === s ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                        }`}>
                        {s === "role" ? "Rolle" : s === "name" ? "Name" : "Beitrittsdatum"}
                        {memberSort === s && (
                          <ChevronDown size={12} className={`transition-transform ${memberSortAsc ? "rotate-180" : ""}`} />
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

                  {/* Mitglied-Profil Popup */}
                  <AnimatePresence>
                    {memberProfile && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
                        onClick={() => setMemberProfile(null)}
                      >
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.95, opacity: 0 }}
                          onClick={e => e.stopPropagation()}
                          className="bg-gray-800 border border-gray-700 rounded-2xl p-5 max-w-sm w-full shadow-xl space-y-4"
                        >
                          {/* Avatar + Name */}
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-xl font-bold text-white">
                              {(memberProfile.displayName[0] ?? "").toUpperCase()}
                            </div>
                            <div>
                              <div className="text-lg font-bold">{memberProfile.displayName}</div>
                              <div className="text-xs text-gray-500 font-mono">{memberProfile.aregoId}</div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 inline-block ${ROLE_COLORS[memberProfile.role].bg} ${ROLE_COLORS[memberProfile.role].text}`}>
                                {t(`spaces.role_${memberProfile.role}`)}
                              </span>
                            </div>
                          </div>

                          {/* Kontakt-Aktionen */}
                          {(() => {
                            const contacts = loadContacts();
                            const isContact = contacts.some(c => c.aregoId === memberProfile.aregoId);
                            return isContact ? (
                              <button
                                onClick={() => {
                                  removeContact(memberProfile.aregoId);
                                  onShowToast?.(`${memberProfile.displayName} aus Kontakten entfernt`, 'warning');
                                  setMemberProfile(null);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold rounded-xl transition-all border border-red-500/30 text-sm"
                              >
                                <Trash2 size={16} />
                                Kontakt entfernen
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  onOpenQRCode();
                                  onShowToast?.(`Öffne QR-Code um ${memberProfile.displayName} als Kontakt hinzuzufügen`, 'info');
                                  setMemberProfile(null);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all text-sm"
                              >
                                <UserPlus size={16} />
                                Kontakt hinzufügen
                              </button>
                            );
                          })()}

                          {/* Schließen */}
                          <button
                            onClick={() => setMemberProfile(null)}
                            className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1 transition-colors"
                          >
                            Schließen
                          </button>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              );
            })()}

            {/* ── PROFIL TAB ── */}
            {activeTab === "profile" && (() => {
              const myMember = selectedSpace.members.find(m => m.aregoId === identity?.aregoId);
              const myRole = myMember?.role ?? "guest";
              // Founder and Admin can always be network helper
              const canBeNetworkHelper = myRole === "founder" || myRole === "admin";
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
                      {(memberDisplayName(myMember!, selectedSpace.identityRule)[0] ?? "?").toUpperCase()}
                    </div>
                    <div>
                      <div className="text-lg font-bold">{memberDisplayName(myMember!, selectedSpace.identityRule)}</div>
                      {myMember?.spaceNickname && <div className="text-xs text-gray-400">@{myMember.spaceNickname}</div>}
                      <div className="text-xs text-gray-500 font-mono">{identity?.aregoId}</div>
                    </div>
                    {/* Role badge */}
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${ROLE_COLORS[myRole as SpaceRole]?.bg ?? "bg-gray-700/50"} ${ROLE_COLORS[myRole as SpaceRole]?.text ?? "text-gray-400"}`}>
                      <Shield size={12} />
                      {t(`spaces.role_${myRole}`)}
                    </div>
                  </div>

                  {/* Spitzname im Space */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 space-y-2">
                    <label className="text-xs font-medium text-gray-400">{t('spaces.spaceNickname')}</label>
                    <input
                      type="text"
                      defaultValue={myMember?.spaceNickname ?? ""}
                      placeholder={t('spaces.spaceNicknamePlaceholder')}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (val !== (myMember?.spaceNickname ?? "")) {
                          updateSpace({
                            ...selectedSpace,
                            members: selectedSpace.members.map(m =>
                              m.aregoId === identity?.aregoId ? { ...m, spaceNickname: val || undefined } : m
                            ),
                          });
                          onShowToast?.(t('spaces.nicknameSaved'), "info");
                        }
                      }}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                    />
                    {selectedSpace.identityRule === "nickname_only" && !myMember?.spaceNickname && (
                      <p className="text-[10px] text-amber-400">{t('spaces.nicknameRequired')}</p>
                    )}
                    {/* Toggle: Spitzname anzeigen — nur bei "mixed" und wenn Spitzname vorhanden */}
                    {selectedSpace.identityRule === "mixed" && myMember?.spaceNickname && (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/30">
                        <span className="text-xs text-gray-400">{t('spaces.showNickname')}</span>
                        <button
                          onClick={() => {
                            updateSpace({
                              ...selectedSpace,
                              members: selectedSpace.members.map(m =>
                                m.aregoId === identity?.aregoId ? { ...m, useNickname: !m.useNickname } : m
                              ),
                            });
                            onShowToast?.(t('spaces.nicknameSaved'), "info");
                          }}
                          className={`relative w-10 h-5 rounded-full transition-colors ${myMember.useNickname ? "bg-blue-600" : "bg-gray-700"}`}>
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${myMember.useNickname ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                    )}
                    {selectedSpace.identityRule === "real_name" && myMember?.spaceNickname && (
                      <p className="text-[10px] text-gray-600">{t('spaces.realNameEnforced')}</p>
                    )}
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

                  {/* Space austreten — nur für Nicht-Gründer */}
                  {myRole !== "founder" && (
                    <button
                      onClick={() => {
                        if (!confirm(t('spaces.leaveConfirm'))) return;
                        if (!selectedSpace || !identity) return;
                        // Mitglied entfernen
                        const updated = {
                          ...selectedSpace,
                          members: selectedSpace.members.filter(m => m.aregoId !== identity.aregoId),
                        };
                        // Space lokal löschen (nicht nur Mitglied entfernen)
                        const list = spaces.filter(s => s.id !== selectedSpace.id);
                        setSpaces(list);
                        saveSpaces(list);
                        setSelectedSpace(null);
                        setView("list");
                        onShowToast?.(t('spaces.leftSpace'), "info");
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 mt-4 text-red-400 text-sm font-medium hover:bg-red-500/10 rounded-xl transition-colors border border-red-500/20"
                    >
                      <LogOut size={16} />
                      {t('spaces.leaveSpace')}
                    </button>
                  )}
                </>
              );
            })()}

            {activeTab === "myRooms" && (() => {
              const myAregoId = identity?.aregoId ?? '';
              const moderatedRooms = (selectedSpace.subrooms ?? []).filter(sr => sr.creatorId === myAregoId || sr.moderatorId === myAregoId);

              if (moderatedRooms.length === 0) {
                return (
                  <div className="text-center py-12 text-gray-600">
                    <LayoutGrid size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('spaces.myRoomsEmpty')}</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <LayoutGrid size={14} className="text-orange-400" />
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('spaces.myRoomsTitle')}</h3>
                    <span className="text-[10px] text-gray-600 ml-auto">{moderatedRooms.length} {t('spaces.myRoomsCount')}</span>
                  </div>
                  {moderatedRooms.map(sr => {
                    const memberCount = sr.memberIds.length;
                    const channelCount = (sr.channels ?? []).length;
                    return (
                      <div key={sr.id} className="bg-gray-800/50 rounded-xl border border-orange-500/20 hover:border-orange-500/40 transition-all overflow-hidden">
                        {/* Room header */}
                        <button
                          onClick={() => { setActiveTab("chats"); setOpenSubroom(sr); }}
                          className="w-full flex items-center gap-3 p-3 text-left"
                        >
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-red-500 flex items-center justify-center shrink-0">
                            <Layers size={18} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-bold truncate block">{sr.name}</span>
                            <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                              <span className="flex items-center gap-1"><Users size={10} /> {memberCount}</span>
                              <span className="flex items-center gap-1"><Hash size={10} /> {channelCount} {t('spaces.channels')}</span>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-gray-600 shrink-0" />
                        </button>
                        {/* Quick actions */}
                        <div className="border-t border-gray-700/30 px-3 py-2 flex items-center gap-2">
                          <button
                            onClick={() => { setActiveTab("chats"); setOpenSubroom(sr); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                          >
                            <Hash size={12} /> {t('spaces.myRoomsChannels')}
                          </button>
                          <div className="w-px h-4 bg-gray-700/50" />
                          <button
                            onClick={() => { setActiveTab("members"); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                          >
                            <Users size={12} /> {t('spaces.myRoomsMembers')}
                          </button>
                          <div className="w-px h-4 bg-gray-700/50" />
                          <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-gray-600 cursor-default">
                            <Calendar size={12} /> {t('spaces.comingSoon')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {activeTab === "settings" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "guest";
              const myCustomRole = (selectedSpace.customRoles ?? []).find(cr => cr.name === myRole);
              const canManageSettings = myRole === "founder" || myRole === "admin" || !!myCustomRole?.permissions.viewSettings;
              // For custom roles: check if a specific section is visible
              const canSeeSection = (sectionId: string) => {
                if (myRole === "founder" || myRole === "admin") return true;
                if (!myCustomRole?.permissions.viewSettings) return false;
                return (myCustomRole.permissions.visibleSettingsSections ?? []).includes(sectionId);
              };

              // Auto-Save Wrapper für Einstellungen
              const saveSettings = (updated: Space) => {
                updateSpace(updated);
                onShowToast?.("Änderung gespeichert", "info");
              };

              // SettingsSection (stabil definiert ausserhalb) mit settingsOpen + toggleSection

              return (
                <div className="space-y-4">

                  {/* ━━ Gruppe 1: Erscheinungsbild ━━ */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest px-2 mb-2">{t('spaces.settingsGroupAppearance')}</p>
                    <div className="rounded-2xl overflow-hidden border border-gray-700/40 divide-y divide-gray-700/40">
                  <SettingsSection id="appearance" icon={<Edit2 size={16} />} title={t('spaces.appearance')} visible={canSeeSection("appearance")} isOpen={settingsOpen["appearance"] ?? false} onToggle={() => toggleSection("appearance")}>
                    {(() => {
                      const app = loadAppearance(selectedSpace.id);
                      return (
                        <>
                          <div className="flex gap-3">
                            <div className="shrink-0 space-y-1.5">
                              <label className="text-[10px] text-gray-500 px-0.5">{t('spaces.icon')}</label>
                              <button onClick={() => setShowIconPicker(!showIconPicker)}
                                className="w-16 h-16 rounded-xl border-2 border-gray-700/50 hover:border-gray-500 flex items-center justify-center transition-all overflow-hidden bg-white/10">
                                {app.icon?.type === "image" ? <img src={app.icon.value} className="w-full h-full object-cover" /> :
                                 app.icon?.type === "emoji" ? <span className="text-2xl">{app.icon.value}</span> :
                                 <span className="text-xl font-bold text-white">{(selectedSpace.name[0] ?? "").toUpperCase()}</span>}
                              </button>
                            </div>
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
                              saveSettings({ ...selectedSpace }); setShowIconPicker(false);
                            }; reader.readAsDataURL(file);
                          }} />
                          <AnimatePresence>
                            {showIconPicker && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 space-y-2">
                                  <div className="flex flex-wrap gap-2">
                                    {EMOJI_QUICK.map(em => (
                                      <button key={em} onClick={() => {
                                        saveAppearance(selectedSpace.id, { ...app, icon: { type: "emoji", value: em } });
                                        saveSettings({ ...selectedSpace }); setShowIconPicker(false);
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
                          <AnimatePresence>
                            {showBannerPicker && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                                  <div className="flex flex-wrap gap-2">
                                    {BANNER_PRESETS.map(g => (
                                      <button key={g} onClick={() => {
                                        saveAppearance(selectedSpace.id, { ...app, banner: { type: "color", value: g } });
                                        saveSettings({ ...selectedSpace, color: g }); setShowBannerPicker(false);
                                      }} className={`w-10 h-10 rounded-lg bg-gradient-to-br ${g} border-2 ${selectedSpace.color === g ? "border-white" : "border-transparent"} hover:border-gray-400 transition-all`} />
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {/* Beschreibung */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-gray-500 px-0.5">Beschreibung</label>
                            <textarea
                              defaultValue={selectedSpace.description}
                              onBlur={e => {
                                const val = e.target.value.trim();
                                if (val !== selectedSpace.description) saveSettings({ ...selectedSpace, description: val });
                              }}
                              placeholder="Worum geht es in diesem Space?"
                              rows={3}
                              className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all resize-none"
                            />
                          </div>
                        </>
                      );
                    })()}
                  </SettingsSection>

                  {/* ── Tags ── */}
                  <SettingsSection id="tags" icon={<Tag size={16} />} title={t('spaces.tags')} visible={canSeeSection("tags")} isOpen={settingsOpen["tags"] ?? false} onToggle={() => toggleSection("tags")}>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {(selectedSpace.tags ?? []).map(tag => (
                          <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50">
                            {tag}
                            <button onClick={() => saveSettings({ ...selectedSpace, tags: (selectedSpace.tags ?? []).filter(t => t !== tag) })}
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
                                        saveSettings({ ...selectedSpace, tags: next });
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
                                      if (!current.includes(settingsCustomTag.trim())) saveSettings({ ...selectedSpace, tags: [...current, settingsCustomTag.trim()] });
                                      setSettingsCustomTag("");
                                    }
                                  }}
                                  placeholder={t('spaces.customTag') || "Eigenen Tag erstellen"}
                                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500" />
                                <button onClick={() => {
                                    if (settingsCustomTag.trim()) {
                                      const current = selectedSpace.tags ?? [];
                                      if (!current.includes(settingsCustomTag.trim())) saveSettings({ ...selectedSpace, tags: [...current, settingsCustomTag.trim()] });
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
                  </SettingsSection>
                    </div>
                  </div>

                  {/* ━━ Gruppe 2: Zugang & Sichtbarkeit ━━ */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest px-2 mb-2">{t('spaces.settingsGroupAccess')}</p>
                    <div className="rounded-2xl overflow-hidden border border-gray-700/40 divide-y divide-gray-700/40">
                  <SettingsSection id="visibility" icon={<Eye size={16} />} title="Sichtbarkeit" visible={canSeeSection("visibility")} isOpen={settingsOpen["visibility"] ?? false} onToggle={() => toggleSection("visibility")}>
                      <div className="flex gap-2">
                        {([
                          { id: "public" as const, label: "Öffentlich", icon: <Globe size={14} />, desc: "In der Suche sichtbar" },
                          { id: "private" as const, label: "Privat", icon: <EyeOff size={14} />, desc: "Nur per Einladung" },
                        ]).map(opt => (
                          <button key={opt.id}
                            onClick={async () => {
                              const updated = { ...selectedSpace, visibility: opt.id };
                              saveSettings(updated);
                              if (opt.id === "public" && identity) {
                                await registerPublicSpace({
                                  space_id: selectedSpace.id,
                                  name: selectedSpace.name,
                                  beschreibung: selectedSpace.description,
                                  sprache: localStorage.getItem('aregoland_language') ?? 'de',
                                  tags: selectedSpace.tags ?? [],
                                  mitgliederzahl: selectedSpace.members.length,
                                  gruender_id: identity.aregoId,
                                  inaktivitaets_regel: selectedSpace.inaktivitaets_regel ?? 'delete',
                                });
                              } else if (opt.id === "private" && identity) {
                                await unregisterPublicSpace(selectedSpace.id, identity.aregoId);
                              }
                            }}
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

                      {/* Hinweis: welche Daten gemeldet werden */}
                      {(selectedSpace.visibility ?? "private") === "public" && (
                        <div className="space-y-2">
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Gemeldete Daten</p>
                            <p className="text-[11px] text-blue-300/80 leading-relaxed">
                              Name, Beschreibung, Sprache, Tags, Mitgliederzahl und Gründer-ID werden an den Server gemeldet. Keine Chat-Inhalte oder Mitgliederlisten.
                            </p>
                          </div>
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">Inaktivität</p>
                            <p className="text-[11px] text-amber-300/80 leading-relaxed">
                              Nach 30 Tagen ohne Aktivität wird der Space automatisch aus der öffentlichen Liste entfernt. Ein stiller Heartbeat wird alle 3 Tage gesendet.
                            </p>
                          </div>

                          {/* Inaktivitäts-Regelung */}
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Bei Inaktivität des Gründers</p>
                            <div className="flex gap-2">
                              {([
                                { id: "delete" as const, label: "Space löschen", desc: "Eintrag wird entfernt" },
                                { id: "transfer" as const, label: "Weitergeben", desc: "An nächstes Mitglied nach Rolle" },
                              ]).map(rule => (
                                <button key={rule.id}
                                  onClick={() => saveSettings({ ...selectedSpace, inaktivitaets_regel: rule.id })}
                                  className={`flex-1 flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all text-center ${
                                    (selectedSpace.inaktivitaets_regel ?? "delete") === rule.id
                                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                                      : "border-gray-700/50 bg-gray-800/50 text-gray-500 hover:border-gray-600"
                                  }`}>
                                  <span className="text-[11px] font-bold">{rule.label}</span>
                                  <span className="text-[9px] opacity-70">{rule.desc}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                  </SettingsSection>

                  {/* ── Anzeigename ── */}
                  <SettingsSection id="displayname" icon={<User size={16} />} title={t('spaces.displayNameRule')} visible={canSeeSection("visibility")} isOpen={settingsOpen["displayname"] ?? false} onToggle={() => toggleSection("displayname")}>
                    <div className="space-y-1.5">
                      {([
                        { id: "mixed" as IdentityRule, label: t('spaces.displayMixed'), desc: t('spaces.displayMixedDesc') },
                        { id: "real_name" as IdentityRule, label: t('spaces.displayRealName'), desc: t('spaces.displayRealNameDesc') },
                        { id: "nickname_only" as IdentityRule, label: t('spaces.displayNicknameOnly'), desc: t('spaces.displayNicknameOnlyDesc') },
                      ]).map(opt => (
                        <button key={opt.id}
                          onClick={() => saveSettings({ ...selectedSpace, identityRule: opt.id })}
                          className={`w-full flex flex-col px-3 py-2.5 rounded-xl text-left transition-all border ${
                            (selectedSpace.identityRule === opt.id || (opt.id === "mixed" && !["real_name", "nickname_only"].includes(selectedSpace.identityRule)))
                              ? "bg-blue-600/20 text-blue-400 border-blue-500/50"
                              : "bg-gray-800/50 text-gray-500 border-gray-700/50 hover:bg-gray-800"
                          }`}>
                          <span className="text-xs font-medium">{opt.label}</span>
                          <span className="text-[10px] opacity-70 mt-0.5">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </SettingsSection>

                  {/* ── QR-Code ── */}
                  {canSeeSection("invite") && (
                    <div className="overflow-hidden">
                      <button
                        onClick={() => {
                          if (!settingsInviteOpen) handleOpenInvite();
                          else setSettingsInviteOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="text-gray-400"><QrCode size={16} /></div>
                        <span className="text-sm font-semibold text-white flex-1 text-left">QR-Code</span>
                        <ChevronDown size={14} className={`transition-all ${settingsInviteOpen ? "rotate-180 text-blue-400" : "text-gray-600"}`} />
                      </button>

                      <AnimatePresence>
                        {settingsInviteOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-3">
                              {/* Rolle + Gültigkeit */}
                              <div className="flex gap-3">
                                <div className="flex-1 space-y-1.5">
                                  <label className="text-[10px] font-medium text-gray-500 px-1">{t('spaces.inviteAs')}</label>
                                  <select
                                    value={inviteRole}
                                    onChange={e => { const r = e.target.value as SpaceRole; setInviteRole(r); regenerateInvite(r); }}
                                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
                                  >
                                    {INVITABLE_ROLES.map(({ role }) => (
                                      <option key={role} value={role}>{t(`spaces.role_${role}`)}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex-1 space-y-1.5">
                                  <label className="text-[10px] font-medium text-gray-500 px-1">{t('spaces.inviteTtl')}</label>
                                  <select
                                    value={inviteTtlId}
                                    onChange={e => {
                                      const id = e.target.value;
                                      if (id === "unlimited" && isHighRole(inviteRole)) return;
                                      setInviteTtlId(id);
                                      if (id !== "custom") regenerateInvite(undefined, id);
                                    }}
                                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
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
                                </div>
                              </div>

                              {/* Custom TTL */}
                              {inviteTtlId === "custom" && (
                                <div className="flex items-center gap-2">
                                  <input type="number" min={1} max={customTtlUnit === "hours" ? 720 : 365}
                                    value={customTtlValue} onChange={e => setCustomTtlValue(e.target.value)}
                                    onBlur={() => regenerateInvite(undefined, "custom")}
                                    className="w-20 bg-gray-800/50 border border-gray-700 rounded-xl px-2 py-2 text-xs text-white text-center focus:outline-none focus:border-blue-500 transition-all" />
                                  <select value={customTtlUnit}
                                    onChange={e => { setCustomTtlUnit(e.target.value as "hours" | "days"); setTimeout(() => regenerateInvite(undefined, "custom"), 0); }}
                                    className="bg-gray-800/50 border border-gray-700 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: "24px" }}>
                                    <option value="hours">{t('spaces.ttlHours')}</option>
                                    <option value="days">{t('spaces.ttlDays')}</option>
                                  </select>
                                </div>
                              )}

                              {isHighRole(inviteRole) && (
                                <p className="text-[10px] text-yellow-400/70 px-1">{t('spaces.ttlMaxForRole')}</p>
                              )}

                              {/* QR-Code */}
                              {inviteEncoded && (
                                <div className="flex flex-col items-center">
                                  <div className="bg-white p-4 rounded-2xl shadow-xl">
                                    <QRCodeSvg value={inviteEncoded} size={180} bgColor="#fff" fgColor="#111827" />
                                  </div>
                                  <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                                    <Clock size={12} />
                                    <span>{t('spaces.inviteValidFor', { time: getInviteTtlLabel() })}</span>
                                  </div>
                                </div>
                              )}

                              {/* Kurzcode */}
                              <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <Hash size={13} className="text-blue-400" />
                                    <span className="text-xs font-semibold text-white">Kurzcode</span>
                                    <span className="text-[10px] text-gray-500">— 1h gültig, einmalig</span>
                                  </div>
                                </div>
                                {inviteCodeLoading ? (
                                  <div className="flex justify-center py-2">
                                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                  </div>
                                ) : inviteShortCode ? (
                                  <div className="flex items-center justify-between bg-gray-900/60 rounded-xl px-4 py-2.5">
                                    <span className="text-xl font-mono font-bold tracking-[0.3em] text-blue-300">{inviteShortCode}</span>
                                    <button
                                      onClick={async () => {
                                        await navigator.clipboard.writeText(inviteShortCode);
                                        setInviteCodeCopied(true);
                                        setTimeout(() => setInviteCodeCopied(false), 2000);
                                      }}
                                      className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-all"
                                    >
                                      {inviteCodeCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                    </button>
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-gray-600 text-center">Server nicht erreichbar</p>
                                )}
                              </div>

                              {/* Teilen + Deaktivieren */}
                              <div className="flex gap-2">
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
                                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                                >
                                  <Share2 size={16} />
                                  {t('common.share')}
                                </button>
                                <button
                                  onClick={() => { setInviteEncoded(""); setInviteShortCode(""); setSettingsInviteOpen(false); }}
                                  className="px-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold py-2.5 rounded-xl transition-all flex items-center justify-center border border-red-500/30"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                    </div>
                  </div>

                  {/* ━━ Gruppe 3: Verwaltung ━━ */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest px-2 mb-2">{t('spaces.settingsGroupManagement')}</p>
                    <div className="rounded-2xl overflow-hidden border border-gray-700/40 divide-y divide-gray-700/40">
                  <SettingsSection id="members" icon={<Users size={16} />} title={t('spaces.manageMembers')} visible={canSeeSection("members")} isOpen={settingsOpen["members"] ?? false} onToggle={() => toggleSection("members")}>
                    {(() => {
                      const allCustomRoles = selectedSpace.customRoles ?? [];
                      const allChannels = selectedSpace.channels ?? [];
                      const manageable = selectedSpace.members.filter(m => m.role !== "founder");
                      const sorted = [...manageable].sort((a, b) => {
                        if (memberMgmtSort === "name") return memberDisplayName(a, selectedSpace.identityRule).localeCompare(memberDisplayName(b, selectedSpace.identityRule));
                        return new Date(b.joinedAt ?? 0).getTime() - new Date(a.joinedAt ?? 0).getTime();
                      });
                      return (
                        <div className="space-y-2">
                          {/* Sortierung */}
                          <div className="flex gap-1.5">
                            {(["name", "date"] as const).map(s => (
                              <button key={s} onClick={() => setMemberMgmtSort(s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${memberMgmtSort === s ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}>
                                {s === "name" ? t('spaces.sortByName') : t('spaces.sortByDate')}
                              </button>
                            ))}
                          </div>
                          {sorted.map(member => {
                            const isExpanded = editingMember === member.aregoId;
                            const name = memberDisplayName(member, selectedSpace.identityRule);
                            return (
                              <div key={member.aregoId} className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                                <button
                                  onClick={() => setEditingMember(isExpanded ? null : member.aregoId)}
                                  className="w-full flex items-center justify-between p-3 hover:bg-gray-800/30 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-sm font-bold text-white">
                                      {(name[0] ?? "?").toUpperCase()}
                                    </div>
                                    <div className="text-left">
                                      <div className="text-sm font-medium">{name}</div>
                                      <div className="text-[10px] text-gray-500 font-mono">{member.aregoId}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${ROLE_COLORS[member.role]?.bg ?? "bg-gray-700"} ${ROLE_COLORS[member.role]?.text ?? "text-gray-400"}`}>
                                      {t(`spaces.role_${member.role}`, member.role)}
                                    </span>
                                    <ChevronDown size={14} className={`text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  </div>
                                </button>

                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                      <div className="px-3 pb-3 pt-1 border-t border-gray-700/50 space-y-3">
                                        {/* Rolle zuweisen */}
                                        <div className="space-y-1.5">
                                          <p className="text-xs text-gray-500 font-medium">{t('spaces.assignRole')}</p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {ROLE_ORDER.filter(r => r !== "founder").map(r => (
                                              <button key={r}
                                                onClick={() => handleChangeRole(member.aregoId, r)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                  member.role === r
                                                    ? `${ROLE_COLORS[r].bg} ${ROLE_COLORS[r].text} ring-1 ring-current`
                                                    : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                                                }`}>
                                                {t(`spaces.role_${r}`)}
                                              </button>
                                            ))}
                                            {allCustomRoles.map(cr => (
                                              <button key={cr.id}
                                                onClick={() => {
                                                  handleChangeRole(member.aregoId, cr.name as SpaceRole);
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                  member.role === (cr.name as SpaceRole)
                                                    ? "ring-1 ring-current"
                                                    : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                                                }`}
                                                style={member.role === (cr.name as SpaceRole) ? { backgroundColor: `${cr.color}30`, color: cr.color } : undefined}>
                                                {cr.name}
                                              </button>
                                            ))}
                                          </div>
                                        </div>

                                        {/* Chat-Zugehörigkeit */}
                                        {allChannels.length > 0 && (
                                          <div className="space-y-1.5">
                                            <p className="text-xs text-gray-500 font-medium">{t('spaces.memberChats')}</p>
                                            <div className="space-y-1">
                                              {allChannels.map(ch => {
                                                const hasAccess = ch.readRoles.includes(member.role) || ch.writeRoles.includes(member.role);
                                                return (
                                                  <button key={ch.id}
                                                    onClick={() => {
                                                      const updatedChannels = allChannels.map(c => {
                                                        if (c.id !== ch.id) return c;
                                                        if (hasAccess) {
                                                          return {
                                                            ...c,
                                                            readRoles: c.readRoles.filter(r => r !== member.role),
                                                            writeRoles: c.writeRoles.filter(r => r !== member.role),
                                                          };
                                                        } else {
                                                          return {
                                                            ...c,
                                                            readRoles: [...c.readRoles, member.role],
                                                            writeRoles: [...c.writeRoles, member.role],
                                                          };
                                                        }
                                                      });
                                                      saveSettings({ ...selectedSpace, channels: updatedChannels });
                                                    }}
                                                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-800/50 bg-gray-900/30 transition-colors">
                                                    <div className="flex items-center gap-2">
                                                      <Hash size={12} className="text-gray-500" />
                                                      <span className="text-[11px] text-gray-300">{ch.name}</span>
                                                    </div>
                                                    <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${hasAccess ? "bg-blue-600" : "bg-gray-700"}`}>
                                                      {hasAccess && <Check size={10} className="text-white" />}
                                                    </div>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}

                                        {/* Entfernen */}
                                        <button
                                          onClick={() => { handleRemoveMember(member.aregoId); setEditingMember(null); }}
                                          className="w-full flex items-center justify-center gap-2 text-red-400 text-xs font-medium py-2 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20">
                                          <Trash2 size={12} />
                                          {t('spaces.removeMember')}
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                          {selectedSpace.members.filter(m => m.role !== "founder").length === 0 && (
                            <p className="text-xs text-gray-600 text-center py-4">{t('spaces.noMembersToManage')}</p>
                          )}
                        </div>
                      );
                    })()}
                  </SettingsSection>

                  {/* ── Chats verwalten ── */}
                  <SettingsSection id="chats" icon={<MessageCircle size={16} />} title={t('spaces.manageChats')} visible={canSeeSection("chats")} isOpen={settingsOpen["chats"] ?? false} onToggle={() => toggleSection("chats")}>
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
                                // Build role list: built-in (member, guest) + all custom roles
                                const allRoles: { id: string; label: string; color: string }[] = [
                                  { id: "guest", label: t('spaces.role_guest'), color: ROLE_COLORS.guest.text },
                                  { id: "guest", label: t('spaces.role_guest'), color: ROLE_COLORS.guest.text },
                                  ...(selectedSpace.customRoles ?? []).map(cr => ({ id: cr.name, label: cr.name, color: cr.color })),
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
                  </SettingsSection>

                  {/* ── Rollen & Rechte ── */}
                  <SettingsSection id="roles" icon={<Shield size={16} />} title={t('spaces.rolesAndPermissions')} visible={canSeeSection("roles")} isOpen={settingsOpen["roles"] ?? false} onToggle={() => toggleSection("roles")}>
                    {/* ── Gründer (fest) ── */}
                      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3 opacity-60 cursor-not-allowed">
                        <div className="flex items-center gap-2 mb-1">
                          <Crown size={14} className="text-yellow-400" />
                          <span className="text-sm font-medium text-yellow-400">{t('spaces.role_founder')}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold ml-auto">{t('spaces.fullAccess')}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-relaxed">{t('spaces.founderHint')}</p>
                      </div>

                      {/* ── Admin (fest) ── */}
                      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3 opacity-60 cursor-not-allowed">
                        <div className="flex items-center gap-2 mb-1">
                          <Shield size={14} className="text-red-400" />
                          <span className="text-sm font-medium text-red-400">{t('spaces.role_admin')}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold ml-auto">{t('spaces.fullAccess')}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-relaxed">{t('spaces.adminHint')}</p>
                      </div>

                      <p className="text-[10px] text-gray-600 px-1">{t('spaces.fullAccessHint')}</p>

                      {/* ── Benutzerdefinierte Rollen ── */}
                      {(selectedSpace.customRoles ?? []).map(cr => {
                        const SECTION_IDS = ["appearance", "tags", "visibility", "invite", "members", "chats", "roles"] as const;
                        return (
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
                                  // Rolle löschen + betroffene Mitglieder auf "guest" zurücksetzen
                                  const updated = {
                                    ...selectedSpace,
                                    customRoles: (selectedSpace.customRoles ?? []).filter(r => r.id !== cr.id),
                                    members: selectedSpace.members.map(m =>
                                      m.role === (cr.name as SpaceRole) ? { ...m, role: "guest" as SpaceRole } : m
                                    ),
                                  };
                                  saveSettings(updated);
                                }} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(["inviteMembers", "removeMembers", "manageChats", "postNews", "createEvents", "viewSettings"] as const).map(key => (
                                <span key={key} className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${cr.permissions[key] ? "bg-green-500/15 text-green-400" : "bg-gray-800 text-gray-600"}`}>
                                  {t(`spaces.perm_${key}`)}
                                </span>
                              ))}
                            </div>
                            {cr.permissions.viewSettings && (cr.permissions.visibleSettingsSections ?? []).length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {(cr.permissions.visibleSettingsSections ?? []).map(sec => (
                                  <span key={sec} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/15 text-blue-400">
                                    {t(`spaces.section_${sec}`)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Rolle erstellen / bearbeiten */}
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
                          {/* Berechtigungen */}
                          <div className="space-y-1">
                            {(["inviteMembers", "removeMembers", "manageChats", "postNews", "createEvents", "viewSettings", "manageCalendar", "manageSchedule", "reportAbsence", "viewAbsenceDetails", "manageBookingSlots", "sendPushToAll"] as const).map(perm => (
                              <button key={perm}
                                onClick={() => {
                                  setNewRolePerms(prev => {
                                    const next = { ...prev, [perm]: !prev[perm] };
                                    if (perm === "viewSettings" && !next.viewSettings) next.visibleSettingsSections = [];
                                    return next;
                                  });
                                }}
                                className="w-full flex items-center justify-between p-2.5 rounded-lg transition-colors hover:bg-gray-800/50 bg-gray-900/30">
                                <span className="text-xs text-gray-300">{t(`spaces.perm_${perm}`)}</span>
                                <div className={`w-8 h-5 rounded-full transition-colors relative ${newRolePerms[perm] ? "bg-blue-600" : "bg-gray-700"}`}>
                                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${newRolePerms[perm] ? "translate-x-3.5" : "translate-x-0.5"}`} />
                                </div>
                              </button>
                            ))}
                          </div>
                          {/* Einstellungen-Sektionen Dropdown (nur wenn viewSettings aktiv) */}
                          {newRolePerms.viewSettings && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-gray-400">{t('spaces.settingsSections')}</label>
                              <p className="text-[10px] text-gray-600">{t('spaces.settingsSectionsHint')}</p>
                              <div className="space-y-1">
                                {(["appearance", "tags", "visibility", "invite", "members", "chats", "roles"] as const).map(sec => {
                                  const active = (newRolePerms.visibleSettingsSections ?? []).includes(sec);
                                  return (
                                    <button key={sec}
                                      onClick={() => {
                                        setNewRolePerms(prev => {
                                          const sections = [...(prev.visibleSettingsSections ?? [])];
                                          if (active) {
                                            return { ...prev, visibleSettingsSections: sections.filter(s => s !== sec) };
                                          } else {
                                            return { ...prev, visibleSettingsSections: [...sections, sec] };
                                          }
                                        });
                                      }}
                                      className="w-full flex items-center justify-between p-2 rounded-lg transition-colors hover:bg-gray-800/50 bg-gray-900/30">
                                      <span className="text-[11px] text-gray-300">{t(`spaces.section_${sec}`)}</span>
                                      <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${active ? "bg-blue-600" : "bg-gray-700"}`}>
                                        {active && <Check size={10} className="text-white" />}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              if (!newRoleName.trim() || !selectedSpace) return;
                              const perms = { ...newRolePerms, visibleSettingsSections: [...(newRolePerms.visibleSettingsSections ?? [])] };
                              if (!perms.viewSettings) perms.visibleSettingsSections = [];
                              if (editingRoleId) {
                                saveSettings({
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
                                saveSettings({ ...selectedSpace, customRoles: [...(selectedSpace.customRoles ?? []), role] });
                              }
                              setNewRoleName(""); setNewRoleColor("#3b82f6");
                              setNewRolePerms({ inviteMembers: false, removeMembers: false, manageChats: false, postNews: false, createEvents: false, viewSettings: false, visibleSettingsSections: [], manageCalendar: false, manageSchedule: false, reportAbsence: false, viewAbsenceDetails: false, manageBookingSlots: false, sendPushToAll: false });
                              setShowCreateRole(false);
                              setEditingRoleId(null);
                            }}
                            disabled={!newRoleName.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-all text-sm">
                            {editingRoleId ? t('spaces.editRole') : t('spaces.createRole')}
                          </button>
                        </div>
                      )}

                      {/* ── Gast (fest, nur lesen) ── */}
                      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3 opacity-60 cursor-not-allowed">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full bg-gray-600" />
                          <span className="text-sm font-medium text-gray-400">{t('spaces.role_guest')}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-500 ml-auto">{t('spaces.guestReadOnly')}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-relaxed">{t('spaces.guestRoleHint')}</p>
                      </div>
                  </SettingsSection>
                    </div>
                  </div>

                  {/* ━━ Gruppe 4: Sicherheit & Kontrolle ━━ */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest px-2 mb-2">{t('spaces.settingsGroupSecurity')}</p>
                    <div className="rounded-2xl overflow-hidden border border-gray-700/40 divide-y divide-gray-700/40">
                  <SettingsSection id="transfer" icon={<Crown size={16} />} title={t('spaces.transferFounder')} visible={myRole === "founder"} isOpen={settingsOpen["transfer"] ?? false} onToggle={() => toggleSection("transfer")}>
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
                  </SettingsSection>

                  {/* ── FSK Verifizierung — nur Gruender ── */}
                  <SettingsSection id="spaceFsk" icon={<Shield size={16} />} title={t('spaces.fskVerification')} visible={myRole === "founder"} isOpen={settingsOpen["spaceFsk"] ?? false} onToggle={() => toggleSection("spaceFsk")}>
                    <div className="space-y-4">
                      {/* Aktueller Status */}
                      <div className="flex items-center gap-3 bg-gray-900/50 rounded-xl p-3">
                        <div className={`w-3 h-3 rounded-full ${selectedSpace.fsk === 18 ? 'bg-red-400' : selectedSpace.fsk === 16 ? 'bg-orange-400' : selectedSpace.fsk === 12 ? 'bg-yellow-400' : 'bg-green-400'}`} />
                        <div>
                          <p className="text-sm font-medium">FSK {selectedSpace.fsk}</p>
                          <p className="text-[10px] text-gray-500">{selectedSpace.fsk === 18 ? t('spaces.fskDefaultHint') : t('spaces.fskApprovedHint')}</p>
                        </div>
                      </div>

                      {/* Erklaerung */}
                      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                        <p className="text-xs text-orange-300/80 leading-relaxed">{t('spaces.fskExplanation')}</p>
                      </div>

                      {/* Antrag-Formular */}
                      {selectedSpace.fsk === 18 && !fskAntragSent && (
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('spaces.fskApplicationTitle')}</p>

                          <div className="space-y-1">
                            <label className="text-[11px] text-gray-500">{t('spaces.fskInstitution')}</label>
                            <input type="text" value={fskAntragInstitution} onChange={e => setFskAntragInstitution(e.target.value)} placeholder={t('spaces.fskInstitutionPlaceholder')} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all" />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] text-gray-500">{t('spaces.fskWebsite')}</label>
                            <input type="url" value={fskAntragWebsite} onChange={e => setFskAntragWebsite(e.target.value)} placeholder="https://..." className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all" />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] text-gray-500">{t('spaces.fskEmail')}</label>
                            <input type="email" value={fskAntragEmail} onChange={e => setFskAntragEmail(e.target.value)} placeholder="kontakt@institution.de" className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all" />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] text-gray-500">{t('spaces.fskDesiredLevel')}</label>
                            <div className="grid grid-cols-3 gap-2">
                              {([6, 12, 16] as const).map(level => (
                                <button key={level} onClick={() => setFskAntragStufe(level)} className={`py-2 rounded-xl text-sm font-bold transition-all ${fskAntragStufe === level ? (level === 6 ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500' : level === 12 ? 'bg-yellow-500/20 text-yellow-400 ring-2 ring-yellow-500' : 'bg-orange-500/20 text-orange-400 ring-2 ring-orange-500') : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                                  FSK {level}
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            disabled={!fskAntragInstitution.trim() || !fskAntragEmail.trim()}
                            onClick={async () => {
                              const title = `FSK-Antrag: ${selectedSpace.name} \u2192 FSK ${fskAntragStufe}`;
                              const body = [
                                `| Feld | Wert |`,
                                `|------|------|`,
                                `| **Space** | ${selectedSpace.name} |`,
                                `| **Space-ID** | \`${selectedSpace.id}\` |`,
                                `| **Gr\u00fcnder-ID** | \`${selectedSpace.founderId}\` |`,
                                `| **Institution** | ${fskAntragInstitution} |`,
                                `| **Webseite** | ${fskAntragWebsite || '\u2014'} |`,
                                `| **E-Mail** | ${fskAntragEmail} |`,
                                `| **Gew\u00fcnschte Stufe** | FSK ${fskAntragStufe} |`,
                                `| **Datum** | ${new Date().toISOString()} |`,
                              ].join('\n');
                              try {
                                const res = await fetch('https://api.github.com/repos/Arego367/Aregoland/issues', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(window as any).__AREGO_GH_TOKEN ?? ''}` },
                                  body: JSON.stringify({ title, body, labels: ['fsk-antrag'] }),
                                });
                                if (!res.ok) throw new Error();
                              } catch {
                                // Fallback: Issue via URL oeffnen
                                const params = new URLSearchParams({ title, body, labels: 'fsk-antrag' });
                                window.open(`https://github.com/Arego367/Aregoland/issues/new?${params.toString()}`, '_blank');
                              }
                              setFskAntragSent(true);
                              onShowToast?.(t('spaces.fskApplicationSentToast'));
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                          >
                            <Send size={14} />
                            {t('spaces.fskSendApplication')}
                          </button>
                        </div>
                      )}

                      {fskAntragSent && selectedSpace.fsk === 18 && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex gap-2">
                          <Check size={16} className="text-green-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-green-300/80">{t('spaces.fskApplicationSent')}</p>
                        </div>
                      )}

                      {/* Freischaltcode eingeben */}
                      <div className="space-y-2 pt-2 border-t border-gray-700/50">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('spaces.fskActivationTitle')}</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={fskFreischaltcode}
                            onChange={e => setFskFreischaltcode(e.target.value.toUpperCase())}
                            placeholder={t('spaces.fskCodePlaceholder')}
                            className="flex-1 bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500 transition-all font-mono tracking-wider"
                          />
                          <button
                            disabled={!fskFreischaltcode.trim()}
                            onClick={async () => {
                              const result = await redeemFskCode(selectedSpace.id, fskFreischaltcode.trim());
                              if (result) {
                                const updated = { ...selectedSpace, fsk: result.fsk_stufe as FskLevel };
                                updateSpace(updated);
                                setFskFreischaltcode("");
                                onShowToast?.(t('spaces.fskActivated', { level: result.fsk_stufe }));
                              } else {
                                onShowToast?.(t('spaces.fskInvalidCode'), 'warning');
                              }
                            }}
                            className="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-xl transition-all text-sm"
                          >
                            {t('spaces.fskActivate')}
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-600">{t('spaces.fskCodeHint')}</p>
                      </div>
                    </div>
                  </SettingsSection>
                    </div>
                  </div>

                  {/* ── Space löschen — mehrstufig ── */}
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

            {/* ── STATUS TAB ── */}
            {activeTab === "status" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "guest";
              const isModRole = myRole === "founder" || myRole === "admin";
              const statusCustomRole = (selectedSpace.customRoles ?? []).find(cr => cr.name === myRole);
              const isModerator = isModRole || !!statusCustomRole?.permissions.viewAbsenceDetails;

              if (!isModerator) return null; // guests have no access

              const todayStr = new Date().toISOString().slice(0, 10);
              const viewerType = isModRole || statusCustomRole?.permissions.viewAbsenceDetails ? "moderator" : "member";
              const visibility = resolveVisibility(viewerType, true);
              const allAbsences = getAbsencesBySpace(selectedSpace.id);
              const visibleAbsences = filterByVisibility(allAbsences, visibility) as MemberAbsenceStatus[];
              const activeAbsences = visibleAbsences.filter(s => {
                if (s.startDate > todayStr) return false;
                if (s.endDate && s.endDate < todayStr) return false;
                return true;
              });

              const filtered = (statusFilter === "all" ? activeAbsences : activeAbsences.filter(a => a.type === statusFilter));
              const sorted = [...filtered].sort((a, b) => {
                if (statusSort === "name") {
                  const nameA = selectedSpace.members.find(m => m.aregoId === a.memberId)?.displayName ?? "";
                  const nameB = selectedSpace.members.find(m => m.aregoId === b.memberId)?.displayName ?? "";
                  return nameA.localeCompare(nameB);
                }
                return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
              });

              const typeIcon = (type: AbsenceStatusType) => {
                switch (type) {
                  case "sick": return "🤒";
                  case "vacation": return "🏖️";
                  case "homeoffice": return "🏠";
                  case "other": return "📋";
                }
              };
              const typeColor = (type: AbsenceStatusType) => {
                switch (type) {
                  case "sick": return "text-red-400 bg-red-500/10 border-red-500/30";
                  case "vacation": return "text-blue-400 bg-blue-500/10 border-blue-500/30";
                  case "homeoffice": return "text-green-400 bg-green-500/10 border-green-500/30";
                  case "other": return "text-gray-400 bg-gray-500/10 border-gray-500/30";
                }
              };

              const totalMembers = selectedSpace.members.length;

              return (
                <div className="space-y-4">
                  {/* Summary banner */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
                          <ClipboardList size={20} className="text-rose-400" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {viewerType === "moderator"
                              ? t('spaces.statusBoardModeratorTitle')
                              : t('spaces.absenceStatusBoard')}
                          </div>
                          <div className="text-xs text-gray-500">
                            {t('spaces.absenceAbsentCount', { count: activeAbsences.length })} / {totalMembers} {t('spaces.members')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex gap-2 flex-wrap">
                    {(["all", "sick", "vacation", "homeoffice", "other"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          statusFilter === f
                            ? "border-rose-500 bg-rose-500/10 text-rose-300"
                            : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                        }`}
                      >
                        {f === "all" ? t('spaces.filterAll') : `${typeIcon(f)} ${t(`spaces.absenceType${f.charAt(0).toUpperCase() + f.slice(1)}`)}`}
                      </button>
                    ))}
                  </div>

                  {/* Sort toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStatusSort(statusSort === "name" ? "date" : "name")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 transition-all"
                    >
                      <ArrowUpDown size={12} />
                      {statusSort === "name" ? t('spaces.sortByName') : t('spaces.sortByDate')}
                    </button>
                  </div>

                  {/* Absence list */}
                  {sorted.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
                        <CheckCircle2 size={28} className="text-green-500" />
                      </div>
                      <p className="text-sm text-gray-400">{t('spaces.absenceNoAbsences')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sorted.map(absence => {
                        const member = selectedSpace.members.find(m => m.aregoId === absence.memberId);
                        const reporter = viewerType === "moderator" && absence.reportedBy
                          ? selectedSpace.members.find(m => m.aregoId === absence.reportedBy)
                          : null;
                        const dateLabel = absence.endDate
                          ? `${absence.startDate} – ${absence.endDate}`
                          : t('spaces.absenceSince', { date: absence.startDate });
                        return (
                          <div key={absence.id} className={`rounded-xl border p-3 ${typeColor(absence.type)}`}>
                            <div className="flex items-start gap-3">
                              <div className="text-lg mt-0.5">{typeIcon(absence.type)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-white truncate">
                                    {member?.displayName ?? absence.memberId}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/50 text-gray-400 shrink-0">
                                    {t(`spaces.absenceType${absence.type.charAt(0).toUpperCase() + absence.type.slice(1)}`)}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">{dateLabel}</div>
                                {absence.label && viewerType === "moderator" && (
                                  <div className="text-xs text-gray-400 mt-1">{absence.label}</div>
                                )}
                                {absence.note && viewerType === "moderator" && (
                                  <div className="text-xs text-gray-500 mt-1 italic">
                                    💬 {absence.note}
                                  </div>
                                )}
                                {reporter && viewerType === "moderator" && (
                                  <div className="text-[10px] text-gray-600 mt-1">
                                    {t('spaces.absenceReportedBy')}: {reporter.displayName}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── TIMETABLE TAB ── */}
            {activeTab === "timetable" && (() => {
              const myRole = selectedSpace.members.find(m => m.aregoId === identity?.aregoId)?.role ?? "guest";
              const isModRole = myRole === "founder" || myRole === "admin";
              const ttCustomRole = (selectedSpace.customRoles ?? []).find(cr => cr.name === myRole);
              const canManage = isModRole || !!ttCustomRole?.permissions.manageSchedule;
              const isChild = isChildAccount();

              const WEEKDAYS = [
                { key: 1, short: t('spaces.timetableMon') },
                { key: 2, short: t('spaces.timetableTue') },
                { key: 3, short: t('spaces.timetableWed') },
                { key: 4, short: t('spaces.timetableThu') },
                { key: 5, short: t('spaces.timetableFri') },
              ];

              const allSpaceEntries = getEntriesBySpace(selectedSpace.id);
              const entries = allSpaceEntries
                .filter(e => e.weekday === timetableDay)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
              const todayWeekday = new Date().getDay();
              const todayCancellations = allSpaceEntries.filter(e =>
                e.weekday === todayWeekday && (e.status === "cancelled" || e.status === "substitution")
              );
              void cancellationCount; // trigger re-render on status changes

              const statusColor = (s: TimetableEntryStatus) => {
                switch (s) {
                  case "normal": return "border-green-500/30 bg-green-500/5";
                  case "cancelled": return "border-red-500/30 bg-red-500/5";
                  case "substitution": return "border-orange-500/30 bg-orange-500/5";
                }
              };
              const statusLabel = (s: TimetableEntryStatus) => {
                switch (s) {
                  case "normal": return t('spaces.timetableStatusNormal');
                  case "cancelled": return t('spaces.timetableStatusCancelled');
                  case "substitution": return t('spaces.timetableStatusSubstitution');
                }
              };
              const statusBadgeColor = (s: TimetableEntryStatus) => {
                switch (s) {
                  case "normal": return "bg-green-500/20 text-green-400";
                  case "cancelled": return "bg-red-500/20 text-red-400";
                  case "substitution": return "bg-orange-500/20 text-orange-400";
                }
              };

              const openForm = (entry?: TimetableEntry) => {
                if (entry) {
                  setEditingEntry(entry);
                  setTtSubject(entry.subject);
                  setTtTeacher(entry.teacherName);
                  setTtRoom(entry.room);
                  setTtStart(entry.startTime);
                  setTtEnd(entry.endTime);
                  setTtStatus(entry.status);
                  setTtSubTeacher(entry.substituteTeacherName ?? "");
                  setTtSubRoom(entry.substituteRoom ?? "");
                  setTtNote(entry.statusNote ?? "");
                } else {
                  setEditingEntry(null);
                  setTtSubject("");
                  setTtTeacher("");
                  setTtRoom("");
                  setTtStart("08:00");
                  setTtEnd("08:45");
                  setTtStatus("normal");
                  setTtSubTeacher("");
                  setTtSubRoom("");
                  setTtNote("");
                }
                setShowTimetableForm(true);
              };

              const handleSave = () => {
                if (!ttSubject.trim() || !identity) return;
                if (editingEntry) {
                  const statusChanged = editingEntry.status !== ttStatus;
                  updateTimetableEntry(editingEntry.id, {
                    subject: ttSubject.trim(),
                    teacherName: ttTeacher.trim(),
                    room: ttRoom.trim(),
                    startTime: ttStart,
                    endTime: ttEnd,
                    status: ttStatus,
                    substituteTeacherName: ttStatus === "substitution" ? ttSubTeacher.trim() || undefined : undefined,
                    substituteRoom: ttStatus === "substitution" ? ttSubRoom.trim() || undefined : undefined,
                    statusNote: ttNote.trim() || undefined,
                  });
                  // Fire push notification when status changes to cancelled/substitution
                  if (statusChanged && (ttStatus === "cancelled" || ttStatus === "substitution")) {
                    notifyCancellation({
                      entryId: editingEntry.id,
                      spaceId: selectedSpace.id,
                      subject: ttSubject.trim(),
                      startTime: ttStart,
                      newStatus: ttStatus,
                      substituteTeacherName: ttStatus === "substitution" ? ttSubTeacher.trim() : undefined,
                    });
                    setCancellationCount(c => c + 1);
                  }
                } else {
                  addTimetableEntry({
                    spaceId: selectedSpace.id,
                    subject: ttSubject.trim(),
                    teacherId: "",
                    teacherName: ttTeacher.trim(),
                    room: ttRoom.trim(),
                    weekday: timetableDay,
                    startTime: ttStart,
                    endTime: ttEnd,
                    status: ttStatus,
                    createdBy: identity.aregoId,
                    ...(ttStatus === "substitution" ? {
                      substituteTeacherId: "",
                      substituteTeacherName: ttSubTeacher.trim(),
                      substituteRoom: ttSubRoom.trim() || undefined,
                    } : {}),
                    ...(ttNote.trim() ? { statusNote: ttNote.trim() } : {}),
                  });
                }
                setShowTimetableForm(false);
                setEditingEntry(null);
              };

              const handleDelete = (id: string) => {
                deleteTimetableEntry(id);
                setShowTimetableForm(false);
                setEditingEntry(null);
              };

              return (
                <div className="space-y-4">
                  {/* Cancellation alert banner */}
                  {todayCancellations.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                        <X size={16} className="text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-red-300">{t('spaces.timetableCancellationAlert')}</div>
                        <div className="text-[11px] text-red-400/70 mt-0.5">
                          {todayCancellations.map(e => e.subject).join(", ")}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Header */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                          <Calendar size={20} className="text-indigo-400" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{t('spaces.timetableTitle')}</div>
                          <div className="text-xs text-gray-500">
                            {entries.length} {t('spaces.timetableLessonCount', { count: entries.length })}
                          </div>
                        </div>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => openForm()}
                          className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-colors"
                        >
                          <Plus size={16} className="text-white" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Weekday selector */}
                  <div className="flex gap-1.5">
                    {WEEKDAYS.map(wd => (
                      <button
                        key={wd.key}
                        onClick={() => setTimetableDay(wd.key)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                          timetableDay === wd.key
                            ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                            : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                        }`}
                      >
                        {wd.short}
                      </button>
                    ))}
                  </div>

                  {/* Entry list */}
                  {entries.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
                        <Calendar size={28} className="text-gray-600" />
                      </div>
                      <p className="text-sm text-gray-400">{t('spaces.timetableEmpty')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {entries.map(entry => (
                        <div
                          key={entry.id}
                          className={`rounded-xl border p-3 ${statusColor(entry.status)} ${canManage ? "cursor-pointer hover:bg-gray-800/30" : ""}`}
                          onClick={canManage ? () => openForm(entry) : undefined}
                        >
                          <div className="flex items-start gap-3">
                            {/* Time column */}
                            <div className="text-center shrink-0 w-14">
                              <div className="text-sm font-bold text-white">{entry.startTime}</div>
                              <div className="text-[10px] text-gray-500">{entry.endTime}</div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${entry.status === "cancelled" ? "line-through text-red-400" : "text-white"}`}>
                                  {entry.subject}
                                </span>
                                {entry.status !== "normal" && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadgeColor(entry.status)}`}>
                                    {statusLabel(entry.status)}
                                  </span>
                                )}
                              </div>

                              {/* Teacher & Room — hidden for child view */}
                              {!isChild && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {entry.teacherName && <span>{entry.teacherName}</span>}
                                  {entry.teacherName && entry.room && <span> · </span>}
                                  {entry.room && <span>{entry.room}</span>}
                                </div>
                              )}

                              {/* Substitution info — hidden for child view */}
                              {!isChild && entry.status === "substitution" && entry.substituteTeacherName && (
                                <div className="text-xs text-orange-400 mt-1">
                                  {t('spaces.timetableSubstituteInfo', {
                                    teacher: entry.substituteTeacherName,
                                    room: entry.substituteRoom ?? entry.room,
                                  })}
                                </div>
                              )}

                              {/* Status note — moderators only */}
                              {canManage && entry.statusNote && (
                                <div className="text-xs text-gray-500 mt-1 italic">
                                  {entry.statusNote}
                                </div>
                              )}
                            </div>

                            {canManage && (
                              <ChevronRight size={14} className="text-gray-600 shrink-0 mt-1" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* School Holidays — Moderator CRUD */}
                  {canManage && (() => {
                    const holidays = getHolidaysBySpace(selectedSpace.id)
                      .sort((a, b) => a.startDate.localeCompare(b.startDate));

                    const openHolidayForm = (h?: import("@/app/types").SchoolHoliday) => {
                      if (h) {
                        setEditingHoliday(h);
                        setHdTitle(h.title);
                        setHdStart(h.startDate);
                        setHdEnd(h.endDate);
                        setHdType(h.type);
                      } else {
                        setEditingHoliday(null);
                        setHdTitle("");
                        setHdStart("");
                        setHdEnd("");
                        setHdType("holiday");
                      }
                      setShowHolidayForm(true);
                    };

                    const handleSaveHoliday = () => {
                      if (!hdTitle.trim() || !hdStart || !hdEnd || !identity) return;
                      if (editingHoliday) {
                        updateHoliday(editingHoliday.id, {
                          title: hdTitle.trim(),
                          startDate: hdStart,
                          endDate: hdEnd,
                          type: hdType,
                        });
                      } else {
                        addHoliday({
                          spaceId: selectedSpace.id,
                          title: hdTitle.trim(),
                          startDate: hdStart,
                          endDate: hdEnd,
                          type: hdType,
                          createdBy: identity.aregoId,
                        });
                      }
                      setShowHolidayForm(false);
                    };

                    const hdTypeIcon = (t: "holiday" | "closure" | "teacher_day") => {
                      switch (t) {
                        case "holiday": return "🎄";
                        case "closure": return "🔒";
                        case "teacher_day": return "👩‍🏫";
                      }
                    };

                    return (
                      <>
                        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-white">{t('spaces.schoolHolidayTitle')}</div>
                            <button onClick={() => openHolidayForm()}
                              className="w-6 h-6 rounded-md bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-colors">
                              <Plus size={12} className="text-white" />
                            </button>
                          </div>
                          {holidays.length === 0 ? (
                            <div className="text-[11px] text-gray-500 py-2">{t('spaces.schoolHolidayEmpty')}</div>
                          ) : (
                            <div className="space-y-1.5">
                              {holidays.map(h => (
                                <button key={h.id} onClick={() => openHolidayForm(h)}
                                  className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-gray-800 hover:bg-gray-700/50 border border-gray-700/50 transition-all text-left">
                                  <span className="text-sm">{hdTypeIcon(h.type)}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-medium text-white truncate">{h.title}</div>
                                    <div className="text-[10px] text-gray-500">{h.startDate} – {h.endDate}</div>
                                  </div>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{t(`spaces.schoolHolidayType_${h.type}`)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Holiday Form Modal */}
                        <AnimatePresence>
                          {showHolidayForm && (
                            <motion.div
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
                              onClick={() => setShowHolidayForm(false)}
                            >
                              <motion.div
                                initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
                                className="bg-gray-900 border border-gray-700/50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between">
                                  <h3 className="text-base font-bold text-white">
                                    {editingHoliday ? t('spaces.schoolHolidayEdit') : t('spaces.schoolHolidayAdd')}
                                  </h3>
                                  <button onClick={() => setShowHolidayForm(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <label className="text-xs text-gray-400 mb-1 block">{t('spaces.schoolHolidayName')}</label>
                                    <input value={hdTitle} onChange={e => setHdTitle(e.target.value)}
                                      placeholder={t('spaces.schoolHolidayNamePlaceholder')}
                                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none" />
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableStart')}</label>
                                      <input type="date" value={hdStart} onChange={e => setHdStart(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableEnd')}</label>
                                      <input type="date" value={hdEnd} onChange={e => setHdEnd(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 mb-1 block">{t('spaces.schoolHolidayTypeLabel')}</label>
                                    <div className="flex gap-1.5">
                                      {(["holiday", "closure", "teacher_day"] as const).map(tp => (
                                        <button key={tp} type="button" onClick={() => setHdType(tp)}
                                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                            hdType === tp
                                              ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                                              : "border-gray-700 bg-gray-800/50 text-gray-400"
                                          }`}>
                                          {hdTypeIcon(tp)} {t(`spaces.schoolHolidayType_${tp}`)}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  {editingHoliday && (
                                    <button onClick={() => { deleteHoliday(editingHoliday.id); setShowHolidayForm(false); }}
                                      className="px-4 py-2.5 rounded-xl bg-red-600/20 text-red-400 text-xs font-medium hover:bg-red-600/30 transition-colors">
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                  <button onClick={() => setShowHolidayForm(false)}
                                    className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-xs font-medium rounded-xl hover:bg-gray-700 transition-colors">
                                    {t('common.cancel')}
                                  </button>
                                  <button onClick={handleSaveHoliday} disabled={!hdTitle.trim() || !hdStart || !hdEnd}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors">
                                    {editingHoliday ? t('common.save') : t('spaces.schoolHolidayAdd')}
                                  </button>
                                </div>
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    );
                  })()}

                  {/* Child Schedule Config — OGS/Hort/Bus (Parent view) */}
                  {!isChild && !canManage && (() => {
                    const childProfiles: Record<string, { name?: string }> = (() => {
                      try { return JSON.parse(localStorage.getItem("arego_child_profiles") ?? "{}"); }
                      catch { return {}; }
                    })();
                    const childIds = Object.keys(childProfiles);
                    if (childIds.length === 0) return null;

                    const openChildConfig = (childId: string) => {
                      const existing = getConfigByChild(childId, selectedSpace.id);
                      setCsChildId(childId);
                      setCsExistingId(existing?.id ?? null);
                      setCsOgsStart(existing?.ogsStart ?? "");
                      setCsOgsEnd(existing?.ogsEnd ?? "");
                      setCsHortStart(existing?.hortStart ?? "");
                      setCsHortEnd(existing?.hortEnd ?? "");
                      setCsBusArr(existing?.busArrival ?? "");
                      setCsBusDep(existing?.busDeparture ?? "");
                      setCsNotes(existing?.notes ?? "");
                      setShowChildScheduleModal(true);
                    };

                    const handleSaveConfig = () => {
                      if (!identity || !csChildId) return;
                      const data = {
                        ogsStart: csOgsStart || undefined,
                        ogsEnd: csOgsEnd || undefined,
                        hortStart: csHortStart || undefined,
                        hortEnd: csHortEnd || undefined,
                        busArrival: csBusArr || undefined,
                        busDeparture: csBusDep || undefined,
                        notes: csNotes || undefined,
                        updatedBy: identity.aregoId,
                      };
                      if (csExistingId) {
                        updateScheduleConfig(csExistingId, data);
                      } else {
                        addScheduleConfig({
                          childId: csChildId,
                          spaceId: selectedSpace.id,
                          ...data,
                          updatedBy: identity.aregoId,
                        });
                      }
                      setShowChildScheduleModal(false);
                    };

                    return (
                      <>
                        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                          <div className="text-xs font-semibold text-white mb-2">{t('spaces.childScheduleTitle')}</div>
                          <div className="space-y-2">
                            {childIds.map(cid => {
                              const name = childProfiles[cid]?.name ?? cid.slice(0, 8);
                              const config = getConfigByChild(cid, selectedSpace.id);
                              const hasConfig = !!config;
                              return (
                                <button
                                  key={cid}
                                  onClick={() => openChildConfig(cid)}
                                  className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700/50 border border-gray-700/50 transition-all text-left"
                                >
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasConfig ? "bg-green-500/20" : "bg-gray-700"}`}>
                                    <User size={14} className={hasConfig ? "text-green-400" : "text-gray-500"} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-white truncate">{name}</div>
                                    <div className="text-[10px] text-gray-500">
                                      {hasConfig
                                        ? [config.ogsStart && "OGS", config.hortStart && "Hort", config.busArrival && "Bus"].filter(Boolean).join(" · ") || t('spaces.childScheduleConfigured')
                                        : t('spaces.childScheduleNotConfigured')}
                                    </div>
                                  </div>
                                  <ChevronRight size={14} className="text-gray-600 shrink-0" />
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Child Schedule Modal */}
                        <AnimatePresence>
                          {showChildScheduleModal && (
                            <motion.div
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
                              onClick={() => setShowChildScheduleModal(false)}
                            >
                              <motion.div
                                initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
                                className="bg-gray-900 border border-gray-700/50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between">
                                  <h3 className="text-base font-bold text-white">{t('spaces.childScheduleEditTitle')}</h3>
                                  <button onClick={() => setShowChildScheduleModal(false)} className="text-gray-500 hover:text-white">
                                    <X size={18} />
                                  </button>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-xs text-gray-400 font-medium">{t('spaces.childScheduleOgs')}</div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[10px] text-gray-500 mb-1 block">{t('spaces.timetableStart')}</label>
                                      <input type="time" value={csOgsStart} onChange={e => setCsOgsStart(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 mb-1 block">{t('spaces.timetableEnd')}</label>
                                      <input type="time" value={csOgsEnd} onChange={e => setCsOgsEnd(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                  </div>
                                  <div className="text-xs text-gray-400 font-medium">{t('spaces.childScheduleHort')}</div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[10px] text-gray-500 mb-1 block">{t('spaces.timetableStart')}</label>
                                      <input type="time" value={csHortStart} onChange={e => setCsHortStart(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 mb-1 block">{t('spaces.timetableEnd')}</label>
                                      <input type="time" value={csHortEnd} onChange={e => setCsHortEnd(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                  </div>
                                  <div className="text-xs text-gray-400 font-medium">{t('spaces.childScheduleBus')}</div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[10px] text-gray-500 mb-1 block">{t('spaces.childScheduleBusArrival')}</label>
                                      <input type="time" value={csBusArr} onChange={e => setCsBusArr(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 mb-1 block">{t('spaces.childScheduleBusDeparture')}</label>
                                      <input type="time" value={csBusDep} onChange={e => setCsBusDep(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 mb-1 block">{t('spaces.childScheduleNotes')}</label>
                                    <input value={csNotes} onChange={e => setCsNotes(e.target.value)}
                                      placeholder={t('spaces.childScheduleNotesPlaceholder')}
                                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none" />
                                  </div>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button onClick={() => setShowChildScheduleModal(false)}
                                    className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-xs font-medium rounded-xl hover:bg-gray-700 transition-colors">
                                    {t('common.cancel')}
                                  </button>
                                  <button onClick={handleSaveConfig}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors">
                                    {t('common.save')}
                                  </button>
                                </div>
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    );
                  })()}

                  {/* Day Plan View (Eltern + Kind) */}
                  {!canManage && (() => {
                    const childProfiles: Record<string, { name?: string }> = (() => {
                      try { return JSON.parse(localStorage.getItem("arego_child_profiles") ?? "{}"); }
                      catch { return {}; }
                    })();
                    const childIds = Object.keys(childProfiles);
                    const selectedChild = dayPlanChildId ?? (childIds[0] || identity?.aregoId || "");
                    const holiday = getHolidayForDate(selectedSpace.id, dayPlanDate);
                    const dayPlan = selectedChild ? buildDayPlan(selectedChild, dayPlanDate, selectedSpace.id) : [];

                    const typeIcon = (t: DayPlanEntryType) => {
                      switch (t) {
                        case "lesson": return "📚";
                        case "break": return "☕";
                        case "ogs": return "🏫";
                        case "bus": return "🚌";
                        case "hort": return "🎨";
                      }
                    };
                    const typeColor = (t: DayPlanEntryType) => {
                      switch (t) {
                        case "lesson": return "border-blue-500/30 bg-blue-500/5";
                        case "break": return "border-gray-500/30 bg-gray-500/5";
                        case "ogs": return "border-green-500/30 bg-green-500/5";
                        case "bus": return "border-yellow-500/30 bg-yellow-500/5";
                        case "hort": return "border-purple-500/30 bg-purple-500/5";
                      }
                    };

                    const shiftDate = (days: number) => {
                      const d = new Date(dayPlanDate + "T00:00:00");
                      d.setDate(d.getDate() + days);
                      setDayPlanDate(d.toISOString().slice(0, 10));
                    };

                    const dayLabel = (() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
                      if (dayPlanDate === today) return t('spaces.dayPlanToday');
                      if (dayPlanDate === tomorrow) return t('spaces.dayPlanTomorrow');
                      return new Date(dayPlanDate + "T00:00:00").toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
                    })();

                    // Filter for child view: only lessons and breaks
                    const visiblePlan = isChild
                      ? dayPlan.filter(e => e.type === "lesson" || e.type === "break")
                      : dayPlan;

                    return (
                      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-white">{t('spaces.dayPlanTitle')}</div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => shiftDate(-1)} className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-400">
                              <ArrowLeft size={12} />
                            </button>
                            <span className="text-[11px] text-gray-400 min-w-[70px] text-center">{dayLabel}</span>
                            <button onClick={() => shiftDate(1)} className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-400">
                              <ChevronRight size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Child selector (if multiple children) */}
                        {childIds.length > 1 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {childIds.map(cid => (
                              <button
                                key={cid}
                                onClick={() => setDayPlanChildId(cid)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                                  selectedChild === cid
                                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                                    : "border-gray-700 bg-gray-800/50 text-gray-400"
                                }`}
                              >
                                {childProfiles[cid]?.name ?? cid.slice(0, 8)}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Holiday notice */}
                        {holiday ? (
                          <div className="flex flex-col items-center py-6 text-center space-y-2">
                            <div className="text-2xl">🎉</div>
                            <div className="text-sm font-semibold text-white">{t('spaces.dayPlanNoSchool')}</div>
                            <div className="text-xs text-gray-500">{holiday.title}</div>
                          </div>
                        ) : visiblePlan.length === 0 ? (
                          <div className="flex flex-col items-center py-6 text-center space-y-2">
                            <div className="text-2xl">📭</div>
                            <div className="text-xs text-gray-400">{t('spaces.dayPlanEmpty')}</div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {visiblePlan.map((entry, i) => (
                              <div key={i} className={`rounded-lg border p-2.5 flex items-center gap-3 ${typeColor(entry.type)}`}>
                                <div className="text-base shrink-0">{typeIcon(entry.type)}</div>
                                <div className="text-center shrink-0 w-12">
                                  <div className="text-[11px] font-bold text-white">{entry.time}</div>
                                  {entry.time !== entry.endTime && (
                                    <div className="text-[9px] text-gray-500">{entry.endTime}</div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-xs font-medium ${entry.status === "cancelled" ? "line-through text-red-400" : "text-white"}`}>
                                    {entry.label}
                                  </div>
                                  {!isChild && entry.detail && (
                                    <div className={`text-[10px] mt-0.5 ${entry.status === "substitution" ? "text-orange-400" : "text-gray-500"}`}>
                                      {entry.detail}
                                    </div>
                                  )}
                                </div>
                                {entry.status && entry.status !== "normal" && (
                                  <div className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                                    entry.status === "cancelled" ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"
                                  }`}>
                                    {entry.status === "cancelled" ? "✕" : "↻"}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Create/Edit Form Modal */}
                  <AnimatePresence>
                    {showTimetableForm && canManage && (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
                        onClick={() => setShowTimetableForm(false)}
                      >
                        <motion.div
                          initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
                          className="bg-gray-900 border border-gray-700/50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-white">
                              {editingEntry ? t('spaces.timetableEditEntry') : t('spaces.timetableAddEntry')}
                            </h3>
                            <button onClick={() => setShowTimetableForm(false)} className="text-gray-500 hover:text-white">
                              <X size={18} />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableSubject')}</label>
                              <input
                                value={ttSubject} onChange={e => setTtSubject(e.target.value)}
                                placeholder={t('spaces.timetableSubjectPlaceholder')}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableTeacher')}</label>
                                <input
                                  value={ttTeacher} onChange={e => setTtTeacher(e.target.value)}
                                  placeholder={t('spaces.timetableTeacherPlaceholder')}
                                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableRoom')}</label>
                                <input
                                  value={ttRoom} onChange={e => setTtRoom(e.target.value)}
                                  placeholder={t('spaces.timetableRoomPlaceholder')}
                                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableStart')}</label>
                                <input
                                  type="time" value={ttStart} onChange={e => setTtStart(e.target.value)}
                                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableEnd')}</label>
                                <input
                                  type="time" value={ttEnd} onChange={e => setTtEnd(e.target.value)}
                                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                            </div>

                            {/* Status selector */}
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableStatusLabel')}</label>
                              <div className="flex gap-1.5">
                                {(["normal", "cancelled", "substitution"] as const).map(s => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => setTtStatus(s)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                      ttStatus === s
                                        ? s === "normal" ? "border-green-500 bg-green-500/10 text-green-300"
                                          : s === "cancelled" ? "border-red-500 bg-red-500/10 text-red-300"
                                          : "border-orange-500 bg-orange-500/10 text-orange-300"
                                        : "border-gray-700 bg-gray-800/50 text-gray-400"
                                    }`}
                                  >
                                    {statusLabel(s)}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Substitution fields */}
                            {ttStatus === "substitution" && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableSubTeacher')}</label>
                                  <input
                                    value={ttSubTeacher} onChange={e => setTtSubTeacher(e.target.value)}
                                    placeholder={t('spaces.timetableSubTeacherPlaceholder')}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableSubRoom')}</label>
                                  <input
                                    value={ttSubRoom} onChange={e => setTtSubRoom(e.target.value)}
                                    placeholder={t('spaces.timetableRoomPlaceholder')}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Status note */}
                            {ttStatus !== "normal" && (
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">{t('spaces.timetableStatusNote')}</label>
                                <input
                                  value={ttNote} onChange={e => setTtNote(e.target.value)}
                                  placeholder={t('spaces.timetableStatusNotePlaceholder')}
                                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 pt-1">
                            {editingEntry && (
                              <button
                                onClick={() => handleDelete(editingEntry.id)}
                                className="px-4 py-2.5 rounded-xl bg-red-600/20 text-red-400 text-xs font-medium hover:bg-red-600/30 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => setShowTimetableForm(false)}
                              className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-xs font-medium rounded-xl hover:bg-gray-700 transition-colors"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              onClick={handleSave}
                              disabled={!ttSubject.trim()}
                              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition-colors"
                            >
                              {editingEntry ? t('common.save') : t('spaces.timetableAddEntry')}
                            </button>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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

      {/* ── ABSENCE REPORT MODAL ── */}
      <AnimatePresence>
        {showAbsenceModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setShowAbsenceModal(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-gray-900 border border-gray-700/50 rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{t("spaces.reportAbsence")}</h3>
                <button onClick={() => setShowAbsenceModal(false)} className="p-1 text-gray-500 hover:text-white"><X size={20} /></button>
              </div>

              {/* Step indicator */}
              <div className="flex gap-1">
                {(absenceIsParent ? [0, 1, 2] : [0, 1, 2]).map(s => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${absenceStep >= s ? "bg-orange-500" : "bg-gray-700"}`} />
                ))}
              </div>

              {/* ── PARENT FLOW ── */}
              {absenceIsParent && absenceStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.absenceSelectChild")}</p>
                  <div className="space-y-2">
                    {absenceLinkedChildren.map(child => (
                      <button
                        key={child.child_id}
                        onClick={() => { setAbsenceSelectedChild(child.child_id); setAbsenceStep(1); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          absenceSelectedChild === child.child_id
                            ? "border-orange-500 bg-orange-500/10"
                            : "border-gray-700/50 bg-gray-800/50 hover:bg-gray-800"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-white">
                          {(child.firstName || child.displayName || child.child_id)?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="text-sm font-medium text-white">{child.firstName || child.displayName || child.child_id.slice(0, 8)}</span>
                        <ChevronRight size={16} className="ml-auto text-gray-600" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {absenceIsParent && absenceStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.absenceSelectType")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { type: "sick" as const, icon: Heart, label: t("spaces.absenceTypeSick"), color: "red" },
                      { type: "other" as const, icon: Info, label: t("spaces.absenceTypeOther"), color: "gray" },
                    ]).map(opt => (
                      <button
                        key={opt.type}
                        onClick={() => { setAbsenceType(opt.type); setAbsenceStep(2); }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                          absenceType === opt.type ? `border-${opt.color}-500 bg-${opt.color}-500/10` : "border-gray-700/50 bg-gray-800/50 hover:bg-gray-800"
                        }`}
                      >
                        <opt.icon size={24} className={`text-${opt.color}-400`} />
                        <span className="text-xs font-medium text-white">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {absenceIsParent && absenceStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.absenceConfirm")}</p>
                  {absenceType === "other" && (
                    <input
                      type="text" value={absenceLabel} onChange={e => setAbsenceLabel(e.target.value)}
                      placeholder={t("spaces.absenceLabelPlaceholder")}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500"
                    />
                  )}
                  <textarea
                    value={absenceNote} onChange={e => setAbsenceNote(e.target.value)}
                    placeholder={t("spaces.absenceNotePlaceholder")} rows={2}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setAbsenceStep(1)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">{t("common.back")}</button>
                    <button onClick={submitAbsenceReport} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-xl transition-colors">{t("spaces.absenceSubmit")}</button>
                  </div>
                </div>
              )}

              {/* ── EMPLOYEE FLOW ── */}
              {!absenceIsParent && absenceStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.absenceSelectType")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { type: "sick" as const, icon: Heart, label: t("spaces.absenceTypeSick"), color: "text-red-400", border: "border-red-500 bg-red-500/10" },
                      { type: "homeoffice" as const, icon: Home, label: t("spaces.absenceTypeHomeoffice"), color: "text-blue-400", border: "border-blue-500 bg-blue-500/10" },
                      { type: "vacation" as const, icon: Calendar, label: t("spaces.absenceTypeVacation"), color: "text-green-400", border: "border-green-500 bg-green-500/10" },
                      { type: "other" as const, icon: Info, label: t("spaces.absenceTypeOther"), color: "text-gray-400", border: "border-gray-500 bg-gray-500/10" },
                    ]).map(opt => (
                      <button
                        key={opt.type}
                        onClick={() => { setAbsenceType(opt.type); setAbsenceStep(1); }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                          absenceType === opt.type ? opt.border : "border-gray-700/50 bg-gray-800/50 hover:bg-gray-800"
                        }`}
                      >
                        <opt.icon size={24} className={opt.color} />
                        <span className="text-xs font-medium text-white">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!absenceIsParent && absenceStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.absenceSelectPeriod")}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAbsenceRangeMode("today")}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all ${
                        absenceRangeMode === "today" ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >{t("spaces.absenceToday")}</button>
                    <button
                      onClick={() => setAbsenceRangeMode("range")}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all ${
                        absenceRangeMode === "range" ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >{t("spaces.absenceDateRange")}</button>
                  </div>
                  {absenceRangeMode === "range" && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">{t("spaces.absenceFrom")}</label>
                        <input type="date" value={absenceStartDate} onChange={e => setAbsenceStartDate(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">{t("spaces.absenceTo")}</label>
                        <input type="date" value={absenceEndDate} onChange={e => setAbsenceEndDate(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setAbsenceStep(0)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">{t("common.back")}</button>
                    <button onClick={() => setAbsenceStep(2)} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-xl transition-colors">{t("common.next")}</button>
                  </div>
                </div>
              )}

              {!absenceIsParent && absenceStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.absenceConfirm")}</p>
                  <div className="bg-gray-800/50 rounded-xl p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">{t("spaces.absenceTypeLabel")}</span><span className="text-white font-medium">{t(`spaces.absenceType${absenceType.charAt(0).toUpperCase() + absenceType.slice(1)}`)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t("spaces.absencePeriodLabel")}</span><span className="text-white font-medium">{absenceRangeMode === "today" ? t("spaces.absenceToday") : `${absenceStartDate} – ${absenceEndDate || "?"}`}</span></div>
                  </div>
                  {absenceType === "other" && (
                    <input
                      type="text" value={absenceLabel} onChange={e => setAbsenceLabel(e.target.value)}
                      placeholder={t("spaces.absenceLabelPlaceholder")}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500"
                    />
                  )}
                  <textarea
                    value={absenceNote} onChange={e => setAbsenceNote(e.target.value)}
                    placeholder={t("spaces.absenceNotePlaceholder")} rows={2}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setAbsenceStep(1)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">{t("common.back")}</button>
                    <button onClick={submitAbsenceReport} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-xl transition-colors">{t("spaces.absenceSubmit")}</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOOKING TEMPLATE CREATOR MODAL ── */}
      <AnimatePresence>
        {showBookingWizard && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setShowBookingWizard(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-gray-900 border border-gray-700/50 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{t("spaces.bookingCreateSlots")}</h3>
                <button onClick={() => setShowBookingWizard(false)} className="p-1 text-gray-500 hover:text-white"><X size={20} /></button>
              </div>

              {/* Step indicator */}
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map(s => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${bookingStep >= s ? "bg-blue-500" : "bg-gray-700"}`} />
                ))}
              </div>

              {/* Step 0: Titel + Datum */}
              {bookingStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.bookingStepTitleDate")}</p>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">{t("spaces.bookingTemplateTitle")}</label>
                    <input
                      type="text" value={bookingTitle} onChange={e => setBookingTitle(e.target.value)}
                      placeholder={t("spaces.bookingTitlePlaceholder")}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">{t("spaces.bookingDateLabel")}</label>
                    <input
                      type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => bookingTitle.trim() && setBookingStep(1)}
                    disabled={!bookingTitle.trim()}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded-xl transition-colors"
                  >{t("common.next")}</button>
                </div>
              )}

              {/* Step 1: Zeitfenster */}
              {bookingStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.bookingTimeWindow")}</p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 mb-1 block">{t("spaces.bookingStartTime")}</label>
                      <input
                        type="time" value={bookingStartTime} onChange={e => setBookingStartTime(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 mb-1 block">{t("spaces.bookingEndTime")}</label>
                      <input
                        type="time" value={bookingEndTime} onChange={e => setBookingEndTime(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBookingStep(0)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">{t("common.back")}</button>
                    <button onClick={() => setBookingStep(2)} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors">{t("common.next")}</button>
                  </div>
                </div>
              )}

              {/* Step 2: Slot-Dauer + Pause */}
              {bookingStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.bookingSlotDuration")}</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[10, 15, 20, 30, 60].map(d => (
                      <button
                        key={d}
                        onClick={() => setBookingSlotDuration(d)}
                        className={`py-2.5 text-sm font-medium rounded-xl border transition-all ${
                          bookingSlotDuration === d
                            ? "border-blue-500 bg-blue-500/10 text-blue-300"
                            : "border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700"
                        }`}
                      >{d} min</button>
                    ))}
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">{t("spaces.bookingBreakBetween")}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 5, 10, 15].map(b => (
                        <button
                          key={b}
                          onClick={() => setBookingBreakMin(b)}
                          className={`py-2 text-sm font-medium rounded-xl border transition-all ${
                            bookingBreakMin === b
                              ? "border-blue-500 bg-blue-500/10 text-blue-300"
                              : "border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700"
                          }`}
                        >{b === 0 ? t("spaces.bookingNoBreak") : `${b} min`}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBookingStep(1)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">{t("common.back")}</button>
                    <button onClick={() => setBookingStep(3)} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors">{t("common.next")}</button>
                  </div>
                </div>
              )}

              {/* Step 3: Flexibilität */}
              {bookingStep === 3 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.bookingSlotFlex")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: "fixed" as const, icon: Lock, label: t("spaces.bookingFlexFixed"), desc: t("spaces.bookingFlexFixedDesc"), color: "blue" },
                      { value: "flexible" as const, icon: Clock, label: t("spaces.bookingFlexFlexible"), desc: t("spaces.bookingFlexFlexibleDesc"), color: "green" },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setBookingSlotFlex(opt.value)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                          bookingSlotFlex === opt.value ? `border-${opt.color}-500 bg-${opt.color}-500/10` : "border-gray-700/50 bg-gray-800/50 hover:bg-gray-800"
                        }`}
                      >
                        <opt.icon size={24} className={`text-${opt.color}-400`} />
                        <span className="text-xs font-medium text-white">{opt.label}</span>
                        <span className="text-[10px] text-gray-500 text-center">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBookingStep(2)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">{t("common.back")}</button>
                    <button onClick={() => setBookingStep(4)} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors">{t("common.next")}</button>
                  </div>
                </div>
              )}

              {/* Step 4: Preview + Bestätigen */}
              {bookingStep === 4 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{t("spaces.bookingPreview")}</p>
                  <div className="bg-gray-800/50 rounded-xl p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingTemplateTitle")}</span><span className="text-white font-medium">{bookingTitle}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingDateLabel")}</span><span className="text-white font-medium">{bookingDate}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingTimeWindow")}</span><span className="text-white font-medium">{bookingStartTime} – {bookingEndTime}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingSlotDuration")}</span><span className="text-white font-medium">{bookingSlotDuration} min</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingBreakBetween")}</span><span className="text-white font-medium">{bookingBreakMin} min</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingSlotFlex")}</span><span className="text-white font-medium">{bookingSlotFlex === "fixed" ? t("spaces.bookingFlexFixed") : t("spaces.bookingFlexFlexible")}</span></div>
                  </div>
                  {/* Generated slot preview */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">{t("spaces.bookingFreeSlots", { count: bookingPreviewSlots.length })}</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {bookingPreviewSlots.map((slot, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg text-sm">
                          <Clock size={12} className="text-blue-400 shrink-0" />
                          <span className="text-white">{slot.startTime} – {slot.endTime}</span>
                        </div>
                      ))}
                      {bookingPreviewSlots.length === 0 && (
                        <p className="text-xs text-gray-600 italic">{t("spaces.bookingNoSlotsGenerated")}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBookingStep(3)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">{t("common.back")}</button>
                    <button
                      onClick={submitBookingTemplate}
                      disabled={bookingPreviewSlots.length === 0}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded-xl transition-colors"
                    >{t("spaces.bookingConfirmCreate")}</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOOKING SLOT PICKER MODAL (Member) ── */}
      <AnimatePresence>
        {showSlotPicker && slotPickerTemplate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setShowSlotPicker(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-gray-900 border border-gray-700/50 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{t("spaces.bookingBookSlot")}</h3>
                <button onClick={() => setShowSlotPicker(false)} className="p-1 text-gray-500 hover:text-white"><X size={20} /></button>
              </div>

              {/* Template info */}
              <div className="bg-gray-800/50 rounded-xl p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingTemplateTitle")}</span><span className="text-white font-medium">{slotPickerTemplate.title}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingDateLabel")}</span><span className="text-white font-medium">{slotPickerTemplate.date}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t("spaces.bookingSlotDuration")}</span><span className="text-white font-medium">{slotPickerTemplate.slotDuration} min</span></div>
              </div>

              {/* Privacy-filtered slot list */}
              <div>
                <p className="text-xs text-gray-500 mb-2">{t("spaces.bookingSelectSlot")}</p>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {filterSlotsForMember(slotPickerTemplate.slots).map(slot => {
                    const isFree = slot.status === "free";
                    const isSelected = slotPickerConfirm === slot.id;
                    return (
                      <button
                        key={slot.id}
                        disabled={!isFree}
                        onClick={() => setSlotPickerConfirm(isSelected ? null : slot.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                          isSelected
                            ? "bg-blue-600/20 border border-blue-500 text-blue-300"
                            : isFree
                              ? "bg-gray-800/50 border border-gray-700/50 text-white hover:bg-gray-800"
                              : "bg-gray-800/30 border border-gray-800 text-gray-600 cursor-not-allowed"
                        }`}
                      >
                        <Clock size={14} className={isSelected ? "text-blue-400" : isFree ? "text-gray-400" : "text-gray-700"} />
                        <span className="flex-1 text-left">{slot.startTime} – {slot.endTime}</span>
                        {isFree && <span className="text-[10px] text-green-400">{t("spaces.bookingSlotFree")}</span>}
                        {slot.status === "booked" && <span className="text-[10px] text-gray-600">{t("spaces.bookingBooked")}</span>}
                        {slot.status === "blocked" && <Lock size={12} className="text-gray-600" />}
                        {isSelected && <Check size={14} className="text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Confirm / Request buttons */}
              <div className="flex gap-2">
                {slotPickerTemplate.slotFlex === "flexible" && (
                  <button
                    onClick={() => { setShowSlotPicker(false); openBookingRequestForm(slotPickerTemplate.id); }}
                    className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
                  >{t("spaces.bookingRequestSlot")}</button>
                )}
                <button
                  onClick={confirmBookSlot}
                  disabled={!slotPickerConfirm}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded-xl transition-colors"
                >{t("spaces.bookingConfirmBook")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOOKING REQUEST FORM MODAL (Member) ── */}
      <AnimatePresence>
        {showBookingRequest && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setShowBookingRequest(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-gray-900 border border-gray-700/50 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{t("spaces.bookingRequestSlot")}</h3>
                <button onClick={() => setShowBookingRequest(false)} className="p-1 text-gray-500 hover:text-white"><X size={20} /></button>
              </div>

              <p className="text-sm text-gray-400">{t("spaces.bookingRequestDesc")}</p>

              {/* Preferred times */}
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 block">{t("spaces.bookingPreferredTimes")}</label>
                {bookingReqTimes.map((time, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text" value={time}
                      onChange={e => {
                        const updated = [...bookingReqTimes];
                        updated[i] = e.target.value;
                        setBookingReqTimes(updated);
                      }}
                      placeholder={t("spaces.bookingTimePlaceholder")}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                    {bookingReqTimes.length > 1 && (
                      <button onClick={() => setBookingReqTimes(bookingReqTimes.filter((_, j) => j !== i))} className="p-1.5 text-gray-600 hover:text-red-400"><X size={16} /></button>
                    )}
                  </div>
                ))}
                {bookingReqTimes.length < 3 && (
                  <button
                    onClick={() => setBookingReqTimes([...bookingReqTimes, ""])}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  ><Plus size={12} /> {t("spaces.bookingAddTime")}</button>
                )}
              </div>

              {/* Message */}
              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">{t("spaces.bookingRequestMessage")}</label>
                <textarea
                  value={bookingReqMessage} onChange={e => setBookingReqMessage(e.target.value)}
                  placeholder={t("spaces.bookingRequestMsgPlaceholder")} rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-2">
                <button onClick={() => setShowBookingRequest(false)} className="flex-1 py-2.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">{t("common.cancel")}</button>
                <button
                  onClick={submitBookingRequest}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors"
                >{t("spaces.bookingRequestSubmit")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
    );
  }

  // ── INVITE VIEW ──
  // Fallback: alte Invite-View leitet auf Settings-Tab um
  if (view === "invite" && selectedSpace) {
    setView("detail");
    setActiveTab("settings");
    setSettingsInviteOpen(true);
    if (!inviteEncoded) handleOpenInvite();
  }

  return null;
}
