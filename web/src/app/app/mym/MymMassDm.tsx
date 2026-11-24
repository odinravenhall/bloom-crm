"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CalendarClock, History, Image as ImageIcon, MessageSquareQuote, Pencil, Play, Plus, Radio, Sparkles, Tag, Trash2, Undo2, UserCheck, UserMinus, UserPlus, Zap } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import type { Media } from "@/lib/types";
import { Avatar } from "@/components/ui";
import { CloudPicker } from "./MymScripts";
import { Strip } from "./MymPush";
import { Choice, Foot, LIME, Next, Phone, Pill, Recap, StepHead, StudioShell, Toggle, eur, int, localInput, sCard, sField, when } from "./MymStudioKit";

// MYM → Envois groupés → Mass DM : copie du « Mass DM (MyPuls) ». Ce n'est PAS une fonction de MYM : Bloom envoie un
// message privé à chaque fan, l'un après l'autre, avec le compte relié. Avantage sur le push : un message texte peut être
// retiré ensuite (à la main, ou tout seul s'il n'a pas été lu) ; pas de limite « 1 par 7 jours ».
type Msg = { id: number; title: string; text: string; price: number; medias: Media[]; updatedAt: number };
type Opts = { audiences?: string[]; include?: string[]; exclude?: string[]; newSubsDays?: number; skipActiveMin?: number; spendMin?: number; spendMax?: number; smart?: { min: number; max: number }; removeAfterH?: number; challenge?: { keywords: string[]; rewardId: number; windowH: number; buyersOnly: boolean } };
type Camp = { id: number; messageId: number | null; title: string; text: string; price: number; medias: Media[]; opts: Opts; status: string; startAt: number; startedAt: number | null; finishedAt: number | null; removeAt: number | null; total: number; sent: number; pending: number; failed: number; skipped: number; removed: number; sales: number; revenue: number; createdBy: string | null; note: string | null; removable: boolean };
type Group = { id: string; name: string; color: string | null; size: number };
type Data = { canSend: boolean; messages: Msg[]; campaigns: Camp[]; counts: Record<string, number>; groups: Group[] };
const AUD: Record<string, { label: string; sub: string; icon: React.ReactNode }> = {
  active: { label: "Abonnés", sub: "Vos abonnés en cours.", icon: <UserCheck className="size-4" /> },
  old: { label: "Anciens abonnés", sub: "Ils ont résilié : de quoi les faire revenir.", icon: <UserMinus className="size-4" /> },
  interested: { label: "Intéressés", sub: "Ils vous suivent sans être abonnés.", icon: <UserPlus className="size-4" /> },
};
const STATUS: Record<string, [string, string]> = { scheduled: ["Programmée", "#f7b84b"], running: ["En cours", "#299cdb"], done: ["Terminée", "#0ab39c"], cancelled: ["Arrêtée", "#f06548"] };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };

