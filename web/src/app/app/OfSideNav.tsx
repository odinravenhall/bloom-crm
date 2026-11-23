"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Ban, Bot, ChartArea, ChartColumn, ChevronDown, Clock, Contact, ContactRound,
  Feather, Images, LayoutGrid, ListFilter, Menu, MessageCirclePlus, MessagesSquare, Route, ScrollText, SlidersHorizontal, SquareArrowOutUpRight,
  SquareUser, UserPlus, UserRound, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { useT } from "@/lib/i18n";
import { OF_PAGES } from "@/lib/ofmanager";
import { BloomMark } from "@/components/ui";
import type { Me, Role } from "@/lib/types";
import { PlatformSwitch } from "./PlatformSwitch";

type Child = { label: string; icon: LucideIcon; href: string; roles?: Role[] };
type Entry = { key: string; label: string; icon: LucideIcon; href?: string; roles?: Role[]; children?: Child[]; badge?: boolean; external?: boolean };

const CHAT: Role[] = ["admin", "manager", "lead", "chatter"];
const BOSS: Role[] = ["admin", "manager", "lead"];
const MANAGE: Role[] = ["admin", "manager"];
const soon = (label: string) => `/app/bientot?f=${encodeURIComponent(label)}`;

// Menu OnlyFans : copie de la barre d'Infloww (mêmes entrées, même ordre). Les pages pas encore faites : « Bientôt ».
const NAV: (Entry | "divider")[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid, href: "/app/of", roles: BOSS },
  { key: "ofm", label: "OF Manager", icon: Feather, roles: MANAGE, children: OF_PAGES.map((p) => ({ label: p.label, icon: p.icon, href: `/app/of-manager/${p.key}` })) },
  {
    key: "analytics",
    label: "Analytics",
    icon: ChartColumn,
    roles: BOSS,
    children: [
      { label: "Creator reports", icon: SquareUser, href: "/app/analytics/creators" },
      { label: "Employee reports", icon: ContactRound, href: "/app/analytics/employees" },
      { label: "Fan reports", icon: UserRound, href: "/app/analytics/fans" },
      { label: "Message dashboard", icon: Activity, href: "/app/analytics/messages" },
    ],
  },
  { key: "mp", label: "Messages Pro", icon: MessageCirclePlus, href: "/pro", roles: CHAT, badge: true, external: true },
  {
    key: "growth",
    label: "Growth",
    icon: ChartArea,
    roles: CHAT,
    children: [
      { label: "Smart Messages", icon: MessagesSquare, href: "/app/smart" },
      { label: "Smart lists", icon: ListFilter, href: "/app/listes" },
      { label: "Auto-follow", icon: UserPlus, href: "/app/autofollow" },
      { label: "Vault Pro", icon: Images, href: "/app/vault" },
      { label: "Scripts", icon: ScrollText, href: "/app/scripts" },
      { label: "Tracking links", icon: Route, href: "/app/tracking" },
      { label: "Sensitive words", icon: Ban, href: soon("Sensitive words") },
      { label: "AI (Substy)", icon: Bot, href: "/app/ia", roles: MANAGE },
    ],
  },
  "divider",
  { key: "creators", label: "Creators", icon: SquareUser, roles: MANAGE, children: [{ label: "Manage creators", icon: SquareUser, href: "/app/creatrices" }] },
  {
    key: "employees",
    label: "Employees",
    icon: Contact,
    roles: BOSS,
    children: [
      { label: "Manage employees", icon: Contact, href: "/app/equipe" },
      { label: "Shift schedule", icon: Clock, href: soon("Shift schedule") },
    ],
  },
];

const same = (path: string, href: string) => {
  const h = href.split("?")[0];
  return h === "/app/bientot" ? false : path === h || path.startsWith(h + "/");
};

/**
 * Barre de gauche quand on est sur OnlyFans : copie de celle d'Infloww. En haut, Bloom et le prénom (vers l'Accueil),
 * puis le choix de la plateforme. Une catégorie se déplie au clic et se replie dès qu'on a choisi une page.
 * Réduite (icônes) : la catégorie s'ouvre à côté.
 */
