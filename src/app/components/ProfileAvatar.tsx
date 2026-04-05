import { useState, useEffect } from "react";

function loadAvatar(): { avatarBase64: string | null; initials: string } {
  try {
    const profile = JSON.parse(localStorage.getItem("arego_profile") ?? "{}");
    const identity = JSON.parse(localStorage.getItem("aregoland_identity") ?? "{}");
    const firstName = profile.firstName ?? identity.displayName?.split(" ")[0] ?? "";
    const lastName = profile.lastName ?? identity.displayName?.split(" ").slice(1).join(" ") ?? "";
    const i1 = (firstName[0] ?? "").toUpperCase();
    const i2 = (lastName[0] ?? firstName[1] ?? "").toUpperCase();
    return { avatarBase64: profile.avatarBase64 ?? null, initials: i1 + i2 };
  } catch { return { avatarBase64: null, initials: "" }; }
}

interface ProfileAvatarProps {
  onClick: () => void;
  size?: number;
}

export default function ProfileAvatar({ onClick, size = 44 }: ProfileAvatarProps) {
  const [avatar, setAvatar] = useState(loadAvatar);

  useEffect(() => {
    const refresh = () => setAvatar(loadAvatar());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  return (
    <button
      onClick={onClick}
      className="rounded-full overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {avatar.avatarBase64 ? (
        <img src={avatar.avatarBase64} alt="Profil" className="w-full h-full object-cover" />
      ) : (
        <span className="text-sm font-bold text-white select-none">{avatar.initials}</span>
      )}
    </button>
  );
}
