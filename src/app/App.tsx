import { useState, useEffect, useCallback, useRef, Component, type ReactNode, type ErrorInfo } from "react";

// ── Error Boundary ──────────────────────────────────────────────────────────
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', error, info.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#f87171', background: '#111827', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Fehler beim Rendern</h2>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#fca5a5' }}>{this.state.error.message}</pre>
          <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', color: '#6b7280', marginTop: 8 }}>{this.state.error.stack}</pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import WelcomeScreen from "@/app/components/WelcomeScreen";
import RegistrationScreen from "@/app/components/RegistrationScreen";
import ChatListScreen from "@/app/components/ChatListScreen";
import ProfileScreen from "@/app/components/ProfileScreen";
import QRCodeScreen from "@/app/components/QRCodeScreen";
import SettingsScreen from "@/app/components/SettingsScreen";
import DashboardScreen from "@/app/components/DashboardScreen";
import ChildProfileScreen from "@/app/components/ChildProfileScreen";
import PeopleScreen from "@/app/components/PeopleScreen";
import SpacesScreen from "@/app/components/SpacesScreen";
import ConnectScreen from "@/app/components/ConnectScreen";
import ChatScreen from "@/app/components/ChatScreen";
import DocumentsScreen from "@/app/components/DocumentsScreen";
import CalendarScreen from "@/app/components/CalendarScreen";
import { Tab } from "@/app/types";
import { loadIdentity, UserIdentity } from "@/app/auth/identity";
import { loadSubscription, hasAccess, initSubscription } from "@/app/auth/subscription";
import { loadFsk, initFsk, isFskVerified, isFeatureLocked } from "@/app/auth/fsk";
import { deriveRoomId, decodePayload } from "@/app/auth/share";
import { saveContact, isNonceUsed, markNonceUsed, loadContacts, removeContact } from "@/app/auth/contacts";
import {
  savePersistedChat, loadPersistedChats, updateChatLastMessage, deletePersistedChats,
  clearChatUnread, incrementChatUnread, getTotalUnread, deleteAllHistory,
  loadHistory, saveHistory, type StoredMessage,
  savePendingMessage, loadPendingMessages, removePendingMessages, updateMessagesStatus,
  deleteAllPending,
  loadContactStatuses, setContactStatus, getContactStatus, deleteContactStatus, deleteAllContactStatuses,
  type ContactStatus,
} from "@/app/lib/chats";
import { P2PManager, type P2PStatus, type CallSignal } from "@/app/lib/p2p-manager";
import { removePendingRequest, sendSpaceSync, type SpaceSyncPayload } from "@/app/lib/spaces-api";
import { SpaceVersionStore } from "@/app/lib/gossip";
import { Phone, PhoneOff, Video } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const DEFAULT_TABS: Tab[] = [
  { id: "all", label: "Alle" },
  { id: "family", label: "Familie" },
  { id: "friends", label: "Freunde" },
  { id: "work", label: "Arbeit" },
  { id: "child", label: "Kinder" },
  { id: "other", label: "Sonstige" },
];

