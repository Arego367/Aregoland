import { Contact } from "../types";

export const MOCK_CONTACTS: Contact[] = [
  {
    id: "1",
    name: "Leon",
    categories: ["child"],
    type: "individual",
    avatar: "https://images.unsplash.com/photo-1497881807663-38b9a95b7192?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGlsZCUyMHBvcnRyYWl0fGVufDF8fHx8MTc3MDIxMjA3NHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    status: "Online vor 2 Std.",
    ageRating: 12,
    birthday: "30.06.2014"
  },
  {
    id: "2",
    name: "Anna Müller",
    categories: ["family"],
    type: "individual",
    avatar: "https://images.unsplash.com/photo-1594318223885-20dc4b889f9e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21hbiUyMHBvcnRyYWl0JTIwc21pbGluZ3xlbnwxfHx8fDE3NzAyMTIwODB8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    phone: "+49 123 456789",
    email: "anna.mueller@example.com",
    address: "Musterstraße 1, Berlin",
    birthday: "15.03.1985"
  },
  {
    id: "3",
    name: "Thomas Weber",
    categories: ["work"],
    type: "individual",
    avatar: "https://images.unsplash.com/photo-1624835567150-0c530a20d8cc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYW4lMjBidXNpbmVzcyUyMHBvcnRyYWl0fGVufDF8fHx8MTc3MDEwNzI4Mnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    phone: "+49 987 654321",
    email: "t.weber@company.com"
  },
  {
    id: "4",
    name: "Martha Schmidt",
    categories: ["family"],
    type: "individual",
    avatar: "https://images.unsplash.com/photo-1496672254107-b07a26403885?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzZW5pb3IlMjB3b21hbiUyMHBvcnRyYWl0fGVufDF8fHx8MTc3MDEyNjY4OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    phone: "+49 555 123456",
    address: "Gartenweg 5, München",
    birthday: "22.08.1952"
  },
  // Added from Chat List
  {
    id: "5",
    name: "Entwickler Team",
    categories: ["work"],
    type: "group",
    avatar: "https://images.unsplash.com/photo-1613431710543-b048dc018291?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncm91cCUyMGZyaWVuZHMlMjBwZW9wbGUlMjBhdmF0YXJ8ZW58MXx8fHwxNzY5ODAzMjQ4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    groupAdmin: "Thomas Weber",
    groupCreator: "Thomas Weber",
    groupManagers: ["Anna Müller"]
  },
  {
    id: "6",
    name: "Sarah Müller",
    categories: ["friends"],
    type: "individual",
    avatar: "https://images.unsplash.com/photo-1599566147214-ce487862ea4f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwb3J0cmFpdCUyMHBlcnNvbiUyMGZhY2UlMjBhdmF0YXJ8ZW58MXx8fHwxNzY5NzQyNTE4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    birthday: "07.11.1993"
  },
  {
    id: "7",
    name: "Familie",
    categories: ["family"],
    type: "group",
    avatar: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&auto=format&fit=crop&q=60",
    groupCreator: "Du",
    groupAdmin: "Du",
    groupManagers: ["Anna Müller", "Martha Schmidt"]
  },
  {
    id: "8",
    name: "David Schmidt",
    categories: ["work"],
    type: "individual",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=60",
  },
  {
    id: "9",
    name: "Anna Weber",
    categories: ["other"],
    type: "individual",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=800&auto=format&fit=crop&q=60",
  },
  {
    id: "10",
    name: "Klassengruppe 10B",
    categories: ["school"],
    type: "group",
    avatar: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&auto=format&fit=crop&q=60",
    groupCreator: "Herr Müller",
    groupAdmin: "Leon",
  }
];
