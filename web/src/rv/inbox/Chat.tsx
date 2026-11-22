"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, ChevronDown, FileText, Image as ImageIcon, Lock, LockOpen, Loader2, MailWarning, Mic, PanelRightClose, PanelRightOpen, PanelTop, Pencil, Pin, PinOff, Plus, Reply, Send, Smile, Trash2, Video, X, Crown, Bot } from "lucide-react";
import { api, ClientError, mediaThumb, toast } from "@/rv/lib/client";
import { ago, clock, cn, dur, durSec, money, waitTone } from "@/rv/lib/fmt";
import { perfOn, pollMs } from "@/rv/lib/perf";
import { debounce, onLive } from "@/rv/lib/liveClient";
import { clearDraft, getDraft, setDraft } from "@/rv/lib/draft";
import { fillVars } from "@/rv/lib/vars";
import { useNow } from "@/rv/lib/useNow";
import { Avatar, Pill } from "@/rv/components/ui";
import type { Conv, LiveMsg, Media, Model } from "./types";
import type { Lib, LibScript, LibSequence } from "./scriptTypes";
import { AI_EVENT } from "./SubstyCard";
import { LibraryPicker, SequenceBar } from "./LibraryPicker";
import { VaultPicker } from "./VaultPicker";
import { BadgePicker } from "./BadgePicker";
import { FanAvatar } from "@/rv/components/FanAvatar";
import { MediaNotes, MediaTile } from "@/rv/components/MediaTile";
import { badgeOf } from "@/rv/lib/tiers";
import { useQuickEmojis, useVoiceConfig } from "@/rv/lib/useConfig";
import { segsToRaw, useDictation, type DictSeg } from "@/rv/lib/useDictation";
import { applyFixes, stylize, stylizeSegments } from "@/rv/lib/voice";

type Me = { id: number; name: string; admin: boolean };
/** Message en cours qui vient de la dictée : texte déjà écrit avant (`base`), phrases dictées, hasard figé, texte obtenu. */
type Dictation = { base: string; segs: DictSeg[]; seed: number; text: string };
/** La reconnaissance n'était pas sûre d'elle sur cette phrase (confiance connue et basse). */
const isDoubtful = (s: DictSeg) => s.conf > 0 && s.conf < 0.8;
type MsgResp = { data: LiveMsg[]; pageInfo: { hasNextPage: boolean; endCursor: string } | null; memberLastReadAt?: string | null; sentBy?: Record<string, string> };

export type ChatActions = {
  pinned: boolean;
  onPin: () => void;
  inTabs: boolean;
  onTab: () => void;
  fresh: boolean;
  onReadToggle: () => void;
  panelOpen: boolean;
  onPanel: () => void;
};

function ActBtn({ on, onClick, title, children, className }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className={cn("grid size-8 place-items-center rounded-lg transition-colors", on ? "bg-primary/20 text-primary-soft" : "text-muted hover:bg-white/[0.06] hover:text-fg", className)}>
      {children}
    </button>
  );
}

