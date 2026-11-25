"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Flame, Lock, MessageCircle, Pin, Search, Sparkles, UserRound, X } from "lucide-react";
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

// Bloom v2 : LA messagerie, la même pour OnlyFans et MYM (25/11/2026). Trois colonnes : conversations, fil, fiche du
// fan. Même moteur que les messageries actuelles (« /api/rv/… ») : rien ne change côté serveur.
type Me = { id: number; name: string; admin: boolean };
type Boot = { me: Me; models: Model[] };
type Totals = QueueResp["totals"] & { ai?: number; noai?: number };
type Row = QueueResp["items"][number] & { aiEver?: boolean; sub?: boolean; groups?: { name: string; color: string | null }[] };
type Tab = "reply" | "all" | "unread" | "online" | "handoff" | "noai" | "ai" | "pinned";
const SORTS = [["newest", "Les plus récentes d’abord"], ["oldest", "Celles qui attendent depuis le plus longtemps"], ["spent", "Les plus gros acheteurs d’abord"]] as const;
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
  // Les temps d'attente de la liste avancent tout seuls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
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
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <h1 className="text-[19px] leading-tight font-bold tracking-[-0.02em]">Messagerie</h1>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted"><span className="v2-live" />{T.reply ? `${T.reply} fan${T.reply > 1 ? "s" : ""} à répondre` : "Tout le monde a sa réponse"}</p>
            </div>
            <button onClick={() => setPaying(!paying)} title="Seulement les fans qui ont déjà acheté" className="v2-sq" data-on={paying}><Flame className="size-4" /></button>
            <button onClick={() => setSort(SORTS[(SORTS.findIndex(([k]) => k === sort) + 1) % SORTS.length][0])} title={`Tri : ${sortLabel}. Clique pour changer.`} className="v2-sq" data-on={sort !== "newest"}><ArrowDownUp className="size-4" /></button>
          </div>
          {multi ? (
            <div className="v2-noscroll -mx-4 mt-3 flex gap-1 overflow-x-auto px-4">
              <button onClick={() => setModel("")} className="v2-mtab" data-on={!model} style={{ paddingLeft: 12 }} title="Toutes mes modèles">Toutes</button>
              {models.map((m) => {
                const n = data?.counts?.[m.id] || 0;
                return (
                  <button key={m.id} onClick={() => setModel(m.id)} className="v2-mtab" data-on={model === m.id} title={`${m.displayName}${n ? ` · ${n} à répondre` : ""}`}>
                    <Avatar src={m.avatar} name={m.displayName} size="size-6" />
                    {m.displayName}
                    {n ? <span className="v2-badge" style={{ minWidth: 18, height: 18, fontSize: 10, padding: "0 5px" }}>{n > 99 ? "99+" : n}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border px-3 text-[13px] transition focus-within:border-(--v2-blue)" style={{ borderColor: "var(--color-line)", background: "var(--color-card)" }}>
            <Search className="size-4 shrink-0 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un fan…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70" />
            {q ? <button onClick={() => setQ("")} aria-label="Effacer la recherche" className="text-muted hover:text-fg"><X className="size-3.5" /></button> : null}
          </label>
          <div className="v2-noscroll -mx-4 mt-2.5 flex gap-1 overflow-x-auto border-b px-4 pb-2.5" style={{ borderColor: "var(--color-line)" }}>
            {TABS.filter((t) => t.k !== "pinned" || t.n).map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)} title={t.title} className="v2-chip" data-on={tab === t.k}>
                {t.label}
                {t.n ? <b>{t.n > 999 ? "999+" : t.n}</b> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="v2-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {!data ? <p className="p-8 text-center text-[12.5px] text-muted">Chargement…</p> : null}
          {data && !items.length ? (
            <div className="px-6 py-12 text-center">
              <span className="v2-ico mx-auto size-11" data-c="plain" style={{ borderRadius: 13 }}><MessageCircle className="size-5" /></span>
              <p className="mt-3 text-[13.5px] font-semibold">{tab === "reply" ? "Tout le monde a sa réponse" : "Aucune conversation ici"}</p>
              <p className="mt-1 text-[12.5px] text-muted">{q ? "Aucun fan ne correspond à cette recherche." : tab === "reply" ? "Personne n’attend en ce moment." : "Essaie un autre filtre."}</p>
            </div>
          ) : null}
          {items.map((c) => {
            const on = c.id === currentId;
            const byAi = !!c.ai && !c.handoff;
            const isNew = !!c.subscribedAt && Date.now() - Date.parse(c.subscribedAt) < 3 * 864e5;
            const online = !!c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 10 * 60_000;
            const taken = c.lock && c.lock.userId !== me.id ? c.lock.name : null;
            const writing = aiWriting.has(c.id);
            // Comme dans Raven : le temps d'attente du fan, vert puis orange puis rouge.
            const wait = c.needsReply && c.waitingSince ? Math.max(0, now - Date.parse(c.waitingSince)) : null;
            return (
              <button key={c.id} onClick={() => open(c)} className="v2-conv" data-on={on}>
                <span className="relative size-11 shrink-0 self-start">
                  <Avatar src={c.memberAvatar} name={c.nickname || c.memberName} size="size-11" />
                  {online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2" style={{ background: "#34d399", borderColor: "#08080a" }} title="En ligne : le fan vient d’écrire" /> : null}
                  {c.pinned ? <span className="absolute -top-1 -left-1 grid size-4 place-items-center rounded-full text-white" style={{ background: "var(--v2-blue-strong)" }}><Pin className="size-2.5" /></span> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ fontWeight: c.fresh ? 700 : 600 }}>{c.nickname || c.memberName || "Fan"}</span>
                    {wait !== null ? <span className="v2-wait" data-tone={waitTone(wait)} title="Temps depuis lequel le fan attend une réponse">{waitShort(wait)}</span> : <span className="v2-num shrink-0 text-[11px] text-muted">{when(c.lastMessageAt)}</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: c.fresh ? "var(--color-fg)" : "var(--color-muted)", fontWeight: c.fresh ? 500 : 400 }}>
                      {writing ? <span className="font-semibold" style={{ color: "var(--v2-sky)" }}>L’IA écrit…</span> : <>{c.lastFromFan ? "" : "Toi : "}{c.preview || "Média"}</>}
                    </span>
                    {c.fresh ? <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--v2-blue)" }} /> : null}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1">
                    {c.totalSpent > 0 ? <span className="v2-tag v2-num" style={{ color: "var(--v2-up)", background: "rgb(16 185 129 / 0.12)" }}>{money(c.totalSpent, 0, curOf(c.modelId))}</span> : null}
                    {byAi ? <span className="v2-tag" style={{ color: "var(--v2-sky)", background: "rgb(59 130 246 / 0.14)" }} title="L’IA mène cette conversation"><Sparkles className="size-2.5" />IA</span> : null}
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
              <span className="v2-ico mx-auto size-12" data-c="plain" style={{ borderRadius: 14 }}><MessageCircle className="size-5" /></span>
              <p className="mt-4 text-[18px] font-bold tracking-[-0.02em]">Choisis un fan</p>
              <p className="mx-auto mt-1.5 max-w-[330px] text-[13px] text-muted">{T.reply ? `${T.reply} fan${T.reply > 1 ? "s attendent" : " attend"} une réponse. Prends celui qui attend depuis le plus longtemps, ou choisis dans la liste.` : "Tout le monde a sa réponse. Les nouveaux messages arrivent ici tout seuls."}</p>
              {T.reply ? <button onClick={() => (tab === "reply" ? next() : setTab("reply"))} className="v2-btn mx-auto mt-5">{tab === "reply" ? "Prendre le suivant" : "Voir qui attend"}</button> : null}
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
