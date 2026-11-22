"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Clock,
  Flower2,
  Heart,
  Home,
  Images,
  Inbox,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Send,
  Sparkle,
  Sun,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/fmt";
import { Avatar, BloomMark, Logo } from "@/components/ui";
import { ROLE_LABEL, type Me } from "@/lib/types";
import { THEMES, useTheme, type Theme } from "@/lib/theme";

type Who = "all" | "boss" | "admin";
type Item = { href: string; label: string; icon: LucideIcon; who?: Who; soon?: boolean };
type Group = { title: string | null; who?: Who; items: Item[] };

// Menu de gauche : tout est visible (pas d'accordéon), rangé sous de petits titres.
const GROUPS: Group[] = [
  {
    title: null,
    items: [
      { href: "/app", label: "Accueil", icon: Home, who: "boss" },
      { href: "/app/messagerie", label: "Messagerie", icon: Inbox },
    ],
  },
  {
    title: "Chatting",
    items: [
      { href: "/app/fans", label: "Fans", icon: Heart },
      { href: "/app/vault", label: "Vault", icon: Images },
      { href: "/app/envoi", label: "Envoi groupé", icon: Send, soon: true },
      { href: "/app/programmes", label: "Programmés", icon: Clock, soon: true },
    ],
  },
  {
    title: "Équipe",
    who: "boss",
    items: [
      { href: "/app/chatteurs", label: "Chatteurs", icon: UsersRound, who: "boss", soon: true },
      { href: "/app/stats", label: "Statistiques", icon: BarChart3, who: "boss", soon: true },
      { href: "/app/paies", label: "Paies", icon: Wallet, who: "boss", soon: true },
    ],
  },
  {
    title: "Admin",
    who: "admin",
    items: [
      { href: "/app/creatrices", label: "Créatrices", icon: Flower2, who: "admin" },
      { href: "/app/reglages", label: "Branchements", icon: Plug, who: "admin" },
    ],
  },
];
const allowed = (role: string, who: Who = "all") => who === "all" || (who === "boss" ? role === "admin" || role === "lead" : role === "admin");
const isOn = (path: string, href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/"));
const THEME_ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, onyx: Sparkle };
const KEY = "bloom.nav-small";

export function SideNav({ me }: { me: Me }) {
  const path = usePathname();
  const [small, setSmall] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { theme, setTheme } = useTheme();
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

  const groups = GROUPS.filter((g) => allowed(me.role, g.who))
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(me.role, i.who)) }))
    .filter((g) => g.items.length);
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/connexion";
  };

  const links = (compact: boolean) => (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.title ?? "top"} className="flex flex-col gap-0.5">
          {g.title && !compact ? <p className="px-3 pb-1 font-display text-[13px] text-muted italic">{g.title}</p> : null}
          {g.title && compact ? <span className="mx-auto mb-1 h-px w-5 bg-line" /> : null}
          {g.items.map((i) => {
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
          })}
        </div>
      ))}
    </nav>
  );

  const footer = (compact: boolean) => (
    <div className="flex flex-col gap-3">
      <div className={cn("flex rounded-full bg-card-2 p-0.5", compact ? "flex-col rounded-2xl" : "")}>
        {THEMES.map(([t, label]) => {
          const Icon = THEME_ICON[t];
          return (
            <button key={t} onClick={() => setTheme(t)} title={label} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold", theme === t ? "bg-card text-fg shadow-sm" : "text-muted hover:text-fg")}>
              <Icon className="size-3.5" />
              {compact ? null : label}
            </button>
          );
        })}
      </div>
      <div className={cn("flex items-center gap-2.5", compact && "flex-col")}>
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
        <Logo href={me.role === "chatter" ? "/app/messagerie" : "/app"} />
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
          {small ? <BloomMark className="size-9" /> : <Logo href={me.role === "chatter" ? "/app/messagerie" : "/app"} />}
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
