import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Phone, Video, MoreVertical, Mic, Send, Smile, Check, CheckCheck, Image as ImageIcon, Camera, FileText, X, Trash2, Reply, Pencil, ShieldCheck, Wifi, WifiOff, Loader2, Clock, Download, Play, Pause, Square, Search, Palette, FolderOpen, Ban } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { ImageWithFallback } from "@/app/components/ImageWithFallback";
import { motion, AnimatePresence } from "motion/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { loadHistory, saveHistory, clearHistory, type StoredMessage } from "@/app/lib/chats";
import type { P2PStatus, CallSignal } from "@/app/lib/p2p-manager";
import CallOverlay from './CallOverlay';
import { CallManager, type CallState, type CallType } from '@/app/lib/call-manager';
import { ContactDetailModal } from './ContactDetailModal';
import { blockContact, isBlocked } from "@/app/auth/contacts";
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

type Message = StoredMessage;

interface ChatScreenProps {
  chatId: string;
  chatName: string;
  chatAvatar: string;
  isGroup: boolean;
  roomId: string;
  onBack: () => void;
  onLastMessage?: (text: string) => void;
  isContactOnline?: boolean;
  /** null = voll zugriff, string = Sperrgrund (wird angezeigt) */
  chatLockReason?: string | null;
  /** P2P Status + Send kommen jetzt von App.tsx (P2PManager) */
  p2pStatus: P2PStatus;
  p2pError: string | null;
  sendP2PMessage: (text: string, msgId: string) => Promise<'delivered' | 'pending' | false>;
  sendP2PFile: (fileData: string, fileName: string, fileMime: string, msgId: string) => Promise<boolean>;
  /** App.tsx ruft handler(msg) auf wenn eine P2P-Nachricht für diesen Room ankommt */
  registerMessageHandler: (handler: (msg: StoredMessage) => void) => void;
  unregisterMessageHandler: () => void;
  /** App.tsx ruft handler(msgId, status) auf wenn eine pending Nachricht zugestellt wurde */
  registerStatusHandler: (handler: (msgId: string, status: StoredMessage['status']) => void) => void;
  unregisterStatusHandler: () => void;
  /** Anruf-Signaling */
  sendCallSignal: (signal: CallSignal) => Promise<boolean>;
  registerCallSignalHandler: (handler: (signal: CallSignal) => void) => void;
  unregisterCallSignalHandler: () => void;
  onChatCleared?: () => void;
}

function P2PBadge({ status, error }: { status: P2PStatus; error: string | null }) {
  const { t } = useTranslation();
  if (status === 'connected') {
    return (
      <div className="flex items-center gap-1 bg-green-500/15 border border-green-500/30 rounded-full px-2 py-0.5">
        <ShieldCheck size={11} className="text-green-400" />
        <span className="text-[10px] font-medium text-green-400">E2E</span>
      </div>
    );
  }
  if (status === 'connecting' || status === 'handshake') {
    return (
      <div className="flex items-center gap-1 bg-blue-500/15 border border-blue-500/30 rounded-full px-2 py-0.5">
        <Loader2 size={10} className="text-blue-400 animate-spin" />
        <span className="text-[10px] font-medium text-blue-400">P2P</span>
      </div>
    );
  }
  if (status === 'waiting') {
    return (
      <div className="flex items-center gap-1 bg-gray-700/50 border border-gray-600 rounded-full px-2 py-0.5">
        <Wifi size={10} className="text-gray-400" />
        <span className="text-[10px] font-medium text-gray-400">{t('chat.waiting')}</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5" title={error ?? ''}>
        <WifiOff size={10} className="text-red-400" />
        <span className="text-[10px] font-medium text-red-400">{t('common.offline')}</span>
      </div>
    );
  }
  return null;
}

// ── Audio-Player für Sprachnachrichten ───────────────────────────────────────

