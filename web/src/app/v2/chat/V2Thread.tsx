"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, ChevronUp, FileText, Image as ImageIcon, Loader2, Lock, LockOpen, MailOpen, MailWarning, Mic, PanelRightClose, PanelRightOpen, Pencil, Pin, PinOff, SendHorizontal, SkipForward, Sparkles, Trash2, Video, X } from "lucide-react";
import { api, ClientError, mediaThumb, toast } from "@/rv/lib/client";
import { clock, curOf, dur, durSec, money, waitTone } from "@/rv/lib/fmt";
import { pollMs } from "@/rv/lib/perf";
import { debounce, onLive } from "@/rv/lib/liveClient";
import { clearDraft, getDraft, setDraft } from "@/rv/lib/draft";
import { fillVars } from "@/rv/lib/vars";
import { useQuickEmojis } from "@/rv/lib/useConfig";
import { Avatar } from "@/rv/components/ui";
import { MediaTile } from "@/rv/components/MediaTile";
import { AI_EVENT } from "@/rv/inbox/SubstyCard";
import { LibraryPicker, SequenceBar } from "@/rv/inbox/LibraryPicker";
import { VaultPicker } from "@/rv/inbox/VaultPicker";
import type { Conv, LiveMsg, Media, Model } from "@/rv/inbox/types";
import type { Lib, LibScript, LibSequence } from "@/rv/inbox/scriptTypes";

// Bloom v2 : le fil d'une conversation et la zone d'écriture, les mêmes pour OnlyFans et MYM (moteur « /api/rv/… »).
type Me = { id: number; name: string; admin: boolean };
type MsgResp = { data: LiveMsg[]; pageInfo: { hasNextPage: boolean; endCursor: string } | null; memberLastReadAt?: string | null; sentBy?: Record<string, string> };
const DEFAULT_EMOJIS = ["❤️", "😘", "😏", "🔥", "🥰", "😈", "😂", "🙈", "💋", "👀", "🥵", "😇"];
type By = { kind: string; name: string } | null;
export type ThreadActions = { pinned: boolean; onPin: () => void; fresh: boolean; onReadToggle: () => void; panelOpen: boolean; onPanel: () => void };

