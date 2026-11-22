import { AtSign, Bell, Bookmark, CalendarDays, CircleUserRound, House, Images, MessageCircle, ReceiptText, Settings2, SquarePen, TrendingUp, type LucideIcon } from "lucide-react";

// OF Manager (comme Infloww) : chaque entrée ouvre la page correspondante du vrai site OnlyFans de la modèle
// (site intégré de Substy). path : adresse sur le site OnlyFans (« {user} » = identifiant OnlyFans de la modèle).
export type OfPage = { key: string; label: string; title: string; icon: LucideIcon; path: string };
export const OF_PAGES: OfPage[] = [
  { key: "home", label: "Home", title: "Home", icon: House, path: "/" },
  { key: "new-post", label: "New post", title: "New post", icon: SquarePen, path: "/posts/create" },
  { key: "notifications", label: "Notifications", title: "Notifications", icon: Bell, path: "/my/notifications" },
  { key: "messages", label: "Messages Basic", title: "Messages Basic", icon: MessageCircle, path: "/my/chats" },
  { key: "vault", label: "Vault", title: "Vault", icon: Images, path: "/my/vault" },
  { key: "queue", label: "Queue", title: "Queue", icon: CalendarDays, path: "/my/queue" },
  { key: "collections", label: "Collections", title: "Collections", icon: Bookmark, path: "/my/collections/user-lists" },
  { key: "statements", label: "Statements", title: "Statements", icon: ReceiptText, path: "/my/statements/earnings" },
  { key: "statistics", label: "Statistics", title: "Statistics", icon: TrendingUp, path: "/my/statistics/statements/earnings" },
  { key: "profile", label: "My profile", title: "My profile", icon: CircleUserRound, path: "/{user}" },
  { key: "settings", label: "OF settings", title: "OF settings", icon: Settings2, path: "/my/settings" },
  { key: "release-forms", label: "Release forms", title: "Release forms", icon: AtSign, path: "/my/release-forms" },
];
export const ofPage = (key: string | undefined) => OF_PAGES.find((p) => p.key === key) ?? OF_PAGES[0];
