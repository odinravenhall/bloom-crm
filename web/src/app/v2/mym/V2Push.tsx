"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Eye, Image as ImageIcon, ImagePlus, Megaphone, Play, Plus, RefreshCw, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import type { Media } from "@/lib/types";
import { Avatar } from "@/rv/components/ui";
import { Confirm, int, Modal, PALETTE, Ring, RowMenu, Switch } from "../kit";
import { errText, MediaPicker, plural, type PickedMedia } from "../media/MediaKit";

// Bloom v2 → MYM → Push et MoDs (25/11/2026, « Constellation »). Remplace, dans la v2, les copies de MyPulse
// (`MymPush` : liste et « studio »). Mêmes routes (« /api/mym/push… », mymbulk.mjs) : le push est la fonction de MYM
// (message + médias à toute une cible, gratuit ou payant) ; une fois parti, il ne se retire pas. Création : admins et
// managers, en étapes comme « Nouvel envoi », RIEN ne part avant le dernier bouton, puis une confirmation.
// ⚠️ Format de création lu dans le code du site MYM, jamais essayé sur un vrai push. Un MoD = un push payant mis au
// catalogue « Media On Demand » (`mod`).
type Push = { id: string; targets: string[]; caption: string; price: number; mod: boolean; status: string | null; scheduledAt: string | null; sentAt: string | null; medias: Media[]; teaser: Media | null; sales: number | null; revenue: number | null; email: boolean | null };
type Data = { canSend: boolean; pushes: Push[]; audience: { id: string; count: number }[]; prices: number[]; durations: number[] };
type LinkRow = { creatorId: string; name: string; username: string | null; linked: boolean };
const TARGET: Record<string, { label: string; sub: string; Icon: typeof UserCheck; limit: string }> = {
  subscribers: { label: "Abonnés", sub: "Les abonnés actifs.", Icon: UserCheck, limit: "sans limite" },
  exSubscribers: { label: "Anciens abonnés", sub: "Les fans dont l’abonnement a pris fin.", Icon: UserMinus, limit: "1 push tous les 7 jours" },
  interested: { label: "Intéressés", sub: "Les fans intéressés qui ne se sont pas abonnés.", Icon: UserPlus, limit: "1 push tous les 7 jours" },
};
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const when = (v: number | string | null) => (v ? new Date(v).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const durLabel = (s: number) => (s % 86400 === 0 ? `${s / 86400} j` : `${Math.round(s / 3600)} h`);
const planned = (p: Push) => p.status !== "pushed" && !!p.scheduledAt && Date.parse(p.scheduledAt) > Date.now();

export function V2Push() {
  const { creators } = useCreators();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [cur, setCur] = useState("");
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"all" | "mod">("all");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Push | null>(null);
  const [stop, setStop] = useState<Push | null>(null);
  const [compose, setCompose] = useState(false);
  useEffect(() => {
    api<{ links: LinkRow[] }>("GET", "/api/mym/links").then((r) => setLinks(r.links)).catch((e) => setErr(errText(e)));
  }, []);
  const models = links ?? [];
  const m = models.find((x) => x.creatorId === cur) ?? models.find((x) => x.linked) ?? models[0] ?? null;
  const mid = m?.creatorId ?? "";
  const load = useCallback(() => {
    if (!mid) return;
    setBusy(true);
    api<Data>("GET", `/api/mym/push?creatorId=${encodeURIComponent(mid)}`)
      .then((d) => (setData({ key: mid, d }), setErr("")))
      .catch((e) => (setData({ key: mid, d: { canSend: false, pushes: [], audience: [], prices: [], durations: [] } }), setErr(errText(e))))
      .finally(() => setBusy(false));
  }, [mid]);
  useEffect(() => void load(), [load]);
  const d = data && data.key === mid ? data.d : null;
  const all = useMemo(() => d?.pushes ?? [], [d]);
  const rows = tab === "mod" ? all.filter((p) => p.mod) : all;
  const st = useMemo(() => ({ sales: all.reduce((n, p) => n + (p.sales ?? 0), 0), revenue: all.reduce((n, p) => n + (p.revenue ?? 0), 0), later: all.filter(planned).length, mods: all.filter((p) => p.mod).length }), [all]);
  const avatarOf = (id: string) => creators.find((c) => c.id === id)?.avatar ?? null;
  const tile = (label: string, value: React.ReactNode, sub?: string) => (
    <div className="min-w-0 rounded-[12px] border px-3.5 py-2.5" style={{ borderColor: "var(--color-line)" }}>
      <p className="truncate text-[11.5px] font-semibold text-muted">{label}</p>
      <p className="v2-num mt-0.5 truncate text-[20px] leading-tight font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub ?? " "}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">MYM · Envois</p>
          <h1 className="v2-h1 mt-1">Push et MoDs</h1>
          <p className="mt-1 max-w-[720px] text-[13px] text-muted">Le push de MYM : un message avec des médias envoyé d’un coup aux abonnés, anciens abonnés ou intéressés, gratuit ou payant. Un push payant peut rester en vente dans le catalogue « Media On Demand » (MoD).</p>
        </div>
        {m?.linked ? <button onClick={load} disabled={busy} className="v2-select" title="Relire les pushs chez MYM"><RefreshCw className={`size-4 text-muted ${busy ? "animate-spin" : ""}`} />Actualiser</button> : null}
        {d?.canSend ? <button onClick={() => setCompose(true)} className="v2-btn" style={{ height: 36 }}><Plus className="size-4" />Nouveau push</button> : null}
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {!links && !err ? <p className="py-20 text-center text-[13px] text-muted">Chargement…</p> : null}

      {m ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 1 }}>
            <div className="v2-card p-1.5">
              <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Comptes MYM</p>
              <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
                {models.map((x, i) => (
                  <button key={x.creatorId} onClick={() => setCur(x.creatorId)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.creatorId} aria-pressed={mid === x.creatorId}>
                    <Ring color={PALETTE[i % PALETTE.length]}><Avatar src={avatarOf(x.creatorId)} name={x.name} size="size-8" /></Ring>
                    <span className="min-w-0 flex-1 text-left">
                      <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                      <span className="block truncate text-[11.5px] text-muted">{x.linked ? (x.username ? `@${x.username}` : "relié") : "pas relié à Bloom"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="v2-rise min-w-0" style={{ ["--i" as string]: 2 }}>
            <div className="v2-card p-3">
              {!m.linked ? (
                <p className="p-6 text-center text-[13px] text-muted">Le compte MYM de {m.name} n’est pas relié à Bloom : relie-le dans MYM → Compte Creator.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 pb-3 md:grid-cols-4">
                    {tile("Pushs lus chez MYM", d ? int(all.length) : "…", "les 20 derniers")}
                    {tile("Ventes", d ? int(st.sales) : "…", "sur ces pushs")}
                    {tile("Chiffre d’affaires", d ? eur(st.revenue) : "…", "sur ces pushs")}
                    {tile("Programmés", d ? int(st.later) : "…", d ? `${plural(st.mods, "MoD")} au catalogue` : undefined)}
                  </div>
                  <div className="v2-tabs px-1 pb-2">
                    <button onClick={() => setTab("all")} className="v2-tab" data-on={tab === "all"}>Tous les pushs</button>
                    <button onClick={() => setTab("mod")} className="v2-tab" data-on={tab === "mod"}>MoDs (catalogue){st.mods ? <span className="ml-1.5 text-muted">{st.mods}</span> : null}</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-[13px]">
                      <thead><tr className="text-[11.5px] text-muted">{["", "Message", "Pour", "Prix", "Envoi", "Ventes", "CA", ""].map((h, i) => <th key={i} className={`px-3 py-2.5 font-semibold ${i >= 5 && i <= 6 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                      <tbody>
                        {rows.map((p) => (
                          <tr key={p.id} onClick={() => setOpen(p)} className="cursor-pointer border-t transition-colors hover:bg-white/[0.02]" style={{ borderColor: "var(--color-line)" }}>
                            <td className="w-[62px] px-3 py-2"><Thumb m={p.medias[0]} n={p.medias.length} /></td>
                            <td className="max-w-[300px] px-3"><span className="block truncate font-semibold">{p.caption || "Sans message"}</span>{p.mod ? <span className="v2-tag mt-1 inline-block">MoD</span> : null}</td>
                            <td className="px-3"><span className="flex flex-wrap gap-1">{p.targets.length ? p.targets.map((t) => <span key={t} className="v2-tag">{TARGET[t]?.label ?? t}</span>) : <span className="text-muted">—</span>}</span></td>
                            <td className="v2-num px-3 font-semibold" style={{ color: p.price ? undefined : "var(--v2-up)" }}>{p.price ? eur(p.price) : "Gratuit"}</td>
                            <td className="px-3 whitespace-nowrap">{planned(p) ? <span style={{ color: "#fbbf24" }}>Programmé · {when(p.scheduledAt)}</span> : when(p.sentAt || p.scheduledAt)}</td>
                            <td className="v2-num px-3 text-right">{p.sales != null ? int(p.sales) : "—"}</td>
                            <td className="v2-num px-3 text-right font-semibold">{p.revenue != null ? eur(p.revenue) : "—"}</td>
                            <td className="px-2" onClick={(e) => e.stopPropagation()}><span className="flex justify-end"><RowMenu name={`push-${p.id}`} items={[{ label: "Voir le détail", go: () => setOpen(p) }, ...(planned(p) && d?.canSend ? [{ label: "Annuler (programmé)", danger: true, go: () => setStop(p) }] : [])]} /></span></td>
                          </tr>
                        ))}
                        {d && !rows.length ? <tr><td colSpan={8} className="py-12 text-center text-muted"><Megaphone className="mx-auto mb-2 size-6 opacity-50" />{tab === "mod" ? "Aucun MoD parmi ces pushs." : "Aucun push trouvé."}</td></tr> : null}
                        {!d ? <tr><td colSpan={8} className="py-12 text-center text-muted">Lecture chez MYM…</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-1 pt-3 text-[11.5px] text-muted">Les 20 derniers pushs du compte, lus chez MYM (faits depuis Bloom ou ailleurs). Un push parti ne se modifie plus et ne se retire pas ; un push programmé peut être annulé avant son heure.</p>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {open ? <Detail p={open} onClose={() => setOpen(null)} /> : null}
      {stop ? <Confirm title="Annuler ce push programmé ?" text={`« ${stop.caption || "Sans message"} », prévu ${when(stop.scheduledAt)}. Il est annulé chez MYM et ne partira pas.`} button="Annuler le push" go={async () => { await api("POST", "/api/mym/push/delete", { creatorId: mid, id: stop.id }); toast("Push annulé"); load(); }} onClose={() => setStop(null)} /> : null}
      {compose && d && m ? <Composer creatorId={mid} model={m.name} data={d} onClose={() => setCompose(false)} onDone={() => (setCompose(false), load())} /> : null}
    </div>
  );
}

function Thumb({ m, n, size = 46 }: { m?: { thumb: string | null; type: string } | null; n: number; size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-[10px]" style={{ width: size, height: size, background: "var(--color-card-2)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m?.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : <ImageIcon className="size-4 text-muted" />}
      {/video/i.test(m?.type || "") ? <Play className="absolute bottom-1 left-1 size-3.5 rounded-full bg-black/60 p-0.5 text-white" /> : null}
      {n > 1 ? <span className="absolute top-0.5 right-0.5 rounded px-1 text-[9.5px] font-bold text-white" style={{ background: "rgb(0 0 0 / 0.65)" }}>+{n - 1}</span> : null}
    </span>
  );
}

function Detail({ p, onClose }: { p: Push; onClose: () => void }) {
  const line = (k: string, v: React.ReactNode) => <p className="flex justify-between gap-3 border-t py-2 text-[13px] first:border-t-0" style={{ borderColor: "var(--color-line)" }}><span className="text-muted">{k}</span><span className="text-right font-semibold">{v}</span></p>;
  return (
    <Modal title="Détail du push" sub={planned(p) ? `Programmé ${when(p.scheduledAt)}` : `Envoyé ${when(p.sentAt || p.scheduledAt)}`} width={560} onClose={onClose}>
      <div className="flex flex-wrap gap-2">{p.medias.map((x) => <Thumb key={x.id} m={x} n={1} size={64} />)}{p.teaser ? <span className="relative" title="Teaser gratuit"><Thumb m={p.teaser} n={1} size={64} /><span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[9.5px] font-bold text-white">teaser</span></span> : null}</div>
      {p.caption ? <p className="mt-3 rounded-[12px] border p-3 text-[13px] whitespace-pre-wrap" style={{ borderColor: "var(--color-line)" }}>{p.caption}</p> : null}
      <div className="mt-3">
        {line("Pour", p.targets.map((t) => TARGET[t]?.label ?? t).join(", ") || "—")}
        {line("Prix", p.price ? eur(p.price) : "Gratuit")}
        {line("Ventes", p.sales != null ? int(p.sales) : "—")}
        {line("Chiffre d’affaires", p.revenue != null ? eur(p.revenue) : "—")}
        {line("Catalogue MoD", p.mod ? "oui" : "non")}
        {p.email != null ? line("E-mail aux fans", p.email ? "oui" : "non") : null}
      </div>
    </Modal>
  );
}

const STEPS = ["Pour qui", "Médias", "Message et prix", "Envoi", "Vérification"];

/** Nouveau push en cinq étapes : rien ne part chez MYM avant le dernier bouton, puis une confirmation. */
function Composer({ creatorId, model, data, onClose, onDone }: { creatorId: string; model: string; data: Data; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [targets, setTargets] = useState<string[]>(["subscribers"]);
  const [medias, setMedias] = useState<PickedMedia[]>([]);
  const [teaser, setTeaser] = useState<PickedMedia | null>(null);
  const [pick, setPick] = useState<"medias" | "teaser" | null>(null);
  const [caption, setCaption] = useState("");
  const [price, setPrice] = useState(0);
  const [custom, setCustom] = useState("");
  const [promo, setPromo] = useState(false);
  const [promoPrice, setPromoPrice] = useState("");
  const [promoDur, setPromoDur] = useState(data.durations[0] ?? 0);
  const [later, setLater] = useState(false);
  const [date, setDate] = useState(() => localInput(new Date(Date.now() + 3600_000)));
  const [email, setEmail] = useState(true);
  const [mod, setMod] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sure, setSure] = useState(false);
  const prices = data.prices.length ? data.prices : [9.99, 14.99, 19.99, 29.99];
  const count = data.audience.filter((a) => targets.includes(a.id)).reduce((n, a) => n + a.count, 0);
  const pp = Number(promoPrice.replace(",", "."));
  const problems = [
    !targets.length ? "Choisis au moins un public." : "",
    !medias.length ? "Choisis au moins un média." : "",
    !caption.trim() ? "Écris un message : MYM refuse un push sans texte." : promo && price > 0 && !(pp > 0 && pp < price) ? "Le prix en promotion doit être plus bas que le prix normal." : "",
    later && !(Date.parse(date) > Date.now() + 5 * 60_000) ? "La date d’envoi doit être dans plus de 5 minutes." : "",
  ];
  const problem = problems.find(Boolean) || "";
  const send = async () => {
    const r = await api<{ scheduled: boolean }>("POST", "/api/mym/push", {
      creatorId, targets, medias: medias.map((x) => x.id), teaserId: teaser?.id ?? null, caption: caption.trim(), price, mod: mod && price > 0, thirdPartyConsent: consent, email,
      scheduledAt: later ? new Date(date).toISOString() : null, discount: promo && price > 0 ? { price: pp, duration: promoDur } : null, confirm: true,
    });
    toast(r.scheduled ? "Push programmé chez MYM" : "Push envoyé");
    onDone();
  };
  const quick: [string, () => Date][] = [
    ["Dans 1 h", () => new Date(Date.now() + 3600_000)],
    ["Ce soir 21 h", () => { const x = new Date(); x.setHours(21, 0, 0, 0); return x; }],
    ["Demain 12 h", () => { const x = new Date(Date.now() + 864e5); x.setHours(12, 0, 0, 0); return x; }],
    ["Demain 21 h", () => { const x = new Date(Date.now() + 864e5); x.setHours(21, 0, 0, 0); return x; }],
  ];
  const opt = (on: boolean, set: (v: boolean) => void, title: string, sub: string, disabled = false) => (
    <div className="flex items-start gap-3 rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)", opacity: disabled ? 0.5 : 1 }}>
      <span className="min-w-0 flex-1"><b className="block text-[13px]">{title}</b><span className="text-[12px] text-muted">{sub}</span></span>
      <Switch on={on && !disabled} onChange={set} disabled={disabled} />
    </div>
  );
  const recap = (k: string, v: React.ReactNode, n: number) => (
    <button type="button" onClick={() => setStep(n)} className="flex w-full items-start justify-between gap-3 border-t py-2.5 text-left text-[13px] first:border-t-0 hover:bg-white/[0.02]" style={{ borderColor: "var(--color-line)" }} title="Modifier">
      <span className="shrink-0 text-muted">{k}</span><span className="min-w-0 text-right font-semibold">{v}</span>
    </button>
  );

  return (
    <>
      <Modal sticky width={760} title="Nouveau push" sub={`Sur le compte MYM de ${model}`} onClose={onClose}>
        <div className="v2-noscroll -mt-1 mb-4 flex gap-1 overflow-x-auto">
          {STEPS.map((t, i) => (
            <button key={t} type="button" onClick={() => i <= step || !problems.slice(0, i).some(Boolean) ? setStep(i) : null} className="v2-chip" data-on={step === i}>
              <span className="grid size-4 place-items-center rounded-full text-[10px] font-bold" style={{ background: i < step ? "var(--v2-up)" : "rgb(255 255 255 / 0.1)", color: i < step ? "#04130d" : undefined }}>{i < step ? <Check className="size-3" /> : i + 1}</span>{t}
            </button>
          ))}
        </div>

        {step === 0 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(TARGET).map(([id, t]) => {
              const on = targets.includes(id);
              const a = data.audience.find((x) => x.id === id);
              return (
                <button key={id} type="button" onClick={() => setTargets(on ? targets.filter((x) => x !== id) : [...targets, id])} className="rounded-[12px] border p-3 text-left transition" style={on ? { borderColor: "var(--v2-blue)", background: "rgb(59 130 246 / 0.1)" } : { borderColor: "var(--color-line)" }}>
                  <span className="flex items-center gap-2"><t.Icon className="size-4" style={{ color: on ? "var(--v2-sky)" : undefined }} /><b className="flex-1 text-[13.5px]">{t.label}</b>{on ? <Check className="size-4" style={{ color: "var(--v2-sky)" }} /> : null}</span>
                  <span className="mt-1 block text-[12px] text-muted">{t.sub}</span>
                  <span className="mt-2 flex items-center justify-between text-[11.5px]"><span className="v2-num font-bold">{a ? `${int(a.count)} fans` : "—"}</span><span className="text-muted">{t.limit}</span></span>
                </button>
              );
            })}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <div className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)" }}>
              <p className="flex items-center justify-between text-[13px] font-bold"><span>Médias du push</span><span className="text-[12px] font-normal text-muted">{medias.length} / 20</span></p>
              <div className="mt-2 flex flex-wrap gap-2">
                {medias.map((x) => <span key={x.id} className="relative"><Thumb m={x} n={1} size={64} /><button type="button" onClick={() => setMedias(medias.filter((y) => y.id !== x.id))} aria-label="Retirer" className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-black/80 text-white"><X className="size-3" /></button></span>)}
                <button type="button" onClick={() => setPick("medias")} className="grid size-16 place-items-center rounded-[10px] border border-dashed text-muted transition hover:text-(--color-fg)" style={{ borderColor: "rgb(255 255 255 / 0.2)" }} aria-label="Choisir des médias"><ImagePlus className="size-5" /></button>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)" }}>
              <span className="relative">{teaser ? <Thumb m={teaser} n={1} size={56} /> : <span className="grid size-14 place-items-center rounded-[10px] border border-dashed" style={{ borderColor: "rgb(255 255 255 / 0.2)" }}><Eye className="size-4 text-muted" /></span>}</span>
              <span className="min-w-0 flex-1"><b className="block text-[13px]">Teaser (facultatif)</b><span className="text-[12px] text-muted">Un aperçu gratuit que tous les destinataires voient avant d’acheter. MYM le vérifie avant l’envoi.</span></span>
              {teaser ? <button type="button" onClick={() => setTeaser(null)} className="v2-btn" data-kind="ghost" style={{ height: 32 }}>Retirer</button> : null}
              <button type="button" onClick={() => setPick("teaser")} className="v2-btn" data-kind="ghost" style={{ height: 32 }}>{teaser ? "Changer" : "Choisir"}</button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <div>
              <p className="v2-label flex justify-between"><span>Message</span><span className="font-normal">{caption.length} / 1500</span></p>
              <textarea value={caption} maxLength={1500} onChange={(e) => setCaption(e.target.value)} rows={5} placeholder="Le message que les fans recevront" className="v2-field" style={{ height: "auto", paddingTop: 8, paddingBottom: 8 }} />
            </div>
            <div>
              <p className="v2-label">Prix</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => (setPrice(0), setCustom(""))} className="v2-chip" data-on={price === 0}>Gratuit</button>
                {prices.map((x) => <button key={x} type="button" onClick={() => (setPrice(x), setCustom(""))} className="v2-chip" data-on={price === x && !custom}>{eur(x)}</button>)}
                <input value={custom} onChange={(e) => { const v = e.target.value.replace(/[^\d.,]/g, ""); setCustom(v); setPrice(Number(v.replace(",", ".")) || 0); }} inputMode="decimal" placeholder="Autre (€)" className="v2-field" style={{ height: 28, width: 110 }} aria-label="Autre prix" />
              </div>
            </div>
            {opt(promo, setPromo, "Promotion", price ? "Un prix plus bas pendant un temps, puis le prix normal." : "Seulement pour un push payant.", !price)}
            {promo && price > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pl-1 text-[12.5px]">
                Prix promo <input value={promoPrice} onChange={(e) => setPromoPrice(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="€" className="v2-field" style={{ height: 30, width: 80 }} aria-label="Prix promotion" /> pendant
                {data.durations.map((s) => <button key={s} type="button" onClick={() => setPromoDur(s)} className="v2-chip" data-on={promoDur === s}>{durLabel(s)}</button>)}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {([[false, "Envoyer tout de suite", "Le push part dès la confirmation.", Play], [true, "Programmer", "MYM l’enverra à l’heure choisie.", CalendarClock]] as const).map(([v, t, s, I]) => (
                <button key={t} type="button" onClick={() => setLater(v)} className="rounded-[12px] border p-3 text-left" style={later === v ? { borderColor: "var(--v2-blue)", background: "rgb(59 130 246 / 0.1)" } : { borderColor: "var(--color-line)" }}>
                  <span className="flex items-center gap-2"><I className="size-4" /><b className="text-[13.5px]">{t}</b></span><span className="mt-1 block text-[12px] text-muted">{s}</span>
                </button>
              ))}
            </div>
            {later ? (
              <div className="flex flex-wrap items-center gap-2">
                <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="v2-field" style={{ width: 220, colorScheme: "dark" }} aria-label="Date d’envoi" />
                {quick.map(([l, f]) => <button key={l} type="button" onClick={() => setDate(localInput(f()))} className="v2-chip" data-on={date === localInput(f())}>{l}</button>)}
              </div>
            ) : null}
            {opt(email, setEmail, "Prévenir aussi par e-mail", "MYM envoie un e-mail aux fans visés (un seul par jour aux mêmes fans).")}
            {opt(mod, setMod, "Mettre au catalogue MoD", price ? "Le push reste en vente dans le catalogue « Media On Demand »." : "Seulement pour un push payant.", !price)}
            {opt(consent, setConsent, "Consentement des personnes présentes", "Si une autre personne apparaît : j’ai son accord écrit et la preuve de sa majorité.")}
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <div className="rounded-[12px] border px-3" style={{ borderColor: "var(--color-line)" }}>
              {recap("Pour", `${targets.map((t) => TARGET[t].label).join(", ") || "—"} · ≈ ${int(count)} fans`, 0)}
              {recap("Médias", <span className="flex justify-end gap-1">{medias.slice(0, 6).map((x) => <Thumb key={x.id} m={x} n={1} size={30} />)}{medias.length > 6 ? `+${medias.length - 6}` : ""}{teaser ? " · avec teaser" : ""}</span>, 1)}
              {recap("Message", <span className="line-clamp-2">{caption || "—"}</span>, 2)}
              {recap("Prix", `${price ? eur(price) : "Gratuit"}${promo && price > 0 && pp > 0 ? ` · promo ${eur(pp)} pendant ${durLabel(promoDur)}` : ""}`, 2)}
              {recap("Envoi", later ? `Programmé ${when(Date.parse(date))}` : "Tout de suite", 3)}
              {recap("Options", `${email ? "Avec" : "Sans"} e-mail · ${mod && price > 0 ? "au catalogue MoD" : "hors catalogue"}`, 3)}
            </div>
            {problem ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{problem}</p> : <p className="mt-3 text-[12.5px] text-muted">Un push envoyé ne se modifie plus et ne se retire pas.</p>}
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-2">
          <span className="mr-auto text-[12px] text-muted">≈ {int(count)} fans · {plural(medias.length, "média")} · {price ? eur(price) : "gratuit"}</span>
          {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className="v2-btn" data-kind="ghost">Retour</button> : <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>}
          {step < 4 ? (
            <button type="button" onClick={() => setStep(step + 1)} disabled={!!problems[step]} title={problems[step] || undefined} className="v2-btn">Continuer</button>
          ) : (
            <button type="button" onClick={() => setSure(true)} disabled={!!problem} className="v2-btn">{later ? "Programmer le push" : "Envoyer le push"}</button>
          )}
        </div>
        {step < 4 && problems[step] ? <p className="mt-2 text-right text-[11.5px] text-muted">{problems[step]}</p> : null}
      </Modal>
      {pick ? (
        <MediaPicker
          pf="mym"
          creatorId={creatorId}
          max={pick === "medias" ? 20 : 1}
          selected={pick === "medias" ? medias : teaser ? [teaser] : []}
          onPick={(l) => {
            if (pick === "medias") setMedias(l);
            else setTeaser(l[0] ?? null);
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      ) : null}
      {sure ? <Confirm title={later ? "Programmer ce push ?" : "Envoyer ce push maintenant ?"} text={`À environ ${int(count)} fans de ${model} (${targets.map((t) => TARGET[t].label).join(", ")}), ${price ? `à ${eur(price)}` : "gratuit"}${later ? `, le ${when(Date.parse(date))}` : ", tout de suite"}. Un push envoyé ne se modifie plus et ne se retire pas.`} button={later ? "Programmer" : "Envoyer"} go={send} onClose={() => setSure(false)} /> : null}
    </>
  );
}
