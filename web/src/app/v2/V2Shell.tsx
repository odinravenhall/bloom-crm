"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Bell, CalendarClock, ChartNoAxesCombined, Check, ChevronsLeft, ChevronsRight, ChevronsUpDown, Globe, History, Images, KeyRound, LayoutDashboard, Link2, ListChecks,
  LogOut, Megaphone, Menu, MessageCircle, MessagesSquare, Minus, Radio, ScrollText, Send, Settings, ShieldAlert, Sparkles, Ticket, Timer, TrendingUp, UserRound, Users, X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { getPf, PF_LABEL, setPf, type Pf } from "@/lib/platform";
import { ROLE_LABEL, type Me } from "@/lib/types";
import { Avatar } from "@/rv/components/ui";
import { SCREENS, screenOf, type GroupKey, type ScreenKey } from "./screens";

const ICON: Record<ScreenKey, LucideIcon> = {
  messagerie: MessageCircle, scripts: ScrollText, envois: Send, fans: Users, medias: Images,
  chiffres: TrendingUp, analytique: ChartNoAxesCombined, liens: Link2,
  "equipe-messages": MessagesSquare, "equipe-ventes": BarChart3, shifts: Timer, activite: Activity, "en-direct": Radio, moderation: ShieldAlert, acces: KeyRound,
  push: Megaphone, planification: CalendarClock, feed: ListChecks, amis: UserRound, bons: Ticket, notifications: Bell, "site-mym": Globe,
};
// Les rubriques dépliables : un carré de couleur chacune (comme Moby), le « − » ou le nombre d'écrans à droite.
type G = Exclude<GroupKey, "top">;
const GROUPS: { key: G; label: (pf: Pf) => string; color: string; Icon: LucideIcon }[] = [
  { key: "chat", label: () => "Chatting", color: "violet", Icon: MessagesSquare },
  { key: "stats", label: () => "Statistiques", color: "orange", Icon: BarChart3 },
  { key: "team", label: () => "Équipe", color: "green", Icon: Users },
  { key: "platform", label: (pf) => PF_LABEL[pf], color: "blue", Icon: Sparkles },
];
// Les plateformes du menu déroulant. Reveal arrivera plus tard : la ligne est déjà là, grisée.
const PLATFORMS: { k: Pf | "reveal"; label: string; mark: string; soon?: boolean }[] = [
  { k: "of", label: "OnlyFans", mark: "OF" },
  { k: "mym", label: "MYM", mark: "MY" },
  { k: "reveal", label: "Reveal", mark: "RV", soon: true },
];
const isBoss = (r: string) => r === "admin" || r === "manager" || r === "lead";
const keep = (k: string, v: string) => {
  try {
    localStorage.setItem("bloom.v2." + k, v);
  } catch {}
};

