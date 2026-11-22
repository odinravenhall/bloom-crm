"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, Moon, Sun, Sparkle, X } from "lucide-react";
import { cn } from "@/lib/fmt";
import { Avatar, Logo } from "@/components/ui";
import { ROLE_LABEL, type Me } from "@/lib/types";
import { THEMES, useTheme, type Theme } from "@/lib/theme";

type Who = "all" | "boss" | "admin";
type Link_ = { href: string; label: string; who?: Who; soon?: boolean };
type Entry = Link_ | { label: string; who?: Who; items: Link_[] };

// Navigation en haut : l'essentiel en onglets, le reste dans des menus déroulants.
const NAV: Entry[] = [
  { href: "/app", label: "Accueil", who: "boss" },
  { href: "/app/messagerie", label: "Messagerie" },
  { href: "/app/fans", label: "Fans" },
  { href: "/app/vault", label: "Vault" },
  {
    label: "Outils",
    items: [
      { href: "/app/envoi", label: "Envoi groupé", soon: true },
      { href: "/app/programmes", label: "Messages programmés", soon: true },
    ],
  },
  {
    label: "Équipe",
    items: [
      { href: "/app/chatteurs", label: "Chatteurs", who: "boss", soon: true },
      { href: "/app/stats", label: "Statistiques", who: "boss", soon: true },
      { href: "/app/paies", label: "Paies", who: "boss", soon: true },
    ],
  },
  {
    label: "Admin",
    who: "admin",
    items: [
      { href: "/app/creatrices", label: "Créatrices", who: "admin" },
      { href: "/app/reglages", label: "Branchements", who: "admin" },
    ],
  },
];
const allowed = (role: string, who: Who = "all") => who === "all" || (who === "boss" ? role === "admin" || role === "lead" : role === "admin");
const isOn = (path: string, href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/"));
const THEME_ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, onyx: Sparkle };

export function TopNav({ me }: { me: Me }) {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const { theme, setTheme } = useTheme();
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [path]);
  useEffect(() => {
    const k = (e: MouseEvent) => bar.current && !bar.current.contains(e.target as Node) && setOpen(null);
    window.addEventListener("mousedown", k);
    return () => window.removeEventListener("mousedown", k);
  }, []);

  const entries = NAV.filter((e) => allowed(me.role, e.who))
    .map((e) => ("items" in e ? { ...e, items: e.items.filter((i) => allowed(me.role, i.who)) } : e))
    .filter((e) => !("items" in e) || e.items.length);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/connexion";
  };

  const tab = (on: boolean) =>
    cn("relative flex h-full items-center gap-1 px-3 text-sm font-semibold transition-colors", on ? "text-fg" : "text-muted hover:text-fg");
  const underline = <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-primary" />;

  return (
    <header ref={bar} className="sticky top-0 z-40 border-b bg-panel-strong">
      <div className="flex h-14 items-center gap-4 px-4 md:px-6">
        <Logo href={me.role === "chatter" ? "/app/messagerie" : "/app"} />
        {/* onglets (ordinateur) */}
        <nav className="hidden h-full items-stretch md:flex">
          {entries.map((e) =>
            "items" in e ? (
              <div key={e.label} className="relative flex">
                <button onClick={() => setOpen(open === e.label ? null : e.label)} className={tab(e.items.some((i) => isOn(path, i.href)))}>
                  {e.label}
                  <ChevronDown className={cn("size-3.5 transition-transform", open === e.label && "rotate-180")} />
                  {e.items.some((i) => isOn(path, i.href)) ? underline : null}
                </button>
                {open === e.label ? (
                  <div className="absolute top-full left-0 z-50 mt-1 w-60 rounded-2xl border bg-card p-1.5 shadow-xl">
                    {e.items.map((i) => (
                      <Link key={i.href} href={i.href} className={cn("flex items-center justify-between rounded-xl px-3 py-2 text-sm", isOn(path, i.href) ? "bg-petal font-semibold text-primary-soft" : "hover:bg-card-2")}>
                        {i.label}
                        {i.soon ? <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-bold text-sage">bientôt</span> : null}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <Link key={e.href} href={e.href} className={tab(isOn(path, e.href))}>
                {e.label}
                {isOn(path, e.href) ? underline : null}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {/* thème */}
          <div className="hidden items-center rounded-full border bg-card p-0.5 sm:flex" title="Thème">
            {THEMES.map(([t, label]) => {
              const Icon = THEME_ICON[t];
              return (
                <button key={t} onClick={() => setTheme(t)} title={label} className={cn("grid size-7 place-items-center rounded-full", theme === t ? "bg-petal text-primary-soft" : "text-muted hover:text-fg")}>
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>
          {/* compte */}
          <div className="relative">
            <button onClick={() => setOpen(open === "me" ? null : "me")} className="flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1">
              <Avatar src={me.avatar} name={me.name} size="size-7" />
              <span className="hidden max-w-32 truncate text-sm font-semibold lg:block">{me.name}</span>
              <ChevronDown className="size-3.5 text-muted" />
            </button>
            {open === "me" ? (
              <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-2xl border bg-card p-3 shadow-xl">
                <p className="truncate font-semibold">{me.name}</p>
                <p className="text-xs text-muted">{ROLE_LABEL[me.role] ?? "Chatteur"}</p>
                <p className="mt-3 mb-1.5 text-xs font-semibold text-muted">Thème</p>
                <div className="grid grid-cols-3 gap-1">
                  {THEMES.map(([t, label]) => (
                    <button key={t} onClick={() => setTheme(t)} className={cn("rounded-xl border px-2 py-1.5 text-xs font-semibold", theme === t ? "border-primary bg-petal text-primary-soft" : "hover:bg-card-2")}>
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-muted hover:bg-card-2 hover:text-fg">
                  <LogOut className="size-4" /> Se déconnecter
                </button>
              </div>
            ) : null}
          </div>
          <button onClick={() => setMobile((m) => !m)} className="grid size-9 place-items-center rounded-full border bg-card md:hidden" aria-label="Menu">
            {mobile ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {/* téléphone : toutes les pages en liste */}
      {mobile ? (
        <nav className="flex max-h-[70dvh] flex-col gap-0.5 overflow-y-auto border-t px-4 py-3 md:hidden">
          {entries.flatMap((e) => ("items" in e ? e.items : [e])).map((i) => (
            <Link key={i.href} href={i.href} className={cn("flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold", isOn(path, i.href) ? "bg-petal text-primary-soft" : "hover:bg-card-2")}>
              {i.label}
              {i.soon ? <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-bold text-sage">bientôt</span> : null}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
