import { Users, Music, Sun, LayoutDashboard, CheckSquare, CalendarDays, Flag, StickyNote, Bookmark, FolderKanban, Lightbulb, ListChecks, Timer, Wallet, Files, Code2, Activity, Search, Settings } from "lucide-react";
export const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/deadlines", label: "Deadlines", icon: Flag },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/checklists", label: "Checklists", icon: ListChecks },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/splits", label: "Splits", icon: Users },
  { href: "/music", label: "Music", icon: Music },
  { href: "/files", label: "Files", icon: Files },
  { href: "/developer", label: "Developer", icon: Code2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
];
export const MOBILE_MAIN = ["/dashboard", "/tasks", "/calendar"];