export function V2Thread({ conv, me, model, aiWriting, onBack, onSent, onNext, actions }: { conv: Conv; me: Me; model?: Model; aiWriting: boolean; onBack: () => void; onSent: () => void; onNext: () => void; actions: ThreadActions }) {
  const mym = /mym/i.test(model?.platform || "");
  const cur = curOf(conv.modelId);
  const hasAi = !String(conv.modelId).startsWith("mym-");
  const [msgs, setMsgs] = useState<LiveMsg[] | null>(null);
  const [older, setOlder] = useState<LiveMsg[]>([]);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sentBy, setSentBy] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [fanTyping, setFanTyping] = useState(false);
  const [nick, setNick] = useState<string | null>(conv.nickname);
  const [renaming, setRenaming] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);

  // IA de Substy sur ce fan.
  const [ai, setAi] = useState(!!conv.ai);
  useEffect(() => setAi(!!conv.ai), [conv.id, conv.ai]);
  useEffect(() => {
    const on = (e: Event) => {
      const x = (e as CustomEvent<{ id: string; on: boolean }>).detail;
      if (x?.id === conv.id) setAi(x.on);
    };
    window.addEventListener(AI_EVENT, on);
    return () => window.removeEventListener(AI_EVENT, on);
  }, [conv.id]);
  const toggleAi = async () => {
    const on = !ai;
    setAi(on);
    try {
      await api("POST", `/api/conversations/${conv.id}/action`, { action: "ai", on });
      window.dispatchEvent(new CustomEvent(AI_EVENT, { detail: { id: conv.id, on } }));
      toast(on ? "IA rallumée sur ce fan" : "IA coupée : tu réponds à la main");
    } catch (e) {
      setAi(!on);
      toast((e as Error).message, "err");
    }
  };

  // Le fan écrit (le serveur regarde tant que la conversation est ouverte).
  useEffect(() => {
    setFanTyping(false);
    let clear: ReturnType<typeof setTimeout> | null = null;
    const watch = () => fetch(`/api/rv/conversations/${conv.id}/watch`, { method: "POST", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setFanTyping(!!d.typing)).catch(() => {});
    watch();
    const t = setInterval(watch, 20_000);
    const off = onLive("typing", (d) => {
      if (d.id !== conv.id) return;
      setFanTyping(!!d.typing);
      if (clear) clearTimeout(clear);
      if (d.typing) clear = setTimeout(() => setFanTyping(false), 15_000);
    });
    return () => {
      clearInterval(t);
      off();
      if (clear) clearTimeout(clear);
      fetch(`/api/rv/conversations/${conv.id}/watch?off=1`, { method: "POST", keepalive: true }).catch(() => {});
    };
  }, [conv.id]);

  const loadMsgs = useCallback(async () => {
    try {
      const r = await api<MsgResp>("GET", `/api/conversations/${conv.id}/messages`);
      setMsgs([...r.data].reverse());
      if (r.sentBy) setSentBy((s) => ({ ...s, ...r.sentBy }));
      if (r.memberLastReadAt !== undefined) setReadAt(r.memberLastReadAt ?? null);
      setCursor((c) => c ?? (r.pageInfo?.hasNextPage ? r.pageInfo.endCursor : ""));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [conv.id]);
  useEffect(() => {
    loadMsgs();
    api<{ sentBy: Record<string, string>; firstName: string | null }>("GET", `/api/conversations/${conv.id}`).then((d) => (setSentBy((s) => ({ ...s, ...d.sentBy })), setFirstName(d.firstName ?? null))).catch(() => {});
    const lock = () => api<{ ok: boolean; lock?: { name: string } }>("POST", `/api/conversations/${conv.id}/action`, { action: "lock" }).then((r) => setLockedBy(r.ok ? null : r.lock?.name ?? null)).catch(() => {});
    lock();
    const reload = debounce(() => loadMsgs(), 250);
    const a = onLive("conv", (d) => d.id === conv.id && reload());
    const b = onLive("open", () => reload());
    const t1 = setInterval(() => document.visibilityState === "visible" && loadMsgs(), pollMs(20_000));
    const t2 = setInterval(lock, 45_000);
    return () => (a(), b(), clearInterval(t1), clearInterval(t2));
  }, [conv.id, loadMsgs]);
  useLayoutEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs, fanTyping, aiWriting]);
  const loadOlder = async () => {
    if (!cursor || !box.current) return;
    const h = box.current.scrollHeight;
    try {
      const r = await api<MsgResp>("GET", `/api/conversations/${conv.id}/messages?cursor=${encodeURIComponent(cursor)}`);
      setOlder((o) => [...[...r.data].reverse(), ...o]);
      setCursor(r.pageInfo?.hasNextPage ? r.pageInfo.endCursor : "");
      requestAnimationFrame(() => box.current && (box.current.scrollTop = box.current.scrollHeight - h));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  // --- écriture
  const [text, setText] = useState("");
  const [medias, setMedias] = useState<Media[]>([]);
  const [price, setPrice] = useState("");
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<null | "vault" | "scripts">(null);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const agencyEmojis = useQuickEmojis();
  const quick = agencyEmojis.length ? agencyEmojis : DEFAULT_EMOJIS;
  const priceCents = Math.round(Number(String(price).replace(",", ".")) * 100) || 0;
  useEffect(() => {
    setText(getDraft(conv.id));
    ta.current?.focus();
  }, [conv.id]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(220, Math.max(44, el.scrollHeight)) + "px";
  }, [text]);
  const onType = (v: string) => {
    setText(v);
    setDraft(conv.id, v);
    if (Date.now() - lastTyping.current > 5000 && v) {
      lastTyping.current = Date.now();
      api("POST", `/api/conversations/${conv.id}/action`, { action: "typing" }).catch(() => {});
    }
  };
  const insert = (e: string) => {
    const el = ta.current;
    const s = el?.selectionStart ?? text.length;
    const en = el?.selectionEnd ?? text.length;
    onType(text.slice(0, s) + e + text.slice(en));
    requestAnimationFrame(() => el && (el.focus(), el.setSelectionRange(s + e.length, s + e.length)));
  };
  const withVars = (t: string) => {
    const r = fillVars(t, { prenom: firstName });
    if (r.missing) toast("Prénom du fan inconnu : {prénom} retiré du message. Ajoute « Prénom : … » dans sa fiche.", "err");
    return r.text;
  };

  // --- scripts et séquences de Bloom pour cette modèle et ce fan
  const [lib, setLib] = useState<Lib | null>(null);
  const [active, setActive] = useState<{ seq: LibSequence; step: number } | null>(null);
  const scriptsById = useMemo(() => new Map((lib?.scripts ?? []).map((s) => [s.id, s])), [lib]);
  const loadLib = useCallback(async () => {
    try {
      const l = await api<Lib>("GET", `/api/models/${conv.modelId}/library?conv=${conv.id}`);
      setLib(l);
      return l;
    } catch {
      return null;
    }
  }, [conv.modelId, conv.id]);
  useEffect(() => {
    loadLib().then((l) => {
      const p = l?.progress.find((x) => x.active);
      const seq = p && l?.sequences.find((q) => q.id === p.sequenceId);
      if (p && seq) setActive({ seq, step: p.step });
    });
  }, [loadLib]);
  const saveProgress = (seqId: number, step: number, on: boolean) => api("POST", `/api/conversations/${conv.id}/sequence`, { sequenceId: seqId, step, active: on }).catch(() => {});
  const goStep = (n: number) => {
    if (!active) return;
    const step = Math.max(0, Math.min(active.seq.steps.length, n));
    setActive({ ...active, step });
    saveProgress(active.seq.id, step, true);
  };

  const doSend = async (p: { content: string; medias: Media[]; price: number; scriptId: number | null }) => {
    setSending(true);
    try {
      const r = await api<{ message: { id: string }; waitedMs: number | null }>("POST", `/api/conversations/${conv.id}/send`, { content: p.content, mediaIds: p.medias.map((m) => m.id), price: p.price || undefined, scriptId: p.scriptId ?? undefined });
      setSentBy((s) => ({ ...s, [r.message.id]: me.name }));
      toast(p.price ? `Message payant envoyé · ${money(p.price, 2, cur)}` : r.waitedMs != null ? `Envoyé · répondu en ${dur(r.waitedMs)}` : "Envoyé");
      stick.current = true;
      onSent();
      loadMsgs();
      if (p.scriptId) loadLib();
      return true;
    } catch (e) {
      const err = e as ClientError;
      const w = err.warning as { detected?: string[] } | undefined;
      toast(w?.detected?.length ? `Mot interdit : ${w.detected.join(", ")}` : `Envoi impossible : ${err.message}`, "err");
      return false;
    } finally {
      setSending(false);
      ta.current?.focus();
    }
  };
  const send = async () => {
    const content = text.trim();
    if (sending || (!content && !medias.length)) return;
    if (priceCents && !medias.length) return toast("Ajoute au moins un média pour un message payant", "err");
    if (price && priceCents < 100) return toast("Prix minimum : 1", "err");
    if (!(await doSend({ content, medias, price: priceCents, scriptId }))) return;
    setText("");
    setMedias([]);
    setPrice("");
    clearDraft(conv.id);
    if (active && scriptId && active.seq.steps[active.step] === scriptId) goStep(active.step + 1);
    setScriptId(null);
  };
  const applyScript = (s: LibScript) => {
    const seq = lib?.sequences.find((q) => q.isSequence && q.steps.includes(s.id));
    if (seq && (!active || active.seq.id !== seq.id || active.seq.steps[active.step] !== s.id)) {
      const step = seq.steps.indexOf(s.id);
      setActive({ seq, step });
      saveProgress(seq.id, step, true);
    }
    const content = withVars(s.content || "");
    setText(content);
    setDraft(conv.id, content);
    setMedias(s.medias ?? []);
    setPrice(s.price ? String(s.price / 100) : "");
    setScriptId(s.id);
    setPanel(null);
    ta.current?.focus();
  };
  const startSequence = (q: LibSequence, at?: number) => {
    const prev = lib?.progress.find((p) => p.sequenceId === q.id);
    const step = at !== undefined ? at : prev && prev.step < q.steps.length ? prev.step : 0;
    setActive({ seq: q, step });
    saveProgress(q.id, step, true);
    setPanel(null);
  };
  const sendStep = async (s: LibScript) => {
    if (!active || sending) return;
    if (await doSend({ content: withVars(s.content), medias: s.medias, price: s.price ?? 0, scriptId: s.id })) goStep(active.step + 1);
  };
  const remove = async (it: LiveMsg) => {
    if (!confirm("Supprimer ce message ? Il disparaît aussi chez le fan, et c’est définitif.")) return;
    try {
      await api("DELETE", `/api/conversations/${conv.id}/messages/${it.message.id}`);
      toast("Message supprimé");
      loadMsgs();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const rename = async () => {
    if (renaming === null) return;
    try {
      const r = await api<{ nickname: string | null }>("POST", `/api/conversations/${conv.id}/action`, { action: "nickname", nickname: renaming });
      setNick(r.nickname);
      onSent();
    } catch (e) {
      toast((e as Error).message, "err");
    }
    setRenaming(null);
  };

  // Temps d'attente du fan, rafraîchi toutes les 10 s.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const waiting = conv.needsReply && conv.waitingSince ? Math.max(0, now - Date.parse(conv.waitingSince)) : null;
  const tone = waiting === null ? null : waitTone(waiting);
  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...older, ...(msgs ?? [])].filter((m) => (seen.has(m.message.id) ? false : (seen.add(m.message.id), true)));
  }, [older, msgs]);
  const name = nick || conv.memberName || "Fan";
  const online = !!conv.lastSeenAt && Date.now() - Date.parse(conv.lastSeenAt) < 10 * 60_000;
  let lastDay = "";
  const icon = "grid size-9 place-items-center rounded-xl text-muted transition hover:bg-white/[0.06] hover:text-fg";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* En-tête */}
      <header className="flex h-[66px] shrink-0 items-center gap-3 border-b px-3 md:px-5" style={{ borderColor: "var(--color-line)", background: "var(--color-panel)", backdropFilter: "blur(14px)" }}>
        <button onClick={onBack} className={`${icon} md:hidden`} aria-label="Retour"><ArrowLeft className="size-4" /></button>
        <span className="relative size-10 shrink-0">
          <Avatar src={conv.memberAvatar} name={name} size="size-10" />
          {online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2" style={{ background: "#34d399", borderColor: "var(--color-bg)" }} title="En ligne : le fan vient d’écrire" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          {renaming !== null ? (
            <input autoFocus value={renaming} maxLength={40} onChange={(e) => setRenaming(e.target.value)} onBlur={rename} onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" ? setRenaming(null) : null)} placeholder={conv.memberName || "Surnom"} className="h-8 w-full max-w-[240px] rounded-lg border bg-transparent px-2 text-[14px] font-semibold outline-none" style={{ borderColor: "var(--v2-blue)" }} />
          ) : (
            <button onClick={() => setRenaming(nick || "")} title="Donner un surnom à ce fan (visible par l’équipe seulement)" className="group flex max-w-full items-center gap-1.5 text-left">
              <b className="truncate text-[15px] tracking-[-0.01em]">{name}</b>
              <Pencil className="size-3 shrink-0 opacity-0 transition group-hover:opacity-60" />
            </button>
          )}
          <p className="flex items-center gap-2 truncate text-[12px] text-muted">
            {nick && conv.memberName && nick !== conv.memberName ? <span className="truncate">@{conv.memberName}</span> : null}
            <span className="font-semibold" style={{ color: conv.totalSpent > 0 ? "#34d399" : undefined }}>{money(conv.totalSpent, 0, cur)} dépensés</span>
            {model ? <span className="hidden truncate sm:inline">· {model.displayName}</span> : null}
          </p>
        </div>
        {lockedBy ? <span className="hidden items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold sm:flex" style={{ background: "rgb(59 130 246 / 0.14)", color: "var(--v2-sky)" }}><Lock className="size-3" /> {lockedBy} est dessus</span> : null}
        {waiting !== null ? <span className="v2-wait hidden sm:inline-flex" data-tone={tone ?? "bad"}>attend {durSec(waiting)}</span> : null}
        {hasAi ? (
          <button onClick={toggleAi} title={ai ? "L’IA répond à ce fan. Clique pour la couper et répondre toi-même." : "L’IA est coupée sur ce fan. Clique pour la rallumer."} className="v2-ai flex h-9 shrink-0 items-center gap-2 rounded-xl border px-2.5 text-[12px] font-semibold" data-on={ai}>
            <Sparkles className="size-3.5" /><span className="hidden lg:inline">IA</span><i><b /></i>
          </button>
        ) : null}
        <div className="flex shrink-0 items-center">
          <button onClick={actions.onPin} title={actions.pinned ? "Désépingler ce fan (l’IA le reprend)" : "Épingler ce fan : il reste en haut de la liste et l’IA est coupée sur lui"} className={icon} style={actions.pinned ? { color: "var(--v2-sky)" } : undefined}>{actions.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</button>
          <button onClick={actions.onReadToggle} title={actions.fresh ? "Marquer comme lu" : "Marquer comme non lu"} className={icon}>{actions.fresh ? <MailOpen className="size-4" /> : <MailWarning className="size-4" />}</button>
          <button onClick={onNext} title="Fan suivant à répondre (Tab)" className={`${icon} hidden sm:grid`}><SkipForward className="size-4" /></button>
          <button onClick={actions.onPanel} title={actions.panelOpen ? "Masquer la fiche du fan" : "Afficher la fiche du fan"} className={`${icon} hidden lg:grid`}>{actions.panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}</button>
        </div>
      </header>

      {/* Messages */}
      <div ref={box} onScroll={(e) => (stick.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 120)} className="v2-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-5 md:px-8">
        {cursor ? <button onClick={loadOlder} className="mx-auto mb-3 flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-[12px] font-medium text-muted transition hover:text-fg" style={{ borderColor: "var(--color-line)", background: "var(--color-card)" }}><ChevronUp className="size-3.5" /> Messages plus anciens</button> : null}
        {error && !msgs ? <p className="m-auto max-w-sm text-center text-[13px]" style={{ color: "#fb7185" }}>{error}</p> : null}
        {!msgs && !error ? <Loader2 className="m-auto size-6 animate-spin text-muted" /> : null}
        {all.map((it, i) => {
          const d = new Date(it.message.createdAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          const sep = d !== lastDay ? ((lastDay = d), <p className="my-4 flex items-center gap-3 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase"><i className="h-px flex-1" style={{ background: "var(--color-line)" }} />{d}<i className="h-px flex-1" style={{ background: "var(--color-line)" }} /></p>) : null;
          const prev = all[i - 1];
          const next = all[i + 1];
          const fan = !!it.authorMessage?.memberId;
          const sameAsNext = !!next && !!next.authorMessage?.memberId === fan && Date.parse(next.message.createdAt) - Date.parse(it.message.createdAt) < 3 * 60_000 && next.message.type !== "information";
          const sameAsPrev = !!prev && !sep && !!prev.authorMessage?.memberId === fan && Date.parse(it.message.createdAt) - Date.parse(prev.message.createdAt) < 3 * 60_000;
          return (
            <div key={it.message.id} className="contents">
              {sep}
              <Bubble it={it} fan={fan} cur={cur} sentBy={sentBy[it.message.id]} seen={readAt ? Date.parse(it.message.createdAt) <= Date.parse(readAt) : false} tail={!sameAsNext} joined={sameAsPrev} canDelete={mym} onDelete={() => remove(it)} fresh={i >= all.length - 2} />
            </div>
          );
        })}
        {fanTyping ? <div className="mt-1 flex items-center gap-2 self-start rounded-2xl rounded-bl-md px-4 py-3" style={{ background: "var(--color-bubble-fan)" }}><span className="v2-dots"><i /><i /><i /></span></div> : null}
        {aiWriting ? <div className="mt-1 flex items-center gap-2 self-end rounded-2xl rounded-br-md px-4 py-2.5 text-[12.5px] font-semibold" style={{ background: "rgb(59 130 246 / 0.12)", color: "var(--v2-sky)" }}><Sparkles className="size-3.5" /> L’IA écrit <span className="v2-dots"><i /><i /><i /></span></div> : null}
      </div>

      {/* Zone d'écriture */}
      <div className="shrink-0 px-3 pb-3 md:px-6 md:pb-5">
        {conv.canSend === false ? <p className="mb-2 rounded-xl px-3 py-2 text-[12.5px]" style={{ background: "rgb(251 191 36 / 0.1)", color: "#fbbf24" }}>Ce fan ne peut pas recevoir de message pour l’instant (désabonné ou bloqué).</p> : null}
        {active ? <div className="mb-2"><SequenceBar seq={active.seq} step={active.step} scripts={scriptsById} sending={sending} onStep={goStep} onSend={sendStep} onEdit={applyScript} onClose={() => (saveProgress(active.seq.id, active.step, false), setActive(null))} /></div> : null}
        <div className="v2-composer">
          {medias.length ? (
            <div className="flex items-center gap-2 overflow-x-auto border-b p-2.5" style={{ borderColor: "var(--color-line)" }}>
              {medias.map((m) => (
                <span key={m.id} className="relative shrink-0">
                  <MediaTile m={m} className="size-14 rounded-xl" />
                  <button onClick={() => setMedias((x) => x.filter((y) => y.id !== m.id))} className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full text-white" style={{ background: "#121215", boxShadow: "0 0 0 1px rgb(255 255 255 / 0.12)" }}><X className="size-3" /></button>
                </span>
              ))}
              <label className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-[12px] font-semibold text-muted">
                Prix
                <span className="relative">
                  <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="gratuit" inputMode="decimal" className="h-9 w-24 rounded-lg border bg-transparent pr-6 pl-2 text-right text-[13.5px] font-bold text-fg outline-none focus:border-(--v2-blue)" style={{ borderColor: "var(--color-input)" }} />
                  <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[12px]">{cur === "USD" ? "$" : "€"}</span>
                </span>
              </label>
            </div>
          ) : null}
          <textarea
            ref={ta}
            data-chat-input
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) (e.preventDefault(), send());
              else if (e.key === "Tab" && !text) (e.preventDefault(), onNext());
            }}
            placeholder={`Écrire à ${name}…`}
            className="v2-scroll block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[14.5px] leading-relaxed outline-none placeholder:text-muted/60"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <button onClick={() => setPanel(panel === "vault" ? null : "vault")} title="Ajouter des photos ou vidéos (message payant ou offert)" className="v2-tool" data-on={panel === "vault"}><ImageIcon className="size-4" /><span className="hidden sm:inline">Médias</span></button>
            <button onClick={() => setPanel(panel === "scripts" ? null : "scripts")} title="Scripts et séquences" className="v2-tool" data-on={panel === "scripts"}><FileText className="size-4" /><span className="hidden sm:inline">Scripts</span>{lib?.scripts.length ? <span className="rounded px-1 text-[10.5px] tabular-nums" style={{ background: "var(--color-card-2)" }} title="Scripts déjà envoyés à ce fan">{lib.scripts.filter((x) => x.usedWithFan).length}/{lib.scripts.length}</span> : null}</button>
            <span className="mx-1 hidden h-5 w-px sm:block" style={{ background: "var(--color-line)" }} />
            <div className="v2-noscroll flex min-w-0 flex-1 items-center overflow-x-auto">
              {quick.map((e, i) => <button key={`${e}-${i}`} type="button" onClick={() => insert(e)} className="grid size-8 shrink-0 place-items-center rounded-lg text-[17px] leading-none transition hover:scale-125 hover:bg-white/[0.06]" title={`Insérer ${e}`}>{e}</button>)}
            </div>
            <span className="hidden shrink-0 pr-1 text-[11px] text-muted xl:block">Entrée pour envoyer</span>
            <button onClick={send} disabled={sending || (!text.trim() && !medias.length)} title="Envoyer (Entrée)" className="v2-btn">{sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}<span>{priceCents ? `Envoyer · ${money(priceCents, 2, cur)}` : "Envoyer"}</span></button>
          </div>
        </div>
      </div>

      {panel === "vault" ? <VaultPicker modelId={conv.modelId} memberId={conv.memberId} selected={medias} onClose={() => setPanel(null)} onPick={(m) => setMedias(m)} /> : null}
      {panel === "scripts" ? <LibraryPicker lib={lib} onClose={() => setPanel(null)} onScript={applyScript} onSequence={startSequence} /> : null}
    </div>
  );
}

