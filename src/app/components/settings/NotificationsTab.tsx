import { useState } from "react";
import { ArrowLeft, Bell, MessageCircle, Phone, Volume2, BellRing } from "lucide-react";

const NOTIF_KEY = "aregoland_notifications";

interface NotifSettings {
  push: boolean;
  messages: boolean;
  calls: boolean;
  sounds: boolean;
}

function loadNotifSettings(): NotifSettings {
  try { return { push: true, messages: true, calls: true, sounds: true, ...JSON.parse(localStorage.getItem(NOTIF_KEY) ?? "{}") }; }
  catch { return { push: true, messages: true, calls: true, sounds: true }; }
}

function saveNotifSettings(s: NotifSettings) { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); }

interface NotificationsTabProps {
  onBack: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function NotificationsTab({ onBack, t }: NotificationsTabProps) {
  const [notif, setNotif] = useState<NotifSettings>(loadNotifSettings);

  const toggleNotif = (key: keyof NotifSettings) => {
    const next = { ...notif, [key]: !notif[key] };
    if (key === "push" && !notif.push && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setNotif(next);
    saveNotifSettings(next);
  };

  const toggleItems: { key: keyof NotifSettings; icon: typeof Bell; label: string; desc: string }[] = [
    { key: "push", icon: BellRing, label: t('settings.notifPush'), desc: t('settings.notifPushDesc') },
    { key: "messages", icon: MessageCircle, label: t('settings.notifMessages'), desc: t('settings.notifMessagesDesc') },
    { key: "calls", icon: Phone, label: t('settings.notifCalls'), desc: t('settings.notifCallsDesc') },
    { key: "sounds", icon: Volume2, label: t('settings.notifSounds'), desc: t('settings.notifSoundsDesc') },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white font-sans">
      <header className="px-4 py-4 flex items-center gap-4 bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold">{t('settings.notifications')}</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6 max-w-lg mx-auto">
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
            {toggleItems.map(({ key, icon: Icon, label, desc }) => (
              <div key={key} className="flex items-center justify-between p-4 border-b border-gray-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${notif[key] ? "bg-purple-500/20 text-purple-400" : "bg-gray-700/50 text-gray-500"}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs text-gray-500">{desc}</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotif(key)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${notif[key] ? "bg-blue-600" : "bg-gray-600"}`}
                >
                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${notif[key] ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>
            ))}
          </div>
          {("Notification" in window && Notification.permission === "denied") && (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-xs text-red-300">
              {t('settings.notifBlocked')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
