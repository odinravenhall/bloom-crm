"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/fmt";
import { Avatar, BloomMark, Logo } from "@/components/ui";
import { ROLE_LABEL, homeOf, type Me, type Role } from "@/lib/types";

type Item = { href: string; label: string; icon: LucideIcon; roles?: Role[]; soon?: boolean };
type Group = { title: string | null; items: Item[] };

const CHAT: Role[] = ["admin", "manager", "lead", "chatter"];
const BOSS: Role[] = ["admin", "manager", "lead"];
const MANAGE: Role[] = ["admin", "manager"];

// Menu de gauche : tout est visible, rangé sous de petits titres. Chaque rôle ne voit que ce qui le concerne.
const GROUPS: Group[] = [
  {
    title: null,
    items: [
      { href: "/app", label: "Accueil", icon: Home, roles: ["admin", "manager", "lead", "model"] },
      { href: "/app/messagerie", label: "Messagerie", icon: Inbox, roles: CHAT },
    ],
  },
  {
    title: "Chatting",
    items: [
      { href: "/app/scripts", label: "Scripts & séquences", icon: ScrollText, roles: CHAT },
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

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(me.role)) })).filter((g) => g.items.length);
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/connexion";
  };

  const item = (i: Item, compact: boolean) => {
    const on = isOn(path, i.href);
    return (
      <Link
        key={i.href}
        href={i.href}
        title={compact ? i.label : undefined}
        className={cn(
          "flex items-center gap-3 rounded-2xl py-2 text-sm transition-colors",
          compact ? "justify-center px-0" : "px-3",
          on ? "bg-card font-semibold text-fg shadow-sm ring-1 ring-line" : "text-muted hover:text-fg",
          i.soon && !on && "opacity-60",
        )}
      >
        <i.icon className={cn("size-[18px] shrink-0", on && "text-primary")} />
        {compact ? null : <span className="flex-1 truncate">{i.label}</span>}
        {i.soon && !compact ? <span className="size-1.5 rounded-full bg-sage" title="bientôt" /> : null}
      </Link>
    );
  };

  const links = (compact: boolean) => (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.title ?? "top"} className="flex flex-col gap-0.5">
          {g.title && !compact ? <p className="px-3 pb-1 font-display text-[13px] text-muted italic">{g.title}</p> : null}
          {g.title && compact ? <span className="mx-auto mb-1 h-px w-5 bg-line" /> : null}
          {g.items.map((i) => item(i, compact))}
        </div>
      ))}
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
          {links(false)}
          <div className="mt-6">{footer(false)}</div>
        </div>
      ) : null}

      {/* ordinateur : menu à gauche */}
      <aside className={cn("no-scrollbar hidden h-dvh shrink-0 flex-col gap-6 overflow-y-auto border-r bg-panel-strong py-5 md:flex", small ? "w-[72px] px-3" : "w-60 px-4")}>
        <div className={cn("flex items-center", small ? "flex-col gap-3" : "justify-between pl-1")}>
          {small ? <BloomMark className="size-9" /> : <Logo href={homeOf(me.role)} />}
          <button onClick={toggle} title={small ? "Agrandir le menu" : "Réduire le menu"} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card hover:text-fg">
            {small ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        {links(small)}
        <div className="mt-auto border-t pt-4">{footer(small)}</div>
      </aside>
    </>
  );
}
