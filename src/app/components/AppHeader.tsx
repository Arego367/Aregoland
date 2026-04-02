import { useTranslation } from "react-i18next";
import { ArrowLeft, User, QrCode, Settings } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import ProfileAvatar from "./ProfileAvatar";

interface AppHeaderProps {
  title: string;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenQRCode: () => void;
  onOpenSettings: () => void;
  /** Primary action button in the center */
  action?: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    onClick: () => void;
  };
  /** Extra buttons rendered before the avatar (e.g. search icon, today button) */
  rightExtra?: React.ReactNode;
}

export default function AppHeader({ title, onBack, onOpenProfile, onOpenQRCode, onOpenSettings, action, rightExtra }: AppHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="px-4 py-3 flex items-center bg-gray-900 sticky top-0 z-20 border-b border-gray-800">
      {/* Left: Back + Title */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all shrink-0">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-white truncate">{title}</h1>
      </div>

      {/* Center: Primary action */}
      {action && (
        <button onClick={action.onClick}
          className="flex items-center gap-1.5 sm:px-3 sm:py-2 p-2.5 bg-blue-600 hover:bg-blue-500 text-white sm:rounded-xl rounded-full transition-all text-sm font-medium min-w-[44px] min-h-[44px] justify-center mx-2 shrink-0">
          <action.icon size={18} />
          <span className="hidden sm:inline">{action.label}</span>
        </button>
      )}

      {/* Right: Extra buttons + Avatar with dropdown */}
      <div className="flex items-center gap-1.5 flex-1 justify-end">
        {rightExtra}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <div>
              <ProfileAvatar onClick={() => {}} />
            </div>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[220px] bg-gray-800 rounded-xl shadow-2xl p-2 border border-gray-700 z-50 mr-4"
              sideOffset={8}
              align="end"
            >
              <DropdownMenu.Label className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t("common.myAccount")}
              </DropdownMenu.Label>

              <DropdownMenu.Item
                onClick={onOpenProfile}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <User size={18} />
                <span className="font-medium">{t("common.profile")}</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onClick={onOpenQRCode}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <QrCode size={18} />
                <span className="font-medium">{t("common.qrCode")}</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onClick={onOpenSettings}
                className="group flex items-center gap-3 px-3 py-2.5 text-sm text-gray-200 rounded-lg hover:bg-blue-600 hover:text-white outline-none cursor-pointer transition-colors"
              >
                <Settings size={18} />
                <span className="font-medium">{t("common.settings")}</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
