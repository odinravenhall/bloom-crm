"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, BellRing, Boxes as BoxesIcon, ChevronLeft, MessageCircle, X, Pin, Search, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { cn, durSec, moneyC, usd, waitTone, when } from "@/lib/fmt";
import { PlatformBadge, platformOf, useCreators } from "@/lib/creators";
import { useNow } from "@/lib/useNow";
import type { Creator, Message, Presence, Queue, QueueItem, QueueTab, RevenueSale } from "@/lib/types";
import { Avatar, Pill } from "@/components/ui";
import { Chat } from "./Chat";
import { BoxMenu } from "./Boxes";

/** Conversation gardée en onglet (multi-conversations, 10 au plus). */
type ChatTab = { creatorId: string; fanId: string; name: string; avatar: string | null };
const MAX_TABS = 10;

/** Événement temps réel relayé par Bloom. */
export type LiveEvent = { creatorId: string; type: string; fanId?: string; message?: Message; data?: { fanId?: string; status?: string } };

const TABS: { k: QueueTab; label: string; icon: typeof Pin | null; hint: string }[] = [
  { k: "all", label: "Tous", icon: null, hint: "Toutes les conversations" },
  { k: "pinned", label: "Épinglés", icon: Pin, hint: "Fans épinglés par l’équipe" },
  { k: "active", label: "Actifs", icon: Zap, hint: "Le fan a écrit il y a moins de 10 min" },
  { k: "new", label: "Nouveaux", icon: Sparkles, hint: "Abonnés depuis moins de 3 jours" },
  { k: "relance", label: "Relances", icon: BellRing, hint: "Notre dernier message est un PPV pas encore payé (envoyé il y a 5 min à 24 h)" },
  { k: "reply", label: "À répondre", icon: MessageCircle, hint: "Le fan attend une réponse" },
];
const SORTS: [string, string][] = [
  ["old", "Plus anciens"],
  ["recent", "Récents"],
  ["spent", "Par dépense"],
];
const WINS: [string, string][] = [
  ["6h", "6 h"],
  ["24h", "24 h"],
  ["3j", "3 jours"],
  ["7j", "7 jours"],
  ["tout", "Tout"],
];

/** Conversation encore inconnue de la file (lien, onglet, cloche) : Bloom la complète à l'ouverture. */
const blank = (creatorId: string, fanId: string): QueueItem => ({ fanId, creatorId, name: "Fan", username: null, avatar: null, unread: 0, ai: false, handoff: false, spent: 0, subscribed: null, canSend: true, last: null, waiting: false, isNew: false, active: false, pinned: false, pinnedBy: null, tags: [], fresh: false, relance: null });

