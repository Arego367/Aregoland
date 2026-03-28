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
}
