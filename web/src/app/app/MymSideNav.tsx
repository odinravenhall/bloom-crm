"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, BarChart3, Bot, ChevronDown, ChevronRight, ExternalLink, Images, Link2, Menu, MessageCircle, Send, Settings, ShieldCheck, Users, UsersRound, Zap, type LucideIcon,
} from "lucide-react";
import { BloomMark } from "@/components/ui";
import type { Me, Role } from "@/lib/types";
import { canOpen } from "@/lib/perms";
import { PlatformSwitch } from "./PlatformSwitch";

// Menu MYM : copie de la barre de MyPulse (mêmes rubriques, même ordre). Les pages pas encore faites : « Bientôt ».
type Child = { label: string; href: string; roles?: Role[] };
type Entry = { key: string; label: string; icon: LucideIcon; href?: string; roles?: Role[]; children?: Child[]; badge?: string };
const CHAT: Role[] = ["admin", "manager", "lead", "chatter"];
const BOSS: Role[] = ["admin", "manager", "lead"];
const MANAGE: Role[] = ["admin", "manager"];
const soon = (label: string) => `/app/bientot?f=${encodeURIComponent(label)}`;

const NAV: Entry[] = [
  { key: "accounts", label: "Compte Creator", icon: Link2, href: "/app/mym", roles: CHAT },
  {
    key: "fans", label: "Fans", icon: Users, roles: CHAT,
    children: [
      { label: "Abonnés", href: "/app/mym/abonnes" }, { label: "Anciens", href: "/app/mym/anciens" }, { label: "Intéressés", href: "/app/mym/interesses" },
      { label: "Groupes", href: "/app/mym/groupes" },
    ],
  },
  {
    key: "medias", label: "Médias", icon: Images, roles: CHAT,
    children: [{ label: "Planification", href: "/app/mym/planification" }, { label: "Feed", href: "/app/mym/feed" }, { label: "Liste d'amis", href: "/app/mym/amis" }, { label: "Studio", href: "/app/mym/studio" }, { label: "Importer des médias", href: "/app/mym/importer" }],
  },
  {
    key: "auto", label: "Automatisation", icon: Zap, roles: BOSS,
    children: [{ label: "Tour de contrôle", href: soon("Tour de contrôle") }, { label: "Auto-Post", href: soon("Auto-Post") }, { label: "Auto-Story", href: soon("Auto-Story") }, { label: "Nudge IA", href: soon("Nudge IA") }, { label: "Auto-DM", href: soon("Auto-DM") }],
  },
  { key: "ai", label: "IA Substy", icon: Bot, href: "/app/ia", roles: MANAGE },
  {
    key: "messages", label: "Messages", icon: MessageCircle, roles: CHAT,
    children: [{ label: "Chatting", href: "/app/mym/chatting" }, { label: "Switchboard", href: "/app/mym/switchboard" }, { label: "Mes ventes", href: "/app/mym/ventes" }, { label: "Script", href: "/app/mym/scripts" }, { label: "Bon de réduction", href: "/app/mym/bons" }],
  },
  {
    key: "mass", label: "Envois groupés", icon: Send, roles: CHAT,
    children: [{ label: "Push (MYM officiel)", href: "/app/mym/push" }, { label: "MoDs (MYM officiel)", href: "/app/mym/mods" }, { label: "Mass DM (Bloom)", href: "/app/mym/massdm" }],
  },
  {
    key: "stats", label: "Stats", icon: BarChart3, roles: BOSS,
    children: [{ label: "Statistiques Globales", href: "/app/mym/stats" }, { label: "Analytique", href: "/app/mym/analytique" }, { label: "Transactions", href: "/app/mym/transactions" }, { label: "Liens de suivi", href: "/app/mym/liens" }],
  },
  {
    key: "team", label: "Pilotage d’équipe", icon: UsersRound, roles: BOSS,
    children: [{ label: "Message Dashboard", href: "/app/mym/message-dashboard" }, { label: "Ventes équipe", href: "/app/mym/ventes-equipe" }, { label: "Contrôle des shifts", href: "/app/mym/shifts" }, { label: "Activité", href: "/app/mym/activite" }, { label: "En direct", href: "/app/mym/en-direct" }, { label: "Modération", href: "/app/mym/moderation" }, { label: "Contrôle des accès", href: "/app/mym/acces" }],
  },
  {
    key: "staff", label: "Employés", icon: ShieldCheck, roles: BOSS,
    children: [{ label: "Gérer les employés", href: "/app/employees" }, { label: "Rôles et accès", href: "/app/roles", roles: MANAGE }],
  },
  { key: "direct", label: "Accès MYM (Direct)", icon: ExternalLink, href: soon("Accès MYM (Direct)"), roles: BOSS },
  { key: "mymnotifs", label: "Notifications MYM", icon: Bell, href: "/app/mym/notifications", roles: CHAT },
  { key: "notifs", label: "Notifications Bloom", icon: Bell, href: "/app/notifications" },
];

