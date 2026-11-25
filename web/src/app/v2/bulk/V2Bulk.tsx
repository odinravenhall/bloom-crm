"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ImageIcon, MessageSquare, Plus, RefreshCw, Send as SendIcon, Zap } from "lucide-react";
import { api, toast } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { Avatar } from "@/rv/components/ui";
import { cash, Confirm, downloadCsv, int, Modal, PALETTE, pct, Ring, RowMenu } from "../kit";
import { errText, plural, priceOf } from "../media/MediaKit";
import { AutoForm, Composer, ReadyForm, TRIGGER_NAME, type Auto, type BulkGroup, type ComposeInit, type OfList, type Ready } from "./BulkForms";

// Bloom v2 → Envois groupés : le MÊME écran pour OnlyFans et MYM (25/11/2026, « Constellation »). Il remplace, dans la
// v2, la copie d'Infloww (Smart Messages) et celle de MyPulse (Mass DM). À gauche les modèles ; à droite l'historique
// des envois dans une même forme (message, destinataires, état, envoyés, achats, revenus), les messages prêts (MYM) ou
// les messages automatiques (OnlyFans). « Nouvel envoi » ouvre les mêmes étapes des deux côtés (BulkForms.tsx).
// Lecture : « GET /api/v2/bulk » (app/v2bulk.mjs). Écrire reste dans les routes d'avant, toujours derrière une
// confirmation : « /api/mass », « /api/mass/unsend », « /api/smart/auto… », « /api/mym/massdm/… ».
type SendStatus = "scheduled" | "running" | "sent" | "stopped" | "unsent" | "failed";
type Opts = { smart?: { min: number; max: number }; removeAfterH?: number; challenge?: { keywords: string[]; rewardId: number; windowH: number; buyersOnly: boolean } };
type Send = {
  id: string; title: string; text: string; medias: number; thumbs: { id: string; type: string; thumb: string | null }[]; price: number; smart: { min: number; max: number } | null;
  audience: string; status: SendStatus; at: number | null; by: string | null;
  total: number | null; sent: number | null; viewed: number | null; bought: number; revenue: number; failed: number; skipped: number; removed: number; pending: number;
  canStop: boolean; canUnsend: boolean; canWithdraw: boolean; removeAt: number | null; note: string | null;
  messageId: number | null; opts: Opts; included: string[]; excluded: string[]; onlineOnly: boolean;
};
type Data = {
  platform: Pf; currency: string; canSend: boolean;
  list: { id: string; name: string; avatar: string | null }[];
  model: { id: string; name: string; avatar: string | null } | null;
  sends: Send[]; page: number; pages: number; total: number; lists: OfList[]; autos: Auto[]; messages: Ready[];
  counts: { active: number; old: number; interested: number }; groups: BulkGroup[]; error: string | null;
};
type Trace = { fanId: string; fan: string | null; status: string; price: number; at: number | null; error: string | null; rewardAt: number | null };
type Tab = "sends" | "ready" | "autos";
type Win =
  | null
  | { kind: "send"; send: Send }
  | { kind: "ready"; msg: Ready | null }
  | { kind: "auto"; auto: Auto | null; copy?: boolean }
  | { kind: "confirm"; title: string; text: string; button: string; go: () => Promise<unknown> };