/** Réglages de la messagerie gardés sur cet ordinateur. */
function usePref<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  const ready = useRef(false);
  useEffect(() => {
    try {
      const s = localStorage.getItem("bloom.inbox." + key);
      if (s != null) setV(JSON.parse(s));
    } catch {}
    ready.current = true;
  }, [key]);
  useEffect(() => {
    if (!ready.current) return;
    try {
      localStorage.setItem("bloom.inbox." + key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV] as const;
}

/**
 * Messagerie (comme Raven CRM) : à gauche les créatrices (« Tous » ou une seule, avec le nombre de fans à répondre),
 * puis la file (onglets, recherche, tri), la conversation, et la fiche du fan.
 */
export function Inbox({ boss = false }: { boss?: boolean }) {
  const params = useSearchParams();
  const { creators, loaded } = useCreators();
  const [scope, setScope] = usePref<string>("scope", "all");
  const [tab, setTab] = usePref<QueueTab>("tab", "reply");
  const [sort, setSort] = usePref<string>("sort", "");
  const [win, setWin] = usePref<string>("win", "3j");
  const [paying, setPaying] = usePref<boolean>("paying", false);
  const [hidden, setHidden] = usePref<string[]>("hidden", []);
  const [autoNext, setAutoNext] = usePref<boolean>("autoNext", false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Queue | null>(null);
  const [open, setOpen] = useState<QueueItem | null>(null);
  const [live, setLive] = useState(false);
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [boxMenu, setBoxMenu] = useState(false);
  const [tabs, setTabs] = usePref<ChatTab[]>("tabs", []);
  // Onglets où le fan a écrit depuis qu'on l'a quitté (point qui clignote).
  const [tabNews, setTabNews] = useState<string[]>([]);
  const search = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const rail = useMemo(() => creators.filter((c) => !hidden.includes(c.id)), [creators, hidden]);
  useEffect(() => {
    if (scope !== "all" && loaded && !rail.some((c) => c.id === scope)) setScope("all");
  }, [scope, rail, loaded, setScope]);

  // Lien venu d'une autre page : ?c=créatrice&fan=…
  useEffect(() => {
    const c = params.get("c");
    const fan = params.get("fan");
    if (!c || !loaded) return;
    setScope(c);
    if (fan) setOpen((o) => o ?? (blank(c, fan)));
  }, [params, loaded, setScope]);

  // La file vient du serveur (qui garde toutes les conversations de Substy en mémoire).
  const query = useMemo(() => {
    const p = new URLSearchParams({ scope, tab, win });
    if (sort) p.set("sort", sort);
    if (q.trim()) p.set("q", q.trim());
    if (paying) p.set("paying", "1");
    if (hidden.length) p.set("hide", hidden.join(","));
    return p.toString();
  }, [scope, tab, win, sort, q, paying, hidden]);
  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const r = await api<Queue>("GET", "/api/queue?" + query);
      if (id !== reqId.current) return;
      // Conversation ouverte : on la garde lue à l'écran.
      setData({ ...r, items: r.items.map((x) => (openRef.current && x.fanId === openRef.current.fanId && x.creatorId === openRef.current.creatorId ? { ...x, unread: 0, fresh: false } : x)) });
      if (r.loading) setTimeout(() => id === reqId.current && load(), 3000);
    } catch {}
  }, [query]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Temps réel : un seul flux ; la file se recharge (regroupé) à chaque nouveau message.
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      let e: LiveEvent;
      try {
        e = JSON.parse(ev.data);
      } catch {
        return;
      }
      setLastEvent(e);
      if (e.type === "new_message" && e.message?.fromFan && e.fanId) {
        const k = e.creatorId + ":" + e.fanId;
        const o = openRef.current;
        if (!o || o.creatorId + ":" + o.fanId !== k) setTabNews((l) => (l.includes(k) ? l : [...l, k]));
      }
      if (e.type === "new_message") {
        if (later.current) clearTimeout(later.current);
        later.current = setTimeout(() => loadRef.current(), 400);
      }
    };
    return () => es.close();
  }, []);

  // Présence : qui d'autre est sur quel fan (toutes créatrices).
  const [others, setOthers] = useState<Presence[]>([]);
  useEffect(() => {
    const ping = () =>
      api<{ others: Presence[] }>("POST", "/api/presence", { creatorId: open?.creatorId ?? (scope !== "all" ? scope : null), fanId: open?.fanId ?? null, page: "messagerie", scope: "all" })
        .then((r) => setOthers(r.others))
        .catch(() => {});
    ping();
    const t = setInterval(() => document.visibilityState === "visible" && ping(), 20_000);
    return () => clearInterval(t);
  }, [open?.creatorId, open?.fanId, scope]);
  const othersOn = (c: { creatorId: string; fanId: string }) => others.filter((o) => o.fanId === c.fanId && o.creatorId === c.creatorId);

  const items = data?.items ?? [];
  const select = useCallback((c: QueueItem) => {
    setOpen({ ...c, unread: 0, fresh: false });
    setTabNews((l) => l.filter((k) => k !== c.creatorId + ":" + c.fanId));
    setData((d) => d && { ...d, items: d.items.map((x) => (x.fanId === c.fanId && x.creatorId === c.creatorId ? { ...x, unread: 0, fresh: false } : x)) });
    // « Vu par l'équipe » (la ligne n'est plus en gras pour les autres).
    if (c.last?.id) api("POST", "/api/fan-meta", { creatorId: c.creatorId, fanId: c.fanId, seen: c.last.id }).catch(() => {});
  }, []);
  const patch = useCallback((creatorId: string, fanId: string, p: Partial<QueueItem>) => {
    setData((d) => d && { ...d, items: d.items.map((x) => (x.fanId === fanId && x.creatorId === creatorId ? { ...x, ...p } : x)) });
    setOpen((o) => (o && o.fanId === fanId && o.creatorId === creatorId ? { ...o, ...p } : o));
  }, []);
  const meta = async (c: QueueItem, body: Record<string, unknown>, p: Partial<QueueItem>) => {
    patch(c.creatorId, c.fanId, p);
    try {
      await api("POST", "/api/fan-meta", { creatorId: c.creatorId, fanId: c.fanId, ...body });
    } catch {}
    load();
  };

  // Fan suivant à répondre (Alt+↓, ou après un envoi si « enchaîner » est activé).
  const goNext = useCallback(
    (dir: 1 | -1 = 1, onlyWaiting = true) => {
      const list = items.filter((c) => (!onlyWaiting || c.waiting) && !othersOn(c).length);
      if (!list.length) return;
      const i = open ? list.findIndex((c) => c.fanId === open.fanId && c.creatorId === open.creatorId) : -1;
      const n = list[Math.min(list.length - 1, Math.max(0, i + dir))] ?? list[0];
      if (n && !(open && n.fanId === open.fanId && n.creatorId === open.creatorId)) {
        select(n);
        document.querySelector(`[data-fan="${CSS.escape(n.creatorId + ":" + n.fanId)}"]`)?.scrollIntoView({ block: "nearest" });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, open, others, select],
  );
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      } else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        goNext(e.key === "ArrowDown" ? 1 : -1, tab === "reply");
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [goNext, tab]);

  const total = data?.replyTotal ?? 0;
  useEffect(() => {
    document.title = total ? `(${total}) Messagerie · Bloom CRM` : "Messagerie · Bloom CRM";
  }, [total]);
  const cur = scope !== "all" ? byId.get(scope) ?? null : null;
  const multi = scope === "all" && rail.length > 1;
  const counts = data?.counts;

  return (
    <div className="flex h-full min-h-0">
      {/* Créatrices */}
      <CreatorRail
        creators={rail}
        all={creators}
        hidden={hidden}
        setHidden={setHidden}
        scope={scope}
        setScope={(s) => (setScope(s), setOpen(null))}
        perCreator={data?.perCreator ?? {}}
        total={total}
      />

      {/* File */}
      <aside className={cn("flex w-full min-w-0 flex-col border-r bg-panel md:w-[360px] md:shrink-0", open && "max-md:hidden")}>
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="relative flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 truncate text-2xl">
                {cur ? (
                  <>
                    <span className="truncate">{cur.name}</span> <PlatformBadge c={cur} />
                  </>
                ) : (
                  "Messagerie"
                )}
                <span className={cn("size-2 shrink-0 rounded-full", live ? "bg-emerald-400" : "bg-amber-400")} title={live ? "Temps réel actif" : "Temps réel : connexion…"} />
              </h1>
              <p className="text-xs text-muted">
                {cur ? (data?.perCreator[cur.id] ?? 0) : total} fan{(cur ? data?.perCreator[cur.id] : total) === 1 ? "" : "s"} à répondre
                {data?.loading ? " · Bloom récupère encore des conversations…" : ""}
              </p>
            </div>
            {cur ? (
              <button onClick={() => setBoxMenu((b) => !b)} className={cn("grid size-9 place-items-center rounded-xl border bg-card text-muted hover:text-fg", boxMenu && "border-primary text-primary")} title="Boîtes : partager les fans de cette créatrice entre chatteurs">
                <BoxesIcon className="size-4" />
              </button>
            ) : null}
            <button onClick={() => setBell((b) => !b)} className={cn("grid size-9 place-items-center rounded-xl border bg-card text-muted hover:text-fg", bell && "border-primary text-primary")} title="Ventes, pourboires et abonnements récents">
              <Bell className="size-4" />
            </button>
            {boxMenu && cur ? <BoxMenu creator={cur} onClose={() => setBoxMenu(false)} onChanged={load} /> : null}
          </div>
          <div className="flex gap-0.5 rounded-2xl border bg-card p-1">
            {TABS.map((t) => {
              const n = t.k === "all" ? null : counts?.[t.k] ?? 0;
              if (t.k === "pinned" && !counts?.pinned) return null;
              return (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  title={t.hint}
                  className={cn("relative flex flex-1 items-center justify-center rounded-xl px-2 py-1.5 text-xs font-semibold", tab === t.k ? "bg-petal text-primary-soft" : "text-muted hover:text-fg")}
                >
                  {t.icon ? <t.icon className="size-4" /> : t.label}
                  {n ? <span className={cn("absolute -top-1.5 -right-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4 font-bold tabular-nums", t.k === "reply" ? "bg-primary text-white" : "bg-card-2 text-fg ring-1 ring-line")}>{n > 999 ? "999+" : n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={search}
              className="h-9 w-full rounded-full border border-input bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted/70 focus:border-primary"
              placeholder="Rechercher un fan, un tag…  (Ctrl+K)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && items[0]) select(items[0]);
                if (e.key === "Escape") (setQ(""), e.currentTarget.blur());
              }}
            />
          </div>
          <div className="relative flex items-center gap-1.5">
            <button onClick={() => setMenu((m) => !m)} className={cn("flex flex-1 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold", menu && "border-primary")}>
              <SlidersHorizontal className="size-3.5" />
              {SORTS.find(([k]) => k === (sort || (tab === "reply" ? "old" : "recent")))?.[1]}
              {paying ? " · payants" : ""}
            </button>
            {tab === "reply" ? (
              <select value={win} onChange={(e) => setWin(e.target.value)} className="h-[30px] rounded-full border bg-card px-2 text-xs font-semibold" title="Ne garder que les fans qui attendent depuis moins de…">
                {WINS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            ) : null}
            {menu ? (
              <div className="absolute top-full left-0 z-30 mt-1 w-64 rounded-2xl border bg-card p-2 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
                <p className="px-2 pb-1 text-[11px] font-semibold text-muted uppercase">Trier</p>
                {SORTS.map(([k, l]) => (
                  <button key={k} onClick={() => (setSort(k), setMenu(false))} className={cn("block w-full rounded-xl px-3 py-1.5 text-left hover:bg-card-2", (sort || (tab === "reply" ? "old" : "recent")) === k && "font-semibold text-primary-soft")}>
                    {l}
                  </button>
                ))}
                <p className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted uppercase">Filtrer</p>
                <label className="flex items-center gap-2 rounded-xl px-3 py-1.5 hover:bg-card-2">
                  <input type="checkbox" checked={paying} onChange={(e) => setPaying(e.target.checked)} /> Payants uniquement
                </label>
                <label className="flex items-center gap-2 rounded-xl px-3 py-1.5 hover:bg-card-2" title="Après un envoi, ouvrir tout seul le fan suivant à répondre">
                  <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> Enchaîner après un envoi
                </label>
              </div>
            ) : null}
          </div>
        </div>
        {bell ? <Notifs scope={scope} byId={byId} onOpen={(cid, fanId) => (setBell(false), setScope(cid), setOpen({ ...(items.find((x) => x.fanId === fanId && x.creatorId === cid) ?? blank(cid, fanId)) }))} /> : null}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {items.map((c) => (
            <Row key={c.creatorId + ":" + c.fanId} c={c} on={open?.fanId === c.fanId && open?.creatorId === c.creatorId} onClick={() => select(c)} watchers={othersOn(c)} creator={multi ? byId.get(c.creatorId) : undefined} />
          ))}
          {data?.more ? <p className="p-3 text-center text-[11px] text-muted">300 premiers affichés : cherche un fan ou choisis une créatrice.</p> : null}
          {loaded && !creators.length ? <p className="p-6 text-center text-sm text-muted">Tu n’as encore accès à aucune créatrice. Demande à un manager de t’en donner dans Équipe.</p> : null}
          {data && !items.length && creators.length ? (
            <p className="p-6 text-center text-sm text-muted">{q ? "Aucun fan ne correspond" : tab === "reply" ? "Personne n’attend de réponse 🎉" : "Aucune conversation ici"}</p>
          ) : null}
          {!data && creators.length ? <p className="p-6 text-center text-sm text-muted">Chargement…</p> : null}
        </div>
      </aside>

      {/* Conversation */}
      <section className={cn("flex min-w-0 flex-1 flex-col", !open && "max-md:hidden")}>
        {tabs.length ? (
          <div className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b bg-panel px-2 py-1.5">
            {tabs.map((t) => {
              const k = t.creatorId + ":" + t.fanId;
              const on = open && open.creatorId + ":" + open.fanId === k;
              const cr = byId.get(t.creatorId);
              const item = items.find((x) => x.creatorId === t.creatorId && x.fanId === t.fanId);
              const news = !on && (tabNews.includes(k) || !!item?.fresh);
              return (
                <span key={k} className={cn("flex shrink-0 items-center gap-1.5 rounded-xl border py-1 pr-1 pl-1.5 text-xs", on ? "border-primary bg-petal" : "bg-card hover:bg-card-2")}>
                  <button
                    onClick={() => select(item ?? ({ ...blank(t.creatorId, t.fanId), name: t.name, avatar: t.avatar } as QueueItem))}
                    className="flex items-center gap-1.5"
                    title={cr ? `${t.name} · ${cr.name}` : t.name}
                  >
                    <span className="relative">
                      <Avatar src={t.avatar} name={t.name} size="size-5" />
                      {news ? <span className="absolute -top-0.5 -right-0.5 size-2 animate-pulse rounded-full bg-primary" /> : null}
                    </span>
                    <span className={cn("max-w-24 truncate", news && "font-bold")}>{t.name}</span>
                    {cr && multi ? <PlatformBadge c={cr} /> : null}
                  </button>
                  <button onClick={() => setTabs(tabs.filter((x) => x !== t))} className="rounded p-0.5 text-muted hover:text-fg" title="Fermer l’onglet">
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
        {open ? (
          <>
            <button onClick={() => setOpen(null)} className="flex items-center gap-1 border-b px-3 py-2 text-sm text-muted md:hidden">
              <ChevronLeft className="size-4" /> Conversations
            </button>
            <Chat
              key={open.creatorId + open.fanId}
              creatorId={open.creatorId}
              chat={open}
              lastEvent={lastEvent}
              onPatch={(fanId, p) => patch(open.creatorId, fanId, p)}
              watchers={othersOn(open)}
              boss={boss}
              creatorTag={multi ? byId.get(open.creatorId) : undefined}
              pinned={open.pinned}
              onPin={() => meta(open, { pinned: !open.pinned }, { pinned: !open.pinned })}
              onUnread={() => (meta(open, { unread: true }, { fresh: true }), setOpen(null))}
              kept={tabs.some((t) => t.creatorId === open.creatorId && t.fanId === open.fanId)}
              onKeep={() =>
                setTabs((l) =>
                  l.some((t) => t.creatorId === open.creatorId && t.fanId === open.fanId)
                    ? l.filter((t) => !(t.creatorId === open.creatorId && t.fanId === open.fanId))
                    : [...l, { creatorId: open.creatorId, fanId: open.fanId, name: open.name, avatar: open.avatar }].slice(-MAX_TABS),
                )
              }
              onSent={() => {
                load();
                if (autoNext && tab === "reply") setTimeout(() => goNext(1, true), 300);
              }}
            />
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-center text-sm text-muted">
            <div>
              <p className="text-4xl">🌸</p>
              <p className="mt-2">Choisis une conversation</p>
              <p className="mt-3 text-xs">Alt+↓ / Alt+↑ : fan suivant / précédent · Ctrl+K (⌘K sur Mac) : chercher un fan · / : messages rapides</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** Barre des créatrices : « Tous » puis chaque créatrice (OnlyFans, puis MYM) avec son nombre de fans à répondre. Clic droit : masquer. */
function CreatorRail({
  creators,
  all,
  hidden,
  setHidden,
  scope,
  setScope,
  perCreator,
  total,
}: {
  creators: Creator[];
  all: Creator[];
  hidden: string[];
  setHidden: (h: string[]) => void;
  scope: string;
  setScope: (s: string) => void;
  perCreator: Record<string, number>;
  total: number;
}) {
  const [menu, setMenu] = useState(false);
  if (all.length < 2) return null;
  const badge = (n: number | undefined) => (n ? <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] leading-5 font-bold text-white tabular-nums ring-2 ring-panel">{n > 99 ? "99+" : n}</span> : null);
  let lastP: string | null = null;
  return (
    <nav className="scroll-thin relative hidden w-[68px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r bg-panel py-3 md:flex">
      <button
        onClick={() => setScope("all")}
        onContextMenu={(e) => (e.preventDefault(), setMenu((m) => !m))}
        title="Toutes les créatrices (clic droit : choisir celles affichées)"
        className={cn("relative grid size-12 shrink-0 place-items-center rounded-2xl border text-xs font-bold", scope === "all" ? "border-primary bg-petal text-primary-soft" : "bg-card text-muted hover:text-fg")}
      >
        Tous
        {badge(total)}
      </button>
      {creators.map((c) => {
        const p = platformOf(c);
        const sep = lastP !== null && p !== lastP;
        lastP = p;
        return (
          <div key={c.id} className="flex flex-col items-center gap-2">
            {sep ? <span className="h-px w-8 bg-line" /> : null}
            <button
              onClick={() => setScope(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (window.confirm(`Masquer ${c.name} (${p === "mym" ? "MYM" : "OnlyFans"}) de la messagerie ? Clic droit sur « Tous » pour la remettre.`)) setHidden([...hidden, c.id]);
              }}
              title={`${c.name} · ${p === "mym" ? "MYM" : "OnlyFans"}`}
              className={cn("relative shrink-0 rounded-2xl p-0.5", scope === c.id ? "ring-2 ring-primary" : "opacity-85 hover:opacity-100")}
            >
              <Avatar src={c.avatar} name={c.name} size="size-11" rounded="rounded-2xl" />
              {badge(perCreator[c.id])}
              <span className={cn("absolute -bottom-1 left-1/2 -translate-x-1/2 rounded px-1 text-[8px] leading-3 font-bold ring-2 ring-panel", p === "mym" ? "bg-amber-500 text-white" : "bg-sky-500 text-white")}>{p === "mym" ? "MYM" : "OF"}</span>
            </button>
          </div>
        );
      })}
      {menu ? (
        <div className="fixed top-20 left-[76px] z-50 max-h-[70vh] w-64 overflow-y-auto rounded-2xl border bg-card p-2 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
          <p className="px-2 pb-1 text-[11px] font-semibold text-muted uppercase">Créatrices affichées</p>
          {all.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-card-2">
              <input type="checkbox" checked={!hidden.includes(c.id)} onChange={(e) => setHidden(e.target.checked ? hidden.filter((x) => x !== c.id) : [...hidden, c.id])} />
              <span className="flex-1 truncate">{c.name}</span>
              <PlatformBadge c={c} />
            </label>
          ))}
        </div>
      ) : null}
    </nav>
  );
}

function Row({ c, on, onClick, watchers, creator }: { c: QueueItem; on: boolean; onClick: () => void; watchers: Presence[]; creator?: Creator }) {
  const read = !!c.last?.fromCreator;
  return (
    <button
      data-fan={c.creatorId + ":" + c.fanId}
      onClick={onClick}
      className={cn("cv-row relative flex w-full items-start gap-3 border-b border-line/50 px-3 py-2.5 text-left transition-colors", on ? "bg-petal/60" : "hover:bg-card-2/60", watchers.length > 0 && !on && "opacity-60")}
    >
      {on ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
      <span className="flex shrink-0 flex-col items-center gap-1">
        <span className="relative">
          {c.isNew ? (
            <span className="grid size-11 place-items-center rounded-full bg-sage text-[10px] font-extrabold text-white">NEW</span>
          ) : (
            <Avatar src={c.avatar} name={c.name} size="size-11" />
          )}
          {c.active ? <span className="absolute right-0 bottom-0 size-3 rounded-full bg-emerald-400 ring-2 ring-panel" title="A écrit il y a moins de 10 min" /> : null}
        </span>
        {c.spent > 0 ? <span className="rounded-md bg-sage-soft px-1.5 text-[10px] leading-4 font-bold text-good tabular-nums">{usd(c.spent, 0)}</span> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {c.pinned ? <Pin className="size-3.5 shrink-0 text-primary" aria-label={c.pinnedBy ? `épinglé par ${c.pinnedBy}` : "épinglé"} /> : null}
          <span className={cn("truncate text-sm", c.fresh || c.unread ? "font-extrabold" : "font-semibold")}>{c.name}</span>
          {c.unread ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-bold text-white">{c.unread}</span> : null}
          <span className="ml-auto shrink-0">{c.waiting && c.last ? <WaitChip since={Date.parse(c.last.at)} /> : <span className="text-[11px] text-muted">{when(c.last?.at)}</span>}</span>
        </span>
        <span className={cn("block truncate text-[13px]", c.fresh ? "font-semibold text-fg" : "text-muted")}>
          {c.last ? (read ? "✓ Vous : " : "") + (c.last.text || (c.last.media ? "📷 Média" : "")) : ""}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {creator ? (
            <Pill>
              {creator.name} <PlatformBadge c={creator} className="ml-0.5" />
            </Pill>
          ) : null}
          {watchers.length ? <Pill tone="info">👀 {watchers.map((w) => w.name).join(", ")}</Pill> : null}
          {c.relance ? (
            <Pill tone="warn" title={c.relance.script ? `Script : ${c.relance.script}` : undefined}>
              {usd(c.relance.price, 0)} non payé · {when(new Date(c.relance.at).toISOString())}
            </Pill>
          ) : null}
          {c.box ? <Pill tone="info">{c.box}</Pill> : null}
          {c.handoff ? <Pill tone="warn">à reprendre</Pill> : null}
          {!c.ai ? <Pill>IA off</Pill> : null}
          {c.tags.slice(0, 3).map((t) => (
            <Pill key={t} tone="accent">
              {t}
            </Pill>
          ))}
        </span>
      </span>
    </button>
  );
}

/** Chrono d'attente à la seconde (vert < 5 min, orange < 15 min, rouge au-delà). */
function WaitChip({ since }: { since: number }) {
  const now = useNow();
  const ms = Math.max(0, now - since);
  const tone = waitTone(ms);
  return (
    <span
      title="Temps d’attente du fan"
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
        tone === "good" ? "bg-emerald-500/15 text-emerald-300" : tone === "warn" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300",
      )}
    >
      {durSec(ms)}
    </span>
  );
}

const KIND: Record<string, string> = { ppv: "🔓 PPV", tip: "💸 Pourboire", sub: "⭐ Abonnement", post: "🖼️ Post" };
/** Cloche : dernières ventes, pourboires et abonnements ; clic = ouvrir la conversation. */
function Notifs({ scope, byId, onOpen }: { scope: string; byId: Map<string, Creator>; onOpen: (creatorId: string, fanId: string) => void }) {
  const [list, setList] = useState<RevenueSale[] | null>(null);
  const [kind, setKind] = useState("");
  useEffect(() => {
    api<RevenueSale[]>("GET", "/api/notifs?scope=" + encodeURIComponent(scope))
      .then(setList)
      .catch(() => setList([]));
  }, [scope]);
  const shown = (list ?? []).filter((s) => !kind || s.type === kind);
  return (
    <div className="max-h-[45%] shrink-0 overflow-y-auto border-b bg-card">
      <div className="sticky top-0 flex gap-1 border-b bg-card px-3 py-2">
        {(
          [
            ["", "Tout"],
            ["ppv", "Ventes"],
            ["tip", "Pourboires"],
            ["sub", "Abonnements"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", kind === k ? "bg-petal text-primary-soft" : "text-muted hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>
      {shown.map((s) => {
        const cr = byId.get(s.creatorId);
        return (
          <button key={s.id} disabled={!s.fanId} onClick={() => s.fanId && onOpen(s.creatorId, s.fanId)} className="flex w-full items-center gap-2 border-b border-line/50 px-3 py-2 text-left text-xs hover:bg-card-2 disabled:cursor-default">
            <span className="w-24 shrink-0 font-semibold">{KIND[s.type] ?? s.type}</span>
            <span className="min-w-0 flex-1 truncate">
              {s.fan || "Fan"} {cr ? <span className="text-muted">· {cr.name}</span> : null} {s.by ? <span className="text-muted">· {s.by}</span> : null}
            </span>
            <b className="tabular-nums">{moneyC(s.net, s.currency, 0)}</b>
            <span className="w-12 shrink-0 text-right text-muted">{when(s.at)}</span>
          </button>
        );
      })}
      {list && !shown.length ? <p className="p-4 text-center text-xs text-muted">Rien sur les 2 derniers jours</p> : null}
      {!list ? <p className="p-4 text-center text-xs text-muted">Chargement…</p> : null}
    </div>
  );
}

