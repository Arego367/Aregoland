export interface Contact {
  id: string;
  name: string;
  role?: string; // Can be used for "Status" or similar
  type?: "individual" | "group"; // New field to distinguish
  categories: string[]; // Changed from single category to array
  avatar: string;
  status?: string;
  
  // Individual fields
  phone?: string;
  email?: string;
  address?: string;
  birthday?: string;
  ageRating?: number; // For children
  
  // Group fields
  groupAdmin?: string; // Name of admin
  groupCreator?: string; // Name of creator
  groupManagers?: string[]; // Names of managers
  description?: string;
}

export interface Tab {
  id: string;
  label: string;
  hidden?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;        // ISO date string YYYY-MM-DD
  startTime: string;   // HH:mm
  duration: '15min' | '30min' | '1h' | '2h' | 'allday';
  reminder: 'none' | '10min' | '30min' | '1h' | '1day';
  color: string;       // Tailwind color class prefix, e.g. 'blue', 'purple'
  note?: string;
}

export type { UserIdentity } from "@/app/auth/identity";
