"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Ban, CalendarClock, Check, ImagePlus, Plus, Send, Sparkles, Trash2, Undo2, UserCheck, UserMinus, UserPlus, X, Zap } from "lucide-react";
import { api, toast } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { QUICK } from "@/app/pro/emojis";
import { cash, Confirm, int, Modal, Switch } from "../kit";
import { errText, MediaPicker, plural, type PickedMedia } from "../media/MediaKit";

// Bloom v2 → Envois groupés : préparer un envoi (les mêmes étapes pour OnlyFans et MYM), et les formulaires de
// l'écran (message prêt, message automatique). Rien ne part, et rien n'est enregistré sur le serveur, avant l'écran
// « Vérification » puis une confirmation : jusque-là le message en cours n'est qu'un brouillon gardé dans ce navigateur.
//  - OnlyFans : « POST /api/mass » (un message de masse d'OnlyFans, vers des listes incluses / exclues).
//  - MYM : « POST /api/mym/massdm/campaign » avec `confirm: true` (un message privé par fan, à partir d'un message
//    prêt ; un message écrit sur place est d'abord enregistré comme message prêt, au moment de l'envoi). Le nombre de
//    fans visés vient de « /api/mym/massdm/preview », qui ne fait que compter.
export type OfList = { id: string; name: string; type: string; fans: number };
export type Ready = { id: number; title: string; text: string; price: number; medias: PickedMedia[]; createdBy: string | null; updatedAt: number };
export type BulkGroup = { id: string; name: string; color: string | null; size: number };
export type AutoMsg = { text: string; medias: PickedMedia[]; price: number; delay: number };
export type Auto = {
  id: number; trigger: string; status: string; runs: boolean; delayMin: number; delayMax: number; once: boolean; startsAt: number | null; unsendOnReply: boolean;
  collections: { messages: AutoMsg[] }[]; text: string; medias: number; price: number; createdBy: string | null; createdAt: number; canceledBy: string | null; fans: number; sent: number; purchased: number; earnings: number;
};
/** Ce avec quoi on ouvre « Nouvel envoi » : rien, un envoi à refaire (OnlyFans), ou un message prêt (MYM). */
export type ComposeInit = { text?: string; price?: number; include?: string[]; exclude?: string[]; messageId?: number | null; note?: string };
type Draft = { text: string; medias: PickedMedia[]; paid: boolean; price: string };
type Est = { total: number; by: Record<string, number>; priceMin: number; priceMax: number; minutes: number };

const EMPTY: Draft = { text: "", medias: [], paid: false, price: "" };
const RULES = { of: { min: 3, max: 200, medias: 50, text: 5000, sym: "$" }, mym: { min: 5, max: 1000, medias: 5, text: 500, sym: "€" } } as const;
const AUD: [string, string, string, React.ReactNode][] = [
  ["active", "Abonnés", "Ceux qui sont abonnés en ce moment.", <UserCheck key="a" className="size-4" />],
  ["old", "Anciens abonnés", "Ils ne le sont plus : de quoi les faire revenir.", <UserMinus key="o" className="size-4" />],
  ["interested", "Intéressés", "Ils suivent la modèle sans être abonnés.", <UserPlus key="i" className="size-4" />],
];
const UNSEND: [number, string][] = [[0, "Jamais"], [3600, "Après 1 h"], [3 * 3600, "Après 3 h"], [6 * 3600, "Après 6 h"], [12 * 3600, "Après 12 h"], [86400, "Après 24 h"]];
/** Les déclencheurs que Bloom sait faire tourner (smart.mjs). */
export const TRIGGER_NAME: Record<string, string> = { purchase: "Après un achat", welcome: "Bienvenue aux nouveaux abonnés" };
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
const amountOf = (d: Draft) => (d.paid && d.medias.length ? num(d.price) : 0);
const euros = (v: number, cur: string) => cash(Math.round(v * 100), cur, v % 1 ? 2 : 0);
const localInput = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const whenText = (t: number) => new Date(t).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Ce qui manque à un message pour pouvoir partir ("" si tout va bien). */
function messageProblem(pf: Pf, d: Draft) {
  const r = RULES[pf];
  if (!d.text.trim() && !d.medias.length) return "Écris un message ou choisis un média.";
  if (d.paid && !d.medias.length) return "Un message payant a besoin d’au moins un média.";
  const a = amountOf(d);
  if (d.paid && (a < r.min || a > r.max)) return `Prix : de ${r.min} à ${r.max} ${r.sym}, ou gratuit.`;
  return "";
}
/** Le brouillon gardé dans ce navigateur pour une modèle (jamais envoyé tout seul). */
function readDraft(key: string): (Draft & { title: string }) | null {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null") as Partial<Draft & { title: string }> | null;
    if (!s || typeof s.text !== "string") return null;
    const medias = Array.isArray(s.medias) ? s.medias : [];
    if (!s.text && !medias.length && !s.title) return null;
    return { text: s.text, medias, paid: !!s.paid, price: String(s.price || ""), title: String(s.title || "") };
  } catch {
    return null;
  }
}

