"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Clock, Flame, History, Mail, MessageCircle, Minus, Pin, Plus, Reply, Search, Settings, SlidersHorizontal, UserRound, UsersRound, Zap } from "lucide-react";
import { api, toast } from "@/rv/lib/client";
import { debounce, onLive } from "@/rv/lib/liveClient";
import { pollMs } from "@/rv/lib/perf";
import { money, setCurrentModel, setModelCurrencies } from "@/rv/lib/fmt";
import { Avatar } from "@/rv/components/ui";
import { Toaster } from "@/rv/components/Toaster";
import { Chat } from "@/rv/inbox/Chat";
import { FanPanel } from "@/rv/inbox/FanPanel";
import { AI_EVENT } from "@/rv/inbox/SubstyCard";
import type { Conv, Model, QueueResp } from "@/rv/inbox/types";

// MYM → Messages → Chatting : la liste de conversations façon MyPulse (filtres Tous / Sans Substy / À reprendre /
// Substy, En ligne / Non lus / Non rép., réglage des sous-inbox), sur le moteur de la messagerie de Bloom
// (« /api/rv/… »). La conversation et la fiche fan sont pour l'instant celles de la messagerie.
type Me = { id: number; name: string; admin: boolean };
type Boot = { me: Me; models: Model[] };
type Totals = QueueResp["totals"] & { ai?: number; noai?: number };
type Tab = "all" | "noai" | "handoff" | "ai" | "online" | "unread" | "reply" | "pinned";
const BLUE = "#405189";
const SORTS = [["newest", "Les plus récentes d’abord"], ["oldest", "Celles qui attendent depuis le plus longtemps"], ["spent", "Les plus gros acheteurs d’abord"]] as const;
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const stored = <T,>(k: string, d: T): T => {
  try {
    const s = localStorage.getItem("mymchat." + k);
    return s === null ? d : (JSON.parse(s) as T);
  } catch {
    return d;
  }
};
const keep = (k: string, v: unknown) => {
  try {
    localStorage.setItem("mymchat." + k, JSON.stringify(v));
  } catch {}
};

export function MymChat() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Boot>("GET", "/api/boot").then((b) => setBoot({ ...b, models: b.models.filter((m) => /mym/i.test(m.platform || "")) })).catch((e) => setErr((e as Error).message));
  }, []);
  if (!boot) return <p className="mp-font p-8 text-[13px]" style={{ color: "var(--mp-muted)" }}>{err || "Chargement du chatting…"}</p>;
  if (!boot.models.length) return <p className="mp-font p-8 text-[13px]" style={{ color: "var(--mp-muted)" }}>Aucun compte MYM relié à Bloom : relie une modèle dans MYM → Compte Creator → « Ajouter un compte ».</p>;
  return <Inner me={boot.me} models={boot.models} />;
}