export function MymMassDm() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Msg | "new" | null>(null);
  const [camp, setCamp] = useState<{ messageId: number | null } | null>(null);
  const [trace, setTrace] = useState<{ message?: Msg; campaign?: Camp } | null>(null);
  const load = useCallback(() => {
    if (!creatorId) return;
    api<Data>("GET", `/api/mym/massdm?creatorId=${encodeURIComponent(creatorId)}`).then((r) => (setD(r), setErr(""))).catch((e) => (setD({ canSend: false, messages: [], campaigns: [], counts: {}, groups: [] }), setErr((e as Error).message)));
  }, [creatorId]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  // Tant qu'une campagne part, les compteurs se mettent à jour tout seuls.
  const live = !!d?.campaigns.some((c) => c.status === "running" || c.status === "scheduled");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [live, load]);
  const act = async (path: string, payload: object, ok: string, ask?: string) => {
    if (ask && !confirm(ask)) return;
    try {
      await api("POST", path, payload);
      toast(ok);
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const can = !!d?.canSend;
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="relative overflow-hidden rounded-2xl p-6" style={{ background: "radial-gradient(70% 140% at 85% 0%, rgba(199,255,74,.13), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.25)" }}>
        <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Campagnes</p>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>Un message, toute votre audience.</h1>
            <p className="mt-1 max-w-[600px] text-[13px]">Choisissez un message, qui le reçoit et à quel prix : le studio réunit l’envoi groupé, le mass DM et le prix intelligent en un seul parcours.</p>
            <p className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold" style={{ color: "var(--mp-head)" }}>
              {[[<MessageSquareQuote key="a" className="size-3.5" />, `Messages prêts : ${d?.messages.length ?? "…"}`], [<Radio key="b" className="size-3.5" />, "Push massif inclus"], [<Sparkles key="c" className="size-3.5" />, "Prix intelligent"]].map(([i, l], k) => <span key={k} className="flex h-7 items-center gap-1.5 rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}><span style={{ color: "var(--mp-accent)" }}>{i}</span>{l}</span>)}
            </p>
          </div>
          <span className="flex h-9 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}>
            <Avatar src={creator?.avatar} name={creator?.name} size="size-5" />
            <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">{creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}</select>
          </span>
          {can ? (
            <>
              <button onClick={() => setEdit("new")} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "#3d4a2c", color: "var(--mp-head)" }}><Plus className="size-4" /> Nouveau message</button>
              <button onClick={() => setCamp({ messageId: null })} className="flex h-10 items-center gap-2 rounded-xl px-4 text-[13.5px] font-bold" style={LIME}><Play className="size-4 fill-current" /> Lancer une campagne</button>
            </>
          ) : null}
        </div>
      </div>
      {err ? <p className="mt-4 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}

      <div className="mt-5 rounded-md" style={card}>
        <div className="border-b px-4 py-3.5" style={{ borderColor: "var(--mp-line)" }}>
          <h2 className="text-[16px] font-medium" style={{ color: "var(--mp-head)" }}>▷ Mes derniers envois</h2>
          <p className="text-[11.5px]" style={{ color: "#7b8fd4" }}>Vue globale de vos dernières campagnes, tous messages confondus.</p>
        </div>
        {d && !d.campaigns.length ? <p className="py-9 text-center text-[13px]" style={{ color: "#7b8fd4" }}>Aucun envoi pour le moment. Lancez votre première campagne depuis la liste ci-dessous !</p> : null}
        {d?.campaigns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead><tr className="text-left" style={{ color: "var(--mp-head)", background: "var(--mp-card-2)" }}>{["Campagne", "Ciblage", "Livraison", "Revenu", "État", "Actions"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{d.campaigns.map((c) => <CampRow key={c.id} c={c} can={can} onTrace={() => setTrace({ campaign: c })} act={act} />)}</tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="mt-5 overflow-x-auto rounded-md" style={card}>
        <table className="w-full min-w-[820px] text-[13px]">
          <thead><tr className="text-left" style={{ color: "var(--mp-head)", background: "var(--mp-card-2)" }}>{["Titre & Contenu", "Médias", "Prix", "Campagnes", "Actions"].map((h, i) => <th key={h} className={`px-4 py-3 font-semibold ${i === 4 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>
            {(d?.messages ?? []).map((m) => (
              <tr key={m.id} className="border-t" style={{ borderColor: "var(--mp-line)" }}>
                <td className="max-w-[420px] px-4 py-3"><b className="block truncate" style={{ color: "var(--mp-head)" }}>{m.title}</b><span className="block truncate text-[12px]" style={{ color: "#7b8fd4" }}>{m.text || "—"}</span></td>
                <td className="px-4">{m.medias[0]?.thumb ? <span className="relative inline-block size-[52px] overflow-hidden rounded align-middle"><img src={m.medias[0].thumb} alt="" className="size-full object-cover" />{m.medias.length > 1 ? <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 text-[9.5px] text-white">+{m.medias.length - 1}</span> : null}</span> : <span className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: "var(--mp-line)" }}>Aucun média</span>}</td>
                <td className="px-4"><span className="rounded border px-1.5 py-0.5 text-[10.5px] font-bold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>{m.price ? eur(m.price) : "Gratuit"}</span></td>
                <td className="px-4">{can ? <button onClick={() => setCamp({ messageId: m.id })} className="flex h-7 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-bold" style={LIME}><Play className="size-3 fill-current" /> Envoyer</button> : "—"}</td>
                <td className="px-4 text-right whitespace-nowrap">
                  {can ? <IconBtn title="Modifier" color="#405189" onClick={() => setEdit(m)}><Pencil className="size-3.5" /></IconBtn> : null}
                  <IconBtn title="Historique des campagnes" color="#299cdb" onClick={() => setTrace({ message: m })}><History className="size-3.5" /></IconBtn>
                  {can ? <IconBtn title="Supprimer" color="#f06548" onClick={() => act("/api/mym/massdm/message/delete", { id: m.id }, "Message supprimé", `Supprimer le message « ${m.title} » ? Les campagnes déjà parties ne changent pas.`)}><Trash2 className="size-3.5" /></IconBtn> : null}
                </td>
              </tr>
            ))}
            {d && !d.messages.length ? <tr><td colSpan={5} className="py-9 text-center">Aucun message prêt. {can ? "Crée-en un avec « Nouveau message »." : ""}</td></tr> : null}
            {!d ? <tr><td colSpan={5} className="py-9 text-center">…</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Le Mass DM est fait par Bloom (MYM ne le propose pas) : un message privé par fan, environ 3 000 à l’heure. Un message texte peut être retiré ensuite ; un message avec média ne peut pas l’être (MYM le refuse). Lancer une campagne : team leaders, managers et admins.</p>

      {edit && creatorId ? <MessageEditor creatorId={creatorId} name={creator?.name || "Modèle"} msg={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={(id, prepare) => (setEdit(null), load(), prepare && setCamp({ messageId: id }))} /> : null}
      {camp && creatorId && d ? <CampaignStudio creatorId={creatorId} data={d} first={camp.messageId} onNewMessage={() => (setCamp(null), setEdit("new"))} onClose={() => setCamp(null)} onDone={() => (setCamp(null), load())} /> : null}
      {trace && d ? <Trace t={trace} campaigns={d.campaigns} onClose={() => setTrace(null)} /> : null}
    </div>
  );
}

function IconBtn({ children, title, color, onClick }: { children: React.ReactNode; title: string; color: string; onClick: () => void }) {
  return <button title={title} onClick={onClick} className="ml-1.5 inline-grid size-8 place-items-center rounded align-middle" style={{ background: `${color}33`, color }}>{children}</button>;
}
const targetText = (o: Opts, groups?: Group[]) => {
  const parts = [(o.audiences ?? []).map((a) => AUD[a]?.label ?? a).join(" + ") || "—"];
  if (o.include?.length) parts.push(`groupes : ${o.include.map((id) => groups?.find((g) => g.id === id)?.name ?? id).join(", ")}`);
  if (o.exclude?.length) parts.push(`sauf : ${o.exclude.map((id) => groups?.find((g) => g.id === id)?.name ?? id).join(", ")}`);
  if (o.newSubsDays) parts.push(`abonnés depuis ≤ ${o.newSubsDays} j`);
  if (o.skipActiveMin) parts.push("hors conversations en cours");
  if (o.spendMin != null || o.spendMax != null) parts.push(`dépense ${o.spendMin ?? 0} – ${o.spendMax ?? "∞"} €`);
  return parts.join(" · ");
};
function CampRow({ c, can, onTrace, act }: { c: Camp; can: boolean; onTrace: () => void; act: (path: string, payload: object, ok: string, ask?: string) => void }) {
  const [label, color] = STATUS[c.status] ?? [c.status, "#878a99"];
  const total = c.total || c.sent + c.pending + c.failed + c.skipped;
  const pct = total ? Math.round(((c.sent + c.failed + c.skipped) / total) * 100) : 0;
  const open = c.status === "running" || c.status === "scheduled";
  return (
    <tr className="border-t" style={{ borderColor: "var(--mp-line)" }}>
      <td className="max-w-[260px] px-4 py-3"><b className="block truncate" style={{ color: "var(--mp-head)" }}>{c.title}</b><span className="block truncate text-[12px]" style={{ color: "#7b8fd4" }}>{c.text || "—"}</span><span className="text-[11px]" style={{ color: "var(--mp-muted)" }}>{when(c.startedAt ?? c.startAt)}{c.createdBy ? ` · ${c.createdBy}` : ""}</span></td>
      <td className="max-w-[260px] px-4 text-[12px]">{targetText(c.opts)}{c.opts.smart ? <span className="block" style={{ color: "var(--mp-accent)" }}>Prix intelligent {c.opts.smart.min} – {c.opts.smart.max} €</span> : null}{c.opts.challenge ? <span className="block">Challenge : {c.opts.challenge.keywords.join(", ")}</span> : null}</td>
      <td className="px-4 text-[12px] whitespace-nowrap">
        {c.status === "scheduled" ? <>Départ le {when(c.startAt)}</> : <><b style={{ color: "var(--mp-head)" }}>{int(c.sent)}</b> / {int(total)} envoyés{c.failed ? ` · ${c.failed} refusés` : ""}{c.skipped ? ` · ${c.skipped} écartés` : ""}{c.removed ? ` · ${c.removed} retirés` : ""}</>}
        {c.status === "running" ? <span className="mt-1 block h-1.5 w-[150px] overflow-hidden rounded-full" style={{ background: "var(--mp-card-2)" }}><span className="block h-full" style={{ width: `${pct}%`, background: "var(--mp-accent)" }} /></span> : null}
        {c.removeAt ? <span className="block" style={{ color: "#f7b84b" }}>Retrait des non lus le {when(c.removeAt)}</span> : null}
        {c.note ? <span className="block" style={{ color: "var(--mp-muted)" }}>{c.note}</span> : null}
      </td>
      <td className="px-4 whitespace-nowrap">{c.sales ? <><b style={{ color: "var(--mp-head)" }}>{eur(c.revenue)}</b><span className="block text-[11px]">{c.sales} vente{c.sales > 1 ? "s" : ""}</span></> : "—"}</td>
      <td className="px-4"><span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: color }}>{label}</span></td>
      <td className="px-4 text-right whitespace-nowrap">
        <IconBtn title="Détail des envois" color="#299cdb" onClick={onTrace}><History className="size-3.5" /></IconBtn>
        {can && open ? <IconBtn title="Arrêter la campagne" color="#f06548" onClick={() => act("/api/mym/massdm/campaign/stop", { id: c.id }, "Campagne arrêtée", "Arrêter cette campagne ? Les messages déjà partis restent chez les fans.")}><Ban className="size-3.5" /></IconBtn> : null}
        {can && !open && c.removable && c.sent - c.removed > 0 ? (
          <>
            <IconBtn title="Retirer seulement les messages non lus" color="#f7b84b" onClick={() => act("/api/mym/massdm/campaign/remove", { id: c.id, unreadOnly: true }, "Retrait des non lus lancé", "Retirer ce message des conversations où il n’a pas encore été lu ?")}><Undo2 className="size-3.5" /></IconBtn>
            <IconBtn title="Retirer le message chez tous les fans" color="#f06548" onClick={() => act("/api/mym/massdm/campaign/remove", { id: c.id }, "Retrait lancé", `Retirer ce message chez les ${int(c.sent - c.removed)} fans qui l’ont reçu ? Ça prend quelques minutes.`)}><Trash2 className="size-3.5" /></IconBtn>
          </>
        ) : null}
      </td>
    </tr>
  );
}

function Trace({ t, campaigns, onClose }: { t: { message?: Msg; campaign?: Camp }; campaigns: Camp[]; onClose: () => void }) {
  const list = t.campaign ? [t.campaign] : campaigns.filter((c) => c.messageId === t.message?.id);
  const [sends, setSends] = useState<{ fanId: string; fan: string | null; status: string; price: number; at: number | null; error: string | null; rewardAt: number | null }[] | null>(null);
  useEffect(() => {
    if (!t.campaign) return;
    api<{ sends: typeof sends }>("GET", `/api/mym/massdm/campaign?id=${t.campaign.id}`).then((r) => setSends(r.sends)).catch(() => setSends([]));
  }, [t.campaign]);
  const st: Record<string, string> = { sent: "Envoyé", pending: "En attente", failed: "Refusé", skipped: "Écarté", removed: "Retiré" };
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-[760px] flex-col rounded-lg p-5" style={{ background: "#262a2f", color: "var(--mp-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-semibold" style={{ color: "#7b8fd4" }}><History className="mr-2 inline size-4" />{t.campaign ? "Détail de la campagne" : "Historique des campagnes"}</h3>
        <p className="text-[12.5px]">Message : <b style={{ color: "var(--mp-head)" }}>{t.campaign?.title ?? t.message?.title}</b></p>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {!t.campaign ? (
            list.length ? (
              <table className="w-full text-[12.5px]"><thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["Campagne", "Ciblage", "Livraison", "Revenu"].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{list.map((c) => <tr key={c.id} className="border-t" style={{ borderColor: "var(--mp-line)" }}><td className="py-2 pr-3">{when(c.startedAt ?? c.startAt)}<span className="block text-[11px]">{STATUS[c.status]?.[0]}</span></td><td className="pr-3">{targetText(c.opts)}</td><td className="pr-3">{int(c.sent)} / {int(c.total)}{c.removed ? ` · ${c.removed} retirés` : ""}</td><td>{c.sales ? eur(c.revenue) : "—"}</td></tr>)}</tbody></table>
            ) : <p className="py-10 text-center text-[13px]">Aucun envoi groupé pour ce message.</p>
          ) : (
            <table className="w-full text-[12.5px]"><thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["Fan", "État", "Prix", "Heure", ""].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {(sends ?? []).map((s) => <tr key={s.fanId} className="border-t" style={{ borderColor: "var(--mp-line)" }}><td className="py-1.5 pr-3" style={{ color: "var(--mp-head)" }}>{s.fan || s.fanId.slice(0, 8)}</td><td className="pr-3">{st[s.status] ?? s.status}{s.rewardAt ? " · récompense envoyée" : ""}</td><td className="pr-3">{s.price ? eur(s.price) : "—"}</td><td className="pr-3 whitespace-nowrap">{when(s.at)}</td><td className="text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{s.error}</td></tr>)}
                {sends && !sends.length ? <tr><td colSpan={5} className="py-8 text-center">Rien pour l’instant.</td></tr> : null}
              </tbody></table>
          )}
          {t.campaign && sends && sends.length >= 300 ? <p className="mt-2 text-[11.5px]">Les 300 derniers envois.</p> : null}
        </div>
        <div className="mt-4 text-right"><button onClick={onClose} className="h-9 rounded px-4 text-[13px]" style={{ background: "var(--mp-card-2)" }}>Fermer</button></div>
      </div>
    </div>
  );
}

function MessageEditor({ creatorId, name, msg, onClose, onSaved }: { creatorId: string; name: string; msg: Msg | null; onClose: () => void; onSaved: (id: number, prepare: boolean) => void }) {
  const [title, setTitle] = useState(msg?.title ?? "");
  const [text, setText] = useState(msg?.text ?? "");
  const [paid, setPaid] = useState((msg?.price ?? 0) > 0);
  const [price, setPrice] = useState(msg?.price ? String(msg.price) : "");
  const [medias, setMedias] = useState<Media[]>(msg?.medias ?? []);
  const [busy, setBusy] = useState(false);
  const save = async (prepare: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ id: number }>("POST", "/api/mym/massdm/message", { creatorId, id: msg?.id, title, text, medias, price: paid && medias.length ? Number(price.replace(",", ".")) || 0 : 0 });
      toast("Message enregistré");
      onSaved(r.id, prepare);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <StudioShell name={msg ? "Modifier Message" : "Nouveau Message"} onClose={onClose} aside={<Phone name={name} kind="Message privé" medias={medias} text={text} time={new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} note="Aperçu indicatif : l’affichage exact dépend de la plateforme." />}
      footer={<><button onClick={onClose} className="h-10 rounded-xl px-4 text-[13.5px] font-semibold" style={{ ...sCard, color: "var(--mp-head)" }}>Annuler</button><span className="flex-1" /><button disabled={busy} onClick={() => save(false)} className="h-10 rounded-xl border px-4 text-[13.5px] font-bold disabled:opacity-50" style={{ borderColor: "#6f8f2a", color: "var(--mp-accent)" }}>Enregistrer</button><button disabled={busy} onClick={() => save(true)} className="h-10 rounded-xl px-5 text-[13.5px] font-bold disabled:opacity-50" style={LIME}>→ Enregistrer et préparer l’envoi</button></>}>
      <div className="rounded-2xl p-4" style={sCard}>
        <p className="text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>Titre (interne)</p>
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Relance Hiver #1" className="mt-2 h-11 w-full rounded-xl px-3 text-[13.5px] outline-none" style={sField} />
        <p className="mt-1 text-[11.5px]">Visible uniquement par l’équipe.</p>
      </div>
      <div className="mt-4 rounded-2xl p-4" style={sCard}>
        <p className="flex justify-between text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>Message aux fans<span className="text-[12px] font-normal">{text.length} / 500</span></p>
        <textarea value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Écrivez votre message ici…" className="mt-3 h-[150px] w-full resize-y rounded-xl p-3 text-[13.5px] outline-none" style={sField} />
      </div>
      <div className="mt-4 rounded-2xl p-4" style={sCard}>
        <p className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}><Tag className="size-4" style={{ color: "var(--mp-accent)" }} /> Prix de déblocage</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill on={!paid} onClick={() => setPaid(false)}>Gratuit</Pill>
          <Pill on={paid} onClick={() => setPaid(true)}>Payant</Pill>
          {paid ? <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="€" className="h-8 w-[90px] rounded-full px-3 text-[13px] outline-none" style={sField} /> : null}
        </div>
        <p className="mt-2 text-[11.5px]">Gratuit (0) ou de 5 à 1 000 EUR. Le prix s’applique aux médias : un message sans média est toujours gratuit.</p>
      </div>
      <div className="mt-4 rounded-2xl p-4" style={sCard}>
        <p className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}><ImageIcon className="size-4" style={{ color: "var(--mp-accent)" }} /> Médias (max 5)</p>
        {medias.length ? <><Strip list={medias} onRemove={(id) => setMedias(medias.filter((m) => m.id !== id))} /><p className="mt-2 text-[12px]" style={{ color: "#f7b84b" }}>Avec un média, le message ne pourra PAS être retiré chez les fans après l’envoi (MYM le refuse).</p></> : null}
        <CloudPicker creatorId={creatorId} selected={medias} onChange={setMedias} />
      </div>
    </StudioShell>
  );
}

const CSTEPS = ["Quel message envoyer ?", "Qui le reçoit ?", "Affiner (facultatif)", "À quel prix ?", "Quand ?", "Prêt à partir"];

function CampaignStudio({ creatorId, data, first, onNewMessage, onClose, onDone }: { creatorId: string; data: Data; first: number | null; onNewMessage: () => void; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(first ? 1 : 0);
  const [reached, setReached] = useState(first ? 1 : 0);
  const [mid, setMid] = useState<number | null>(first);
  const [q, setQ] = useState("");
  const [aud, setAud] = useState<string[]>(["active"]);
  const [inc, setInc] = useState<string[]>([]);
  const [exc, setExc] = useState<string[]>([]);
  const [newSubs, setNewSubs] = useState(false);
  const [newDays, setNewDays] = useState("7");
  const [skipActive, setSkipActive] = useState(false);
  const [skipMin, setSkipMin] = useState("30");
  const [spend, setSpend] = useState(false);
  const [spendMin, setSpendMin] = useState("");
  const [spendMax, setSpendMax] = useState("");
  const [smart, setSmart] = useState(false);
  const [smartMin, setSmartMin] = useState("10");
  const [smartMax, setSmartMax] = useState("50");
  const [later, setLater] = useState(false);
  const [date, setDate] = useState(() => localInput(new Date(Date.now() + 3600_000)));
  const [remove, setRemove] = useState(false);
  const [removeH, setRemoveH] = useState("12");
  const [chal, setChal] = useState(false);
  const [kw, setKw] = useState("");
  const [reward, setReward] = useState<number | null>(null);
  const [winH, setWinH] = useState("48");
  const [buyers, setBuyers] = useState(false);
  const [est, setEst] = useState<{ total: number; by: Record<string, number>; priceMin: number; priceMax: number; minutes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const msg = data.messages.find((m) => m.id === mid) ?? null;
  const hasMedia = !!msg?.medias.length;
  const go = (n: number) => (setStep(n), setReached((r) => Math.max(r, n)));
  const payload = useMemo(() => ({
    creatorId, messageId: mid, audiences: aud, include: inc, exclude: exc, newSubsDays: newSubs ? Number(newDays) || 0 : 0, skipActiveMin: skipActive ? Number(skipMin) || 0 : 0,
    spendMin: spend && spendMin !== "" ? Number(spendMin) : null, spendMax: spend && spendMax !== "" ? Number(spendMax) : null,
    smart: smart && hasMedia ? { min: Number(smartMin) || 0, max: Number(smartMax) || 0 } : null, removeAfterH: remove && !hasMedia ? Number(removeH) || 0 : 0,
    challenge: chal && kw.trim() && reward ? { keywords: kw, rewardId: reward, windowH: Number(winH) || 48, buyersOnly: buyers } : null,
  }), [creatorId, mid, aud, inc, exc, newSubs, newDays, skipActive, skipMin, spend, spendMin, spendMax, smart, hasMedia, smartMin, smartMax, remove, removeH, chal, kw, reward, winH, buyers]);
  // Nombre de fans visés, recalculé à chaque changement (rien n'est envoyé).
  useEffect(() => {
    const t = setTimeout(() => api<NonNullable<typeof est>>("POST", "/api/mym/massdm/preview", payload).then(setEst).catch(() => setEst(null)), 250);
    return () => clearTimeout(t);
  }, [payload]);
  const total = est?.total ?? 0;
  const priceText = smart && hasMedia ? `Prix intelligent ${smartMin} – ${smartMax} €` : msg?.price ? eur(msg.price) : "Gratuit";
  const problem = !msg ? "Choisissez d’abord un message." : !aud.length ? "Cochez au moins une audience." : smart && hasMedia && !(Number(smartMin) >= 5 && Number(smartMax) >= Number(smartMin)) ? "Prix intelligent : minimum 5 €, maximum au-dessus du minimum." : later && !(Date.parse(date) > Date.now()) ? "La date de départ est passée." : chal && (!kw.trim() || !reward) ? "Challenge : donnez un mot-clé et le message de récompense." : !total ? "Aucun fan ne correspond à ce ciblage." : "";
  const submit = async () => {
    if (problem) return toast(problem, "err");
    if (!confirm(`${later ? "Programmer" : "Envoyer maintenant"} « ${msg!.title} » à ${int(total)} fans ?${hasMedia ? "\n\nCe message porte un média : il ne pourra PAS être retiré ensuite." : "\n\nMessage texte : il pourra être retiré ensuite."}`)) return;
    setBusy(true);
    try {
      await api("POST", "/api/mym/massdm/campaign", { ...payload, startAt: later ? new Date(date).toISOString() : null, confirm: true });
      toast(later ? "Campagne programmée" : "Campagne lancée");
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const tog = (l: string[], set: (v: string[]) => void, id: string) => set(l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const num = (v: string, set: (s: string) => void, w = 90, unit = "") => <span className="inline-flex items-center gap-2"><input value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" className="h-9 rounded-lg px-3 text-[13px] outline-none" style={{ ...sField, width: w }} />{unit}</span>;

  const s0 = (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un message…" className="mb-4 h-10 w-full max-w-[380px] rounded-xl px-3 text-[13.5px] outline-none" style={sField} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={onNewMessage} className="grid min-h-[210px] place-items-center rounded-2xl border border-dashed p-4 text-center" style={{ borderColor: "#3a4431" }}><span><span className="mx-auto grid size-10 place-items-center rounded-xl" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}><Plus className="size-5" /></span><b className="mt-3 block text-[13px]" style={{ color: "var(--mp-head)" }}>Créer un message</b><span className="mt-1 block text-[12px]">Texte, médias, prix — puis retour ici pour l’envoyer.</span></span></button>
        {data.messages.filter((m) => !q || `${m.title} ${m.text}`.toLowerCase().includes(q.toLowerCase())).map((m) => (
          <button key={m.id} onClick={() => setMid(m.id)} className="overflow-hidden rounded-2xl text-left" style={mid === m.id ? { border: "2px solid var(--mp-accent)", background: "rgba(199,255,74,.06)" } : { ...sCard, border: "2px solid #232b1c" }}>
            <span className="relative block h-[104px]" style={{ background: "rgba(255,255,255,.06)" }}>
              {m.medias[0]?.thumb ? <img src={m.medias[0].thumb} alt="" className="size-full object-cover" /> : <MessageSquareQuote className="absolute inset-0 m-auto size-5 opacity-50" />}
              <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-bold text-white">{m.price ? eur(m.price) : "Gratuit"}</span>
            </span>
            <span className="block p-3"><b className="block truncate text-[13.5px]" style={{ color: "var(--mp-head)" }}>{m.title}</b><span className="mt-0.5 line-clamp-2 block text-[12px]">{m.text}</span><span className="mt-2 block text-[11px]">{m.medias.length ? `Médias : ${m.medias.length}` : "Texte seul"}</span></span>
          </button>
        ))}
      </div>
    </>
  );
  const chip = (g: Group, on: boolean, click: () => void, ban?: boolean) => <button key={g.id} onClick={click} className="flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-semibold" style={on ? (ban ? { background: "#f0654833", border: "1px solid #f06548", color: "#fff" } : LIME) : { border: "1px solid #333d2b", color: "var(--mp-head)" }}>{ban ? <Ban className="size-3" style={{ color: "#f06548" }} /> : <span className="size-2 rounded-full" style={{ background: g.color || "#405189" }} />}{g.name}{ban ? null : <span className="opacity-60">{int(g.size)}</span>}</button>;
  const s1 = (
    <>
      <div className="mb-3 flex items-center gap-3 rounded-2xl p-4" style={{ background: "rgba(199,255,74,.05)", border: "1px solid #6f8f2a" }}>
        <span className="grid size-10 place-items-center rounded-xl" style={LIME}><Radio className="size-5" /></span>
        <span className="min-w-0 flex-1"><b className="block text-[14px]" style={{ color: "var(--mp-head)" }}>Push massif</b><span className="text-[12.5px]">Abonnés + anciens abonnés + intéressés, sans filtre : toute votre audience en une campagne.</span></span>
        <button onClick={() => (setAud(["active", "old", "interested"]), setInc([]), setExc([]))} className="flex h-9 items-center gap-2 rounded-xl border px-3 text-[12.5px] font-bold" style={{ borderColor: "#6f8f2a", color: "var(--mp-accent)" }}><Zap className="size-3.5" /> Tout sélectionner</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(AUD).map(([id, a]) => <Choice key={id} on={aud.includes(id)} onClick={() => tog(aud, setAud, id)} icon={a.icon} title={a.label} sub={a.sub} foot={<b className="text-[17px]" style={{ color: "var(--mp-head)" }}>{int(data.counts[id] ?? 0)} <span className="text-[12px] font-semibold" style={{ color: "var(--mp-accent)" }}>fans</span></b>} />)}
      </div>
      {data.groups.length ? (
        <>
          <p className="mt-6 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}><Tag className="mr-2 inline size-4" style={{ color: "var(--mp-accent)" }} />Limiter à des groupes</p>
          <p className="text-[12px]">Facultatif : sans groupe, toute l’audience choisie est visée.</p>
          <div className="mt-2 flex flex-wrap gap-2">{data.groups.map((g) => chip(g, inc.includes(g.id), () => tog(inc, setInc, g.id)))}</div>
          <p className="mt-6 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}><Ban className="mr-2 inline size-4" style={{ color: "#f06548" }} />Exclure des groupes</p>
          <p className="text-[12px]">Ces fans ne recevront rien, quelle que soit l’audience cochée.</p>
          <div className="mt-2 flex flex-wrap gap-2">{data.groups.map((g) => chip(g, exc.includes(g.id), () => tog(exc, setExc, g.id), true))}</div>
        </>
      ) : null}
      <p className="mt-5 text-[11.5px]">Fans comptés d’après les conversations MYM connues de Bloom : un fan qui n’a aucune conversation avec la modèle n’est pas visé. Chaque fan ne reçoit le message qu’une fois.</p>
    </>
  );
  const s2 = (
    <>
      <Toggle on={newSubs} set={setNewSubs} title="Uniquement les nouveaux abonnés" sub="Ne cible que les abonnés dont l’abonnement a commencé dans la fenêtre choisie. L’audience est recalculée au moment de l’envoi.">
        <span className="text-[12.5px]">Abonnés depuis moins de {num(newDays, setNewDays, 70, "jours")}</span>
        <p className="mt-2 text-[11.5px]">Bloom connaît la date d’abonnement des fans déjà relus ; les autres sont écartés par ce filtre.</p>
      </Toggle>
      <Toggle on={skipActive} set={setSkipActive} title="Exclure les conversations en cours" sub="Écarte les fans qui ont écrit récemment, pour ne pas couper une discussion en cours avec un message de masse. Vérifié au moment où chaque message part : le nombre affiché est une estimation à l’instant.">
        <span className="text-[12.5px]">Le fan a écrit il y a moins de {num(skipMin, setSkipMin, 70, "minutes")}</span>
      </Toggle>
      <Toggle on={spend} set={setSpend} title="Dépenses chez vous" sub="Total déjà payé par le fan sur votre compte.">
        <span className="text-[12.5px]">Entre {num(spendMin, setSpendMin, 80, "€")} et {num(spendMax, setSpendMax, 80, "€ (vide = sans limite)")}</span>
      </Toggle>
    </>
  );
  const s3 = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice on={!smart || !hasMedia} onClick={() => setSmart(false)} icon={<Tag className="size-4" />} title="Prix du message" sub={`Tout le monde reçoit le même prix : ${msg?.price ? eur(msg.price) : "Gratuit"}.`} />
        <Choice on={smart && hasMedia} disabled={!hasMedia} onClick={() => setSmart(true)} icon={<Sparkles className="size-4" />} title="Prix intelligent" sub="Chaque fan reçoit un prix calculé sur ses achats passés, entre votre minimum et votre maximum." />
      </div>
      {!hasMedia ? <p className="mt-3 rounded-xl border border-dashed px-4 py-3 text-[12.5px]" style={{ borderColor: "#333d2b" }}>Le prix intelligent fixe le prix de déblocage des médias : choisissez un message avec média.</p> : null}
      {smart && hasMedia ? (
        <div className="mt-3 rounded-2xl p-4 text-[12.5px]" style={sCard}>
          Minimum {num(smartMin, setSmartMin, 80, "€")} <span className="mx-2" /> Maximum {num(smartMax, setSmartMax, 80, "€")}
          <p className="mt-2 text-[11.5px]">Prix d’un fan = son panier moyen passé (dépense ÷ nombre d’achats), ramené entre le minimum et le maximum. Un fan qui n’a jamais acheté reçoit le minimum.{est && est.total ? ` Sur ce ciblage : de ${eur(est.priceMin)} à ${eur(est.priceMax)}.` : ""}</p>
        </div>
      ) : null}
    </>
  );
  const s4 = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice on={!later} onClick={() => setLater(false)} icon={<Zap className="size-4" />} title="Maintenant" sub="La campagne démarre dès la validation." />
        <Choice on={later} onClick={() => setLater(true)} icon={<CalendarClock className="size-4" />} title="Programmer" sub="Choisissez la date et l’heure de départ." />
      </div>
      {later ? <div className="mt-3 rounded-2xl p-4" style={sCard}><p className="text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Date et heure de départ</p><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 h-10 rounded-lg px-3 text-[13.5px] outline-none" style={{ ...sField, colorScheme: "dark" }} /><p className="mt-2 text-[11.5px]">Heure de ton appareil. L’audience est calculée au départ.</p></div> : null}
      <div className="mt-4" />
      <Toggle on={remove && !hasMedia} set={setRemove} disabled={hasMedia} title={<><Undo2 className="mr-1.5 inline size-3.5" />Retirer si non lu</>} sub={hasMedia ? "Impossible avec un média : MYM refuse de supprimer un message qui en porte un." : "Le message disparaît des conversations où il n’a pas été lu à temps."}>
        <div className="flex flex-wrap gap-2">{["1", "3", "6", "12", "24", "48"].map((h) => <Pill key={h} on={removeH === h} onClick={() => setRemoveH(h)}>{h} h</Pill>)}</div>
        <p className="mt-3 text-[12.5px]">Délai personnalisé {num(removeH, setRemoveH, 80, "heures après la fin de l’envoi")}</p>
      </Toggle>
      <Toggle on={chal} set={setChal} title="Challenge en 2 temps" sub="Optionnel : si le fan répond le mot-clé après avoir reçu ce message, un second message lui est envoyé automatiquement.">
        <div className="grid gap-4 text-[12.5px] sm:grid-cols-2">
          <label>Mot-clé attendu<input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="CADEAU" className="mt-1.5 block h-10 w-full rounded-lg px-3 text-[13px] outline-none" style={sField} /><span className="mt-1 block text-[11.5px]">Insensible à la casse et aux accents, mot entier. Plusieurs mots-clés possibles, séparés par des virgules.</span></label>
          <label>Message envoyé en récompense<select value={reward ?? ""} onChange={(e) => setReward(Number(e.target.value) || null)} className="mt-1.5 block h-10 w-full rounded-lg px-3 text-[13px] outline-none" style={sField}><option value="" style={{ background: "#222" }}>Choisir un message déjà créé…</option>{data.messages.filter((m) => m.id !== mid).map((m) => <option key={m.id} value={m.id} style={{ background: "#222" }}>{m.title}</option>)}</select><span className="mt-1 block text-[11.5px]">Créez d’abord le message dans la liste pour le retrouver ici.</span></label>
          <label>Fenêtre de réponse (heures)<input value={winH} onChange={(e) => setWinH(e.target.value)} inputMode="numeric" className="mt-1.5 block h-10 w-full rounded-lg px-3 text-[13px] outline-none" style={sField} /><span className="mt-1 block text-[11.5px]">Passé ce délai après réception du 1er message, le mot-clé ne débloque plus rien.</span></label>
          <div className="self-start"><Toggle on={buyers} set={setBuyers} title="Réservé aux fans ayant acheté le 1er message" sub="Sinon le mot-clé suffit, achat ou non." /></div>
        </div>
      </Toggle>
    </>
  );
  const filters = [newSubs ? `Nouveaux abonnés (${newDays} j)` : "", skipActive ? "Hors conversations en cours" : "", spend ? `Dépense ${spendMin || 0} – ${spendMax || "∞"} €` : "", inc.length ? `${inc.length} groupe(s)` : "", exc.length ? `${exc.length} exclu(s)` : ""].filter(Boolean).join(" · ") || "Aucun";
  const s5 = (
    <>
      <div className="mb-3 rounded-2xl p-5" style={{ background: "rgba(199,255,74,.06)", border: "1px solid #6f8f2a" }}>
        <b className="text-[52px] leading-none font-bold" style={{ color: "var(--mp-accent)" }}>{int(total)}</b><span className="ml-4 text-[14px]">fans recevront ce message{est ? ` · environ ${est.minutes} min d’envoi` : ""}</span>
        <p className="mt-2 flex flex-wrap gap-2">{aud.map((a) => <span key={a} className="rounded-full border px-2.5 py-0.5 text-[12px] font-semibold" style={{ borderColor: "#4a5a2c", color: "var(--mp-head)" }}>{AUD[a].label} · {int(est?.by[a] ?? 0)}</span>)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Recap label="Message" value={msg?.title ?? "—"} sub={hasMedia ? `${msg!.medias.length} média(s) — ne pourra pas être retiré` : "Texte seul — pourra être retiré"} onEdit={() => go(0)} />
        <Recap label="Audience" value={aud.map((a) => AUD[a].label).join(" + ") || "—"} onEdit={() => go(1)} />
        <Recap label="Filtres" value={filters} onEdit={() => go(2)} />
        <Recap label="Prix" value={priceText} onEdit={() => go(3)} />
        <Recap label="Départ" value={later ? `Le ${when(Date.parse(date))}` : "Dès la validation"} sub={remove && !hasMedia ? `Retrait des non lus après ${removeH} h` : undefined} onEdit={() => go(4)} />
        <Recap label="Challenge" value={chal && kw.trim() && reward ? `« ${kw} » → ${data.messages.find((m) => m.id === reward)?.title}` : "Aucun"} sub={chal ? `${winH} h pour répondre` : undefined} onEdit={() => go(4)} />
      </div>
      {problem ? <p className="mt-4 text-[13px]" style={{ color: "#f06548" }}>{problem}</p> : null}
    </>
  );
  const heads: [string, string][] = [["Quel message envoyer ?", "Choisissez l’un de vos messages prêts : son texte, ses médias et son prix partent tels quels."], ["Qui le reçoit ?", "Cochez une ou plusieurs audiences : elles partent ensemble, en une seule campagne, et chaque fan ne reçoit le message qu’une fois."], ["Affiner (facultatif)", "Resserrez l’audience si besoin. Sans filtre, la campagne part à toute l’audience choisie."], ["À quel prix ?", "Gardez le prix du message, ou laissez chaque fan recevoir le prix qui lui correspond."], ["Quand ?", "Maintenant ou plus tard, avec retrait automatique si le message n’est pas lu à temps."], ["Prêt à partir", "Relisez : c’est le dernier écran avant l’envoi."]];
  const subs = [msg?.title ?? "", aud.map((a) => AUD[a].label).join(", "), "", priceText, later ? when(Date.parse(date)) : "Dès la validation", ""];
  const ok = [!!msg, aud.length > 0, true, true, !later || Date.parse(date) > Date.now(), !problem][step];
  return (
    <StudioShell name="Studio de campagne" steps={CSTEPS.map((t, i) => ({ title: t, sub: i <= reached ? subs[i] : undefined }))} step={step} setStep={go} done={reached} onClose={onClose}
      footer={<Foot back={step > 0} onBack={() => setStep(step - 1)} info={!msg ? "Choisissez d’abord un message" : <><span className="mr-2 inline-block size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /><b className="text-[17px]" style={{ color: "var(--mp-head)" }}>{int(total)}</b> fans visés</>} next={step === 5 ? <><Play className="size-4 fill-current" /> {later ? "Programmer pour" : "Envoyer à"} {int(total)} fans</> : <Next />} onNext={() => (step === 5 ? submit() : go(step + 1))} disabled={busy || !ok} />}>
      <StepHead n={step + 1} of={6} title={heads[step][0]} sub={heads[step][1]} />
      {[s0, s1, s2, s3, s4, s5][step]}
    </StudioShell>
  );
}
