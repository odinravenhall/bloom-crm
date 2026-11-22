"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  BarChart3,
  Bot,
  FlaskConical,
  Flower2,
  Home,
  Images,
  Inbox,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  ScrollText,
  Send,
  Settings,
  UsersRound,
  X,
  ListChecks,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/fmt";
import { PlatformSwitch } from "./PlatformSwitch";
import { useCreators } from "@/lib/creators";
import { Avatar, BloomMark, Logo } from "@/components/ui";
import { ROLE_LABEL, homeOf, type Me, type Role } from "@/lib/types";

type Item = { href: string; label: string; icon: LucideIcon; roles?: Role[]; soon?: boolean };
type Group = { title: string | null; items: Item[] };

const CHAT: Role[] = ["admin", "manager", "lead", "chatter"];
const BOSS: Role[] = ["admin", "manager", "lead"];
const MANAGE: Role[] = ["admin", "manager"];

// Accueil : tout en haut, au-dessus du choix de plateforme (il montre toute l'agence).
const HOME: Item = { href: "/app", label: "Accueil", icon: Home, roles: ["admin", "manager", "lead", "model"] };

// Menu de gauche : tout est visible, rangé sous de petits titres. Chaque rôle ne voit que ce qui le concerne.
const GROUPS: Group[] = [
  {
    title: null,
    items: [
      { href: "/app/messagerie", label: "Messagerie", icon: Inbox, roles: CHAT },
    ],
  },
  {
    title: "Chatting",
    items: [
      { href: "/app/scripts", label: "Scripts & séquences", icon: ScrollText, roles: CHAT },
      { href: "/app/listes", label: "Listes", icon: ListChecks, roles: CHAT },
      { href: "/app/vault", label: "Vault", icon: Images, roles: CHAT },
      { href: "/app/envoi", label: "Envoi groupé", icon: Send, roles: CHAT },
    ],
  },
  {
    title: "Intelligence artificielle",
    items: [
      { href: "/app/ia", label: "Configuration IA", icon: Bot, roles: MANAGE },
      { href: "/app/ia-test", label: "Tester l’IA", icon: FlaskConical, roles: MANAGE, soon: true },
    ],
  },
  {
    title: "Équipe",
    items: [
      { href: "/app/equipe", label: "Équipe", icon: UsersRound, roles: BOSS },
      { href: "/app/messages", label: "Messages envoyés", icon: MessagesSquare, roles: BOSS },
      { href: "/app/stats", label: "Performances", icon: BarChart3, roles: BOSS },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/app/creatrices", label: "Créatrices", icon: Flower2, roles: MANAGE },
      { href: "/app/reglages", label: "Branchements", icon: Plug, roles: ["admin"] },
    ],
  },
];
const isOn = (path: string, href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/"));
const KEY = "bloom.nav-small";
const OPEN_KEY = "bloom.nav-open";

export function SideNav({ me }: { me: Me }) {
  const path = usePathname();
  const [small, setSmall] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    try {
      setSmall(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => setMobile(false), [path]);
  const toggle = () =>
    setSmall((s) => {
      try {
        localStorage.setItem(KEY, s ? "0" : "1");
      } catch {}
      return !s;
    });

  // Dans la messagerie, le menu se réduit tout seul en icônes (plus de place pour chatter), sauf si on l'agrandit à la main.
  const inChat = path.startsWith("/app/messagerie");
  const [chatWide, setChatWide] = useState(false);
  useEffect(() => setChatWide(false), [inChat]);
  const userSmall = small;
  const narrow = inChat ? !chatWide : userSmall;
  const toggleNav = () => (inChat ? setChatWide((w) => !w) : toggle());

  // « Listes » : Smart lists sur OnlyFans, Groupes sur MYM.
  const { pf } = useCreators();
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(me.role)).map((i) => (i.href === "/app/listes" ? { ...i, label: pf === "mym" ? "Groupes" : "Smart lists" } : i)),
  })).filter((g) => g.items.length);
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/connexion";
  };

  // Catégories qu'on déroule (gardé sur cet ordinateur) ; celle de la page ouverte se déroule toute seule.
  const [openG, setOpenG] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      setOpenG(JSON.parse(localStorage.getItem(OPEN_KEY) || "null"));
    } catch {
      setOpenG(null);
    }
  }, []);
  const isOpenG = (g: { title: string | null; items: Item[] }) =>
    !g.title || g.items.some((i) => isOn(path, i.href)) || (openG ? openG.includes(g.title) : true);
  const toggleG = (t: string) =>
    setOpenG((cur) => {
      const base = cur ?? groups.filter((g) => g.title).map((g) => g.title as string);
      const next = base.includes(t) ? base.filter((x) => x !== t) : [...base, t];
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const item = (i: Item, compact: boolean) => {
    const on = isOn(path, i.href);
    return (
      <Link
        key={i.href}
        href={i.href}
        title={compact ? i.label : undefined}
        className={cn(
          "group/item flex items-center gap-2.5 rounded-lg py-1.5 text-[13px] transition-colors",
          compact ? "justify-center px-0" : "px-1.5",
          on ? "bg-white/[0.06] font-semibold text-fg" : "text-muted hover:bg-white/[0.03] hover:text-fg",
          i.soon && !on && "opacity-55",
        )}
      >
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-md border transition-colors", on ? "border-transparent bg-primary text-white" : "border-line bg-card-2/60 group-hover/item:border-input")}>
          <i.icon className="size-[15px]" />
        </span>
        {compact ? null : <span className="flex-1 truncate">{i.label}</span>}
        {i.soon && !compact ? <span className="rounded border border-line px-1 text-[9px] font-semibold text-muted uppercase" title="bientôt">bientôt</span> : null}
      </Link>
    );
  };

  const links = (compact: boolean) => (
    <nav className="flex flex-col gap-3">
      {groups.map((g) => {
        const open = compact || isOpenG(g);
        return (
          <div key={g.title ?? "top"} className="flex flex-col gap-0.5">
            {g.title && !compact ? (
              <button onClick={() => toggleG(g.title as string)} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[10.5px] font-semibold tracking-[0.12em] text-muted/80 uppercase hover:text-fg">
                <span className="flex-1 text-left">{g.title}</span>
                <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
              </button>
            ) : null}
            {g.title && compact ? <span className="mx-auto my-1 h-px w-5 bg-line" /> : null}
            {open ? g.items.map((i) => item(i, compact)) : null}
          </div>
        );
      })}
    </nav>
  );

  const footer = (compact: boolean) => (
    <div className="flex flex-col gap-2">
      {item({ href: "/app/parametres", label: "Paramètres", icon: Settings }, compact)}
      <div className={cn("flex items-center gap-2.5 rounded-2xl border bg-bg p-2", compact && "flex-col")}>
        <Avatar src={me.avatar} name={me.name} size="size-9" />
        {compact ? null : (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold">{me.name}</p>
            <p className="truncate text-xs text-muted">{ROLE_LABEL[me.role] ?? "Chatteur"}</p>
          </div>
        )}
        <button onClick={logout} title="Se déconnecter" className="grid size-8 place-items-center rounded-full text-muted hover:bg-card hover:text-fg">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* téléphone : barre en haut + menu plein écran */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b bg-panel-strong px-4 py-2.5 md:hidden">
        <Logo href={homeOf(me.role)} />
        <button onClick={() => setMobile((m) => !m)} className="grid size-9 place-items-center rounded-full border bg-card" aria-label="Menu">
          {mobile ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {mobile ? (
        <div className="fixed inset-x-0 top-[57px] bottom-0 z-40 flex flex-col justify-between overflow-y-auto bg-bg px-4 py-4 md:hidden">
          {HOME.roles!.includes(me.role) ? <nav className="mb-2">{item(HOME, false)}</nav> : null}
          <div className="mb-4">
            <PlatformSwitch compact={false} />
          </div>
          {links(false)}
          <div className="mt-6">{footer(false)}</div>
        </div>
      ) : null}

      {/* ordinateur : menu à gauche */}
      <aside className={cn("no-scrollbar hidden h-dvh shrink-0 flex-col gap-6 overflow-y-auto border-r bg-panel-strong py-5 md:flex", narrow ? "w-[72px] px-3" : "w-60 px-4")}>
        <div className={cn("flex items-center", narrow ? "flex-col gap-3" : "justify-between pl-1")}>
          {narrow ? <BloomMark className="size-9" /> : <Logo href={homeOf(me.role)} />}
          <button onClick={toggleNav} title={narrow ? "Agrandir le menu" : "Réduire le menu"} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card hover:text-fg">
            {narrow ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        {HOME.roles!.includes(me.role) ? <nav className="-mb-3">{item(HOME, narrow)}</nav> : null}
        <PlatformSwitch compact={narrow} />
        {links(narrow)}
        <div className="mt-auto border-t pt-4">{footer(narrow)}</div>
      </aside>
    </>
  );
}
