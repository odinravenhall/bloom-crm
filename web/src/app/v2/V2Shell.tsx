"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Bell, CalendarClock, ChartNoAxesCombined, Globe, Home, Images, KeyRound, Link2, ListChecks, Menu, MessageCircle,
  MessagesSquare, PanelLeftClose, PanelLeftOpen, Radio, ScrollText, Send, Settings, ShieldAlert, Sparkles, Ticket, Timer, TrendingUp, UserRound, Users, Megaphone, X,
  type LucideIcon,
} from "lucide-react";
import { getPf, setPf, type Pf } from "@/lib/platform";
import type { Me } from "@/lib/types";
import { GROUPS, SCREENS, type Screen, type ScreenKey } from "./screens";

const ICON: Record<ScreenKey, LucideIcon> = {
  messagerie: MessageCircle, scripts: ScrollText, envois: Send, fans: Users, medias: Images,
  chiffres: TrendingUp, analytique: ChartNoAxesCombined, liens: Link2,
  "equipe-messages": MessagesSquare, "equipe-ventes": BarChart3, shifts: Timer, activite: Activity, "en-direct": Radio, moderation: ShieldAlert, acces: KeyRound,
  push: Megaphone, planification: CalendarClock, feed: ListChecks, amis: UserRound, bons: Ticket, notifications: Bell, "site-mym": Globe,
};
const isBoss = (r: string) => r === "admin" || r === "manager" || r === "lead";

/** Le cadre de la v2 : menu unique à gauche (mêmes rubriques sur OnlyFans et MYM), plateforme au-dessus. */
export function V2Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname() || "/v2";
  const [pf, setPfState] = useState<Pf>("of");
  const [mini, setMini] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setPfState(getPf());
    try {
      setMini(localStorage.getItem("bloom.v2.mini") === "1");
    } catch {}
  }, []);
  useEffect(() => setOpen(false), [path]);
  const pick = (p: Pf) => {
    if (p === pf) return;
    setPfState(p);
    setPf(p);
    // Les écrans relisent la plateforme au chargement : on recharge une fois l'animation partie.
    setTimeout(() => location.reload(), 260);
  };
  const toggleMini = () => {
    const v = !mini;
    setMini(v);
    try {
      localStorage.setItem("bloom.v2.mini", v ? "1" : "0");
    } catch {}
  };
  const boss = isBoss(me.role);
  const visible = SCREENS.filter((s) => (!s.boss || boss) && (!s.pf || s.pf === pf));
  const cur = path === "/v2" ? "home" : path.split("/")[2] || "home";
  const item = (key: string, href: string, label: string, Icon: LucideIcon) => (
    <Link key={key} href={href} data-on={cur === key} title={mini ? label : undefined} className="v2-nav-item">
      <Icon className="size-[17px] shrink-0" />
      {mini ? null : <span className="truncate">{label}</span>}
    </Link>
  );
  const group = (g: Screen["group"]) => {
    const list = visible.filter((s) => s.group === g);
    if (!list.length) return null;
    return (
      <div key={g} className="mt-5">
        {mini ? <div className="mx-2 mb-2 h-px" style={{ background: "var(--color-line)" }} /> : <p className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#5f7199" }}>{g === "platform" ? (pf === "mym" ? "Propre à MYM" : "Propre à OnlyFans") : GROUPS[g]}</p>}
        <div className="space-y-0.5">{list.map((s) => item(s.key, `/v2/${s.key}`, s.label, ICON[s.key]))}</div>
      </div>
    );
  };
  const side = (
    <aside className={`relative z-10 flex h-full shrink-0 flex-col border-r transition-[width] duration-300 ${mini ? "w-[68px]" : "w-[252px]"}`} style={{ borderColor: "var(--color-line)", background: "var(--color-panel)", backdropFilter: "blur(14px)" }}>
      <div className="flex h-[62px] items-center gap-2.5 px-4">
        <Link href="/v2" className="flex min-w-0 items-center gap-2.5" title="Accueil">
          {/* Emplacement du futur logo : pour l'instant le mot seul, avec son point. */}
          <span className="v2-logo-dot shrink-0" />
          {mini ? null : <span className="text-[21px] leading-none font-semibold tracking-[-0.03em]">bloom</span>}
        </Link>
        <span className="flex-1" />
        <button onClick={toggleMini} title={mini ? "Déplier le menu" : "Réduire le menu"} className="hidden size-8 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg md:grid">{mini ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button>
        <button onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-lg text-muted md:hidden"><X className="size-4" /></button>
      </div>
      <div className="px-3">
        {mini ? (
          <button onClick={() => pick(pf === "of" ? "mym" : "of")} title={`Plateforme : ${pf === "of" ? "OnlyFans" : "MYM"} (cliquer pour changer)`} className="grid h-9 w-full place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--v2-blue), var(--v2-deep))" }}>{pf === "of" ? "OF" : "MYM"}</button>
        ) : (
          <div className="v2-switch" data-pf={pf}>
            <i />
            <button data-on={pf === "of"} onClick={() => pick("of")}>OnlyFans</button>
            <button data-on={pf === "mym"} onClick={() => pick("mym")}>MYM</button>
          </div>
        )}
      </div>
      <nav className="v2-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-4">
        <div className="space-y-0.5">{item("home", "/v2", "Accueil", Home)}</div>
        {group("work")}
        {group("numbers")}
        {group("team")}
        {group("platform")}
        {pf === "of" && boss ? <div className="mt-5">{mini ? null : <p className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#5f7199" }}>Propre à OnlyFans</p>}<a href="/app/of-manager" className="v2-nav-item" title="OF Manager (version actuelle)"><Sparkles className="size-[17px] shrink-0" />{mini ? null : <span className="truncate">OF Manager</span>}</a></div> : null}
      </nav>
      <div className="border-t p-3" style={{ borderColor: "var(--color-line)" }}>
        <a href="/app/parametres" className="v2-nav-item" title="Paramètres"><Settings className="size-[17px] shrink-0" />{mini ? null : <span>Paramètres</span>}</a>
        {mini ? null : (
          <div className="mt-2 flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: "var(--color-card-2)" }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--v2-sky), var(--v2-deep))" }}>{(me.name || "?")[0].toUpperCase()}</span>
            <span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{me.name}</b><span className="block truncate text-[11.5px] text-muted">{me.roleName || me.role}</span></span>
            <a href={pf === "mym" ? "/app/mym" : "/app/of"} title="Revenir à la version actuelle de Bloom" className="rounded-md px-1.5 py-1 text-[10.5px] font-semibold text-muted hover:text-fg">v1</a>
          </div>
        )}
      </div>
    </aside>
  );
  return (
    <>
      <div className="hidden md:flex">{side}</div>
      {open ? <div className="fixed inset-0 z-40 flex md:hidden"><div className="h-full">{side}</div><button aria-label="Fermer le menu" className="flex-1 bg-black/60" onClick={() => setOpen(false)} /></div> : null}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3 md:hidden" style={{ borderColor: "var(--color-line)" }}>
          <button onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-lg"><Menu className="size-5" /></button>
          <span className="v2-logo-dot" /><span className="text-[18px] font-semibold tracking-[-0.03em]">bloom</span>
          <span className="flex-1" /><span className="rounded-md px-2 py-1 text-[11px] font-bold text-white" style={{ background: "var(--v2-blue)" }}>{pf === "of" ? "OnlyFans" : "MYM"}</span>
        </div>
        <main className="v2-scroll min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </>
  );
}