function AudioMessage({ src, isMine }: { src: string; isMine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const rafRef = useRef<number>();

  // data: URL → Blob URL konvertieren (Edge kann data:audio/webm nicht abspielen)
  useEffect(() => {
    if (!src) return;
    try {
      let binary: string;
      let mime: string;
      if (src.startsWith('data:')) {
        const [header, b64] = src.split(',');
        mime = header.split(':')[1]?.split(';')[0] ?? 'audio/webm';
        binary = atob(b64);
      } else {
        // Reines Base64
        mime = 'audio/webm';
        binary = atob(src);
      }
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      // Fallback: direkt verwenden
      setBlobUrl(src);
    }
  }, [src]);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (a && a.duration) {
      setProgress(a.currentTime / a.duration);
      setDuration(a.duration);
    }
    if (playing) rafRef.current = requestAnimationFrame(tick);
  }, [playing]);

  useEffect(() => {
    if (playing) rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, tick]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  };

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
  };

  if (!blobUrl) return null;

  return (
    <div className="flex items-center gap-2.5 min-w-[180px] py-1">
      <audio
        ref={audioRef}
        src={blobUrl}
        preload="metadata"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button onClick={toggle} className={`p-1.5 rounded-full shrink-0 ${isMine ? 'bg-blue-500/30 text-white' : 'bg-gray-600/50 text-gray-200'}`}>
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="relative h-1.5 rounded-full bg-white/15 cursor-pointer" onClick={seek}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/60 transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="text-[10px] opacity-60">{playing ? fmt(audioRef.current?.currentTime ?? 0) : fmt(duration)}</span>
      </div>
    </div>
  );
}

/** Erkennt ob eine Nachricht eine Sprachnachricht ist (auch wenn type='file') */
function isVoiceMessage(msg: { type: string; fileName?: string; fileMime?: string }) {
  if (msg.type === 'audio') return true;
  if (msg.fileName?.match(/^voice\./i)) return true;
  if (msg.fileMime?.startsWith('audio/')) return true;
  return false;
}

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

function truncateUrl(url: string, max = 50): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > max ? display.slice(0, max) + '…' : display;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

function linkifyText(text: string): (string | JSX.Element)[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all hover:opacity-80">{truncateUrl(part)}</a>
    ) : part
  );
}

const isRealP2PRoom = (roomId: string) => roomId.includes(':');


