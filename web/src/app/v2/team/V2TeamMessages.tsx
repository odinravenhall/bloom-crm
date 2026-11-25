"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CornerDownRight, Download, MessageCircle, MessagesSquare, Search, Undo2, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { getPf, type Pf } from "@/lib/platform";
import { cash, Confirm, downloadCsv, fmtDuration, int, paris, PeriodBar, usePeriod } from "../kit";
import { errText, plural, useDebounced } from "../media/MediaKit";
import { dateOf, ModelMenu, ThreadModal, timeOf, WhoTag, type TeamModel, type Who } from "./TeamKit";

// Bloom v2 → Équipe → Messages : le MÊME écran pour OnlyFans et MYM (25/11/2026, « Constellation »). Il remplace, dans la
// v2, les deux « Message Dashboard » (copie d'Infloww et copie de MyPulse). Tous les messages envoyés aux fans, message
// par message : qui, sur quelle modèle, à quel fan, en combien de temps après lui, contenu payant acheté ou non ; et le
// résumé par auteur. Lecture : `GET /api/v2/team/messages` (app/v2team.mjs, d'après `msg_log`).
// Une seule action : retirer un message chez le fan côté OnlyFans (« POST /api/sent/delete », derrière une confirmation).
type Row = { id: string; at: number; cid: string; model: string; fid: string | null; fan: string; text: string | null; medias: number; price: number; paid: boolean | null; who: Who; replyMs: number | null; replyTo: string | null; deleted: boolean; script: boolean };
type Sender = Who & { messages: number; fans: number; proposed: number; bought: number; boughtAmount: number; free: number; slow: number; replyMs: number | null };
type Data = {
  platform: Pf; currency: string; from: string; to: string; today: string; rows: Row[]; total: number; page: number; pages: number; size: number;
  kpi: { messages: number; fans: number; proposed: number; bought: number; boughtAmount: number; free: number; slow: number; replyMs: number | null };
  senders: Sender[]; since: number | null; fan: { key: string; name: string } | null; all: TeamModel[];
};

