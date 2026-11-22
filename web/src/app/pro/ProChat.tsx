"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock, ArrowLeft, AtSign, Bell, BellOff, CalendarCheck, CheckCheck, Copy, ExternalLink, Heart, Image as ImageIcon, Images, Languages, Lock, MessageSquareReply, MoreVertical,
  NotebookText, Pencil, Pin, RefreshCw, Search, Settings, Smile, Star, Tag, Type, Vault, X, Bot,
} from "lucide-react";
import { api, ClientError, mediaThumb, toast } from "@/rv/lib/client";
import { money } from "@/rv/lib/fmt";
import { debounce, onLive } from "@/rv/lib/liveClient";
import { fillVars } from "@/rv/lib/vars";
import type { Conv, LiveMsg, Media, Model } from "@/rv/inbox/types";
import type { Lib, LibScript } from "@/rv/inbox/scriptTypes";
import { VaultPicker } from "@/rv/inbox/VaultPicker";
import { CATEGORIES, QUICK } from "./emojis";
import { ProScripts } from "./ProScripts";

// Conversation de Messages Pro (Infloww) : en-tête (épinglés, galerie, recherche, nouvel onglet, menu), fil des
// messages (épingler un message, répondre, traduire), composeur (emojis, scripts, médias + prix du pack, message
// programmé / rappel, date d'envoi, traduction proposée).
type MsgResp = { data: LiveMsg[]; pageInfo?: { hasNextPage: boolean; endCursor: string }; sentBy?: Record<string, string> };
type Pin = { id: string; text: string; at: string | null; fromFan: boolean; by: string | null };
const BLUE = "#2f6bff";
const LANGS: [string, string][] = [["fr", "French"], ["en", "English"], ["es", "Spanish"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"]];
const initials = (s: string) => (s.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2) || "?").replace(/^./, (c) => c.toUpperCase());
// Séparateur de jour dans le fil : « Aujourd'hui », « Hier », sinon la date.
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string, t: (s: string) => string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return t("Today");
  if (d.toDateString() === y.toDateString()) return t("Yesterday");
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}
const timeTxt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();

