export interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  avatarUrl: string;
  unreadCount: number;
  isGroup: boolean;
  category?: "family" | "school" | "work" | "other" | "child" | "space";
}

export const MOCK_CHATS: Chat[] = [
  {
    id: "1",
    name: "Entwickler Team",
    lastMessage: "Max: Habt ihr das neue Update gesehen?",
    time: "10:30",
    avatarUrl: "https://images.unsplash.com/photo-1613431710543-b048dc018291?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncm91cCUyMGZyaWVuZHMlMjBwZW9wbGUlMjBhdmF0YXJ8ZW58MXx8fHwxNzY5ODAzMjQ4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    unreadCount: 3,
    isGroup: true,
    category: "space",
  },
  {
    id: "2",
    name: "Sarah Müller",
    lastMessage: "Können wir uns später treffen?",
    time: "09:45",
    avatarUrl: "https://images.unsplash.com/photo-1599566147214-ce487862ea4f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwb3J0cmFpdCUyMHBlcnNvbiUyMGZhY2UlMjBhdmF0YXJ8ZW58MXx8fHwxNzY5NzQyNTE4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    unreadCount: 1,
    isGroup: false,
    category: "child",
  },
  {
    id: "3",
    name: "Familie",
    lastMessage: "Mama: Bitte vergesst nicht einzukaufen",
    time: "Gestern",
    avatarUrl: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&auto=format&fit=crop&q=60",
    unreadCount: 0,
    isGroup: true,
    category: "family",
  },
  {
    id: "4",
    name: "David Schmidt",
    lastMessage: "Danke für die Hilfe!",
    time: "Gestern",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=60",
    unreadCount: 0,
    isGroup: false,
    category: "work",
  },
  {
    id: "5",
    name: "Anna Weber",
    lastMessage: "Das Foto ist ja cool",
    time: "Dienstag",
    avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=800&auto=format&fit=crop&q=60",
    unreadCount: 0,
    isGroup: false,
    category: "other",
  },
  {
    id: "6",
    name: "Klassengruppe 10B",
    lastMessage: "Hausaufgaben Physik S. 42",
    time: "Montag",
    avatarUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&auto=format&fit=crop&q=60",
    unreadCount: 5,
    isGroup: true,
    category: "space",
  }
];
