"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn, durSec, usd, waitTone, when } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import { useNow } from "@/lib/useNow";
import type { Chat as ChatT, Message } from "@/lib/types";
import { Avatar, Pill, inputCls } from "@/components/ui";
import { Chat } from "./Chat";

type Tab = "all" | "todo";
/** Événement temps réel relayé par Bloom. */
export type LiveEvent = { creatorId: string; type: string; fanId?: string; message?: Message; data?: { fanId?: string; status?: string } };
type PageR = { items: ChatT[]; nextCursor: string | null };

// « À répondre » : comme Raven CRM, on ne garde que les fans qui attendent depuis moins de 3 jours.
const WINDOW_MS = 72 * 3600e3;
const MAX_PAGES = 60;

/** Le fan attend une réponse : non lu, « à reprendre » (l'IA a passé la main) ou dernier message venu de lui. */
export const needsReply = (c: ChatT) => !!c.last && (c.handoff || c.unread > 0 || !c.last.fromCreator);
const waitingSince = (c: ChatT) => (c.last ? Date.parse(c.last.at) : 0);
const fresh = (fanId: string): ChatT => ({ fanId, name: "Fan", username: null, avatar: null, unread: 0, ai: false, handoff: false, spent: 0, subscribed: null, canSend: true, last: null });

