"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Flame, Lock, MessageCircle, Pin, Search, Sparkles, UserRound, X } from "lucide-react";
import { api, toast } from "@/rv/lib/client";
import { debounce, onLive, useAiWriting } from "@/rv/lib/liveClient";
import { pollMs } from "@/rv/lib/perf";
import { curOf, money, setCurrentModel, setModelCurrencies } from "@/rv/lib/fmt";
import { Avatar } from "@/rv/components/ui";
import { Toaster } from "@/rv/components/Toaster";
import { FanPanel } from "@/rv/inbox/FanPanel";
import { AI_EVENT } from "@/rv/inbox/SubstyCard";
import { MymFanPanel } from "@/app/app/mym/MymFanPanel";
import { getPf } from "@/lib/platform";
import type { Conv, Model, QueueResp } from "@/rv/inbox/types";
import { V2Thread } from "./V2Thread";

// Bloom v2 : LA messagerie, la même pour OnlyFans et MYM (25/11/2026). Trois colonnes : conversations, fil, fiche du
// fan. Même moteur que les messageries actuelles (« /api/rv/… ») : rien ne change côté serveur.
type Me = { id: number; name: string; admin: boolean };
type Boot = { me: Me; models: Model[] };
type Totals = QueueResp["totals"] & { ai?: number; noai?: number };
type Row = QueueResp["items"][number] & { aiEver?: boolean; sub?: boolean; groups?: { name: string; color: string | null }[] };
type Tab = "reply" | "all" | "unread" | "online" | "handoff" | "noai" | "ai" | "pinned";
const SORTS = [["newest", "Les plus récentes d’abord"], ["oldest", "Celles qui attendent depuis le plus longtemps"], ["spent", "Les plus gros acheteurs d’abord"]] as const;
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
  return <Inner me={boot.me} models={boot.models} mym={pf === "mym"} />;
}

