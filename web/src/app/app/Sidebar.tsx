"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Clock,
  Flower2,
  Heart,
  Images,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Send,
  Settings,
  Timer,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/fmt";
import { Avatar, Logo } from "@/components/ui";
import { ROLE_LABEL, type Me } from "@/lib/types";

type Who = "all" | "boss" | "admin";
type Item = { href: string; label: string; icon: LucideIcon; who?: Who; soon?: boolean };
type Section = { label: string | null; icon?: LucideIcon; who?: Who; items: Item[] };

// L'essentiel en haut, puis des catégories en accordéon : une seule ouverte à la fois (comme Raven CRM).
const SECTIONS: Section[] = [
  {
    label: null,
    items: [
      { href: "/app", label: "Vue d’ensemble", icon: LayoutDashboard, who: "boss" },
      { href: "/app/messagerie", label: "Messagerie", icon: Inbox },
    ],
  },
  {
    label: "Chatting",
    icon: Heart,
    items: [
      { href: "/app/fans", label: "Fans", icon: Heart },
      { href: "/app/vault", label: "Vault", icon: Images },
      { href: "/app/envoi", label: "Envoi groupé", icon: Send, soon: true },
      { href: "/app/programmes", label: "Messages programmés", icon: Clock, soon: true },
    ],
  },
  {
    label: "Équipe",
    icon: UsersRound,
    items: [
      { href: "/app/chatteurs", label: "Chatteurs", icon: UsersRound, who: "boss", soon: true },
      { href: "/app/planning", label: "Planning", icon: CalendarDays, soon: true },
      { href: "/app/pointage", label: "Pointage", icon: Timer, soon: true },
    ],
  },
  {
    label: "Performances",
    icon: BarChart3,
    who: "boss",
    items: [
      { href: "/app/stats", label: "Statistiques", icon: BarChart3, who: "boss", soon: true },
      { href: "/app/paies", label: "Paies", icon: Wallet, who: "boss", soon: true },
    ],
  },
  {
    label: "Administration",
    icon: Settings,
    who: "admin",
    items: [
      { href: "/app/creatrices", label: "Créatrices", icon: Flower2, who: "admin" },
      { href: "/app/reglages", label: "Branchements", icon: Plug, who: "admin" },
    ],
  },
];
const OPEN_KEY = "bloom:nav-open";
const STORE = "bloom:nav-compact";
const isOn = (path: string, href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/"));
const allowed = (role: string, who: Who = "all") => who === "all" || (who === "boss" ? role === "admin" || role === "lead" : role === "admin");

export function Sidebar({ me }: { me: Me }) {
  const path = usePathname();
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const inInbox = path.startsWith("/app/messagerie");

  useEffect(() => {
    try {
      // Messagerie : menu replié en arrivant (place pour les colonnes). Ailleurs : le choix de la personne.
      setCompact(inInbox ? true : localStorage.getItem(STORE) === "1");
    } catch {
      setCompact(inInbox);
    }
  }, [inInbox]);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const toggle = () =>
    setCompact((c) => {
      try {
        if (!inInbox) localStorage.setItem(STORE, c ? "0" : "1");
      } catch {}
      return !c;
    });

  const sections = SECTIONS.filter((s) => allowed(me.role, s.who))
    .map((s) => ({ ...s, items: s.items.filter((i) => allowed(me.role, i.who)) }))
    .filter((s) => s.items.length);

  const current = sections.find((s) => s.label && s.items.some((i) => isOn(path, i.href)))?.label ?? null;
  const [openSec, setOpenSec] = useState<string | null>(null);
  useEffect(() => {
    if (current) return setOpenSec(current);
    try {
      setOpenSec((o) => o ?? localStorage.getItem(OPEN_KEY));
    } catch {}
  }, [current]);
  const fold = (label: string) =>
    setOpenSec((o) => {
      const n = o === label ? null : label;
      try {
        if (n) localStorage.setItem(OPEN_KEY, n);
        else localStorage.removeItem(OPEN_KEY);
      } catch {}
      return n;
    });

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/connexion";
  };

  const links = (small: boolean) => (
    <nav className="flex flex-col gap-1">
      {sections.map((s) => {
        const hidden = !small && !!s.label && openSec !== s.label;
        return (
          <div key={s.label ?? "top"} className={cn(s.label && "mt-3")}>
            {s.label ? (
              small ? (
                <div className="mx-auto my-1.5 h-px w-6 bg-line" />
              ) : (
                <button onClick={() => fold(s.label!)} className="group/h flex w-full items-center gap-2.5 rounded-full px-2 py-1.5 text-left font-display text-[15px] font-semibold">
                  {s.icon ? (
                    <span className="grid size-6 place-items-center rounded-full bg-sage-soft text-sage">
                      <s.icon className="size-3.5" />
                    </span>
                  ) : null}
                  <span className="flex-1">{s.label}</span>
                  <span className="grid size-5 place-items-center rounded-md bg-card-2 text-muted group-hover/h:text-fg">{hidden ? <Plus className="size-3" /> : <Minus className="size-3" />}</span>
                </button>
              )
            ) : null}
            {hidden ? null : (
              <div className={cn("flex flex-col gap-0.5", s.label && !small && "ml-[19px] border-l border-line/70 pl-2")}>
                {s.items.map((i) => {
                  const on = isOn(path, i.href);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      title={small ? i.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-full py-2 text-sm font-medium transition-colors",
                        small ? "justify-center px-0" : "px-3",
                        on ? "bg-petal font-semibold text-primary-soft" : "text-muted hover:bg-card-2 hover:text-fg",
                        i.soon && !on && "opacity-60",
                      )}
                    >
                                            <i.icon className={cn("size-[18px] shrink-0", on ? "text-primary" : "group-hover:text-primary")} />
                      {small ? null : <span className="truncate">{i.label}</span>}
                      {i.soon && !small ? <span className="ml-auto rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-sage">bientôt</span> : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const footer = (small: boolean) => (
    <div className={cn("flex items-center gap-3 rounded-2xl border bg-bg", small ? "flex-col p-1.5" : "p-2.5")}>
      <Avatar src={me.avatar} name={me.name} size="size-8" rounded="rounded-lg" />
      {small ? null : (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{me.name}</p>
          <p className="truncate text-xs text-muted">{ROLE_LABEL[me.role] ?? "Chatteur"}</p>
        </div>
      )}
      <button onClick={logout} className="flex items-center gap-1.5 rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-fg" title="Se déconnecter">
        <LogOut className="size-4" />
        <span className="text-xs font-semibold md:hidden">Déconnexion</span>
      </button>
    </div>
  );

  return (
    <>
      {/* téléphone : barre du haut + menu plein écran */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b bg-panel-strong px-4 py-2.5 md:hidden" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <Logo />
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg border bg-card px-3 py-2" aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}>
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-bg/97 md:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top) + 64px)" }}>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{links(false)}</div>
          <div className="border-t px-4 pt-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            {footer(false)}
          </div>
        </div>
      ) : null}

      {/* bureau */}
      <aside
        className={cn(
          "no-scrollbar hidden h-dvh shrink-0 flex-col gap-4 overflow-y-auto border-r bg-panel-strong py-5 md:flex",
          compact ? "w-[68px] px-2.5" : "w-60 px-4",
        )}
      >
        <div className={cn("flex items-center", compact ? "flex-col gap-3" : "justify-between")}>
          <Logo compact={compact} href={me.role === "chatter" ? "/app/messagerie" : "/app"} />
          <button onClick={toggle} className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-fg" title={compact ? "Agrandir le menu" : "Réduire le menu"}>
            {compact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        {links(compact)}
        <div className="mt-auto border-t border-line/70 pt-3">{footer(compact)}</div>
      </aside>
    </>
  );
}