export function Chat({
  conv,
  me,
  model,
  autoNext,
  setAutoNext,
  onBack,
  onSent,
  onNext,
  actions,
}: {
  conv: Conv;
  me: Me;
  model?: Model;
  autoNext: boolean;
  setAutoNext: (v: boolean) => void;
  onBack: () => void;
  onSent: (o?: { inSequence?: boolean }) => void;
  onNext: () => void;
  actions: ChatActions;
}) {
  const [msgs, setMsgs] = useState<LiveMsg[] | null>(null);
  const [older, setOlder] = useState<LiveMsg[]>([]);
  // Dernière lecture du fan (Reveal) : nos messages envoyés avant = « vu ».
  const [readAt, setReadAt] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sentBy, setSentBy] = useState<Record<string, string>>({});
  // IA de Substy sur ce fan (Bloom).
  const [ai, setAi] = useState(!!conv.ai);
  useEffect(() => setAi(!!conv.ai), [conv.id, conv.ai]);
  // Le bloc Substy de la fiche a changé l'IA : on suit.
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
      toast(on ? "IA Substy rallumée sur ce fan" : "IA Substy coupée : tu réponds à la main");
    } catch (e) {
      setAi(!on);
      toast((e as Error).message, "err");
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [medias, setMedias] = useState<Media[]>([]);
  const [price, setPrice] = useState("");
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<null | "vault" | "scripts">(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Icône / étiquette du fan (palier auto ou choisie à la main)
  const [badge, setBadge] = useState(conv.badge ?? { icon: null, label: null });
  const [picking, setPicking] = useState(false);
  const avatarBtn = useRef<HTMLButtonElement>(null);
  const [nick, setNick] = useState<string | null>(conv.nickname);
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);
  const draftKey = conv.id;
  // Prénom du fan (fiche « Prénom : … » ou surnom) pour la variable {prénom} des scripts
  const [firstName, setFirstName] = useState<string | null>(null);
  // « En train d'écrire » : le worker interroge Reveal tant que ce chat est ouvert, et nous prévient en direct.
  const [fanTyping, setFanTyping] = useState(false);
  // Conversation ouverte : jointe aux signalements (« Signaler un problème »)
  useEffect(() => {
    const w = window as unknown as { __crmConv?: string | null };
    w.__crmConv = conv.id;
    return () => {
      if (w.__crmConv === conv.id) w.__crmConv = null;
    };
  }, [conv.id]);
  useEffect(() => {
    setFanTyping(false);
    let clear: ReturnType<typeof setTimeout> | null = null;
    const watch = () =>
      fetch(`/api/rv/conversations/${conv.id}/watch`, { method: "POST", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setFanTyping(!!d.typing))
        .catch(() => {});
    watch();
    const t = setInterval(watch, 20_000);
    const off = onLive("typing", (d) => {
      if (d.id !== conv.id) return;
      setFanTyping(!!d.typing);
      // Sécurité : l'indicateur s'éteint seul si plus aucune nouvelle (connexion coupée…)
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
  const withVars = (t: string) => {
    const r = fillVars(t, { prenom: firstName });
    if (r.missing) toast("Prénom du fan inconnu : {prénom} retiré du message. Ajoute « Prénom : … » dans sa fiche.", "err");
    return r.text;
  };

  // Brouillon par fan (gardé sur l'appareil, même après fermeture du navigateur)
  useEffect(() => {
    setText(getDraft(draftKey));
    ta.current?.focus();
  }, [draftKey]);

  const loadMsgs = useCallback(async () => {
    try {
      const r = await api<MsgResp>("GET", `/api/conversations/${conv.id}/messages`);
      setMsgs([...r.data].reverse());
      // Expéditeurs CRM à jour à chaque rafraîchissement (messages envoyés par un collègue pendant qu'on regarde).
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
    api<{ sentBy: Record<string, string>; firstName: string | null }>("GET", `/api/conversations/${conv.id}`)
      .then((d) => {
        setSentBy(d.sentBy);
        setFirstName(d.firstName ?? null);
      })
      .catch(() => {});
    const lock = () =>
      api<{ ok: boolean; lock?: { name: string } }>("POST", `/api/conversations/${conv.id}/action`, { action: "lock" })
        .then((r) => setLockedBy(r.ok ? null : r.lock?.name ?? null))
        .catch(() => {});
    lock();
    // Pas de « lu » à l'ouverture : la conversation passe en lu seulement quand on répond.
    // Temps réel : on recharge dès que le serveur signale un changement sur CETTE conversation.
    const reload = debounce(() => loadMsgs(), 250);
    const offConv = onLive("conv", (d) => d.id === conv.id && reload());
    const offOpen = onLive("open", () => reload());
    // Filet de sécurité si la connexion temps réel tombe (rare) : une vérification lente.
    const t1 = setInterval(() => document.visibilityState === "visible" && loadMsgs(), pollMs(20_000));
    const t2 = setInterval(lock, 45_000);
    return () => {
      offConv();
      offOpen();
      clearInterval(t1);
      clearInterval(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  // Reste collé en bas quand de nouveaux messages arrivent (sauf si on remonte l'historique).
  useLayoutEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs, fanTyping]);

  const loadOlder = async () => {
    if (!cursor || !box.current) return;
    const h = box.current.scrollHeight;
    try {
      const r = await api<MsgResp>("GET", `/api/conversations/${conv.id}/messages?cursor=${encodeURIComponent(cursor)}`);
      setOlder((o) => [...[...r.data].reverse(), ...o]);
      setCursor(r.pageInfo?.hasNextPage ? r.pageInfo.endCursor : "");
      requestAnimationFrame(() => {
        if (box.current) box.current.scrollTop = box.current.scrollHeight - h;
      });
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const priceCents = Math.round(Number(String(price).replace(",", ".")) * 100) || 0;

  // --- bibliothèque du CRM (scripts / séquences) pour cette modèle et ce fan
  const [lib, setLib] = useState<Lib | null>(null);
  const [scriptId, setScriptId] = useState<number | null>(null);
  // Réponse à un message précis (citation visible chez le fan, comme sur Reveal).
  const [replyTo, setReplyTo] = useState<LiveMsg | null>(null);
  useEffect(() => setReplyTo(null), [conv.id]);
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
  const saveProgress = (seqId: number, step: number, on: boolean) =>
    api("POST", `/api/conversations/${conv.id}/sequence`, { sequenceId: seqId, step, active: on }).catch(() => {});

  /** Envoi commun (composeur ou étape de séquence). */
  const doSend = async (p: { content: string; medias: Media[]; price: number; scriptId: number | null }) => {
    setSending(true);
    try {
      const r = await api<{ message: { id: string }; waitedMs: number | null }>("POST", `/api/conversations/${conv.id}/send`, {
        content: p.content,
        mediaIds: p.medias.map((m) => m.id),
        price: p.price || undefined,
        scriptId: p.scriptId ?? undefined,
        replyToId: replyTo?.message.id ?? undefined,
      });
      setReplyTo(null);
      setSentBy((s) => ({ ...s, [r.message.id]: me.name }));
      toast(p.price ? `PPV envoyé · ${money(p.price)}` : r.waitedMs != null ? `Envoyé · répondu en ${dur(r.waitedMs)}` : "Envoyé");
      stick.current = true;
      // En pleine séquence : on reste sur ce fan (pas de « fan suivant » automatique), la barre reste en haut.
      onSent({ inSequence: !!active });
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

  // `override` : texte à envoyer tout de suite (fin de dictée), sinon le contenu de la zone. (Un clic passe un événement : ignoré.)
  const send = async (override?: unknown) => {
    const content = (typeof override === "string" ? override : text).trim();
    if (sending || (!content && !medias.length)) return;
    if (priceCents && !medias.length) return toast("Ajoute au moins un média pour un PPV", "err");
    if (price && priceCents < 100) return toast("Prix minimum : 1 €", "err");
    const ok = await doSend({ content, medias, price: priceCents, scriptId });
    if (!ok) return;
    setDict(null);
    setReview(false);
    setText("");
    setMedias([]);
    setPrice("");
    setScriptId(null);
    clearDraft(draftKey);
    // une étape de séquence modifiée puis envoyée depuis le composeur fait aussi avancer la séquence
    if (active && scriptId && active.seq.steps[active.step] === scriptId) goStep(active.step + 1);
  };

  const goStep = (n: number) => {
    if (!active) return;
    const step = Math.max(0, Math.min(active.seq.steps.length, n));
    setActive({ ...active, step });
    saveProgress(active.seq.id, step, true);
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
    const ok = await doSend({ content: withVars(s.content), medias: s.medias, price: s.price ?? 0, scriptId: s.id });
    if (ok) goStep(active.step + 1);
  };

  // `keepReview` : changement fait par la relecture elle-même (choix d'une autre version), on reste en relecture.
  const onType = (v: string, keepReview = false) => {
    if (!keepReview) setReview(false);
    if (!v.trim()) setDict(null);
    setText(v);
    setDraft(draftKey, v);
    if (Date.now() - lastTyping.current > 5000 && v) {
      lastTyping.current = Date.now();
      api("POST", `/api/conversations/${conv.id}/action`, { action: "typing" }).catch(() => {});
    }
  };

  // Emojis rapides de l'agence : insérés à l'endroit du curseur.
  const quickEmojis = useQuickEmojis();
  const insertEmoji = (e: string) => {
    const el = ta.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    onType(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + e.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Dictée (micro) : le texte dicté s'ajoute à ce qui est déjà écrit, transformé selon les règles de l'agence.
  const voice = useVoiceConfig();
  const dictBase = useRef("");
  const dictSeed = useRef(1); // hasard figé pendant une dictée (le texte ne change pas à chaque mot)
  const joinBase = (b: string, t: string) => (b && t ? (/\s$/.test(b) ? b + t : `${b} ${t}`) : b || t);
  const dictated = (raw: string) => joinBase(dictBase.current, stylize(raw, { ...voice, seed: dictSeed.current }));
  const mic = useDictation({
    onText: (raw) => onType(dictated(raw)),
    onDone: (raw, segs) => {
      const full = dictated(raw);
      onType(full);
      const d: Dictation = { base: dictBase.current, segs, seed: dictSeed.current, text: full };
      // Envoi automatique seulement si la reconnaissance était sûre d'elle ; sinon on montre la relecture.
      if (voice.autoSend && full.trim() && !segs.some(isDoubtful)) {
        setDict(null);
        send(full);
        return;
      }
      setDict(d);
      if (voice.autoSend) setReview(true);
      requestAnimationFrame(() => ta.current?.focus());
    },
    onError: (m) => toast(m, "err"),
    intonation: voice.intonation && voice.keepQuestion,
  });
  const toggleMic = () => {
    if (!mic.listening) {
      dictBase.current = text;
      dictSeed.current = Math.floor(Math.random() * 1e9);
    }
    mic.toggle();
  };

  // Relecture avant envoi : un message qui vient (en partie) de la dictée n'part qu'au deuxième Entrée.
  const [dict, setDict] = useState<Dictation | null>(null);
  const [review, setReview] = useState(false);
  const trySend = () => {
    if (dict && !review && text.trim()) {
      setReview(true);
      return;
    }
    send();
  };
  /** Remplace une phrase dictée par une autre version (ou la retire), et recalcule le message. */
  const swapSeg = (i: number, alt: string | null) => {
    if (!dict) return;
    const segs = dict.segs
      .map((s, k) => (k !== i ? s : alt === null ? null : { ...s, text: alt, alts: [s.text, ...s.alts.filter((a) => a !== alt)], conf: 1 }))
      .filter((s): s is DictSeg => !!s);
    const full = joinBase(dict.base, stylize(segsToRaw(segs), { ...voice, seed: dict.seed }));
    setDict({ ...dict, segs, text: full });
    onType(full, true);
  };

  const applyScript = (s: LibScript) => {
    // Étape d'une séquence choisie depuis « Dossiers » : la barre de séquence s'ouvre aussi à cette étape,
    // et l'envoi fera passer à l'étape suivante (la séquence ne se comporte plus comme un simple dossier).
    const seq = lib?.sequences.find((q) => q.isSequence && q.steps.includes(s.id));
    if (seq && (!active || active.seq.id !== seq.id || active.seq.steps[active.step] !== s.id)) {
      const step = seq.steps.indexOf(s.id);
      setActive({ seq, step });
      saveProgress(seq.id, step, true);
    }
    const content = withVars(s.content || "");
    setText(content);
    setDraft(draftKey, content);
    setMedias(s.medias ?? []);
    setPrice(s.price ? String(s.price / 100) : "");
    setScriptId(s.id);
    setPanel(null);
    ta.current?.focus();
  };

  // « Copier en brouillon » depuis la timeline PPV : texte + médias + prix dans le composeur (rien n'est envoyé).
  useEffect(() => {
    const onDraft = (e: Event) => {
      const d = (e as CustomEvent<{ convId: string; content: string; medias: Media[]; price: number }>).detail;
      if (d.convId !== conv.id) return;
      setText(d.content || "");
      setDraft(draftKey, d.content || "");
      setMedias(d.medias ?? []);
      setPrice(d.price ? String(d.price / 100) : "");
      setScriptId(null);
      ta.current?.focus();
      toast("PPV copié dans le message : vérifie puis envoie");
    };
    window.addEventListener("crm-draft", onDraft);
    return () => window.removeEventListener("crm-draft", onDraft);
  }, [conv.id, draftKey]);

  const now = useNow();
  const waiting = conv.needsReply && conv.waitingSince ? now - Date.parse(conv.waitingSince) : null;
  const fanOnline = !!conv.lastSeenAt && now - Date.parse(conv.lastSeenAt) < 120_000;
  const all = [...older, ...(msgs ?? [])];
  let lastDay = "";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* En-tête */}
      <header className="flex items-center gap-2 border-b bg-panel px-2.5 py-2.5 backdrop-blur sm:gap-3 sm:px-4 sm:py-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-fg md:hidden">
          <ArrowLeft className="size-5" />
        </button>
        <button ref={avatarBtn} type="button" tabIndex={-1} className="shrink-0 cursor-default rounded-full">
          <FanAvatar src={conv.memberAvatar} name={conv.nickname || conv.memberName} totalSpent={conv.totalSpent} badge={badge} size="size-10" />
        </button>
        {picking && avatarBtn.current ? (
          <BadgePicker
            anchor={avatarBtn.current}
            convId={conv.id}
            totalSpent={conv.totalSpent}
            badge={badge}
            onClose={() => setPicking(false)}
            onSaved={(b) => {
              setBadge(b);
              onSent();
            }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {renaming !== null ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const r = await api<{ nickname: string | null }>("POST", `/api/conversations/${conv.id}/action`, { action: "nickname", nickname: renaming });
                  setNick(r.nickname);
                  toast(r.nickname ? `Renommé « ${r.nickname} »` : "Surnom retiré");
                  onSent();
                } catch (err) {
                  toast((err as Error).message, "err");
                }
                setRenaming(null);
              }}
            >
              <input
                autoFocus
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                placeholder={conv.memberName ?? "Surnom"}
                maxLength={60}
                className="h-8 w-48 rounded-lg border border-primary bg-card-2 px-2 text-sm font-bold outline-none"
              />
              <button className="grid size-8 place-items-center rounded-lg bg-primary text-white">
                <Check className="size-4" />
              </button>
              <button type="button" onClick={() => setRenaming(null)} className="grid size-8 place-items-center rounded-lg text-muted hover:text-fg">
                <X className="size-4" />
              </button>
            </form>
          ) : (
            <p className="group/name flex items-center gap-1.5 truncate font-bold">
              {conv.vip ? <Crown className="size-4 text-amber-300" /> : null}
              {nick || conv.memberName || "Fan"}
              <button onClick={() => setRenaming(nick ?? "")} title="Renommer le fan (dans Bloom)" className="grid size-6 place-items-center rounded-md text-muted hover:bg-card-2 hover:text-fg">
                <Pencil className="size-3.5" />
              </button>
            </p>
          )}
          <p className="truncate text-xs text-muted">
            {waiting !== null ? <span className="font-bold text-amber-300 sm:hidden">attend {durSec(waiting)} · </span> : null}
            {(() => {
              const t = badgeOf(conv.totalSpent, badge);
              return t.label ? <span className={cn("font-extrabold uppercase", t.text)}>{t.label} · </span> : null;
            })()}
            <span className="hidden sm:inline">@{conv.memberName} · </span>
            {model?.displayName ?? "Modèle"} · {fanTyping ? <span className="font-semibold text-primary-soft">✍️ en train d’écrire…</span> : fanOnline ? <span className="font-semibold text-emerald-300">● actif</span> : conv.lastSeenAt ? <>a écrit {ago(conv.lastSeenAt)}</> : <>{conv.ai ? "IA active" : "IA coupée"}</>} · {money(conv.totalSpent)}
            <span className="hidden sm:inline"> dépensés</span>
          </p>
        </div>
        {lockedBy ? (
          <Pill tone="info" className="hidden sm:inline-flex">
            <Lock className="size-3" /> {lockedBy} est dessus
          </Pill>
        ) : null}
        {waiting !== null ? (
          <span className={cn("hidden rounded-lg px-2 py-1 text-xs font-bold whitespace-nowrap tabular-nums sm:inline", waitTone(waiting) === "good" ? "bg-emerald-500/15 text-emerald-300" : waitTone(waiting) === "warn" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300")}>
            attend {durSec(waiting)}
          </span>
        ) : (
          <Pill tone="good" className="hidden sm:inline-flex">répondu</Pill>
        )}
        {/* Barre d'actions */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl border bg-card-2/60 p-1">
          <ActBtn on={actions.pinned} onClick={actions.onPin} title={actions.pinned ? "Désépingler (pour toute l’équipe)" : "Épingle d’équipe : épinglé pour tout le monde"}>
            {actions.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </ActBtn>
          <ActBtn on={actions.inTabs} onClick={actions.onTab} title={actions.inTabs ? "Retirer du multi-chat" : "Garder dans le multi-chat (onglets en haut)"} className="hidden sm:grid">
            <PanelTop className="size-4" />
          </ActBtn>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <ActBtn on={false} onClick={actions.onReadToggle} title={actions.fresh ? "Marquer comme lu" : "Marquer comme non lu"}>
            {actions.fresh ? <CheckCheck className="size-4" /> : <MailWarning className="size-4" />}
          </ActBtn>
          <span className="mx-0.5 h-5 w-px bg-line" />
          {/* Bloom : couper / rallumer l'IA de Substy sur ce fan (chatting hybride). */}
          <button
            onClick={toggleAi}
            title={ai ? "L’IA de Substy répond à ce fan : couper pour répondre à la main" : "IA coupée : rallumer l’IA de Substy sur ce fan"}
            className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold", ai ? "bg-primary/15 text-primary-soft" : "text-muted hover:bg-card-2 hover:text-fg")}
          >
            <Bot className="size-4" /> {ai ? "IA" : "IA off"}
          </button>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <ActBtn on={actions.panelOpen} onClick={actions.onPanel} title={actions.panelOpen ? "Masquer les notes du fan" : "Afficher les notes du fan"}>
            {actions.panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </ActBtn>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="scroll-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-4 md:px-8"
      >
        {cursor ? (
          <button onClick={loadOlder} className="mx-auto mb-2 flex items-center gap-1 rounded-full border bg-card-2 px-3 py-1 text-xs text-muted hover:text-fg">
            <ChevronDown className="size-3 rotate-180" /> Messages plus anciens
          </button>
        ) : null}
        {error && !msgs ? <p className="m-auto max-w-sm text-center text-sm text-rose-300">{error}</p> : null}
        {!msgs && !error ? <Loader2 className="m-auto size-6 animate-spin text-muted" /> : null}
        {all.map((it) => {
          const d = new Date(it.message.createdAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          const sep = d !== lastDay ? ((lastDay = d), <p className="my-3 text-center text-[11px] font-semibold tracking-wide text-muted uppercase">{d}</p>) : null;
          return (
            <div key={it.message.id} className="contents">
              {sep}
              <Bubble
                it={it}
                sentBy={sentBy[it.message.id]}
                replyBy={it.replyTo ? sentBy[it.replyTo.id] : undefined}
                seen={readAt ? Date.parse(it.message.createdAt) <= Date.parse(readAt) : false}
                onReply={() => {
                  setReplyTo(it);
                  ta.current?.focus();
                }}
                onReact={async (emoji) => {
                  try {
                    await api("POST", `/api/conversations/${conv.id}/messages/${it.message.id}`, { emoji });
                    loadMsgs();
                  } catch (e) {
                    toast(`Réaction impossible : ${(e as Error).message}`, "err");
                  }
                }}
                onDelete={async () => {
                  if (!confirm("Supprimer ce message ? Il disparaîtra aussi chez le fan sur Reveal.")) return;
                  try {
                    await api("DELETE", `/api/conversations/${conv.id}/messages/${it.message.id}`);
                    toast("Message supprimé");
                    loadMsgs();
                  } catch (e) {
                    toast((e as Error).message, "err");
                  }
                }}
              />
            </div>
          );
        })}
        {/* Le fan est en train d'écrire : bulle « … » côté fan, comme sur Reveal */}
        {fanTyping ? (
          <div className="self-start" title="Le fan est en train d’écrire">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-bubble-fan px-3.5 py-3">
              <span className="typing-dot" />
              <span className="typing-dot [animation-delay:0.15s]" />
              <span className="typing-dot [animation-delay:0.3s]" />
            </div>
          </div>
        ) : null}
      </div>

      {/* Composeur */}
      <div className="border-t bg-panel-strong p-3 backdrop-blur md:px-6">
        {replyTo ? (
          <div className="pop mb-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-card-2/70 px-3 py-2">
            <Reply className="size-4 shrink-0 text-primary-soft" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-muted">
                Réponse à {replyTo.authorMessage?.memberId ? conv.nickname || conv.memberName || "le fan" : replyTo.authorMessage?.displayName || "la modèle"}
              </p>
              <p className="truncate text-sm">{replyTo.message.content || (replyTo.medias?.length || replyTo.bundleWithMedias ? "📷 Média" : "Message")}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="rounded-lg p-1 text-muted hover:bg-card hover:text-fg" title="Annuler la réponse">
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        {active ? (
          <SequenceBar
            seq={active.seq}
            step={active.step}
            scripts={scriptsById}
            sending={sending}
            onStep={goStep}
            onSend={sendStep}
            onEdit={applyScript}
            onClose={() => {
              saveProgress(active.seq.id, active.step, false);
              setActive(null);
            }}
          />
        ) : null}
        {medias.length ? (
          <div className="mb-2 flex items-center gap-2 overflow-x-auto rounded-xl border bg-card-2/60 p-2">
            {medias.map((m) => (
              <span key={m.id} className="relative shrink-0">
                <MediaTile m={m} className="size-14 rounded-lg" />
                <button onClick={() => setMedias((x) => x.filter((y) => y.id !== m.id))} className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-black text-white ring-1 ring-line">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
              <span className="text-xs font-semibold text-muted">Prix PPV</span>
              <div className="relative">
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="gratuit"
                  inputMode="decimal"
                  className="h-9 w-24 rounded-lg border border-input bg-bg pr-6 pl-2 text-right text-sm font-bold outline-none focus:border-primary"
                />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted">€</span>
              </div>
            </div>
          </div>
        ) : null}
        {medias.length ? <MediaNotes list={medias} className="-mt-1 mb-2 px-1" /> : null}
        {review && dict ? (
          <DictReview
            dict={dict}
            text={text}
            render={(d) => stylizeSegments(segsToRaw(d.segs), { ...voice, seed: d.seed })}
            fixed={(s) => {
              const plain = s.text.toLocaleLowerCase("fr-FR").replace(/[.,;:!?…]+/g, " ").replace(/\s+/g, " ").trim();
              return applyFixes(plain, voice.fixes) !== plain;
            }}
            preview={(alt) => stylize(alt, { ...voice, seed: dict.seed })}
            onSwap={swapSeg}
            onEdit={() => {
              setReview(false);
              ta.current?.focus();
            }}
          />
        ) : null}
        {/* Zone de saisie façon Infloww : bandeau haut (emojis + Scripts), grande zone d'écriture, bas (Vault + Envoyer). */}
        <div className="flex min-h-40 flex-col overflow-hidden rounded-2xl border border-input bg-card-2/60 focus-within:border-primary">
          {/* Bandeau du haut : emojis à gauche (défilants), Scripts à droite */}
          <div className="flex items-center gap-1 border-b border-line/60 py-1 pr-1.5 pl-1">
            <div className="scroll-thin flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              {quickEmojis.map((e, i) => (
                <button key={`${e}-${i}`} type="button" onClick={() => insertEmoji(e)} className="grid size-7 shrink-0 place-items-center rounded-md text-lg leading-none hover:bg-card-2" title={`Insérer ${e}`}>
                  {e}
                </button>
              ))}
            </div>
            {voice.enabled && mic.supported ? (
              <button
                type="button"
                onClick={toggleMic}
                title={mic.listening ? "Arrêter la dictée" : "Dicter le message (micro)"}
                className={cn(
                  "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors",
                  mic.listening ? "bg-rose-500/20 text-rose-300" : "text-muted hover:bg-card-2 hover:text-fg",
                )}
              >
                {mic.listening ? <span className="pulse-dot size-2 rounded-full bg-rose-400" /> : <Mic className="size-4" />}
                {mic.listening ? "J’écoute…" : "Dicter"}
              </button>
            ) : null}
            <button onClick={() => setPanel(panel === "scripts" ? null : "scripts")} title="Scripts et séquences" className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors", panel === "scripts" ? "bg-primary/20 text-primary-soft" : "text-muted hover:bg-card-2 hover:text-fg")}>
              <FileText className="size-4" /> Scripts
            </button>
          </div>
          {/* Grande zone d'écriture (prend toute la place) */}
          <textarea
            ref={ta}
            data-chat-input
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                trySend();
              } else if (e.key === "Escape" && review) {
                e.preventDefault();
                setReview(false);
              }
            }}
            placeholder={`Répondre à ${conv.nickname || conv.memberName || "ce fan"}…  (Entrée : envoyer · Maj+Entrée : saut de ligne · Tab : fan suivant)`}
            className="scroll-thin min-h-0 w-full flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted/60"
          />
          {/* Bas : outils à gauche (Vault / PPV), envoi à droite */}
          <div className="flex items-center gap-1 border-t border-line/60 px-1.5 py-1.5">
            <button onClick={() => setPanel(panel === "vault" ? null : "vault")} title="Médias / PPV du vault" className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors", panel === "vault" ? "bg-primary/20 text-primary-soft" : "text-muted hover:bg-card-2 hover:text-fg")}>
              <ImageIcon className="size-4" /> Vault / PPV
            </button>
            <span className="flex-1" />
            <button onClick={trySend} disabled={sending || (!text.trim() && !medias.length)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/85 disabled:opacity-40" title="Envoyer (Entrée)">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {review ? "Confirmer l’envoi" : dict ? "Relire" : "Envoyer"}
            </button>
          </div>
        </div>
      </div>

      {panel === "vault" ? <VaultPicker modelId={conv.modelId} memberId={conv.memberId} selected={medias} onClose={() => setPanel(null)} onPick={(m) => setMedias(m)} /> : null}
      {panel === "scripts" ? <LibraryPicker lib={lib} onClose={() => setPanel(null)} onScript={applyScript} onSequence={startSequence} /> : null}
    </div>
  );
}

function MediaGrid({ list, blurred }: { list: Media[]; blurred?: boolean }) {
  // Mode « médias au clic » (Réglages → Optimisation) : rien n'est téléchargé tant qu'on ne clique pas.
  const [show, setShow] = useState(false);
  const [noMedia, setNoMedia] = useState(false);
  useEffect(() => {
    const f = () => setNoMedia(perfOn("noMedia"));
    f();
    window.addEventListener("crm-perf", f);
    return () => window.removeEventListener("crm-perf", f);
  }, []);
  if (!list?.length) return null;
  const visual = list.filter((m) => m.type !== "audio");
  if (noMedia && !show && visual.length) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {list.filter((m) => m.type === "audio" && m.url).map((m) => <audio key={m.id} controls preload="none" src={m.url} className="max-w-60" />)}
        <button type="button" onClick={() => setShow(true)} className="rounded-xl bg-panel px-3 py-2 text-xs font-semibold text-muted hover:text-fg">
          📷 {visual.length} média(s) · afficher
        </button>
      </div>
    );
  }
  return (
    <>
    <div className="mt-1.5 flex flex-wrap gap-1">
      {list.map((m) => {
        const src = mediaThumb(m);
        if (m.type === "audio" && m.url) return <audio key={m.id} controls preload="none" src={m.url} className="max-w-60" />;
        return (
          <a key={m.id} href={m.largeUrl || m.url || src} target="_blank" rel="noreferrer" className="relative block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt="" loading="lazy" className={cn("max-h-44 max-w-44 rounded-xl object-cover", blurred && "opacity-80")} /> : <span className="grid size-24 place-items-center rounded-xl bg-black/40 text-xs">{m.type}</span>}
            {m.type === "video" ? <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[10px] font-bold">▶ vidéo</span> : null}
          </a>
        );
      })}
    </div>
    <MediaNotes list={list} className="max-w-72" />
    </>
  );
}

/** PPV envoyé, comme sur Reveal : une carte (couverture floutée + cadenas, photos / vidéos, prix), « Voir le contenu », et le statut du paiement. */
function PpvCard({ b, teasing }: { b: NonNullable<LiveMsg["bundleWithMedias"]>; teasing: Media[] }) {
  const [open, setOpen] = useState(false);
  const all = b.medias?.length ? b.medias : teasing;
  const paid = !!b.bundle.isPaid;
  const price = b.bundle.discountedPrice ?? b.bundle.price;
  const cover = (teasing[0] ?? all[0]) || null;
  const src = cover ? mediaThumb(cover) : null;
  const photos = all.filter((m) => m.type === "photo").length;
  const videos = all.filter((m) => m.type === "video").length;
  const audios = all.filter((m) => m.type === "audio").length;
  return (
    <div className="mb-2 w-64 max-w-full overflow-hidden rounded-xl bg-black/35">
      <button type="button" onClick={() => all.length && setOpen(true)} className="relative block aspect-[4/3] w-full overflow-hidden bg-black/50" title="Voir le contenu">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" loading="lazy" className="no-blur absolute inset-0 size-full scale-110 object-cover blur-xl" /> : null}
        <span className="absolute inset-0 bg-black/25" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-full bg-black/45 backdrop-blur">
            {paid ? <Check className="size-6 text-emerald-300" /> : <Lock className="size-6 text-white" />}
          </span>
        </span>
      </button>
      <div className="flex items-center gap-3 px-3 py-2 text-xs">
        {photos ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <ImageIcon className="size-3.5" /> {photos}
          </span>
        ) : null}
        {videos ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Video className="size-3.5" /> {videos}
          </span>
        ) : null}
        {audios ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Mic className="size-3.5" /> {audios}
          </span>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-sm font-extrabold tabular-nums">
          {money(price)} {paid ? <LockOpen className="size-3.5 text-emerald-300" /> : <Lock className="size-3.5" />}
        </span>
      </div>
      <div className="px-3 pb-3">
        <button type="button" onClick={() => setOpen(true)} disabled={!all.length} className="h-9 w-full rounded-lg bg-primary/80 text-sm font-bold text-white hover:bg-primary disabled:opacity-40">
          Voir le contenu
        </button>
      </div>
      <p className={cn("border-t border-white/5 px-3 py-1.5 text-[11px] font-semibold", paid ? "text-emerald-300" : "text-amber-200/90")}>
        {paid ? `✓ Payé (${money(price)})` : `Paiement en attente (${money(price)})`}
      </p>
      {open ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="pop flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-(--radius-card) border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold">
                {paid ? <LockOpen className="size-4 text-emerald-300" /> : <Lock className="size-4" />} PPV {money(price)} · {all.length} média{all.length > 1 ? "s" : ""}
                <span className={cn("rounded-full px-2 py-0.5 text-[10px]", paid ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200")}>{paid ? "payé" : "paiement en attente"}</span>
              </p>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:text-fg" aria-label="Fermer">
                <X className="size-5" />
              </button>
            </div>
            <div className="scroll-thin overflow-y-auto p-3">
              <MediaGrid list={all} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Substy ne permet pas (encore) de réagir à un message ni de le supprimer : boutons cachés.
const CAN_REACT = false;
const CAN_DELETE = false;

function Bubble({ it, sentBy, replyBy, seen, onDelete, onReply, onReact }: { it: LiveMsg; sentBy?: string; replyBy?: string; seen: boolean; onDelete: () => void; onReply: () => void; onReact: (emoji: string) => void }) {
  const m = it.message;
  const fan = !!it.authorMessage?.memberId;
  if (m.type === "information") return <p className="my-1 text-center text-xs text-muted">{m.content}</p>;
  const b = it.bundleWithMedias;
  const teasing = b?.teasingMedias?.length ? b.teasingMedias : b?.teasingMedia ? [b.teasingMedia] : [];
  const author = fan ? null : sentBy ? `${sentBy} · CRM` : it.authorMessage?.displayName;
  return (
    <div className={cn("group/msg pop flex max-w-[78%] flex-col", fan ? "self-start" : "self-end items-end")} title={new Date(m.createdAt).toLocaleString("fr-FR")}>
      <div className="flex items-center gap-1.5">
        {!fan && !m.deletedAt ? <MsgActions mine={it.reactions?.find((r) => !r.memberId)?.emoji ?? null} onReply={onReply} onReact={onReact} side="left" /> : null}
        {CAN_DELETE && !fan && !m.deletedAt ? (
          <button onClick={onDelete} title="Supprimer le message" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted opacity-0 transition-opacity group-hover/msg:opacity-100 hover:bg-rose-500/15 hover:text-rose-300">
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      <div className={cn("rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap break-words", fan ? "rounded-bl-md bg-bubble-fan" : "rounded-br-md bg-bubble-me", m.type === "tips" && "border border-amber-400/40", m.deletedAt && "border border-dashed border-rose-400/50")}>
        {it.replyTo ? (
          <p className="mb-1 border-l-2 border-white/20 pl-2 text-xs text-muted">
            {/* Message cité envoyé depuis le CRM : le nom du chatteur, pas celui du compte Reveal relié */}
            {replyBy ?? it.replyTo.authorDisplayName} : {String(it.replyTo.content).slice(0, 90)}
          </p>
        ) : null}
        {/* PPV : une seule carte façon Reveal (couverture + cadenas, nombre de médias, prix, voir le contenu, statut du paiement), puis le texte */}
        {b ? <PpvCard b={b} teasing={teasing} /> : null}
        {m.deletedAt ? (
          <>
            <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-rose-300 not-italic">
              <Trash2 className="size-3" /> {fan || it.crmDeleted?.byFan ? "Supprimé par le fan" : "Message supprimé"}
              {m.deletedAt !== m.createdAt ? ` · ${clock(m.deletedAt)}` : ""}
            </span>
            {m.content ? <span className="opacity-75">{m.content}</span> : <span className="text-muted italic">{it.crmDeleted?.mediaCount ? `📷 ${it.crmDeleted.mediaCount} média(s)` : "Contenu non conservé"}</span>}
          </>
        ) : (
          (m.type === "tips" ? "💸 " : "") + (m.content || "")
        )}
        <MediaGrid list={it.medias ?? []} />
      </div>
      {fan && !m.deletedAt ? <MsgActions mine={it.reactions?.find((r) => !r.memberId)?.emoji ?? null} onReply={onReply} onReact={onReact} side="right" /> : null}
      </div>
      {it.reactions?.length ? <Reactions list={it.reactions} fan={fan} /> : null}
      <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-muted">
        {clock(m.createdAt)}
        {author ? ` · ${author}` : ""}
        {!fan && !m.deletedAt ? (
          seen ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-sky-400" title="Vu par le fan">
              <CheckCheck className="size-3.5" /> Vu
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5" title="Envoyé, pas encore vu par le fan">
              <Check className="size-3.5" />
            </span>
          )
        ) : null}
      </span>
    </div>
  );
}

/** Réactions (likes, emojis) posées sur un message, par le fan ou par la modèle. */
function Reactions({ list, fan }: { list: NonNullable<LiveMsg["reactions"]>; fan: boolean }) {
  return (
    <div className={cn("-mt-1.5 flex flex-wrap gap-1 px-2", fan ? "self-start" : "self-end")}>
      {list.map((r) => (
        <span
          key={r.id}
          title={r.memberId ? "Réaction du fan" : "Réaction de la modèle"}
          className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-sm leading-none shadow", r.memberId ? "border-primary/50 bg-card" : "border-line bg-card-2")}
        >
          {r.emoji}
          <span className="text-[9px] font-semibold text-muted">{r.memberId ? "fan" : "modèle"}</span>
        </span>
      ))}
    </div>
  );
}

const QUICK_REACTIONS = ["❤️", "😍", "🔥", "😂", "😏", "👀"];
const MORE_REACTIONS = ["👍", "😘", "🥰", "😈", "🤤", "😳", "🥵", "😜", "🙈", "😇", "🤭", "😢", "😮", "💦", "🍑", "🍒", "💋", "💯", "🙏", "👏", "🤩", "😎", "🤗", "😅", "🥺", "😡", "💕", "✨"];

/** Boutons au survol d'un message : réagir (emoji, visible du fan) et répondre (citation). */
function MsgActions({ mine, onReply, onReact, side }: { mine: string | null; onReply: () => void; onReact: (emoji: string) => void; side: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const pick = (e: string) => {
    setOpen(false);
    setMore(false);
    onReact(e === mine ? "" : e); // même emoji = retirer la réaction
  };
  return (
    <div className={cn("relative flex shrink-0 items-center gap-0.5 transition-opacity", open ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100")}>
      {CAN_REACT ? (
        <button onClick={() => setOpen((x) => !x)} title="Réagir" className={cn("grid size-7 place-items-center rounded-lg text-muted hover:bg-card-2 hover:text-fg", open && "bg-card-2 text-fg")}>
          <Smile className="size-4" />
        </button>
      ) : null}
      <button onClick={onReply} title="Répondre à ce message" className="grid size-7 place-items-center rounded-lg text-muted hover:bg-card-2 hover:text-fg">
        <Reply className="size-4" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => { setOpen(false); setMore(false); }} />
          <div className={cn("pop absolute bottom-9 z-30 rounded-2xl border bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl", side === "right" ? "left-0" : "right-0")}>
            <div className="flex items-center gap-0.5">
              {QUICK_REACTIONS.map((e) => (
                <button key={e} onClick={() => pick(e)} className={cn("grid size-9 place-items-center rounded-xl text-xl transition-transform hover:scale-110 hover:bg-card-2", mine === e && "bg-primary/25 ring-1 ring-primary")}>
                  {e}
                </button>
              ))}
              <button onClick={() => setMore((x) => !x)} title="Plus d’emojis" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-card-2 hover:text-fg">
                <Plus className="size-4" />
              </button>
            </div>
            {more ? (
              <div className="mt-1 grid w-[290px] grid-cols-7 gap-0.5 border-t border-line/60 pt-1">
                {MORE_REACTIONS.map((e) => (
                  <button key={e} onClick={() => pick(e)} className={cn("grid size-9 place-items-center rounded-xl text-xl hover:bg-card-2", mine === e && "bg-primary/25 ring-1 ring-primary")}>
                    {e}
                  </button>
                ))}
              </div>
            ) : null}
            {mine ? (
              <button onClick={() => pick(mine)} className="mt-1 w-full rounded-lg px-2 py-1 text-xs text-muted hover:bg-card-2 hover:text-fg">
                Retirer ma réaction {mine}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Relecture d'un message dicté : phrases douteuses en orange (la reconnaissance hésitait), phrases corrigées
 * automatiquement en vert ; un clic sur une phrase montre les autres versions entendues.
 */
function DictReview({
  dict,
  text,
  render,
  fixed,
  preview,
  onSwap,
  onEdit,
}: {
  dict: Dictation;
  text: string;
  render: (d: Dictation) => string[];
  fixed: (s: DictSeg) => boolean;
  preview: (alt: string) => string;
  onSwap: (i: number, alt: string | null) => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const intact = text === dict.text; // modifié à la main depuis : on ne peut plus repérer les phrases
  const parts = intact ? render(dict) : [];
  const doubts = intact ? dict.segs.filter(isDoubtful).length : 0;
  return (
    <div className="pop mb-2 rounded-2xl border border-primary/40 bg-primary/[0.07] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-fg">Relis avant d’envoyer</span>
        {doubts ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">{doubts} passage{doubts > 1 ? "s" : ""} à vérifier</span> : null}
        <span className="ml-auto text-muted">Entrée : envoyer · Échap : modifier</span>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">
        {intact ? (
          <>
            {dict.base ? <span className="text-muted">{dict.base} </span> : null}
            {parts.map((p, i) => {
              const s = dict.segs[i];
              if (!s || !p) return null;
              const doubt = isDoubtful(s);
              const fix = fixed(s);
              return (
                <span key={i} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpen(open === i ? null : i)}
                    title={fix ? `Corrigé automatiquement (entendu : « ${s.text} »)` : doubt ? "La dictée n’était pas sûre : clique pour voir d’autres versions" : "Clique pour voir d’autres versions"}
                    className={cn(
                      "rounded px-0.5 text-left underline-offset-4",
                      doubt ? "bg-amber-500/15 text-amber-100 underline decoration-amber-400 decoration-wavy" : fix ? "underline decoration-emerald-400 decoration-dotted" : "hover:bg-white/[0.06]",
                    )}
                  >
                    {p}
                  </button>{" "}
                  {open === i ? (
                    <span className="absolute bottom-full left-0 z-30 mb-1 flex w-72 flex-col gap-0.5 rounded-xl border bg-card/95 p-1.5 text-xs shadow-2xl backdrop-blur-xl">
                      <span className="px-2 py-1 text-[11px] text-muted">Entendu : « {s.text} »</span>
                      {s.alts.length ? (
                        s.alts.map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => {
                              onSwap(i, a);
                              setOpen(null);
                            }}
                            className="rounded-lg px-2 py-1.5 text-left hover:bg-primary/15"
                          >
                            {preview(a)}
                          </button>
                        ))
                      ) : (
                        <span className="px-2 py-1 text-muted">Pas d’autre version entendue.</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onSwap(i, null);
                          setOpen(null);
                        }}
                        className="rounded-lg px-2 py-1.5 text-left text-rose-300 hover:bg-rose-500/10"
                      >
                        Retirer cette phrase
                      </button>
                    </span>
                  ) : null}
                </span>
              );
            })}
          </>
        ) : (
          <span>{text}</span>
        )}
      </p>
      {!intact ? <p className="mt-1 text-[11px] text-muted">Modifié à la main depuis la dictée.</p> : null}
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onEdit} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted hover:bg-card-2 hover:text-fg">
          Modifier
        </button>
      </div>
    </div>
  );
}
