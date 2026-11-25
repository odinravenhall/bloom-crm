"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Bell, CalendarClock, ChartNoAxesCombined, Check, ChevronDown, ChevronsLeft, ChevronsRight, Globe, History, Images, KeyRound, LayoutDashboard, Link2, ListChecks,
  LogOut, Megaphone, Menu, MessageCircle, MessagesSquare, Radio, ScrollText, Send, Settings, ShieldAlert, Sparkle, Sparkles, Ticket, Timer, TrendingUp, UserRound, Users, X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { canOpen } from "@/lib/perms";
import { getPf, PF_LABEL, setPf, type Pf } from "@/lib/platform";
import { ROLE_LABEL, type Me } from "@/lib/types";
import { Avatar } from "@/rv/components/ui";
import { useV2Base, useV2Url } from "./nav";
import { SCREENS, screenOf, type GroupKey, type ScreenKey } from "./screens";

const ICON: Record<ScreenKey, LucideIcon> = {
  messagerie: MessageCircle, scripts: ScrollText, envois: Send, fans: Users, medias: Images,
  chiffres: TrendingUp, analytique: ChartNoAxesCombined, liens: Link2,
  "equipe-messages": MessagesSquare, "equipe-ventes": BarChart3, shifts: Timer, activite: Activity, "en-direct": Radio, moderation: ShieldAlert, acces: KeyRound,
  push: Megaphone, planification: CalendarClock, feed: ListChecks, amis: UserRound, bons: Ticket, notifications: Bell, "site-mym": Globe,
  "of-manager": Sparkles, "comptes-of": Link2,
};
// Les rubriques du menu : un petit titre en capitales, les écrans dessous, à plat. L'icône ne sert qu'au menu réduit.
type G = Exclude<GroupKey, "top">;
const GROUPS: { key: G; label: (pf: Pf) => string; Icon: LucideIcon }[] = [
  { key: "chat", label: () => "Chatting", Icon: MessagesSquare },
  { key: "stats", label: () => "Statistiques", Icon: BarChart3 },
  { key: "team", label: () => "Équipe", Icon: Users },
  { key: "platform", label: (pf) => PF_LABEL[pf], Icon: Sparkles },
];
// Les plateformes du menu déroulant. Reveal arrivera plus tard : la ligne est déjà là, grisée.
const PLATFORMS: { k: Pf | "reveal"; label: string; soon?: boolean }[] = [
  { k: "of", label: "OnlyFans" },
  { k: "mym", label: "MYM" },
  { k: "reveal", label: "Reveal", soon: true },
];
const isBoss = (r: string) => r === "admin" || r === "manager" || r === "lead";
const keep = (k: string, v: string) => {
  try {
    localStorage.setItem("bloom.v2." + k, v);
  } catch {}
};