const same = (path: string, href: string) => {
  const h = href.split("?")[0];
  return h !== "/app/bientot" && (path === h || path.startsWith(h + "/"));
};

export function MymSideNav({ me, narrow, onToggle }: { me: Me; narrow: boolean; onToggle: () => void }) {
  const path = usePathname() || "";
  const allowed = (r?: Role[], href?: string) => (!r || r.includes(me.role)) && (!href || canOpen(me, href));
  const entries = NAV.filter((e) => allowed(e.roles, e.href))
    .map((e) => ({ ...e, children: e.children?.filter((c) => allowed(c.roles, c.href)) }))
    .filter((e) => !e.children || e.children.length);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOpen(entries.find((e) => e.children?.some((c) => same(path, c.href)))?.key ?? null), [path]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mp-font flex h-full flex-col text-[13.5px]" style={{ color: "var(--mp-text)" }}>
      <div className={narrow ? "flex flex-col items-center gap-3" : "flex items-center justify-between px-2"}>
        <Link href="/app" className="flex items-center gap-2 font-semibold" style={{ color: "var(--mp-head)" }}>
          <BloomMark className="size-7" />
          {narrow ? null : <span className="text-[16px]">Bloom</span>}
        </Link>
        <button onClick={onToggle} className="grid size-8 place-items-center rounded-md" style={{ color: "var(--mp-muted)" }}><Menu className="size-4" /></button>
      </div>
      <div className="mt-4">
        <PlatformSwitch compact={narrow} />
      </div>
      {narrow ? null : <p className="mt-5 px-3 text-[11px] font-semibold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Menu</p>}
      <nav className="no-scrollbar mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {entries.map((e) => {
          const on = e.href ? same(path, e.href) : !!e.children?.some((c) => same(path, c.href));
          const cls = `flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:text-white ${narrow ? "justify-center px-0" : ""}`;
          const style = { color: on ? "var(--mp-head)" : undefined, background: on && !e.children ? "rgba(199,255,74,.08)" : undefined };
          if (!e.children)
            return (
              <Link key={e.key} href={e.href!} title={narrow ? e.label : undefined} className={cls} style={style}>
                <e.icon className="size-[17px] shrink-0" style={{ color: on ? "var(--mp-accent)" : undefined }} />
                {narrow ? null : <span className="flex-1 truncate">{e.label}</span>}
                {!narrow && e.badge ? <span className="rounded px-1.5 text-[10px]" style={{ background: "rgba(139,92,246,.18)", color: "#a78bfa" }}>{e.badge}</span> : null}
              </Link>
            );
          return (
            <div key={e.key}>
              <button onClick={() => setOpen(open === e.key ? null : e.key)} title={narrow ? e.label : undefined} className={cls} style={style}>
                <e.icon className="size-[17px] shrink-0" style={{ color: on ? "var(--mp-accent)" : undefined }} />
                {narrow ? null : (
                  <>
                    <span className="flex-1 truncate">{e.label}</span>
                    {open === e.key ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </>
                )}
              </button>
              {open === e.key && !narrow ? (
                <div className="mb-1 flex flex-col">
                  {e.children!.map((c) => {
                    const cur = same(path, c.href);
                    return (
                      <Link key={c.label} href={c.href} className="flex items-center gap-2 rounded-md py-1.5 pr-3 pl-11 hover:text-white" style={{ color: cur ? "var(--mp-accent)" : undefined }}>
                        <span className="size-1 rounded-full" style={{ background: cur ? "var(--mp-accent)" : "var(--mp-muted)" }} />
                        {c.label}
                        {/^\/app\/bientot/.test(c.href) ? <span className="ml-auto text-[10px]" style={{ color: "var(--mp-muted)" }}>bientôt</span> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--mp-line)" }}>
        <Link href="/app/settings" className={`flex items-center gap-3 rounded-md px-3 py-2 ${narrow ? "justify-center px-0" : ""}`} style={{ color: same(path, "/app/settings") ? "var(--mp-head)" : undefined }}>
          <Settings className="size-[17px]" /> {narrow ? null : "Paramètres"}
        </Link>
      </div>
    </div>
  );
}