/** Le texte, les médias et le prix d'un message : les mêmes champs partout dans cet écran. */
export function MessageFields({ pf, creatorId, v, set, id }: { pf: Pf; creatorId: string; v: Draft; set: (part: Partial<Draft>) => void; id: string }) {
  const [picker, setPicker] = useState(false);
  const r = RULES[pf];
  return (
    <>
      <div className="flex items-end justify-between gap-2">
        <label className="v2-label" htmlFor={`${id}-text`} style={{ marginBottom: 0 }}>Message</label>
        <span className="v2-num text-[11.5px] text-muted">{int(v.text.length)} / {int(r.text)}</span>
      </div>
      <textarea id={`${id}-text`} value={v.text} maxLength={r.text} rows={5} onChange={(e) => set({ text: e.target.value })} placeholder="Ce que les fans liront…" className="v2-field mt-1.5" style={{ height: "auto", paddingTop: 8, paddingBottom: 8, resize: "vertical" }} />
      <div className="v2-noscroll mt-1.5 flex gap-0.5 overflow-x-auto">
        {QUICK.slice(0, 18).map((e) => <button key={e} type="button" onClick={() => set({ text: (v.text + e).slice(0, r.text) })} className="grid size-7 shrink-0 place-items-center rounded-md text-[16px] transition hover:bg-white/[0.07]" title={`Ajouter ${e}`}>{e}</button>)}
      </div>

      <p className="v2-label mt-3">Médias <span className="font-normal">({r.medias} au plus)</span></p>
      <div className="flex flex-wrap items-center gap-1.5">
        {v.medias.map((x) => (
          <span key={x.id} className="relative size-14 overflow-hidden rounded-lg" style={{ background: "var(--color-card-2)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {x.thumb ? <img src={x.thumb} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[10.5px] text-muted">{/audio/i.test(x.type) ? "Vocal" : "Média"}</span>}
            <button type="button" onClick={() => set({ medias: v.medias.filter((y) => y.id !== x.id) })} title="Retirer ce média" aria-label="Retirer ce média" className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-black/75 text-white"><X className="size-3" /></button>
          </span>
        ))}
        <button type="button" onClick={() => setPicker(true)} className="v2-btn" data-kind="ghost" style={{ height: 34 }}><ImagePlus className="size-4" />{v.medias.length ? "Changer les médias" : "Choisir des médias"}</button>
      </div>

      <p className="v2-label mt-3">Prix</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="v2-segbar">
          <button type="button" className="v2-seg" data-on={!v.paid} onClick={() => set({ paid: false })}>Gratuit</button>
          <button type="button" className="v2-seg" data-on={v.paid} onClick={() => set({ paid: true })}>Payant</button>
        </div>
        <label className="flex h-[34px] items-center gap-1.5 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)", opacity: v.paid ? 1 : 0.4 }}><input disabled={!v.paid} value={v.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="0" className="w-16 bg-transparent text-right text-[13px] outline-none" aria-label="Prix" /><span className="text-[12.5px] text-muted">{r.sym}</span></label>
        <span className="text-[11.5px] text-muted">Payant : de {r.min} à {int(r.max)} {r.sym}, avec au moins un média (le fan paie pour le voir).</span>
      </div>
      {picker ? <MediaPicker pf={pf} creatorId={creatorId} selected={v.medias} max={r.medias} keep onPick={(list) => (set({ medias: list }), setPicker(false))} onClose={() => setPicker(false)} /> : null}
    </>
  );
}

/** Un choix parmi deux ou trois (carte cliquable). */
function Option({ on, onClick, icon, title, sub, foot, disabled }: { on: boolean; onClick: () => void; icon?: React.ReactNode; title: string; sub?: string; foot?: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} aria-pressed={on} onClick={onClick} className="min-w-0 rounded-[12px] border p-3 text-left transition-colors disabled:opacity-45" style={{ borderColor: on ? "var(--v2-blue)" : "var(--color-line)", background: on ? "rgb(59 130 246 / 0.1)" : undefined }}>
      <span className="flex items-center gap-2 text-[13.5px] font-bold">
        <span className="v2-check" data-on={on}>{on ? <Check className="size-3" /> : null}</span>
        {icon ? <span className="shrink-0" style={{ color: on ? "var(--v2-sky)" : "var(--color-muted)" }}>{icon}</span> : null}<span className="min-w-0 truncate">{title}</span>
      </span>
      {sub ? <span className="mt-1 block text-[12px] leading-relaxed text-muted">{sub}</span> : null}
      {foot ? <span className="mt-2 block">{foot}</span> : null}
    </button>
  );
}
/** Une option qu'on allume, avec ses réglages dessous. */
function Extra({ on, set, title, sub, disabled, children }: { on: boolean; set: (v: boolean) => void; title: React.ReactNode; sub: string; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)", opacity: disabled ? 0.5 : 1 }}>
      <label className="flex cursor-pointer items-start gap-2.5"><Switch on={on && !disabled} onChange={set} disabled={disabled} /><span className="min-w-0"><b className="block text-[13px]">{title}</b><span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{sub}</span></span></label>
      {on && !disabled && children ? <div className="mt-3 pl-[48px] text-[12.5px]">{children}</div> : null}
    </div>
  );
}
const Small = ({ value, set, w = 64, unit }: { value: string; set: (s: string) => void; w?: number; unit?: string }) => (
  <span className="mx-1 inline-flex items-center gap-1.5 align-middle"><input value={value} onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" className="h-8 rounded-lg border bg-transparent px-2 text-right text-[13px] outline-none focus:border-(--v2-blue)" style={{ borderColor: "var(--color-line)", width: w }} />{unit}</span>
);

/**
 * Préparer un envoi : message → destinataires → moment → vérification. `onDone()` quand l'envoi est lancé.
 * `running` (MYM) : une campagne est déjà en cours pour cette modèle (une seule à la fois).
 */