function Medias({ list }: { list: Media[] }) {
  if (!list.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {list.map((m) => {
        const src = mediaThumb(m);
        if (m.type === "audio" && m.url) return <audio key={m.id} controls preload="none" src={m.url} className="max-w-60" />;
        return (
          <a key={m.id} href={m.largeUrl || m.url || src} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt="" loading="lazy" className="max-h-48 max-w-48 object-cover transition duration-300 hover:scale-105" /> : <span className="grid size-24 place-items-center bg-black/40 text-[12px]">{m.type}</span>}
            {m.type === "video" ? <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold"><Video className="size-3" /> vidéo</span> : null}
          </a>
        );
      })}
    </div>
  );
}

/** Message payant : couverture floutée, contenu, prix, payé ou non. */
function Ppv({ b, cur }: { b: NonNullable<LiveMsg["bundleWithMedias"]>; cur: string }) {
  const [open, setOpen] = useState(false);
  const teasing = b.teasingMedias?.length ? b.teasingMedias : b.teasingMedia ? [b.teasingMedia] : [];
  const all = b.medias?.length ? b.medias : teasing;
  const paid = !!b.bundle.isPaid;
  const price = b.bundle.discountedPrice ?? b.bundle.price;
  const cover = teasing[0] ?? all[0];
  const src = cover ? mediaThumb(cover) : null;
  const n = (t: string) => all.filter((m) => m.type === t).length;
  return (
    <div className="mb-1.5 w-64 max-w-full overflow-hidden rounded-xl" style={{ background: "rgb(0 0 0 / 0.32)" }}>
      <button type="button" onClick={() => all.length && setOpen(true)} className="relative block aspect-[16/10] w-full overflow-hidden" title="Voir le contenu">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full scale-110 object-cover blur-xl" /> : null}
        <span className="absolute inset-0 grid place-items-center bg-black/25"><span className="grid size-12 place-items-center rounded-full bg-black/45 backdrop-blur">{paid ? <LockOpen className="size-5" style={{ color: "#34d399" }} /> : <Lock className="size-5 text-white" />}</span></span>
      </button>
      <div className="flex items-center gap-3 px-3 py-2 text-[12px]">
        {n("photo") ? <span className="flex items-center gap-1 opacity-70"><ImageIcon className="size-3.5" /> {n("photo")}</span> : null}
        {n("video") ? <span className="flex items-center gap-1 opacity-70"><Video className="size-3.5" /> {n("video")}</span> : null}
        {n("audio") ? <span className="flex items-center gap-1 opacity-70"><Mic className="size-3.5" /> {n("audio")}</span> : null}
        <span className="flex-1" />
        <b className="text-[14px] tabular-nums">{money(price, 2, cur)}</b>
        <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-bold" style={paid ? { background: "rgb(52 211 153 / 0.16)", color: "#34d399" } : { background: "rgb(251 191 36 / 0.14)", color: "#fbbf24" }}>{paid ? "Payé" : "En attente"}</span>
      </div>
      {open ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="v2-card flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[14px] font-bold">Message payant · {money(price, 2, cur)} · {all.length} média{all.length > 1 ? "s" : ""}</p>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:text-fg" aria-label="Fermer"><X className="size-5" /></button>
            </div>
            <div className="v2-scroll overflow-y-auto p-3"><Medias list={all} /></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Bubble({ it, fan, cur, sentBy, seen, tail, joined, canDelete, onDelete, fresh }: { it: LiveMsg; fan: boolean; cur: string; sentBy?: string; seen: boolean; tail: boolean; joined: boolean; canDelete: boolean; onDelete: () => void; fresh: boolean }) {
  const m = it.message;
  if (m.type === "information") return <p className="my-1.5 text-center text-[12px] text-muted">{m.content}</p>;
  const b = it.bundleWithMedias;
  const by = (it as LiveMsg & { by?: By }).by ?? null;
  const auto = !!by && ["ai", "auto", "script"].includes(by.kind);
  const who = fan ? null : sentBy ?? (by?.kind === "ai" ? "IA" : by?.kind === "auto" ? `${by.name} (automatique)` : by?.name ?? it.authorMessage?.displayName ?? null);
  const deletable = canDelete && !fan && !m.deletedAt && !b && !it.medias?.length && by?.name !== "Push";
  return (
    <div className={`group/msg flex max-w-[76%] flex-col ${fan ? "items-start self-start" : "items-end self-end"} ${joined ? "" : "mt-2"} ${fresh ? "v2-msg-in" : ""}`} title={new Date(m.createdAt).toLocaleString("fr-FR")}>
      <div className="flex items-center gap-1.5">
        {deletable ? <button onClick={onDelete} title="Supprimer ce message (il disparaît aussi chez le fan)" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted opacity-0 transition group-hover/msg:opacity-100 hover:text-[#fb7185]"><Trash2 className="size-3.5" /></button> : null}
        <div
          className={`px-3.5 py-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap ${fan ? "v2-bubble-fan" : auto ? "v2-bubble-ai" : "v2-bubble-me"}`}
          style={{ borderRadius: 18, ...(tail ? (fan ? { borderBottomLeftRadius: 6 } : { borderBottomRightRadius: 6 }) : {}), ...(m.type === "tips" ? { boxShadow: "inset 0 0 0 1px rgb(251 191 36 / 0.55)" } : {}), ...(m.deletedAt ? { boxShadow: "inset 0 0 0 1px rgb(251 113 133 / 0.5)", opacity: 0.8 } : {}) }}
        >
          {it.replyTo ? <p className="mb-1 border-l-2 pl-2 text-[12px] opacity-70" style={{ borderColor: "rgb(255 255 255 / 0.3)" }}>{it.replyTo.authorDisplayName} : {String(it.replyTo.content).slice(0, 90)}</p> : null}
          {b ? <Ppv b={b} cur={cur} /> : null}
          {m.deletedAt ? <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#fb7185" }}><Trash2 className="size-3" /> {fan || it.crmDeleted?.byFan ? "Supprimé par le fan" : "Message supprimé"}</span> : null}
          {m.type === "tips" ? "💸 " : ""}{m.content || (m.deletedAt ? <span className="italic opacity-70">{it.crmDeleted?.mediaCount ? `${it.crmDeleted.mediaCount} média(s)` : "Contenu non conservé"}</span> : "")}
          <Medias list={it.medias ?? []} />
        </div>
      </div>
      {tail ? (
        <span className="mt-1 flex items-center gap-1 px-1 text-[10.5px] text-muted">
          {auto ? <Sparkles className="size-3" style={{ color: "var(--v2-sky)" }} /> : null}
          {who ? <b className="font-semibold">{who}</b> : null}
          {who ? "·" : null} {clock(m.createdAt)}
          {!fan && !m.deletedAt ? seen ? <span title="Vu par le fan" style={{ color: "var(--v2-sky)" }}><CheckCheck className="size-3.5" /></span> : <span title="Envoyé, pas encore vu"><Check className="size-3.5" /></span> : null}
        </span>
      ) : null}
    </div>
  );
}