export function ProChat({ conv, me, model, onBack, onNewTab, onNotes, t }: { conv: Conv; me: { id: number; name: string; admin: boolean }; model: Model; onBack: () => void; onNewTab?: () => void; onNotes: () => void; t: (s: string) => string }) {
  const [msgs, setMsgs] = useState<LiveMsg[] | null>(null);
  const [older, setOlder] = useState<LiveMsg[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sentBy, setSentBy] = useState<Record<string, string>>({});
  const [firstName, setFirstName] = useState<string | null>(null);
  const [nick, setNick] = useState(conv.nickname);
  const [pinned, setPinned] = useState(conv.pinned);
  const [ai, setAi] = useState(!!conv.ai);
  const [muted, setMuted] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [view, setView] = useState<"chat" | "pins" | "gallery">("chat");
  const [find, setFind] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [trans, setTrans] = useState<Record<string, string>>({});
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const name = nick || conv.memberName || "Fan";
  const online = !!conv.lastSeenAt && Date.now() - Date.parse(conv.lastSeenAt) < 15 * 60_000;

  const [loadErr, setLoadErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api<MsgResp>("GET", `/api/conversations/${conv.id}/messages`);
      setMsgs([...r.data].reverse());
      setLoadErr(null);
      if (r.sentBy) setSentBy((s) => ({ ...s, ...r.sentBy }));
      setCursor((c) => c ?? (r.pageInfo?.hasNextPage ? r.pageInfo.endCursor : ""));
    } catch (e) {
      // Pas de bulle d'erreur à chaque rafraîchissement : le message reste affiché dans le fil.
      setLoadErr((e as Error).message);
      setMsgs((m) => m ?? []);
    }
  }, [conv.id]);
  const loadPins = useCallback(() => api<{ items: Pin[] }>("GET", `/api/pro/pins?conv=${encodeURIComponent(conv.id)}`).then((r) => setPins(r.items)).catch(() => {}), [conv.id]);
  useEffect(() => {
    load();
    loadPins();
    api<{ sentBy: Record<string, string>; firstName: string | null }>("GET", `/api/conversations/${conv.id}`)
      .then((d) => (setSentBy((s) => ({ ...s, ...d.sentBy })), setFirstName(d.firstName ?? null)))
      .catch(() => {});
    const lock = () => api("POST", `/api/conversations/${conv.id}/action`, { action: "lock" }).catch(() => {});
    lock();
    const reload = debounce(load, 250);
    const off = onLive("conv", (d) => d.id === conv.id && reload());
    const t1 = setInterval(() => document.visibilityState === "visible" && load(), 25_000);
    const t2 = setInterval(lock, 45_000);
    return () => (off(), clearInterval(t1), clearInterval(t2));
  }, [conv.id, load, loadPins]);
  const all = useMemo(() => [...older, ...(msgs ?? [])], [older, msgs]);
  // Le PPV timeline de la fiche (onglet Sales) se nourrit des messages chargés ici.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("pro-msgs", { detail: { convId: conv.id, msgs: all } }));
  }, [all, conv.id]);
  useLayoutEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs, view]);
  const loadOlder = async () => {
    if (!cursor || !box.current) return;
    const h = box.current.scrollHeight;
    const r = await api<MsgResp>("GET", `/api/conversations/${conv.id}/messages?cursor=${encodeURIComponent(cursor)}`).catch(() => null);
    if (!r) return;
    setOlder((o) => [...[...r.data].reverse(), ...o]);
    setCursor(r.pageInfo?.hasNextPage ? r.pageInfo.endCursor : "");
    requestAnimationFrame(() => box.current && (box.current.scrollTop = box.current.scrollHeight - h));
  };

  const action = (a: Record<string, unknown>) => api("POST", `/api/conversations/${conv.id}/action`, a);
  const togglePinFan = async () => {
    const v = !pinned;
    setPinned(v);
    try {
      await action({ action: "pin", pin: v });
    } catch (e) {
      setPinned(!v);
      toast((e as Error).message, "err");
    }
  };
  const toggleAi = async () => {
    const v = !ai;
    setAi(v);
    try {
      await action({ action: "ai", on: v });
      toast(v ? t("Substy AI turned on for this fan") : t("Substy AI turned off: you reply by hand"));
    } catch (e) {
      setAi(!v);
      toast((e as Error).message, "err");
    }
  };
  const rename = async () => {
    const n = window.prompt(t("Rename user"), nick || conv.memberName || "");
    if (n === null) return;
    try {
      const r = await api<{ nickname: string | null }>("POST", `/api/conversations/${conv.id}/action`, { action: "nickname", nickname: n });
      setNick(r.nickname);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const pinMsg = async (m: LiveMsg, pin: boolean) => {
    try {
      await api("POST", "/api/pro/pins", { conv: conv.id, messageId: m.message.id, text: m.message.content, at: m.message.createdAt, fromFan: !!m.authorMessage?.memberId, pin });
      toast(pin ? t("Message pinned") : t("Message unpinned"));
      loadPins();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const translateMsg = async (m: LiveMsg) => {
    if (trans[m.message.id]) return setTrans((x) => ({ ...x, [m.message.id]: "" }));
    try {
      const r = await api<{ text: string }>("POST", "/api/pro/translate", { text: m.message.content, to: "fr" });
      setTrans((x) => ({ ...x, [m.message.id]: r.text }));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const [replyTo, setReplyTo] = useState<LiveMsg | null>(null);
  const pinnedIds = new Set(pins.map((p) => p.id));
  const shown = find ? all.filter((m) => m.message.content.toLowerCase().includes(find.toLowerCase())) : all;
  const gallery = all.flatMap((m) => [...(m.medias ?? []), ...(m.bundleWithMedias?.medias ?? [])]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* En-tête */}
      {view === "pins" ? (
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b px-4" style={{ borderColor: "var(--pro-line)" }}>
          <button onClick={() => setView("chat")}>
            <ArrowLeft className="size-5" />
          </button>
          <div className="leading-tight">
            <p className="text-[15px]">{t("Pinned messages")}</p>
            <p className="text-[12px]" style={{ color: "var(--of-muted)" }}>{t("with")} {name}</p>
          </div>
        </div>
      ) : (
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b px-3" style={{ borderColor: "var(--pro-line)" }}>
          <button onClick={view === "gallery" ? () => setView("chat") : onBack} title={t("Back")}>
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 leading-tight">
            <p className="flex items-center gap-1.5 text-[17px] font-semibold">
              <span className="truncate">{name}</span>
              <button onClick={rename} title={t("Rename user")}>
                <Pencil className="size-3.5" style={{ color: "var(--of-muted)" }} />
              </button>
            </p>
            <p className="flex items-center gap-2 text-[11px]" style={{ color: "var(--of-muted)" }}>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: online ? "#2ec4a6" : "#777" }} />
                {online ? t("Available now") : conv.lastSeenAt ? `${t("Seen")} ${new Date(conv.lastSeenAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : t("Offline")}
              </span>
              <Sep />
              <button onClick={togglePinFan} title={t(pinned ? "Unpin fan" : "Pin fan")}>
                <Star className="size-3.5" style={pinned ? { color: BLUE, fill: BLUE } : undefined} />
              </button>
              <Sep />
              <button onClick={() => setMuted(!muted)} title={t(muted ? "Unmute notifications" : "Mute notifications")}>
                {muted ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
              </button>
              <Sep />
              <button onClick={onNotes} title={t("Notes")}>
                <NotebookText className="size-3.5" />
              </button>
              <Sep />
              <button onClick={() => setView("pins")} title={t("Pinned messages")}>
                <Pin className="size-3.5" />
              </button>
              <Sep />
              <button onClick={toggleAi} title={t(ai ? "Turn off Substy AI" : "Turn on Substy AI")} className="flex items-center gap-1" style={{ color: ai ? "#2ec4a6" : undefined }}>
                <Bot className="size-3.5" /> {ai ? "IA" : "IA off"}
              </button>
              <Sep />
              <button onClick={() => setView(view === "gallery" ? "chat" : "gallery")} className="flex items-center gap-1">
                <Images className="size-3.5" /> {t("Gallery")}
              </button>
              <Sep />
              <button onClick={() => setFind(find === null ? "" : null)} className="flex items-center gap-1">
                <Search className="size-3.5" /> {t("Find")}
              </button>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {onNewTab ? (
              <button onClick={onNewTab} className="flex items-center gap-1.5 text-[13px]" style={{ color: BLUE }}>
                <ExternalLink className="size-4" /> {t("Open in new tab")}
              </button>
            ) : null}
            <button onClick={load} title={t("Refresh")}>
              <RefreshCw className="size-4" />
            </button>
            <div className="relative">
              <button onClick={() => setMenu(!menu)} title={t("More")}>
                <MoreVertical className="size-4" />
              </button>
              {menu ? <ChatMenu conv={conv} name={name} muted={muted} onRename={rename} onMute={() => setMuted(!muted)} onClose={() => setMenu(false)} t={t} /> : null}
            </div>
          </div>
        </div>
      )}
      {find !== null && view === "chat" ? (
        <label className="mx-4 mt-2 flex h-9 items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--pro-line)" }}>
          <Search className="size-4" style={{ color: "var(--of-muted)" }} />
          <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder={t("Find in conversation")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          <button onClick={() => setFind(null)}>
            <X className="size-4" />
          </button>
        </label>
      ) : null}

      {/* Corps */}
      {view === "pins" ? (
        <div className="of-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {pins.length ? (
            pins.map((p) => (
              <div key={p.id} className="mb-3 rounded-lg p-3" style={{ background: "var(--pro-panel)" }}>
                <p className="text-[12px]" style={{ color: "var(--of-muted)" }}>
                  {p.fromFan ? name : t("Creator")} · {p.at ? new Date(p.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""} · {t("pinned by")} {p.by}
                </p>
                <p className="mt-1 text-[15px] whitespace-pre-wrap">{p.text || "—"}</p>
                <button onClick={() => pinMsg({ message: { id: p.id, content: p.text, type: "message", createdAt: p.at || "" } } as LiveMsg, false)} className="mt-2 text-[12px]" style={{ color: BLUE }}>
                  {t("Unpin")}
                </button>
              </div>
            ))
          ) : (
            <div className="grid h-full place-items-center text-center" style={{ color: "var(--of-muted)" }}>
              <div>
                <Pin className="mx-auto size-10" />
                <p className="mt-3 text-[16px]">{t("You can find pinned messages here")}</p>
              </div>
            </div>
          )}
        </div>
      ) : view === "gallery" ? (
        <div className="of-scroll grid min-h-0 flex-1 auto-rows-[140px] grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 overflow-y-auto p-4">
          {gallery.map((m, i) => (
            <a key={`${m.id}-${i}`} href={m.largeUrl || m.url || mediaThumb(m)} target="_blank" rel="noreferrer" className="pro-media overflow-hidden rounded-md" style={{ background: "#333" }}>
              {mediaThumb(m) ? <img src={mediaThumb(m)} alt="" className="size-full object-cover" /> : null}
            </a>
          ))}
          {!gallery.length ? <p className="col-span-full py-10 text-center" style={{ color: "var(--of-muted)" }}>{t("No media in the loaded messages")}</p> : null}
        </div>
      ) : (
        <div
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (el.scrollTop < 40 && cursor) loadOlder();
          }}
          className="of-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {msgs === null ? <p className="py-10 text-center text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Loading…")}</p> : null}
          {loadErr && !all.length ? (
            <div className="mx-auto mt-10 max-w-[460px] rounded-lg border px-4 py-3 text-center text-[13px]" style={{ borderColor: "var(--pro-line)", color: "var(--of-muted)" }}>
              {loadErr}
              <button onClick={load} className="mt-2 block w-full" style={{ color: BLUE }}>{t("Retry")}</button>
            </div>
          ) : null}
          {shown.map((m, i) => (
            <div key={m.message.id}>
            {i === 0 || dayKey(shown[i - 1].message.createdAt) !== dayKey(m.message.createdAt) ? (
              <div className="my-4 flex items-center gap-3 text-[12px]" style={{ color: "var(--of-muted)" }}>
                <span className="h-px flex-1" style={{ background: "var(--pro-line)" }} />
                {dayLabel(m.message.createdAt, t)}
                <span className="h-px flex-1" style={{ background: "var(--pro-line)" }} />
              </div>
            ) : null}
            <Bubble
              m={m}
              fanName={name}
              by={sentBy[m.message.id] || (m as LiveMsg & { by?: { name?: string; kind?: string } }).by?.name || null}
              pinned={pinnedIds.has(m.message.id)}
              translation={trans[m.message.id]}
              onPin={() => pinMsg(m, !pinnedIds.has(m.message.id))}
              onReply={() => setReplyTo(m)}
              onTranslate={() => translateMsg(m)}
              t={t}
            />
            </div>
          ))}
        </div>
      )}

      {view === "chat" ? (
        conv.canSend === false ? (
          <p className="border-t px-4 py-4 text-center text-[13px]" style={{ borderColor: "var(--pro-line)", color: "var(--of-muted)" }}>{t("This fan can't receive messages right now.")}</p>
        ) : (
          <Composer
            conv={conv}
            model={model}
            me={me}
            firstName={firstName}
            replyTo={replyTo}
            clearReply={() => setReplyTo(null)}
            onSent={(id) => (setSentBy((s) => ({ ...s, [id]: me.name })), (stick.current = true), load())}
            t={t}
          />
        )
      ) : null}
    </div>
  );
}

const Sep = () => <span className="h-3 w-px" style={{ background: "var(--pro-line)" }} />;

function Bubble({ m, fanName, by, pinned, translation, onPin, onReply, onTranslate, t }: { m: LiveMsg; fanName: string; by: string | null; pinned: boolean; translation?: string; onPin: () => void; onReply: () => void; onTranslate: () => void; t: (s: string) => string }) {
  const fan = !!m.authorMessage?.memberId;
  const [menu, setMenu] = useState(false);
  const medias = m.bundleWithMedias?.medias ?? m.medias ?? [];
  const price = m.bundleWithMedias?.bundle.price;
  const paid = m.bundleWithMedias?.bundle.isPaid;
  const deleted = !!m.message.deletedAt;
  const body = (
    <div className={`max-w-[640px] rounded-lg px-3.5 py-2.5 text-[15px] ${deleted ? "opacity-50" : ""}`} style={{ background: fan ? "var(--pro-fan)" : "var(--pro-me)" }}>
      {pinned ? <Pin className="mb-1 size-3" style={{ color: BLUE }} /> : null}
      {m.message.type === "tips" ? <p className="font-semibold" style={{ color: "#2ec4a6" }}>💸 {t("Tip")}</p> : null}
      {medias.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {medias.slice(0, 8).map((x) => (
            <span key={x.id} className="pro-media relative size-[90px] overflow-hidden rounded-md" style={{ background: "#333" }}>
              {mediaThumb(x) ? <img src={mediaThumb(x)} alt="" className="size-full object-cover" /> : null}
            </span>
          ))}
        </div>
      ) : null}
      {price ? (
        <p className="mb-1 inline-flex items-center gap-1 rounded px-1.5 text-[12px] font-bold text-white" style={{ background: paid ? "#2ec4a6" : "#e06b6b" }}>
          <Lock className="size-3" /> {money(price)} · {t(paid ? "Bought" : "Locked")}
        </p>
      ) : null}
      {m.message.content ? <p className="whitespace-pre-wrap break-words">{m.message.content}</p> : null}
      {translation ? <p className="mt-1.5 border-t pt-1.5 text-[13px] whitespace-pre-wrap italic" style={{ borderColor: "var(--pro-line)", color: "var(--of-muted)" }}>{translation}</p> : null}
    </div>
  );
  const icons = (
    <span className="flex items-center gap-2 opacity-60" style={{ color: "var(--of-muted)" }}>
      <button onClick={onPin} title={t(pinned ? "Unpin" : "Pin")}>
        <Pin className="size-3.5" style={pinned ? { color: BLUE } : undefined} />
      </button>
      <button onClick={onReply} title={t("Reply")}>
        <MessageSquareReply className="size-3.5" />
      </button>
      {fan ? (
        <button onClick={() => toast(t("Reactions are not available with Substy yet"), "err")} title={t("Like")}>
          <Heart className="size-3.5" />
        </button>
      ) : null}
      <button onClick={onTranslate} title={t("Translate")}>
        <Languages className="size-3.5" />
      </button>
    </span>
  );
  if (fan)
    return (
      <div className="mb-4 flex items-end gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold" style={{ background: "var(--pro-chip)", color: BLUE }}>{initials(fanName)}</span>
        <div>
          <div className="flex items-end gap-2">
            {body}
            {icons}
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--of-muted)" }}>{timeTxt(m.message.createdAt)}</p>
        </div>
      </div>
    );
  return (
    <div className="mb-4 flex flex-col items-end pr-11">
      <div className="flex items-center gap-2">
        <span className="relative flex items-center gap-2" style={{ color: "var(--of-muted)" }}>
          <button onClick={onTranslate} title={t("Translate")}>
            <Languages className="size-3.5" />
          </button>
          <button onClick={() => setMenu(!menu)}>
            <MoreVertical className="size-3.5" />
          </button>
          {menu ? (
            <>
              <div className="fixed inset-0 z-30" onMouseDown={() => setMenu(false)} />
              <span className="absolute right-6 bottom-0 z-40 flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] whitespace-nowrap shadow-xl" style={{ background: "var(--pro-pop)", color: "var(--of-text)" }}>
                <button onClick={() => (navigator.clipboard.writeText(m.message.content), setMenu(false), toast(t("Copied")))} className="px-1">{t("Copy")}</button>|
                <button onClick={() => (onReply(), setMenu(false))} className="px-1">{t("Reply")}</button>|
                <button onClick={() => (onPin(), setMenu(false))} className="px-1">{t(pinned ? "Unpin" : "Pin")}</button>
              </span>
            </>
          ) : null}
        </span>
        {body}
      </div>
      <p className="mt-1 flex items-center gap-1 text-[12px]" style={{ color: "var(--of-muted)" }}>
        {timeTxt(m.message.createdAt)} <CheckCheck className="size-3.5" /> {by ? <span style={{ color: BLUE }}>{by}</span> : null}
      </p>
    </div>
  );
}

function ChatMenu({ conv, name, muted, onRename, onMute, onClose, t }: { conv: Conv; name: string; muted: boolean; onRename: () => void; onMute: () => void; onClose: () => void; t: (s: string) => string }) {
  const user = (conv as Conv & { memberUsername?: string | null }).memberUsername || `u${conv.memberId}`;
  const copy = (s: string) => (navigator.clipboard.writeText(s), toast(t("Copied")), onClose());
  const no = () => (toast(t("Not available with Substy yet"), "err"), onClose());
  const item = (label: string, fn: () => void, disabled = false) => (
    <button onClick={fn} className="block w-full px-4 py-2.5 text-left text-[14px]" style={disabled ? { color: "var(--of-muted)" } : undefined}>
      {label}
    </button>
  );
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="absolute top-7 right-0 z-50 w-[260px] rounded-lg border py-1 shadow-2xl" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
        <p className="flex items-center gap-2 border-b px-4 py-2.5 text-[14px]" style={{ borderColor: "var(--pro-line)" }}>
          <span className="grid size-7 place-items-center rounded-full text-[12px]" style={{ background: "var(--pro-chip)", color: BLUE }}>{initials(name)}</span>@{user}
        </p>
        {item(t("Copy profile link"), () => copy(`https://onlyfans.com/${user}`))}
        {item(t("Copy chat link"), () => copy(`${location.origin}/pro?c=${encodeURIComponent(conv.id)}`))}
        {item(t("Rename user"), () => (onRename(), onClose()))}
        {item(t("Add to / remove from lists"), () => (window.open("/app/listes", "_blank"), onClose()))}
        <div className="my-1 border-t" style={{ borderColor: "var(--pro-line)" }} />
        {item(t("Hide chat"), () => (api("POST", `/api/conversations/${conv.id}/action`, { action: "read" }).catch(() => {}), onClose()))}
        {item(t(muted ? "Unmute notifications" : "Mute notifications"), () => (onMute(), onClose()))}
        <div className="my-1 border-t" style={{ borderColor: "var(--pro-line)" }} />
        {item(t("Restrict"), no, true)}
        {item(t("Block"), no, true)}
        {item(t("Report"), no, true)}
      </div>
    </>
  );
}

/** Composeur façon Infloww. */
function Composer({ conv, model, me, firstName, replyTo, clearReply, onSent, t }: { conv: Conv; model: Model; me: { name: string }; firstName: string | null; replyTo: LiveMsg | null; clearReply: () => void; onSent: (id: string) => void; t: (s: string) => string }) {
  const key = `bloom.pro.draft.${conv.id}`;
  const [text, setText] = useState("");
  const [medias, setMedias] = useState<Media[]>([]);
  const [price, setPrice] = useState(0); // en cents, prix du pack entier
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [pop, setPop] = useState<null | "emoji" | "scripts" | "vault" | "timed" | "schedule" | "price" | "tag">(null);
  const [lib, setLib] = useState<Lib | null>(null);
  const [trOn, setTrOn] = useState(true);
  const [lang, setLang] = useState("fr");
  const [tr, setTr] = useState<{ src: string; text: string } | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try {
      setText(localStorage.getItem(key) || "");
      setLang(localStorage.getItem("bloom.pro.lang") || "fr");
    } catch {}
  }, [key]);
  useEffect(() => {
    try {
      if (text) localStorage.setItem(key, text);
      else localStorage.removeItem(key);
    } catch {}
  }, [text, key]);
  useEffect(() => {
    api<Lib>("GET", `/api/models/${conv.modelId}/library?conv=${conv.id}`).then(setLib).catch(() => {});
  }, [conv.modelId, conv.id]);
  // « Copy as draft » depuis le PPV timeline de la fiche.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ convId: string; medias: Media[]; price: number; text: string }>).detail;
      if (d.convId !== conv.id) return;
      setMedias(d.medias);
      setPrice(d.price);
      if (d.text) setText(d.text);
      ta.current?.focus();
    };
    window.addEventListener("pro-draft", on);
    return () => window.removeEventListener("pro-draft", on);
  }, [conv.id]);
  // Traduction proposée (comme Infloww) : on traduit ce qu'on écrit vers la langue choisie.
  useEffect(() => {
    if (!trOn || text.trim().length < 4 || text.startsWith("/")) return setTr(null);
    const id = setTimeout(() => {
      api<{ text: string; from: string | null }>("POST", "/api/pro/translate", { text, to: lang })
        .then((r) => setTr(r.from && r.from !== lang && r.text && r.text.trim() !== text.trim() ? { src: text, text: r.text } : null))
        .catch(() => setTr(null));
    }, 700);
    return () => clearTimeout(id);
  }, [text, lang, trOn]);

  const vars = (s: string) => fillVars(s, { prenom: firstName || conv.nickname || null }).text;
  const pick = (s: LibScript) => {
    setText(vars(s.content));
    setMedias(s.medias);
    setPrice(s.price ?? 0);
    setScriptId(s.id);
    setPop(null);
    ta.current?.focus();
  };
  const slash = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const slashList = slash !== null ? (lib?.scripts ?? []).filter((s) => !slash || `${s.title} ${s.content}`.toLowerCase().includes(slash)).slice(0, 8) : [];

  const clear = () => (setText(""), setMedias([]), setPrice(0), setScriptId(null), setTr(null));
  const send = async (content = text) => {
    const c = content.trim();
    if (sending || (!c && !medias.length)) return;
    if (price && !medias.length) return toast(t("Add at least one media for a PPV"), "err");
    setSending(true);
    try {
      const r = await api<{ message: { id: string } }>("POST", `/api/conversations/${conv.id}/send`, { content: c, mediaIds: medias.map((m) => m.id), price: price || undefined, scriptId: scriptId ?? undefined, replyToId: replyTo?.message.id });
      toast(price ? `${t("PPV sent")} · ${money(price)}` : t("Sent"));
      clear();
      clearReply();
      onSent(r.message.id);
    } catch (e) {
      const err = e as ClientError;
      const w = err.warning as { detected?: string[] } | undefined;
      toast(w?.detected?.length ? `${t("Banned word")}: ${w.detected.join(", ")}` : err.message, "err");
    } finally {
      setSending(false);
    }
  };
  const ready = !!text.trim() || medias.length > 0;
  const insert = (e: string) => {
    const el = ta.current;
    if (!el) return setText((x) => x + e);
    const s = el.selectionStart ?? text.length;
    setText(text.slice(0, s) + e + text.slice(el.selectionEnd ?? s));
    requestAnimationFrame(() => (el.focus(), el.setSelectionRange(s + e.length, s + e.length)));
  };

  return (
    <div className="relative shrink-0 border-t" style={{ borderColor: "var(--pro-line)" }}>
      {pop === "scripts" ? <ProScripts lib={lib} onPick={pick} onClose={() => setPop(null)} t={t} /> : null}
      {pop === "emoji" ? <EmojiPicker onPick={insert} onClose={() => setPop(null)} t={t} /> : null}
      {/* Rangée d'emojis + Scripts + horloge */}
      <div className="flex items-start gap-3 px-4 pt-2">
        <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[19px] leading-none">
          <button onClick={() => setPop(pop === "emoji" ? null : "emoji")} title={t("Emojis")}>
            <Smile className="size-5" style={{ color: "var(--of-muted)" }} />
          </button>
          <button onClick={() => setPop(pop === "emoji" ? null : "emoji")} title={t("More emojis")}>
            <Settings className="size-5" style={{ color: "var(--of-muted)" }} />
          </button>
          {QUICK.map((e) => (
            <button key={e} onClick={() => insert(e)} className="transition-transform hover:scale-125">
              {e}
            </button>
          ))}
        </div>
        <button onClick={() => setPop(pop === "scripts" ? null : "scripts")} className="flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-[14px]" style={{ background: "var(--pro-chip)", color: BLUE }}>
          <NotebookText className="size-4" /> {t("Scripts")}
        </button>
        <button onClick={() => setPop("timed")} title={t("Set a timed message")} className="shrink-0 pt-1">
          <AlarmClock className="size-5" />
        </button>
      </div>

      {/* Médias choisis : « Free preview » / « Price to view » */}
      {medias.length ? (
        <div className="mx-4 mt-3 overflow-hidden rounded-md" style={{ background: "var(--pro-media)" }}>
          <div className="flex text-[14px]">
            <span className="flex flex-1 items-center gap-2 px-3 py-2" style={{ color: "var(--of-muted)" }}>
              <ImageIcon className="size-4" /> {t("Free preview")}
            </span>
            <button onClick={() => setPop("price")} className="flex flex-1 items-center justify-between gap-2 px-3 py-2" style={{ background: "var(--pro-media-on)" }}>
              <span className="flex items-center gap-2">
                <Tag className="size-4" /> {t("Price to view")}
              </span>
              <span className="flex items-center gap-2">
                {price ? `$ ${+(price / 100).toFixed(2)}` : t("Free")}
                <X className="size-4" onClick={(e) => (e.stopPropagation(), setMedias([]), setPrice(0))} />
              </span>
            </button>
          </div>
          <div className="of-scroll flex gap-2 overflow-x-auto p-2">
            {medias.map((m) => (
              <span key={m.id} className="pro-media relative h-[110px] w-[100px] shrink-0 overflow-hidden rounded-md" style={{ background: "#333" }}>
                {mediaThumb(m) ? <img src={mediaThumb(m)} alt="" className="size-full object-cover" /> : null}
                {price ? <span className="absolute top-1 left-1 rounded px-1.5 text-[11px] font-bold text-white" style={{ background: "#e06b6b" }}>🔒 ${(price / 100).toFixed(2)}</span> : null}
                <button onClick={() => setMedias((l) => l.filter((x) => x.id !== m.id))} className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/60 text-white">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {replyTo ? (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px]" style={{ background: "var(--pro-chip)" }}>
          <MessageSquareReply className="size-4" /> <span className="min-w-0 flex-1 truncate">{replyTo.message.content || t("Media")}</span>
          <button onClick={clearReply}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="relative px-4">
        {slash !== null && slashList.length ? (
          <div className="absolute inset-x-4 bottom-full z-30 mb-1 rounded-md border shadow-xl" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
            {slashList.map((s) => (
              <button key={s.id} onClick={() => pick(s)} className="block w-full px-3 py-2 text-left text-[13px] hover:opacity-80">
                <b>{s.title}</b> <span style={{ color: "var(--of-muted)" }}>{s.content.slice(0, 90)}</span>
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ta}
          value={text}
          onChange={(e) => (setText(e.target.value), scriptId && setScriptId(null))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (slash !== null && slashList[0]) pick(slashList[0]);
              else send();
            }
          }}
          rows={medias.length ? 2 : 3}
          placeholder={t('Press "/" + keyword to quickly search scripts')}
          className="mt-3 w-full resize-none bg-transparent text-[15px] outline-none"
        />
        {tr ? (
          <div className="mb-2">
            <p className="rounded-md px-3 py-2 text-[14px]" style={{ background: "var(--pro-chip)" }}>{tr.text}</p>
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <button onClick={() => send(tr.text)} className="rounded-full px-3 py-1 text-white" style={{ background: BLUE }}>{t("Send translation")}</button>
              <button onClick={() => (setText(tr.text), setTr(null))} className="rounded-full px-3 py-1" style={{ background: "var(--pro-chip)", color: BLUE }}>{t("Use translation")}</button>
              <div className="relative">
                <button onClick={() => setLangOpen(!langOpen)} className="rounded-full px-3 py-1" style={{ background: "var(--pro-chip)" }}>
                  {t(LANGS.find((l) => l[0] === lang)?.[1] || "French")} ›
                </button>
                {langOpen ? (
                  <div className="absolute bottom-full left-0 z-30 mb-1 w-36 rounded-md border py-1 shadow-xl" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
                    {LANGS.map(([k, l]) => (
                      <button key={k} onClick={() => (setLang(k), setLangOpen(false), localStorage.setItem("bloom.pro.lang", k))} className="block w-full px-3 py-1.5 text-left" style={k === lang ? { color: BLUE } : undefined}>
                        {t(l)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Boutons du bas */}
      <div className="flex items-center gap-4 px-4 pb-3" style={{ color: "var(--of-muted)" }}>
        <IconBtn title={t("Add media from Vault")} onClick={() => setPop("vault")}><Vault className="size-5" /></IconBtn>
        <IconBtn title={t("GIFs need a GIF API key")} onClick={() => toast(t("GIFs need a GIF API key (Giphy or Tenor)"), "err")}>
          <span className="rounded border px-0.5 text-[9px] font-bold">GIF</span>
        </IconBtn>
        <IconBtn title={t("Add media")} onClick={() => setPop("vault")}><ImageIcon className="size-5" /></IconBtn>
        <IconBtn title={t("Schedule message")} onClick={() => setPop("schedule")}><CalendarCheck className="size-5" /></IconBtn>
        <IconBtn title={t("Message price")} onClick={() => (medias.length ? setPop("price") : toast(t("Add at least one media for a PPV"), "err"))}><Tag className="size-5" /></IconBtn>
        <IconBtn title={t("Tag other Creator(s)")} onClick={() => setPop("tag")}><AtSign className="size-5" /></IconBtn>
        <IconBtn title={t("Insert the fan's first name")} onClick={() => insert("{prenom}")}><Type className="size-5" /></IconBtn>
        <IconBtn title={t(trOn ? "Turn off translation suggestions" : "Turn on translation suggestions")} onClick={() => setTrOn(!trOn)}>
          <Languages className="size-5" style={trOn ? { color: BLUE } : undefined} />
        </IconBtn>
        <span className="flex-1" />
        {ready ? (
          <button onClick={clear} className="h-9 rounded-full border px-4 text-[14px]" style={{ borderColor: "var(--pro-line)", color: "var(--of-text)" }}>
            {t("Clear")}
          </button>
        ) : null}
        <button onClick={() => send()} disabled={!ready || sending} className="h-9 rounded-full px-5 text-[15px] text-white disabled:opacity-50" style={{ background: ready ? BLUE : "var(--pro-chip)" }}>
          {t("Send")}
        </button>
      </div>

      {pop === "vault" ? <VaultPicker modelId={conv.modelId} memberId={conv.memberId} selected={medias} onClose={() => setPop(null)} onPick={(m) => (setMedias(m), setPop(null))} /> : null}
      {pop === "price" ? <PriceModal convId={conv.id} value={price} onSave={(v) => (setPrice(v), setPop(null))} onClose={() => setPop(null)} t={t} /> : null}
      {pop === "timed" ? <TimedModal conv={conv} text={text} medias={medias} price={price} onDone={() => (clear(), setPop(null))} onClose={() => setPop(null)} t={t} /> : null}
      {pop === "schedule" ? <ScheduleModal conv={conv} text={text} medias={medias} price={price} onDone={() => (clear(), setPop(null))} onClose={() => setPop(null)} t={t} /> : null}
      {pop === "tag" ? <TagModal model={model} onClose={() => setPop(null)} t={t} /> : null}
      <span className="hidden">{me.name}</span>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="grid size-6 place-items-center hover:opacity-80">
      {children}
    </button>
  );
}

function EmojiPicker({ onPick, onClose, t }: { onPick: (e: string) => void; onClose: () => void; t: (s: string) => string }) {
  const [cat, setCat] = useState(CATEGORIES[0].key);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem("bloom.pro.emojis") || "[]"));
    } catch {}
  }, []);
  const use = (e: string) => {
    onPick(e);
    const n = [e, ...recent.filter((x) => x !== e)].slice(0, 24);
    setRecent(n);
    try {
      localStorage.setItem("bloom.pro.emojis", JSON.stringify(n));
    } catch {}
  };
  const c = CATEGORIES.find((x) => x.key === cat)!;
  const list = q ? CATEGORIES.flatMap((x) => x.list.split(" ")).filter((e) => e.includes(q)) : c.list.split(" ");
  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div className="absolute bottom-full left-3 z-40 mb-1 w-[400px] rounded-lg border p-3 shadow-2xl" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
        <label className="flex h-9 items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--pro-line)" }}>
          <Search className="size-4" style={{ color: "var(--of-muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </label>
        <div className="mt-3 flex justify-between text-[18px]">
          <button onClick={() => (setCat("recent"), setQ(""))} title={t("Recent")} className="opacity-70">🕘</button>
          {CATEGORIES.map((x) => (
            <button key={x.key} onClick={() => (setCat(x.key), setQ(""))} title={t(x.label)} style={{ opacity: cat === x.key ? 1 : 0.6 }}>
              {x.icon}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[14px] font-semibold">{cat === "recent" ? t("Recent") : t(c.label)}</p>
        <div className="of-scroll mt-2 grid max-h-[240px] grid-cols-9 gap-1 overflow-y-auto text-[24px]">
          {(cat === "recent" ? recent : list).map((e, i) => (
            <button key={`${e}-${i}`} onClick={() => use(e)} className="rounded hover:bg-white/10">
              {e}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function Modal({ title, children, footer, onClose, wide }: { title: string; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className={`flex max-h-[90vh] w-full flex-col rounded-xl ${wide ? "max-w-[620px]" : "max-w-[520px]"}`} style={{ background: "var(--pro-pop)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="px-5 pt-4 pb-3 text-[16px] font-semibold">{title}</h3>
        <div className="of-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--pro-line)" }}>{footer}</div> : null}
      </div>
    </div>
  );
}
const Btn = ({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled} className="h-9 rounded-md border px-4 text-[14px] disabled:opacity-40" style={primary ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--pro-line)" }}>
    {children}
  </button>
);

/** « Message price » : prix du pack (3 $ minimum ou gratuit) + derniers PPV achetés par le fan. */
function PriceModal({ convId, value, onSave, onClose, t }: { convId: string; value: number; onSave: (cents: number) => void; onClose: () => void; t: (s: string) => string }) {
  const [v, setV] = useState(value ? String(value / 100) : "");
  const [hist, setHist] = useState<{ price: number; isPaid: boolean; createdAt: string }[] | null>(null);
  useEffect(() => {
    api<{ bundles: { price: number; isPaid: boolean; createdAt: string }[] }>("GET", `/api/conversations/${convId}/ppv`).then((r) => setHist(r.bundles.filter((b) => b.isPaid))).catch(() => setHist([]));
  }, [convId]);
  const cents = Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const ok = !v || cents >= 300;
  const max = hist?.length ? Math.max(...hist.map((h) => h.price)) : 0;
  const avg = hist?.length ? hist.reduce((a, h) => a + h.price, 0) / hist.length : 0;
  return (
    <Modal title={t("Message price")} onClose={onClose} footer={<><Btn onClick={onClose}>{t("Cancel")}</Btn><Btn primary disabled={!ok} onClick={() => onSave(cents)}>{t("Save")}</Btn></>}>
      <div className="px-5 pb-4">
        <p className="text-[14px] font-semibold">{t("Price")}</p>
        <label className="mt-2 flex h-10 items-center gap-2 rounded-md border px-3" style={{ borderColor: BLUE }}>
          <span>$</span>
          <input autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={t("Free")} className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <p className="mt-1 text-[12px]" style={{ color: ok ? "var(--of-muted)" : "#f26b6b" }}>{t("Minimum $3 USD or free")} · {t("The price is for the whole pack")}</p>
        <p className="mt-5 flex justify-between text-[13px]" style={{ color: "var(--of-muted)" }}>
          {t("Last PPV messages purchased by fan")}
          <span>
            Max: <b style={{ color: "#f7a14a" }}>{money(max)}</b> Avg: <b style={{ color: "#f7a14a" }}>{money(Math.round(avg))}</b>
          </span>
        </p>
        <div className="mt-2 rounded-md border p-3" style={{ borderColor: "var(--pro-line)" }}>
          {hist && hist.length ? (
            hist.slice(0, 8).map((h, i) => (
              <p key={i} className="flex justify-between py-1 text-[13px]">
                <span>{new Date(h.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <b>{money(h.price)}</b>
              </p>
            ))
          ) : (
            <p className="py-6 text-center text-[13px]" style={{ color: "var(--of-muted)" }}>{hist ? t("No PPV purchase history") : t("Loading…")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** « Set a timed message » / « Timed reminder » (1 à 60 min). */
function TimedModal({ conv, text, medias, price, onDone, onClose, t }: { conv: Conv; text: string; medias: Media[]; price: number; onDone: () => void; onClose: () => void; t: (s: string) => string }) {
  const [mode, setMode] = useState<"message" | "reminder">("message");
  const [min, setMin] = useState("1");
  const [msg, setMsg] = useState(text);
  const [sound, setSound] = useState("1");
  const n = Math.min(60, Math.max(1, Number(min) || 1));
  const start = async () => {
    if (mode === "reminder") {
      const who = conv.nickname || conv.memberName || "Fan";
      setTimeout(() => {
        beep(Number(sound));
        toast(`${t("Reminder")} : ${who}`);
        if ("Notification" in window && Notification.permission === "granted") new Notification(`${t("Reminder")} : ${who}`);
      }, n * 60_000);
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      toast(`${t("Reminder set in")} ${n} min`);
      return onClose();
    }
    try {
      await api("POST", "/api/pro/timed", { conv: conv.id, minutes: n, text: msg, mediaIds: medias.map((m) => m.id), price: price ? price / 100 : 0 });
      toast(`${t("Message will be sent in")} ${n} min`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <Modal
      title={t(mode === "message" ? "Set a timed message" : "Set a timed reminder")}
      onClose={onClose}
      footer={<><Btn onClick={onClose}>{t("Cancel")}</Btn><Btn primary disabled={mode === "message" && !msg.trim() && !medias.length} onClick={start}>{t("Start")}</Btn></>}
    >
      <div className="flex gap-2 border-b px-5 pb-3" style={{ borderColor: "var(--pro-line)" }}>
        {(["message", "reminder"] as const).map((k) => (
          <button key={k} onClick={() => setMode(k)} className="rounded-full border px-4 py-1.5 text-[14px]" style={mode === k ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--pro-line)" }}>
            {t(k === "message" ? "Timed message" : "Timed reminder")}
          </button>
        ))}
      </div>
      <div className="px-5 py-4 text-[14px]">
        <p><span style={{ color: "#f26b6b" }}>*</span>{t("Send after (1–60 minutes):")}</p>
        <div className="mt-2 flex h-10 overflow-hidden rounded-md border" style={{ borderColor: "var(--pro-line)" }}>
          <input value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, "").slice(0, 2))} className="min-w-0 flex-1 bg-transparent px-3 outline-none" />
          <span className="grid place-items-center border-l px-4" style={{ borderColor: "var(--pro-line)" }}>{t("minute(s)")}</span>
        </div>
        {mode === "message" ? (
          <>
            <p className="mt-4"><span style={{ color: "#f26b6b" }}>*</span>{t("Message:")}</p>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder={t("Type a message…")} className="mt-2 w-full resize-none rounded-md border bg-transparent p-3 outline-none" style={{ borderColor: "var(--pro-line)" }} />
            <p className="mt-2 text-[13px]" style={{ color: "var(--of-muted)" }}>
              {medias.length ? `${medias.length} ${t("media")} · ${price ? money(price) : t("Free")}` : t("Media and price come from the composer")}
            </p>
          </>
        ) : (
          <>
            <p className="mt-4">{t("Alert sound:")}</p>
            <select value={sound} onChange={(e) => (setSound(e.target.value), beep(Number(e.target.value)))} className="mt-2 h-10 w-full rounded-md border bg-transparent px-3 outline-none" style={{ borderColor: "var(--pro-line)" }}>
              {[1, 2, 3].map((i) => (
                <option key={i} value={i} style={{ background: "#222" }}>Audio {i}</option>
              ))}
            </select>
          </>
        )}
      </div>
    </Modal>
  );
}
function beep(kind: number) {
  try {
    const ctx = new AudioContext();
    const notes = kind === 2 ? [660, 880] : kind === 3 ? [523, 659, 784] : [880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.17);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
  } catch {}
}

/** « Schedule message » : jour puis heure. */
function ScheduleModal({ conv, text, medias, price, onDone, onClose, t }: { conv: Conv; text: string; medias: Media[]; price: number; onDone: () => void; onClose: () => void; t: (s: string) => string }) {
  const now = new Date();
  const [step, setStep] = useState<"day" | "time">("day");
  const [day, setDay] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [time, setTime] = useState(() => {
    const d = new Date(Date.now() + 15 * 60_000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - first.getDay() + i));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (() => {
    const [h, m] = time.split(":").map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0).getTime();
  })();
  const save = async () => {
    if (!text.trim() && !medias.length) return toast(t("Write the message in the composer first"), "err");
    try {
      await api("POST", "/api/pro/timed", { conv: conv.id, at, text, mediaIds: medias.map((m) => m.id), price: price ? price / 100 : 0 });
      toast(`${t("Message scheduled for")} ${new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <Modal
      title={t("Schedule message")}
      onClose={onClose}
      footer={<><Btn onClick={onClose}>{t("Cancel")}</Btn>{step === "day" ? <Btn primary onClick={() => setStep("time")}>{t("Next")}</Btn> : <Btn primary disabled={at < Date.now() + 60_000} onClick={save}>{t("Schedule")}</Btn>}</>}
    >
      <div className="grid grid-cols-2 border-b text-center text-[14px]" style={{ borderColor: "var(--pro-line)" }}>
        <button onClick={() => setStep("day")} className="border-b-2 py-2.5" style={step === "day" ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent" }}>
          {day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
        </button>
        <button onClick={() => setStep("time")} className="border-b-2 py-2.5" style={step === "time" ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent" }}>
          {new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </button>
      </div>
      {step === "day" ? (
        <div className="px-5 py-3">
          <div className="flex items-center justify-between text-[14px]">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <b>{month.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</b>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[13px]">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d} className="py-1 font-semibold">{d}</span>
            ))}
            {cells.map((d) => {
              const off = d < today || d.getMonth() !== month.getMonth() || d.getTime() > today.getTime() + 30 * 864e5;
              const on = d.toDateString() === day.toDateString();
              return (
                <button key={d.toISOString()} disabled={off} onClick={() => setDay(d)} className="mx-auto grid size-8 place-items-center rounded disabled:opacity-30" style={on ? { background: BLUE, color: "#fff" } : undefined}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid place-items-center px-5 py-8">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 rounded-md border bg-transparent px-4 text-[18px] outline-none" style={{ borderColor: "var(--pro-line)", colorScheme: "dark" }} />
          <p className="mt-3 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Bloom sends it at this time, with the composer's text, media and price.")}</p>
        </div>
      )}
    </Modal>
  );
}

/** « Tag other Creator(s) » : pas encore possible via Substy (affiché comme Infloww). */
function TagModal({ model, onClose, t }: { model: Model; onClose: () => void; t: (s: string) => string }) {
  const [tab, setTab] = useState<"tag" | "release">("tag");
  return (
    <Modal title={t("Tag other Creator(s)")} onClose={onClose} footer={<Btn onClick={onClose}>{t("Close")}</Btn>}>
      <div className="flex gap-2 border-b px-5 pb-3" style={{ borderColor: "var(--pro-line)" }}>
        {(["tag", "release"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className="rounded-full border px-4 py-1.5 text-[14px]" style={tab === k ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--pro-line)" }}>
            {t(k === "tag" ? "Tag user" : "Release form")}
          </button>
        ))}
      </div>
      <div className="grid place-items-center px-5 py-12 text-center text-[14px]" style={{ color: "var(--of-muted)" }}>
        <NotebookText className="mb-3 size-10" />
        {tab === "tag" ? `${t("Tagging creators is not available with Substy yet")} (${model.displayName})` : t("No release forms yet")}
      </div>
    </Modal>
  );
}

export const _unused = Copy;