const QUIET: React.CSSProperties = { color: "var(--color-muted)", background: "rgb(255 255 255 / 0.06)" };
const GOOD: React.CSSProperties = { color: "var(--v2-up)", background: "rgb(16 185 129 / 0.14)" };
const ST: Record<SendStatus, { label: string; style: React.CSSProperties }> = {
  scheduled: { label: "Programmé", style: { color: "var(--v2-sky)", background: "rgb(59 130 246 / 0.14)" } },
  running: { label: "En cours", style: { color: "#fcd34d", background: "rgb(245 158 11 / 0.15)" } },
  sent: { label: "Envoyé", style: GOOD },
  stopped: { label: "Arrêté", style: QUIET },
  unsent: { label: "Retiré", style: QUIET },
  failed: { label: "Échec", style: { color: "var(--v2-down)", background: "rgb(244 63 94 / 0.15)" } },
};
const AUTO_ST: Record<string, { label: string; style: React.CSSProperties }> = {
  active: { label: "Actif", style: GOOD },
  scheduled: { label: "Brouillon", style: QUIET },
  canceled: { label: "Arrêté", style: QUIET },
  completed: { label: "Terminé", style: QUIET },
};
const TRACE: Record<string, string> = { pending: "en attente", sent: "envoyé", failed: "échec", skipped: "laissé de côté", removed: "retiré" };
const dayOf = (t: number | null) => (t ? new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const hourOf = (t: number | null) => (t ? new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const whenOf = (t: number | null) => (t ? `${dayOf(t)} à ${hourOf(t)}` : "date inconnue");

/** La vignette d'un envoi : son premier média s'il s'affiche, sinon un pictogramme. */
function Thumb({ s, size = "size-10" }: { s: Pick<Send, "thumbs" | "medias">; size?: string }) {
  const [bad, setBad] = useState(false);
  const t = s.thumbs.find((x) => x.thumb)?.thumb ?? null;
  return (
    <span className={`relative grid ${size} shrink-0 place-items-center overflow-hidden rounded-lg`} style={{ background: "var(--color-card-2)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {t && !bad ? <img src={t} alt="" loading="lazy" onError={() => setBad(true)} className="size-full object-cover" /> : s.medias ? <ImageIcon className="size-4 text-muted" /> : <MessageSquare className="size-4 text-muted" />}
    </span>
  );
}

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2Bulk({ pf }: { pf: Pf }) {
  const modelKey = `bloom.v2.bulk.model.${pf}`;
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem(modelKey) || "";
    } catch {
      return "";
    }
  });
  const [tab, setTab] = useState<Tab>("sends");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const [spin, setSpin] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [compose, setCompose] = useState<{ n: number; init: ComposeInit } | null>(null);
  const [win, setWin] = useState<Win>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    const id = ++seq.current;
    const p = new URLSearchParams({ pf });
    if (model) p.set("creatorId", model);
    if (page > 1) p.set("page", String(page));
    return api<Data>("GET", `/api/v2/bulk?${p}`)
      .then((d) => void (id === seq.current && (setData({ key: model, d }), setErr(""), setWaiting(false))))
      .catch((e) => void (id === seq.current && (setErr(errText(e)), setWaiting(false))));
  }, [pf, model, page]);
  useEffect(() => void load(), [load]);

  const d = data?.d ?? null;
  const m = d?.model ?? null;
  const mid = m?.id ?? "";
  const stale = (!!data && data.key !== model) || waiting;
  const mym = pf === "mym";
  const pfName = mym ? "MYM" : "OnlyFans";
  const cur = d?.currency ?? (mym ? "EUR" : "USD");
  const canSend = !!d?.canSend;
  const sends = d?.sends ?? [];
  const money = (cents: number) => cash(cents, cur, cents % 100 ? 2 : 0);
  // MYM : tant qu'une campagne part (ou va partir dans les deux minutes), l'écran se relit tout seul.
  const running = sends.some((s) => s.status === "running");
  const live = mym && !compose && sends.some((s) => s.status === "running" || (s.status === "scheduled" && s.at != null && s.at < Date.now() + 120_000));
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [live, load]);

  const pickModel = (id: string) => {
    setModel(id);
    setPage(1);
    setTab("sends");
    setCompose(null);
    try {
      localStorage.setItem(modelKey, id);
    } catch {}
  };
  const goPage = (n: number) => (setWaiting(true), setPage(n));
  const refresh = async () => {
    setSpin(true);
    await load();
    setSpin(false);
  };
  const colorOf = (id: string) => PALETTE[Math.max(0, (d?.list ?? []).findIndex((x) => x.id === id)) % PALETTE.length];
  const open = (init: ComposeInit) => (setWin(null), setCompose({ n: Date.now(), init }));
  const ask = (title: string, text: string, button: string, go: () => Promise<unknown>) => setWin({ kind: "confirm", title, text, button, go });
  /** Refaire un envoi : côté OnlyFans on reprend le texte, le prix et les listes ; côté MYM on repart du message prêt. */
  const again = (s: Send) => {
    if (!d) return;
    if (mym) {
      if (!d.messages.some((x) => x.id === s.messageId)) return toast("Le message prêt de cet envoi a été supprimé : écris-en un nouveau.", "err");
      return open({ messageId: s.messageId });
    }
    const known = new Set(d.lists.map((l) => l.id));
    open({ text: s.text, price: s.price, include: s.included.filter((x) => known.has(x)), exclude: s.excluded.filter((x) => known.has(x)), note: s.medias ? `L’envoi d’origine portait ${plural(s.medias, "média")} : ils ne sont pas repris, choisis-les à nouveau.` : undefined });
  };
  const stop = (s: Send) => ask("Arrêter cet envoi ?", s.status === "scheduled" ? "L’envoi programmé est annulé : aucun message ne partira." : `Les ${int(s.pending)} messages pas encore partis sont annulés. Ceux qui sont déjà partis restent chez les fans.`, "Arrêter l’envoi", async () => {
    await api("POST", "/api/mym/massdm/campaign/stop", { id: Number(s.id) });
    toast("Envoi arrêté");
    await load();
  });
  const unsend = (s: Send) => ask("Retirer ce message chez les fans ?", `Le message de masse disparaît des conversations des fans de ${m?.name ?? "la modèle"}. C’est définitif : il ne peut pas être remis.`, "Retirer le message", async () => {
    await api("POST", "/api/mass/unsend", { creatorId: mid, id: s.id });
    toast("Message retiré");
    await load();
  });
  const withdraw = (s: Send, unreadOnly: boolean) => ask(unreadOnly ? "Retirer le message chez ceux qui ne l’ont pas lu ?" : "Retirer le message chez tous les fans ?", `Le message est supprimé chez MYM, ${unreadOnly ? "seulement dans les conversations où il n’a pas encore été ouvert" : `dans les ${int((s.sent ?? 0) - s.removed)} conversations où il est parti`}. C’est définitif. Le retrait se fait un par un, en arrière-plan.`, "Retirer le message", async () => {
    await api("POST", "/api/mym/massdm/campaign/remove", { id: Number(s.id), unreadOnly });
    toast("Retrait lancé");
    await load();
  });
  const exportCsv = () => downloadCsv(
    `envois-${(m?.name ?? "modele").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
    ["Date", "État", "Titre", "Message", "Destinataires", "Médias", "Prix", "Visés", "Envoyés", "Vus", "Achats", `Revenus (${cur})`, "Par"],
    sends.map((s) => [s.at ? new Date(s.at).toLocaleString("fr-FR") : "", ST[s.status].label, s.title, s.text, s.audience, String(s.medias), s.smart ? `${s.smart.min}-${s.smart.max}` : String(s.price || 0), s.total == null ? "" : String(s.total), s.sent == null ? "" : String(s.sent), s.viewed == null ? "" : String(s.viewed), String(s.bought), (s.revenue / 100).toFixed(2), s.by ?? ""]),
  );

  const sum = sends.reduce((a, s) => ({ sent: a.sent + (s.sent ?? 0), bought: a.bought + s.bought, revenue: a.revenue + s.revenue }), { sent: 0, bought: 0, revenue: 0 });
  const partial = !!d && d.pages > 1;
  const tile = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="min-w-0 rounded-[12px] border px-3.5 py-2.5" style={{ borderColor: "var(--color-line)" }}>
      <p className="truncate text-[11.5px] font-semibold text-muted">{label}</p>
      <p className="v2-num mt-0.5 truncate text-[20px] leading-tight font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub ?? " "}</p>
    </div>
  );
  const th = (label: string, right = false) => <th className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>{label}</th>;
  const second = mym ? "ready" : "autos";

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Chatting · {pfName}</p>
          <h1 className="v2-h1 mt-1">Envois groupés</h1>
        </div>
        {!compose ? (
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {m ? <button type="button" onClick={() => void refresh()} disabled={spin} className="v2-select" title="Relire les envois"><RefreshCw className={`size-4 text-muted ${spin ? "animate-spin" : ""}`} />Actualiser</button> : null}
            {m && canSend ? <button type="button" onClick={() => open({})} className="v2-btn" style={{ height: 36 }}><SendIcon className="size-4" />Nouvel envoi</button> : null}
          </div>
        ) : null}
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      {compose && d && m ? (
        <div className="mt-5">
          <Composer key={compose.n} pf={pf} creatorId={mid} model={m.name} cur={cur} lists={d.lists} messages={d.messages} counts={d.counts} groups={d.groups} running={running} init={compose.init} onClose={() => setCompose(null)} onDone={() => (setCompose(null), setTab("sends"), setPage(1), void load())} />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
          {/* La colonne des modèles */}
          <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 1 }}>
            <div className="v2-card p-1.5">
              <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Modèles</p>
              <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:max-h-[calc(100dvh-200px)] lg:space-y-0.5 lg:overflow-y-auto">
                {(d?.list ?? []).map((x) => (
                  <button key={x.id} type="button" onClick={() => pickModel(x.id)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.id} aria-pressed={mid === x.id} title={`Voir les envois de ${x.name}`}>
                    <Ring color={colorOf(x.id)}><Avatar src={x.avatar} name={x.name} size="size-8" /></Ring>
                    <b className="min-w-0 flex-1 truncate text-[13px]">{x.name}</b>
                  </button>
                ))}
                {d && !d.list.length ? <p className="px-2 py-3 text-[12.5px] text-muted">Aucune modèle {pfName}.</p> : null}
                {!d ? <p className="px-2 py-3 text-[12.5px] text-muted">Chargement…</p> : null}
              </div>
            </div>
          </aside>

          <div className="min-w-0" style={{ opacity: stale ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
            {d && !m ? <div className="v2-card v2-rise p-8 text-center text-[13.5px] text-muted">{mym ? "Aucun compte MYM relié pour l’instant." : "Aucune modèle OnlyFans pour l’instant."}</div> : null}
            {!d && !err ? <div className="v2-card p-8 text-center text-[13.5px] text-muted">Chargement…</div> : null}

            {d && m ? (
              <section className="v2-rise min-w-0" style={{ ["--i" as string]: 2 }}>
                <div className="v2-card p-3">
                  <div className="v2-noscroll overflow-x-auto border-b px-1" style={{ borderColor: "var(--color-line)" }}>
                    <div className="v2-tabs">
                      <button type="button" className="v2-tab" data-on={tab === "sends"} onClick={() => setTab("sends")}>Envois<span className="v2-num ml-1.5 opacity-60">{int(d.total)}</span></button>
                      <button type="button" className="v2-tab" data-on={tab === second} onClick={() => setTab(second)}>{mym ? "Messages prêts" : "Automatiques"}<span className="v2-num ml-1.5 opacity-60">{int(mym ? d.messages.length : d.autos.length)}</span></button>
                    </div>
                  </div>
                  {d.error ? <p className="mx-1 mt-3 rounded-[10px] border px-3 py-2 text-[12.5px]" style={{ borderColor: "rgb(251 191 36 / 0.3)", background: "rgb(251 191 36 / 0.07)", color: "#fbbf24" }}>{d.error}</p> : null}

                  {tab === "sends" ? (
                    <>
                      <div className="flex flex-wrap items-start gap-3 px-1 pt-3.5 pb-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-[16px] font-bold tracking-[-0.01em]">{mym ? "Campagnes de messages privés" : "Messages de masse"}</h2>
                          <p className="mt-0.5 text-[12.5px] text-muted">
                            {mym
                              ? `Envoyées depuis Bloom aux fans de ${m.name} : un message privé par fan, l’un après l’autre (environ 3 000 à l’heure). Joignables aujourd’hui : ${int(d.counts.active)} abonnés, ${int(d.counts.old)} anciens, ${int(d.counts.interested)} intéressés.`
                              : `Tous les messages de masse de ${m.name} sur OnlyFans, y compris ceux partis d’OnlyFans ou d’un autre outil (${plural(d.lists.length, "liste")} de fans disponibles).`}
                          </p>
                        </div>
                        {sends.length ? <button type="button" onClick={exportCsv} className="v2-select" title="Télécharger les envois affichés"><Download className="size-4 text-muted" />Exporter</button> : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 px-1 pb-3 md:grid-cols-4">
                        {tile("Envois", int(d.total), mym ? "campagnes lancées depuis Bloom" : "dans l’historique d’OnlyFans")}
                        {tile("Messages partis", int(sum.sent), partial ? `sur les ${int(sends.length)} envois de cette page` : "tous envois réunis")}
                        {tile("Achats", int(sum.bought), sum.sent ? `${(Math.round((sum.bought / sum.sent) * 1000) / 10).toLocaleString("fr-FR")} % des messages partis` : undefined)}
                        {tile("Revenus", cash(sum.revenue, cur, 0), mym ? "nets, vus par Bloom" : "bruts, d’après OnlyFans")}
                      </div>

                      <div className="v2-scroll overflow-x-auto">
                        <table className="w-full min-w-[920px] text-[12.5px]">
                          <thead>
                            <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                              {th("Message")}
                              {th("Destinataires")}
                              {th("État")}
                              {th("Envoyés", true)}
                              {!mym ? th("Vus", true) : null}
                              {th("Achats", true)}
                              {th("Revenus", true)}
                              {th("Date")}
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {sends.map((s) => (
                              <tr key={s.id} onClick={() => setWin({ kind: "send", send: s })} className="cursor-pointer border-b align-top transition-colors hover:bg-white/[0.03]" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                                <td className="px-3 py-2.5">
                                  <span className="flex min-w-0 items-start gap-2.5">
                                    <Thumb s={s} />
                                    <span className="min-w-0">
                                      {s.title ? <b className="block max-w-[300px] truncate text-[13px] leading-tight">{s.title}</b> : null}
                                      <span className={`line-clamp-2 max-w-[320px] break-words ${s.title ? "mt-0.5 text-[12px] text-muted" : "text-[12.5px] leading-snug"}`}>{s.text || (s.medias ? "Média seul, sans texte" : "—")}</span>
                                      <span className="mt-1 flex flex-wrap gap-1">
                                        {s.medias ? <span className="v2-tag">{plural(s.medias, "média")}</span> : null}
                                        <span className="v2-tag" style={s.price || s.smart ? GOOD : undefined}>{s.smart ? `prix intelligent ${s.smart.min}–${s.smart.max} €` : s.price ? priceOf(s.price, cur) : "gratuit"}</span>
                                      </span>
                                    </span>
                                  </span>
                                </td>
                                <td className="px-3 py-2.5"><span className="line-clamp-2 max-w-[230px] leading-snug" title={s.audience}>{s.audience}</span></td>
                                <td className="px-3 py-2.5">
                                  <span className="v2-tag" style={ST[s.status].style}>{ST[s.status].label}</span>
                                  {s.note ? <span className="mt-1 line-clamp-2 block max-w-[170px] text-[11px] leading-snug text-muted" title={s.note}>{s.note}</span> : null}
                                </td>
                                <td className="v2-num px-3 py-2.5 text-right">{s.sent == null || (s.status === "scheduled" && !s.sent) ? <span className="text-muted">—</span> : <><b className="text-[13px]">{int(s.sent)}</b>{s.total != null && s.total !== s.sent ? <span className="block text-[11px] text-muted">sur {int(s.total)}</span> : null}</>}</td>
                                {!mym ? <td className="v2-num px-3 py-2.5 text-right">{s.viewed == null ? <span className="text-muted">—</span> : <>{int(s.viewed)}{s.sent ? <span className="block text-[11px] text-muted">{pct(s.viewed, s.sent)} %</span> : null}</>}</td> : null}
                                <td className="v2-num px-3 py-2.5 text-right">{s.bought ? <>{int(s.bought)}{s.sent ? <span className="block text-[11px] text-muted">{(Math.round((s.bought / s.sent) * 1000) / 10).toLocaleString("fr-FR")} %</span> : null}</> : <span className="text-muted">—</span>}</td>
                                <td className="v2-num px-3 py-2.5 text-right text-[13px] font-bold" style={{ color: s.revenue ? undefined : "var(--color-muted)" }}>{s.revenue ? money(s.revenue) : "—"}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {dayOf(s.at)}<span className="ml-1.5 text-muted">{hourOf(s.at)}</span>
                                  <span className="block text-[11px] text-muted">{s.by ? `par ${s.by}` : mym ? "" : "hors Bloom"}</span>
                                </td>
                                <td className="py-2.5 pr-2 text-right text-muted"><ChevronRight className="inline size-4" aria-label="Voir le détail" /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!sends.length && !d.error ? (
                        <div className="py-12 text-center">
                          <p className="text-[13px] text-muted">{mym ? "Aucune campagne pour l’instant." : "Aucun message de masse pour l’instant."}</p>
                          {canSend ? <button type="button" onClick={() => open({})} className="v2-btn mt-3" style={{ height: 36 }}><SendIcon className="size-4" />Préparer un envoi</button> : null}
                        </div>
                      ) : null}
                      {d.pages > 1 ? (
                        <div className="flex flex-wrap items-center gap-2 px-1 pt-3 text-[12.5px] text-muted">
                          <span className="v2-num flex-1">{int((d.page - 1) * 20 + 1)}–{int(Math.min(d.page * 20, d.total))} sur {int(d.total)}</span>
                          <button type="button" disabled={d.page <= 1 || waiting} onClick={() => goPage(d.page - 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}><ChevronLeft className="size-4" />Plus récents</button>
                          <span className="v2-num">{d.page} / {d.pages}</span>
                          <button type="button" disabled={d.page >= d.pages || waiting} onClick={() => goPage(d.page + 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}>Plus anciens<ChevronRight className="size-4" /></button>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {tab === "ready" ? (
                    <>
                      <div className="flex flex-wrap items-start gap-3 px-1 pt-3.5 pb-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-[16px] font-bold tracking-[-0.01em]">Messages prêts</h2>
                          <p className="mt-0.5 text-[12.5px] text-muted">Des messages écrits à l’avance (texte, médias, prix) pour {m.name}. Un envoi MYM part toujours de l’un d’eux ; en créer ou en modifier un n’envoie rien.</p>
                        </div>
                        {canSend ? <button type="button" onClick={() => setWin({ kind: "ready", msg: null })} className="v2-btn" data-kind="ghost" style={{ height: 36 }}><Plus className="size-4" />Nouveau message prêt</button> : null}
                      </div>
                      <div className="grid gap-3 px-1 sm:grid-cols-2 2xl:grid-cols-3">
                        {d.messages.map((r) => (
                          <div key={r.id} className="flex min-w-0 flex-col rounded-[14px] border p-3.5" style={{ borderColor: "var(--color-line)" }}>
                            <div className="flex items-start gap-2">
                              <b className="min-w-0 flex-1 truncate text-[14px]">{r.title}</b>
                              {canSend ? (
                                <RowMenu
                                  name={`rd-${r.id}`}
                                  items={[
                                    { label: "Modifier", go: () => setWin({ kind: "ready", msg: r }) },
                                    { label: "Supprimer", danger: true, go: () => ask(`Supprimer « ${r.title} » ?`, "Le message prêt disparaît de cette liste. Les envois déjà faits avec lui ne changent pas.", "Supprimer le message", async () => {
                                      await api("POST", "/api/mym/massdm/message/delete", { id: r.id });
                                      toast("Message supprimé");
                                      await load();
                                    }) },
                                  ]}
                                />
                              ) : null}
                            </div>
                            <p className="mt-1.5 line-clamp-3 min-h-[3.4em] text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-muted">{r.text || "Média seul, sans texte."}</p>
                            {r.medias.length ? (
                              <div className="mt-2 flex gap-1">
                                {r.medias.slice(0, 5).map((x) => (
                                  <span key={x.id} className="size-11 overflow-hidden rounded-lg" style={{ background: "var(--color-card-2)" }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {x.thumb ? <img src={x.thumb} alt="" loading="lazy" className="size-full object-cover" /> : null}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              <span className="v2-tag">{r.medias.length ? plural(r.medias.length, "média") : "texte seul"}</span>
                              <span className="v2-tag" style={r.price ? GOOD : undefined}>{r.price ? priceOf(r.price, cur) : "gratuit"}</span>
                              {r.medias.length ? null : <span className="v2-tag">peut être retiré après l’envoi</span>}
                            </div>
                            <span className="flex-1" />
                            <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
                              <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{r.createdBy ? `par ${r.createdBy} · ` : ""}modifié le {dayOf(r.updatedAt)}</span>
                              {canSend ? <button type="button" onClick={() => open({ messageId: r.id })} className="v2-btn" style={{ height: 32, padding: "0 12px", fontSize: 12.5 }}>Préparer l’envoi</button> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                      {!d.messages.length ? (
                        <div className="py-12 text-center">
                          <p className="text-[13px] text-muted">Aucun message prêt pour {m.name}.</p>
                          {canSend ? <button type="button" onClick={() => setWin({ kind: "ready", msg: null })} className="v2-btn mt-3" style={{ height: 36 }}><Plus className="size-4" />Écrire le premier</button> : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {tab === "autos" ? (
                    <>
                      <div className="flex flex-wrap items-start gap-3 px-1 pt-3.5 pb-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-[16px] font-bold tracking-[-0.01em]">Messages automatiques</h2>
                          <p className="mt-0.5 text-[12.5px] text-muted">Des messages privés que Bloom envoie tout seul aux fans de {m.name} quand ils font quelque chose (aujourd’hui : après un achat). Rien ne part tant qu’un message n’est pas activé.</p>
                        </div>
                        {canSend ? <button type="button" onClick={() => setWin({ kind: "auto", auto: null })} className="v2-btn" data-kind="ghost" style={{ height: 36 }}><Plus className="size-4" />Nouveau message automatique</button> : null}
                      </div>
                      <div className="space-y-2 px-1">
                        {d.autos.map((a) => {
                          const st = AUTO_ST[a.status] ?? { label: a.status, style: QUIET };
                          const n = a.collections.reduce((x, c) => x + c.messages.length, 0);
                          const draft = a.status === "scheduled";
                          return (
                            <div key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-[14px] border p-3.5" style={{ borderColor: "var(--color-line)" }}>
                              <span className="v2-ico size-10"><Zap className="size-4" /></span>
                              <div className="min-w-[220px] flex-1">
                                <p className="flex flex-wrap items-center gap-2"><b className="text-[13.5px]">{TRIGGER_NAME[a.trigger] ?? "Déclencheur pas encore pris en charge"}</b><span className="v2-tag" style={st.style}>{st.label}{a.status === "canceled" && a.canceledBy ? ` par ${a.canceledBy}` : ""}</span></p>
                                <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed break-words text-muted">{a.text || "Média seul, sans texte"}</p>
                                <p className="mt-1.5 text-[11.5px] text-muted">{plural(a.collections.length, "variante")} · {plural(n, "message")} · entre {a.delayMin} et {a.delayMax} min après · {a.once ? "une fois par fan" : "à chaque fois"}{a.createdBy ? ` · par ${a.createdBy}` : ""}</p>
                                {a.trigger === "welcome" ? <p className="mt-1.5 text-[11.5px]" style={{ color: "#fbbf24" }}>Ce déclencheur ne peut pas partir côté OnlyFans pour l’instant : Bloom ne reçoit pas la date d’abonnement des fans.</p> : null}
                              </div>
                              <div className="grid grid-cols-4 gap-x-5 text-right">
                                {([["Fans", int(a.fans)], ["Envoyés", int(a.sent)], ["Achats", int(a.purchased)], ["Revenus", cash(Math.round(a.earnings * 100), cur, 0)]] as [string, string][]).map(([l, v]) => <p key={l}><span className="block text-[11px] text-muted">{l}</span><b className="v2-num text-[13.5px]">{v}</b></p>)}
                              </div>
                              {canSend ? (
                                <RowMenu
                                  name={`au-${a.id}`}
                                  items={[
                                    ...(draft ? [{ label: "Modifier", go: () => setWin({ kind: "auto", auto: a }) }] : []),
                                    { label: "Dupliquer", go: () => setWin({ kind: "auto", auto: a, copy: true }) },
                                    ...(a.status === "active" || draft ? [{ label: draft ? "Abandonner" : "Arrêter", danger: true, go: () => ask(draft ? "Abandonner ce brouillon ?" : "Arrêter ce message automatique ?", draft ? "Le brouillon est mis de côté (il reste visible comme « Arrêté »)." : "Plus aucun message ne partira, y compris les suites prévues pour les fans déjà concernés. Les messages déjà partis restent.", draft ? "Abandonner" : "Arrêter", async () => {
                                      await api("POST", "/api/smart/auto/cancel", { id: a.id });
                                      toast(draft ? "Brouillon abandonné" : "Message automatique arrêté");
                                      await load();
                                    }) }] : []),
                                  ]}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      {!d.autos.length ? (
                        <div className="py-12 text-center">
                          <p className="text-[13px] text-muted">Aucun message automatique pour {m.name}.</p>
                          {canSend ? <button type="button" onClick={() => setWin({ kind: "auto", auto: null })} className="v2-btn mt-3" style={{ height: 36 }}><Plus className="size-4" />Créer le premier</button> : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      )}

      {win?.kind === "send" && m ? <SendDetail s={win.send} mym={mym} cur={cur} model={m.name} canSend={canSend} onClose={() => setWin(null)} onAgain={() => again(win.send)} onStop={() => stop(win.send)} onUnsend={() => unsend(win.send)} onWithdraw={(unreadOnly) => withdraw(win.send, unreadOnly)} /> : null}
      {win?.kind === "ready" && m ? <ReadyForm creatorId={mid} msg={win.msg} onClose={() => setWin(null)} onSaved={(id, prepare) => (setWin(null), void load().then(() => void (prepare && open({ messageId: id }))))} /> : null}
      {win?.kind === "auto" && m ? <AutoForm creatorId={mid} auto={win.auto} copy={win.copy} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : null}
      {win?.kind === "confirm" ? <Confirm title={win.title} text={win.text} button={win.button} go={win.go} onClose={() => setWin(null)} /> : null}
    </div>
  );
}

/** Le détail d'un envoi : le message, à qui, ce qu'il a donné, et les actions possibles (toutes confirmées ensuite). */
function SendDetail({ s, mym, cur, model, canSend, onClose, onAgain, onStop, onUnsend, onWithdraw }: {
  s: Send; mym: boolean; cur: string; model: string; canSend: boolean; onClose: () => void; onAgain: () => void; onStop: () => void; onUnsend: () => void; onWithdraw: (unreadOnly: boolean) => void;
}) {
  const [trace, setTrace] = useState<Trace[] | null>(null);
  useEffect(() => {
    if (!mym) return;
    let off = false;
    api<{ sends: Trace[] }>("GET", `/api/mym/massdm/campaign?id=${encodeURIComponent(s.id)}`)
      .then((r) => void (!off && setTrace(r.sends)))
      .catch(() => void (!off && setTrace([])));
    return () => {
      off = true;
    };
  }, [mym, s.id]);
  const money = (cents: number) => cash(cents, cur, cents % 100 ? 2 : 0);
  const line = (label: string, value: React.ReactNode) => <p className="flex items-baseline justify-between gap-3 border-b py-1.5 text-[12.5px]" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}><span className="text-muted">{label}</span><b className="v2-num text-right">{value}</b></p>;
  const o = s.opts;
  const extras = [
    s.smart ? `Prix intelligent : chaque fan reçoit un prix entre ${s.smart.min} et ${s.smart.max} €, selon ses achats passés.` : "",
    o.removeAfterH ? `Retrait automatique s’il n’est pas lu après ${o.removeAfterH} h${s.removeAt ? ` (le ${whenOf(s.removeAt)})` : ""}.` : "",
    o.challenge ? `Challenge : si le fan répond « ${o.challenge.keywords.join(" » ou « ")} » dans les ${o.challenge.windowH} h${o.challenge.buyersOnly ? " et qu’il a acheté" : ""}, un second message lui part.` : "",
    !mym && s.onlineOnly ? "Envoyé seulement aux fans en ligne à ce moment-là." : "",
  ].filter(Boolean);
  return (
    <Modal title={s.title || (mym ? "Campagne" : "Message de masse")} sub={`${model} · ${s.status === "scheduled" ? "prévu le" : "le"} ${whenOf(s.at)}${s.by ? ` · par ${s.by}` : mym ? "" : " · créé hors de Bloom (OnlyFans ou un autre outil)"}`} width={900} onClose={onClose}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="rounded-[14px] rounded-bl-[4px] p-3" style={{ background: "rgb(59 130 246 / 0.16)" }}>
            {s.thumbs.some((x) => x.thumb) ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {s.thumbs.filter((x) => x.thumb).map((x) => <Thumb key={x.id} s={{ thumbs: [x], medias: 1 }} size="size-14" />)}
                {s.medias > s.thumbs.length ? <span className="grid size-14 place-items-center rounded-lg text-[11.5px] text-muted" style={{ background: "rgb(0 0 0 / 0.35)" }}>+{s.medias - s.thumbs.length}</span> : null}
              </div>
            ) : null}
            <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">{s.text || <span className="text-muted">Média seul, sans texte.</span>}</p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              <span className="v2-tag" style={{ background: "rgb(0 0 0 / 0.3)" }}>{s.medias ? plural(s.medias, "média") : "texte seul"}</span>
              <span className="v2-tag" style={s.price || s.smart ? GOOD : { background: "rgb(0 0 0 / 0.3)" }}>{s.smart ? `prix intelligent ${s.smart.min}–${s.smart.max} €` : s.price ? priceOf(s.price, cur) : "gratuit"}</span>
            </p>
          </div>
          <p className="v2-label mt-4">Destinataires</p>
          <p className="text-[13px] leading-relaxed">{s.audience}</p>
          {extras.length ? <ul className="mt-3 space-y-1 text-[12.5px] leading-relaxed text-muted">{extras.map((x) => <li key={x}>{x}</li>)}</ul> : null}
        </div>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2"><span className="v2-tag" style={ST[s.status].style}>{ST[s.status].label}</span>{s.note ? <span className="text-[11.5px] text-muted">{s.note}</span> : null}</p>
          <div className="mt-2">
            {line("Fans visés", s.total == null || (!s.total && s.status === "scheduled") ? "—" : int(s.total))}
            {line("Messages partis", s.sent == null ? "—" : int(s.sent))}
            {!mym ? line("Vus", s.viewed == null ? "—" : `${int(s.viewed)}${s.sent ? ` · ${pct(s.viewed, s.sent)} %` : ""}`) : null}
            {line("Achats", s.bought ? int(s.bought) : "aucun")}
            {line(mym ? "Revenus (nets)" : "Revenus (bruts)", s.revenue ? money(s.revenue) : "—")}
            {mym && s.pending ? line("En attente", int(s.pending)) : null}
            {mym && s.failed ? line("Échecs", int(s.failed)) : null}
            {mym && s.skipped ? line("Laissés de côté", int(s.skipped)) : null}
            {mym && s.removed ? line("Retirés ensuite", int(s.removed)) : null}
          </div>
        </div>
      </div>

      {mym ? (
        <>
          <p className="v2-label mt-5">Fan par fan{trace && trace.length >= 300 ? " (les 300 derniers)" : ""}</p>
          <div className="v2-scroll max-h-[230px] overflow-y-auto rounded-[10px] border" style={{ borderColor: "var(--color-line)" }}>
            {trace === null ? <p className="px-3 py-4 text-center text-[12.5px] text-muted">Chargement…</p> : null}
            {trace && !trace.length ? <p className="px-3 py-4 text-center text-[12.5px] text-muted">{s.status === "scheduled" ? "Les destinataires sont choisis au moment du départ." : "Aucun message pour l’instant."}</p> : null}
            {(trace ?? []).map((t) => (
              <p key={t.fanId} className="flex items-center gap-3 border-b px-3 py-1.5 text-[12px] last:border-b-0" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                <span className="min-w-0 flex-1 truncate">{t.fan || "Fan"}{t.error ? <span className="ml-2 text-muted">{t.error}</span> : null}{t.rewardAt ? <span className="ml-2" style={{ color: "var(--v2-sky)" }}>récompense envoyée</span> : null}</span>
                {t.price ? <span className="v2-num shrink-0 text-muted">{priceOf(t.price, cur)}</span> : null}
                <span className="w-[92px] shrink-0 text-right" style={{ color: t.status === "failed" ? "var(--v2-down)" : t.status === "sent" ? "var(--v2-up)" : "var(--color-muted)" }}>{TRACE[t.status] ?? t.status}</span>
                <span className="v2-num w-[42px] shrink-0 text-right text-muted">{t.status === "pending" ? "" : hourOf(t.at)}</span>
              </p>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Fermer</button>
        {canSend ? <button type="button" onClick={onAgain} className="v2-btn" data-kind="ghost">{mym ? "Renvoyer ce message" : "Refaire cet envoi"}</button> : null}
        {canSend && s.canWithdraw ? <button type="button" onClick={() => onWithdraw(true)} className="v2-btn" data-kind="ghost">Retirer chez ceux qui ne l’ont pas lu</button> : null}
        {canSend && s.canWithdraw ? <button type="button" onClick={() => onWithdraw(false)} className="v2-btn" data-kind="danger">Retirer chez tous</button> : null}
        {canSend && s.canUnsend ? <button type="button" onClick={onUnsend} className="v2-btn" data-kind="danger">Retirer chez les fans</button> : null}
        {canSend && s.canStop ? <button type="button" onClick={onStop} className="v2-btn" data-kind="danger">Arrêter l’envoi</button> : null}
      </div>
    </Modal>
  );
}
