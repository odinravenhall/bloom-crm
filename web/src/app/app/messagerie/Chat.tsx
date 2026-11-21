"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Lock, Send, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn, dayLabel, hhmm, usd } from "@/lib/fmt";
import type { AiLog, Chat as ChatT, Media, Message } from "@/lib/types";
import { Avatar, btnCls } from "@/components/ui";
import type { LiveEvent } from "./Inbox";
import { FanPanel } from "./FanPanel";
import { VaultPicker } from "./VaultPicker";

type Page = { items: Message[]; olderCursor: string | null; aiLog?: AiLog[] };

/** Une conversation : messages (avec l'historique IA coupée / rallumée), IA on/off, envoi texte ou PPV. */
export function Chat({ creatorId, chat, lastEvent, onPatch }: { creatorId: string; chat: ChatT; lastEvent: LiveEvent | null; onPatch: (fanId: string, p: Partial<ChatT>) => void }) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [aiLog, setAiLog] = useState<AiLog[]>([]);
  const [older, setOlder] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | string>("loading");
  const [typing, setTyping] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const q = `creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(chat.fanId)}`;

  const toBottom = () => requestAnimationFrame(() => box.current && (box.current.scrollTop = box.current.scrollHeight));

  useEffect(() => {
    let off = false;
    api<Page>("GET", `/api/messages?${q}`)
      .then((r) => {
        if (off) return;
        setMsgs(r.items);
        setAiLog(r.aiLog ?? []);
        setOlder(r.olderCursor);
        setState("ok");
        toBottom();
      })
      .catch((e) => !off && setState((e as Error).message));
    return () => {
      off = true;
    };
  }, [q]);

  const refreshLatest = useCallback(async () => {
    try {
      const r = await api<Page>("GET", `/api/messages?${q}`);
      setMsgs((old) => {
        const m = new Map(old.map((x) => [x.id, x]));
        for (const x of r.items) m.set(x.id, x);
        return [...m.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      });
      if (r.aiLog) setAiLog(r.aiLog);
      toBottom();
    } catch {}
  }, [q]);

  // Temps réel : nouveaux messages de cette conversation, IA en train d'écrire.
  useEffect(() => {
    const e = lastEvent;
    if (!e || e.creatorId !== creatorId) return;
    if (e.type === "new_message" && e.message && e.fanId === chat.fanId) {
      const m = e.message;
      setMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
      if (!m.fromFan) setTyping(false);
      if (stick.current) toBottom();
    } else if (e.type === "ai_generation_status" && e.data?.fanId === chat.fanId) {
      setTyping(/(start|generat|typing|pending|running|processing)/i.test(String(e.data.status || "")));
    }
  }, [lastEvent, creatorId, chat.fanId]);

  const loadOlder = async () => {
    if (!older || !box.current) return;
    const h = box.current.scrollHeight;
    try {
      const r = await api<Page>("GET", `/api/messages?${q}&cursor=${encodeURIComponent(older)}`);
      setMsgs((l) => {
        const ids = new Set(l.map((x) => x.id));
        return [...r.items.filter((x) => !ids.has(x.id)), ...l];
      });
      setOlder(r.olderCursor);
      requestAnimationFrame(() => box.current && (box.current.scrollTop = box.current.scrollHeight - h));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  // IA on / off
  const [ai, setAi] = useState(chat.ai);
  useEffect(() => setAi(chat.ai), [chat.ai]);
  const toggleAi = async () => {
    const on = !ai;
    setAi(on);
    try {
      await api("POST", "/api/ai", { creatorId, fanId: chat.fanId, on });
      onPatch(chat.fanId, { ai: on });
      toast(on ? "IA rallumée sur cette conversation" : "IA coupée : tu chattes à la main");
      api<AiLog[]>("GET", `/api/ailog?${q}`).then(setAiLog).catch(() => {});
    } catch (e) {
      setAi(!on);
      toast((e as Error).message, "err");
    }
  };

  // Envoi
  const [text, setText] = useState("");
  const [sel, setSel] = useState<Media[]>([]);
  const [price, setPrice] = useState(0);
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const send = async () => {
    if ((!text.trim() && !sel.length) || sending) return;
    setSending(true);
    setErr("");
    try {
      await api("POST", "/api/send", { creatorId, fanId: chat.fanId, message: text, medias: sel.map((m) => m.id), price });
      setText("");
      setSel([]);
      setPrice(0);
      stick.current = true;
      toast("Envoyé");
      // Le message arrive par le temps réel ; filet de sécurité si le flux a du retard.
      setTimeout(refreshLatest, 2500);
    } catch (e) {
      const d = (e as Error & { details?: unknown }).details;
      setErr(d ? "Mot interdit : " + JSON.stringify(d).slice(0, 120) : (e as Error).message);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  // Fil : messages et changements d'IA dans l'ordre du temps (sans remonter avant le plus vieux message chargé).
  const from = older && msgs.length ? Date.parse(msgs[0].at) : -Infinity;
  const rows = [
    ...msgs.map((m) => ({ t: Date.parse(m.at), m, l: null as AiLog | null })),
    ...aiLog.filter((l) => Date.parse(l.at) >= from).map((l) => ({ t: Date.parse(l.at), m: null as Message | null, l })),
  ].sort((a, b) => a.t - b.t);
  let day = "";

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-panel px-4 py-2.5 backdrop-blur-xl">
          <Avatar src={chat.avatar} name={chat.name} size="size-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{chat.name}</p>
            <p className="truncate text-xs text-muted">{chat.username ? "@" + chat.username : ""}</p>
          </div>
          {typing ? (
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-200">
              L’IA écrit <span className="typing-dot" /> <span className="typing-dot" style={{ animationDelay: ".15s" }} /> <span className="typing-dot" style={{ animationDelay: ".3s" }} />
            </span>
          ) : null}
          <button onClick={toggleAi} className="flex items-center gap-2 rounded-xl border bg-card-2/70 px-3 py-1.5 text-xs font-bold" title="Couper ou rallumer l’IA sur cette conversation">
            {ai ? "IA active" : "IA coupée"}
            <span className={cn("relative h-5 w-9 rounded-full transition-colors", ai ? "bg-primary" : "bg-line")}>
              <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", ai ? "left-[18px]" : "left-0.5")} />
            </span>
          </button>
        </header>

        <div
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="scroll-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-4"
        >
          {older ? (
            <button onClick={loadOlder} className="mx-auto mb-2 rounded-lg bg-card-2 px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg">
              Charger les messages plus anciens
            </button>
          ) : null}
          {state === "loading" ? <p className="m-auto text-sm text-muted">Chargement…</p> : null}
          {state !== "loading" && state !== "ok" ? <p className="m-auto text-sm font-semibold text-rose-300">{state}</p> : null}
          {rows.map((r) => {
            const at = r.m ? r.m.at : r.l!.at;
            const k = dayLabel(at);
            const sep = k !== day ? ((day = k), <div key={"d" + at} className="mx-auto my-2 rounded-full bg-card-2 px-3 py-0.5 text-[11px] font-semibold text-muted first-letter:uppercase">{k}</div>) : null;
            if (r.l) {
              const l = r.l;
              const what = l.on === false ? "IA coupée" : l.on === true ? "IA rallumée" : "IA : " + l.action;
              const why = l.reason && !/manual/i.test(l.reason) ? ` (${l.reason})` : "";
              return (
                <div key={"l" + l.id} className="contents">
                  {sep}
                  <div className={cn("mx-auto my-1 rounded-full border border-dashed px-3 py-0.5 text-[11.5px] font-semibold", l.on === false ? "border-rose-400/40 text-rose-300" : "border-violet-300/40 text-violet-200")}>
                    {what}
                    {l.by ? " par " + l.by : ""}
                    {why} · {hhmm(l.at)}
                  </div>
                </div>
              );
            }
            return (
              <div key={r.m!.id} className="contents">
                {sep}
                <Bubble m={r.m!} />
              </div>
            );
          })}
          {state === "ok" && !msgs.length ? <p className="m-auto text-sm text-muted">Pas encore de message</p> : null}
        </div>

        {sel.length ? (
          <div className="flex items-center gap-2 overflow-x-auto border-t px-4 py-2">
            {sel.map((m) =>
              m.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={m.thumb} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <span key={m.id} className="rounded-md bg-card-2 px-2 py-1 text-xs">
                  {m.type}
                </span>
              ),
            )}
            <span className="text-xs text-muted">
              {sel.length} média{sel.length > 1 ? "s" : ""} · {price ? "PPV " + usd(price) : "gratuit"}
            </span>
            <button onClick={() => (setSel([]), setPrice(0))} className="ml-auto rounded-lg p-1 text-muted hover:text-fg" title="Retirer">
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        <footer className="border-t bg-panel px-4 py-3 backdrop-blur-xl">
          <textarea
            ref={input}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={chat.canSend ? "Écrire au fan…  (Entrée : envoyer · Maj+Entrée : saut de ligne)" : "Ce fan ne peut pas recevoir de message"}
            className="max-h-56 min-h-16 w-full resize-y rounded-xl border border-input bg-card-2/60 px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => setPicker(true)} className={btnCls.ghost}>
              <ImagePlus className="size-4" /> Médias / PPV
            </button>
            {err ? <span className="truncate text-xs font-semibold text-rose-300">{err}</span> : null}
            <button onClick={send} disabled={sending || (!text.trim() && !sel.length)} className={cn(btnCls.primary, "ml-auto")}>
              <Send className="size-4" /> Envoyer
            </button>
          </div>
        </footer>
      </div>

      <FanPanel creatorId={creatorId} fanId={chat.fanId} onLoaded={(f) => onPatch(chat.fanId, { name: f.name, avatar: f.avatar, username: f.username, ai: f.ai })} />
      {picker ? (
        <VaultPicker
          creatorId={creatorId}
          initial={sel}
          initialPrice={price}
          onClose={() => setPicker(false)}
          onDone={(medias, p) => {
            setSel(medias);
            setPrice(medias.length ? p : 0);
            setPicker(false);
          }}
        />
      ) : null}
    </div>
  );
}

const BY_TONE: Record<string, string> = { ai: "text-violet-200", bloom: "text-primary-soft", auto: "text-muted", script: "text-muted", employee: "text-sky-200", creator: "text-muted" };

function Bubble({ m }: { m: Message }) {
  const me = !m.fromFan;
  return (
    <div
      className={cn(
        "max-w-[min(560px,78%)] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
        me ? "self-end rounded-br-md" : "self-start rounded-bl-md bg-bubble-fan",
        me && (m.by?.kind === "ai" ? "bg-violet-500/20" : m.by?.kind === "auto" || m.by?.kind === "script" ? "bg-card-2" : "bg-bubble-me"),
      )}
    >
      {m.tip ? <p className="mb-1 text-xs font-bold text-emerald-300">💸 Pourboire</p> : null}
      {m.text}
      {m.medias.length ? (
        <div className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1">
          {m.medias.map((x) => (
            <a key={x.id} href={x.full || x.thumb || "#"} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-lg bg-card-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {x.thumb ? <img src={x.thumb} alt="" loading="lazy" className="size-full object-cover" /> : null}
              {x.type === "video" || x.type === "audio" ? <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 text-[10px] font-bold">{x.type === "video" ? "▶ vidéo" : "🎤 vocal"}</span> : null}
            </a>
          ))}
        </div>
      ) : null}
      {m.price > 0 ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold">
          <Lock className="size-3.5" /> PPV {usd(m.price)} · {m.paid ? <span className="text-emerald-300">✓ payé</span> : <span className="text-amber-300">paiement en attente</span>}
        </div>
      ) : null}
      <div className={cn("mt-1 flex items-center gap-1.5 text-[10.5px] text-muted", me ? "justify-end" : "justify-start")}>
        {m.by ? <span className={cn("font-bold", BY_TONE[m.by.kind])}>{m.by.kind === "bloom" ? m.by.name + " · Bloom" : m.by.name}</span> : null}
        <span>{hhmm(m.at)}</span>
        {me && m.read ? <span>· vu</span> : null}
      </div>
    </div>
  );
}