/** Le cadre de la v2 (direction « Constellation ») : menu à gauche à plat, mêmes rubriques sur toutes les plateformes. */
export function V2Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  // `base` : « /v2 » sur l'adresse principale, rien sur bloomcrm.fr (tout le site y est la nouvelle version).
  const base = useV2Base();
  const link = useV2Url();
  // L'écran ouvert, d'après l'adresse : « /v2/chiffres » ici, « /chiffres » sur bloomcrm.fr.
  const path = usePathname() || "/";
  const cur = path.replace(/^\/v2(?=\/|$)/, "").split("/")[1] || "home";
  const chat = cur === "messagerie";
  const [pf, setPfState] = useState<Pf>("of");
  // Menu réduit en icônes : un réglage pour la messagerie (réduit d'office, elle a besoin de place) et un pour le reste.
  const [mini, setMini] = useState(false);
  const [miniChat, setMiniChat] = useState(true);
  // Rubriques repliées (toutes dépliées au départ).
  const [closed, setClosed] = useState<string[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [pfOpen, setPfOpen] = useState(false);
  const [reply, setReply] = useState(0);
  useEffect(() => {
    setPfState(getPf());
    try {
      setMini(localStorage.getItem("bloom.v2.mini") === "1");
      setMiniChat(localStorage.getItem("bloom.v2.miniChat") !== "0");
      const g = localStorage.getItem("bloom.v2.closed");
      if (g) setClosed(JSON.parse(g) as string[]);
    } catch {}
  }, []);
  useEffect(() => (setDrawer(false), setPfOpen(false)), [path]);
  // La rubrique de la page ouverte se déplie toute seule.
  const curGroup = SCREENS.find((s) => s.key === cur)?.group;
  useEffect(() => {
    if (curGroup && curGroup !== "top") setClosed((g) => (g.includes(curGroup) ? g.filter((x) => x !== curGroup) : g));
  }, [curGroup]);
  useEffect(() => {
    if (!pfOpen) return;
    const close = (e: MouseEvent) => !(e.target as Element).closest?.("[data-pf-box]") && setPfOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPfOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", close), document.removeEventListener("keydown", esc));
  }, [pfOpen]);
  // Pastille de la messagerie : les conversations « à traiter » (à répondre + non lus) de la plateforme choisie, sans les
  // modèles que la personne a cachées. « count=1 » : le serveur ne renvoie que les nombres.
  useEffect(() => {
    const load = () => api<{ allTodo?: number; allReply?: number }>("GET", "/api/rv/inbox?tab=todo&window=72&count=1").then((r) => setReply(r.allTodo ?? r.allReply ?? 0)).catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(t);
  }, []);

  const pick = (p: Pf) => {
    setPfOpen(false);
    if (p === pf) return;
    setPfState(p);
    setPf(p);
    // Les écrans relisent la plateforme au chargement. Un écran propre à l'autre plateforme n'existe pas ici : retour à l'accueil.
    const s = screenOf(cur);
    if (s?.pf && s.pf !== p) location.href = link();
    else location.reload();
  };
  const isMini = chat ? miniChat : mini;
  const setMiniNow = (v: boolean) => {
    if (chat) (setMiniChat(v), keep("miniChat", v ? "1" : "0"));
    else (setMini(v), keep("mini", v ? "1" : "0"));
  };
  const toggleGroup = (k: string, open?: boolean) =>
    setClosed((g) => {
      const next = open ?? g.includes(k) ? g.filter((x) => x !== k) : [...g, k];
      keep("closed", JSON.stringify(next));
      return next;
    });
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/connexion";
  };

  const boss = isBoss(me.role);
  const manager = me.role === "admin" || me.role === "manager";
  // OF Manager : en plus du rôle, la case d'accès « OF Manager » du rôle (comme dans la version actuelle).
  const visible = SCREENS.filter((s) => (!s.boss || boss) && (!s.manage || manager) && (!s.pf || s.pf === pf) && (s.key !== "of-manager" || canOpen(me, "/app/of-manager")));
  const role = me.roleName || ROLE_LABEL[me.role] || me.role;

  const side = (m: boolean, inDrawer = false) => {
    const item = (key: string, href: string, label: string, Icon: LucideIcon, n = 0) => (
      <Link key={key} href={href} data-on={cur === key} title={m ? `${label}${n ? ` · ${n} à traiter` : ""}` : undefined} className="v2-nav-item">
        <Icon />
        {m ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
        {n ? <span className="v2-badge" style={m ? { position: "absolute", top: 2, right: 0, minWidth: 16, height: 16, fontSize: 9.5, padding: "0 4px" } : undefined}>{n > 99 ? "99+" : n}</span> : null}
      </Link>
    );
    return (
      <aside className="v2-side" data-mini={m} style={{ width: m ? 62 : 232 }}>
        <div className={`flex w-full shrink-0 items-center ${m ? "justify-center" : ""}`}>
          {/* Emplacement du futur logo. */}
          <Link href={link()} title="Vue d’ensemble" className="v2-logo" style={m ? { padding: 0 } : undefined}><Sparkle />{m ? null : <span className="truncate">Bloom</span>}</Link>
          {m ? null : (
            <>
              <span className="flex-1" />
              {inDrawer ? (
                <button onClick={() => setDrawer(false)} aria-label="Fermer le menu" className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-fg"><X className="size-4" /></button>
              ) : (
                <button onClick={() => setMiniNow(true)} title="Réduire le menu" className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg"><ChevronsLeft className="size-4" /></button>
              )}
            </>
          )}
        </div>

        {/* Plateforme : menu déroulant (OnlyFans, MYM, Reveal plus tard). */}
        <div data-pf-box className="relative mt-3.5 w-full shrink-0">
          {m ? (
            <button onClick={() => setPfOpen(!pfOpen)} title={`Plateforme : ${PF_LABEL[pf]} (cliquer pour changer)`} aria-haspopup="listbox" aria-expanded={pfOpen} className="mx-auto grid size-10 place-items-center rounded-[10px] border transition hover:bg-white/[0.04]" style={{ borderColor: "var(--color-line)" }}>
              <span className="v2-dot" data-pf={pf} />
            </button>
          ) : (
            <button onClick={() => setPfOpen(!pfOpen)} className="v2-pf" data-open={pfOpen} aria-haspopup="listbox" aria-expanded={pfOpen} title="Changer de plateforme">
              <span className="v2-dot" data-pf={pf} />
              <span className="min-w-0 flex-1 truncate">{PF_LABEL[pf]}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted" />
            </button>
          )}
          {pfOpen ? (
            <div className="v2-menu" role="listbox" aria-label="Plateforme" style={m ? { left: "calc(100% + 8px)", top: 0, width: 210 } : { left: 0, right: 0, top: "calc(100% + 6px)" }}>
              <p className="v2-menu-label">Plateforme</p>
              {PLATFORMS.map((p) => (
                <button key={p.k} role="option" aria-selected={p.k === pf} disabled={!!p.soon} onClick={() => p.k !== "reveal" && pick(p.k)} className="v2-menu-item" data-on={p.k === pf}>
                  <span className="v2-dot" data-pf={p.k} />
                  <span className="flex-1">{p.label}</span>
                  {p.soon ? <span className="v2-tag">bientôt</span> : p.k === pf ? <Check className="size-4" style={{ color: "var(--v2-sky)" }} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <nav className="v2-nav v2-noscroll">
          {m && !inDrawer ? <button onClick={() => setMiniNow(false)} title="Déplier le menu" className="mx-auto mb-1 grid h-7 w-full place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg"><ChevronsRight className="size-4" /></button> : null}
          {item("home", link(), "Vue d’ensemble", LayoutDashboard)}
          {item("messagerie", link("/messagerie"), "Messagerie", MessageCircle, reply)}
          {GROUPS.map((g) => {
            const items = visible.filter((s) => s.group === g.key);
            if (!items.length) return null;
            const label = g.label(pf);
            const open = !closed.includes(g.key);
            if (m)
              return (
                <button key={g.key} title={label} onClick={() => (setMiniNow(false), toggleGroup(g.key, true))} className="v2-nav-item" data-on={curGroup === g.key}><g.Icon /></button>
              );
            return (
              <div key={g.key}>
                <button className="v2-nav-label" data-open={open} onClick={() => toggleGroup(g.key)} aria-expanded={open} title={open ? "Replier" : "Déplier"}>
                  <span className="flex-1">{label}</span><ChevronDown />
                </button>
                <div className="v2-collapse" data-open={open}>
                  <div>
                    {items.map((s) => {
                      const Icon = ICON[s.key];
                      return (
                        <Link key={s.key} href={link(`/${s.key}`)} data-on={cur === s.key} tabIndex={open ? undefined : -1} className="v2-nav-item">
                          <Icon /><span className="min-w-0 flex-1 truncate">{s.nav ?? s.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-2 w-full shrink-0">
          {/* Paramètres = ceux de la version actuelle (thème, langue, notifications), sans effet sur la nouvelle : pas montrés sur bloomcrm.fr, où tout le site est la nouvelle version. */}
          {base ? <a href="/app/parametres" title={m ? "Paramètres" : undefined} className="v2-nav-item"><Settings />{m ? null : <span>Paramètres</span>}</a> : null}
          {m ? (
            <button onClick={() => setMiniNow(false)} title={`${me.name} · ${role}`} className="mx-auto mt-2 grid size-10 place-items-center rounded-xl transition hover:bg-white/5"><Avatar src={me.avatar} name={me.name} size="size-8" /></button>
          ) : (
            <div className="v2-user mt-2">
              <Avatar src={me.avatar} name={me.name} size="size-8" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13px] leading-tight">{me.name}</b>
                <span className="block truncate text-[11.5px] text-muted">{role}</span>
              </span>
              <a href={pf === "mym" ? "/app/mym" : "/app/of"} title={base ? "Revenir à la version actuelle de Bloom" : "Ouvrir l’ancienne version de Bloom"} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg"><History className="size-[15px]" /></a>
              <button onClick={logout} title="Se déconnecter" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg"><LogOut className="size-[15px]" /></button>
            </div>
          )}
        </div>
      </aside>
    );
  };

  return (
    <>
      <div className="relative z-20 hidden h-full shrink-0 md:block">{side(isMini)}</div>
      {drawer ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="h-full" style={{ background: "var(--color-bg)" }}>{side(false, true)}</div>
          <button aria-label="Fermer le menu" className="flex-1 bg-black/70" onClick={() => setDrawer(false)} />
        </div>
      ) : null}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <div className="flex h-13 shrink-0 items-center gap-3 border-b px-3 md:hidden" style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)" }}>
          <button onClick={() => setDrawer(true)} aria-label="Ouvrir le menu" className="grid size-9 place-items-center rounded-lg"><Menu className="size-5" /></button>
          <span className="v2-logo" style={{ padding: 0, fontSize: 16 }}><Sparkle /><span>Bloom</span></span>
          <span className="flex-1" />
          <span className="flex items-center gap-2 text-[12.5px] font-semibold"><span className="v2-dot" data-pf={pf} />{PF_LABEL[pf]}</span>
        </div>
        <main className="v2-scroll min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </>
  );
}
