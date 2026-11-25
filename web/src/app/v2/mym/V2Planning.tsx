"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Eraser, ImagePlus, Lock, Play, Plus, Search, Users } from "lucide-react";
import { api, toast } from "@/lib/api";
import { Avatar } from "@/rv/components/ui";
import { PlanImport } from "@/app/app/mym/MymPlanImport";
import { Confirm, Modal, PALETTE, RowMenu } from "../kit";
import { errText, MediaPicker, plural, type PickedMedia } from "../media/MediaKit";

// Bloom v2 → MYM → Planification (25/11/2026, « Constellation »). Remplace, dans la v2, la copie de MyPulse
// (`MymPlanning`). Mêmes routes (« /api/mym/plan… », mymmedia.mjs) : Bloom garde la publication (`mym_plan`) et la
// PUBLIE LUI-MÊME chez MYM à l'heure prévue (toutes les 20 s). Planifier = une vraie publication à venir : le
// formulaire ne part qu'avec « Planifier », et annuler passe par une confirmation. Le média se choisit dans la fenêtre
// de la v2 (`MediaPicker`, MYM Cloud). L'import Excel garde son ancien affichage (`PlanImport`).
type Account = { id: string; name: string; username: string | null; avatar: string | null; linked: boolean };
type Status = "planned" | "publishing" | "created" | "failed" | "cancelled";
type Item = {
  id: number; creatorId: string; kind: string; at: number; visibility: "public" | "private"; caption: string; mediaId: string; mediaType: string | null; status: Status; error: string | null;
  createdBy: string | null; audience?: string | null; after?: { action: string; ms: number | null; at: number | null; done: number | null; error: string | null } | null;
};
type Data = { canEdit: boolean; accounts: Account[]; items: Item[]; last?: Record<string, number> };
type Draft = { id?: number; creatorId: string; at: string; visibility: "public" | "private"; caption: string; media: PickedMedia | null; mediaId: string; mediaType: string };
const TABS = [["cal", "Calendrier"], ["next", "À venir"], ["past", "Historique"], ["xls", "Import Excel"]] as const;
const STATUS: Record<Status, [string, string]> = { planned: ["Planifié", "#60a5fa"], publishing: ["En cours d’envoi", "#fbbf24"], created: ["Publié", "#34d399"], failed: ["Échec", "#f87171"], cancelled: ["Annulé", "#8d8d95"] };
const pad = (n: number) => String(n).padStart(2, "0");
const local = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayOf = (ms: number) => local(ms).slice(0, 10);
const hour = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const full = (ms: number) => new Date(ms).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayTitle = (ms: number) => {
  const k = dayOf(ms);
  if (k === dayOf(Date.now())) return "Aujourd’hui";
  if (k === dayOf(Date.now() + 864e5)) return "Demain";
  return new Date(ms).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};
const what = (i: Item) => (i.kind === "story" ? `Story${i.audience ? ` · ${i.audience === "everyone" ? "tout le monde" : "abonnés"}` : ""}` : i.caption || "Post sans texte");
const afterText = (a: NonNullable<Item["after"]>) => `${a.action === "delete" ? "supprimé" : "passé en privé"} ${a.done === 1 ? "✓" : a.error ? "(échec)" : a.ms ? `après ${Math.round(a.ms / 3600e3)} h` : ""}`.trim();

