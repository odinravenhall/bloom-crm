"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Eye, Image as ImageIcon, Infinity as Inf, Play, Plus, RefreshCw, Timer, Trash2, UserCheck, UserMinus, UserPlus, Zap } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import type { Media } from "@/lib/types";
import { Avatar } from "@/components/ui";
import { CloudPicker } from "./MymScripts";
import { Choice, Foot, LIME, Next, Phone, Pill, Recap, StepHead, StudioShell, Toggle, eur, int, localInput, sCard, sField, when } from "./MymStudioKit";

// MYM → Envois groupés → Push (MYM officiel) et MoDs (MYM officiel) : copie de MyPulse. Le push est la fonction de MYM
// (message + médias à toute une cible, gratuit ou payant) : une fois parti, il ne se retire pas. Bloom lit les pushs du
// compte relié et en crée avec le même formulaire que le site de MYM (admins et managers).
type Push = { id: string; targets: string[]; caption: string; price: number; mod: boolean; status: string | null; scheduledAt: string | null; sentAt: string | null; medias: Media[]; teaser: Media | null; sales: number | null; revenue: number | null; email: boolean | null };
type Data = { canSend: boolean; pushes: Push[]; audience: { id: string; count: number }[]; prices: number[]; durations: number[]; restrictions: Record<string, unknown> | null };
const TARGET: Record<string, { label: string; sub: string; icon: React.ReactNode; limit: string }> = {
  subscribers: { label: "Abonnés", sub: "Tes abonnés actifs, ceux qui paient leur abonnement.", icon: <UserCheck className="size-4" />, limit: "Illimité" },
  ex_subscribers: { label: "Anciens abonnés", sub: "Les fans dont l’abonnement a pris fin.", icon: <UserMinus className="size-4" />, limit: "1 push / 7 jours" },
  interested: { label: "Intéressés", sub: "Les fans qui ont montré de l’intérêt sans s’abonner.", icon: <UserPlus className="size-4" />, limit: "1 push / 7 jours" },
};
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const durLabel = (s: number) => (s % 86400 === 0 ? `${s / 86400} j` : `${Math.round(s / 3600)} h`);