function loadTabs(): Tab[] {
  try {
    const saved = JSON.parse(localStorage.getItem('arego_tabs') ?? '');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch { /* ignore */ }
  return DEFAULT_TABS;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<"welcome" | "registration" | "dashboard" | "chatList" | "profile" | "qrcode" | "settings" | "childProfile" | "people" | "spaces" | "connect" | "chatConversation" | "documents" | "calendar">("welcome");
  const [returnTo, setReturnTo] = useState<"dashboard" | "chatList" | "welcome" | "people" | "spaces" | "calendar" | "connect" | "documents">("dashboard");
  const [qrCodeMode, setQrCodeMode] = useState<"display" | "scan">("display");
  const [tabs, setTabsRaw] = useState<Tab[]>(loadTabs);
  const setTabs = useCallback((newTabs: Tab[]) => {
    setTabsRaw(newTabs);
    localStorage.setItem('arego_tabs', JSON.stringify(newTabs));
  }, []);
  const [activeChatData, setActiveChatData] = useState<{ id: string; name: string; avatarUrl: string; isGroup: boolean; roomId: string } | null>(null);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [subLocked, setSubLocked] = useState(false);
  const [fskStatus, setFskStatus] = useState(() => loadFsk());
  const [totalUnread, setTotalUnread] = useState(() => getTotalUnread());
  const [onlineContacts, setOnlineContacts] = useState<Set<string>>(new Set());
  const [chatListVersion, setChatListVersion] = useState(0);
  const [contactsVersion, setContactsVersion] = useState(0);
  const [contactStatusMap, setContactStatusMap] = useState<Record<string, ContactStatus>>(() => loadContactStatuses());

  // In-App Toast-Benachrichtigung (auf jedem Screen sichtbar)
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'warning'; onClick?: () => void; actionLabel?: string; onAction?: () => void } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Deep-Link in einen Space (spaceId + tab)
  const [spaceDeepLink, setSpaceDeepLink] = useState<{ spaceId: string; tab?: string } | null>(null);

  // Eingehender Anruf wenn Chat nicht offen
  const [incomingCall, setIncomingCall] = useState<{
    roomId: string; chatId: string; chatName: string; chatAvatar: string;
    callType: 'audio' | 'video';
  } | null>(null);
  const pendingCallOfferRef = useRef<CallSignal | null>(null);
  const pendingCallIceRef = useRef<CallSignal[]>([]);

  /** Setzt Contact-Status in localStorage + React State gleichzeitig */
  const updateContactStatus = useCallback((aregoId: string, status: ContactStatus) => {
    setContactStatus(aregoId, status);
    setContactStatusMap((prev) => ({ ...prev, [aregoId]: status }));
  }, []);

  // P2P Status Map für UI (roomId → { status, error })
  const [p2pStatuses, setP2PStatuses] = useState<Record<string, { status: P2PStatus; error: string | null }>>({});

  // Handler-Refs: wenn ein ChatScreen offen ist, leitet er eingehende Nachrichten/Status-Updates/Call-Signale hierüber
  const activeChatHandlerRef = useRef<((msg: StoredMessage) => void) | null>(null);
  const activeChatStatusRef = useRef<((msgId: string, newStatus: StoredMessage['status']) => void) | null>(null);
  const activeChatCallRef = useRef<((signal: import("@/app/lib/p2p-manager").CallSignal) => void) | null>(null);
  const activeChatDataRef = useRef(activeChatData);
  useEffect(() => { activeChatDataRef.current = activeChatData; }, [activeChatData]);
  const currentScreenRef = useRef(currentScreen);
  useEffect(() => { currentScreenRef.current = currentScreen; }, [currentScreen]);

  // ── P2P Connection Manager ─────────────────────────────────────────────────
  const managerRef = useRef<P2PManager | null>(null);
  if (!managerRef.current) managerRef.current = new P2PManager();
  const manager = managerRef.current;

  // Manager-Callbacks registrieren (einmalig)
  useEffect(() => {
    // Eingehende P2P-Nachricht
    manager.onMessage((roomId, msg) => {
      const msgId = msg.senderMsgId ?? `p2p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const stored: StoredMessage = {
        id: msgId,
        text: msg.text,
        sender: 'them',
        timestamp: msg.timestamp,
        status: 'delivered',
        type: msg.type ?? 'text',
        fileData: msg.fileData,
        fileName: msg.fileName,
        fileMime: msg.fileMime,
      };

      // Welcher Chat gehört zu diesem Room?
      const chat = loadPersistedChats().find((c) => c.roomId === roomId);
      const chatId = chat?.id;

      // Ist der Chat gerade offen?
      const isOpen =
        currentScreenRef.current === 'chatConversation' &&
        activeChatDataRef.current?.roomId === roomId &&
        activeChatHandlerRef.current;

      if (isOpen) {
        // Live an ChatScreen weiterleiten — als gelesen markieren
        stored.status = 'read';
        activeChatHandlerRef.current!(stored);
        // Lesebestätigung an Sender zurücksenden
        if (msg.senderMsgId) manager.sendReadReceipt(roomId, [msg.senderMsgId]);
      } else {
        // Hintergrund: in localStorage speichern
        const history = loadHistory(roomId);
        history.push(stored);
        saveHistory(roomId, history);
      }

      // Chat-Liste immer aktualisieren
      if (chatId) {
        updateChatLastMessage(chatId, msg.text);
        setChatListVersion((v) => v + 1);
        if (!isOpen) {
          incrementChatUnread(chatId);
          setTotalUnread(getTotalUnread());
          // In-App Toast-Popup
          const name = chat?.name ?? chatId;
          const preview = msg.type === 'image' ? 'Bild'
            : msg.type === 'file' ? (msg.fileName ?? 'Datei')
            : msg.text.length > 60 ? msg.text.slice(0, 60) + '...' : msg.text;
          setToast({ text: `${name}: ${preview}`, type: 'info' });
          // Browser-Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(name, {
              body: msg.text,
              icon: '/favicon.ico',
              tag: `arego-msg-${chatId}`,
              silent: false,
            });
          }
        }
      }
    });

    // Status-Updates → React State + Pending-Flush
    manager.onStatusChange((roomId, status, error) => {
      setP2PStatuses((prev) => ({ ...prev, [roomId]: { status, error } }));

      // Wenn Verbindung hergestellt → pending Nachrichten senden
      if (status === 'connected') {
        flushPending(roomId);
      }
    });

    async function flushPending(roomId: string) {
      const pending = loadPendingMessages(roomId);
      if (pending.length === 0) return;

      const delivered: string[] = [];
      for (const { msgId, text } of pending) {
        const ok = await manager.send(roomId, text, msgId);
        if (ok) delivered.push(msgId);
        else break; // Verbindung wieder weg → aufhören
      }

      if (delivered.length === 0) return;

      // History + Pending-Queue aktualisieren
      updateMessagesStatus(roomId, delivered, 'delivered');
      removePendingMessages(roomId, delivered);

      // Wenn ChatScreen offen → lokalen State aktualisieren
      if (activeChatDataRef.current?.roomId === roomId && activeChatStatusRef.current) {
        for (const msgId of delivered) {
          activeChatStatusRef.current(msgId, 'delivered');
        }
      }
    }

    // Anruf-Signaling → an ChatScreen oder globalen Handler weiterleiten
    manager.onCallSignal((roomId, signal) => {
      console.log('[App] Call-Signal empfangen:', signal.action, 'roomId:', roomId, 'chatOffen:', activeChatDataRef.current?.roomId === roomId, 'handler:', !!activeChatCallRef.current);

      // Chat ist offen → direkt weiterleiten
      if (activeChatDataRef.current?.roomId === roomId && activeChatCallRef.current) {
        activeChatCallRef.current(signal);
        return;
      }

      // Chat ist NICHT offen → Anruf puffern
      if (signal.action === 'offer') {
        pendingCallOfferRef.current = signal;
        pendingCallIceRef.current = [];
        const chat = loadPersistedChats().find((c) => c.roomId === roomId);
        if (chat) {
          setIncomingCall({
            roomId, chatId: chat.id, chatName: chat.name,
            chatAvatar: chat.avatarUrl, callType: signal.callType,
          });
        }
      } else if (signal.action === 'ice' && pendingCallOfferRef.current) {
        pendingCallIceRef.current.push(signal);
      } else if (signal.action === 'hangup') {
        pendingCallOfferRef.current = null;
        pendingCallIceRef.current = [];
        setIncomingCall(null);
      }
    });

    // Kontakt-Entfernung vom Peer über DataChannel empfangen
    manager.onContactRemoved((connRoomId, aregoId) => {
      // Name vor dem Löschen nachschlagen
      const contact = loadContacts().find((c) => c.aregoId === aregoId);
      const name = contact?.displayName ?? aregoId;
      handleContactRemovedByPeer(aregoId, name, connRoomId);
    });

    // Lesebestätigung vom Peer empfangen → Nachrichten-Status auf 'read' setzen
    manager.onReadReceipt((roomId, msgIds) => {
      updateMessagesStatus(roomId, msgIds, 'read');
      // Wenn ChatScreen offen → lokalen State aktualisieren
      if (activeChatDataRef.current?.roomId === roomId && activeChatStatusRef.current) {
        for (const msgId of msgIds) {
          activeChatStatusRef.current(msgId, 'read');
        }
      }
    });

    // Kontakt-Austausch über DataChannel — Status prüfen
    manager.onContactDiscovered((info) => {
      const status = getContactStatus(info.aregoId);
      if (status === 'removed') return; // entfernter Kontakt → nicht re-adden via Handshake

      // Prüfen ob Kontakt wirklich neu ist (für Toast)
      const isNew = !loadContacts().some((c) => c.aregoId === info.aregoId);

      saveContact({
        aregoId: info.aregoId,
        displayName: info.displayName,
        publicKeyJwk: info.publicKeyJwk,
        addedAt: new Date().toISOString(),
      });

      // PersistedChat anlegen wenn noch nicht vorhanden (damit Chat in Liste erscheint)
      const existingChats = loadPersistedChats();
      if (!existingChats.some((c) => c.id === info.aregoId)) {
        // Room-ID aus den aktiven Verbindungen ableiten
        const matchingRoom = manager.getRoomIds().find((rid) => rid.includes(info.aregoId));
        if (matchingRoom) {
          savePersistedChat({
            id: info.aregoId, name: info.displayName, avatarUrl: '',
            isGroup: false, lastMessage: '', roomId: matchingRoom,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sortKey: Date.now(), unreadCount: 0,
          });
        }
      }

      // Status auf 'pending' setzen wenn noch kein Status existiert
      if (isNew && !status) {
        updateContactStatus(info.aregoId, 'pending');
      }

      setContactsVersion((v) => v + 1);
      setChatListVersion((v) => v + 1);

      // In-App Toast + Browser-Notification für neue Kontakte
      if (isNew) {
        console.log('[App] Neuer Kontakt via P2P entdeckt:', info.displayName, info.aregoId);
        setToast({ text: `${info.displayName} hat dich als Kontakt hinzugefügt`, type: 'info' });
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Neuer Kontakt', {
            body: `${info.displayName} hat dich als Kontakt hinzugefügt`,
            icon: '/favicon.ico',
            tag: `arego-contact-${info.aregoId}`,
          });
        }
      }
    });

    return () => manager.disconnectAll();
  }, [manager]);

  // ── Verbindungen starten wenn Identität da ────────────────────────────────
  useEffect(() => {
    if (!identity) return;

    // Identity-Payload für alle Verbindungen
    manager.setIdentityPayload(
      JSON.stringify({
        aregoId: identity.aregoId,
        displayName: identity.displayName,
        publicKeyJwk: identity.publicKeyJwk,
      }),
    );

    // Für jeden persistierten Chat eine Verbindung starten
    const chats = loadPersistedChats();
    for (const chat of chats) {
      if (chat.roomId.includes(':')) {
        manager.connect(chat.roomId);
      }
    }

    // Notification-Permission anfordern
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [identity?.aregoId, manager]);

  // ── Zentrale Logik: Kontakt wurde vom Peer entfernt ─────────────────────────
  const handleContactRemovedByPeer = useCallback((aregoId: string, displayName: string, roomId: string | null) => {
    // Status auf 'removed' setzen — Chat bleibt sichtbar, aber gesperrt
    updateContactStatus(aregoId, 'removed');

    // System-Nachricht in Chat-History schreiben
    if (roomId) {
      const history = loadHistory(roomId);
      history.push({
        id: `sys-${Date.now()}`,
        text: `${displayName} hat dich aus den Kontakten entfernt.`,
        sender: 'them',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'read',
        type: 'text',
      });
      saveHistory(roomId, history);
    }

    // Kontakt aus Kontaktliste entfernen (aber PersistedChat bleibt!)
    removeContact(aregoId);
    setContactsVersion((v) => v + 1);
    setChatListVersion((v) => v + 1);
    setOnlineContacts((prev) => { const next = new Set(prev); next.delete(aregoId); return next; });

    // P2P-Verbindung trennen
    if (roomId) manager.disconnect(roomId);

    // In-App Toast + Browser-Notification
    setToast({ text: `${displayName} hat dich aus den Kontakten entfernt`, type: 'warning' });
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Kontakt entfernt', {
        body: `${displayName} hat dich aus den Kontakten entfernt`,
        icon: '/favicon.ico',
        tag: `arego-remove-${aregoId}`,
      });
    }
  }, [manager, updateContactStatus]);

  // Einmaliger Beta-Willkommens-Toast
  const [showBetaWelcome, setShowBetaWelcome] = useState(false);
  const dismissBetaWelcome = useCallback(() => {
    setShowBetaWelcome(false);
    sessionStorage.setItem('aregoland_beta_welcome_seen', 'true');
  }, []);

  // Dark Mode beim Start anwenden
  useEffect(() => {
    const isDark = localStorage.getItem('aregoland_dark_mode') !== 'false';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  }, []);

  // Beim Start prüfen ob bereits eine Identität existiert → direkt zum Startscreen
  useEffect(() => {
    const existing = loadIdentity();
    if (existing) {
      setIdentity(existing);
      // FSK-Status laden — Legacy-Accounts ohne FSK erhalten initFsk
      let fsk = loadFsk();
      if (!fsk) fsk = initFsk();
      setFskStatus(fsk);
      // Abo pruefen — Legacy-Accounts ohne Subscription erhalten ein Trial
      let sub = loadSubscription();
      if (!sub) sub = initSubscription();
      if (!hasAccess(sub)) {
        setSubLocked(true);
        setCurrentScreen("settings");
        return;
      }
      const saved = localStorage.getItem("aregoland_start_screen");
      const screenMap: Record<string, string> = { community: "spaces" };
      const mapped = screenMap[saved ?? ""] ?? saved;
      const validScreens = ["dashboard", "chatList", "calendar", "people", "spaces", "connect", "documents", "pay"];
      if (mapped && validScreens.includes(mapped)) {
        setCurrentScreen(mapped as any);
        setReturnTo(mapped === "chatList" ? "chatList" : "dashboard");
      } else {
        setCurrentScreen("dashboard");
      }
    }
  }, []);

  // Beta-Willkommens-Toast nach Login anzeigen (einmalig)
  useEffect(() => {
    if (identity && sessionStorage.getItem('aregoland_beta_welcome_seen') !== 'true') {
      setShowBetaWelcome(true);
    }
  }, [identity]);

  // Persistenter Inbox-Listener + Online-Presence
  useEffect(() => {
    if (!identity) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws-signal`);

    ws.onopen = async () => {
      const { hashAregoId } = await import('@/app/auth/crypto');
      const hashedId = await hashAregoId(identity.aregoId);
      ws.send(JSON.stringify({ type: 'join', roomId: `inbox:${hashedId}` }));
      const contacts = loadContacts();
      const hashedWatchIds = await Promise.all(contacts.map((c) => hashAregoId(c.aregoId)));
      ws.send(JSON.stringify({
        type: 'presence_subscribe',
        aregoId: hashedId,
        watchIds: hashedWatchIds,
      }));

      // Space-Sync passiert jetzt lazy per Gossip Protocol (space-meta: rooms)
      // wenn der User einen Space öffnet — nicht mehr beim App-Start

      // Invite-Registry Heartbeat (alle 2 Tage)
      try {
        const lastHb = localStorage.getItem('aregoland_invite_heartbeat');
        if (!lastHb || Date.now() - new Date(lastHb).getTime() > 2 * 24 * 60 * 60 * 1000) {
          import('@/app/auth/crypto').then(({ hashAregoId }) =>
            hashAregoId(identity.aregoId).then(hashed =>
              fetch('/invite/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ founderId: hashed }),
              }).then(() => localStorage.setItem('aregoland_invite_heartbeat', new Date().toISOString()))
            )
          ).catch(() => {});
        }
      } catch { /* ignore */ }
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);

        if (msg.type === 'presence_update' && msg.statuses) {
          setOnlineContacts((prev) => {
            const next = new Set(prev);
            for (const [id, online] of Object.entries(msg.statuses)) {
              if (online) next.add(id); else next.delete(id);
            }
            return next;
          });
          return;
        }

        // Kontakt-Entfernung über Inbox empfangen
        if (msg.type === 'contact_removed' && typeof msg.aregoId === 'string') {
          const removedId = msg.aregoId;
          const name = msg.displayName ?? removedId;
          const rid = identity ? deriveRoomId(identity.aregoId, removedId) : null;
          handleContactRemovedByPeer(removedId, name, rid);
          return;
        }

        // Beitrittsanfrage empfangen (Gründer)
        if (msg.type === 'join_request' && typeof msg.user_name === 'string') {
          const reqSpaceId = msg.space_id;
          const reqUserId = msg.user_id;
          const reqUserName = msg.user_name || msg.user_id;
          setToast({
            text: `Neue Beitrittsanfrage von ${reqUserName}`,
            type: 'info',
            onClick: () => {
              setSpaceDeepLink({ spaceId: reqSpaceId, tab: 'members' });
              setCurrentScreen('spaces');
              setToast(null);
            },
            actionLabel: 'Annehmen',
            onAction: async () => {
              if (!identity) return;
              // Space-Name aus localStorage holen
              try {
                const spaces: any[] = JSON.parse(localStorage.getItem('aregoland_spaces') ?? '[]');
                const sp = spaces.find((s: any) => s.id === reqSpaceId);
                await fetch('/join-request/respond', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    user_id: reqUserId, space_id: reqSpaceId,
                    gruender_id: identity.aregoId, action: 'approve',
                    space_name: sp?.name ?? '', space_template: sp?.template ?? 'community',
                    space_description: sp?.description ?? '', gruender_name: identity.displayName,
                  }),
                });
                // Mitglied lokal hinzufügen
                if (sp) {
                  sp.members = [...(sp.members ?? []), { aregoId: reqUserId, displayName: reqUserName, role: 'guest', joinedAt: new Date().toISOString() }];
                  localStorage.setItem('aregoland_spaces', JSON.stringify(spaces));
                }
              } catch { /* ignore */ }
              setToast(null);
            },
          });
          return;
        }

        // Beitrittsantwort empfangen (Antragsteller)
        if (msg.type === 'join_response' && typeof msg.space_id === 'string') {
          const spaceName = msg.space_name || 'Space';
          if (msg.action === 'approve') {
            // Space lokal anlegen
            try {
              const SPACES_KEY = 'aregoland_spaces';
              const existing: unknown[] = JSON.parse(localStorage.getItem(SPACES_KEY) ?? '[]');
              if (!existing.some((s: any) => s.id === msg.space_id) && identity) {
                const members: any[] = [];
                if (msg.gruender_id && msg.gruender_name) {
                  members.push({
                    aregoId: msg.gruender_id,
                    displayName: msg.gruender_name,
                    role: 'founder',
                    joinedAt: new Date().toISOString(),
                  });
                }
                members.push({
                  aregoId: identity.aregoId,
                  displayName: identity.displayName,
                  role: 'guest',
                  joinedAt: new Date().toISOString(),
                });
                const newSpace = {
                  id: msg.space_id,
                  name: spaceName,
                  description: msg.space_description ?? '',
                  template: msg.space_template ?? 'community',
                  color: 'from-purple-600 to-fuchsia-500',
                  identityRule: 'nickname',
                  founderId: msg.gruender_id ?? '',
                  members,
                  posts: [], channels: [], subrooms: [], customRoles: [],
                  tags: [],
                  guestPermissions: { readChats: true },
                  createdAt: new Date().toISOString(),
                  visibility: 'public',
                  settings: { membersVisible: true, coHostingAllowed: true, publicJoin: true, idVerification: false },
                };
                existing.push(newSpace);
                localStorage.setItem(SPACES_KEY, JSON.stringify(existing));
              }
            } catch { /* ignore */ }
            removePendingRequest(msg.space_id);
            const approvedSpaceId = msg.space_id;
            setToast({
              text: `Deine Anfrage für „${spaceName}" wurde angenommen`,
              type: 'info',
              onClick: () => {
                setSpaceDeepLink({ spaceId: approvedSpaceId, tab: 'overview' });
                setCurrentScreen('spaces');
                setToast(null);
              },
            });
          } else {
            removePendingRequest(msg.space_id);
            setToast({
              text: `Deine Anfrage für „${spaceName}" wurde abgelehnt`,
              type: 'warning',
              onClick: () => {
                setCurrentScreen('spaces');
                setToast(null);
              },
            });
          }
          return;
        }

        // Space-Sync-Request von Mitglied — Founder antwortet mit vollständigen Daten
        if (msg.type === 'space_sync_request' && typeof msg.requester_id === 'string' && typeof msg.space_id === 'string') {
          try {
            const SPACES_KEY = 'aregoland_spaces';
            const APPEARANCE_KEY = 'aregoland_space_appearance';
            const spaces: any[] = JSON.parse(localStorage.getItem(SPACES_KEY) ?? '[]');
            // Gossip: Jedes Mitglied kann antworten (nicht nur Founder)
            const space = spaces.find((s: any) => s.id === msg.space_id);
            if (space) {
              const appearance = (() => { try { const all = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? '{}'); return all[space.id] ?? undefined; } catch { return undefined; } })();
              const payload: SpaceSyncPayload = {
                space_id: space.id,
                name: space.name,
                description: space.description ?? '',
                template: space.template,
                color: space.color,
                identityRule: space.identityRule ?? 'nickname',
                founderId: space.founderId,
                members: (space.members ?? []).map((m: any) => ({ aregoId: m.aregoId, displayName: m.displayName, role: m.role, joinedAt: m.joinedAt })),
                channels: (space.channels ?? []).map((ch: any) => ({ id: ch.id, spaceId: ch.spaceId, name: ch.name, isGlobal: ch.isGlobal, readRoles: ch.readRoles, writeRoles: ch.writeRoles, membersVisible: ch.membersVisible, createdAt: ch.createdAt })),
                customRoles: space.customRoles ?? [],
                tags: space.tags ?? [],
                visibility: space.visibility ?? 'private',
                guestPermissions: space.guestPermissions ?? { readChats: true },
                settings: space.settings ?? {},
                appearance,
              };
              sendSpaceSync(msg.requester_id, payload).catch(() => {});
            }
          } catch { /* ignore */ }
          return;
        }

        // Space-Sync empfangen (von jedem Mitglied, nicht nur Gründer)
        if (msg.type === 'space_sync' && typeof msg.space_id === 'string') {
          try {
            // Gelöschte Spaces ignorieren
            const deletedSpaces: string[] = JSON.parse(localStorage.getItem('aregoland_deleted_spaces') ?? '[]');
            if (deletedSpaces.includes(msg.space_id)) return;
            // Version prüfen — nur akzeptieren wenn neuer
            if (msg.versionMeta && !SpaceVersionStore.shouldAccept(msg.space_id, msg.versionMeta)) {
              return; // Lokale Version ist neuer oder gleich
            }
            const SPACES_KEY = 'aregoland_spaces';
            const APPEARANCE_KEY = 'aregoland_space_appearance';
            const existing: any[] = JSON.parse(localStorage.getItem(SPACES_KEY) ?? '[]');
            const idx = existing.findIndex((s: any) => s.id === msg.space_id);
            const mergedSpace = {
              ...(idx >= 0 ? existing[idx] : {}),
              id: msg.space_id,
              name: msg.name ?? existing[idx]?.name ?? '',
              description: msg.description ?? '',
              template: msg.template ?? 'community',
              color: msg.color ?? existing[idx]?.color ?? 'from-purple-600 to-fuchsia-500',
              identityRule: msg.identityRule ?? 'nickname',
              founderId: msg.founderId ?? '',
              members: msg.members ?? existing[idx]?.members ?? [],
              posts: existing[idx]?.posts ?? [],
              channels: msg.channels ?? existing[idx]?.channels ?? [],
              subrooms: existing[idx]?.subrooms ?? [],
              customRoles: msg.customRoles ?? [],
              tags: msg.tags ?? [],
              guestPermissions: msg.guestPermissions ?? { readChats: true },
              visibility: msg.visibility ?? 'private',
              settings: msg.settings ?? existing[idx]?.settings ?? {},
              createdAt: existing[idx]?.createdAt ?? new Date().toISOString(),
            };
            if (idx >= 0) {
              existing[idx] = mergedSpace;
            } else {
              existing.push(mergedSpace);
            }
            localStorage.setItem(SPACES_KEY, JSON.stringify(existing));

            // Appearance separat speichern
            if (msg.appearance) {
              const allApp = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? '{}');
              allApp[msg.space_id] = msg.appearance;
              localStorage.setItem(APPEARANCE_KEY, JSON.stringify(allApp));
            }
            // Version aktualisieren
            if (msg.versionMeta) {
              SpaceVersionStore.set(msg.space_id, msg.versionMeta);
            }
          } catch { /* ignore */ }
          return;
        }

        if (msg.type !== 'contact_reverse' || typeof msg.payload !== 'string') return;
        console.log('[App] contact_reverse empfangen via Inbox-WS');
        const p = decodePayload(msg.payload);
        if (!p || p.exp < Date.now()) { console.warn('[App] contact_reverse ungültig oder abgelaufen'); return; }
        if (isNonceUsed(p.n)) return;
        markNonceUsed(p.n);

        const prevStatus = getContactStatus(p.aregoId);
        const rid = identity ? deriveRoomId(identity.aregoId, p.aregoId) : null;

        // Kontakt speichern
        saveContact({
          aregoId: p.aregoId,
          displayName: p.displayName,
          publicKeyJwk: p.publicKeyJwk,
          addedAt: new Date().toISOString(),
        });

        if (prevStatus === 'removed') {
          // War entfernt → jetzt 'pending' (sie haben mich re-added, ich muss noch zurück-adden)
          updateContactStatus(p.aregoId, 'pending');

          // System-Nachricht
          if (rid) {
            const history = loadHistory(rid);
            history.push({
              id: `sys-${Date.now()}`,
              text: `${p.displayName} hat dich erneut als Kontakt hinzugefügt. Füge ${p.displayName} zurück hinzu um wieder schreiben zu können.`,
              sender: 'them', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              status: 'read', type: 'text',
            });
            saveHistory(rid, history);
            manager.connect(rid);
          }
        } else if (prevStatus === 'mutual') {
          // Bereits gegenseitig → nichts ändern
        } else {
          // Neuer Kontakt oder 'pending' → setze auf 'pending' (ich muss sie noch hinzufügen)
          if (prevStatus !== 'pending') {
            updateContactStatus(p.aregoId, 'pending');
          }

          // PersistedChat anlegen wenn noch nicht vorhanden
          if (rid) {
            const existing = loadPersistedChats().find((c) => c.id === p.aregoId);
            if (!existing) {
              savePersistedChat({
                id: p.aregoId, name: p.displayName, avatarUrl: '',
                isGroup: false, lastMessage: '', roomId: rid,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                sortKey: Date.now(), unreadCount: 0,
              });
            }
            manager.connect(rid);
          }
        }

        setContactsVersion((v) => v + 1);
        setChatListVersion((v) => v + 1);

        // In-App Toast + Browser-Notification
        setToast({ text: `${p.displayName} hat dich als Kontakt hinzugefügt`, type: 'info' });
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Neuer Kontakt', {
            body: `${p.displayName} hat dich als Kontakt hinzugefügt`,
            icon: '/favicon.ico',
            tag: `arego-contact-${p.aregoId}`,
          });
        }
      } catch { /* ignorieren */ }
    };

    ws.onerror = () => {};
    return () => ws.close();
  }, [identity?.aregoId]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const handleGetStarted = () => {
    const existing = loadIdentity();
    if (!existing) { setCurrentScreen("registration"); return; }
    setIdentity(existing);
    const saved = localStorage.getItem("aregoland_start_screen");
    const screenMap: Record<string, string> = { community: "spaces" };
    const mapped = screenMap[saved ?? ""] ?? saved;
    const validScreens = ["dashboard", "chatList", "calendar", "people", "spaces", "connect", "documents", "pay"];
    if (mapped && validScreens.includes(mapped)) {
      setCurrentScreen(mapped as any);
      setReturnTo(mapped === "chatList" ? "chatList" : "dashboard");
    } else {
      setCurrentScreen("dashboard");
      setReturnTo("dashboard");
    }
  };

  const handleRegistrationComplete = (newIdentity: UserIdentity) => {
    setIdentity(newIdentity);
    setFskStatus(loadFsk());
    setCurrentScreen("dashboard");
    setReturnTo("dashboard");
    // FSK-Toast nach Registrierung
    setTimeout(() => {
      setToast({
        text: 'Verifiziere dein Alter um alle Funktionen freizuschalten.',
        type: 'warning',
        onClick: () => { navigateTo("settings"); setTimeout(() => window.dispatchEvent(new CustomEvent('arego-open-fsk')), 100); },
      });
    }, 1500);
  };

  const navigateTo = (screen: "profile" | "qrcode" | "settings") => {
    // returnTo setzen fuer alle Screens die ueber AppHeader-Dropdown navigieren
    if (currentScreen !== "profile" && currentScreen !== "qrcode" && currentScreen !== "settings") {
      setReturnTo(currentScreen as any);
    }
    if (screen === "qrcode") setQrCodeMode("display");
    setCurrentScreen(screen);
  };

  const openSupport = useCallback(() => {
    setSpaceDeepLink({ spaceId: '__aregoland_official__', tab: 'support' });
    setCurrentScreen('spaces');
  }, []);

  // ── Chat öffnen ────────────────────────────────────────────────────────────

  const openChat = (chatId: string, data: { id: string; name: string; avatarUrl: string; isGroup: boolean; roomId: string }) => {
    clearChatUnread(chatId);
    setTotalUnread(getTotalUnread());
    setActiveChatData(data);
    setCurrentScreen("chatConversation");
    // Verbindung sicherstellen
    if (data.roomId.includes(':')) manager.connect(data.roomId);

    // Lesebestätigungen für alle ungelesenen Nachrichten von "them" senden
    if (data.roomId.includes(':')) {
      const history = loadHistory(data.roomId);
      const unreadTheirIds = history
        .filter((m) => m.sender === 'them' && m.status !== 'read')
        .map((m) => m.id);
      if (unreadTheirIds.length > 0) {
        // Kurz warten bis Verbindung steht
        setTimeout(() => manager.sendReadReceipt(data.roomId, unreadTheirIds), 500);
      }
    }
  };

  const handleChatSelect = (chatId: string) => {
    const currentIdentity = identity ?? loadIdentity();
    const persisted = loadPersistedChats().find((c) => c.id === chatId);
    if (persisted) {
      openChat(chatId, { id: persisted.id, name: persisted.name, avatarUrl: persisted.avatarUrl, isGroup: persisted.isGroup, roomId: persisted.roomId });
      return;
    }
    // Kein Mock-Fallback mehr — nur persistierte Chats
  };

  const handleStartChat = (contact: import("@/app/types").Contact) => {
    const currentIdentity = identity ?? loadIdentity();
    const isRealContact = contact.id.startsWith("AC-");
    const roomId = currentIdentity && isRealContact
      ? deriveRoomId(currentIdentity.aregoId, contact.id)
      : contact.id;

    const chatData = { id: contact.id, name: contact.name, avatarUrl: contact.avatar ?? '', isGroup: contact.type === 'group', roomId };

    if (isRealContact) {
      // Explizites Hinzufügen → Status = mutual (ich darf schreiben)
      updateContactStatus(contact.id, 'mutual');
      savePersistedChat({
        id: chatData.id, name: chatData.name, avatarUrl: chatData.avatarUrl,
        isGroup: chatData.isGroup, lastMessage: '', roomId: chatData.roomId,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sortKey: Date.now(), unreadCount: 0,
      });
    }
    openChat(chatData.id, chatData);
  };

  // ── Kontakt entfernen (gegenseitig) ─────────────────────────────────────────

  const handleRemoveContact = useCallback((contactId: string) => {
    const currentIdentity = identity ?? loadIdentity();
    if (!currentIdentity) return;

    const roomId = deriveRoomId(currentIdentity.aregoId, contactId);
    const myName = currentIdentity.displayName;

    // 1. Signal über Inbox-WS senden (funktioniert auch offline — Server puffert 24h)
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const tempWs = new WebSocket(`${proto}://${window.location.host}/ws-signal`);
    tempWs.onopen = () => {
      tempWs.send(JSON.stringify({ type: 'join', roomId: `inbox:${contactId}` }));
      tempWs.send(JSON.stringify({ type: 'contact_removed', aregoId: currentIdentity.aregoId, displayName: myName }));
      setTimeout(() => tempWs.close(), 2000);
    };
    tempWs.onerror = () => tempWs.close();

    // 2. Zusätzlich über P2P DataChannel
    manager.sendContactRemove(roomId, currentIdentity.aregoId);

    // 3. Lokal: Kontakt entfernen, Status löschen (PersistedChat bleibt NICHT — Sender will es weg)
    removeContact(contactId);
    deleteContactStatus(contactId);
    setContactStatusMap((prev) => { const next = { ...prev }; delete next[contactId]; return next; });
    setContactsVersion((v) => v + 1);
    setChatListVersion((v) => v + 1);
    setOnlineContacts((prev) => { const next = new Set(prev); next.delete(contactId); return next; });

    // 4. P2P-Verbindung trennen (nach kurzem Delay damit DataChannel-Signal noch rausgeht)
    setTimeout(() => manager.disconnect(roomId), 500);
  }, [identity, manager]);

  // ── Send-Funktion für ChatScreen ───────────────────────────────────────────

  /** Sendet P2P oder queued als pending. Gibt 'delivered' | 'pending' | false zurück. */
  const sendP2PMessage = useCallback(async (text: string, msgId: string): Promise<'delivered' | 'pending' | false> => {
    const roomId = activeChatDataRef.current?.roomId;
    if (!roomId || !roomId.includes(':')) return false;
    const sent = await manager.send(roomId, text, msgId);
    if (sent) return 'delivered';
    // P2P nicht verbunden → in Pending-Queue speichern
    savePendingMessage(roomId, msgId, text);
    return 'pending';
  }, [manager]);

  /** Sendet Datei chunked über P2P DataChannel */
  const sendP2PFile = useCallback(async (fileData: string, fileName: string, fileMime: string, msgId: string): Promise<boolean> => {
    const roomId = activeChatDataRef.current?.roomId;
    if (!roomId || !roomId.includes(':')) return false;
    return manager.sendFile(roomId, fileData, fileName, fileMime, msgId);
  }, [manager]);

  // ── Eingehenden Anruf annehmen/ablehnen ─────────────────────────────────────

  const acceptIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    const { chatId, roomId, chatName, chatAvatar } = incomingCall;
    setIncomingCall(null);

    // Chat öffnen
    openChat(chatId, { id: chatId, name: chatName, avatarUrl: chatAvatar, isGroup: false, roomId });

    // Gepufferte Signale an ChatScreen weiterleiten sobald Handler registriert ist
    const replay = () => {
      if (activeChatCallRef.current) {
        if (pendingCallOfferRef.current) activeChatCallRef.current(pendingCallOfferRef.current);
        for (const ice of pendingCallIceRef.current) activeChatCallRef.current(ice);
        pendingCallOfferRef.current = null;
        pendingCallIceRef.current = [];
      } else {
        // Handler noch nicht registriert → nochmal versuchen
        setTimeout(replay, 50);
      }
    };
    setTimeout(replay, 50);
  }, [incomingCall, openChat]);

  const rejectIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    manager.sendCallSignal(incomingCall.roomId, { _t: 'call', action: 'hangup', callType: incomingCall.callType });
    pendingCallOfferRef.current = null;
    pendingCallIceRef.current = [];
    setIncomingCall(null);
  }, [incomingCall, manager]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeRoomId = activeChatData?.roomId ?? '';
  const activeP2P = p2pStatuses[activeRoomId];

  return (
    <AppErrorBoundary>
    <div className="size-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
      {currentScreen === "welcome" && (
        <WelcomeScreen
          onGetStarted={handleGetStarted}
          onShowQRCode={() => { setQrCodeMode("display"); setCurrentScreen("qrcode"); setReturnTo("welcome"); }}
          onScanQRCode={() => { setQrCodeMode("scan"); setCurrentScreen("qrcode"); setReturnTo("welcome"); }}
        />
      )}

      {currentScreen === "registration" && (
        <RegistrationScreen onComplete={handleRegistrationComplete} />
      )}

      {currentScreen === "dashboard" && (
        <DashboardScreen
          chatUnreadCount={totalUnread}
          fskLocked={!isFskVerified(fskStatus)}
          onNavigate={(target) => {
            if (isFeatureLocked(fskStatus, target)) {
              setToast({
                text: 'Verifiziere dein Alter um diese Funktion zu nutzen.',
                type: 'warning',
                onClick: () => { navigateTo("settings"); setTimeout(() => window.dispatchEvent(new CustomEvent('arego-open-fsk')), 100); },
              });
              return;
            }
            if (target === "chatList") setCurrentScreen("chatList");
            else if (target === "calendar") setCurrentScreen("calendar");
            else if (target === "people") setCurrentScreen("people");
            else if (target === "community") setCurrentScreen("spaces");
            else if (target === "connect") setCurrentScreen("connect");
            else if (target === "documents") setCurrentScreen("documents");
            else alert(`Funktion "${target}" ist noch nicht verfügbar.`);
          }}
          onOpenProfile={() => navigateTo("profile")}
          onOpenQRCode={() => navigateTo("qrcode")}
          onOpenSettings={() => navigateTo("settings")}
          onOpenSupport={openSupport}
        />
      )}

      {currentScreen === "chatList" && (
        <ChatListScreen
          onOpenProfile={() => navigateTo("profile")}
          onOpenQRCode={() => navigateTo("qrcode")}
          onOpenSettings={() => navigateTo("settings")}
          onOpenSupport={openSupport}
          onBack={() => setCurrentScreen("dashboard")}
          tabs={tabs}
          onUpdateTabs={setTabs}
          onChatSelect={handleChatSelect}
          onNewChat={handleStartChat}
          onlineContacts={onlineContacts}
          chatListVersion={chatListVersion}
        />
      )}

      {currentScreen === "chatConversation" && activeChatData && (
        <ChatScreen
          chatId={activeChatData.id}
          chatName={activeChatData.name}
          chatAvatar={activeChatData.avatarUrl}
          isGroup={activeChatData.isGroup}
          roomId={activeChatData.roomId}
          onBack={() => setCurrentScreen("chatList")}
          isContactOnline={onlineContacts.has(activeChatData.id)}
          chatLockReason={
            contactStatusMap[activeChatData.id] === 'removed'
              ? `${activeChatData.name} hat dich aus den Kontakten entfernt.`
              : contactStatusMap[activeChatData.id] === 'pending'
              ? `${activeChatData.name} hat dich hinzugefügt. Füge ${activeChatData.name} zurück hinzu um antworten zu können.`
              : null
          }
          p2pStatus={activeP2P?.status ?? 'connecting'}
          p2pError={activeP2P?.error ?? null}
          sendP2PMessage={sendP2PMessage}
          sendP2PFile={sendP2PFile}
          onLastMessage={(text) => { updateChatLastMessage(activeChatData.id, text); setChatListVersion((v) => v + 1); }}
          registerMessageHandler={(handler) => { activeChatHandlerRef.current = handler; }}
          unregisterMessageHandler={() => { activeChatHandlerRef.current = null; }}
          registerStatusHandler={(handler) => { activeChatStatusRef.current = handler; }}
          unregisterStatusHandler={() => { activeChatStatusRef.current = null; }}
          sendCallSignal={async (signal) => manager.sendCallSignal(activeChatData.roomId, signal)}
          registerCallSignalHandler={(handler) => { activeChatCallRef.current = handler; }}
          unregisterCallSignalHandler={() => { activeChatCallRef.current = null; }}
          onChatCleared={() => { updateChatLastMessage(activeChatData.id, ''); setChatListVersion((v) => v + 1); }}
        />
      )}

      {currentScreen === "profile" && <ProfileScreen onBack={() => setCurrentScreen(returnTo)} />}
      {currentScreen === "qrcode" && <QRCodeScreen onBack={() => setCurrentScreen(returnTo)} initialMode={qrCodeMode} />}
      {currentScreen === "settings" && (
        <SettingsScreen
          onBack={() => setCurrentScreen(returnTo)}
          subscriptionLocked={subLocked}
          onSubscriptionUnlocked={() => { setSubLocked(false); setCurrentScreen("dashboard"); }}
          onFskUpdated={() => setFskStatus(loadFsk())}
          onResetAccount={() => {
            manager.disconnectAll();
            deletePersistedChats();
            deleteAllHistory();
            deleteAllPending();
            deleteAllContactStatuses();
            setContactStatusMap({});
            setTotalUnread(0);
            setIdentity(null);
            setCurrentScreen("welcome");
          }}
        />
      )}
      {currentScreen === "people" && (
        <PeopleScreen
          onBack={() => setCurrentScreen("dashboard")}
          onOpenProfile={() => navigateTo("profile")}
          onOpenQRCode={() => navigateTo("qrcode")}
          onOpenSettings={() => navigateTo("settings")}
          onOpenSupport={openSupport}
          onOpenChildProfile={() => setCurrentScreen("childProfile")}
          tabs={tabs} onUpdateTabs={setTabs} identity={identity} onStartChat={handleStartChat}
          onStartCall={(contact, type) => { handleStartChat(contact); /* Chat öffnen, dann Anruf starten via setTimeout */ setTimeout(() => { const evt = new CustomEvent('arego-start-call', { detail: { type } }); window.dispatchEvent(evt); }, 300); }}
          onlineContacts={onlineContacts}
          contactsVersion={contactsVersion} onRemoveContact={handleRemoveContact}
        />
      )}
      {currentScreen === "childProfile" && <ChildProfileScreen onBack={() => setCurrentScreen("people")} />}
      {currentScreen === "calendar" && <CalendarScreen onBack={() => setCurrentScreen("dashboard")} onOpenProfile={() => navigateTo("profile")} onOpenQRCode={() => navigateTo("qrcode")} onOpenSettings={() => navigateTo("settings")} onOpenSupport={openSupport} />}
      {currentScreen === "spaces" && <SpacesScreen onBack={() => setCurrentScreen("dashboard")} onOpenProfile={() => navigateTo("profile")} onOpenQRCode={() => navigateTo("qrcode")} onOpenSettings={() => navigateTo("settings")} onOpenSupport={openSupport} onShowToast={(text, type) => setToast({ text, type: type ?? 'info' })} deepLink={spaceDeepLink} onDeepLinkConsumed={() => setSpaceDeepLink(null)} />}
      {currentScreen === "connect" && <ConnectScreen onBack={() => setCurrentScreen("dashboard")} />}
      {currentScreen === "documents" && <DocumentsScreen onBack={() => setCurrentScreen("dashboard")} />}

      {/* In-App Toast-Benachrichtigung */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            onClick={toast.onClick}
            className={`fixed top-4 left-4 right-4 z-[300] p-4 rounded-2xl shadow-2xl backdrop-blur-xl border ${
              toast.onClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''
            } ${
              toast.type === 'warning'
                ? 'bg-red-950/90 border-red-800 text-red-200'
                : 'bg-blue-950/90 border-blue-800 text-blue-200'
            }`}
          >
            <div className={`flex items-center ${toast.actionLabel ? 'justify-between' : 'justify-center'} gap-3`}>
              <p className="text-sm font-medium flex-1">{toast.text}</p>
              {toast.actionLabel && toast.onAction && (
                <button
                  onClick={(e) => { e.stopPropagation(); toast.onAction!(); }}
                  className="shrink-0 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  {toast.actionLabel}
                </button>
              )}
            </div>
            {toast.onClick && <p className="text-[10px] opacity-50 mt-1 text-center">Antippen zum Öffnen</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Globaler Incoming-Call-Banner — zeigt an wenn Chat nicht offen ist */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 inset-x-0 z-[200] p-4 bg-gray-900/95 backdrop-blur-xl border-b border-gray-700 shadow-2xl"
          >
            <div className="flex items-center gap-4 max-w-lg mx-auto">
              <div className="p-3 rounded-full bg-blue-600/20 text-blue-400">
                {incomingCall.callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold truncate">{incomingCall.chatName}</p>
                <p className="text-gray-400 text-sm">
                  {incomingCall.callType === 'video' ? 'Eingehender Videoanruf...' : 'Eingehender Anruf...'}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={rejectIncomingCall}
                  className="p-3 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-500 transition-colors"
                >
                  <PhoneOff size={20} />
                </button>
                <button
                  onClick={acceptIncomingCall}
                  className="p-3 rounded-full bg-green-600 text-white shadow-lg hover:bg-green-500 transition-colors"
                >
                  <Phone size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Beta-Willkommens-Toast (einmalig) */}
      <AnimatePresence>
        {showBetaWelcome && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          >
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <h3 className="text-base font-bold text-white mb-2">Willkommen in der Beta</h3>
              <p className="text-sm text-gray-300 leading-relaxed mb-4">
                Arego ist noch in der Entwicklung — und du kannst mitgestalten.
                Schick uns dein Feedback an <span className="text-amber-400 font-medium">feedback@aregoland.de</span>.
                Dank KI bekommt jede Nachricht eine persoenliche Antwort (noch nicht implementiert).
              </p>
              <button
                onClick={dismissBetaWelcome}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-xl text-sm transition-colors"
              >
                Verstanden
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
    </AppErrorBoundary>
  );
}