/** Messagerie : toutes les conversations de la créatrice choisie (chargées d'un coup) + conversation ouverte. */
export function Inbox() {
  const params = useSearchParams();
  const { creatorId, setCreator, loaded } = useCreators();
  const [tab, setTab] = useState<Tab>(() => (["todo", "unread", "handoff"].includes(params.get("f") || "") ? "todo" : "all"));
  const [q, setQ] = useState("");
  const [chats, setChats] = useState<ChatT[]>([]);
  const [progress, setProgress] = useState<{ loading: boolean; n: number }>({ loading: false, n: 0 });
  const [open, setOpen] = useState<ChatT | null>(null);
  const [live, setLive] = useState(false);
  const creatorRef = useRef<string | null>(null);
  const run = useRef(0);
  const pageSize = useRef(100);

  // Lien venu d'une autre page (?c=créatrice&fan=…)
  const wanted = useRef<string | null>(params.get("fan"));
  useEffect(() => {
    const c = params.get("c");
    if (c && loaded) setCreator(c);
  }, [params, loaded, setCreator]);

  const page = useCallback(async (cid: string, cursor?: string | null) => {
    const p = new URLSearchParams({ creatorId: cid, limit: String(pageSize.current) });
    if (cursor) p.set("cursor", cursor);
    try {
      return await api<PageR>("GET", "/api/chats?" + p);
    } catch (e) {
      // Substy refuse les pages de 100 ? On repasse à 50.
      if (pageSize.current === 100) {
        pageSize.current = 50;
        p.set("limit", "50");
        return api<PageR>("GET", "/api/chats?" + p);
      }
      throw e;
    }
  }, []);

  /** Charge TOUTES les conversations, page après page ; la liste s'affiche dès la première page. */
  const loadAll = useCallback(
    async (cid: string) => {
      const me = ++run.current;
      setProgress({ loading: true, n: 0 });
      let cursor: string | null = null;
      let n = 0;
      try {
        for (let i = 0; i < MAX_PAGES; i++) {
          const r: PageR = await page(cid, cursor);
          if (run.current !== me) return;
          n += r.items.length;
          setChats((old) => (i === 0 ? r.items : old.concat(r.items.filter((x) => !old.some((y) => y.fanId === x.fanId)))));
          setProgress({ loading: !!r.nextCursor, n });
          if (i === 0 && wanted.current) {
            const id = wanted.current;
            wanted.current = null;
            setOpen(r.items.find((x) => x.fanId === id) ?? fresh(id));
          }
          cursor = r.nextCursor;
          if (!cursor) break;
        }
      } catch {
      } finally {
        if (run.current === me) setProgress((p) => ({ ...p, loading: false }));
      }
    },
    [page],
  );

  /** Rafraîchit le haut de la liste (conversations les plus récentes) sans tout recharger. */
  const refreshTop = useCallback(async () => {
    const cid = creatorRef.current;
    if (!cid) return;
    try {
      const r = await page(cid);
      if (creatorRef.current !== cid) return;
      setChats((old) => {
        const ids = new Set(r.items.map((x) => x.fanId));
        return [...r.items, ...old.filter((x) => !ids.has(x.fanId))];
      });
    } catch {}
  }, [page]);

  // Nouvelle créatrice : tout est rechargé.
  useEffect(() => {
    if (!creatorId) return;
    if (creatorRef.current && creatorRef.current !== creatorId) setOpen(null);
    creatorRef.current = creatorId;
    setChats([]);
    loadAll(creatorId);
  }, [creatorId, loadAll]);
  // Filet de sécurité : le haut de la liste se rafraîchit toutes les 45 s.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && refreshTop(), 45_000);
    return () => clearInterval(t);
  }, [refreshTop]);

  // Temps réel : un seul flux pour toute la messagerie.
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
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
      if (e.type !== "new_message" || !e.message || e.creatorId !== creatorRef.current) return;
      const m = e.message;
      setChats((list) => {
        const c = list.find((x) => x.fanId === e.fanId);
        if (!c) {
          setTimeout(refreshTop, 300);
          return list;
        }
        const isOpen = openRef.current?.fanId === e.fanId;
        const up: ChatT = {
          ...c,
          last: { text: m.text, at: m.at, fromCreator: !m.fromFan, media: m.medias.length },
          unread: m.fromFan && !isOpen ? (c.unread || 0) + 1 : isOpen ? 0 : c.unread,
          // Une réponse envoyée : le fan n'est plus « à reprendre ».
          handoff: m.fromFan ? c.handoff : false,
        };
        return [up, ...list.filter((x) => x !== c)];
      });
    };
    return () => es.close();
  }, [refreshTop]);

  const select = (c: ChatT) => {
    setChats((l) => l.map((x) => (x.fanId === c.fanId ? { ...x, unread: 0 } : x)));
    setOpen({ ...c, unread: 0 });
  };
  const patchChat = useCallback((fanId: string, patch: Partial<ChatT>) => {
    setChats((l) => l.map((x) => (x.fanId === fanId ? { ...x, ...patch } : x)));
    setOpen((o) => (o && o.fanId === fanId ? { ...o, ...patch } : o));
  }, []);

  // Listes affichées : « Tous » (le plus récent en haut) et « À répondre » (celui qui attend depuis le plus longtemps en haut).
  const minute = useNow(60_000);
  const todo = useMemo(
    () => chats.filter((c) => needsReply(c) && minute - waitingSince(c) < WINDOW_MS).sort((a, b) => waitingSince(a) - waitingSince(b)),
    [chats, minute],
  );
  const shown = useMemo(() => {
    const base = tab === "todo" ? todo : chats;
    const s = q.trim().toLowerCase();
    return s ? base.filter((c) => c.name.toLowerCase().includes(s) || (c.username || "").toLowerCase().includes(s)) : base;
  }, [tab, todo, chats, q]);

  return (
    <div className="flex h-dvh min-h-0 flex-col max-md:h-[calc(100dvh-57px)]">
      <div className="flex flex-wrap items-center gap-3 border-b bg-panel px-4 py-2.5 backdrop-blur-xl">
        <h1 className="text-lg">Messagerie</h1>
        <span className={cn("size-2 rounded-full", live ? "pulse-dot bg-emerald-400" : "bg-amber-400")} title={live ? "Temps réel actif" : "Temps réel : connexion…"} />
        <CreatorTabs className="min-w-0" />
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Liste des conversations */}
        <aside className={cn("flex w-full min-w-0 flex-col border-r bg-panel backdrop-blur-xl md:w-[360px] md:shrink-0", open && "max-md:hidden")}>
          <div className="flex flex-col gap-2 border-b p-3">
            <div className="flex rounded-xl border bg-card/80 p-1">
              {(
                [
                  ["todo", "À répondre", todo.length],
                  ["all", "Tous", chats.length],
                ] as const
              ).map(([k, l, n]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", tab === k ? "bg-primary text-white" : "text-muted hover:text-fg")}
                >
                  {l}
                  <span className={cn("rounded-full px-1.5 text-[11px] font-bold tabular-nums", tab === k ? "bg-white/20" : "bg-card-2")}>{n}</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input className={cn(inputCls, "pl-9")} placeholder="Rechercher un fan…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {progress.loading ? <p className="text-[11px] text-muted">Chargement de toutes les conversations… {progress.n}</p> : null}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {shown.map((c) => (
              <Row key={c.fanId} c={c} on={open?.fanId === c.fanId} onClick={() => select(c)} />
            ))}
            {!shown.length ? (
              <p className="p-6 text-center text-sm text-muted">
                {progress.loading || !creatorId ? "Chargement…" : tab === "todo" ? "Personne n’attend de réponse 🎉" : q ? "Aucun fan trouvé" : "Aucune conversation"}
              </p>
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

function Row({ c, on, onClick }: { c: ChatT; on: boolean; onClick: () => void }) {
  const waiting = needsReply(c);
  return (
    <button onClick={onClick} className={cn("cv-row relative flex w-full items-start gap-3 border-b border-line/50 px-3 py-2.5 text-left transition-colors", on ? "bg-primary/12" : "hover:bg-white/[0.03]")}>
      {on ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
      <Avatar src={c.avatar} name={c.name} size="size-10" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold">{c.name}</span>
          {c.unread ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-bold text-white">{c.unread}</span> : null}
          <span className="ml-auto shrink-0">{waiting ? <WaitChip since={waitingSince(c)} /> : <span className="text-[11px] text-muted">{when(c.last?.at)}</span>}</span>
        </span>
        <span className={cn("block truncate text-[13px]", c.unread || waiting ? "font-semibold text-fg" : "text-muted")}>
          {c.last ? (c.last.fromCreator ? "Toi : " : "") + (c.last.text || (c.last.media ? "📷 Média" : "")) : ""}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {c.handoff ? <Pill tone="warn">à reprendre</Pill> : null}
          {c.ai ? <Pill tone="accent">IA</Pill> : <Pill>IA off</Pill>}
          {c.spent > 0 ? <Pill tone="good">{usd(c.spent, 0)}</Pill> : null}
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