export function OfSideNav({ me, narrow, onToggle }: { me: Me; narrow: boolean; onToggle: () => void }) {
  const path = usePathname() || "";
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => setOpen(null), [path]);

  // Pastille de Messages Pro : fans qui attendent une réponse (comme Infloww).
  useEffect(() => {
    const load = () =>
      api<{ allReply?: number }>("GET", "/api/rv/inbox?tab=reply")
        .then((r) => setUnread(r.allReply ?? 0))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(t);
  }, []);

  const allowed = (r?: Role[]) => !r || r.includes(me.role);
  const entries = NAV.filter((e) => e === "divider" || allowed(e.roles)).map((e) => (e === "divider" ? e : { ...e, children: e.children?.filter((c) => allowed(c.roles)) }));
  const first = me.name.split(/\s+/)[0];

  return (
    <div className="flex h-full flex-col" style={{ color: "var(--of-text)" }}>
      {/* Bloom + prénom (vers l'Accueil : toute l'agence) */}
      <div className={cn("flex items-center", narrow ? "flex-col gap-3" : "gap-2.5 px-1")}>
        <button onClick={onToggle} title={t(narrow ? "Expand menu" : "Collapse menu")} className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: "var(--of-side-on)" }}>
          <Menu className="size-[18px]" />
        </button>
        <Link href="/app" title={t("Home · whole agency")} className={cn("flex min-w-0 items-center gap-2", narrow && "justify-center")}>
          <BloomMark className="size-7" />
          {narrow ? null : (
            <span className="min-w-0 leading-tight">
              <span className="block text-[15px] font-semibold">Bloom</span>
              <span className="block truncate text-[11px]" style={{ color: "var(--of-muted)" }}>{first}</span>
            </span>
          )}
        </Link>
      </div>

      <div className="mt-5">
        <PlatformSwitch compact={narrow} />
      </div>

      <nav className="no-scrollbar mt-5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {entries.map((e, i) =>
          e === "divider" ? (
            <span key={`d${i}`} className="mx-1 my-3 h-px" style={{ background: "var(--of-side-line)" }} />
          ) : (
            <Row key={e.key} e={e} path={path} narrow={narrow} open={open === e.key} setOpen={(v) => setOpen(v ? e.key : null)} unread={unread} t={t} />
          ),
        )}
      </nav>

      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--of-side-line)" }}>
        <Link
          href="/app/settings"
          title={narrow ? t("Settings") : undefined}
          className={cn("of-item flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px]", narrow && "justify-center px-0", same(path, "/app/settings") && "on")}
        >
          <SlidersHorizontal className="size-[18px] shrink-0" />
          {narrow ? null : t("Settings")}
        </Link>
        {narrow ? null : <p className="px-2.5 pt-3 text-[12px]" style={{ color: "var(--of-muted)" }}>Bloom CRM</p>}
      </div>
    </div>
  );
}

function Row({ e, path, narrow, open, setOpen, unread, t }: { e: Entry; path: string; narrow: boolean; open: boolean; setOpen: (v: boolean) => void; unread: number; t: (s: string) => string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const on = e.href ? same(path, e.href) : !!e.children?.some((c) => same(path, c.href));

  // Réduite : la liste s'ouvre à côté (par-dessus la page).
  useLayoutEffect(() => {
    if (!open || !narrow) return;
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const h = panel.current?.offsetHeight ?? 300;
    setPos({ top: Math.max(8, Math.min(r.top - 6, window.innerHeight - h - 8)), left: r.right + 10 });
  }, [open, narrow]);
  useEffect(() => {
    if (!open || !narrow) return;
    const out = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (!btn.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open, narrow, setOpen]);

  const cls = cn("of-item flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[15px] transition-colors", narrow && "justify-center px-0", on && "on");
  const icon = <e.icon className="size-[18px] shrink-0" />;

  if (!e.children) {
    return (
      <div className="relative flex items-center">
        <Link href={e.href!} title={narrow ? t(e.label) : undefined} className={cls}>
          <span className="relative">
            {icon}
            {narrow && e.badge && unread ? <span className="absolute -top-1.5 -right-2 size-2 rounded-full bg-pink-500" /> : null}
          </span>
          {narrow ? null : (
            <>
              <span className="truncate">{t(e.label)}</span>
              {e.badge && unread ? <span className="rounded-full bg-pink-500 px-1.5 text-[10px] leading-4 font-bold text-white tabular-nums">{unread > 99 ? "99+" : unread}</span> : null}
              <span className="flex-1" />
            </>
          )}
        </Link>
        {!narrow && e.external ? (
          <a href={e.href} target="_blank" rel="noopener" title={t("Open in a new tab")} className="of-item absolute right-1.5 grid size-7 place-items-center rounded-md" style={{ background: "var(--of-side-on)" }}>
            <SquareArrowOutUpRight className="size-3.5" />
          </a>
        ) : null}
      </div>
    );
  }

  const list = (
    <div className={cn("flex flex-col gap-0.5", !narrow && "pt-0.5 pb-1")}>
      {e.children.map((c) => {
        const cur = same(path, c.href);
        return (
          <Link
            key={c.label}
            href={c.href}
            onClick={() => setOpen(false)}
            className={cn("of-item flex items-center gap-3 rounded-lg py-1.5 text-[14px]", narrow ? "px-3" : "pr-2.5 pl-8", cur && "on")}
          >
            <c.icon className="size-4 shrink-0" />
            {t(c.label)}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div>
      <button ref={btn} onClick={() => setOpen(!open)} title={narrow ? t(e.label) : undefined} className={cls}>
        {icon}
        {narrow ? null : (
          <>
            <span className="flex-1 truncate">{t(e.label)}</span>
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>
      {open && !narrow ? list : null}
      {open && narrow
        ? createPortal(
            <div ref={panel} style={pos ? { top: pos.top, left: pos.left, background: "var(--of-pop)", borderColor: "var(--of-line)" } : { visibility: "hidden" }} className="fixed z-[100] w-60 overflow-hidden rounded-xl border p-1.5 shadow-2xl">
              <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--of-muted)" }}>{t(e.label)}</p>
              {list}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
