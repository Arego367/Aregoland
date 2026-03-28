import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Phone, Video, MoreVertical, Paperclip, Mic, Send, Smile, Check, CheckCheck, Image as ImageIcon, Camera, FileText, X, Trash2, Reply, Pencil, AlertCircle } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { motion, AnimatePresence } from "motion/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";

interface Message {
  id: string;
  text: string;
  sender: "me" | "them";
  timestamp: string;
  status: "sent" | "delivered" | "read";
  type: "text" | "image" | "audio";
  replyTo?: {
    id: string;
    text: string;
    sender: string;
  };
  isEdited?: boolean;
}

interface ChatScreenProps {
  chatId: string;
  chatName: string;
  chatAvatar: string;
  isGroup: boolean;
  onBack: () => void;
}

export default function ChatScreen({ chatId, chatName, chatAvatar, isGroup, onBack }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hallo! Wie geht's?",
      sender: "them",
      timestamp: "10:00",
      status: "read",
      type: "text"
    },
    {
      id: "2",
      text: "Hey! Mir geht's gut, danke. Und dir?",
      sender: "me",
      timestamp: "10:02",
      status: "read",
      type: "text"
    },
    {
      id: "3",
      text: "Auch gut! Hast du Zeit für ein kurzes Meeting heute?",
      sender: "them",
      timestamp: "10:05",
      status: "read",
      type: "text"
    },
    {
      id: "4",
      text: "Ja, klar. Wann passt es dir?",
      sender: "me",
      timestamp: "10:10",
      status: "delivered",
      type: "text"
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, replyTo, editingMessageId]);

  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    if (editingMessageId) {
      setMessages(prev => prev.map(msg => 
        msg.id === editingMessageId 
          ? { ...msg, text: inputText, isEdited: true } 
          : msg
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
        replyTo: replyTo ? {
          id: replyTo.id,
          text: replyTo.text,
          sender: replyTo.sender === "me" ? "Du" : chatName
        } : undefined
      };
      setMessages([...messages, newMessage]);
    }
    
    setInputText("");
    setReplyTo(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleReply = (msg: Message) => {
    setReplyTo(msg);
    setEditingMessageId(null);
    // Focus input? 
    // In a real app we'd use a ref to focus the textarea
  };

  const handleEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setInputText(msg.text);
    setReplyTo(null);
  };

  const handleDeleteMessage = (msgId: string, type: 'me' | 'everyone') => {
    // For demo purposes, we just remove it from the list for both options
    // In a real backend scenario, 'everyone' would emit a delete event
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const handleClearChat = (type: 'local' | 'both') => {
    setMessages([]);
    setIsClearDialogOpen(false);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white relative">
      {/* Header */}
      <header className="px-4 py-3 flex items-center justify-between bg-gray-900/95 backdrop-blur-md sticky top-0 z-20 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          
          <div className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-colors pr-2">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-700">
              <ImageWithFallback 
                src={chatAvatar} 
                alt={chatName} 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {chatName}
              </h2>
              <p className="text-xs text-gray-400">
                {isGroup ? "Tippen für Gruppeninfo" : "Zuletzt online: heute 10:30"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <Video size={22} />
          </button>
          <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <Phone size={20} />
          </button>
          
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors outline-none">
                <MoreVertical size={20} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content 
                className="min-w-[180px] bg-gray-800 rounded-xl shadow-xl p-1.5 border border-gray-700 data-[side=top]:animate-slideDownAndFade data-[side=bottom]:animate-slideUpAndFade z-50 mr-2"
                sideOffset={5}
                align="end"
              >
                <DropdownMenu.Item className="flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer">
                  <span>Kontakt ansehen</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer">
                  <span>Medien, Links und Doku...</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer">
                  <span>Suchen</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer">
                  <span>Hintergrund ändern</span>
                </DropdownMenu.Item>
                
                <DropdownMenu.Item 
                  onSelect={() => setIsClearDialogOpen(true)}
                  className="flex items-center gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer"
                >
                  <Trash2 size={16} />
                  <span>Chatverlauf löschen</span>
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="h-px bg-gray-700 my-1" />
                <DropdownMenu.Item className="flex items-center gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer">
                  <span>Blockieren</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      {/* Messages Area */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900"
        style={{
           backgroundImage: "url('https://www.transparenttextures.com/patterns/subtle-dark-vertical.png')",
           backgroundBlendMode: "overlay"
        }}
      >
        <div className="flex justify-center my-4">
           <span className="bg-gray-800/80 text-gray-400 text-xs px-3 py-1 rounded-full shadow-sm backdrop-blur-sm">
             Heute
           </span>
        </div>

        {messages.map((msg) => (
          <div 
            key={msg.id}
            className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
          >
            <ContextMenu.Root>
              <ContextMenu.Trigger asChild>
                <div 
                  className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm relative group cursor-pointer ${
                    msg.sender === "me" 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-gray-800 text-gray-100 rounded-tl-none border border-gray-700"
                  }`}
                >
                  {/* Reply Quote Display */}
                  {msg.replyTo && (
                    <div className={`mb-2 rounded-lg p-2 text-xs border-l-4 ${
                      msg.sender === "me" 
                        ? "bg-blue-700/50 border-blue-300" 
                        : "bg-gray-700/50 border-gray-500"
                    }`}>
                      <p className="font-bold opacity-80 mb-0.5">{msg.replyTo.sender}</p>
                      <p className="line-clamp-1 opacity-70">{msg.replyTo.text}</p>
                    </div>
                  )}

                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  
                  <div className={`flex items-center justify-end gap-1 mt-1 ${msg.sender === "me" ? "text-blue-200" : "text-gray-400"}`}>
                    {msg.isEdited && <span className="text-[10px] italic opacity-80 mr-1">bearbeitet</span>}
                    <span className="text-[10px]">{msg.timestamp}</span>
                    {msg.sender === "me" && (
                       <span>
                         {msg.status === "sent" && <Check size={12} />}
                         {msg.status === "delivered" && <CheckCheck size={12} />}
                         {msg.status === "read" && <CheckCheck size={12} className="text-blue-200" />} 
                       </span>
                    )}
                  </div>
                </div>
              </ContextMenu.Trigger>

              <ContextMenu.Portal>
                <ContextMenu.Content 
                  className="min-w-[180px] bg-gray-800 rounded-xl shadow-xl p-1.5 border border-gray-700 z-50 animate-in fade-in zoom-in-95 duration-200"
                >
                  <ContextMenu.Item 
                    onSelect={() => handleReply(msg)}
                    className="flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer"
                  >
                    <Reply size={16} />
                    <span>Antworten</span>
                  </ContextMenu.Item>

                  {msg.sender === "me" && (
                    <ContextMenu.Item 
                      onSelect={() => handleEdit(msg)}
                      className="flex items-center gap-2 px-2 py-2 text-sm text-gray-200 rounded-lg hover:bg-gray-700 outline-none cursor-pointer"
                    >
                      <Pencil size={16} />
                      <span>Bearbeiten</span>
                    </ContextMenu.Item>
                  )}

                  <ContextMenu.Sub>
                    <ContextMenu.SubTrigger className="flex items-center justify-between gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer data-[state=open]:bg-red-500/10">
                      <div className="flex items-center gap-2">
                        <Trash2 size={16} />
                        <span>Löschen</span>
                      </div>
                      <span className="ml-auto text-xs opacity-50">▶</span>
                    </ContextMenu.SubTrigger>
                    <ContextMenu.Portal>
                      <ContextMenu.SubContent
                        className="min-w-[160px] bg-gray-800 rounded-xl shadow-xl p-1.5 border border-gray-700 animate-in fade-in zoom-in-95 duration-200 ml-1"
                        sideOffset={2}
                        alignOffset={-5}
                      >
                        <ContextMenu.Item 
                          onSelect={() => handleDeleteMessage(msg.id, 'me')}
                          className="flex items-center gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer"
                        >
                          <span>Für mich löschen</span>
                        </ContextMenu.Item>
                        <ContextMenu.Item 
                          onSelect={() => handleDeleteMessage(msg.id, 'everyone')}
                          className="flex items-center gap-2 px-2 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 outline-none cursor-pointer"
                        >
                          <span>Für beide löschen</span>
                        </ContextMenu.Item>
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
        <AnimatePresence>
          {replyTo && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-gray-800/50 backdrop-blur-md border-b border-gray-700 px-4 py-2 flex items-center justify-between"
            >
              <div className="flex items-start gap-3 overflow-hidden">
                <Reply size={20} className="text-blue-400 mt-1 shrink-0" />
                <div className="border-l-2 border-blue-500 pl-3">
                   <p className="text-blue-400 text-xs font-bold mb-0.5">Antwort an {replyTo.sender === "me" ? "Dich" : chatName}</p>
                   <p className="text-gray-300 text-sm line-clamp-1">{replyTo.text}</p>
                </div>
              </div>
              <button 
                onClick={() => setReplyTo(null)}
                className="p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </motion.div>
          )}
          {editingMessageId && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-gray-800/50 backdrop-blur-md border-b border-gray-700 px-4 py-2 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Pencil size={18} className="text-blue-400" />
                <p className="text-blue-400 text-sm font-bold">Nachricht bearbeiten</p>
              </div>
              <button 
                onClick={() => {
                  setEditingMessageId(null);
                  setInputText("");
                }}
                className="p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-3 flex items-end gap-2">
          <button className="p-3 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full transition-colors shrink-0">
            <PlusIconWrapper />
          </button>
          
          <div className="flex-1 bg-gray-800 rounded-2xl flex items-center min-h-[48px] border border-gray-700 focus-within:border-blue-500/50 transition-colors">
            <button className="pl-3 pr-2 text-gray-400 hover:text-yellow-400 transition-colors">
              <Smile size={24} />
            </button>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={editingMessageId ? "Bearbeite deine Nachricht..." : "Nachricht..."}
              className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-gray-500 max-h-32 py-3 resize-none overflow-y-auto leading-relaxed outline-none"
              rows={1}
              style={{ minHeight: "24px" }}
            />
            <div className="flex items-center pr-2 gap-1">
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <Paperclip size={20} />
              </button>
              {!inputText && (
                <button className="p-2 text-gray-400 hover:text-white transition-colors">
                  <Camera size={20} />
                </button>
              )}
            </div>
          </div>

          <button 
            onClick={inputText.trim() ? handleSendMessage : undefined}
            className={`p-3 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center ${
              inputText.trim() 
                ? "bg-blue-600 text-white hover:bg-blue-500" 
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {inputText.trim() 
               ? (editingMessageId ? <Check size={20} /> : <Send size={20} className="ml-0.5" />)
               : <Mic size={20} />
            }
          </button>
        </div>
      </div>

      {/* Clear Chat Alert Dialog */}
      <AlertDialog.Root open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="bg-black/50 backdrop-blur-sm fixed inset-0 z-50 animate-in fade-in duration-200" />
          <AlertDialog.Content className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[400px] translate-x-[-50%] translate-y-[-50%] rounded-xl bg-gray-900 border border-gray-800 p-6 shadow-2xl focus:outline-none z-50 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                 <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                    <Trash2 size={24} />
                 </div>
                 <div>
                    <AlertDialog.Title className="text-lg font-semibold text-white">
                      Chatverlauf löschen?
                    </AlertDialog.Title>
                    <AlertDialog.Description className="text-sm text-gray-400 mt-1">
                      Möchtest du wirklich alle Nachrichten in diesem Chat löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                    </AlertDialog.Description>
                 </div>
              </div>
              
              <div className="flex flex-col gap-2 mt-2">
                <AlertDialog.Action 
                   onClick={() => handleClearChat('local')}
                   className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                >
                  Nur lokal löschen
                </AlertDialog.Action>
                <AlertDialog.Action 
                   onClick={() => handleClearChat('both')}
                   className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  Für beide löschen
                </AlertDialog.Action>
                <AlertDialog.Cancel 
                   className="w-full py-3 bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg font-medium transition-colors border border-gray-700"
                >
                  Abbrechen
                </AlertDialog.Cancel>
              </div>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

function PlusIconWrapper() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <div className="w-6 h-6 flex items-center justify-center cursor-pointer">
            <span className="text-2xl leading-none font-light pb-1">+</span>
        </div>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content 
            className="min-w-[160px] bg-gray-800 rounded-xl shadow-2xl p-2 border border-gray-700 mb-2 ml-2 data-[side=top]:animate-slideUpAndFade z-50"
            sideOffset={10}
            align="start"
            side="top"
        >
             <DropdownMenu.Item className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 cursor-pointer outline-none">
                <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg"><ImageIcon size={18}/></div>
                Fotos & Videos
             </DropdownMenu.Item>
             <DropdownMenu.Item className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 cursor-pointer outline-none">
                <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg"><Camera size={18}/></div>
                Kamera
             </DropdownMenu.Item>
             <DropdownMenu.Item className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-gray-700 cursor-pointer outline-none">
                <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg"><FileText size={18}/></div>
                Dokument
             </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}