export function MymPush({ mods = false }: { mods?: boolean }) {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [studio, setStudio] = useState<"guided" | "all" | null>(null);
  const [detail, setDetail] = useState<Push | null>(null);
  const [at, setAt] = useState(0);
  const load = useCallback(() => {
    if (!creatorId) return;
    setD(null);
    api<Data>("GET", `/api/mym/push?creatorId=${encodeURIComponent(creatorId)}`).then((r) => (setD(r), setErr(""), setAt(Date.now()))).catch((e) => (setD({ canSend: false, pushes: [], audience: [], prices: [], durations: [], restrictions: null }), setErr((e as Error).message)));
  }, [creatorId]);
  useEffect(load, [load]);
  const rows = (d?.pushes ?? []).filter((p) => !mods || p.mod);
  const cancel = async (p: Push) => {
    if (!creatorId || !confirm("Annuler ce push programmé chez MYM ?")) return;
    try {
      await api("POST", "/api/mym/push/delete", { creatorId, id: p.id });
      toast("Push annulé");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      {!mods ? (
        <div className="relative overflow-hidden rounded-2xl p-6" style={{ background: "radial-gradient(70% 140% at 85% 0%, rgba(199,255,74,.13), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.25)" }}>
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Pushs MYM</p>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>Tes pushs</h1>
              <p className="mt-1 max-w-[560px] text-[13px]">Un message avec tes médias, envoyé d’un coup à tes abonnés, anciens abonnés ou intéressés — gratuit ou payant, maintenant ou programmé.</p>
              <p className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold" style={{ color: "var(--mp-head)" }}>
                <span className="flex h-7 items-center gap-1.5 rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}><Inf className="size-3.5" style={{ color: "var(--mp-accent)" }} /> Abonnés : illimité</span>
                <span className="flex h-7 items-center gap-1.5 rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}><Timer className="size-3.5" style={{ color: "var(--mp-accent)" }} /> Anciens abonnés et intéressés : 1 push / 7 jours</span>
              </p>
            </div>
            <CreatorPick creators={creators} creatorId={creatorId} creator={creator} setCreator={setCreator} />
            {d?.canSend ? (
              <>
                <button onClick={() => setStudio("guided")} className="flex h-10 items-center gap-2 rounded-xl px-4 text-[13.5px] font-bold" style={LIME}><Plus className="size-4" /> Nouveau push</button>
                <button onClick={() => setStudio("all")} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "#3d4a2c", color: "var(--mp-head)" }}><Zap className="size-4" /> Push express</button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={`${mods ? "" : "mt-5 "}rounded-md`} style={card}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <h2 className="flex-1 text-[16px] font-medium" style={{ color: "var(--mp-head)" }}>{mods ? "Vos MoDs" : "Vos Pushs"}</h2>
          {mods ? <CreatorPick creators={creators} creatorId={creatorId} creator={creator} setCreator={setCreator} /> : null}
          <span className="text-[11.5px]" style={{ color: "var(--mp-muted)" }}>MAJ : {at ? when(at) : "…"}</span>
          <button onClick={load} title="Actualiser" className="grid size-8 place-items-center rounded text-white" style={{ background: "#f7b84b" }}><RefreshCw className="size-3.5" /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="text-left" style={{ color: "var(--mp-head)", background: "var(--mp-card-2)" }}>{["Médias", "Cible", "Prix", "Message", "Envoyé le", "Mod", "Action"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((p) => {
                const planned = p.status !== "pushed" && !!p.scheduledAt && Date.parse(p.scheduledAt) > Date.now();
                return (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--mp-line)" }}>
                    <td className="px-4 py-2.5"><Thumb m={p.medias[0]} n={p.medias.length} /></td>
                    <td className="px-4">{p.targets.length ? p.targets.map((t) => <span key={t} className="mr-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: "#0ab39c" }}>{TARGET[t]?.label ?? t}</span>) : "—"}</td>
                    <td className="px-4 font-semibold" style={{ color: p.price ? "var(--mp-head)" : "#0ab39c" }}>{p.price ? eur(p.price) : "Gratuit"}</td>
                    <td className="max-w-[280px] truncate px-4" style={{ color: "var(--mp-head)" }} title={p.caption}>{p.caption || "—"}</td>
                    <td className="px-4 whitespace-nowrap">{planned ? <span style={{ color: "#f7b84b" }}>Programmé · {when(p.scheduledAt)}</span> : when(p.sentAt || p.scheduledAt)}</td>
                    <td className="px-4">{p.mod ? <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: "#f06548" }}>Média On Demand</span> : "—"}</td>
                    <td className="px-4 whitespace-nowrap">
                      <button onClick={() => setDetail(p)} className="h-7 rounded border px-2.5 text-[11.5px]" style={{ borderColor: "#405189", color: "#7b8fd4" }}>Détail</button>
                      {planned && d?.canSend ? <button onClick={() => cancel(p)} title="Annuler ce push programmé" className="ml-1.5 inline-grid size-7 place-items-center rounded border align-middle" style={{ borderColor: "#f06548", color: "#f06548" }}><Trash2 className="size-3.5" /></button> : null}
                    </td>
                  </tr>
                );
              })}
              {d && !rows.length ? <tr><td colSpan={7} className="px-4 py-8" style={{ color: err ? "var(--mp-down)" : "#299cdb" }}>{err || (mods ? "Aucun MoD trouvé." : "Aucun push trouvé.")}</td></tr> : null}
              {!d ? <tr><td colSpan={7} className="py-8 text-center">Lecture chez MYM…</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{mods ? "Un MoD est un push payant ajouté au catalogue « Media On Demand » de MYM : il se crée depuis Push, avec l’option « Ajouter au catalogue de MOD »." : "Les 20 derniers pushs du compte, lus chez MYM. Un push envoyé ne se modifie plus et ne se retire pas."}</p>
      {studio && creatorId && d ? <PushStudio mode={studio} setMode={setStudio} creatorId={creatorId} name={creator?.name || "Modèle"} data={d} onClose={() => setStudio(null)} onDone={() => (setStudio(null), load())} /> : null}
      {detail ? <Detail p={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function CreatorPick({ creators, creatorId, creator, setCreator }: { creators: { id: string; name: string }[]; creatorId: string | null; creator: { avatar?: string | null; name?: string } | null | undefined; setCreator: (id: string) => void }) {
  return (
    <span className="flex h-9 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}>
      <Avatar src={creator?.avatar} name={creator?.name} size="size-5" />
      <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">{creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}</select>
    </span>
  );
}
function Thumb({ m, n }: { m?: Media; n: number }) {
  return (
    <span className="relative block size-[62px] overflow-hidden rounded" style={{ background: "var(--mp-card-2)" }}>
      {m?.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : <ImageIcon className="m-auto mt-5 size-5 opacity-50" />}
      {m ? <span className="absolute top-0.5 right-0.5 rounded px-1 text-[9.5px] font-bold text-white" style={{ background: "#299cdb" }}>{m.type === "video" ? "Vidéo" : "Photo"}{n > 1 ? ` +${n - 1}` : ""}</span> : null}
    </span>
  );
}
function Detail({ p, onClose }: { p: Push; onClose: () => void }) {
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[520px] rounded-lg p-5" style={{ background: "#262a2f", color: "var(--mp-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>Détail du push</h3>
        <div className="mt-3 flex flex-wrap gap-2">{p.medias.map((m) => <Thumb key={m.id} m={m} n={1} />)}{p.teaser ? <span title="Teaser gratuit" className="opacity-70"><Thumb m={p.teaser} n={1} /></span> : null}</div>
        <p className="mt-3 text-[13px] whitespace-pre-wrap" style={{ color: "var(--mp-head)" }}>{p.caption}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[12.5px]">
          <span>Cible : <b style={{ color: "var(--mp-head)" }}>{p.targets.map((t) => TARGET[t]?.label ?? t).join(", ") || "—"}</b></span>
          <span>Prix : <b style={{ color: "var(--mp-head)" }}>{p.price ? eur(p.price) : "Gratuit"}</b></span>
          <span>État : <b style={{ color: "var(--mp-head)" }}>{p.status === "pushed" ? "Envoyé" : p.status ?? "—"}</b></span>
          <span>Date : <b style={{ color: "var(--mp-head)" }}>{when(p.sentAt || p.scheduledAt)}</b></span>
          {p.sales != null ? <span>Ventes : <b style={{ color: "var(--mp-head)" }}>{int(p.sales)}</b></span> : null}
          {p.revenue != null ? <span>CA : <b style={{ color: "var(--mp-head)" }}>{eur(p.revenue)}</b></span> : null}
          <span>Catalogue MoD : <b style={{ color: "var(--mp-head)" }}>{p.mod ? "oui" : "non"}</b></span>
        </div>
        <div className="mt-5 text-right"><button onClick={onClose} className="h-9 rounded px-4 text-[13px]" style={{ background: "var(--mp-card-2)" }}>Fermer</button></div>
      </div>
    </div>
  );
}

const STEPS = ["Qui reçoit ce push ?", "Les médias", "Le message et le prix", "Envoi et options", "Tout est prêt ?"];

function PushStudio({ mode, setMode, creatorId, name, data, onClose, onDone }: { mode: "guided" | "all"; setMode: (m: "guided" | "all") => void; creatorId: string; name: string; data: Data; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [targets, setTargets] = useState<string[]>(["subscribers"]);
  const [medias, setMedias] = useState<Media[]>([]);
  const [teaser, setTeaser] = useState<Media[]>([]);
  const [pickTeaser, setPickTeaser] = useState(false);
  const [caption, setCaption] = useState("");
  const [price, setPrice] = useState(0);
  const [custom, setCustom] = useState(false);
  const [promo, setPromo] = useState(false);
  const [promoPrice, setPromoPrice] = useState("");
  const [promoDur, setPromoDur] = useState(data.durations[0] ?? 0);
  const [later, setLater] = useState(false);
  const [date, setDate] = useState(() => localInput(new Date(Date.now() + 3600_000)));
  const [email, setEmail] = useState(true);
  const [mod, setMod] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = useMemo(() => data.audience.filter((a) => targets.includes(a.id)).reduce((n, a) => n + a.count, 0), [data.audience, targets]);
  const prices = data.prices.length ? data.prices : [19.99, 24.99, 29.99, 49.99];
  const go = (n: number) => (setStep(n), setReached((r) => Math.max(r, n)));
  const problem = !targets.length ? "Choisis au moins une cible." : !medias.length ? "Choisis au moins un média." : !caption.trim() ? "Écris un message : MYM refuse un push sans texte." : later && !(Date.parse(date) > Date.now() + 5 * 60_000) ? "La date doit être dans plus de 5 minutes." : promo && price > 0 && !(Number(promoPrice.replace(",", ".")) > 0 && Number(promoPrice.replace(",", ".")) < price) ? "Prix de promotion : plus bas que le prix du push." : "";
  const stepOk = [targets.length > 0, medias.length > 0, !!caption.trim(), !later || Date.parse(date) > Date.now() + 5 * 60_000, !problem][step];
  const sendLabel = later ? "Programmer le push" : "Envoyer le push";
  const submit = async () => {
    if (problem) return toast(problem, "err");
    if (!confirm(`${later ? "Programmer" : "Envoyer maintenant"} ce push à environ ${int(count)} fans ?\n\nUn push envoyé ne se modifie plus et ne se retire pas.`)) return;
    setBusy(true);
    try {
      const r = await api<{ scheduled: boolean }>("POST", "/api/mym/push", {
        creatorId, targets, medias: medias.map((m) => m.id), teaserId: teaser[0]?.id ?? null, caption: caption.trim(), price, mod: mod && price > 0, thirdPartyConsent: consent, email,
        scheduledAt: later ? new Date(date).toISOString() : null, discount: promo && price > 0 ? { price: Number(promoPrice.replace(",", ".")), duration: promoDur } : null, confirm: true,
      });
      toast(r.scheduled ? "Push programmé chez MYM" : "Push envoyé");
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const sTargets = (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(TARGET).map(([id, t]) => {
          const a = data.audience.find((x) => x.id === id);
          const on = targets.includes(id);
          return <Choice key={id} on={on} onClick={() => setTargets(on ? targets.filter((x) => x !== id) : [...targets, id])} icon={t.icon} title={t.label} sub={t.sub} foot={<><span className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-bold" style={{ borderColor: "#4a5a2c", color: id === "subscribers" ? "var(--mp-accent)" : "#f7b84b" }}>{id === "subscribers" ? <Inf className="size-3" /> : <Timer className="size-3" />} {t.limit}</span><b className="mt-2 block text-[17px]" style={{ color: "var(--mp-head)" }}>≈ {a ? int(a.count) : "?"} <span className="text-[12px] font-semibold" style={{ color: "var(--mp-accent)" }}>fans</span></b></>} />;
        })}
      </div>
      <p className="mt-4 rounded-xl border border-dashed px-4 py-3 text-[12.5px]" style={{ borderColor: "#333d2b" }}><Zap className="mr-2 inline size-3.5" style={{ color: "var(--mp-accent)" }} />Besoin d’écrire plus souvent à tes anciens abonnés ? Le Mass DM de Bloom n’a pas cette limite. <a href="/app/mym/massdm" className="font-bold underline" style={{ color: "var(--mp-accent)" }}>Ouvrir le Mass DM</a></p>
      <p className="mt-2 rounded-xl border border-dashed px-4 py-3 text-[12.5px]" style={{ borderColor: "#333d2b" }}>Nombres donnés par MYM. Les fans qui ne se sont pas connectés depuis plus d’un an ne sont pas inclus dans les envois aux anciens abonnés et aux intéressés.</p>
    </>
  );
  const sMedias = (
    <>
      <div className="rounded-2xl p-4" style={sCard}>
        <p className="flex items-center justify-between text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}><span className="flex items-center gap-2"><ImageIcon className="size-4" style={{ color: "var(--mp-accent)" }} /> Médias du push</span><span className="text-[12px] font-normal">{medias.length} / 20</span></p>
        {medias.length ? <Strip list={medias} onRemove={(id) => setMedias(medias.filter((m) => m.id !== id))} /> : null}
        <CloudPicker creatorId={creatorId} selected={medias} onChange={setMedias} max={20} />
        <p className="mt-2 text-[11.5px]">Clique sur une vignette pour la choisir.</p>
      </div>
      <div className="mt-4 rounded-2xl p-4" style={sCard}>
        <p className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}><Eye className="size-4" style={{ color: "var(--mp-accent)" }} /> Teaser (facultatif)</p>
        <div className="mt-3 flex items-center gap-4">
          <span className="grid size-[74px] shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed" style={{ borderColor: "#3a4431" }}>{teaser[0]?.thumb ? <img src={teaser[0].thumb} alt="" className="size-full object-cover" /> : <ImageIcon className="size-5 opacity-50" />}</span>
          <span className="min-w-0 flex-1 text-[12.5px]">Un aperçu gratuit que tous les destinataires voient avant d’acheter. Il ne compte pas parmi les médias du push. MYM le modère avant l’envoi.</span>
          {teaser.length ? <button onClick={() => setTeaser([])} className="h-9 rounded-lg border px-3 text-[12.5px]" style={{ borderColor: "#f06548", color: "#f06548" }}>Retirer</button> : null}
          <button onClick={() => setPickTeaser(!pickTeaser)} className="h-9 rounded-lg border px-3 text-[12.5px] font-bold" style={{ borderColor: "#6f8f2a", color: "var(--mp-accent)" }}>{pickTeaser ? "Fermer" : "Choisir un teaser"}</button>
        </div>
        {pickTeaser ? <CloudPicker creatorId={creatorId} selected={teaser} onChange={(m) => (setTeaser(m.slice(-1)), m.length && setPickTeaser(false))} max={2} /> : null}
      </div>
      <p className="mt-4 flex items-center justify-between rounded-xl border border-dashed px-4 py-3 text-[12.5px]" style={{ borderColor: "#333d2b" }}>Un média manque ? Importe-le dans ton Cloud MYM, il apparaîtra ici.<a href="/app/mym/importer" target="_blank" className="font-bold" style={{ color: "var(--mp-accent)" }}>Ouvrir le Cloud ↗</a></p>
    </>
  );
  const sMessage = (
    <>
      <div className="rounded-2xl p-4" style={sCard}>
        <p className="flex justify-between text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>Message<span className="text-[12px] font-normal">{caption.length} / 1500</span></p>
        <textarea value={caption} maxLength={1500} onChange={(e) => setCaption(e.target.value)} placeholder="Écris le message que tes fans recevront…" className="mt-3 h-[150px] w-full resize-y rounded-xl p-3 text-[13.5px] outline-none" style={sField} />
        <p className="mt-1 text-[11.5px]">Obligatoire : MYM refuse un push sans message.</p>
      </div>
      <div className="mt-4 rounded-2xl p-4" style={sCard}>
        <p className="text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>Prix</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill on={price === 0 && !custom} onClick={() => (setPrice(0), setCustom(false))}>Gratuit</Pill>
          {prices.map((p) => <Pill key={p} on={price === p && !custom} onClick={() => (setPrice(p), setCustom(false))}>{eur(p)}</Pill>)}
          <Pill on={custom} onClick={() => setCustom(true)}>Autre montant</Pill>
          {custom ? <input autoFocus inputMode="decimal" placeholder="€" onChange={(e) => setPrice(Number(e.target.value.replace(",", ".")) || 0)} className="h-8 w-[90px] rounded-full px-3 text-[13px] outline-none" style={sField} /> : null}
        </div>
        <p className="mt-2 text-[11.5px]">{price ? `Payant : tes fans débloquent les médias pour ${eur(price)}.` : "Gratuit : tes fans voient les médias tout de suite."}</p>
      </div>
      <div className="mt-4">
        <Toggle on={promo && price > 0} set={setPromo} disabled={!price} title="Promotion" sub={price ? "Un prix réduit pendant une durée limitée, puis le prix normal." : "La promotion s’active sur un push payant."}>
          <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
            Prix réduit <input value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} inputMode="decimal" placeholder="€" className="h-9 w-[90px] rounded-lg px-3 outline-none" style={sField} />
            pendant {data.durations.map((s) => <Pill key={s} on={promoDur === s} onClick={() => setPromoDur(s)}>{durLabel(s)}</Pill>)}
          </div>
        </Toggle>
      </div>
    </>
  );
  const quick: [string, () => Date][] = [["Dans 1 h", () => new Date(Date.now() + 3600_000)], ["Ce soir, 21 h", () => { const x = new Date(); x.setHours(21, 0, 0, 0); return x; }], ["Demain, 12 h", () => { const x = new Date(Date.now() + 864e5); x.setHours(12, 0, 0, 0); return x; }], ["Demain, 21 h", () => { const x = new Date(Date.now() + 864e5); x.setHours(21, 0, 0, 0); return x; }]];
  const sSend = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice on={!later} onClick={() => setLater(false)} icon={<Play className="size-4" />} title="Envoyer maintenant" sub="Le push part dès que tu valides." />
        <Choice on={later} onClick={() => setLater(true)} icon={<CalendarClock className="size-4" />} title="Programmer" sub="MYM l’enverra à la date choisie." />
      </div>
      {later ? (
        <div className="mt-3 rounded-2xl p-4" style={sCard}>
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Date et heure d’envoi</p>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 h-10 rounded-lg px-3 text-[13.5px] outline-none" style={{ ...sField, colorScheme: "dark" }} />
          <div className="mt-3 flex flex-wrap gap-2">{quick.map(([l, f]) => <Pill key={l} on={date === localInput(f())} onClick={() => setDate(localInput(f()))}>{l}</Pill>)}</div>
          <p className="mt-2 text-[11.5px]">Heure de ton appareil.</p>
        </div>
      ) : null}
      <p className="mt-5 mb-2 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>Options</p>
      <Toggle on={email} set={setEmail} title="Prévenir aussi par e-mail" sub="MYM envoie un e-mail aux fans visés. Il n’en envoie qu’un par jour aux mêmes fans : si un autre push du même jour l’a déjà eu, celui-ci part quand même, sans e-mail." />
      <Toggle on={mod && price > 0} set={setMod} disabled={!price} title="Ajouter au catalogue de MOD" sub={price ? "Le push reste achetable dans ton catalogue « Media On Demand »." : "Réservé à un push payant."} />
      <Toggle on={consent} set={setConsent} title="Consentement des personnes présentes" sub="Si une autre personne apparaît, je confirme avoir son consentement écrit et sa preuve de majorité." />
    </>
  );
  const sRecap = (
    <>
      <div className="mb-3 flex items-center gap-4 rounded-2xl p-4" style={{ background: "rgba(199,255,74,.06)", border: "1px solid #6f8f2a" }}>
        <span className="grid size-11 place-items-center rounded-xl" style={LIME}><Play className="size-5 fill-current" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--mp-accent)" }}>Push MYM</span><b className="block truncate text-[17px]" style={{ color: "var(--mp-head)" }}>{caption || "—"}</b><span className="text-[12.5px]">{targets.map((t) => TARGET[t].label).join(", ")} · {price ? eur(price) : "Gratuit"} · {later ? `Le ${when(Date.parse(date))}` : "Dès la validation"}</span></span>
        {medias[0]?.thumb ? <img src={medias[0].thumb} alt="" className="size-12 rounded-lg object-cover" /> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Recap label="Destinataires" value={targets.map((t) => TARGET[t].label).join(", ") || "—"} sub={`≈ ${int(count)} fans`} onEdit={() => go(0)} />
        <Recap label="Médias" value={`${medias.length} média${medias.length > 1 ? "s" : ""}`} sub={teaser.length ? "Avec teaser" : "Sans teaser"} onEdit={() => go(1)} />
        <Recap label="Message" value={caption || "—"} sub={`${caption.length} / 1500`} onEdit={() => go(2)} />
        <Recap label="Prix" value={price ? eur(price) : "Gratuit"} sub={promo && price > 0 ? `Promotion ${promoPrice} € pendant ${durLabel(promoDur)}` : undefined} onEdit={() => go(2)} />
        <Recap label="Envoi" value={later ? `Le ${when(Date.parse(date))}` : "Dès la validation"} onEdit={() => go(3)} />
        <Recap label="Options" value={`${email ? "Avec" : "Sans"} e-mail aux fans · ${mod && price > 0 ? "Au" : "Hors"} catalogue de MOD`} sub={consent ? "Consentement des personnes présentes confirmé" : undefined} onEdit={() => go(3)} />
      </div>
      {problem ? <p className="mt-4 text-[13px]" style={{ color: "#f06548" }}>{problem}</p> : null}
    </>
  );
  const info = <><span className="mr-2 inline-block size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /><b className="text-[17px]" style={{ color: "var(--mp-head)" }}>≈ {int(count)}</b> fans visés · {medias.length} média{medias.length > 1 ? "s" : ""} · {price ? eur(price) : "Gratuit"}{later ? ` · ${when(Date.parse(date))}` : ""}</>;
  const modes = (
    <span className="flex rounded-xl border p-1 text-[12.5px] font-bold" style={{ borderColor: "#232b1c" }}>
      <button onClick={() => setMode("guided")} className="rounded-lg px-3 py-1" style={mode === "guided" ? LIME : undefined}>Guidé</button>
      <button onClick={() => setMode("all")} className="rounded-lg px-3 py-1" style={mode === "all" ? LIME : undefined}>Tout en un</button>
    </span>
  );
  const phone = <Phone name={name} kind="Push" medias={medias} text={caption} time={later ? when(Date.parse(date)) : new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} note="Aperçu indicatif : MYM met le push en page à sa façon." />;
  if (mode === "all")
    return (
      <StudioShell name="Studio push" onClose={onClose} modes={modes} aside={phone} footer={<Foot info={info} next={<><Play className="size-4 fill-current" /> {sendLabel}</>} onNext={submit} disabled={busy} />}>
        <StepHead title="Ton push sur une seule page" sub="Destinataires, médias, message, prix et envoi : tout se règle ici, avec l’aperçu côté fan." />
        <Block title="Qui reçoit ce push ?">{sTargets}</Block>
        <div className="mt-4">{sMedias}</div>
        <div className="mt-4">{sMessage}</div>
        <Block title="Envoi et options">{sSend}</Block>
        {problem ? <p className="mt-4 text-[13px]" style={{ color: "#f06548" }}>{problem}</p> : null}
      </StudioShell>
    );
  const subs = [targets.map((t) => TARGET[t].label).join(", "), medias.length ? `${medias.length} média${medias.length > 1 ? "s" : ""}` : "", price ? eur(price) : "Gratuit", later ? `Le ${when(Date.parse(date))}` : "Dès la validation", ""];
  const heads: [string, string][] = [["Qui reçoit ce push ?", "Choisis une ou plusieurs cibles : MYM envoie le push à tous les fans de chacune."], ["Les médias", "Jusqu’à 20 photos ou vidéos de ton Cloud MYM, et un teaser gratuit si tu veux donner envie."], ["Le message et le prix", "Le texte que tes fans liront, et ce que coûtent tes médias."], ["Envoi et options", "Maintenant ou plus tard, et ce que MYM fait du push ensuite."], ["Tout est prêt ?", "Vérifie une dernière fois : un push envoyé ne se modifie plus."]];
  return (
    <StudioShell name="Studio push" steps={STEPS.map((t, i) => ({ title: t, sub: i <= reached ? subs[i] : undefined }))} step={step} setStep={go} done={reached} onClose={onClose} modes={modes} aside={step > 0 && step < 4 ? phone : undefined}
      footer={<Foot back={step > 0} onBack={() => setStep(step - 1)} info={step === 1 && !medias.length ? "Choisis au moins un média." : step === 2 && !caption.trim() ? "Écris un message : MYM refuse un push sans texte." : info} next={step === 4 ? <><Play className="size-4 fill-current" /> {sendLabel}</> : <Next />} onNext={() => (step === 4 ? submit() : go(step + 1))} disabled={busy || !stepOk} />}>
      <StepHead n={step + 1} of={5} title={heads[step][0]} sub={heads[step][1]} />
      {[sTargets, sMedias, sMessage, sSend, sRecap][step]}
    </StudioShell>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-4 rounded-2xl p-4" style={sCard}><p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>{title}</p>{children}</div>;
}
export function Strip({ list, onRemove }: { list: Media[]; onRemove: (id: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 rounded-xl p-2" style={{ background: "rgba(199,255,74,.06)", border: "1px solid #6f8f2a" }}>
      {list.map((m) => (
        <span key={m.id} className="relative block size-11">
          {m.thumb ? <img src={m.thumb} alt="" className="size-full rounded-lg object-cover" /> : <span className="grid size-full place-items-center rounded-lg text-[9px]" style={{ background: "rgba(255,255,255,.08)" }}>{m.type}</span>}
          <button onClick={() => onRemove(m.id)} className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: "#f06548" }}>×</button>
        </span>
      ))}
    </div>
  );
}
