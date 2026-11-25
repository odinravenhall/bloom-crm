"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, Lock, MessageCircle, Pin, Search, SlidersHorizontal, Sparkles, UserRound, X } from "lucide-react";
import { api, toast } from "@/rv/lib/client";
import { debounce, onLive, useAiWriting } from "@/rv/lib/liveClient";
import { pollMs } from "@/rv/lib/perf";
import { curOf, money, setCurrentModel, setModelCurrencies, waitTone } from "@/rv/lib/fmt";
import { Avatar } from "@/rv/components/ui";
import { Toaster } from "@/rv/components/Toaster";
import { FanPanel } from "@/rv/inbox/FanPanel";
import { AI_EVENT } from "@/rv/inbox/SubstyCard";
import { MymFanPanel } from "@/app/app/mym/MymFanPanel";
import { getPf } from "@/lib/platform";
import type { Conv, Model, QueueResp } from "@/rv/inbox/types";
import { V2Thread } from "./V2Thread";

// Bloom v2 : LA messagerie, la même pour OnlyFans et MYM, dans le style « Constellation » (25/11/2026).
// Quatre colonnes : les modèles, les conversations, le fil, la fiche du fan. Moteur : « /api/rv/… ».
//  - Une seule liste « À traiter » : les fans qui attendent une réponse, puis les conversations non lues déjà répondues
//    (demande de l'agence : « à répondre » et « non lus » au même endroit).
//  - La colonne des modèles tient avec beaucoup de modèles (elle défile) ; un clic droit sur « Tout » permet de choisir
//    celles qu'on affiche ou qu'on cache (gardé par personne, côté serveur : `rv_hidden`).
type Me = { id: number; name: string; admin: boolean };
type Boot = { me: Me; models: Model[]; hidden?: string[] };
type Totals = QueueResp["totals"] & { ai?: number; noai?: number; todo?: number };
type Row = QueueResp["items"][number] & { sub?: boolean; groups?: { name: string; color: string | null }[]; unreadOnly?: boolean };
type Resp = QueueResp & { todoCounts?: Record<string, number>; allTodo?: number };
type Tab = "todo" | "all" | "online" | "handoff" | "noai" | "ai" | "pinned";
const TABS: Tab[] = ["todo", "all", "online", "handoff", "noai", "ai", "pinned"];
const SORTS = [["oldest", "Anciens d’abord", "Ceux qui attendent depuis le plus longtemps en premier"], ["newest", "Récents d’abord", "Les derniers messages en premier"], ["spent", "Gros acheteurs", "Les fans qui ont le plus dépensé en premier"]] as const;
/** Temps d'attente court : « 40 s », « 12 min », « 2 h 05 », « 3 j ». */
const waitShort = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.floor(ms / 1000))} s` : ms < 3600_000 ? `${Math.floor(ms / 60_000)} min` : ms < 86400_000 ? `${Math.floor(ms / 3600_000)} h ${String(Math.floor((ms % 3600_000) / 60_000)).padStart(2, "0")}` : `${Math.floor(ms / 86400_000)} j`);
const stored = <T,>(k: string, d: T): T => {
  try {
    const s = localStorage.getItem("bloom.v2.chat." + k);
    return s === null ? d : (JSON.parse(s) as T);
  } catch {
    return d;
  }
};
const keep = (k: string, v: unknown) => {
  try {
    localStorage.setItem("bloom.v2.chat." + k, JSON.stringify(v));
  } catch {}
};
/** « à l'instant », « 4 min », « 3 h », « hier », « 12 nov. » */
const when = (iso: string | null) => {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return "à l’instant";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)} h`;
  if (ms < 2 * 86400_000) return "hier";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

