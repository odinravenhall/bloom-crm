"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn, usd, when } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import type { Chat as ChatT, Message } from "@/lib/types";
import { Avatar, Pill, inputCls } from "@/components/ui";
import { Chat } from "./Chat";

export type Filter = "all" | "unread" | "handoff" | "ai_on" | "ai_off";
const FILTERS: [Filter, string][] = [
  ["all", "Tous"],
  ["unread", "Non lus"],
  ["handoff", "À reprendre"],
  ["ai_on", "IA active"],
  ["ai_off", "IA coupée"],
];
/** Événement temps réel relayé par Bloom. */
export type LiveEvent = { creatorId: string; type: string; fanId?: string; message?: Message; data?: { fanId?: string; status?: string } };

/** Messagerie : liste des conversations de la créatrice choisie + conversation ouverte (+ fiche du fan). */
export function Inbox() {
  const params = useSearchParams();
  const { creatorId, setCreator, loaded } = useCreators();
  const [filter, setFilter] = useState<Filter>(() => (FILTERS.some(([f]) => f === params.get("f")) ? (params.get("f") as Filter) : "all"));
  const [q, setQ] = useState("");
  const [chats, setChats] = useState<ChatT[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<ChatT | null>(null);
  const [live, setLive] = useState(false);
  const busy = useRef(false);

  // Lien venu d'une autre page (?c=créatrice&fan=…)
  const wanted = useRef<string | null>(params.get("fan"));
  useEffect(() => {
    const c = params.get("c");
    if (c && loaded) setCreator(c);
  }, [params, loaded, setCreator]);

  const load = useCallback(
    async (reset: boolean) => {
      if (!creatorId || busy.current) return;
      busy.current = true;
      setLoading(true);
      try {
        const p = new URLSearchParams({ creatorId, q });
        if (filter === "unread") p.set("unread", "1");
        if (filter === "handoff") p.set("handoff", "1");
        if (filter === "ai_on") p.set("ai", "enabled");
        if (filter === "ai_off") p.set("ai", "disabled");
        if (!reset && cursor) p.set("cursor", cursor);
        const r = await api<{ items: ChatT[]; nextCursor: string | null }>("GET", "/api/chats?" + p);
        setChats((old) => (reset ? r.items : old.concat(r.items.filter((x) => !old.some((y) => y.fanId === x.fanId)))));
        setCursor(r.nextCursor);
        // Ouvrir la conversation demandée par le lien
        if (wanted.current) {
          const id = wanted.current;
          wanted.current = null;
          setOpen(r.items.find((x) => x.fanId === id) ?? { fanId: id, name: "Fan", username: null, avatar: null, unread: 0, ai: false, handoff: false, spent: 0, subscribed: null, canSend: true, last: null });
        }
      } catch {
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [creatorId, q, filter, cursor],
  );

  // Nouvelle créatrice / filtre / recherche : liste rechargée.
  const prevCreator = useRef<string | null>(null);
  useEffect(() => {
    if (!creatorId) return;
    if (prevCreator.current && prevCreator.current !== creatorId) setOpen(null);
    prevCreator.current = creatorId;
    const t = setTimeout(() => load(true), q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, filter, q]);
  // Filet de sécurité : la liste se rafraîchit toutes les 45 s.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && load(true), 45_000);
    return () => clearInterval(t);
  }, [load]);

  // Temps réel : un seul flux pour toute la messagerie.
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  // Conversation inconnue de la liste : on recharge (seulement sans filtre ni recherche).
  const reloadRef = useRef(() => {});
  reloadRef.current = () => {
    if (filter === "all" && !q) load(true);
  };
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
      if (e.type !== "new_message" || !e.message) return;
      const m = e.message;
      setChats((list) => {
        if (e.creatorId !== prevCreator.current) return list;
        const c = list.find((x) => x.fanId === e.fanId);
        if (!c) {
          setTimeout(() => reloadRef.current(), 300);
          return list;
        }
        const isOpen = openRef.current?.fanId === e.fanId;
        const up: ChatT = { ...c, last: { text: m.text, at: m.at, fromCreator: !m.fromFan, media: m.medias.length }, unread: m.fromFan && !isOpen ? (c.unread || 0) + 1 : isOpen ? 0 : c.unread };
        return [up, ...list.filter((x) => x !== c)];
      });
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (c: ChatT) => {
    setChats((l) => l.map((x) => (x.fanId === c.fanId ? { ...x, unread: 0 } : x)));
    setOpen({ ...c, unread: 0 });
  };
  const patchChat = useCallback((fanId: string, patch: Partial<ChatT>) => {
    setChats((l) => l.map((x) => (x.fanId === fanId ? { ...x, ...patch } : x)));
    setOpen((o) => (o && o.fanId === fanId ? { ...o, ...patch } : o));
  }, []);

  return (
    <div className="flex h-dvh min-h-0 flex-col max-md:h-[calc(100dvh-57px)]">
      <div className="flex flex-wrap items-center gap-3 border-b bg-panel px-4 py-2.5 backdrop-blur-xl">
        <h1 className="text-lg">Messagerie</h1>
        <span className={cn("size-2 rounded-full", live ? "pulse-dot bg-emerald-400" : "bg-amber-400")} title={live ? "Temps réel actif" : "Temps réel : connexion…"} />
        <CreatorTabs className="min-w-0" />
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Liste des conversations */}
        <aside className={cn("flex w-full min-w-0 flex-col border-r bg-panel backdrop-blur-xl md:w-[340px] md:shrink-0", open && "max-md:hidden")}>
          <div className="flex flex-col gap-2 border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input className={cn(inputCls, "pl-9")} placeholder="Rechercher un fan…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {FILTERS.map(([f, l]) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors", filter === f ? "bg-primary text-white" : "bg-card-2 text-muted hover:text-fg")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {chats.map((c) => (
              <button
                key={c.fanId}
                onClick={() => select(c)}
                className={cn(
                  "relative flex w-full items-start gap-3 border-b border-line/50 px-3 py-2.5 text-left transition-colors",
                  open?.fanId === c.fanId ? "bg-primary/12" : "hover:bg-white/[0.03]",
                )}
              >
                {open?.fanId === c.fanId ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
                <Avatar src={c.avatar} name={c.name} size="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold">{c.name}</span>
                    {c.unread ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-bold text-white">{c.unread}</span> : null}
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{when(c.last?.at)}</span>
                  </span>
                  <span className={cn("block truncate text-[13px]", c.unread ? "font-semibold text-fg" : "text-muted")}>
                    {c.last ? (c.last.fromCreator ? "Toi : " : "") + (c.last.text || (c.last.media ? "📷 Média" : "")) : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {c.ai ? <Pill tone="accent">IA</Pill> : <Pill>IA off</Pill>}
                    {c.handoff ? <Pill tone="warn">à reprendre</Pill> : null}
                    {c.spent > 0 ? <Pill tone="good">{usd(c.spent, 0)}</Pill> : null}
                  </span>
                </span>
              </button>
            ))}
            {!chats.length ? <p className="p-6 text-center text-sm text-muted">{loading || !creatorId ? "Chargement…" : "Aucune conversation"}</p> : null}
            {cursor ? (
              <button onClick={() => load(false)} className="mx-auto my-3 block rounded-lg bg-card-2 px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg">
                Charger plus
              </button>
            ) : null}
          </div>
        </aside>

        {/* Conversation */}
        <section className={cn("flex min-w-0 flex-1 flex-col", !open && "max-md:hidden")}>
          {open && creatorId ? (
            <>
              <button onClick={() => setOpen(null)} className="flex items-center gap-1 border-b px-3 py-2 text-sm text-muted md:hidden">
                <ChevronLeft className="size-4" /> Conversations
              </button>
              <Chat key={creatorId + open.fanId} creatorId={creatorId} chat={open} lastEvent={lastEvent} onPatch={patchChat} />
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-center text-sm text-muted">
              <div>
                <p className="text-4xl">🌸</p>
                <p className="mt-2">Choisis une conversation</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