export function V2Planning() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("cal");
  const [d, setD] = useState<Data | null>(null);
  const [cal, setCal] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  const [only, setOnly] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [look, setLook] = useState<Item | null>(null);
  const [stop, setStop] = useState<Item | null>(null);
  const [clear, setClear] = useState(false);
  // Grille du mois : 6 semaines à partir du lundi d'avant le 1er.
  const days = useMemo(() => {
    const f = new Date(month);
    const s = new Date(f.getFullYear(), f.getMonth(), 1 - ((f.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i).getTime());
  }, [month]);
  const load = useCallback(() => {
    api<Data>("GET", "/api/mym/plan").then((r) => (setD(r), setErr(""))).catch((e) => setErr(errText(e)));
    api<Data>("GET", `/api/mym/plan?from=${days[0]}&to=${days[41] + 864e5}`).then((r) => setCal(r.items)).catch(() => {});
  }, [days]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(t);
  }, [load]);
  const accounts = d?.accounts ?? [];
  const linked = accounts.filter((a) => a.linked);
  const canEdit = !!d?.canEdit;
  const acc = (id: string) => accounts.find((a) => a.id === id);
  const color = (id: string) => PALETTE[Math.max(0, accounts.findIndex((a) => a.id === id)) % PALETTE.length];
  const mineOnly = (l: Item[]) => l.filter((i) => !only || i.creatorId === only);
  const upcoming = mineOnly((d?.items ?? []).filter((i) => i.status === "planned" || i.status === "publishing"));
  const past = mineOnly((d?.items ?? []).filter((i) => i.status === "created" || i.status === "failed"));

  const compose = (at: number, it?: Item) => {
    if (!canEdit) return toast("Planifier : team leaders, managers et admins", "err");
    const first = linked.find((a) => !only || a.id === only) ?? linked[0];
    if (!first) return toast("Aucun compte MYM relié à Bloom (MYM → Compte Creator).", "err");
    setDraft(
      it
        ? { id: it.id, creatorId: it.creatorId, at: local(it.at), visibility: it.visibility, caption: it.caption, media: null, mediaId: it.mediaId, mediaType: it.mediaType || "photo" }
        : { creatorId: first.id, at: local(Math.max(at, Date.now() + 15 * 60_000)), visibility: "public", caption: "", media: null, mediaId: "", mediaType: "photo" },
    );
  };
  const openItem = (i: Item) => (i.status === "planned" && canEdit && i.kind !== "story" ? compose(i.at, i) : setLook(i));
  const today = dayOf(Date.now());
  const shift = (by: number) => setMonth(new Date(new Date(month).getFullYear(), new Date(month).getMonth() + by, 1).getTime());

  const row = (i: Item, actions = true) => {
    const a = acc(i.creatorId);
    const [label, c] = STATUS[i.status];
    return (
      <div key={i.id} className="flex items-center gap-3 border-t px-3 py-2.5 first:border-t-0" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
        <span className="v2-num w-12 shrink-0 text-[13px] font-semibold">{hour(i.at)}</span>
        <span className="size-2 shrink-0 rounded-full" style={{ background: color(i.creatorId) }} />
        <Avatar src={a?.avatar} name={a?.name} size="size-7" />
        <button onClick={() => openItem(i)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-semibold">{what(i)}</span>
          <span className="block truncate text-[11.5px] text-muted">{a?.name ?? "—"} · {i.kind === "story" ? "story" : i.visibility === "public" ? "public" : "privé"}{i.mediaType === "video" ? " · vidéo" : ""}{i.createdBy ? ` · par ${i.createdBy}` : ""}{i.after ? ` · ${afterText(i.after)}` : ""}</span>
          {i.error ? <span className="block truncate text-[11.5px]" style={{ color: "var(--v2-down)" }}>{i.error}</span> : null}
        </button>
        <span className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ color: c, background: `${c}1f` }}>{label}</span>
        {actions && canEdit && i.status === "planned" ? <RowMenu name={`p-${i.id}`} items={[...(i.kind !== "story" ? [{ label: "Modifier", go: () => compose(i.at, i) }] : []), { label: "Annuler la publication", danger: true, go: () => setStop(i) }]} /> : <span className="w-7 shrink-0" />}
      </div>
    );
  };
  const grouped = (list: Item[], desc = false) => {
    const out: { key: string; at: number; list: Item[] }[] = [];
    for (const i of [...list].sort((x, y) => (desc ? y.at - x.at : x.at - y.at))) {
      const k = dayOf(i.at);
      const g = out[out.length - 1];
      if (g?.key === k) g.list.push(i);
      else out.push({ key: k, at: i.at, list: [i] });
    }
    return out;
  };

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">MYM · Studio</p>
          <h1 className="v2-h1 mt-1">Planification</h1>
          <p className="mt-1 max-w-[700px] text-[13px] text-muted">Prépare les posts à l’avance : Bloom les publie lui-même sur le profil MYM à l’heure prévue, avec un média du MYM Cloud.</p>
        </div>
        {canEdit ? <button onClick={() => compose(Date.now())} className="v2-btn" style={{ height: 36 }}><Plus className="size-4" />Planifier un post</button> : null}
      </div>

      <div className="v2-rise mt-5 flex flex-wrap items-center gap-x-5 gap-y-3" style={{ ["--i" as string]: 1 }}>
        <div className="v2-tabs">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="v2-tab" data-on={tab === k}>{l}{k === "next" && upcoming.length ? <span className="ml-1.5 text-muted">{upcoming.length}</span> : null}</button>)}</div>
        <span className="flex-1" />
        {tab !== "xls" && accounts.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setOnly("")} className="v2-chip" data-on={!only}>Tous les comptes</button>
            {accounts.map((a) => <button key={a.id} onClick={() => setOnly(a.id)} className="v2-chip" data-on={only === a.id}><span className="size-2 rounded-full" style={{ background: color(a.id) }} />{a.name}</button>)}
          </div>
        ) : null}
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {!d && !err ? <p className="py-20 text-center text-[13px] text-muted">Chargement…</p> : null}

      {d && tab === "cal" ? (
        <div className="v2-card v2-rise mt-4 p-3" style={{ ["--i" as string]: 2 }}>
          <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
            <button onClick={() => shift(-1)} className="v2-sq" aria-label="Mois précédent"><ChevronLeft className="size-4" /></button>
            <button onClick={() => shift(1)} className="v2-sq" aria-label="Mois suivant"><ChevronRight className="size-4" /></button>
            <p className="ml-1 text-[16px] font-bold capitalize">{new Date(month).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
            <button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime())} className="v2-seg border" style={{ borderColor: "var(--color-line)" }}>Aujourd’hui</button>
            <span className="flex-1" />
            {canEdit ? <span className="text-[12px] text-muted">Clique sur un jour pour y planifier un post.</span> : null}
          </div>
          <div className="grid grid-cols-7 overflow-hidden rounded-[12px] border" style={{ borderColor: "var(--color-line)" }}>
            {["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map((x) => <div key={x} className="border-b py-2 text-center text-[11.5px] font-semibold text-muted" style={{ borderColor: "var(--color-line)" }}>{x}</div>)}
            {days.map((t, n) => {
              const k = dayOf(t);
              const its = mineOnly(cal.filter((i) => dayOf(i.at) === k)).sort((x, y) => x.at - y.at);
              const out = new Date(t).getMonth() !== new Date(month).getMonth();
              const pastDay = k < today;
              return (
                <div
                  key={t}
                  onClick={() => !pastDay && canEdit && compose(new Date(t).setHours(18, 0, 0, 0))}
                  className={`min-h-[108px] p-1.5 transition-colors ${!pastDay && canEdit ? "cursor-pointer hover:bg-white/[0.025]" : ""}`}
                  style={{ borderTop: n >= 7 ? "1px solid var(--color-line)" : undefined, borderLeft: n % 7 ? "1px solid var(--color-line)" : undefined, opacity: out ? 0.38 : 1 }}
                >
                  <p className="text-right text-[11.5px]"><span className={`inline-grid size-6 place-items-center rounded-full ${k === today ? "font-bold text-white" : "text-muted"}`} style={k === today ? { background: "var(--v2-blue)" } : undefined}>{new Date(t).getDate()}</span></p>
                  <div className="mt-0.5 space-y-0.5">
                    {its.slice(0, 4).map((i) => (
                      <button key={i.id} onClick={(e) => (e.stopPropagation(), openItem(i))} title={`${full(i.at)} · ${acc(i.creatorId)?.name ?? ""} · ${what(i)} · ${STATUS[i.status][0]}`} className="flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px]" style={{ background: `${color(i.creatorId)}22`, boxShadow: `inset 2px 0 0 ${color(i.creatorId)}`, opacity: i.status === "failed" ? 0.7 : 1 }}>
                        <span className="v2-num shrink-0 font-semibold">{hour(i.at)}</span>
                        {i.visibility === "private" ? <Lock className="size-2.5 shrink-0" /> : null}
                        <span className="truncate">{what(i)}</span>
                        {i.status !== "planned" ? <span className="ml-auto size-1.5 shrink-0 rounded-full" style={{ background: STATUS[i.status][1] }} /> : null}
                      </button>
                    ))}
                    {its.length > 4 ? <p className="px-1 text-[10.5px] text-muted">+{its.length - 4} autres</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 px-1 text-[11.5px] text-muted">{(["planned", "created", "failed"] as Status[]).map((s) => <span key={s} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: STATUS[s][1] }} />{STATUS[s][0]}</span>)}<span className="flex items-center gap-1.5"><Lock className="size-3" />privé</span></div>
        </div>
      ) : null}

      {d && tab === "next" ? (
        <div className="v2-rise mt-4 space-y-4" style={{ ["--i" as string]: 2 }}>
          {canEdit ? <p className="flex justify-end"><button onClick={() => setClear(true)} className="v2-btn" data-kind="ghost" style={{ height: 32 }}><Eraser className="size-4" />Vider une période</button></p> : null}
          {grouped(upcoming).map((g) => (
            <section key={g.key}>
              <p className="mb-2 px-1 text-[12px] font-bold tracking-[0.1em] text-muted uppercase">{dayTitle(g.at)} <span className="font-semibold tracking-normal normal-case">· {plural(g.list.length, "publication")}</span></p>
              <div className="v2-card">{g.list.map((i) => row(i))}</div>
            </section>
          ))}
          {!upcoming.length ? <div className="v2-card grid place-items-center py-16 text-[13px] text-muted"><CalendarClock className="mb-3 size-7 opacity-60" />Rien de planifié pour l’instant.</div> : null}
        </div>
      ) : null}

      {d && tab === "past" ? <Past items={past} row={row} grouped={grouped} /> : null}
      {tab === "xls" ? <div className="v2-rise mt-4" style={{ ["--i" as string]: 2 }}><PlanImport accounts={accounts} onDone={load} /></div> : null}

      {draft ? <Composer draft={draft} accounts={linked} onClose={() => setDraft(null)} onSaved={() => (setDraft(null), load())} /> : null}
      {look ? (
        <Modal title={what(look)} sub={`${acc(look.creatorId)?.name ?? ""} · ${full(look.at)}`} onClose={() => setLook(null)}>
          <div className="space-y-2 text-[13px]">
            <p><span className="text-muted">État : </span><b style={{ color: STATUS[look.status][1] }}>{STATUS[look.status][0]}</b></p>
            <p><span className="text-muted">Type : </span>{look.kind === "story" ? "story" : `post ${look.visibility === "public" ? "public" : "privé"}`}{look.mediaType === "video" ? ", vidéo" : ""}</p>
            {look.createdBy ? <p><span className="text-muted">Planifié par : </span>{look.createdBy}</p> : null}
            {look.after ? <p><span className="text-muted">Après publication : </span>{afterText(look.after)}{look.after.error ? ` (${look.after.error})` : ""}</p> : null}
            {look.error ? <p className="rounded-[10px] border px-3 py-2" style={{ borderColor: "rgb(244 63 94 / 0.35)", color: "var(--v2-down)" }}>{look.error}</p> : null}
            {look.caption && look.kind !== "story" ? <p className="border-t pt-2 whitespace-pre-wrap text-muted" style={{ borderColor: "var(--color-line)" }}>{look.caption}</p> : null}
          </div>
        </Modal>
      ) : null}
      {stop ? (
        <Confirm title="Annuler cette publication ?" text={`${what(stop)} — ${acc(stop.creatorId)?.name ?? ""}, prévu ${full(stop.at)}. Elle ne partira pas chez MYM.`} button="Annuler la publication" go={async () => { await api("POST", "/api/mym/plan/cancel", { id: stop.id }); toast("Publication annulée"); load(); }} onClose={() => setStop(null)} />
      ) : null}
      {clear ? <Clear accounts={accounts} onClose={() => setClear(false)} onDone={load} /> : null}
    </div>
  );
}

function Past({ items, row, grouped }: { items: Item[]; row: (i: Item, actions?: boolean) => React.ReactNode; grouped: (l: Item[], desc?: boolean) => { key: string; at: number; list: Item[] }[] }) {
  const [q, setQ] = useState("");
  const shown = items.filter((i) => !q || what(i).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="v2-rise mt-4 space-y-4" style={{ ["--i" as string]: 2 }}>
      <label className="ml-auto flex h-9 w-full max-w-[320px] items-center gap-2 rounded-[10px] border px-3" style={{ borderColor: "var(--color-line)" }}><Search className="size-4 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans les textes" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label>
      {grouped(shown, true).map((g) => (
        <section key={g.key}>
          <p className="mb-2 px-1 text-[12px] font-bold tracking-[0.1em] text-muted uppercase">{dayTitle(g.at)}</p>
          <div className="v2-card">{g.list.map((i) => row(i, false))}</div>
        </section>
      ))}
      {!shown.length ? <div className="v2-card py-16 text-center text-[13px] text-muted">Rien de publié depuis Bloom pour l’instant.</div> : null}
    </div>
  );
}

/** Planifier (ou modifier) un post : rien n'est enregistré avant « Planifier ». */
function Composer({ draft, accounts, onClose, onSaved }: { draft: Draft; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(draft);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const a = accounts.find((x) => x.id === v.creatorId);
  const when = new Date(v.at).getTime();
  const soon = !Number.isFinite(when) || when < Date.now() + 60_000;
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/mym/plan", { id: v.id, creatorId: v.creatorId, at: when, visibility: v.visibility, caption: v.caption, mediaId: v.mediaId, mediaType: v.mediaType });
      toast(v.id ? "Publication modifiée" : "Post planifié");
      onSaved();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };
  return (
    <>
      <Modal sticky width={560} title={v.id ? "Modifier le post" : "Planifier un post"} sub="Bloom le publiera lui-même sur le profil MYM à l’heure choisie." onClose={onClose}>
        {!v.id && accounts.length > 1 ? (
          <>
            <p className="v2-label">Compte</p>
            <div className="flex flex-wrap gap-1.5">{accounts.map((x) => <button key={x.id} type="button" onClick={() => setV({ ...v, creatorId: x.id, media: null, mediaId: "" })} className="v2-pick w-auto" data-on={v.creatorId === x.id}><Avatar src={x.avatar} name={x.name} size="size-6" /><span className="text-[13px] font-semibold">{x.name}</span></button>)}</div>
          </>
        ) : <p className="flex items-center gap-2 text-[13px]"><Avatar src={a?.avatar} name={a?.name} size="size-6" /><b>{a?.name}</b></p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="v2-label" htmlFor="p-at">Date et heure</label>
            <input id="p-at" type="datetime-local" value={v.at} onChange={(e) => setV({ ...v, at: e.target.value })} className="v2-field" style={{ colorScheme: "dark" }} />
            {soon ? <p className="mt-1 text-[11.5px]" style={{ color: "var(--v2-down)" }}>Choisis une heure dans au moins une minute.</p> : null}
          </div>
          <div>
            <p className="v2-label">Visible par</p>
            <div className="v2-segbar w-full">{([["public", "Tout le monde", Users], ["private", "Abonnés", Lock]] as const).map(([k, l, I]) => <button key={k} type="button" onClick={() => setV({ ...v, visibility: k })} className="v2-seg flex-1 justify-center" data-on={v.visibility === k}><I className="size-3.5" />{l}</button>)}</div>
          </div>
        </div>
        <label className="v2-label mt-4" htmlFor="p-cap">Texte du post</label>
        <textarea id="p-cap" value={v.caption} maxLength={2000} onChange={(e) => setV({ ...v, caption: e.target.value })} rows={3} placeholder="Facultatif" className="v2-field" style={{ height: "auto", paddingTop: 8, paddingBottom: 8 }} />
        <p className="v2-label mt-4">Média</p>
        <div className="flex items-center gap-3">
          <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-[12px] border" style={{ borderColor: "var(--color-line)", background: "var(--color-card-2)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {v.media?.thumb ? <img src={v.media.thumb} alt="" className="size-full object-cover" /> : v.mediaId ? <span className="px-1 text-center text-[10.5px] text-muted">média choisi</span> : <ImagePlus className="size-5 text-muted" />}
            {v.mediaType === "video" && v.mediaId ? <Play className="absolute right-1 bottom-1 size-4 rounded-full bg-black/60 p-0.5 text-white" /> : null}
          </span>
          <div className="min-w-0">
            <button type="button" onClick={() => setPick(true)} className="v2-btn" data-kind="ghost" style={{ height: 34 }}><ImagePlus className="size-4" />{v.mediaId ? "Changer le média" : "Choisir dans le MYM Cloud"}</button>
            <p className="mt-1 text-[11.5px] text-muted">Une photo ou une vidéo déjà dans le MYM Cloud de {a?.name ?? "la modèle"}.</p>
          </div>
        </div>
        {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          {!soon && v.mediaId ? <span className="mr-auto text-[12px] text-muted">Part {full(when)}</span> : null}
          <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
          <button type="button" onClick={() => void save()} disabled={busy || soon || !v.mediaId} className="v2-btn">{busy ? "Enregistrement…" : v.id ? "Enregistrer" : "Planifier"}</button>
        </div>
      </Modal>
      {pick ? (
        <MediaPicker
          pf="mym"
          creatorId={v.creatorId}
          keep
          max={1}
          selected={v.media ? [v.media] : []}
          onPick={(l) => {
            const m = l[0];
            if (m) setV((x) => ({ ...x, media: m, mediaId: m.id, mediaType: /video/i.test(m.type) ? "video" : "photo" }));
            setPick(false);
          }}
          onClose={() => setPick(false)}
        />
      ) : null}
    </>
  );
}

/** Annuler d'un coup ce qui est planifié sur une période : on compte d'abord, puis on confirme. */
function Clear({ accounts, onClose, onDone }: { accounts: Account[]; onClose: () => void; onDone: () => void }) {
  const [cid, setCid] = useState(accounts[0]?.id ?? "");
  const [from, setFrom] = useState(dayOf(Date.now()));
  const [to, setTo] = useState(dayOf(Date.now() + 2 * 864e5));
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const range = () => ({ creatorId: cid, from: new Date(`${from}T00:00`).getTime(), to: new Date(`${to}T00:00`).getTime() + 864e5 });
  const run = async (dry: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ count: number }>("POST", "/api/mym/plan/clear", { ...range(), dry });
      if (dry) setCount(r.count);
      else (toast(`${plural(r.count, "publication annulée", "publications annulées")}`), onDone(), onClose());
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  return (
    <Modal title="Vider une période" sub="Annule tout ce qui est encore planifié sur ces jours, pour un compte." onClose={onClose}>
      <p className="v2-label">Compte</p>
      <div className="flex flex-wrap gap-1.5">{accounts.map((x) => <button key={x.id} type="button" onClick={() => (setCid(x.id), setCount(null))} className="v2-chip" data-on={cid === x.id}>{x.name}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><label className="v2-label" htmlFor="c-from">Du</label><input id="c-from" type="date" value={from} onChange={(e) => (setFrom(e.target.value), setCount(null))} className="v2-field" style={{ colorScheme: "dark" }} /></div>
        <div><label className="v2-label" htmlFor="c-to">Au</label><input id="c-to" type="date" value={to} onChange={(e) => (setTo(e.target.value), setCount(null))} className="v2-field" style={{ colorScheme: "dark" }} /></div>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">{count == null ? "Compte d’abord ce qui serait annulé." : count ? `${plural(count, "publication planifiée", "publications planifiées")} sur cette période.` : "Rien de planifié sur cette période."}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Fermer</button>
        {count ? <button type="button" disabled={busy} onClick={() => void run(false)} className="v2-btn" data-kind="danger">{busy ? "Un instant…" : `Annuler les ${count}`}</button> : <button type="button" disabled={busy} onClick={() => void run(true)} className="v2-btn">{busy ? "Un instant…" : "Compter"}</button>}
      </div>
    </Modal>
  );
}