const TYPES: [string, string][] = [["", "Tous les messages"], ["paid", "Contenus payants"], ["bought", "Payants achetés"], ["unbought", "Payants pas achetés"], ["free", "Médias offerts"], ["script", "Partis d’un script"], ["slow", "Réponses lentes (plus de 10 min)"], ["unsent", "Retirés chez le fan"]];
const SORTS: [string, string][] = [["", "Les plus récents"], ["slow", "Réponse la plus lente"], ["price", "Prix le plus élevé"]];
const SLOW = 10 * 60_000;
const DAY = 864e5;
const rate = (a: number, b: number) => (b > 0 ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("fr-FR")} %` : "—");
const TYPE_NAME: Record<Who["type"], string> = { human: "Chatteur", platform: "Chatteur (Infloww)", ai: "IA Substy", ext: "Hors Bloom", auto: "Automatique", creator: "Compte de la modèle", none: "" };

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2TeamMessages({ pf }: { pf: Pf }) {
  const period = usePeriod();
  const { from, to } = period;
  const [model, setModel] = useState("");
  const [tab, setTab] = useState<"list" | "by">("list");
  const [sender, setSender] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 400);
  const [fan, setFan] = useState("");
  const [sort, setSort] = useState("");
  const [size, setSize] = useState(50);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const [thread, setThread] = useState<string | null>(null);
  const [gone, setGone] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `pf=${pf}&from=${from}&to=${to}${model ? `&creatorId=${encodeURIComponent(model)}` : ""}${sender ? `&sender=${encodeURIComponent(sender)}` : ""}${type ? `&type=${type}` : ""}${dq ? `&q=${encodeURIComponent(dq)}` : ""}${fan ? `&fan=${encodeURIComponent(fan)}` : ""}${sort ? `&sort=${sort}` : ""}`;
  const query = `${base}&size=${size}&page=${page}`;
  const seq = useRef(0);
  const load = () => {
    const id = ++seq.current;
    return api<Data>("GET", `/api/v2/team/messages?${query}`)
      .then((d) => void (id === seq.current && (setData({ key: query, d }), setErr(""))))
      .catch((e) => void (id === seq.current && setErr(errText(e))));
  };
  useEffect(() => {
    void load();
    // Première page d'une période qui contient aujourd'hui : les nouveaux messages arrivent tout seuls.
    const t = page === 1 && to >= paris() ? setInterval(() => document.visibilityState === "visible" && void load(), 30_000) : null;
    return () => {
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => setPage(1), [base, size]);

  const d = data?.d ?? null;
  const stale = !!data && data.key !== query;
  const mym = pf === "mym";
  const pfName = mym ? "MYM" : "OnlyFans";
  const cur = d?.currency ?? (mym ? "EUR" : "USD");
  const price = (p: number) => cash(Math.round(p * 100), cur, p % 1 ? 2 : 0);
  const k = d?.kpi ?? null;
  const chatOk = pf === getPf();
  const filtered = !!(sender || type || dq || fan);
  const reset = () => (setSender(""), setType(""), setQ(""), setFan(""), setSort(""));
  // OnlyFans ne laisse retirer un message que pendant 24 heures.
  const canUnsend = (r: Row) => !mym && !r.deleted && Date.now() - r.at < DAY;
  const exportAll = async () => {
    if (!d) return;
    setBusy(true);
    try {
      const out: Row[] = [];
      for (let p = 1; p <= 25; p++) {
        const r = await api<Data>("GET", `/api/v2/team/messages?${base}&size=200&page=${p}`);
        out.push(...r.rows);
        if (p >= r.pages) break;
      }
      downloadCsv(
        `bloom-messages-${mym ? "mym" : "onlyfans"}-${d.from}_${d.to}.csv`,
        ["Date", "Heure", "Auteur", "Type d’auteur", "Modèle", "Fan", "Message du fan", "Message", "Médias", `Prix (${cur})`, "Acheté", "Temps de réponse (s)", "Script", "Retiré"],
        out.map((r) => [new Date(r.at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }), timeOf(r.at), r.who.name, TYPE_NAME[r.who.type], r.model, r.fan, r.replyTo ?? "", r.text ?? "", String(r.medias), r.price ? String(r.price).replace(".", ",") : "", r.paid == null ? "" : r.paid ? "oui" : "non", r.replyMs == null ? "" : String(Math.round(r.replyMs / 1000)), r.script ? "oui" : "", r.deleted ? "oui" : ""]),
      );
      if (d.total > out.length) toast(`Export limité aux ${int(out.length)} messages les plus récents`);
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  const tile = (label: string, value: React.ReactNode, sub?: React.ReactNode, i = 0) => (
    <div className="v2-card v2-rise min-w-0 p-3.5" style={{ ["--i" as string]: i + 2 }}>
      <p className="truncate text-[12px] text-muted">{label}</p>
      <p className="v2-num mt-1 truncate text-[20px] leading-tight font-bold">{k ? value : <span className="text-muted">…</span>}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{k ? sub ?? "\u00a0" : "\u00a0"}</p>
    </div>
  );
  const th = (label: string, right = false) => <th className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>{label}</th>;
  const field = "v2-field";

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Équipe · {pfName}</p>
          <h1 className="v2-h1 mt-1">Messages de l’équipe</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {d ? <ModelMenu all={d.all} value={model} onChange={setModel} /> : null}
          <button type="button" onClick={() => void exportAll()} disabled={!d?.total || busy} className="v2-select" title="Télécharger les messages de cette sélection (fichier pour Excel)"><Download className="size-4 text-muted" />{busy ? "Préparation…" : "Exporter"}</button>
        </div>
      </div>
      <PeriodBar period={period} />
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {tile(filtered ? "Messages (sélection)" : "Messages envoyés", k ? int(k.messages) : null, k ? `à ${plural(k.fans, "fan")}` : null, 0)}
        {tile("Temps de réponse", k ? (k.replyMs == null ? "—" : fmtDuration(k.replyMs)) : null, k ? (k.slow ? `${plural(k.slow, "réponse lente", "réponses lentes")} (plus de 10 min)` : "aucune réponse lente") : null, 1)}
        {tile("Contenus payants proposés", k ? int(k.proposed) : null, k?.messages ? `${rate(k.proposed, k.messages)} des messages` : null, 2)}
        {tile("Achetés", k ? int(k.bought) : null, k?.proposed ? `${rate(k.bought, k.proposed)} des contenus proposés` : null, 3)}
        {tile("Vendu en message", k ? cash(k.boughtAmount, cur, 0) : null, k?.bought ? `${cash(Math.round(k.boughtAmount / k.bought), cur)} par achat` : null, 4)}
        {tile("Médias offerts", k ? int(k.free) : null, "envoyés sans prix", 5)}
      </div>

      <section className="v2-card v2-rise mt-3 p-3" style={{ ["--i" as string]: 8 }}>
        <div className="v2-noscroll overflow-x-auto border-b px-1" style={{ borderColor: "var(--color-line)" }}>
          <div className="v2-tabs">
            <button type="button" className="v2-tab" data-on={tab === "list"} onClick={() => setTab("list")}>Tous les messages<span className="v2-num ml-1.5 opacity-60">{d ? int(d.total) : ""}</span></button>
            <button type="button" className="v2-tab" data-on={tab === "by"} onClick={() => setTab("by")}>Par auteur<span className="v2-num ml-1.5 opacity-60">{d ? int(d.senders.length) : ""}</span></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-1 pt-3">
          <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}>
            <Search className="size-3.5 shrink-0 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans le texte des messages" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" />
            {q ? <button type="button" onClick={() => setQ("")} aria-label="Effacer la recherche" className="text-muted hover:text-(--color-fg)"><X className="size-3.5" /></button> : null}
          </label>
          <div className="w-[210px]">
            <select value={sender} onChange={(e) => setSender(e.target.value)} aria-label="Auteur" className={field} style={{ height: 36, colorScheme: "dark", fontSize: 12.5 }}>
              <option value="" style={{ background: "#121215" }}>Tous les auteurs</option>
              <option value="humans" style={{ background: "#121215" }}>Toute l’équipe (personnes)</option>
              {(d?.senders ?? []).map((s) => <option key={s.key} value={s.key} style={{ background: "#121215" }}>{s.name} ({int(s.messages)})</option>)}
              {sender && sender !== "humans" && !d?.senders.some((s) => s.key === sender) ? <option value={sender} style={{ background: "#121215" }}>{sender.replace(/^n:/, "")}</option> : null}
            </select>
          </div>
          <div className="w-[230px]"><select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type de message" className={field} style={{ height: 36, colorScheme: "dark", fontSize: 12.5 }}>{TYPES.map(([v, l]) => <option key={v} value={v} style={{ background: "#121215" }}>{l}</option>)}</select></div>
          {tab === "list" ? <div className="w-[180px]"><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordre" className={field} style={{ height: 36, colorScheme: "dark", fontSize: 12.5 }}>{SORTS.map(([v, l]) => <option key={v} value={v} style={{ background: "#121215" }}>{l}</option>)}</select></div> : null}
          {filtered || sort ? <button type="button" onClick={reset} className="v2-tool">Tout afficher</button> : null}
        </div>
        {d?.fan ? <p className="mt-2 px-1 text-[12.5px]"><span className="v2-seg border" data-on="true" style={{ borderColor: "var(--color-line)" }}>Fan : {d.fan.name}<button type="button" onClick={() => setFan("")} aria-label="Ne plus filtrer sur ce fan" className="ml-1"><X className="size-3" /></button></span></p> : null}

        <div style={{ opacity: stale ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
          {tab === "list" ? (
            <>
              <div className="v2-scroll mt-3 overflow-x-auto" hidden={!d?.rows.length}>
                <table className="w-full min-w-[1040px] text-[12.5px]">
                  <thead>
                    <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                      {th("Auteur")}
                      {th("Modèle")}
                      {th("Message")}
                      {th("Fan")}
                      {th("Prix", true)}
                      {th("Réponse", true)}
                      {th("Envoyé")}
                      <th className="w-[96px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {(d?.rows ?? []).map((r) => (
                      <tr key={r.id} className="border-b align-top" style={{ borderColor: "rgb(255 255 255 / 0.05)", opacity: r.deleted ? 0.6 : 1 }}>
                        <td className="max-w-[190px] px-3 py-2.5 text-[13px]"><WhoTag w={r.who} pf={pf} strong /></td>
                        <td className="max-w-[140px] truncate px-3 py-2.5">{r.model}</td>
                        <td className="px-3 py-2.5">
                          {r.replyTo ? <span className="mb-0.5 flex max-w-[440px] items-center gap-1 text-[11.5px] text-muted" title="Le message du fan auquel celui-ci répond"><CornerDownRight className="size-3 shrink-0" /><span className="truncate">{r.replyTo}</span></span> : null}
                          <span className="line-clamp-3 max-w-[440px] leading-snug break-words whitespace-pre-wrap" style={r.deleted ? { textDecoration: "line-through" } : undefined}>{r.text || (r.medias ? `[${r.medias} média${r.medias > 1 ? "s" : ""}]` : <i className="text-muted">sans texte</i>)}</span>
                          {(r.medias && r.text) || r.script || r.deleted ? (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {r.medias && r.text ? <span className="v2-tag">{plural(r.medias, "média")}</span> : null}
                              {r.script ? <span className="v2-tag" title="Message parti d’un script">script</span> : null}
                              {r.deleted ? <span className="v2-tag" style={{ color: "var(--v2-down)", background: "rgb(244 63 94 / 0.12)" }}>retiré</span> : null}
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[150px] px-3 py-2.5">{r.fid ? <button type="button" onClick={() => setFan(`${r.cid}~${r.fid}`)} title="Ne voir que les messages envoyés à ce fan" className="block max-w-[140px] truncate text-left underline-offset-2 hover:underline">{r.fan}</button> : r.fan}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap">{r.price ? <><b className="text-[13px]">{price(r.price)}</b><span className="block text-[11px]" style={{ color: r.paid ? "var(--v2-up)" : "var(--color-muted)" }}>{r.paid ? "acheté" : "pas acheté"}</span></> : r.medias ? <span className="text-muted">offert</span> : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap" style={r.replyMs != null && r.replyMs >= SLOW ? { color: "#fbbf24" } : undefined} title={r.replyMs == null ? "Pas une réponse (le fan n’attendait rien)" : "Temps entre le premier message du fan resté sans réponse et ce message"}>{r.replyMs == null ? <span className="text-muted">—</span> : fmtDuration(r.replyMs)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{timeOf(r.at)}<span className="block text-[11px] text-muted">{dateOf(r.at)}</span></td>
                        <td className="py-2 pr-2 text-right whitespace-nowrap">
                          {r.fid ? <button type="button" onClick={() => setThread(`id=${encodeURIComponent(r.id)}`)} title="Voir la conversation autour de ce message" aria-label="Voir la conversation autour de ce message" className="inline-grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><MessagesSquare className="size-4" /></button> : null}
                          {chatOk && r.fid ? <a href={`/v2/messagerie?c=${encodeURIComponent(`${r.cid}~${r.fid}`)}`} title="Ouvrir la conversation dans la messagerie" aria-label="Ouvrir la conversation dans la messagerie" className="inline-grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><MessageCircle className="size-4" /></a> : null}
                          {canUnsend(r) ? <button type="button" onClick={() => setGone(r)} title="Retirer ce message chez le fan" aria-label="Retirer ce message chez le fan" className="inline-grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--v2-down)"><Undo2 className="size-4" /></button> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d && !d.rows.length ? <p className="py-12 text-center text-[13px] text-muted">{filtered ? "Aucun message ne correspond." : "Aucun message noté sur cette période."}</p> : null}
              {d && d.total > d.size ? (
                <div className="flex flex-wrap items-center gap-2 px-1 pt-3 text-[12.5px] text-muted">
                  <span className="v2-num flex-1">{int((d.page - 1) * d.size + 1)}–{int(Math.min(d.page * d.size, d.total))} sur {int(d.total)}</span>
                  <div className="w-[130px]"><select value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Messages par page" className={field} style={{ height: 32, colorScheme: "dark", fontSize: 12 }}>{[25, 50, 100, 200].map((n) => <option key={n} value={n} style={{ background: "#121215" }}>{n} par page</option>)}</select></div>
                  <button type="button" disabled={d.page <= 1} onClick={() => setPage(d.page - 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}><ChevronLeft className="size-4" />Précédents</button>
                  <span className="v2-num">{int(d.page)} / {int(d.pages)}</span>
                  <button type="button" disabled={d.page >= d.pages} onClick={() => setPage(d.page + 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}>Suivants<ChevronRight className="size-4" /></button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="v2-scroll mt-3 overflow-x-auto" hidden={!d?.senders.length}>
                <table className="w-full min-w-[900px] text-[12.5px]">
                  <thead>
                    <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                      {th("Auteur")}
                      {th("Messages", true)}
                      {th("Fans", true)}
                      {th("Payants proposés", true)}
                      {th("Achetés", true)}
                      {th("Taux d’achat", true)}
                      {th("Vendu", true)}
                      {th("Médias offerts", true)}
                      {th("Réponses lentes", true)}
                      {th("Temps de réponse", true)}
                    </tr>
                  </thead>
                  <tbody>
                    {(d?.senders ?? []).map((s) => (
                      <tr key={s.key} onClick={() => (setSender(s.key), setTab("list"))} title="Voir ses messages" className="cursor-pointer border-b transition-colors hover:bg-white/[0.03]" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                        <td className="max-w-[240px] px-3 py-2.5 text-[13px]"><WhoTag w={s} pf={pf} strong /></td>
                        <td className="v2-num px-3 py-2.5 text-right text-[13px] font-bold">{int(s.messages)}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{int(s.fans)}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.proposed ? <>{int(s.proposed)}<span className="ml-1.5 text-muted">{rate(s.proposed, s.messages)}</span></> : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.proposed ? int(s.bought) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.proposed ? rate(s.bought, s.proposed) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap">{s.boughtAmount ? cash(s.boughtAmount, cur, s.boughtAmount % 100 ? 2 : 0) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.free ? int(s.free) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right" style={s.slow ? { color: "#fbbf24" } : undefined}>{s.slow ? int(s.slow) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap">{s.replyMs == null ? <span className="text-muted">—</span> : fmtDuration(s.replyMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d && !d.senders.length ? <p className="py-12 text-center text-[13px] text-muted">Aucun message noté sur cette période.</p> : null}
            </>
          )}
        </div>
        <p className="mt-3 border-t px-1 pt-2.5 text-[11.5px] leading-relaxed text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
          Tous les messages envoyés aux fans que Bloom a vus passer, écrits depuis Bloom ou non{d?.since ? ` (notés depuis le ${dateOf(d.since, true)}, gardés 120 jours)` : ""}. Bloom connaît le nom d’un chatteur seulement quand il écrit depuis Bloom.
          {mym ? " Côté MYM, « Hors Bloom » est une déduction (fan dont l’IA est active) : MYM ne dit pas qui a écrit." : " Côté OnlyFans, ce qui est écrit sur OnlyFans ou depuis un autre outil est rangé sous « Compte OnlyFans »."} Temps de réponse : du premier message du fan resté sans réponse jusqu’au message ; la moyenne ne compte que les réponses données en moins de 30 minutes. Heures de Paris.
        </p>
      </section>

      {thread ? <ThreadModal query={thread} onClose={() => setThread(null)} /> : null}
      {gone ? (
        <Confirm
          title="Retirer ce message chez le fan ?"
          text={`Le message envoyé à ${gone.fan} disparaît de sa conversation sur OnlyFans. C’est définitif : il ne peut pas être remis. OnlyFans ne le permet que pendant les 24 heures qui suivent l’envoi.`}
          button="Retirer le message"
          go={async () => {
            await api("POST", "/api/sent/delete", { id: gone.id });
            toast("Message retiré chez le fan");
            await load();
          }}
          onClose={() => setGone(null)}
        />
      ) : null}
    </div>
  );
}
