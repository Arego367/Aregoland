import { useState, useEffect } from "react";
import WelcomeScreen from "@/app/components/WelcomeScreen";
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
import { Tab } from "@/app/types";
import { MOCK_CHATS } from "@/app/data/mocks";

const INITIAL_TABS: Tab[] = [
  { id: "all", label: "Alle" },
  { id: "child", label: "Kinder" },
  { id: "space", label: "Space" },
];

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<"welcome" | "dashboard" | "chatList" | "profile" | "qrcode" | "settings" | "childProfile" | "people" | "spaces" | "connect" | "chatConversation" | "documents">("welcome");
  const [returnTo, setReturnTo] = useState<"dashboard" | "chatList" | "welcome">("dashboard");
  const [qrCodeMode, setQrCodeMode] = useState<"display" | "scan">("display");
  const [tabs, setTabs] = useState<Tab[]>(INITIAL_TABS);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Determine where to go after Welcome Screen based on settings
  const handleGetStarted = () => {
    const savedStartScreen = localStorage.getItem("aregoland_start_screen");

    if (savedStartScreen && ["dashboard", "chatList"].includes(savedStartScreen)) {
       setCurrentScreen(savedStartScreen as any);
       if (savedStartScreen === "chatList") {
           setReturnTo("chatList");
       } else {
           setReturnTo("dashboard");
       }
    } else {
        // Default
        setCurrentScreen("dashboard");
        setReturnTo("dashboard");
    }
  };

  const navigateTo = (screen: "profile" | "qrcode" | "settings") => {
    // Determine where we are coming from to set the return path correctly
    if (currentScreen === "dashboard") {
      setReturnTo("dashboard");
    } else if (currentScreen === "chatList") {
      setReturnTo("chatList");
    }
    
    if (screen === "qrcode") {
        setQrCodeMode("display");
    }
    
    setCurrentScreen(screen);
  };

  const handleChatSelect = (chatId: string) => {
    setSelectedChatId(chatId);
    setCurrentScreen("chatConversation");
  };

  const selectedChat = MOCK_CHATS.find(c => c.id === selectedChatId);

  return (
    <div className="size-full">
      {currentScreen === "welcome" && (
        <WelcomeScreen 
          onGetStarted={handleGetStarted} 
          onShowQRCode={() => {
              setQrCodeMode("display");
              setCurrentScreen("qrcode");
              setReturnTo("welcome");
          }}
          onScanQRCode={() => {
              setQrCodeMode("scan");
              setCurrentScreen("qrcode");
              setReturnTo("welcome");
          }}
        />
      )}
      
      {currentScreen === "dashboard" && (
        <DashboardScreen 
          onNavigate={(target) => {
            if (target === "chatList") {
              setCurrentScreen("chatList");
            } else if (target === "people") {
              setCurrentScreen("people");
            } else if (target === "community") {
              setCurrentScreen("spaces");
            } else if (target === "connect") {
              setCurrentScreen("connect");
            } else if (target === "documents") {
              setCurrentScreen("documents");
            } else {
              // Placeholder for other tiles
              console.log("Navigating to", target);
              alert(`Funktion "${target}" ist noch nicht verfügbar.`);
            }
          }}
          onOpenProfile={() => navigateTo("profile")}
          onOpenQRCode={() => navigateTo("qrcode")}
          onOpenSettings={() => navigateTo("settings")}
        />
      )}

      {currentScreen === "chatList" && (
        <ChatListScreen 
          onOpenProfile={() => navigateTo("profile")} 
          onOpenQRCode={() => navigateTo("qrcode")}
          onOpenSettings={() => navigateTo("settings")}
          onBack={() => setCurrentScreen("dashboard")}
          tabs={tabs}
          onUpdateTabs={setTabs}
          onChatSelect={handleChatSelect}
        />
      )}

      {currentScreen === "chatConversation" && selectedChat && (
        <ChatScreen
          chatId={selectedChat.id}
          chatName={selectedChat.name}
          chatAvatar={selectedChat.avatarUrl}
          isGroup={selectedChat.isGroup}
          onBack={() => setCurrentScreen("chatList")}
        />
      )}

      {currentScreen === "profile" && (
        <ProfileScreen onBack={() => setCurrentScreen(returnTo)} />
      )}
      {currentScreen === "qrcode" && (
        <QRCodeScreen 
          onBack={() => setCurrentScreen(returnTo)}
          initialMode={qrCodeMode}
        />
      )}
      {currentScreen === "settings" && (
        <SettingsScreen 
          onBack={() => setCurrentScreen(returnTo)} 
        />
      )}
      {currentScreen === "people" && (
        <PeopleScreen 
          onBack={() => setCurrentScreen("dashboard")}
          onOpenChildProfile={() => setCurrentScreen("childProfile")}
          tabs={tabs}
          onUpdateTabs={setTabs}
        />
      )}
      {currentScreen === "childProfile" && (
        <ChildProfileScreen onBack={() => setCurrentScreen("people")} />
      )}
      {currentScreen === "spaces" && (
        <SpacesScreen onBack={() => setCurrentScreen("dashboard")} />
      )}
      {currentScreen === "connect" && (
        <ConnectScreen onBack={() => setCurrentScreen("dashboard")} />
      )}
      {currentScreen === "documents" && (
        <DocumentsScreen onBack={() => setCurrentScreen("dashboard")} />
      )}
    </div>
  );
}