/** Le cadre de la v2 : menu flottant à gauche (mêmes rubriques sur toutes les plateformes), plateforme au choix en haut. */
export function V2Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname() || "/v2";
  const cur = path === "/v2" ? "home" : path.split("/")[2] || "home";
  const chat = cur === "messagerie";
  const [pf, setPfState] = useState<Pf>("of");
  // Menu réduit en icônes : un réglage pour la messagerie (réduit d'office, elle a besoin de place) et un pour le reste.
  const [mini, setMini] = useState(false);
  const [miniChat, setMiniChat] = useState(true);
  const [openG, setOpenG] = useState<string[]>(["chat"]);
  const [drawer, setDrawer] = useState(false);
  const [pfOpen, setPfOpen] = useState(false);
  const [reply, setReply] = useState(0);
  useEffect(() => {
    setPfState(getPf());
    try {
      setMini(localStorage.getItem("bloom.v2.mini") === "1");
      setMiniChat(localStorage.getItem("bloom.v2.miniChat") !== "0");
      const g = localStorage.getItem("bloom.v2.groups");
      if (g) setOpenG(JSON.parse(g) as string[]);
    } catch {}
  }, []);
  useEffect(() => (setDrawer(false), setPfOpen(false)), [path]);
  // La rubrique de la page ouverte se déplie toute seule.
  const curGroup = SCREENS.find((s) => s.key === cur)?.group;
  useEffect(() => {
    if (curGroup && curGroup !== "top") setOpenG((g) => (g.includes(curGroup) ? g : [...g, curGroup]));
  }, [curGroup]);
  useEffect(() => {
    if (!pfOpen) return;
    const close = (e: MouseEvent) => !(e.target as Element).closest?.("[data-pf-box]") && setPfOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPfOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", close), document.removeEventListener("keydown", esc));
  }, [pfOpen]);
  // Pastille de la messagerie : les fans qui attendent une réponse sur la plateforme choisie.
  useEffect(() => {
    const load = () => api<{ allReply?: number }>("GET", "/api/rv/inbox?tab=reply").then((r) => setReply(r.allReply ?? 0)).catch(() => {});
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
    if (s?.pf && s.pf !== p) location.href = "/v2";
    else location.reload();
  };
  const isMini = chat ? miniChat : mini;
  const setMiniNow = (v: boolean) => {
    if (chat) (setMiniChat(v), keep("miniChat", v ? "1" : "0"));
    else (setMini(v), keep("mini", v ? "1" : "0"));
  };
  const toggleGroup = (k: string, force?: boolean) =>
    setOpenG((g) => {
      const next = force ?? !g.includes(k) ? [...g.filter((x) => x !== k), k] : g.filter((x) => x !== k);
      keep("groups", JSON.stringify(next));
      return next;
    });
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/connexion";
  };

  const boss = isBoss(me.role);
  const visible = SCREENS.filter((s) => (!s.boss || boss) && (!s.pf || s.pf === pf));
  const mark = PLATFORMS.find((p) => p.k === pf)?.mark ?? "OF";

  const side = (m: boolean, inDrawer = false) => {
    const top = (key: string, href: string, label: string, Icon: LucideIcon, n = 0) => (
      <Link key={key} href={href} data-on={cur === key} title={m ? `${label}${n ? ` · ${n} à répondre` : ""}` : undefined} className="v2-nav-item" style={m ? { justifyContent: "center", padding: 0 } : undefined}>
        <Icon className="size-[19px] shrink-0" />
        {m ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
        {n ? <span className="v2-badge" style={m ? { position: "absolute", top: 3, right: 5, minWidth: 17, height: 17, fontSize: 9.5, padding: "0 4px" } : undefined}>{n > 99 ? "99+" : n}</span> : null}
      </Link>
    );
    return (
      <aside className="v2-side" style={{ width: m ? 76 : 264 }}>
        <div className={`flex h-[62px] shrink-0 items-center ${m ? "justify-center" : "gap-2.5 pr-3 pl-4"}`}>
          <Link href="/v2" title="Accueil" className="flex min-w-0 items-center gap-2.5">
            {/* Emplacement du futur logo. */}
            <span className="v2-logo-mark">B</span>
            {m ? null : <span className="truncate text-[18px] font-bold tracking-[-0.03em]">Bloom <span style={{ color: "var(--v2-sky)" }}>CRM</span></span>}
          </Link>
          {m ? null : (
            <>
              <span className="flex-1" />
              {inDrawer ? (
                <button onClick={() => setDrawer(false)} aria-label="Fermer le menu" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-fg"><X className="size-4" /></button>
              ) : (
                <button onClick={() => setMiniNow(true)} title="Réduire le menu" className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg"><ChevronsLeft className="size-4" /></button>
              )}
            </>
          )}
        </div>
        <div className="v2-hair" />

        {/* Plateforme : menu déroulant (OnlyFans, MYM, Reveal plus tard). */}
        <div data-pf-box className="relative shrink-0 px-3 pt-3">
          {m ? (
            <button onClick={() => setPfOpen(!pfOpen)} title={`Plateforme : ${PF_LABEL[pf]} (cliquer pour changer)`} aria-haspopup="listbox" aria-expanded={pfOpen} className="mx-auto grid size-11 place-items-center rounded-xl transition hover:bg-white/5">
              <span className="v2-pf-mark" data-pf={pf}>{mark}</span>
            </button>
          ) : (
            <button onClick={() => setPfOpen(!pfOpen)} className="v2-pf" data-open={pfOpen} aria-haspopup="listbox" aria-expanded={pfOpen}>
              <span className="v2-pf-mark" data-pf={pf}>{mark}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] leading-tight font-semibold text-muted">Plateforme</span>
                <b className="block truncate text-[13.5px] leading-tight">{PF_LABEL[pf]}</b>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted" />
            </button>
          )}
          {pfOpen ? (
            <div className="v2-menu" role="listbox" aria-label="Plateforme" style={m ? { left: "calc(100% + 2px)", top: 10, width: 224 } : { left: 12, right: 12, top: "calc(100% + 6px)" }}>
              <p className="v2-menu-label">Plateforme</p>
              {PLATFORMS.map((p) => (
                <button key={p.k} role="option" aria-selected={p.k === pf} disabled={!!p.soon} onClick={() => p.k !== "reveal" && pick(p.k)} className="v2-menu-item" data-on={p.k === pf}>
                  <span className="v2-pf-mark" data-pf={p.k}>{p.mark}</span>
                  <span className="flex-1">{p.label}</span>
                  {p.soon ? <span className="v2-tag">bientôt</span> : p.k === pf ? <Check className="size-4" style={{ color: "var(--v2-sky)" }} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <nav className="v2-noscroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {m && !inDrawer ? <button onClick={() => setMiniNow(false)} title="Déplier le menu" className="mx-auto mb-1 grid h-8 w-11 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg"><ChevronsRight className="size-4" /></button> : null}
          <div className="space-y-0.5">
            {top("home", "/v2", "Accueil", LayoutDashboard)}
            {top("messagerie", "/v2/messagerie", "Messagerie", MessageCircle, reply)}
          </div>
          <div className="mt-3 space-y-0.5">
            {GROUPS.map((g) => {
              const items = visible.filter((s) => s.group === g.key);
              // OnlyFans : pas encore d'écran propre dans la v2, on renvoie vers OF Manager de la version actuelle.
              const ofLink = g.key === "platform" && pf === "of" && boss;
              const count = items.length + (ofLink ? 1 : 0);
              if (!count) return null;
              const label = g.label(pf);
              const open = openG.includes(g.key);
              const here = curGroup === g.key;
              if (m)
                return (
                  <button key={g.key} title={label} onClick={() => (setMiniNow(false), toggleGroup(g.key, true))} className="mx-auto grid size-11 place-items-center rounded-xl transition hover:bg-white/5" style={here ? { background: "rgb(59 130 246 / 0.14)" } : undefined}>
                    <span className="v2-ico size-7" data-c={g.color}><g.Icon className="size-[15px]" /></span>
                  </button>
                );
              return (
                <div key={g.key}>
                  <button className="v2-nav-group" onClick={() => toggleGroup(g.key)} aria-expanded={open}>
                    <span className="v2-ico size-7" data-c={g.color}><g.Icon className="size-[15px]" /></span>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className="v2-count">{open ? <Minus className="size-3" /> : count}</span>
                  </button>
                  <div className="v2-collapse" data-open={open}>
                    <div>
                      <div className="v2-nav-subs">
                        {items.map((s) => {
                          const Icon = ICON[s.key];
                          return (
                            <Link key={s.key} href={`/v2/${s.key}`} data-on={cur === s.key} tabIndex={open ? undefined : -1} className="v2-nav-sub">
                              <Icon className="size-4 shrink-0" />
                              <span className="truncate">{s.nav ?? s.label}</span>
                            </Link>
                          );
                        })}
                        {ofLink ? <a href="/app/of-manager" tabIndex={open ? undefined : -1} className="v2-nav-sub" title="OF Manager (version actuelle de Bloom)"><Sparkles className="size-4 shrink-0" /><span className="truncate">OF Manager</span></a> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 px-3 pb-3">
          <div className="v2-hair" style={{ margin: "0 4px 8px" }} />
          <a href="/app/parametres" title={m ? "Paramètres" : undefined} className="v2-nav-item" style={m ? { justifyContent: "center", padding: 0 } : undefined}><Settings className="size-[19px] shrink-0" />{m ? null : <span>Paramètres</span>}</a>
          {m ? (
            <button onClick={() => setMiniNow(false)} title={`${me.name} · ${me.roleName || ROLE_LABEL[me.role] || me.role}`} className="mx-auto mt-1.5 grid size-11 place-items-center rounded-xl transition hover:bg-white/5"><Avatar src={me.avatar} name={me.name} size="size-8" /></button>
          ) : (
            <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl border p-2" style={{ borderColor: "rgb(255 255 255 / 0.07)", background: "rgb(255 255 255 / 0.03)" }}>
              <Avatar src={me.avatar} name={me.name} size="size-9" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13px]">{me.name}</b>
                <span className="block truncate text-[11.5px] text-muted">{me.roleName || ROLE_LABEL[me.role] || me.role}</span>
              </span>
              <a href={pf === "mym" ? "/app/mym" : "/app/of"} title="Revenir à la version actuelle de Bloom" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg"><History className="size-4" /></a>
              <button onClick={logout} title="Se déconnecter" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-fg"><LogOut className="size-4" /></button>
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
          <div className="h-full pr-3">{side(false, true)}</div>
          <button aria-label="Fermer le menu" className="flex-1 bg-black/70" onClick={() => setDrawer(false)} />
        </div>
      ) : null}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <div className="flex h-13 shrink-0 items-center gap-3 border-b px-3 md:hidden" style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)" }}>
          <button onClick={() => setDrawer(true)} aria-label="Ouvrir le menu" className="grid size-9 place-items-center rounded-lg"><Menu className="size-5" /></button>
          <span className="v2-logo-mark" style={{ width: 28, height: 28, fontSize: 14, borderRadius: 9 }}>B</span>
          <span className="text-[16px] font-bold tracking-[-0.03em]">Bloom <span style={{ color: "var(--v2-sky)" }}>CRM</span></span>
          <span className="flex-1" />
          <span className="v2-pf-mark" data-pf={pf} title={PF_LABEL[pf]}>{mark}</span>
        </div>
        <main className="v2-scroll min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </>
  );
}