function Inner({ me, models, mym }: { me: Me; models: Model[]; mym: boolean }) {
  const aiWriting = useAiWriting();
  const [model, setModel] = useState(() => {
    const m = stored("model." + (mym ? "mym" : "of"), "");
    return models.some((x) => x.id === m) ? m : "";
  });
  const [tab, setTab] = useState<Tab>(() => stored<Tab>("tab", "reply"));
  const [sort, setSort] = useState<string>(() => stored("sort", "newest"));
  const [paying, setPaying] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<QueueResp | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [held, setHeld] = useState<Conv | null>(null);
  const [panel, setPanel] = useState(() => stored("panel", true));
  const seq = useRef(0);
  const byId = useMemo(() => Object.fromEntries(models.map((m) => [m.id, m])), [models]);
  setModelCurrencies(models);
  useEffect(() => (keep("model." + (mym ? "mym" : "of"), model), keep("tab", tab), keep("sort", sort), keep("panel", panel)), [model, tab, sort, panel, mym]);

  const load = useCallback(async () => {
    const s = ++seq.current;
    const p = new URLSearchParams({ tab, sort, window: tab === "reply" ? "72" : "0" });
    if (model) p.set("model", model);
    if (q.trim()) p.set("q", q.trim());
    if (paying) p.set("paying", "1");
    try {
      const r = await api<QueueResp>("GET", "/api/inbox?" + p);
      if (s === seq.current) setData(r);
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

  const T = (data?.totals ?? { reply: 0, unread: 0, all: 0 }) as Totals;
  const TABS: { k: Tab; label: string; n?: number; title: string; hot?: boolean }[] = [
    { k: "reply", label: "À répondre", n: T.reply, title: "Le fan attend une réponse (72 dernières heures)", hot: true },
    { k: "all", label: "Toutes", title: "Toutes les conversations" },
    { k: "unread", label: "Non lus", n: T.unread, title: "Conversations non lues" },
    { k: "online", label: "En ligne", n: T.online, title: "Le fan a écrit il y a moins de 10 minutes" },
    { k: "handoff", label: "À reprendre", n: T.handoff, title: "L’IA a passé la main à l’équipe (ou fan sans IA) et le fan attend" },
    { k: "noai", label: "Sans IA", n: T.noai, title: "Conversations que l’IA ne mène pas" },
    { k: "ai", label: "IA", n: T.ai, title: "Conversations menées par l’IA" },
    { k: "pinned", label: "Épinglés", n: T.pinned, title: "Fans épinglés par l’équipe" },
  ];
  const sortLabel = SORTS.find(([k]) => k === sort)?.[1];
  const multi = models.length > 1;

  return (
    <div className="flex h-full min-h-0">
      <Toaster />
      {/* Colonne 1 : conversations */}
      <section className={`flex min-h-0 w-full shrink-0 flex-col border-r md:w-[348px] ${current ? "hidden md:flex" : ""}`} style={{ borderColor: "var(--color-line)", background: "var(--color-panel)" }}>
        <div className="shrink-0 px-4 pt-4">
          <div className="flex items-center">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Messagerie</h1>
            <span className="flex-1" />
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><span className="v2-live" /> en direct</span>
          </div>
          {multi ? (
            <div className="v2-scroll -mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1">
              <button onClick={() => setModel("")} className="v2-model" data-on={!model} title="Toutes mes modèles">
                <span className="grid size-10 place-items-center rounded-full text-[11px] font-bold" style={{ background: "var(--color-card-2)" }}>Tout</span>
                <span>Toutes</span>
              </button>
              {models.map((m) => {
                const n = data?.counts?.[m.id] || 0;
                return (
                  <button key={m.id} onClick={() => setModel(m.id)} className="v2-model" data-on={model === m.id} title={`${m.displayName}${n ? ` · ${n} à répondre` : ""}`}>
                    <span className="relative">
                      <Avatar src={m.avatar} name={m.displayName} size="size-10" />
                      {n ? <b className="absolute -top-1 -right-1.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] text-white" style={{ background: "var(--v2-blue)", boxShadow: "0 0 0 2px var(--color-bg)" }}>{n > 99 ? "99+" : n}</b> : null}
                    </span>
                    <span>{m.displayName}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-1.5">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 text-[13px] transition focus-within:border-(--v2-blue)" style={{ borderColor: "var(--color-line)", background: "var(--color-card)" }}>
              <Search className="size-4 shrink-0 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un fan" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70" />
              {q ? <button onClick={() => setQ("")} className="text-muted hover:text-fg"><X className="size-3.5" /></button> : null}
            </label>
            <button onClick={() => setPaying(!paying)} title="Seulement les fans qui ont déjà acheté" className="v2-sq" data-on={paying}><Flame className="size-4" /></button>
            <button onClick={() => setSort(SORTS[(SORTS.findIndex(([k]) => k === sort) + 1) % SORTS.length][0])} title={`Tri : ${sortLabel}. Clique pour changer.`} className="v2-sq" data-on={sort !== "newest"}><ArrowDownUp className="size-4" /></button>
          </div>
          <div className="v2-scroll -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-3">
            {TABS.filter((t) => t.k !== "pinned" || t.n).map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)} title={t.title} className="v2-chip" data-on={tab === t.k}>
                {t.label}
                {t.n ? <b data-hot={!!t.hot && tab !== t.k}>{t.n > 999 ? "999+" : t.n}</b> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="v2-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {!data ? <p className="p-8 text-center text-[12.5px] text-muted">Chargement…</p> : null}
          {data && !items.length ? (
            <div className="px-6 py-12 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl" style={{ background: "rgb(59 130 246 / 0.12)", color: "var(--v2-sky)" }}><MessageCircle className="size-5" /></span>
              <p className="mt-3 text-[13.5px] font-semibold">{tab === "reply" ? "Tout le monde a sa réponse" : "Aucune conversation ici"}</p>
              <p className="mt-1 text-[12.5px] text-muted">{q ? "Aucun fan ne correspond à cette recherche." : tab === "reply" ? "Personne n’attend en ce moment." : "Essaie un autre filtre."}</p>
            </div>
          ) : null}
          {items.map((c, i) => {
            const on = c.id === currentId;
            const byAi = !!c.ai && !c.handoff;
            const isNew = !!c.subscribedAt && Date.now() - Date.parse(c.subscribedAt) < 3 * 864e5;
            const online = !!c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 10 * 60_000;
            const taken = c.lock && c.lock.userId !== me.id ? c.lock.name : null;
            const writing = aiWriting.has(c.id);
            return (
              <button key={c.id} onClick={() => open(c)} className="v2-conv" data-on={on} style={i < 14 ? { animationDelay: `${i * 22}ms` } : { animation: "none", opacity: 1 }}>
                <span className="relative shrink-0">
                  <Avatar src={c.memberAvatar} name={c.nickname || c.memberName} size="size-11" />
                  {online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2" style={{ background: "#34d399", borderColor: "var(--color-bg)" }} title="En ligne : le fan vient d’écrire" /> : null}
                  {c.pinned ? <span className="absolute -top-1 -left-1 grid size-4 place-items-center rounded-full text-white" style={{ background: "var(--v2-blue)" }}><Pin className="size-2.5" /></span> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ fontWeight: c.fresh ? 700 : 600 }}>{c.nickname || c.memberName || "Fan"}</span>
                    <span className="shrink-0 text-[11px] tabular-nums" style={{ color: c.needsReply ? "var(--v2-sky)" : "var(--color-muted)" }}>{when(c.lastMessageAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: c.fresh ? "var(--color-fg)" : "var(--color-muted)", fontWeight: c.fresh ? 500 : 400 }}>
                      {writing ? <span className="font-semibold" style={{ color: "var(--v2-sky)" }}>L’IA écrit…</span> : <>{c.lastFromFan ? "" : "Toi : "}{c.preview || "Média"}</>}
                    </span>
                    {c.fresh ? <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--v2-blue)", boxShadow: "0 0 8px rgb(59 130 246 / 0.9)" }} /> : null}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] font-bold">
                    {c.totalSpent > 0 ? <span className="v2-tag" style={{ color: "#34d399", background: "rgb(52 211 153 / 0.12)" }}>{money(c.totalSpent, 0, curOf(c.modelId))}</span> : null}
                    {byAi ? <span className="v2-tag" style={{ color: "var(--v2-sky)", background: "rgb(124 196 255 / 0.12)" }} title="L’IA mène cette conversation"><Sparkles className="size-2.5" />IA</span> : null}
                    {c.handoff ? <span className="v2-tag" style={{ color: "#c4b5fd", background: "rgb(167 139 250 / 0.15)" }} title="L’IA a passé la main à l’équipe">À reprendre</span> : null}
                    {taken ? <span className="v2-tag" style={{ color: "#fbbf24", background: "rgb(251 191 36 / 0.12)" }} title={`${taken} est sur cette conversation`}><Lock className="size-2.5" />{taken}</span> : c.pinnedBy ? <span className="v2-tag" style={{ color: "var(--color-muted)", background: "var(--color-card-2)" }} title={`Épinglé par ${c.pinnedBy.name}`}><UserRound className="size-2.5" />{c.pinnedBy.name}</span> : null}
                    {isNew ? <span className="v2-tag" style={{ color: "#04101f", background: "linear-gradient(90deg, #7cc4ff, #34d399)" }}>Nouveau</span> : null}
                    {c.sub === false ? <span className="v2-tag" style={{ color: "var(--color-muted)", background: "var(--color-card-2)" }} title="Ce fan n’est pas abonné">Non abonné</span> : null}
                    {(c.groups ?? []).slice(0, 2).map((g) => <span key={g.name} className="v2-tag max-w-[110px] truncate" style={{ color: g.color || "var(--v2-sky)", background: g.color ? `${g.color}26` : "rgb(59 130 246 / 0.14)" }} title={`Groupe : ${g.name}`}>{g.name}</span>)}
                    {c.box ? <span className="v2-tag" style={{ color: "var(--color-muted)", background: "var(--color-card-2)" }}>Boîte {c.box}</span> : null}
                    {!model && multi ? <span className="v2-tag" style={{ color: "var(--color-muted)", background: "var(--color-card-2)" }}>{byId[c.modelId]?.displayName}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Colonne 2 : le fil */}
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
              <span className="v2-orb mx-auto grid size-20 place-items-center rounded-full"><MessageCircle className="size-8 text-white" /></span>
              <p className="mt-6 text-[26px] leading-tight font-semibold tracking-[-0.03em]">{T.reply ? <><span className="v2-grad">{T.reply}</span> fan{T.reply > 1 ? "s attendent" : " attend"} une réponse</> : "Tout le monde a sa réponse"}</p>
              <p className="mt-2 text-[13.5px] text-muted">{T.reply ? "Choisis une conversation à gauche, ou prends la suivante." : "Les nouveaux messages arrivent ici tout seuls."}</p>
              {T.reply ? <button onClick={() => (tab === "reply" ? next() : setTab("reply"))} className="v2-send mx-auto mt-6"><span>{tab === "reply" ? "Prendre le suivant" : "Voir qui attend"}</span></button> : null}
            </div>
          </div>
        )}
      </section>

      {/* Colonne 3 : la fiche du fan (celle de la version actuelle pour l'instant) */}
      {current && panel ? (
        <aside className="v2-scroll hidden w-[320px] shrink-0 overflow-y-auto border-l lg:block" style={{ borderColor: "var(--color-line)", background: "var(--color-panel)" }}>
          {mym ? <MymFanPanel key={current.id} conv={current} model={byId[current.modelId]} onChanged={load} onPin={() => togglePin(current)} /> : <FanPanel key={current.id} conv={current} model={byId[current.modelId]} onChanged={load} admin={me.admin} />}
        </aside>
      ) : null}
    </div>
  );
}