export function Composer({ pf, creatorId, model, cur, lists, messages, counts, groups, running, init, onClose, onDone }: {
  pf: Pf; creatorId: string; model: string; cur: string; lists: OfList[]; messages: Ready[]; counts: Record<string, number>; groups: BulkGroup[]; running: boolean; init: ComposeInit; onClose: () => void; onDone: () => void;
}) {
  const mym = pf === "mym";
  const draftKey = `bloom.v2.bulk.draft.${creatorId}`;
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // --- le message : un brouillon commencé sur cet ordinateur est repris (sauf si on part d'un envoi ou d'un message prêt)
  const [saved] = useState(() => (init.text == null && init.messageId == null ? readDraft(draftKey) : null));
  const [d, setD] = useState<Draft>(() => (saved ? { text: saved.text, medias: saved.medias, paid: saved.paid, price: saved.price } : { ...EMPTY, text: init.text ?? "", paid: (init.price ?? 0) > 0, price: init.price ? String(init.price) : "" }));
  const [title, setTitle] = useState(saved?.title ?? "");
  const [ready, setReady] = useState<Ready[]>(messages);
  const [mid, setMid] = useState<number | null>(init.messageId ?? null);
  const [writing, setWriting] = useState(mym && init.messageId == null && (!messages.length || !!saved));
  // `own` : le message est celui qu'on écrit ici (toujours côté OnlyFans) ; sinon c'est un message prêt (MYM).
  const own = !mym || writing;
  const msg = own ? null : ready.find((m) => m.id === mid) ?? null;
  const shownTitle = mym ? (own ? title.trim() : msg?.title ?? "") : "";
  const shownText = own ? d.text : msg?.text ?? "";
  const shownMedias = own ? d.medias : msg?.medias ?? [];
  const basePrice = own ? amountOf(d) : msg?.price ?? 0;
  const hasMedia = shownMedias.length > 0;
  useEffect(() => {
    try {
      if (d.text || d.medias.length || title) localStorage.setItem(draftKey, JSON.stringify({ ...d, title }));
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [d, title, draftKey]);
  // --- les destinataires
  const [inc, setInc] = useState<string[]>(init.include ?? []);
  const [exc, setExc] = useState<string[]>(init.exclude ?? []);
  const [online, setOnline] = useState(false);
  const [lq, setLq] = useState("");
  const [aud, setAud] = useState<string[]>(["active"]);
  const [newSubs, setNewSubs] = useState(false);
  const [newDays, setNewDays] = useState("7");
  const [skipActive, setSkipActive] = useState(true);
  const [skipMin, setSkipMin] = useState("30");
  const [spend, setSpend] = useState(false);
  const [spendMin, setSpendMin] = useState("");
  const [spendMax, setSpendMax] = useState("");
  // --- prix intelligent, moment, retrait, challenge
  const [smart, setSmart] = useState(false);
  const [smartMin, setSmartMin] = useState("10");
  const [smartMax, setSmartMax] = useState("50");
  const [later, setLater] = useState(false);
  const [date, setDate] = useState(() => localInput(Date.now() + 3600_000));
  const [unsend, setUnsend] = useState(0);
  const [remove, setRemove] = useState(false);
  const [removeH, setRemoveH] = useState("12");
  const [chal, setChal] = useState(false);
  const [kw, setKw] = useState("");
  const [reward, setReward] = useState<number | null>(null);
  const [winH, setWinH] = useState("48");
  const [buyers, setBuyers] = useState(false);
  const [est, setEst] = useState<Est | null>(null);

  const payload = useMemo(() => ({
    creatorId, messageId: own ? null : mid, audiences: aud, include: inc, exclude: exc, newSubsDays: newSubs ? num(newDays) : 0, skipActiveMin: skipActive ? num(skipMin) : 0,
    spendMin: spend && spendMin !== "" ? num(spendMin) : null, spendMax: spend && spendMax !== "" ? num(spendMax) : null,
    smart: smart && hasMedia ? { min: num(smartMin), max: num(smartMax) } : null, removeAfterH: remove && !hasMedia ? num(removeH) : 0,
    challenge: chal && kw.trim() && reward ? { keywords: kw, rewardId: reward, windowH: num(winH) || 48, buyersOnly: buyers } : null,
  }), [creatorId, own, mid, aud, inc, exc, newSubs, newDays, skipActive, skipMin, spend, spendMin, spendMax, smart, hasMedia, smartMin, smartMax, remove, removeH, chal, kw, reward, winH, buyers]);
  // MYM : combien de fans seraient visés (rien n'est envoyé), recalculé à chaque réglage.
  useEffect(() => {
    if (!mym) return;
    let off = false;
    const t = setTimeout(() => void api<Est>("POST", "/api/mym/massdm/preview", payload).then((x) => void (!off && setEst(x))).catch(() => void (!off && setEst(null))), 300);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [mym, payload]);

  // --- ce que chaque étape exige
  const incLists = lists.filter((l) => inc.includes(l.id));
  const excLists = lists.filter((l) => exc.includes(l.id));
  const upTo = incLists.reduce((a, l) => a + l.fans, 0);
  const total = mym ? est?.total ?? 0 : upTo;
  // OnlyFans : on connaît la taille des listes, pas les doublons entre listes ni qui est en ligne → « jusqu'à ».
  const exact = incLists.length === 1 && !exc.length && !online;
  const countText = mym ? (est ? plural(est.total, "fan") : "…") : !inc.length ? "à choisir" : !upTo ? "les fans des listes choisies" : exact ? plural(upTo, "fan") : `jusqu’à ${plural(upTo, "fan")}`;
  const startMs = later ? new Date(date).getTime() : 0;
  const problems = [
    !own ? (msg ? "" : "Choisis un message prêt, ou écris-en un nouveau.") : mym && !title.trim() ? "Donne un titre au message (un repère pour l’équipe : les fans ne le voient pas)." : messageProblem(pf, d),
    mym ? (!aud.length ? "Coche au moins une audience." : spend && spendMin !== "" && spendMax !== "" && num(spendMax) < num(spendMin) ? "Dépense : le maximum est plus petit que le minimum." : "") : !inc.length ? "Choisis au moins une liste à qui envoyer." : "",
    (later && !(startMs > Date.now() + 60_000) ? "La date de départ doit être dans le futur." : "") || (mym && smart && hasMedia && !(num(smartMin) >= 5 && num(smartMax) >= num(smartMin)) ? "Prix intelligent : minimum 5 €, et un maximum au-dessus du minimum." : "") || (mym && chal && (!kw.trim() || !reward) ? "Challenge : donne un mot-clé et le message de récompense." : ""),
    mym ? (running ? "Une campagne est déjà en cours d’envoi pour cette modèle : attends qu’elle finisse, ou arrête-la." : !est ? "Calcul des destinataires…" : !est.total ? "Aucun fan ne correspond à ce choix de destinataires." : "") : "",
  ];
  const problem = step === 3 ? problems.find(Boolean) ?? "" : problems[step];
  const next = () => {
    if (problem) return;
    setStep(step + 1);
    setReached((x) => Math.max(x, step + 1));
  };
  const launch = async () => {
    setBusy(true);
    try {
      if (mym) {
        let id = mid;
        if (own) {
          // Un message écrit sur place devient d'abord un message prêt : la campagne part de lui.
          const res = await api<{ id: number }>("POST", "/api/mym/massdm/message", { creatorId, title: title.trim(), text: d.text, medias: d.medias, price: amountOf(d) });
          id = res.id;
          setReady((x) => [{ id: res.id, title: title.trim(), text: d.text.trim(), price: amountOf(d), medias: d.medias, createdBy: null, updatedAt: Date.now() }, ...x]);
          setMid(res.id);
          setWriting(false);
          setD(EMPTY);
          setTitle("");
        }
        await api("POST", "/api/mym/massdm/campaign", { ...payload, messageId: id, startAt: later ? new Date(startMs).toISOString() : null, confirm: true });
      } else {
        await api("POST", "/api/mass", { creatorId, text: d.text, price: amountOf(d), mediaIds: d.medias.map((m) => m.id), includedListIds: inc, excludedListIds: exc, onlineOnly: online, scheduledAt: later ? new Date(startMs).toISOString() : null, autoUnsendAfterSeconds: unsend || null });
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      }
      toast(later ? "Envoi programmé" : mym ? "Campagne lancée : les messages partent un par un" : "Message de masse lancé");
      onDone();
    } catch (e) {
      toast(errText(e), "err");
      setBusy(false);
    }
  };

  const STEPS = ["Message", "Destinataires", mym ? "Prix et moment" : "Moment", "Vérification"];
  const paid = basePrice > 0 || (mym && smart && hasMedia);
  const priceText = mym && smart && hasMedia ? `Prix intelligent, de ${smartMin} à ${smartMax} €` : basePrice ? euros(basePrice, cur) : "Gratuit";
  const audText = mym ? AUD.filter(([k]) => aud.includes(k)).map(([, l]) => l).join(" + ") || "—" : incLists.map((l) => l.name).join(", ") || "—";
  const tri = (id: string) => (inc.includes(id) ? "in" : exc.includes(id) ? "out" : "");
  const setTri = (id: string, v: "" | "in" | "out") => (setInc((x) => (v === "in" ? [...new Set([...x, id])] : x.filter((y) => y !== id))), setExc((x) => (v === "out" ? [...new Set([...x, id])] : x.filter((y) => y !== id))));
  const chip = (g: BulkGroup, on: boolean, click: () => void, ban = false) => (
    <button key={g.id} type="button" aria-pressed={on} onClick={click} className="v2-seg border" data-on={on && !ban} style={{ borderColor: on && ban ? "var(--v2-down)" : "var(--color-line)", color: on && ban ? "var(--v2-down)" : undefined, background: on && ban ? "rgb(244 63 94 / 0.12)" : undefined }}>
      {ban ? <Ban className="size-3" /> : <i className="size-2 rounded-full" style={{ background: g.color || "var(--v2-sky)" }} />}{g.name}<span className="v2-num opacity-60">{int(g.size)}</span>
    </button>
  );
  const row = (label: string, value: React.ReactNode, edit: number) => (
    <div className="flex items-start gap-3 border-b py-2.5 text-[13px]" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
      <span className="w-[110px] shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1 font-semibold">{value}</span>
      <button type="button" onClick={() => setStep(edit)} className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--v2-sky)" }}>Modifier</button>
    </div>
  );
  const small = (text: React.ReactNode) => <span className="block text-[12px] font-normal text-muted">{text}</span>;
  const fields = (
    <>
      {saved ? <p className="mb-3 text-[12.5px] text-muted">Ton brouillon a été repris.<button type="button" onClick={() => (setD(EMPTY), setTitle(""))} className="ml-1.5 font-semibold underline underline-offset-2">Repartir de zéro</button></p> : null}
      <MessageFields pf={pf} creatorId={creatorId} v={d} set={(part) => setD((x) => ({ ...x, ...part }))} id="cp" />
    </>
  );

  return (
    <div className="v2-rise">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className="v2-select"><ArrowLeft className="size-4 text-muted" />Retour aux envois</button>
        <p className="min-w-0 flex-1 text-[13px] text-muted">Nouvel envoi pour <b style={{ color: "var(--color-fg)" }}>{model}</b> · rien ne part avant la dernière étape.</p>
      </div>
      <div className="v2-noscroll mt-4 flex gap-1.5 overflow-x-auto">
        {STEPS.map((s, i) => (
          <button key={s} type="button" disabled={i > reached} onClick={() => setStep(i)} className="flex h-9 shrink-0 items-center gap-2 rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-45" style={{ borderColor: i === step ? "var(--v2-blue)" : "var(--color-line)", background: i === step ? "rgb(59 130 246 / 0.13)" : undefined, color: i === step ? "#fff" : "var(--color-muted)" }}>
            <span className="v2-num grid size-5 place-items-center rounded-full text-[11px]" style={{ background: i < step ? "var(--v2-blue)" : "rgb(255 255 255 / 0.08)", color: "#fff" }}>{i < step ? <Check className="size-3" /> : i + 1}</span>{s}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="v2-card p-4">
            {step === 0 ? (
              <>
                {init.note ? <p className="mb-3 rounded-[10px] border px-3 py-2 text-[12.5px] leading-relaxed" style={{ borderColor: "rgb(251 191 36 / 0.3)", background: "rgb(251 191 36 / 0.07)", color: "#fbbf24" }}>{init.note}</p> : null}
                {mym ? (
                  <>
                    <p className="v2-card-title">Quel message envoyer ?</p>
                    <p className="mt-0.5 mb-3 text-[12.5px] text-muted">Un envoi MYM part d’un « message prêt » : choisis-en un, ou écris-en un nouveau (il sera rangé dans les messages prêts au moment de l’envoi).</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ready.map((m) => (
                        <Option key={m.id} on={!writing && mid === m.id} onClick={() => (setMid(m.id), setWriting(false))} title={m.title} sub={m.text ? cut(m.text, 110) : "Média seul"} foot={<span className="flex flex-wrap gap-1.5"><span className="v2-tag">{m.medias.length ? plural(m.medias.length, "média") : "texte seul"}</span><span className="v2-tag" style={m.price ? { color: "var(--v2-up)", background: "rgb(16 185 129 / 0.14)" } : undefined}>{m.price ? euros(m.price, cur) : "gratuit"}</span></span>} />
                      ))}
                      <Option on={writing} onClick={() => setWriting(true)} icon={<Plus className="size-4" />} title="Écrire un nouveau message" sub="Texte, médias et prix." />
                    </div>
                    {writing ? (
                      <div className="mt-4 border-t pt-4" style={{ borderColor: "rgb(255 255 255 / 0.07)" }}>
                        <label className="v2-label" htmlFor="cp-title">Titre <span className="font-normal">(repère pour l’équipe, jamais envoyé)</span></label>
                        <input id="cp-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Relance du dimanche" className="v2-field mb-3" />
                        {fields}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="v2-card-title">Le message</p>
                    <p className="mt-0.5 mb-3 text-[12.5px] text-muted">Le même message pour tous les fans visés.</p>
                    {fields}
                  </>
                )}
              </>
            ) : null}

            {step === 1 ? (
              mym ? (
                <>
                  <p className="v2-card-title">Qui le reçoit ?</p>
                  <p className="mt-0.5 mb-3 text-[12.5px] text-muted">Parmi les fans avec qui une conversation existe et qu’on peut encore joindre. Chaque fan ne reçoit le message qu’une fois.</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {AUD.map(([k, l, sub, icon]) => <Option key={k} on={aud.includes(k)} onClick={() => setAud(aud.includes(k) ? aud.filter((x) => x !== k) : [...aud, k])} icon={icon} title={l} sub={sub} foot={<b className="v2-num text-[15px]">{int(counts[k] ?? 0)} <span className="text-[11.5px] font-semibold text-muted">joignables</span></b>} />)}
                  </div>
                  {groups.length ? (
                    <>
                      <p className="v2-label mt-4">Seulement ces groupes <span className="font-normal">(facultatif)</span></p>
                      <div className="flex flex-wrap gap-1.5">{groups.map((g) => chip(g, inc.includes(g.id), () => (setInc(inc.includes(g.id) ? inc.filter((x) => x !== g.id) : [...inc, g.id]), setExc(exc.filter((x) => x !== g.id)))))}</div>
                      <p className="v2-label mt-3">Jamais ces groupes <span className="font-normal">(facultatif)</span></p>
                      <div className="flex flex-wrap gap-1.5">{groups.map((g) => chip(g, exc.includes(g.id), () => (setExc(exc.includes(g.id) ? exc.filter((x) => x !== g.id) : [...exc, g.id]), setInc(inc.filter((x) => x !== g.id))), true))}</div>
                    </>
                  ) : <p className="mt-3 text-[12px] text-muted">Aucun groupe pour cette modèle : ils se créent dans l’écran Fans.</p>}
                  <p className="v2-label mt-4">Affiner <span className="font-normal">(facultatif)</span></p>
                  <div className="space-y-2">
                    <Extra on={skipActive} set={setSkipActive} title="Ne pas couper une conversation en cours" sub="Les fans qui viennent d’écrire sont laissés de côté. Vérifié encore au moment où chaque message part.">Le fan a écrit il y a moins de<Small value={skipMin} set={setSkipMin} unit="minutes" /></Extra>
                    <Extra on={newSubs} set={setNewSubs} title="Seulement les nouveaux abonnés" sub="Ceux dont l’abonnement a commencé récemment (quand Bloom connaît la date).">Abonnés depuis<Small value={newDays} set={setNewDays} unit="jours au plus" /></Extra>
                    <Extra on={spend} set={setSpend} title="Selon ce que le fan a déjà dépensé" sub="Achats et pourboires vus par Bloom chez cette modèle.">Entre<Small value={spendMin} set={setSpendMin} w={72} unit="€ et" /><Small value={spendMax} set={setSpendMax} w={72} unit="€ (vide = sans limite)" /></Extra>
                  </div>
                </>
              ) : (
                <>
                  <p className="v2-card-title">À quelles listes ?</p>
                  <p className="mt-0.5 mb-3 text-[12.5px] text-muted">Ce sont les listes d’OnlyFans de {model}. Le message part aux fans des listes incluses, sauf ceux des listes exclues.</p>
                  <input value={lq} onChange={(e) => setLq(e.target.value)} placeholder="Chercher une liste" aria-label="Chercher une liste" className="v2-field mb-2" />
                  <div className="v2-scroll max-h-[46vh] space-y-1 overflow-y-auto pr-1">
                    {lists.filter((l) => !lq || l.name.toLowerCase().includes(lq.toLowerCase())).map((l) => {
                      const v = tri(l.id);
                      return (
                        <div key={l.id} className="flex items-center gap-2 rounded-[10px] border px-3 py-2" style={{ borderColor: v === "in" ? "rgb(59 130 246 / 0.5)" : v === "out" ? "rgb(244 63 94 / 0.4)" : "var(--color-line)", background: v === "in" ? "rgb(59 130 246 / 0.08)" : v === "out" ? "rgb(244 63 94 / 0.06)" : undefined }}>
                          <span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{l.name}</b><span className="v2-num block text-[11.5px] text-muted">{plural(l.fans, "fan")}</span></span>
                          <div className="v2-segbar shrink-0">
                            <button type="button" className="v2-seg" data-on={v === "in"} aria-pressed={v === "in"} onClick={() => setTri(l.id, v === "in" ? "" : "in")}>Inclure</button>
                            <button type="button" className="v2-seg" data-on={false} aria-pressed={v === "out"} onClick={() => setTri(l.id, v === "out" ? "" : "out")} style={v === "out" ? { color: "#fff", background: "rgb(244 63 94 / 0.3)" } : undefined}>Exclure</button>
                          </div>
                        </div>
                      );
                    })}
                    {!lists.length ? <p className="py-6 text-center text-[12.5px] text-muted">Aucune liste lue chez OnlyFans pour l’instant.</p> : null}
                  </div>
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5"><Switch on={online} onChange={setOnline} /><span><b className="block text-[13px]">Seulement les fans en ligne</b><span className="mt-0.5 block text-[12px] text-muted">OnlyFans n’envoie alors le message qu’aux fans connectés à ce moment-là.</span></span></label>
                </>
              )
            ) : null}

            {step === 2 ? (
              <>
                {mym ? (
                  <>
                    <p className="v2-card-title">À quel prix ?</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Option on={!smart || !hasMedia} onClick={() => setSmart(false)} title="Le prix du message" sub={`Tout le monde reçoit le même : ${basePrice ? euros(basePrice, cur) : "gratuit"}.`} />
                      <Option on={smart && hasMedia} disabled={!hasMedia} onClick={() => setSmart(true)} icon={<Sparkles className="size-4" />} title="Prix intelligent" sub={hasMedia ? "Chaque fan reçoit un prix calculé sur ses achats passés, entre un minimum et un maximum." : "Il fixe le prix des médias : il faut un message avec média."} />
                    </div>
                    {smart && hasMedia ? <p className="mt-3 text-[12.5px]">Minimum<Small value={smartMin} set={setSmartMin} unit="€" /> Maximum<Small value={smartMax} set={setSmartMax} unit="€" /><span className="mt-1.5 block text-[12px] text-muted">Prix d’un fan = son panier moyen (ce qu’il a dépensé ÷ ses achats), ramené entre les deux. Un fan qui n’a jamais acheté reçoit le minimum.{!own && est?.total ? ` Sur ces destinataires : de ${est.priceMin} à ${est.priceMax} €.` : ""}</span></p> : null}
                    <p className="v2-card-title mt-5">Quand ?</p>
                  </>
                ) : <p className="v2-card-title">Quand ?</p>}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Option on={!later} onClick={() => setLater(false)} icon={<Zap className="size-4" />} title="Maintenant" sub="L’envoi démarre dès la confirmation." />
                  <Option on={later} onClick={() => setLater(true)} icon={<CalendarClock className="size-4" />} title="Plus tard" sub="À la date et à l’heure choisies." />
                </div>
                {later ? <div className="mt-3 max-w-[260px]"><input type="datetime-local" value={date} min={localInput(Date.now())} onChange={(e) => setDate(e.target.value)} className="v2-field" style={{ colorScheme: "dark" }} aria-label="Date et heure de départ" /></div> : null}
                {later ? <p className="mt-1.5 text-[12px] text-muted">Heure de ton appareil.{mym ? " Les destinataires sont recomptés au moment du départ." : ""}</p> : null}
                <div className="mt-4 space-y-2">
                  {mym ? (
                    <>
                      <Extra on={remove} set={setRemove} disabled={hasMedia} title={<><Undo2 className="mr-1.5 inline size-3.5 align-[-2px]" />Retirer le message s’il n’est pas lu</>} sub={hasMedia ? "Impossible avec un média : MYM refuse de supprimer un message qui en porte un." : "Il disparaît des conversations où il n’a pas été ouvert à temps."}>Après<Small value={removeH} set={setRemoveH} unit="heures (à partir de la fin de l’envoi)" /></Extra>
                      <Extra on={chal} set={setChal} title="Challenge en deux temps" sub="Si le fan répond un mot-clé après ce message, un second message lui part tout seul (une seule fois).">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div><label className="v2-label" htmlFor="cp-kw">Mot-clé attendu</label><input id="cp-kw" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="CADEAU" className="v2-field" /><span className="mt-1 block text-[11.5px] text-muted">Majuscules et accents ignorés. Plusieurs mots : sépare-les par des virgules.</span></div>
                          <div><label className="v2-label" htmlFor="cp-rw">Message envoyé en récompense</label><select id="cp-rw" value={reward ?? ""} onChange={(e) => setReward(Number(e.target.value) || null)} className="v2-field" style={{ colorScheme: "dark" }}><option value="" style={{ background: "#121215" }}>Choisir un message prêt…</option>{ready.filter((m) => own || m.id !== mid).map((m) => <option key={m.id} value={m.id} style={{ background: "#121215" }}>{m.title}</option>)}</select></div>
                        </div>
                        <p className="mt-3">Le fan a<Small value={winH} set={setWinH} unit="heures pour répondre." /></p>
                        <label className="mt-2 flex cursor-pointer items-center gap-2.5"><Switch on={buyers} onChange={setBuyers} />Seulement s’il a acheté le premier message</label>
                      </Extra>
                    </>
                  ) : (
                    <div className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)" }}>
                      <label className="v2-label" htmlFor="cp-unsend">Retirer le message tout seul</label>
                      <div className="max-w-[260px]"><select id="cp-unsend" value={unsend} onChange={(e) => setUnsend(Number(e.target.value))} className="v2-field" style={{ colorScheme: "dark" }}>{UNSEND.map(([v, l]) => <option key={v} value={v} style={{ background: "#121215" }}>{l}</option>)}</select></div>
                      <p className="mt-1.5 text-[12px] text-muted">Le message est alors retiré des conversations des fans, sans rien faire de plus.</p>
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <div className="rounded-[12px] border p-4" style={{ borderColor: "rgb(59 130 246 / 0.45)", background: "rgb(59 130 246 / 0.08)" }}>
                  <p className="flex flex-wrap items-baseline gap-x-3"><b className="v2-num text-[34px] leading-none font-bold">{mym ? int(total) : !upTo ? "?" : int(upTo)}</b><span className="text-[13.5px]">{mym || exact ? `fan${total > 1 ? "s" : ""} recevr${total > 1 ? "ont" : "a"} ce message` : "fans au plus recevront ce message"}</span></p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{mym ? `Les messages partent un par un : environ ${est?.minutes ?? 0} min.${est ? ` ${AUD.filter(([k]) => aud.includes(k)).map(([k, l]) => `${l} : ${int(est.by[k] ?? 0)}`).join(" · ")}.` : ""}` : `D’après la taille des listes incluses${incLists.length > 1 ? " (un fan présent dans deux listes ne le reçoit qu’une fois)" : ""}${exc.length ? ", moins les fans des listes exclues" : ""}${online ? ", et seulement ceux qui sont en ligne" : ""}.`}</p>
                </div>
                <div className="mt-3">
                  {row("Message", <>{mym ? shownTitle || "—" : shownText.trim() ? cut(shownText.trim(), 90) : "Média seul"}{small(shownMedias.length ? plural(shownMedias.length, "média") : "texte seul")}</>, 0)}
                  {row("Destinataires", <>
                    {audText}
                    {mym && inc.length ? small(`Groupes : ${groups.filter((g) => inc.includes(g.id)).map((g) => g.name).join(", ")}`) : null}
                    {exc.length ? small(`Sauf ${(mym ? groups.filter((g) => exc.includes(g.id)) : excLists).map((x) => x.name).join(", ")}`) : null}
                    {mym && (newSubs || skipActive || spend) ? small([skipActive ? `hors conversations en cours (${skipMin} min)` : "", newSubs ? `abonnés depuis ${newDays} j au plus` : "", spend ? `dépense de ${spendMin || 0} à ${spendMax || "∞"} €` : ""].filter(Boolean).join(" · ")) : null}
                    {!mym && online ? small("Fans en ligne seulement") : null}
                  </>, 1)}
                  {row("Prix", priceText, mym ? 2 : 0)}
                  {row("Départ", <>
                    {later ? `Le ${whenText(startMs)}` : "Dès la confirmation"}
                    {mym && remove && !hasMedia ? small(`Retiré s’il n’est pas lu après ${removeH} h`) : null}
                    {!mym && unsend ? small(`${UNSEND.find(([v]) => v === unsend)?.[1]} : retiré tout seul des conversations`) : null}
                    {mym && chal && kw.trim() && reward ? small(`Challenge « ${kw} » → ${ready.find((m) => m.id === reward)?.title ?? ""}`) : null}
                  </>, 2)}
                </div>
                <p className="mt-3 rounded-[10px] border px-3 py-2.5 text-[12.5px] leading-relaxed" style={{ borderColor: "rgb(251 191 36 / 0.3)", background: "rgb(251 191 36 / 0.07)", color: "#fbbf24" }}>
                  {mym ? (hasMedia ? "Ce message porte un média : une fois parti, il ne pourra PAS être retiré chez les fans (MYM le refuse)." : "Message texte : il pourra être retiré ensuite chez les fans qui ne l’ont pas lu, ou chez tous.") : "Un message de masse part d’un coup à tous les fans visés. OnlyFans ne permet de le retirer que pendant un temps limité."}
                </p>
              </>
            ) : null}

            {problem ? <p className="mt-4 text-[12.5px] text-muted">{problem}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className="v2-btn" data-kind="ghost"><ArrowLeft className="size-4" />Retour</button> : <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>}
              <span className="flex-1" />
              {step < 3 ? <button type="button" onClick={next} disabled={!!problem} className="v2-btn">Continuer<ArrowRight className="size-4" /></button> : <button type="button" onClick={() => setConfirm(true)} disabled={busy || !!problem} className="v2-btn"><Send className="size-4" />{later ? "Programmer l’envoi" : mym ? `Envoyer à ${plural(total, "fan")}` : "Envoyer le message"}</button>}
            </div>
          </div>
        </div>

        {/* Le résumé, toujours visible */}
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <div className="v2-card p-3.5">
            <p className="text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">Aperçu</p>
            <div className="mt-2.5 rounded-[14px] rounded-bl-[4px] p-3" style={{ background: "rgb(59 130 246 / 0.16)" }}>
              {shownMedias.length ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {shownMedias.slice(0, 4).map((x) => (
                    <span key={x.id} className="relative size-12 overflow-hidden rounded-lg" style={{ background: "rgb(0 0 0 / 0.35)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {x.thumb ? <img src={x.thumb} alt="" className="size-full object-cover" style={paid ? { filter: "blur(5px)" } : undefined} /> : null}
                    </span>
                  ))}
                  {shownMedias.length > 4 ? <span className="grid size-12 place-items-center rounded-lg text-[11.5px] text-muted" style={{ background: "rgb(0 0 0 / 0.35)" }}>+{shownMedias.length - 4}</span> : null}
                </div>
              ) : null}
              <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">{shownText.trim() || <span className="text-muted">Ton message apparaîtra ici.</span>}</p>
              {paid ? <p className="mt-2 text-[12px] font-bold" style={{ color: "var(--v2-up)" }}>{priceText} pour voir {shownMedias.length > 1 ? "les médias" : "le média"}</p> : null}
            </div>
            <div className="mt-3 space-y-1.5 text-[12.5px]">
              <p className="flex justify-between gap-3"><span className="text-muted">Destinataires</span><b className="v2-num text-right">{countText}</b></p>
              <p className="flex justify-between gap-3"><span className="text-muted">Prix</span><b className="text-right">{priceText}</b></p>
              <p className="flex justify-between gap-3"><span className="text-muted">Départ</span><b className="text-right">{later ? new Date(startMs || Date.now()).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "maintenant"}</b></p>
            </div>
          </div>
        </aside>
      </div>

      {confirm ? (
        <Confirm
          title={later ? "Programmer cet envoi ?" : mym ? `Envoyer à ${plural(total, "fan")} ?` : "Envoyer ce message de masse ?"}
          text={`${mym ? `« ${shownTitle} » part en message privé à ${plural(total, "fan")} de ${model}` : `Le message part aux fans des listes choisies de ${model} (${countText})`}${later ? `, le ${whenText(startMs)}` : ", tout de suite"}. ${mym ? (hasMedia ? "Il ne pourra pas être retiré ensuite." : "Il pourra être retiré ensuite.") : "Une fois parti, il ne se rattrape que pendant un temps limité."}${mym && own ? " Le message est aussi rangé dans les messages prêts." : ""}`}
          button={later ? "Oui, programmer" : "Oui, envoyer maintenant"}
          go={launch}
          onClose={() => setConfirm(false)}
        />
      ) : null}
    </div>
  );
}

/** Créer ou modifier un message prêt (MYM). `onSaved(id, préparerLEnvoi)`. */
export function ReadyForm({ creatorId, msg, onClose, onSaved }: { creatorId: string; msg: Ready | null; onClose: () => void; onSaved: (id: number, prepare: boolean) => void }) {
  const [title, setTitle] = useState(msg?.title ?? "");
  const [d, setD] = useState<Draft>({ text: msg?.text ?? "", medias: msg?.medias ?? [], paid: (msg?.price ?? 0) > 0, price: msg?.price ? String(msg.price) : "" });
  const [busy, setBusy] = useState(false);
  const problem = !title.trim() ? "Donne un titre (un repère pour l’équipe : les fans ne le voient pas)." : messageProblem("mym", d);
  const save = async (prepare: boolean) => {
    if (problem) return;
    setBusy(true);
    try {
      const r = await api<{ id: number }>("POST", "/api/mym/massdm/message", { creatorId, id: msg?.id, title: title.trim(), text: d.text, medias: d.medias, price: amountOf(d) });
      toast("Message enregistré");
      onSaved(r.id, prepare);
    } catch (e) {
      toast(errText(e), "err");
      setBusy(false);
    }
  };
  return (
    <Modal wide sticky title={msg ? "Modifier le message prêt" : "Nouveau message prêt"} sub="Un message écrit une fois, envoyé ensuite en campagne autant de fois qu’on veut. L’enregistrer n’envoie rien." onClose={onClose}>
      <label className="v2-label" htmlFor="rd-title">Titre <span className="font-normal">(repère pour l’équipe, jamais envoyé)</span></label>
      <input id="rd-title" autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Relance du dimanche" className="v2-field mb-3" />
      <MessageFields pf="mym" creatorId={creatorId} v={d} set={(part) => setD((x) => ({ ...x, ...part }))} id="rd" />
      {d.medias.length ? <p className="mt-3 text-[12px]" style={{ color: "#fbbf24" }}>Avec un média, le message ne pourra pas être retiré chez les fans après l’envoi (MYM le refuse).</p> : null}
      {problem ? <p className="mt-3 text-[12.5px] text-muted">{problem}</p> : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save(false)} disabled={busy || !!problem} className="v2-btn" data-kind="ghost">{busy ? "Enregistrement…" : "Enregistrer"}</button>
        <button type="button" onClick={() => void save(true)} disabled={busy || !!problem} className="v2-btn">Enregistrer et préparer l’envoi<ArrowRight className="size-4" /></button>
      </div>
    </Modal>
  );
}

/**
 * Message automatique (OnlyFans, fait par Bloom : smart.mjs). Après un achat, le fan reçoit une « variante » tirée au
 * hasard — un premier message puis d'éventuelles suites. Brouillon tant qu'il n'est pas activé.
 * ⚠️ « Bienvenue aux nouveaux abonnés » existe dans le moteur mais ne peut pas partir côté OnlyFans : il s'appuie sur
 * la date d'abonnement, que la liste des conversations de Substy ne donne pas (relevé le 25/11/2026). Il n'est donc
 * pas proposé ici pour un nouveau message.
 */
type AutoDraft = Draft & { delay: string };
const TRIGGERS: [string, string][] = [
  ["purchase", "Le fan vient d’acheter un contenu payant envoyé en message."],
  ["welcome", "Pas disponible pour l’instant : Bloom ne reçoit pas la date d’abonnement des fans OnlyFans."],
];
export function AutoForm({ creatorId, auto, copy, onClose, onDone }: { creatorId: string; auto: Auto | null; copy?: boolean; onClose: () => void; onDone: () => void }) {
  const [trigger, setTrigger] = useState(auto && TRIGGER_NAME[auto.trigger] ? auto.trigger : "purchase");
  const [delayMin, setDelayMin] = useState(String(auto?.delayMin ?? 1));
  const [delayMax, setDelayMax] = useState(String(auto?.delayMax ?? 2));
  const [once, setOnce] = useState(auto?.once ?? true);
  const [stop, setStop] = useState(auto?.unsendOnReply ?? true);
  const [cols, setCols] = useState<{ messages: AutoDraft[] }[]>(() => {
    const from: { messages: AutoMsg[] }[] = auto?.collections?.length ? auto.collections : [{ messages: [{ text: "", medias: [], price: 0, delay: 0 }] }];
    return from.map((c) => ({ messages: c.messages.map((m) => ({ text: m.text, medias: m.medias ?? [], paid: m.price > 0, price: m.price ? String(m.price) : "", delay: String(m.delay || 0) })) }));
  });
  const [col, setCol] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const cur = cols[col] ?? cols[0];
  const setMsg = (i: number, part: Partial<AutoDraft>) => setCols((x) => x.map((c, ci) => (ci !== col ? c : { messages: c.messages.map((m, mi) => (mi === i ? { ...m, ...part } : m)) })));
  const problem = cols.flatMap((c, ci) => c.messages.map((m, mi) => (messageProblem("of", m) ? `${cols.length > 1 ? `Variante ${ci + 1}, ` : ""}${mi ? `suite ${mi}` : "premier message"} : ${messageProblem("of", m)}` : ""))).find(Boolean) ?? (num(delayMax) < num(delayMin) ? "Délai : le maximum est plus petit que le minimum." : "");
  const save = async (publish: boolean) => {
    setBusy(true);
    try {
      await api("POST", "/api/smart/auto", {
        id: copy ? undefined : auto?.id, creatorId, trigger, include: [], exclude: [], delayMin: num(delayMin), delayMax: num(delayMax), once, startsAt: null, unsendOnReply: stop, publish,
        collections: cols.map((c) => ({ messages: c.messages.map((m) => ({ text: m.text, medias: m.medias, price: amountOf(m), delay: num(m.delay) })) })),
      });
      toast(publish ? "Message automatique activé" : "Brouillon enregistré");
      onDone();
    } catch (e) {
      toast(errText(e), "err");
      setBusy(false);
    }
  };
  return (
    <Modal wide sticky title={auto && !copy ? "Modifier le message automatique" : "Nouveau message automatique"} sub="Bloom l’envoie tout seul, en message privé, à chaque fan concerné. Rien ne part tant qu’il n’est pas activé." onClose={onClose}>
      <p className="v2-label">Quand l’envoyer</p>
      <div className="grid gap-2 sm:grid-cols-2">{TRIGGERS.map(([k, sub]) => <Option key={k} on={trigger === k} disabled={k === "welcome" && trigger !== "welcome"} onClick={() => setTrigger(k)} title={TRIGGER_NAME[k]} sub={sub} />)}</div>
      <p className="mt-3 text-[12.5px]">Entre<Small value={delayMin} set={setDelayMin} w={56} unit="et" /><Small value={delayMax} set={setDelayMax} w={56} unit="minutes après (délai tiré au hasard, pour ne pas faire robot)." /></p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px]">
        <label className="flex cursor-pointer items-center gap-2.5"><Switch on={once} onChange={setOnce} />Une seule fois par fan</label>
        <label className="flex cursor-pointer items-center gap-2.5"><Switch on={stop} onChange={setStop} />Arrêter la suite dès que le fan répond</label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-4" style={{ borderColor: "rgb(255 255 255 / 0.07)" }}>
        {cols.map((_, i) => <button key={i} type="button" className="v2-seg border" data-on={i === col} onClick={() => setCol(i)} style={{ borderColor: "var(--color-line)" }}>Variante {i + 1}</button>)}
        {cols.length < 10 ? <button type="button" onClick={() => (setCols([...cols, { messages: [{ ...EMPTY, delay: "0" }] }]), setCol(cols.length))} className="v2-seg border" style={{ borderColor: "var(--color-line)" }}><Plus className="size-3" />Variante</button> : null}
        <span className="flex-1" />
        {cols.length > 1 ? <button type="button" onClick={() => (setCols(cols.filter((_, i) => i !== col)), setCol(0))} className="v2-seg" style={{ color: "var(--v2-down)" }}><Trash2 className="size-3" />Supprimer cette variante</button> : null}
      </div>
      <p className="mt-1.5 text-[12px] text-muted">Avec plusieurs variantes, chaque fan en reçoit une, tirée au hasard.</p>
      {cur.messages.map((m, i) => (
        <div key={`${col}:${i}`} className="mt-3 rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)" }}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] font-bold">
            {i === 0 ? "Premier message" : <>Suite {i}<span className="font-normal text-muted">envoyée<Small value={m.delay} set={(s) => setMsg(i, { delay: s })} w={56} unit="minutes après le précédent" /></span></>}
            <span className="flex-1" />
            {i > 0 ? <button type="button" onClick={() => setCols((x) => x.map((c, ci) => (ci !== col ? c : { messages: c.messages.filter((_, mi) => mi !== i) })))} className="text-muted hover:text-(--color-fg)" aria-label="Supprimer ce message"><Trash2 className="size-3.5" /></button> : null}
          </div>
          <MessageFields pf="of" creatorId={creatorId} v={m} set={(part) => setMsg(i, part)} id={`au-${col}-${i}`} />
        </div>
      ))}
      {cur.messages.length < 10 ? <button type="button" onClick={() => setCols((x) => x.map((c, ci) => (ci !== col ? c : { messages: [...c.messages, { ...EMPTY, delay: "2" }] })))} className="mt-2 text-[12.5px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--v2-sky)" }}>+ Ajouter une suite</button> : null}

      {problem ? <p className="mt-3 text-[12.5px] text-muted">{problem}</p> : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save(false)} disabled={busy || !!problem} className="v2-btn" data-kind="ghost">Enregistrer en brouillon</button>
        <button type="button" onClick={() => setAsk(true)} disabled={busy || !!problem} className="v2-btn"><Zap className="size-4" />Activer</button>
      </div>
      {ask ? <Confirm title="Activer ce message automatique ?" text={`À partir de maintenant, ${trigger === "purchase" ? "chaque fan qui achète un contenu payant" : "chaque nouvel abonné"} recevra ce message en privé, sans autre confirmation. Tu peux l’arrêter à tout moment.`} button="Oui, activer" go={() => save(true)} onClose={() => setAsk(false)} /> : null}
    </Modal>
  );
}