export function V2Messaging() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [err, setErr] = useState("");
  const [pf] = useState(() => getPf());
  useEffect(() => {
    api<Boot>("GET", "/api/boot").then((b) => setBoot({ ...b, models: b.models.filter((m) => /mym/i.test(m.platform || "") === (pf === "mym")) })).catch((e) => setErr((e as Error).message));
  }, [pf]);
  if (!boot) return <div className="grid h-full place-items-center text-[13px] text-muted">{err || "Chargement de la messagerie…"}</div>;
  if (!boot.models.length)
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="v2-card v2-rise max-w-md p-8">
          <b className="text-[17px]">Aucune modèle {pf === "mym" ? "MYM" : "OnlyFans"} pour toi</b>
          <p className="mt-2 text-[13.5px] text-muted">{pf === "mym" ? "Aucun compte MYM ne t’a été donné, ou aucun n’est relié à Bloom." : "Aucune modèle OnlyFans ne t’a été donnée."} Demande à ton team leader, ou change de plateforme en haut du menu.</p>
        </div>
      </div>
    );
  return <Inner me={boot.me} models={boot.models} hidden0={boot.hidden ?? []} mym={pf === "mym"} />;
}

function Inner({ me, models, hidden0, mym }: { me: Me; models: Model[]; hidden0: string[]; mym: boolean }) {
  const aiWriting = useAiWriting();
  const root = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState(() => {
    const m = stored("model." + (mym ? "mym" : "of"), "");
    return models.some((x) => x.id === m) && !hidden0.includes(m) ? m : "";
  });
  const [tab, setTab] = useState<Tab>(() => {
    const t = stored<Tab>("view", "todo");
    return TABS.includes(t) ? t : "todo";
  });
  const [sort, setSort] = useState<string>(() => stored("order", "oldest"));
  const [paying, setPaying] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [hidden, setHidden] = useState<string[]>(hidden0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [held, setHeld] = useState<Conv | null>(null);
  const [panel, setPanel] = useState(() => stored("panel", true));
  // Menu « modèles affichées » (clic droit sur « Tout ») : sa position dans la messagerie ; menu des filtres de la liste.
  const [pickAt, setPickAt] = useState<{ x: number; y: number } | null>(null);
  const [filters, setFilters] = useState(false);
  const seq = useRef(0);
  // Les temps d'attente de la liste avancent tout seuls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const byId = useMemo(() => Object.fromEntries(models.map((m) => [m.id, m])), [models]);
  setModelCurrencies(models);
  useEffect(() => (keep("model." + (mym ? "mym" : "of"), model), keep("view", tab), keep("order", sort), keep("panel", panel)), [model, tab, sort, panel, mym]);

  const load = useCallback(async () => {
    const s = ++seq.current;
    const p = new URLSearchParams({ tab, sort, window: tab === "todo" ? "72" : "0" });
    if (model) p.set("model", model);
    if (q.trim()) p.set("q", q.trim());
    if (paying) p.set("paying", "1");
    try {
      const r = await api<Resp>("GET", "/api/inbox?" + p);
      if (s !== seq.current) return;
      setData(r);
      if (Array.isArray(r.hidden)) setHidden(r.hidden);
    } catch {}
  }, [tab, sort, model, q, paying]);
  useEffect(() => {
    load();
    const later = debounce(load, 400);
    const a = onLive("conv", () => later());
    const b = onLive("open", () => later());
    const t = setInterval(() => document.visibilityState === "visible" && load(), pollMs(20_000));
    return () => (a(), b(), clearInterval(t));
  }, [load]);
  useEffect(() => {
    if (!pickAt && !filters) return;
    const close = (e: MouseEvent) => !(e.target as Element).closest?.("[data-pop]") && (setPickAt(null), setFilters(false));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setPickAt(null), setFilters(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", close), document.removeEventListener("keydown", esc));
  }, [pickAt, filters]);

  // Seulement les modèles de la plateforme choisie.
  const items = useMemo(() => ((data?.items ?? []) as Row[]).filter((c) => byId[c.modelId]), [data, byId]);
  const fromList = items.find((c) => c.id === currentId) ?? null;
  useEffect(() => {
    if (fromList) setHeld(fromList);
  }, [fromList]);
  const current = fromList ?? (held?.id === currentId ? held : null);
  setCurrentModel(current?.modelId);
  const open = (c: Conv) => {
    if (currentId && currentId !== c.id) api("POST", `/api/conversations/${currentId}/action`, { action: "unlock" }).catch(() => {});
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === c.id ? { ...x, fresh: false } : x)) } : d));
    setHeld(c);
    setCurrentId(c.id);
  };
  const close = () => {
    if (currentId) api("POST", `/api/conversations/${currentId}/action`, { action: "unlock" }).catch(() => {});
    setCurrentId(null);
  };
  // « ?c=<modèle>~<fan> » dans l'adresse (lien de l'écran Fans) : on ouvre cette conversation, une seule fois.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("c");
    if (!id) return;
    window.history.replaceState(null, "", window.location.pathname);
    api<{ conversation: Conv }>("GET", `/api/conversations/${encodeURIComponent(id)}`)
      .then((r) => (byId[r.conversation.modelId] ? (setHeld(r.conversation), setCurrentId(r.conversation.id)) : toast("Cette conversation est sur l’autre plateforme : change de plateforme en haut du menu.", "err")))
      .catch((e) => toast((e as Error).message, "err"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const next = () => {
    const i = current ? items.findIndex((c) => c.id === current.id) : -1;
    const n = items.slice(i + 1).find((c) => c.needsReply) ?? items.find((c) => c.needsReply && c.id !== current?.id);
    if (n) open(n);
    else toast("Plus personne n’attend de réponse dans cette liste");
  };
  const togglePin = async (c: Conv) => {
    try {
      const r = await api<{ pinned: boolean; ai?: boolean }>("POST", `/api/conversations/${c.id}/action`, { action: "pin", pin: !c.pinned });
      if (typeof r.ai === "boolean") window.dispatchEvent(new CustomEvent(AI_EVENT, { detail: { id: c.id, on: r.ai } }));
      toast(r.pinned ? (r.ai === false ? "Fan épinglé : l’IA est coupée sur lui" : "Fan épinglé") : r.ai ? "Fan désépinglé : l’IA le reprend" : "Fan désépinglé");
      setHeld((h) => (h && h.id === c.id ? { ...h, pinned: r.pinned } : h));
    } catch (e) {
      toast((e as Error).message, "err");
    }
    load();
  };
  const toggleUnread = async (c: Conv) => {
    try {
      await api("POST", `/api/conversations/${c.id}/action`, { action: c.fresh ? "read" : "unread" });
    } catch (e) {
      toast((e as Error).message, "err");
    }
    load();
  };
  /** Afficher ou cacher une modèle dans la colonne (et dans « Tout ») : réglage de la personne, gardé côté serveur. */
  const saveHidden = async (next: string[]) => {
    setHidden(next);
    if (model && next.includes(model)) setModel("");
    try {
      await api("PUT", "/api/me", { hiddenModels: next });
    } catch (e) {
      toast((e as Error).message, "err");
    }
    load();
  };
  const openPicker = (clientX: number, clientY: number) => {
    const r = root.current?.getBoundingClientRect();
    const h = Math.min(480, 96 + models.length * 38);
    setFilters(false);
    setPickAt({ x: Math.max(8, clientX - (r?.left ?? 0)), y: Math.max(8, Math.min(clientY - (r?.top ?? 0), (r?.height ?? 600) - h - 8)) });
  };

  const T = (data?.totals ?? { reply: 0, unread: 0, all: 0 }) as Totals;
  const todoOf = (id: string) => data?.todoCounts?.[id] ?? 0;
  // La colonne : d'abord les modèles où des fans attendent (les plus chargées en haut), puis les autres par nom.
  const rail = useMemo(() => models.filter((m) => !hidden.includes(m.id)).sort((a, b) => (data?.todoCounts?.[b.id] ?? 0) - (data?.todoCounts?.[a.id] ?? 0) || a.displayName.localeCompare(b.displayName, "fr")), [models, hidden, data]);
  const allTodo = data?.allTodo ?? rail.reduce((a, m) => a + todoOf(m.id), 0);
  const multi = models.length > 1;
  const sortInfo = SORTS.find(([k]) => k === sort) ?? SORTS[0];
  const EXTRA: { k: Tab; label: string; n?: number; title: string }[] = [
    { k: "online", label: "En ligne", n: T.online, title: "Le fan a écrit il y a moins de 10 minutes" },
    { k: "handoff", label: "À reprendre", n: T.handoff, title: "L’IA a passé la main à l’équipe (ou fan sans IA) et le fan attend" },
    { k: "noai", label: "Sans IA", n: T.noai, title: "Conversations que l’IA ne mène pas" },
    { k: "ai", label: "IA", n: T.ai, title: "Conversations menées par l’IA" },
    { k: "pinned", label: "Épinglés", n: T.pinned, title: "Fans épinglés par l’équipe" },
  ];
  const extra = EXTRA.find((x) => x.k === tab);
  const todo = T.todo ?? 0;
  const waitRows = tab === "todo" ? items.filter((c) => c.needsReply) : [];
  const readRows = tab === "todo" ? items.filter((c) => !c.needsReply) : [];

  const row = (c: Row) => {
    const on = c.id === currentId;
    const byAi = !!c.ai && !c.handoff;
    const isNew = !!c.subscribedAt && Date.now() - Date.parse(c.subscribedAt) < 3 * 864e5;
    const online = !!c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 10 * 60_000;
    const taken = c.lock && c.lock.userId !== me.id ? c.lock.name : null;
    const writing = aiWriting.has(c.id);
    const dot = c.fresh || !!c.unreadOnly;
    // Comme dans Raven : le temps d'attente du fan, vert puis orange puis rouge.
    const wait = c.needsReply && c.waitingSince ? Math.max(0, now - Date.parse(c.waitingSince)) : null;
    return (
      <button key={c.id} onClick={() => open(c)} className="v2-conv" data-on={on}>
        <span className="relative size-[38px] shrink-0 self-start">
          <Avatar src={c.memberAvatar} name={c.nickname || c.memberName} size="size-[38px]" />
          {online ? <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2" style={{ background: "#34d399", borderColor: "#08080a" }} title="En ligne : le fan vient d’écrire" /> : null}
          {c.pinned ? <span className="absolute -top-1 -left-1 grid size-4 place-items-center rounded-full text-white" style={{ background: "var(--v2-blue)" }}><Pin className="size-2.5" /></span> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px]" style={{ fontWeight: dot ? 700 : 600 }}>{c.nickname || c.memberName || "Fan"}</span>
            {wait !== null ? <span className="v2-wait" data-tone={waitTone(wait)} title="Temps depuis lequel le fan attend une réponse">{waitShort(wait)}</span> : <span className="v2-num shrink-0 text-[11px] text-muted">{when(c.lastMessageAt)}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: dot && c.needsReply ? "var(--color-fg)" : "var(--color-muted)", fontWeight: dot && c.needsReply ? 500 : 400 }}>
              {writing ? <span className="font-semibold" style={{ color: "var(--v2-sky)" }}>L’IA écrit…</span> : <>{c.lastFromFan ? "" : "Toi : "}{c.preview || "Média"}</>}
            </span>
            {dot ? <span className="size-[7px] shrink-0 rounded-full" style={{ background: "var(--v2-blue)" }} /> : null}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {c.totalSpent > 0 ? <span className="v2-tag v2-num" style={{ color: "var(--v2-up)", background: "rgb(16 185 129 / 0.12)" }}>{money(c.totalSpent, 0, curOf(c.modelId))}</span> : null}
            {byAi ? <span className="v2-tag" style={{ color: "var(--v2-sky)", background: "rgb(59 130 246 / 0.16)" }} title="L’IA mène cette conversation"><Sparkles className="size-2.5" />IA</span> : null}
            {c.handoff ? <span className="v2-tag" style={{ color: "#c4b5fd", background: "rgb(139 92 246 / 0.16)" }} title="L’IA a passé la main à l’équipe">À reprendre</span> : null}
            {taken ? <span className="v2-tag" style={{ color: "#fcd34d", background: "rgb(245 158 11 / 0.14)" }} title={`${taken} est sur cette conversation`}><Lock className="size-2.5" />{taken}</span> : c.pinnedBy ? <span className="v2-tag" title={`Épinglé par ${c.pinnedBy.name}`}><UserRound className="size-2.5" />{c.pinnedBy.name}</span> : null}
            {isNew ? <span className="v2-tag" style={{ color: "#fff", background: "var(--v2-blue-strong)" }}>Nouveau</span> : null}
            {c.sub === false ? <span className="v2-tag" title="Ce fan n’est pas abonné">Non abonné</span> : null}
            {(c.groups ?? []).slice(0, 2).map((g) => <span key={g.name} className="v2-tag max-w-[110px] truncate" style={g.color ? { color: g.color, background: `${g.color}26` } : undefined} title={`Groupe : ${g.name}`}>{g.name}</span>)}
            {c.box ? <span className="v2-tag">Boîte {c.box}</span> : null}
            {!model && multi ? <span className="v2-tag">{byId[c.modelId]?.displayName}</span> : null}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div ref={root} className="relative flex h-full min-h-0">
      <Toaster />
      {/* Colonne 1 : les modèles */}
      {multi ? (
        <aside className={`v2-rail v2-noscroll ${current ? "hidden md:flex" : ""}`}>
          <button onClick={() => setModel("")} onContextMenu={(e) => (e.preventDefault(), openPicker(e.clientX, e.clientY))} className="v2-rail-all" data-on={!model} title="Toutes mes modèles. Clic droit : choisir celles qu’on affiche ou qu’on cache.">
            Tout{allTodo ? <span className="v2-rail-badge">{allTodo > 99 ? "99+" : allTodo}</span> : null}
          </button>
          {rail.map((m) => {
            const n = todoOf(m.id);
            return (
              <button key={m.id} onClick={() => setModel(m.id)} className="v2-rail-item" data-on={model === m.id} data-idle={!n} title={`${m.displayName}${n ? ` · ${n} à traiter` : " · rien à traiter"}`}>
                <span className="v2-rail-av"><Avatar src={m.avatar} name={m.displayName} size="size-[34px]" /></span>
                {n ? <span className="v2-rail-badge">{n > 99 ? "99+" : n}</span> : null}
                <span className="v2-rail-name">{m.displayName}</span>
              </button>
            );
          })}
          <span className="flex-1" />
          <button data-pop onClick={(e) => (pickAt ? setPickAt(null) : openPicker(e.clientX, e.clientY - 200))} className="v2-rail-item" style={{ padding: "7px 0" }} title="Choisir les modèles affichées (ou clic droit sur « Tout »)">
            <Eye className="size-4" />{hidden.filter((id) => byId[id]).length ? <span className="v2-rail-name">{hidden.filter((id) => byId[id]).length} cachée{hidden.filter((id) => byId[id]).length > 1 ? "s" : ""}</span> : null}
          </button>
        </aside>
      ) : null}
      {pickAt ? (
        <div data-pop className="v2-menu v2-scroll max-h-[480px] w-[264px] overflow-y-auto" role="menu" aria-label="Modèles affichées" style={{ left: pickAt.x, top: pickAt.y }}>
          <p className="v2-menu-label">Modèles affichées</p>
          {models.map((m) => {
            const shown = !hidden.includes(m.id);
            return (
              <button key={m.id} role="menuitemcheckbox" aria-checked={shown} onClick={() => saveHidden(shown ? [...hidden, m.id] : hidden.filter((x) => x !== m.id))} className="v2-menu-item">
                <span className="v2-check" data-on={shown}>{shown ? <Check className="size-3" /> : null}</span>
                <Avatar src={m.avatar} name={m.displayName} size="size-6" />
                <span className="min-w-0 flex-1 truncate" style={shown ? undefined : { color: "var(--color-muted)" }}>{m.displayName}</span>
                {todoOf(m.id) ? <span className="v2-badge">{todoOf(m.id)}</span> : null}
              </button>
            );
          })}
          <div className="mt-1 flex items-center gap-2 border-t px-2 pt-2 pb-1" style={{ borderColor: "var(--color-line)" }}>
            <span className="min-w-0 flex-1 text-[11.5px] text-muted">Une modèle cachée sort de la colonne et de « Tout ».</span>
            {hidden.some((id) => byId[id]) ? <button onClick={() => saveHidden(hidden.filter((id) => !byId[id]))} className="shrink-0 text-[12px] font-semibold" style={{ color: "var(--v2-sky)" }}>Tout afficher</button> : null}
          </div>
        </div>
      ) : null}

      {/* Colonne 2 : conversations */}
      <section className={`flex min-h-0 min-w-0 flex-1 shrink-0 flex-col border-r md:w-[304px] md:flex-none ${current ? "hidden md:flex" : ""}`} style={{ borderColor: "var(--color-line)", background: "rgb(11 11 13 / 0.55)" }}>
        <div className="shrink-0 px-3.5 pt-3.5">
          <div className="relative flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-[17px] leading-tight font-bold tracking-[-0.02em]">{model ? byId[model]?.displayName ?? "Messagerie" : "Messagerie"}</h1>
              <p className="mt-0.5 text-[11.5px] text-muted">{(model ? todoOf(model) : allTodo) ? `${model ? todoOf(model) : allTodo} conversation${(model ? todoOf(model) : allTodo) > 1 ? "s" : ""} à traiter` : "Rien à traiter"}</p>
            </div>
            <button data-pop onClick={() => (setPickAt(null), setFilters(!filters))} title="Filtres et tri" aria-haspopup="menu" aria-expanded={filters} className="v2-sq" data-on={filters || paying} style={{ width: 32, height: 32 }}><SlidersHorizontal className="size-[15px]" /></button>
            {filters ? (
              <div data-pop className="v2-menu w-[236px]" role="menu" style={{ right: 0, top: 38 }}>
                <p className="v2-menu-label">Afficher seulement</p>
                {EXTRA.map((x) => (
                  <button key={x.k} role="menuitemradio" aria-checked={tab === x.k} title={x.title} onClick={() => (setTab(tab === x.k ? "todo" : x.k), setFilters(false))} className="v2-menu-item" data-on={tab === x.k}>
                    <span className="flex-1">{x.label}</span>{x.n ? <span className="text-[11.5px] text-muted">{x.n}</span> : null}{tab === x.k ? <Check className="size-4" style={{ color: "var(--v2-sky)" }} /> : null}
                  </button>
                ))}
                <button role="menuitemcheckbox" aria-checked={paying} onClick={() => setPaying(!paying)} className="v2-menu-item" title="Seulement les fans qui ont déjà acheté"><span className="v2-check" data-on={paying}>{paying ? <Check className="size-3" /> : null}</span><span className="flex-1">Acheteurs seulement</span></button>
                <p className="v2-menu-label">Tri</p>
                {SORTS.map(([k, label, title]) => (
                  <button key={k} role="menuitemradio" aria-checked={sort === k} title={title} onClick={() => setSort(k)} className="v2-menu-item" data-on={sort === k}><span className="flex-1">{label}</span>{sort === k ? <Check className="size-4" style={{ color: "var(--v2-sky)" }} /> : null}</button>
                ))}
              </div>
            ) : null}
          </div>
          <label className="mt-2.5 flex h-[34px] items-center gap-2 rounded-[10px] border px-2.5 text-[12.5px] transition focus-within:border-(--v2-blue)" style={{ borderColor: "var(--color-line)", background: "var(--color-card)" }}>
            <Search className="size-[15px] shrink-0 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un fan…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70" />
            {q ? <button onClick={() => setQ("")} aria-label="Effacer la recherche" className="text-muted hover:text-fg"><X className="size-3.5" /></button> : null}
          </label>
          <div className="-mx-3.5 mt-2 flex items-center gap-0.5 border-b px-3 pb-2" style={{ borderColor: "var(--color-line)" }}>
            <button onClick={() => setTab("todo")} className="v2-chip" data-on={tab === "todo"} title="Les fans qui attendent une réponse et les conversations non lues, au même endroit">À traiter{todo ? <b>{todo > 999 ? "999+" : todo}</b> : null}</button>
            <button onClick={() => setTab("all")} className="v2-chip" data-on={tab === "all"} title="Toutes les conversations">Toutes</button>
            {extra ? <button onClick={() => setTab("todo")} className="v2-chip" data-on title={`${extra.title}. Cliquer pour revenir à « À traiter ».`}>{extra.label}<X className="size-3" /></button> : null}
            <span className="flex-1" />
            <button onClick={() => setSort(SORTS[(SORTS.findIndex(([k]) => k === sort) + 1) % SORTS.length][0])} title={`${sortInfo[2]}. Cliquer pour changer.`} className="shrink-0 px-1 text-[11.5px] font-medium text-muted transition hover:text-fg">{sortInfo[1]}</button>
          </div>
        </div>
        <div className="v2-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {!data ? <p className="p-8 text-center text-[12.5px] text-muted">Chargement…</p> : null}
          {data && !items.length ? (
            <div className="px-6 py-12 text-center">
              <span className="v2-ico mx-auto size-11"><MessageCircle className="size-5" /></span>
              <p className="mt-3 text-[13.5px] font-semibold">{tab === "todo" ? "Rien à traiter" : "Aucune conversation ici"}</p>
              <p className="mt-1 text-[12.5px] text-muted">{q ? "Aucun fan ne correspond à cette recherche." : !rail.length ? "Toutes tes modèles sont cachées : clic droit sur « Tout » pour en afficher." : tab === "todo" ? "Personne n’attend et tout est lu." : "Essaie un autre filtre."}</p>
            </div>
          ) : null}
          {tab === "todo" ? (
            <>
              {waitRows.length ? <p className="v2-group">Attendent une réponse · {T.reply}<i /></p> : null}
              {waitRows.map(row)}
              {readRows.length ? <p className="v2-group" title="Substy les compte encore en non lu et personne de l’équipe ne les a ouvertes, mais l’IA ou quelqu’un a déjà répondu. Les ouvrir les retire d’ici.">Non lus · déjà répondus · {Math.max(readRows.length, todo - T.reply)}<i /></p> : null}
              {readRows.map(row)}
            </>
          ) : items.map(row)}
        </div>
      </section>

      {/* Colonne 3 : le fil */}
      <section className={`min-h-0 min-w-0 flex-1 ${current ? "flex" : "hidden md:flex"}`}>
        {current ? (
          <V2Thread
            key={current.id}
            conv={current}
            me={me}
            model={byId[current.modelId]}
            aiWriting={aiWriting.has(current.id)}
            onBack={close}
            onSent={load}
            onNext={next}
            actions={{ pinned: current.pinned, onPin: () => togglePin(current), fresh: current.fresh, onReadToggle: () => toggleUnread(current), panelOpen: panel, onPanel: () => setPanel(!panel) }}
          />
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div className="v2-rise">
              <span className="v2-ico mx-auto size-12"><MessageCircle className="size-5" /></span>
              <p className="mt-4 text-[18px] font-bold tracking-[-0.02em]">Choisis un fan</p>
              <p className="mx-auto mt-1.5 max-w-[330px] text-[13px] text-muted">{T.reply ? `${T.reply} fan${T.reply > 1 ? "s attendent" : " attend"} une réponse. Prends celui qui attend depuis le plus longtemps, ou choisis dans la liste.` : "Tout le monde a sa réponse. Les nouveaux messages arrivent ici tout seuls."}</p>
              {T.reply ? <button onClick={() => (tab === "todo" ? next() : setTab("todo"))} className="v2-btn mx-auto mt-5">{tab === "todo" ? "Prendre le suivant" : "Voir qui attend"}</button> : null}
            </div>
          </div>
        )}
      </section>

      {/* Colonne 4 : la fiche du fan (celle de la version actuelle pour l'instant) */}
      {current && panel ? (
        <aside className="v2-scroll hidden w-[320px] shrink-0 overflow-y-auto border-l lg:block" style={{ borderColor: "var(--color-line)", background: "rgb(11 11 13 / 0.55)" }}>
          {mym ? <MymFanPanel key={current.id} conv={current} model={byId[current.modelId]} onChanged={load} onPin={() => togglePin(current)} /> : <FanPanel key={current.id} conv={current} model={byId[current.modelId]} onChanged={load} admin={me.admin} />}
        </aside>
      ) : null}
    </div>
  );
}