function Inner({ me, models }: { me: Me; models: Model[] }) {
  const [model, setModel] = useState(() => {
    const m = stored("model", "");
    return models.some((x) => x.id === m) ? m : models.length === 1 ? models[0].id : "";
  });
  const [tab, setTab] = useState<Tab>(() => stored<Tab>("tab", "all"));
  const [sort, setSort] = useState<string>(() => stored("sort", "newest"));
  const [paying, setPaying] = useState(false);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<QueueResp | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [held, setHeld] = useState<Conv | null>(null);
  const [panel, setPanel] = useState(true);
  const [settings, setSettings] = useState(false);
  const seq = useRef(0);
  const byId = useMemo(() => Object.fromEntries(models.map((m) => [m.id, m])), [models]);
  setModelCurrencies(models);
  useEffect(() => (keep("model", model), keep("tab", tab), keep("sort", sort)), [model, tab, sort]);

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

  // MyPulse ne montre que les comptes MYM : on écarte une conversation d'une autre plateforme si elle arrivait là.
  const items = useMemo(() => (data?.items ?? []).filter((c) => byId[c.modelId]), [data, byId]);
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
  const togglePin = async (c: Conv) => {
    try {
      const r = await api<{ pinned: boolean; ai?: boolean }>("POST", `/api/conversations/${c.id}/action`, { action: "pin", pin: !c.pinned });
      if (typeof r.ai === "boolean") window.dispatchEvent(new CustomEvent(AI_EVENT, { detail: { id: c.id, on: r.ai } }));
      toast(r.pinned ? (r.ai === false ? "Épinglé : Substy est coupé sur ce fan, à toi de jouer" : "Épinglé pour toute l’équipe") : r.ai ? "Désépinglé : Substy reprend le fan" : "Désépinglé");
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
  const chip = "flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold";
  const Chip = ({ k, title, children, tone }: { k: Tab; title: string; children: React.ReactNode; tone: string }) => (
    <button onClick={() => setTab(k)} title={title} className={chip} style={tab === k ? { background: "#e9ecef", color: "#12160c" } : { background: "rgba(255,255,255,.04)", color: tone }}>{children}</button>
  );

  return (
    <div className="mp-font flex h-full min-h-0" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <Toaster />
      {/* Liste des conversations */}
      <section className={`flex min-h-0 w-full shrink-0 flex-col border-r md:w-[300px] ${current ? "hidden md:flex" : ""}`} style={{ borderColor: "var(--mp-line)", background: "var(--mp-card)" }}>
        <div className="space-y-2 p-2">
          {models.length > 1 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} className="h-8 w-full rounded-md px-2 text-[12.5px] outline-none" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>
              <option value="">Tous les comptes MYM</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </select>
          ) : null}
          <div className="relative flex items-center gap-1">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}>
              <Search className="size-3.5 shrink-0" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche par username" className="min-w-0 flex-1 bg-transparent outline-none" />
            </label>
            <button onClick={() => setSort(SORTS[(SORTS.findIndex(([k]) => k === sort) + 1) % SORTS.length][0])} title={`Trier les conversations : ${SORTS.find(([k]) => k === sort)?.[1]}`} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--mp-card-2)", color: sort === "newest" ? undefined : "var(--mp-accent)" }}><Clock className="size-3.5" /></button>
            <button onClick={() => setSettings(!settings)} title="Paramètres du chat" className="grid size-8 place-items-center rounded-md" style={{ background: settings ? BLUE : "var(--mp-card-2)", color: settings ? "#fff" : undefined }}><Settings className="size-3.5" /></button>
            {settings ? <ChatSettings model={model} models={models} info={data?.boxes ?? null} admin={me.admin} onClose={() => setSettings(false)} onChanged={load} /> : null}
          </div>
          <div className="flex flex-wrap gap-1">
            <Chip k="all" title="Toutes les conversations, celles de Substy comprises" tone="var(--mp-head)">Tous</Chip>
            <Chip k="noai" title="Masquer les conversations que l’IA Substy mène. Celles qu’elle a lâchées ou qui sont passées à l’équipe restent." tone="#3cd188"><UsersRound className="size-3.5" />Sans Substy{T.noai ? <span className="opacity-70">{T.noai}</span> : null}</Chip>
            <Chip k="handoff" title="À reprendre : les conversations que Substy a passées à l’équipe (ou sans IA) et qui attendent une réponse" tone="#a78bfa"><UserRound className="size-3.5" />{T.handoff || ""}</Chip>
            <Chip k="ai" title="N’afficher que les conversations menées par l’IA Substy" tone="#6f86d6"><Bot className="size-3.5" />{T.ai ?? ""}</Chip>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Chip k="online" title="En ligne : le fan a écrit il y a moins de 10 minutes" tone="#3cd188"><Zap className="size-3.5" />{T.online ?? 0}</Chip>
            <Chip k="unread" title="Non lus" tone="#6f86d6"><Mail className="size-3.5" />{T.unread}</Chip>
            <Chip k="reply" title="Non répondus : le fan attend une réponse (72 dernières heures)" tone="#f7b84b"><Reply className="size-3.5" />{T.reply}</Chip>
            {T.pinned ? <Chip k="pinned" title="Épinglés" tone="#f06548"><Pin className="size-3.5" />{T.pinned}</Chip> : null}
            <span className="flex-1" />
            <button onClick={() => setMore(!more)} title="Plus de filtres : acheteurs" className={chip} style={{ background: more || paying ? BLUE : "rgba(255,255,255,.04)", color: more || paying ? "#fff" : "var(--mp-head)" }}><SlidersHorizontal className="size-3.5" />Filtres</button>
          </div>
          {more ? (
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setPaying(!paying)} title="Seulement les fans qui ont déjà acheté (PPV, pourboire, média privé…)" className={chip} style={paying ? { background: "#f7b84b", color: "#12160c" } : { background: "rgba(255,255,255,.04)", color: "#f7b84b" }}><Flame className="size-3.5" />Acheteurs</button>
            </div>
          ) : null}
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {!data ? <p className="p-8 text-center text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Chargement…</p> : null}
          {data && !items.length ? <p className="p-8 text-center text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Aucune conversation</p> : null}
          {items.map((c) => {
            const on = c.id === currentId;
            const who = c.ai && !c.handoff ? "Substy IA" : c.lock?.name || c.pinnedBy?.name || null;
            const isNew = !!c.subscribedAt && Date.now() - Date.parse(c.subscribedAt) < 3 * 864e5;
            return (
              <button key={c.id} onClick={(e) => (e.ctrlKey || e.metaKey ? togglePin(c) : open(c))} className="flex w-full gap-2.5 border-b px-2.5 py-2.5 text-left" style={{ borderColor: "var(--mp-line)", background: on ? "rgba(64,81,137,.25)" : undefined, outline: on ? `1px solid ${BLUE}` : undefined }}>
                <span className="relative shrink-0">
                  <Avatar src={c.memberAvatar} name={c.nickname || c.memberName || "?"} size="size-9" />
                  {c.pinned ? <Pin className="absolute -top-1 -left-1 size-3.5 rounded-full p-0.5 text-white" style={{ background: "#f06548" }} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>{c.nickname || c.memberName || "Fan"}</span>
                    {who ? <span className="flex max-w-[90px] shrink-0 items-center gap-1 truncate rounded px-1.5 text-[10px] font-bold" style={{ background: "#3a4047", color: "#e9ecef" }} title={c.ai && !c.handoff ? "Conversation menée par l’IA Substy" : `Prise par ${who}`}>{c.ai && !c.handoff ? <Bot className="size-3" /> : <UserRound className="size-3" />}<span className="truncate">{who}</span></span> : null}
                    <span className="shrink-0 text-[10.5px]" style={{ color: "var(--mp-muted)" }}>{hm(c.lastMessageAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: c.fresh ? "var(--mp-head)" : "var(--mp-muted)", fontWeight: c.fresh ? 600 : 400 }}>{c.lastFromFan ? "" : "Vous : "}{c.preview}</span>
                    {c.fresh ? <span className="size-2 shrink-0 rounded-full" style={{ background: "#2f6bff" }} /> : null}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-[9.5px] font-bold">
                    {isNew ? <span className="rounded px-1.5 py-0.5" style={{ background: "#c7ff4a", color: "#12160c" }}>Nouveau</span> : null}
                    {c.handoff ? <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(167,139,250,.2)", color: "#a78bfa" }}>À reprendre</span> : null}
                    {c.totalSpent > 0 ? <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(247,184,75,.15)", color: "#f7b84b" }}>{money(c.totalSpent, 0)}</span> : null}
                    {c.box ? <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(47,107,255,.2)", color: "#6ea0ff" }}>Inbox {c.box}</span> : null}
                    {!model && models.length > 1 ? <span className="rounded px-1.5 py-0.5" style={{ background: "var(--mp-card-2)", color: "var(--mp-muted)" }}>{byId[c.modelId]?.displayName}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Conversation (celle de la messagerie de Bloom pour l'instant) */}
      <section className={`flex min-h-0 min-w-0 flex-1 flex-col ${current ? "" : "hidden md:flex"}`}>
        <p className="shrink-0 py-1 text-center text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Astuce : <b style={{ color: "var(--mp-head)" }}>Ctrl+clic</b> pour épingler un fan</p>
        {current ? (
          <Chat
            key={current.id}
            conv={current}
            me={me}
            model={byId[current.modelId]}
            autoNext={false}
            setAutoNext={() => {}}
            onBack={() => setCurrentId(null)}
            onSent={() => load()}
            onNext={() => {
              const i = items.findIndex((c) => c.id === current.id);
              const n = items.slice(i + 1).find((c) => c.needsReply) ?? items.find((c) => c.needsReply && c.id !== current.id);
              if (n) open(n);
            }}
            actions={{ pinned: current.pinned, onPin: () => togglePin(current), inTabs: false, onTab: () => {}, fresh: current.fresh, onReadToggle: () => toggleUnread(current), panelOpen: panel, onPanel: () => setPanel(!panel) }}
          />
        ) : (
          <div className="grid flex-1 place-items-center text-center"><div><MessageCircle className="mx-auto size-8" style={{ color: "var(--mp-muted)" }} /><p className="mt-2 text-[13px]" style={{ color: "var(--mp-muted)" }}>Choisis une conversation</p></div></div>
        )}
      </section>
      {current && panel ? (
        <aside className="no-scrollbar hidden w-[290px] shrink-0 overflow-y-auto border-l lg:block" style={{ borderColor: "var(--mp-line)", background: "var(--mp-card)" }}>
          <FanPanel key={current.id} conv={current} model={byId[current.modelId]} onChanged={load} admin={me.admin} onErased={() => (setCurrentId(null), load())} />
        </aside>
      ) : null}
    </div>
  );
}

/** « Paramètres du chat » : mode (un seul flux ou sous-inbox), nombre de sous-inbox, mes sous-inbox, historique. */
function ChatSettings({ model, models, info, admin, onClose, onChanged }: { model: string; models: Model[]; info: QueueResp["boxes"]; admin: boolean; onClose: () => void; onChanged: () => void }) {
  const [count, setCount] = useState(info?.config.enabled ? info.config.count : 3);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ at: number; who: string | null; was: number; now: number }[] | null>(null);
  const [showLog, setShowLog] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => (clearTimeout(t), document.removeEventListener("mousedown", close));
  }, [onClose]);
  useEffect(() => {
    if (info?.config.enabled) setCount(info.config.count);
  }, [info?.config.enabled, info?.config.count]);
  useEffect(() => {
    if (showLog && model) api<{ log: { at: number; who: string | null; was: number; now: number }[] }>("GET", `/api/models/${model}/boxes/log`).then((r) => setLog(r.log)).catch(() => setLog([]));
  }, [showLog, model, info?.config.enabled, info?.config.count]);
  const enabled = !!info?.config.enabled;
  const save = async (on: boolean, n: number) => {
    setBusy(true);
    try {
      await api("PUT", `/api/models/${model}/boxes`, { enabled: on, count: n });
      toast(on ? `Sous-inbox : ${n} boîtes` : "Mode désactivé : un seul flux");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const mine = info?.mine ?? [];
  const toggleMine = async (b: number) => {
    const next = mine.includes(b) ? mine.filter((x) => x !== b) : [...mine, b];
    try {
      await api("POST", `/api/models/${model}/boxes`, { boxes: next });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const label = (n: number) => (n >= 2 ? `inbox ${n}` : "disabled");
  return (
    <div ref={box} className="absolute top-9 right-0 z-30 w-[290px] rounded-lg p-4 text-[12.5px] shadow-2xl" style={{ background: "#262a2f", border: "1px solid var(--mp-line)" }}>
      {!model || !info ? (
        <p style={{ color: "var(--mp-muted)" }}>{models.length > 1 ? "Choisis d’abord un compte MYM en haut de la liste : le mode se règle compte par compte." : "Chargement…"}</p>
      ) : (
        <>
          <p className="text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Mode</p>
          <select disabled={!admin || busy} value={enabled ? "inbox" : "off"} onChange={(e) => save(e.target.value === "inbox", count)} className="mt-2 h-9 w-full rounded-md px-3 outline-none" style={{ background: "#2f343a", color: "var(--mp-head)" }}>
            <option value="off">Désactivé</option>
            <option value="inbox">Sous-inbox (répartition)</option>
            <option value="flag" disabled>Marqueurs (flag) — bientôt</option>
          </select>
          <p className="mt-2 leading-relaxed" style={{ color: "var(--mp-muted)" }}>• <b>Désactivé</b> : un seul flux.<br />• <b>Sous-inbox</b> : répartit les fans à répondre en 2–9 boîtes.<br />• <b>Flag</b> : les chatteurs s’attribuent des fans via marqueurs.</p>
          {enabled ? (
            <>
              <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>Nombre de sous-inbox</p>
              <div className="mt-2 flex items-center gap-2">
                <button disabled={!admin || busy || count <= 2} onClick={() => (setCount(count - 1), save(true, count - 1))} className="grid size-9 place-items-center rounded-md border disabled:opacity-40" style={{ borderColor: "#2f6bff", color: "#6ea0ff" }}><Minus className="size-4" /></button>
                <span className="flex-1 text-center text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>{count}</span>
                <button disabled={!admin || busy || count >= 9} onClick={() => (setCount(count + 1), save(true, count + 1))} className="grid size-9 place-items-center rounded-md border disabled:opacity-40" style={{ borderColor: "#2f6bff", color: "#6ea0ff" }}><Plus className="size-4" /></button>
              </div>
              <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>Mes sous-inbox</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.from({ length: info.config.count }, (_, i) => i + 1).map((b) => (
                  <button key={b} onClick={() => toggleMine(b)} className="h-7 rounded-md px-2.5 font-semibold" style={mine.includes(b) ? { background: "#2f6bff", color: "#fff" } : { background: "#2f343a" }}>Inbox {b}{info.perBox[b] ? ` · ${info.perBox[b]}` : ""}</button>
                ))}
              </div>
              <p className="mt-1.5" style={{ color: "var(--mp-muted)" }}>{mine.length ? "Tu ne vois que les fans à répondre de tes boîtes." : "Aucune cochée : tu vois toutes les boîtes."}</p>
            </>
          ) : null}
          {!admin ? <p className="mt-2" style={{ color: "var(--mp-muted)" }}>Le mode se change par un team leader, un manager ou un admin.</p> : null}
          <div className="mt-3 flex items-center border-t pt-3" style={{ borderColor: "var(--mp-line)" }}>
            <p className="flex flex-1 items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}><History className="size-3.5" /> Historique des changements</p>
            <button onClick={() => setShowLog(!showLog)} className="font-semibold" style={{ color: "var(--mp-head)" }}>{showLog ? "Masquer" : "Voir"}</button>
          </div>
          {showLog ? (
            <div className="no-scrollbar mt-2 max-h-[180px] space-y-2 overflow-y-auto">
              {(log ?? []).map((l) => (
                <div key={l.at}>
                  <p className="flex justify-between text-[11px]" style={{ color: "var(--mp-muted)" }}><span>{new Date(l.at).toLocaleString("fr-FR")}</span><span>{l.who}</span></p>
                  <p style={{ color: "var(--mp-head)" }}>{l.was >= 2 && l.now >= 2 ? "Count" : "Mode"} <code style={{ color: "#f06548" }}>{l.was >= 2 && l.now >= 2 ? l.was : label(l.was)}</code> → <code style={{ color: "#f06548" }}>{l.was >= 2 && l.now >= 2 ? l.now : label(l.now)}</code></p>
                </div>
              ))}
              {log && !log.length ? <p style={{ color: "var(--mp-muted)" }}>Aucun changement enregistré.</p> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