export default function ChatScreen({
  chatId, chatName, chatAvatar, isGroup, roomId, onBack, onLastMessage,
  isContactOnline, chatLockReason, p2pStatus, p2pError, sendP2PMessage, sendP2PFile,
  registerMessageHandler, unregisterMessageHandler,
  registerStatusHandler, unregisterStatusHandler,
  sendCallSignal, registerCallSignalHandler, unregisterCallSignalHandler,
  onChatCleared,
}: ChatScreenProps) {
  console.log('[ChatScreen] render', { chatId, chatName, roomId, p2pStatus });
  const { t } = useTranslation();
  // Nachrichtenverlauf: aus localStorage laden (enthält auch Hintergrund-Nachrichten)
  const [messages, setMessages] = useState<Message[]>(() =>
    loadHistory(roomId)
  );
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Menü-Features ───────────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [chatBg, setChatBg] = useState<string>(() => localStorage.getItem(`arego_chatbg_${roomId}`) ?? '');
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showContactDetail, setShowContactDetail] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // ── Sprachnachricht ─────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval>>();
  const recordingStreamRef = useRef<MediaStream | null>(null);

  // ── Anruf-State (via CallManager) ──────────────────────────────────────────
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('audio');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  const callManagerRef = useRef<CallManager | null>(null);
  if (!callManagerRef.current) callManagerRef.current = new CallManager();
  const cm = callManagerRef.current;

  // Stable ref für sendCallSignal
  const sendCallSignalRef = useRef(sendCallSignal);
  useEffect(() => { sendCallSignalRef.current = sendCallSignal; }, [sendCallSignal]);

  // CallManager Callbacks registrieren
  useEffect(() => {
    cm.onStateChange((state, type) => {
      setCallState(state === 'ended' ? 'idle' : state);
      setCallType(type);
    });
    cm.onStreamsChange((local, remote, camUnavail) => {
      setLocalStream(local);
      setRemoteStream(remote);
      setCameraUnavailable(camUnavail);
    });
    return () => { cm.destroy(); };
  }, [cm]);

  const startCall = useCallback(async (type: CallType) => {
    if (p2pStatus !== 'connected') return;
    await cm.startCall(type, (signal) => sendCallSignalRef.current(signal));
  }, [p2pStatus, cm]);

  const acceptCall = useCallback(async () => {
    await cm.acceptCall();
  }, [cm]);

  const hangup = useCallback(() => {
    cm.hangup();
  }, [cm]);

  const rejectCall = useCallback(() => {
    cm.reject();
  }, [cm]);

  // Call-Signal Handler registrieren
  useEffect(() => {
    const handler = (signal: CallSignal) => {
      cm.handleSignal(signal, (s) => sendCallSignalRef.current(s));
    };
    registerCallSignalHandler(handler);
    return () => unregisterCallSignalHandler();
  }, [roomId, registerCallSignalHandler, unregisterCallSignalHandler, cm]);

  // Auto-Start Anruf (aus Kontakt-Detail oder PeopleScreen)
  useEffect(() => {
    const handler = (e: Event) => {
      const type = (e as CustomEvent).detail?.type as CallType;
      if (type && p2pStatus === 'connected') startCall(type);
    };
    window.addEventListener('arego-start-call', handler);
    return () => window.removeEventListener('arego-start-call', handler);
  }, [p2pStatus, startCall]);

  // Stable ref für onLastMessage
  const onLastMessageRef = useRef(onLastMessage);
  useEffect(() => { onLastMessageRef.current = onLastMessage; }, [onLastMessage]);

  // ── Message-Handler bei App.tsx registrieren ───────────────────────────────
  // Wenn eine P2P-Nachricht ankommt während dieser Chat offen ist,
  // ruft App.tsx diesen Handler auf statt in localStorage zu schreiben.
  useEffect(() => {
    const handler = (msg: StoredMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      onLastMessageRef.current?.(msg.text);
    };
    registerMessageHandler(handler);
    return () => unregisterMessageHandler();
  }, [roomId, registerMessageHandler, unregisterMessageHandler]);

  // Status-Updates: wenn pending → delivered (Nachricht wurde nachträglich zugestellt)
  useEffect(() => {
    const handler = (msgId: string, newStatus: StoredMessage['status']) => {
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, status: newStatus } : m
      ));
    };
    registerStatusHandler(handler);
    return () => unregisterStatusHandler();
  }, [roomId, registerStatusHandler, unregisterStatusHandler]);

  // Verlauf bei jeder Änderung persistieren
  useEffect(() => {
    if (isRealP2PRoom(roomId)) saveHistory(roomId, messages);
  }, [messages, roomId]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages, replyTo, editingMessageId]);

  // ── Senden ─────────────────────────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    if (editingMessageId) {
      setMessages((prev) => prev.map((msg) =>
        msg.id === editingMessageId ? { ...msg, text: inputText, isEdited: true } : msg
      ));
      setEditingMessageId(null);
    } else {
      const newMessage: Message = {
        id: Date.now().toString(),
        text: inputText,
        sender: "me",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: "sent",
        type: "text",
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, sender: replyTo.sender === "me" ? "Du" : chatName } : undefined,
      };
      setMessages((prev) => [...prev, newMessage]);
      onLastMessageRef.current?.(inputText);

      const result = await sendP2PMessage(inputText, newMessage.id);
      if (result === 'delivered') {
        setMessages((prev) => prev.map((m) =>
          m.id === newMessage.id ? { ...m, status: 'delivered' } : m
        ));
      } else if (result === 'pending') {
        setMessages((prev) => prev.map((m) =>
          m.id === newMessage.id ? { ...m, status: 'pending' } : m
        ));
      }
    }
    setInputText("");
    setReplyTo(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const insertEmoji = (emoji: any) => {
    const native = emoji.native as string;
    const ta = textareaRef.current;
    if (!ta) { setInputText((prev) => prev + native); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setInputText(inputText.slice(0, start) + native + inputText.slice(end));
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + native.length; ta.focus(); });
  };

  // Click-Outside schließt Emoji-Picker
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset für erneute Auswahl

    // Max 5 MB für P2P DataChannel
    if (file.size > 5 * 1024 * 1024) {
      alert('Datei zu groß (max. 5 MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]; // nur Daten-Teil
      const isImage = file.type.startsWith('image/');
      const msgId = Date.now().toString();
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newMsg: Message = {
        id: msgId,
        text: file.name,
        sender: 'me',
        timestamp: ts,
        status: 'sent',
        type: isImage ? 'image' : 'file',
        fileData: reader.result as string, // data:mime;base64,...  (für Anzeige)
        fileName: file.name,
        fileMime: file.type,
      };
      setMessages((prev) => [...prev, newMsg]);
      onLastMessageRef.current?.(isImage ? 'Bild' : file.name);

      // Chunked über P2P senden (nicht als Text-Nachricht, sondern via sendFile)
      const sent = await sendP2PFile(base64, file.name, file.type, msgId);
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, status: sent ? 'delivered' : 'pending' } : m));
    };
    reader.readAsDataURL(file);
  };

  // ── Sprachnachricht aufnehmen ───────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stream stoppen
        recordingStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordingStreamRef.current = null;

        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        if (blob.size < 1000) return; // zu kurz, verwerfen

        // Base64 konvertieren
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          const msgId = Date.now().toString();
          const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const newMsg: Message = {
            id: msgId, text: 'Sprachnachricht', sender: 'me', timestamp: ts,
            status: 'sent', type: 'audio',
            fileData: dataUrl, fileName: 'voice.webm', fileMime: mimeType,
          };
          setMessages((prev) => [...prev, newMsg]);
          onLastMessageRef.current?.('Sprachnachricht');

          const sent = await sendP2PFile(base64, 'voice.webm', mimeType, msgId);
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, status: sent ? 'delivered' : 'pending' } : m));
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(100); // 100ms timeslice für regelmäßige Daten
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error('[Voice] Mikrofon nicht verfügbar:', err);
    }
  }, [sendP2PFile]);

  const stopRecording = useCallback(() => {
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  const cancelRecording = useCallback(() => {
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    // Recorder stoppen ohne ondataavailable auszulösen
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
  }, []);

  const handleReply = (msg: Message) => { setReplyTo(msg); setEditingMessageId(null); };
  const handleEdit = (msg: Message) => { setEditingMessageId(msg.id); setInputText(msg.text); setReplyTo(null); };
  const handleDeleteMessage = (msgId: string) => { setMessages((prev) => prev.filter((m) => m.id !== msgId)); };

  const handleClearChat = () => {
    setMessages([]);
    clearHistory(roomId);
    setIsClearDialogOpen(false);
    onChatCleared?.();
  };

  // ── UI ─────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white relative">
      {/* Header */}
      <header className="px-4 py-3 flex items-center justify-between bg-gray-900/95 backdrop-blur-md sticky top-0 z-20 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all">
            <ArrowLeft size={24} />
          </button>

          <div
            className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-colors pr-2"
            onClick={() => setShowContactDetail(true)}
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-700">
                <ImageWithFallback src={chatAvatar} alt={chatName} className="w-full h-full object-cover" />
              </div>
              {!isGroup && (
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-900 ${isContactOnline ? 'bg-green-500' : 'bg-gray-600'}`} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white leading-tight">{chatName}</h2>
                <P2PBadge status={p2pStatus} error={p2pError} />
              </div>
              <p className="text-xs text-gray-400">
                {p2pStatus === 'connected'
                  ? t('chat.p2pEncrypted')
                  : p2pStatus === 'waiting'
                  ? isContactOnline ? t('common.online') : t('common.offline')
                  : p2pStatus === 'handshake'
                  ? t('chat.connectingP2P')
                  : p2pStatus === 'error'
                  ? (p2pError ?? t('chat.signalingUnreachable'))
                  : isGroup ? t('chat.tapGroupInfo') : isContactOnline ? t('common.online') : t('common.offline')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => startCall('video')} disabled={p2pStatus !== 'connected' || !!chatLockReason} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-30"><Video size={22} /></button>
          <button onClick={() => startCall('audio')} disabled={p2pStatus !== 'connected' || !!chatLockReason} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-30"><Phone size={20} /></button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors outline-none"><MoreVertical size={20} /></button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="min-w-[200px] bg-gray-800 rounded-xl shadow-xl p-1.5 border border-gray-700 data-[side=bottom]:animate-slideUpAndFade z-50 mr-2" sideOffset={5} align="end">
                <DropdownMenu.Item onSelect={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 100); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer"><Search size={16} className="text-gray-400" /><span>Suchen</span></DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => setShowMediaGallery(true)} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer"><FolderOpen size={16} className="text-gray-400" /><span>Medien und Dokumente</span></DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => setShowBgPicker((v) => !v)} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer"><Palette size={16} className="text-gray-400" /><span>Hintergrund ändern</span></DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-gray-700 my-1" />
                <DropdownMenu.Item onSelect={() => setIsClearDialogOpen(true)} className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer"><Trash2 size={16} /><span>Chatverlauf löschen</span></DropdownMenu.Item>
                {!isGroup && !isBlocked(chatId) && (
                  <DropdownMenu.Item onSelect={() => { blockContact(chatId); onBack(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-orange-400 rounded-lg hover:bg-orange-500/10 outline-none cursor-pointer"><Ban size={16} /><span>Blockieren</span></DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      {/* Suchleiste */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-gray-900 border-b border-gray-800 overflow-hidden"
          >
            <div className="px-4 py-2 flex items-center gap-2">
              <Search size={18} className="text-gray-500 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Im Chat suchen..."
                className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none"
              />
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="p-1 text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hintergrund-Picker */}
      <AnimatePresence>
        {showBgPicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-gray-900 border-b border-gray-800 overflow-hidden"
          >
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="text-xs text-gray-400 shrink-0">Hintergrund:</span>
              {[
                { id: '', label: 'Standard', style: 'bg-gray-900' },
                { id: 'bg-gradient-to-b from-gray-900 to-gray-950', label: 'Dunkel', style: 'bg-gradient-to-b from-gray-800 to-gray-950' },
                { id: 'bg-gradient-to-br from-blue-950 to-gray-950', label: 'Blau', style: 'bg-gradient-to-br from-blue-900 to-gray-950' },
                { id: 'bg-gradient-to-br from-purple-950 to-gray-950', label: 'Lila', style: 'bg-gradient-to-br from-purple-900 to-gray-950' },
                { id: 'bg-gradient-to-br from-green-950 to-gray-950', label: 'Gruen', style: 'bg-gradient-to-br from-green-900 to-gray-950' },
                { id: 'bg-gradient-to-br from-red-950 to-gray-950', label: 'Rot', style: 'bg-gradient-to-br from-red-900/60 to-gray-950' },
              ].map((bg) => (
                <button
                  key={bg.id || 'default'}
                  onClick={() => { setChatBg(bg.id); localStorage.setItem(`arego_chatbg_${roomId}`, bg.id); setShowBgPicker(false); }}
                  className={`w-8 h-8 rounded-full border-2 shrink-0 transition-all ${bg.style} ${chatBg === bg.id ? 'border-blue-500 scale-110' : 'border-gray-600 hover:border-gray-400'}`}
                  title={bg.label}
                />
              ))}
              <button onClick={() => setShowBgPicker(false)} className="ml-auto p-1 text-gray-400 hover:text-white"><X size={16} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Medien-Galerie */}
      <AnimatePresence>
        {showMediaGallery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-gray-900 flex flex-col"
          >
            <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-800">
              <button onClick={() => setShowMediaGallery(false)} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
                <ArrowLeft size={20} />
              </button>
              <h3 className="text-base font-bold text-white">Medien und Dokumente</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const media = messages.filter((m) => m.type === 'image' && m.fileData);
                const audio = messages.filter((m) => isVoiceMessage(m) && m.fileData);
                const files = messages.filter((m) => m.type === 'file' && !isVoiceMessage(m) && m.fileData);
                const hasContent = media.length > 0 || audio.length > 0 || files.length > 0;

                if (!hasContent) return (
                  <p className="text-gray-500 text-sm text-center mt-12">Keine Medien oder Dokumente in diesem Chat.</p>
                );

                return (
                  <div className="space-y-6">
                    {media.length > 0 && (
                      <div>
                        <h4 className="text-xs text-gray-400 font-semibold uppercase mb-3">Bilder ({media.length})</h4>
                        <div className="grid grid-cols-3 gap-2">
                          {media.map((m) => (
                            <img
                              key={m.id}
                              src={m.fileData!.startsWith('data:') ? m.fileData! : `data:${m.fileMime};base64,${m.fileData}`}
                              alt={m.fileName ?? ''}
                              className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => window.open(m.fileData!.startsWith('data:') ? m.fileData! : `data:${m.fileMime};base64,${m.fileData}`, '_blank')}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {audio.length > 0 && (
                      <div>
                        <h4 className="text-xs text-gray-400 font-semibold uppercase mb-3">Sprachnachrichten ({audio.length})</h4>
                        <div className="space-y-2">
                          {audio.map((m) => (
                            <div key={m.id} className="bg-gray-800 rounded-xl p-3">
                              <AudioMessage src={m.fileData!} isMine={m.sender === 'me'} />
                              <span className="text-[10px] text-gray-500">{m.timestamp}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {files.length > 0 && (
                      <div>
                        <h4 className="text-xs text-gray-400 font-semibold uppercase mb-3">Dokumente ({files.length})</h4>
                        <div className="space-y-2">
                          {files.map((m) => (
                            <a
                              key={m.id}
                              href={m.fileData!.startsWith('data:') ? m.fileData! : `data:${m.fileMime};base64,${m.fileData}`}
                              download={m.fileName ?? 'datei'}
                              className="flex items-center gap-3 bg-gray-800 rounded-xl p-3 hover:bg-gray-700 transition-colors"
                            >
                              <FileText size={20} className="text-blue-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white truncate">{m.fileName ?? 'Datei'}</p>
                                <p className="text-[10px] text-gray-500">{m.timestamp}</p>
                              </div>
                              <Download size={16} className="text-gray-400 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${chatBg || 'bg-gray-900'}`}>
        <div className="flex justify-center my-4">
          <span className="bg-gray-800/80 text-gray-400 text-xs px-3 py-1 rounded-full shadow-sm backdrop-blur-sm">Heute</span>
        </div>

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
            <ContextMenu.Root>
              <ContextMenu.Trigger asChild>
                <div className={`max-w-[75%] min-w-0 rounded-2xl px-4 py-2 shadow-sm relative group cursor-pointer overflow-hidden ${msg.sender === "me" ? "bg-blue-600 text-white rounded-tr-none" : "bg-gray-800 text-gray-100 rounded-tl-none border border-gray-700"}`}>
                  {msg.replyTo && (
                    <div className={`mb-2 rounded-lg p-2 text-xs border-l-4 ${msg.sender === "me" ? "bg-blue-700/50 border-blue-300" : "bg-gray-700/50 border-gray-500"}`}>
                      <p className="font-bold opacity-80 mb-0.5">{msg.replyTo.sender}</p>
                      <p className="line-clamp-1 opacity-70">{msg.replyTo.text}</p>
                    </div>
                  )}
                  {msg.type === 'image' && msg.fileData && (
                    <img
                      src={msg.fileData.startsWith('data:') ? msg.fileData : `data:${msg.fileMime ?? 'image/png'};base64,${msg.fileData}`}
                      alt={msg.fileName ?? 'Bild'}
                      className="rounded-lg max-w-full max-h-64 object-contain mb-1 cursor-pointer"
                      onClick={() => {
                        const src = msg.fileData!.startsWith('data:') ? msg.fileData! : `data:${msg.fileMime ?? 'image/png'};base64,${msg.fileData}`;
                        setPreviewImage(src);
                      }}
                    />
                  )}
                  {isVoiceMessage(msg) && msg.fileData && (
                    <AudioMessage
                      src={msg.fileData}
                      isMine={msg.sender === 'me'}
                    />
                  )}
                  {msg.type === 'file' && !isVoiceMessage(msg) && msg.fileData && (
                    <a
                      href={msg.fileData.startsWith('data:') ? msg.fileData : `data:${msg.fileMime ?? 'application/octet-stream'};base64,${msg.fileData}`}
                      download={msg.fileName ?? 'datei'}
                      className={`flex items-center gap-2 p-2 rounded-lg mb-1 ${msg.sender === 'me' ? 'bg-blue-700/40' : 'bg-gray-700/60'}`}
                    >
                      <Download size={18} />
                      <span className="text-sm truncate">{msg.fileName ?? 'Datei'}</span>
                    </a>
                  )}
                  {msg.type !== 'image' && !isVoiceMessage(msg) && (
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>
                      {searchQuery && msg.text.toLowerCase().includes(searchQuery.toLowerCase())
                        ? msg.text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                            part.toLowerCase() === searchQuery.toLowerCase()
                              ? <mark key={i} className="bg-yellow-500/40 text-white rounded px-0.5">{part}</mark>
                              : linkifyText(part)
                          )
                        : linkifyText(msg.text)}
                    </p>
                  )}
                  <div className={`flex items-center justify-end gap-1 mt-1 ${msg.sender === "me" ? "text-blue-200" : "text-gray-400"}`}>
                    {msg.isEdited && <span className="text-[10px] italic opacity-80 mr-1">bearbeitet</span>}
                    <span className="text-[10px]">{msg.timestamp}</span>
                    {msg.sender === "me" && (
                      <span>
                        {(msg.status === "pending" || msg.status === "sent") && <Check size={12} className="text-gray-300" />}
                        {msg.status === "delivered" && <CheckCheck size={12} className="text-gray-300" />}
                        {msg.status === "read" && <CheckCheck size={12} className="text-blue-400" />}
                      </span>
                    )}
                  </div>
                </div>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="min-w-[180px] bg-gray-800 rounded-xl shadow-xl p-1.5 border border-gray-700 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <ContextMenu.Item onSelect={() => handleReply(msg)} className="flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer"><Reply size={16} /><span>Antworten</span></ContextMenu.Item>
                  {msg.sender === "me" && (
                    <ContextMenu.Item onSelect={() => handleEdit(msg)} className="flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer"><Pencil size={16} /><span>Bearbeiten</span></ContextMenu.Item>
                  )}
                  <ContextMenu.Sub>
                    <ContextMenu.SubTrigger className="flex items-center justify-between gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer data-[state=open]:bg-red-500/10">
                      <div className="flex items-center gap-2"><Trash2 size={16} /><span>Löschen</span></div>
                      <span className="ml-auto text-xs opacity-50">▶</span>
                    </ContextMenu.SubTrigger>
                    <ContextMenu.Portal>
                      <ContextMenu.SubContent className="min-w-[160px] bg-gray-800 rounded-xl shadow-xl p-1.5 border border-gray-700 animate-in fade-in zoom-in-95 duration-200 ml-1" sideOffset={2} alignOffset={-5}>
                        <ContextMenu.Item onSelect={() => handleDeleteMessage(msg.id)} className="flex items-center gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer"><span>Für mich löschen</span></ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => handleDeleteMessage(msg.id)} className="flex items-center gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer"><span>Für beide löschen</span></ContextMenu.Item>
                      </ContextMenu.SubContent>
                    </ContextMenu.Portal>
                  </ContextMenu.Sub>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-gray-900 border-t border-gray-800 sticky bottom-0 z-20">
        {isBlocked(chatId) ? (
          <div className="p-4 text-center flex items-center justify-center gap-2">
            <Ban size={16} className="text-orange-400" />
            <p className="text-orange-400 text-sm font-medium">{t('chat.blockedBanner')}</p>
          </div>
        ) : chatLockReason ? (
          <div className="p-4 text-center">
            <p className="text-gray-500 text-sm">{chatLockReason}</p>
          </div>
        ) : (
        <>
        <AnimatePresence>
          {replyTo && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-gray-800/50 backdrop-blur-md border-b border-gray-700 px-4 py-2 flex items-center justify-between">
              <div className="flex items-start gap-3 overflow-hidden">
                <Reply size={20} className="text-blue-400 mt-1 shrink-0" />
                <div className="border-l-2 border-blue-500 pl-3">
                  <p className="text-blue-400 text-xs font-bold mb-0.5">Antwort an {replyTo.sender === "me" ? "Dich" : chatName}</p>
                  <p className="text-gray-300 text-sm line-clamp-1">{replyTo.text}</p>
                </div>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
            </motion.div>
          )}
          {editingMessageId && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-gray-800/50 backdrop-blur-md border-b border-gray-700 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3"><Pencil size={18} className="text-blue-400" /><p className="text-blue-400 text-sm font-bold">Nachricht bearbeiten</p></div>
              <button onClick={() => { setEditingMessageId(null); setInputText(""); }} className="p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Emoji Picker */}
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              ref={emojiPickerRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-20 left-2 right-2 z-30 flex justify-center"
            >
              <Picker
                data={data}
                onEmojiSelect={insertEmoji}
                theme="dark"
                previewPosition="none"
                skinTonePosition="search"
                maxFrequentRows={2}
                locale="de"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-3 flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />

          {isRecording ? (
            /* ── Aufnahme-UI ──────────────────────────────────────────────── */
            <>
              <button
                onClick={cancelRecording}
                className="p-3 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full transition-colors shrink-0"
              >
                <X size={20} />
              </button>
              <div className="flex-1 bg-red-950/60 rounded-2xl flex items-center min-h-[48px] border border-red-800/50 px-4 gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-red-400 text-sm font-mono font-medium">
                  {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-red-400/60 text-xs">Aufnahme...</span>
              </div>
              <button
                onPointerUp={stopRecording}
                className="p-3 rounded-full shadow-lg bg-red-600 text-white hover:bg-red-500 transition-all shrink-0 flex items-center justify-center animate-pulse"
              >
                <Send size={20} className="ml-0.5" />
              </button>
            </>
          ) : (
            /* ── Normales Eingabefeld ─────────────────────────────────────── */
            <>
              <button className="p-3 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full transition-colors shrink-0"><PlusIconWrapper onPickFile={() => fileInputRef.current?.click()} /></button>

              <div className="flex-1 bg-gray-800 rounded-2xl flex items-center min-h-[48px] border border-gray-700 focus-within:border-blue-500/50 transition-colors">
                <button
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className={`pl-3 pr-2 transition-colors ${showEmojiPicker ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`}
                >
                  <Smile size={24} />
                </button>
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  onFocus={() => setShowEmojiPicker(false)}
                  placeholder={editingMessageId ? "Bearbeite deine Nachricht..." : "Nachricht..."}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-gray-500 max-h-32 py-3 resize-none overflow-y-auto leading-relaxed outline-none"
                  rows={1}
                  style={{ minHeight: "24px" }}
                />
                <div className="pr-2" />
              </div>

              {inputText.trim() ? (
                <button
                  onClick={handleSendMessage}
                  className="p-3 rounded-full shadow-lg bg-blue-600 text-white hover:bg-blue-500 transition-all transform hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center"
                >
                  {editingMessageId ? <Check size={20} /> : <Send size={20} className="ml-0.5" />}
                </button>
              ) : (
                <button
                  onPointerDown={(e) => { e.preventDefault(); startRecording(); }}
                  className="p-3 rounded-full shadow-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-all shrink-0 flex items-center justify-center select-none"
                >
                  <Mic size={20} />
                </button>
              )}
            </>
          )}
        </div>
        </>
        )}
      </div>

      {/* Anruf-Overlay */}
      <AnimatePresence>
        {callState !== 'idle' && (
          <CallOverlay
            callState={callState}
            callType={callType}
            contactName={chatName}
            contactAvatar={chatAvatar}
            onAccept={acceptCall}
            onReject={rejectCall}
            onHangup={hangup}
            localStream={localStream}
            remoteStream={remoteStream}
            cameraUnavailable={cameraUnavailable}
          />
        )}
      </AnimatePresence>

      {/* Clear Chat Dialog */}
      <AlertDialog.Root open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="bg-black/50 backdrop-blur-sm fixed inset-0 z-50 animate-in fade-in duration-200" />
          <AlertDialog.Content className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[400px] translate-x-[-50%] translate-y-[-50%] rounded-xl bg-gray-900 border border-gray-800 p-6 shadow-2xl focus:outline-none z-50 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-500/10 rounded-full text-red-500"><Trash2 size={24} /></div>
                <div>
                  <AlertDialog.Title className="text-lg font-semibold text-white">Chatverlauf löschen?</AlertDialog.Title>
                  <AlertDialog.Description className="text-sm text-gray-400 mt-1">Möchtest du wirklich alle Nachrichten in diesem Chat löschen? Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialog.Description>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <AlertDialog.Action onClick={handleClearChat} className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors">Nur lokal löschen</AlertDialog.Action>
                <AlertDialog.Action onClick={handleClearChat} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors">Für beide löschen</AlertDialog.Action>
                <AlertDialog.Cancel className="w-full py-3 bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg font-medium transition-colors border border-gray-700">Abbrechen</AlertDialog.Cancel>
              </div>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Kontakt-Detail Modal */}
      {showContactDetail && (
        <ContactDetailModal
          contact={{
            id: chatId,
            name: chatName,
            avatar: chatAvatar,
            categories: [],
            status: isContactOnline ? t('common.online') : t('common.offline'),
          }}
          onClose={() => setShowContactDetail(false)}
          onUpdateContact={() => {}}
          tabs={[]}
          onStartCall={(_contact, type) => { setShowContactDetail(false); startCall(type); }}
        />
      )}

      {/* Image Preview Lightbox */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-gray-800/80 rounded-full text-white hover:bg-gray-700 transition-colors z-10"
            >
              <X size={24} />
            </button>
            <a
              href={previewImage}
              download="bild.png"
              onClick={(e) => e.stopPropagation()}
              className="absolute top-4 right-16 p-2 bg-gray-800/80 rounded-full text-white hover:bg-gray-700 transition-colors z-10"
            >
              <Download size={24} />
            </a>
            <img
              src={previewImage}
              alt="Vorschau"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlusIconWrapper({ onPickFile }: { onPickFile?: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <div className="w-6 h-6 flex items-center justify-center cursor-pointer"><span className="text-2xl leading-none font-light pb-1">+</span></div>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="min-w-[160px] bg-gray-800 rounded-xl shadow-2xl p-2 border border-gray-700 mb-2 ml-2 data-[side=top]:animate-slideUpAndFade z-50" sideOffset={10} align="start" side="top">
          <DropdownMenu.Item onSelect={() => onPickFile?.()} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 cursor-pointer outline-none"><div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg"><ImageIcon size={18}/></div>Fotos & Videos</DropdownMenu.Item>
          <DropdownMenu.Item className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 cursor-pointer outline-none"><div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg"><Camera size={18}/></div>Kamera</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onPickFile?.()} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 cursor-pointer outline-none"><div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg"><FileText size={18}/></div>Dokument</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
