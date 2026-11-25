"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, MessagesSquare, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { Bars, CAT_COLOR, cash, Count, Delta, Donut, downloadCsv, fmtDay, fmtDuration, int, Lines, Modal, PALETTE, paris, pct, PeriodBar, Spark, usePeriod, type BarPt, type Serie, type Slice } from "../kit";
import { errText, plural } from "../media/MediaKit";
import { dateOf, ModelMenu, ThreadModal, timeOf, WHO_COLOR, WhoTag, type TeamModel, type Who } from "./TeamKit";

// Bloom v2 → Équipe → Ventes : le MÊME écran pour OnlyFans et MYM (25/11/2026, « Constellation »). Il remplace, dans la
// v2, la copie de MyPulse (Ventes équipe) et celle d'Infloww (Employee reports). Qui a vendu quoi sur la période :
// classement, efficacité (messages, contenus proposés et achetés, temps de réponse), ventes par jour, détail des ventes.
// Chiffres : `GET /api/v2/team/sales` (app/v2team.mjs) — les mêmes ventes que l'écran Chiffres, en centimes, limitées à
// ce qu'un chatteur vend (contenus payants envoyés en message et pourboires).
type Seller = Who & {
  rank: number | null; prevRank: number | null; total: number; prev: number; sales: number; prevSales: number; ppv: number; ppvN: number; tips: number; tipsN: number; best: number; buyers: number;
  models: { id: string; name: string; total: number }[]; daily: number[]; messages: number; proposed: number; bought: number; fans: number; replyMs: number | null;
};
type SaleRow = { id: string; at: number; cid: string; model: string; fan: string; fid: string | null; cat: string; v: number; wait: boolean; seller: Who; mid: string | null };
type Cat = { key: string; label: string; total: number; n: number; prev: number; prevN: number };
type Data = {
  platform: Pf; currency: string; mode: "net" | "gross"; canGross: boolean; from: string; to: string; today: string; days: string[];
  total: number; prev: number; sales: number; prevSales: number; provisional: number; cats: Cat[]; sellers: Seller[]; unmapped: string[];
  rows: SaleRow[]; rowsTotal: number; attributedSince: number | null; msgSince: number | null; all: TeamModel[];
};
type SortKey = "total" | "sales" | "ppv" | "tips" | "buyers" | "basket" | "prev" | "name" | "messages" | "proposed" | "bought" | "rate" | "golden" | "fans" | "cvr" | "reply";

// Les familles de vendeurs (graphique par jour, anneau « Qui a vendu »).
const GROUPS: { key: string; types: Who["type"][]; color: string; label: (mym: boolean) => string }[] = [
  { key: "team", types: ["human", "platform"], color: WHO_COLOR.human, label: () => "Chatteurs" },
  { key: "ai", types: ["ai", "ext"], color: WHO_COLOR.ai, label: (mym) => (mym ? "Hors Bloom (IA ou autre outil)" : "IA Substy") },
  { key: "auto", types: ["auto"], color: WHO_COLOR.auto, label: () => "Envois automatiques" },
  { key: "none", types: ["creator", "none"], color: WHO_COLOR.creator, label: (mym) => (mym ? "Compte MYM et non attribué" : "Sans chatteur") },
];
const TYPE_NAME: Record<Who["type"], string> = { human: "Chatteur (Bloom)", platform: "Chatteur (Infloww)", ai: "IA Substy", ext: "Hors Bloom", auto: "Automatique", creator: "Compte de la modèle", none: "Non attribué" };
const VAL: Record<SortKey, (s: Seller) => number | string> = {
  total: (s) => s.total, sales: (s) => s.sales, ppv: (s) => s.ppv, tips: (s) => s.tips, buyers: (s) => s.buyers, basket: (s) => (s.sales ? s.total / s.sales : 0), prev: (s) => s.prev, name: (s) => s.name.toLowerCase(),
  messages: (s) => s.messages, proposed: (s) => s.proposed, bought: (s) => s.bought, rate: (s) => (s.proposed ? s.bought / s.proposed : -1), golden: (s) => (s.messages ? s.proposed / s.messages : -1),
  fans: (s) => s.fans, cvr: (s) => (s.fans ? s.buyers / s.fans : -1), reply: (s) => s.replyMs ?? Number.MAX_SAFE_INTEGER,
};
const UP: SortKey[] = ["name", "reply"]; // triés du plus petit au plus grand par défaut
const PER = 25;
const share = (a: number, b: number) => (b > 0 ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("fr-FR")} %` : "—");

/** Regroupe des jours en points de graphique : un par jour, ou un par mois au-delà de 62 jours. */
function bucketsOf(days: string[]) {
  if (days.length <= 62) return { idx: days.map((_, i) => i), pts: days.map((d) => ({ key: d, label: fmtDay(d, { day: "2-digit" }), title: fmtDay(d, { weekday: "long", day: "numeric", month: "long" }) })), unit: "jour" };
  const pts: { key: string; label: string; title: string }[] = [];
  const idx = days.map((d) => {
    const m = d.slice(0, 7);
    if (pts[pts.length - 1]?.key !== m) pts.push({ key: m, label: fmtDay(m + "-01", { month: "short" }), title: fmtDay(m + "-01", { month: "long", year: "numeric" }) });
    return pts.length - 1;
  });
  return { idx, pts, unit: "mois" };
}
const fold = (daily: number[], idx: number[], n: number) => {
  const out = new Array<number>(n).fill(0);
  daily.forEach((v, i) => (out[idx[i]] += v));
  return out;
};

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2TeamSales({ pf }: { pf: Pf }) {
  const period = usePeriod();
  const { from, to } = period;
  const [model, setModel] = useState("");
  const [gross, setGross] = useState(false);
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const [chart, setChart] = useState<"groups" | "compare">("groups");
  const [cmp, setCmp] = useState<string[] | null>(null);
  const [view, setView] = useState<"sales" | "work">("sales");
  const [teamOnly, setTeamOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; rev: boolean }>({ key: "total", rev: false });
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [jq, setJq] = useState("");
  const [jCat, setJCat] = useState("");
  const [jWho, setJWho] = useState("");
  const [jPage, setJPage] = useState(1);
  const query = `pf=${pf}&from=${from}&to=${to}${model ? `&creatorId=${encodeURIComponent(model)}` : ""}${gross ? "&mode=gross" : ""}`;
  useEffect(() => {
    let stop = false;
    const load = () =>
      api<Data>("GET", `/api/v2/team/sales?${query}`)
        .then((d) => void (!stop && (setData({ key: query, d }), setErr(""))))
        .catch((e) => void (!stop && setErr(errText(e))));
    void load();
    // La période contient aujourd'hui : les chiffres se rafraîchissent tout seuls.
    const t = to >= paris() ? setInterval(() => document.visibilityState === "visible" && void load(), period.len > 62 ? 300_000 : 60_000) : null;
    return () => {
      stop = true;
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => setJPage(1), [jq, jCat, jWho, query]);

  const d = data?.d ?? null;
  const busy = !!data && data.key !== query;
  const mym = pf === "mym";
  const pfName = mym ? "MYM" : "OnlyFans";
  const cur = d?.currency ?? (mym ? "EUR" : "USD");
  const fmt = (v: number, digits = 2) => cash(v, cur, digits);
  const money = (v: number) => cash(v, cur, v % 100 ? 2 : 0);
  const catName = (k: string) => d?.cats.find((c) => c.key === k)?.label ?? k;

  const v = useMemo(() => {
    if (!d) return null;
    const b = bucketsOf(d.days);
    const n = b.pts.length;
    const groups = GROUPS.map((g) => {
      const list = d.sellers.filter((s) => g.types.includes(s.type));
      const daily = new Array<number>(d.days.length).fill(0);
      for (const s of list) s.daily.forEach((x, i) => (daily[i] += x));
      return { ...g, name: g.label(d.platform === "mym"), total: list.reduce((a, s) => a + s.total, 0), sales: list.reduce((a, s) => a + s.sales, 0), series: fold(daily, b.idx, n), daily };
    });
    const totalDaily = d.days.map((_, i) => groups.reduce((a, g) => a + g.daily[i], 0));
    let acc = 0;
    return { ...b, groups, totalDaily, cumul: totalDaily.map((x) => (acc += x)), sold: d.sellers.filter((s) => s.total > 0), max: Math.max(1, ...d.sellers.map((s) => s.total)) };
  }, [d]);

  const sellers = useMemo(() => {
    if (!d) return [];
    const list = d.sellers.filter((s) => !teamOnly || s.type === "human" || s.type === "platform");
    const f = VAL[sort.key];
    const dir = (UP.includes(sort.key) ? 1 : -1) * (sort.rev ? -1 : 1);
    return [...list].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      return (typeof x === "string" ? x.localeCompare(String(y), "fr") : x - (y as number)) * dir || b.total - a.total;
    });
  }, [d, teamOnly, sort]);

  const journal = useMemo(() => {
    if (!d) return [];
    const q = jq.trim().toLowerCase();
    return d.rows.filter((r) => (!jCat || r.cat === jCat) && (!jWho || r.seller.key === jWho) && (!q || r.fan.toLowerCase().includes(q) || r.model.toLowerCase().includes(q)));
  }, [d, jq, jCat, jWho]);

  // Comparaison : par défaut les trois premiers vendeurs.
  const compared = (cmp ?? (v?.sold.slice(0, 3).map((s) => s.key) ?? [])).filter((k) => d?.sellers.some((s) => s.key === k));
  const toggleCmp = (k: string) => setCmp(compared.includes(k) ? compared.filter((x) => x !== k) : compared.length >= 3 ? [...compared.slice(1), k] : [...compared, k]);
  const bars: BarPt[] = !v ? [] : v.pts.map((p, i) => ({ ...p, parts: v.groups.map((g) => ({ v: g.series[i], color: g.color, label: g.name })) }));
  const lines: Serie[] = !v || !d ? [] : compared.map((k, i) => {
    const s = d.sellers.find((x) => x.key === k)!;
    return { id: k, name: s.name, color: PALETTE[i], values: fold(s.daily, v.idx, v.pts.length) };
  });
  const slices: Slice[] = (v?.groups ?? []).filter((g) => g.total > 0).sort((a, b) => b.total - a.total).map((g) => ({ label: g.name, value: g.total, color: g.color }));
  const team = v?.groups.find((g) => g.key === "team");
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, rev: !s.rev } : { key, rev: false }));
  const th = (k: SortKey, label: string, right = true, tip?: string) => {
    const on = sort.key === k;
    const up = UP.includes(k) ? !sort.rev : sort.rev;
    return (
      <th key={k} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
        <button type="button" onClick={() => sortBy(k)} title={tip ?? "Trier"} className={`inline-flex items-center gap-1 transition-colors hover:text-(--color-fg) ${on ? "text-(--color-fg)" : ""}`}>{label}{on ? up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}</button>
      </th>
    );
  };
  const exportRank = () => {
    if (!d) return;
    const n = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    downloadCsv(
      `bloom-ventes-equipe-${mym ? "mym" : "onlyfans"}-${d.from}_${d.to}.csv`,
      ["Rang", "Vendeur", "Type", `Chiffre ${d.mode === "gross" ? "brut" : "net"} (${cur})`, "Ventes", "Contenus payants", `Contenus payants (${cur})`, "Pourboires", `Pourboires (${cur})`, "Acheteurs", `Panier moyen (${cur})`, `Période d’avant (${cur})`, "Messages envoyés", "Contenus proposés", "Contenus achetés", "Taux d’achat %", "Fans à qui il a écrit", "Temps de réponse (s)"],
      d.sellers.map((s) => [s.rank == null ? "" : String(s.rank), s.name, TYPE_NAME[s.type], n(s.total), String(s.sales), String(s.ppvN), n(s.ppv), String(s.tipsN), n(s.tips), String(s.buyers), s.sales ? n(s.total / s.sales) : "", n(s.prev), String(s.messages), String(s.proposed), String(s.bought), s.proposed ? ((s.bought / s.proposed) * 100).toFixed(1).replace(".", ",") : "", String(s.fans), s.replyMs == null ? "" : String(Math.round(s.replyMs / 1000))]),
    );
  };
  const exportRows = () => {
    if (!d) return;
    downloadCsv(`bloom-ventes-detail-${mym ? "mym" : "onlyfans"}-${d.from}_${d.to}.csv`, ["Date", "Heure", "Modèle", "Fan", "Type", `Montant ${d.mode === "gross" ? "brut" : "net"} (${cur})`, "Vendeur", "Type de vendeur", "En attente"], journal.map((r) => [new Date(r.at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }), timeOf(r.at), r.model, r.fan, catName(r.cat), (r.v / 100).toFixed(2).replace(".", ","), r.seller.name, TYPE_NAME[r.seller.type], r.wait ? "oui" : ""]));
  };
  const stat = (label: string, value: React.ReactNode, sub: React.ReactNode, spark: number[], color: string, i: number, hi = false) => (
    <div className={`v2-card v2-rise p-4 ${hi ? "hi" : ""}`} style={{ ["--i" as string]: i }}>
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className="v2-big mt-1">{d ? value : <span className="text-muted">…</span>}</p>
      <p className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">{sub}</p>
      <div className="mt-2"><Spark key={`${data?.key}|${label}`} v={spark} color={color} /></div>
    </div>
  );
  const rankMove = (s: Seller) => {
    if (s.rank == null) return null;
    if (s.prevRank == null) return <span className="text-[10.5px] font-semibold" style={{ color: "var(--v2-sky)" }} title="Aucune vente sur la période d’avant">nouveau</span>;
    const move = s.prevRank - s.rank;
    if (!move) return <span className="text-[11px] text-muted" title="Même rang que la période d’avant">=</span>;
    return <span className="inline-flex items-center text-[11px] font-semibold" style={{ color: move > 0 ? "var(--v2-up)" : "var(--v2-down)" }} title={`Rang ${s.prevRank} sur la période d’avant`}>{move > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}{Math.abs(move)}</span>;
  };
  const pages = Math.max(1, Math.ceil(journal.length / PER));
  const shown = journal.slice((jPage - 1) * PER, jPage * PER);
  const opened = open ? d?.sellers.find((s) => s.key === open) ?? null : null;
  const oldLimit = d?.attributedSince && Date.parse(`${from}T00:00:00Z`) < d.attributedSince - 864e5;
  const threadOf = (r: SaleRow) => (r.mid ? `id=${encodeURIComponent(r.mid)}` : `creator=${encodeURIComponent(r.cid)}&fan=${encodeURIComponent(r.fid ?? "")}&at=${r.at}`);

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Équipe · {pfName}</p>
          <h1 className="v2-h1 mt-1">Ventes de l’équipe</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {d ? <ModelMenu all={d.all} value={model} onChange={setModel} /> : null}
          {d?.canGross ? (
            <div className="v2-segbar" title="Net : ce que touche l’agence après la commission d’OnlyFans. Brut : ce que les fans ont payé.">
              <button type="button" className="v2-seg" data-on={!gross} onClick={() => setGross(false)}>Net</button>
              <button type="button" className="v2-seg" data-on={gross} onClick={() => setGross(true)}>Brut</button>
            </div>
          ) : null}
          <button type="button" onClick={exportRank} disabled={!d} className="v2-select" title="Télécharger le classement (fichier pour Excel)"><Download className="size-4 text-muted" />Exporter</button>
        </div>
      </div>
      <PeriodBar period={period} />
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {d?.unmapped.length ? <p className="mt-4 rounded-xl border px-4 py-3 text-[12.5px] text-muted" style={{ borderColor: "rgb(245 158 11 / 0.3)", background: "rgb(245 158 11 / 0.06)" }}>Pas de ventes pour {d.unmapped.join(", ")} : aucun compte Infloww n’est relié à {d.unmapped.length > 1 ? "ces modèles" : "cette modèle"} (Paramètres → Branchements).</p> : null}
      {oldLimit ? <p className="mt-4 rounded-xl border px-4 py-3 text-[12.5px] text-muted" style={{ borderColor: "rgb(245 158 11 / 0.3)", background: "rgb(245 158 11 / 0.06)" }}>Côté MYM, Bloom ne retrouve l’auteur d’une vente que sur les 14 derniers jours : avant le {dateOf(d!.attributedSince!, true)}, les ventes sont rangées sous « Non attribué ».</p> : null}

      <div style={{ opacity: busy ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {stat(`Ventes de l’équipe${d ? (d.mode === "gross" ? " · brut" : " · net") : ""}`, d ? <Count value={d.total} format={(n) => fmt(n)} /> : null, <>{d ? <Delta now={d.total} before={d.prev} /> : null}<span>vs période d’avant{d && d.prev > 0 ? ` (${fmt(d.prev, 0)})` : ""}</span>{d?.provisional ? <span title="Ventes vues en direct, pas encore confirmées par la plateforme">· dont {fmt(d.provisional, 0)} en attente</span> : null}</>, v?.totalDaily ?? [], "#3b82f6", 2, true)}
          {stat("Ventes", d ? int(d.sales) : null, <>{d ? <Delta now={d.sales} before={d.prevSales} /> : null}<span>{d?.sales ? `panier moyen ${fmt(d.total / d.sales)}` : "aucune vente"}</span></>, v?.cumul ?? [], "#a78bfa", 3)}
          {stat("Vendu par des chatteurs", d && team ? fmt(team.total) : null, <span>{d && team ? `${share(team.total, d.total)} des ventes · ${plural(team.sales, "vente")}` : ""}</span>, team?.daily ?? [], "#34d399", 4)}
        </div>
        <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          {(d?.cats ?? []).filter((c) => c.key === "ppv" || c.key === "tip" || c.n > 0 || c.prevN > 0).map((c, i) => (
            <div key={c.key} className="v2-card v2-rise p-3.5" style={{ ["--i" as string]: i + 5 }}>
              <p className="flex items-center gap-2 text-[12px] text-muted"><i className="size-2 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.key] ?? "#6b7280" }} /><span className="truncate">{c.label}</span></p>
              <p className="v2-num mt-1.5 truncate text-[18px] leading-tight font-bold" style={c.total ? undefined : { color: "var(--color-muted)" }}>{fmt(c.total)}</p>
              <p className="mt-1 flex items-center gap-2 text-[11.5px] text-muted"><span>{c.n ? plural(c.n, "vente") : "aucune vente"}</span><Delta now={c.total} before={c.prev} quiet /></p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)]">
          <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 8 }}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="v2-card-title flex-1">Ventes par {v?.unit ?? "jour"}</p>
              <div className="v2-segbar">
                <button type="button" className="v2-seg" data-on={chart === "groups"} onClick={() => setChart("groups")} title="Qui a vendu : chatteurs, IA, envois automatiques">Qui a vendu</button>
                <button type="button" className="v2-seg" data-on={chart === "compare"} onClick={() => setChart("compare")} title="Comparer jusqu’à trois vendeurs">Comparer</button>
              </div>
            </div>
            {chart === "groups" ? (
              <>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">{(v?.groups ?? []).filter((g) => g.total > 0).map((g) => <span key={g.key} className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: g.color }} />{g.name}</span>)}</p>
                <Bars key={data?.key} pts={bars} fmt={fmt} />
              </>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(v?.sold ?? []).slice(0, 12).map((s) => {
                    const i = compared.indexOf(s.key);
                    return <button key={s.key} type="button" aria-pressed={i >= 0} onClick={() => toggleCmp(s.key)} className="v2-seg border" style={{ borderColor: i >= 0 ? PALETTE[i] : "var(--color-line)", color: i >= 0 ? "#fff" : undefined }}>{i >= 0 ? <i className="size-2 rounded-full" style={{ background: PALETTE[i] }} /> : null}{s.name}</button>;
                  })}
                  {!v?.sold.length ? <span className="text-[12px] text-muted">Aucune vente à comparer sur cette période.</span> : null}
                </div>
                <Lines key={`${data?.key}|${compared.join(",")}`} labels={v?.pts ?? []} series={lines} fmt={fmt} />
              </>
            )}
          </section>
          <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 9 }}>
            <p className="v2-card-title">Qui a vendu</p>
            <div className="mt-3"><Donut key={data?.key} items={slices} /></div>
            <div className="mt-3 space-y-1.5">
              {slices.map((x) => <p key={x.label} className="flex items-center gap-2 text-[12.5px]"><i className="size-2 shrink-0 rounded-full" style={{ background: x.color }} /><span className="min-w-0 flex-1 truncate text-muted">{x.label}</span><span className="v2-num text-muted">{pct(x.value, d?.total ?? 0)} %</span><b className="v2-num w-[84px] text-right">{fmt(x.value, 0)}</b></p>)}
              {!slices.length && d ? <p className="text-center text-[12.5px] text-muted">Aucune vente sur cette période.</p> : null}
            </div>
          </section>
        </div>

        {/* Le classement */}
        <section className="v2-card v2-rise mt-3 p-3" style={{ ["--i" as string]: 10 }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-2">
            <div className="min-w-0 flex-1">
              <p className="v2-card-title">Classement</p>
              <p className="mt-0.5 text-[12px] text-muted">{view === "sales" ? "Ce que chacun a vendu, comparé à la période d’avant. Un clic sur une ligne ouvre le détail." : "Ce que chacun a écrit et proposé, et ce que ça a donné. Bloom ne connaît que les messages qu’il a vus passer."}</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={teamOnly} onChange={(e) => setTeamOnly(e.target.checked)} className="size-3.5 accent-(--v2-blue)" />Chatteurs seulement</label>
            <div className="v2-segbar">
              <button type="button" className="v2-seg" data-on={view === "sales"} onClick={() => (setView("sales"), setSort({ key: "total", rev: false }))}>Ventes</button>
              <button type="button" className="v2-seg" data-on={view === "work"} onClick={() => (setView("work"), setSort({ key: "messages", rev: false }))}>Efficacité</button>
            </div>
          </div>
          <div className="v2-scroll overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12.5px]">
              <thead>
                <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                  <th className="w-[62px] px-3 py-2.5 text-left font-semibold">Rang</th>
                  {th("name", "Vendeur", false)}
                  {view === "sales" ? [
                    th("total", "Chiffre"), th("sales", "Ventes"), th("ppv", "Contenus payants"), th("tips", "Pourboires"), th("buyers", "Acheteurs", true, "Fans qui lui ont acheté quelque chose"), th("basket", "Panier moyen"), th("prev", "Avant"),
                    <th key="evo" className="px-3 py-2.5 text-right font-semibold">Évolution</th>,
                  ] : [
                    th("messages", "Messages", true, "Messages envoyés sur la période"), th("fans", "Fans", true, "Fans à qui il a écrit"), th("proposed", "Proposés", true, "Contenus payants envoyés"), th("bought", "Achetés"), th("rate", "Taux d’achat", true, "Contenus achetés ÷ contenus proposés"),
                    th("golden", "Part payante", true, "Contenus payants proposés ÷ messages envoyés"), th("cvr", "Fans acheteurs", true, "Acheteurs ÷ fans à qui il a écrit"), th("reply", "Réponse", true, "Temps de réponse moyen, pour les réponses données en moins de 30 minutes"), th("total", "Chiffre"),
                  ]}
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.key} onClick={() => setOpen(s.key)} className="cursor-pointer border-b transition-colors hover:bg-white/[0.03]" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="flex items-center gap-1.5"><b className="v2-num w-5 text-[13px]" style={{ color: s.rank != null && s.rank <= 3 ? "#fbbf24" : s.rank == null ? "var(--color-muted)" : undefined }}>{s.rank ?? "—"}</b>{rankMove(s)}</span></td>
                    <td className="max-w-[240px] px-3 py-2.5 text-[13px]"><WhoTag w={s} pf={pf} strong /></td>
                    {view === "sales" ? (
                      <>
                        <td className="px-3 py-2.5 text-right">
                          <b className="v2-num text-[13px]" style={{ color: s.total ? undefined : "var(--color-muted)" }}>{s.total ? money(s.total) : "—"}</b>
                          <span className="mt-1 ml-auto block h-1 w-[90px] overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}><i className="block h-full rounded-full" style={{ width: `${(s.total / (v?.max ?? 1)) * 100}%`, background: WHO_COLOR[s.type] }} /></span>
                        </td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.sales ? int(s.sales) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap">{s.ppvN ? <>{int(s.ppvN)}<span className="ml-1.5 text-muted">{money(s.ppv)}</span></> : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap">{s.tipsN ? <>{int(s.tipsN)}<span className="ml-1.5 text-muted">{money(s.tips)}</span></> : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.buyers ? int(s.buyers) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap">{s.sales ? fmt(s.total / s.sales) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap text-muted">{s.prev ? money(s.prev) : "—"}</td>
                        <td className="px-3 py-2.5 text-right">{s.total || s.prev ? <Delta now={s.total} before={s.prev} /> : <span className="text-muted">—</span>}</td>
                      </>
                    ) : (
                      <>
                        <td className="v2-num px-3 py-2.5 text-right">{s.messages ? int(s.messages) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.fans ? int(s.fans) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.proposed ? int(s.proposed) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.proposed ? int(s.bought) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.proposed ? share(s.bought, s.proposed) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.messages ? share(s.proposed, s.messages) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{s.fans ? share(s.buyers, s.fans) : <span className="text-muted">—</span>}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap">{s.replyMs == null ? <span className="text-muted">—</span> : fmtDuration(s.replyMs)}</td>
                        <td className="v2-num px-3 py-2.5 text-right text-[13px] font-bold whitespace-nowrap" style={{ color: s.total ? undefined : "var(--color-muted)" }}>{s.total ? money(s.total) : "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d && !sellers.length ? <p className="py-10 text-center text-[13px] text-muted">Aucune vente ni aucun message sur cette période.</p> : null}
          <p className="mt-3 border-t px-1 pt-2.5 text-[11.5px] leading-relaxed text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
            Comptent ici les contenus payants envoyés en message et les pourboires ; les abonnements sont dans Chiffres. Bloom connaît le nom d’un chatteur seulement quand il écrit depuis Bloom.
            {mym ? " Côté MYM, « Hors Bloom » est une déduction (fan dont l’IA est active) : MYM ne dit pas qui a écrit." : " Côté OnlyFans, une vente dont Bloom n’a pas vu l’auteur garde le chatteur qu’Infloww lui attribue."}
            {d?.msgSince ? ` Messages notés depuis le ${dateOf(d.msgSince, true)}.` : ""}
          </p>
        </section>

        {/* Le détail des ventes */}
        <section className="v2-card v2-rise mt-3 p-3" style={{ ["--i" as string]: 11 }}>
          <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
            <div className="min-w-0 flex-1">
              <p className="v2-card-title">Détail des ventes</p>
              <p className="mt-0.5 text-[12px] text-muted">{d ? (d.rowsTotal > d.rows.length ? `Les ${int(d.rows.length)} dernières ventes de la période (sur ${int(d.rowsTotal)}).` : `${plural(d.rowsTotal, "vente")} sur la période.`) : " "}</p>
            </div>
            <label className="flex h-9 min-w-[180px] items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}>
              <Search className="size-3.5 shrink-0 text-muted" />
              <input value={jq} onChange={(e) => setJq(e.target.value)} placeholder="Fan ou modèle" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" />
              {jq ? <button type="button" onClick={() => setJq("")} aria-label="Effacer la recherche" className="text-muted hover:text-(--color-fg)"><X className="size-3.5" /></button> : null}
            </label>
            <div className="w-[190px]"><select value={jWho} onChange={(e) => setJWho(e.target.value)} aria-label="Vendeur" className="v2-field" style={{ height: 36, colorScheme: "dark", fontSize: 12.5 }}><option value="" style={{ background: "#121215" }}>Tous les vendeurs</option>{(v?.sold ?? []).map((s) => <option key={s.key} value={s.key} style={{ background: "#121215" }}>{s.name}</option>)}</select></div>
            <div className="v2-segbar">
              <button type="button" className="v2-seg" data-on={!jCat} onClick={() => setJCat("")}>Tout</button>
              {(d?.cats ?? []).filter((c) => c.n > 0).map((c) => <button key={c.key} type="button" className="v2-seg" data-on={jCat === c.key} onClick={() => setJCat(c.key)}>{c.label}</button>)}
            </div>
            <button type="button" onClick={exportRows} disabled={!journal.length} className="v2-select" title="Télécharger ces ventes (fichier pour Excel)"><Download className="size-4 text-muted" />Exporter</button>
          </div>
          <div className="v2-scroll overflow-x-auto" hidden={!shown.length}>
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead>
                <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                  <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Modèle</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Fan</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Montant</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Vendeur</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                    <td className="px-3 py-2 whitespace-nowrap">{dateOf(r.at)}<span className="ml-1.5 text-muted">{timeOf(r.at)}</span></td>
                    <td className="max-w-[160px] truncate px-3 py-2">{r.model}</td>
                    <td className="max-w-[180px] truncate px-3 py-2">{r.fan}</td>
                    <td className="px-3 py-2"><span className="v2-tag"><i className="size-1.5 rounded-full" style={{ background: CAT_COLOR[r.cat] ?? "#6b7280" }} />{catName(r.cat)}</span></td>
                    <td className="v2-num px-3 py-2 text-right text-[13px] font-bold whitespace-nowrap">{money(r.v)}{r.wait ? <span className="ml-1.5 text-[11px] font-normal text-muted" title="Vente vue en direct, pas encore confirmée par la plateforme">en attente</span> : null}</td>
                    <td className="max-w-[220px] px-3 py-2"><WhoTag w={r.seller} pf={pf} /></td>
                    <td className="pr-2 text-right">{r.mid || r.fid ? <button type="button" onClick={() => setThread(threadOf(r))} title="Voir la conversation autour de cette vente" aria-label="Voir la conversation autour de cette vente" className="inline-grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><MessagesSquare className="size-4" /></button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d && !shown.length ? <p className="py-10 text-center text-[13px] text-muted">{d.rows.length ? "Aucune vente ne correspond." : "Aucune vente sur cette période."}</p> : null}
          {journal.length > PER ? (
            <div className="flex flex-wrap items-center gap-2 px-1 pt-3 text-[12.5px] text-muted">
              <span className="v2-num flex-1">{int((jPage - 1) * PER + 1)}–{int(Math.min(jPage * PER, journal.length))} sur {int(journal.length)}</span>
              <button type="button" disabled={jPage <= 1} onClick={() => setJPage(jPage - 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}><ChevronLeft className="size-4" />Plus récentes</button>
              <span className="v2-num">{jPage} / {pages}</span>
              <button type="button" disabled={jPage >= pages} onClick={() => setJPage(jPage + 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}>Plus anciennes<ChevronRight className="size-4" /></button>
            </div>
          ) : null}
        </section>
      </div>

      {opened && d && v ? <SellerSheet pf={pf} s={opened} d={d} query={query} pts={v.pts} idx={v.idx} onClose={() => setOpen(null)} onThread={(q) => setThread(q)} threadOf={threadOf} /> : null}
      {thread ? <ThreadModal query={thread} onClose={() => setThread(null)} /> : null}
    </div>
  );
}

/** Le détail d'un vendeur : ses chiffres, ses ventes par jour et par modèle, son efficacité, ses dernières ventes. */
function SellerSheet({ pf, s, d, query, pts, idx, onClose, onThread, threadOf }: {
  pf: Pf; s: Seller; d: Data; query: string; pts: { key: string; label: string; title: string }[]; idx: number[]; onClose: () => void; onThread: (q: string) => void; threadOf: (r: SaleRow) => string;
}) {
  const [rows, setRows] = useState<{ list: SaleRow[]; total: number } | null>(null);
  useEffect(() => {
    let off = false;
    api<Data>("GET", `/api/v2/team/sales?${query}&seller=${encodeURIComponent(s.key)}`).then((r) => void (!off && setRows({ list: r.rows, total: r.rowsTotal }))).catch(() => void (!off && setRows({ list: [], total: 0 })));
    return () => {
      off = true;
    };
  }, [query, s.key]);
  const cur = d.currency;
  const fmt = (v: number, digits = 2) => cash(v, cur, digits);
  const money = (v: number) => cash(v, cur, v % 100 ? 2 : 0);
  const series = fold(s.daily, idx, pts.length);
  const bars: BarPt[] = pts.map((p, i) => ({ ...p, parts: [{ v: series[i], color: WHO_COLOR[s.type], label: s.name }] }));
  const catName = (k: string) => d.cats.find((c) => c.key === k)?.label ?? k;
  const tile = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="min-w-0 rounded-[12px] border px-3.5 py-2.5" style={{ borderColor: "var(--color-line)" }}>
      <p className="truncate text-[11.5px] font-semibold text-muted">{label}</p>
      <p className="v2-num mt-0.5 truncate text-[19px] leading-tight font-bold">{value}</p>
      <p className="mt-0.5 flex min-h-[18px] items-center gap-1.5 truncate text-[11.5px] text-muted">{sub ?? " "}</p>
    </div>
  );
  const line = (label: string, value: React.ReactNode) => <p className="flex items-baseline justify-between gap-3 border-b py-1.5 text-[12.5px]" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}><span className="text-muted">{label}</span><b className="v2-num text-right">{value}</b></p>;
  const top = Math.max(1, ...s.models.map((m) => m.total));
  return (
    <Modal title={<WhoTag w={s} pf={pf} />} sub={`${TYPE_NAME[s.type]} · du ${fmtDay(d.from, { day: "numeric", month: "short" })} au ${fmtDay(d.to, { day: "numeric", month: "short", year: "numeric" })}${s.rank ? ` · rang ${s.rank}` : ""}`} width={980} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tile(`Chiffre ${d.mode === "gross" ? "brut" : "net"}`, fmt(s.total), <><Delta now={s.total} before={s.prev} /><span>{s.prev ? `avant : ${fmt(s.prev, 0)}` : "rien sur la période d’avant"}</span></>)}
        {tile("Ventes", int(s.sales), `${int(s.ppvN)} contenu${s.ppvN > 1 ? "s" : ""} · ${int(s.tipsN)} pourboire${s.tipsN > 1 ? "s" : ""}`)}
        {tile("Acheteurs", int(s.buyers), s.buyers ? `${fmt(s.total / s.buyers)} par acheteur` : undefined)}
        {tile("Panier moyen", s.sales ? fmt(s.total / s.sales) : "—", s.best ? `meilleure vente : ${money(s.best)}` : undefined)}
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="v2-label">Ses ventes par {pts.length === d.days.length ? "jour" : "mois"}</p>
          <Bars pts={bars} fmt={fmt} height={190} />
        </div>
        <div className="min-w-0">
          <p className="v2-label">Par modèle</p>
          <div className="space-y-2">
            {s.models.map((m) => (
              <div key={m.id}>
                <p className="flex justify-between gap-3 text-[12.5px]"><span className="min-w-0 truncate">{m.name}</span><b className="v2-num">{money(m.total)}</b></p>
                <span className="mt-1 block h-1 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}><i className="block h-full rounded-full" style={{ width: `${(m.total / top) * 100}%`, background: "var(--v2-blue)" }} /></span>
              </div>
            ))}
            {!s.models.length ? <p className="text-[12.5px] text-muted">Aucune vente sur cette période.</p> : null}
          </div>
          {s.messages ? (
            <div className="mt-4">
              <p className="v2-label">Ce qu’il a écrit</p>
              {line("Messages envoyés", int(s.messages))}
              {line("Fans à qui il a écrit", int(s.fans))}
              {line("Contenus payants proposés", int(s.proposed))}
              {line("Achetés", s.proposed ? `${int(s.bought)} · ${share(s.bought, s.proposed)}` : "—")}
              {line("Temps de réponse moyen", s.replyMs == null ? "—" : fmtDuration(s.replyMs))}
            </div>
          ) : null}
        </div>
      </div>
      <p className="v2-label mt-4">Ses ventes{rows && rows.total > rows.list.length ? ` (les ${int(rows.list.length)} dernières sur ${int(rows.total)})` : ""}</p>
      <div className="v2-scroll max-h-[240px] overflow-y-auto rounded-[10px] border" style={{ borderColor: "var(--color-line)" }}>
        {!rows ? <p className="px-3 py-4 text-center text-[12.5px] text-muted">Chargement…</p> : null}
        {rows && !rows.list.length ? <p className="px-3 py-4 text-center text-[12.5px] text-muted">Aucune vente sur cette période.</p> : null}
        {(rows?.list ?? []).map((r) => (
          <p key={r.id} className="flex items-center gap-3 border-b px-3 py-1.5 text-[12px] last:border-b-0" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
            <span className="w-[104px] shrink-0 whitespace-nowrap text-muted">{dateOf(r.at)} {timeOf(r.at)}</span>
            <span className="min-w-0 flex-1 truncate">{r.fan}<span className="ml-2 text-muted">{r.model}</span></span>
            <span className="shrink-0 text-muted">{catName(r.cat)}</span>
            <b className="v2-num w-[72px] shrink-0 text-right">{money(r.v)}</b>
            <span className="w-6 shrink-0 text-right">{r.mid || r.fid ? <button type="button" onClick={() => onThread(threadOf(r))} title="Voir la conversation autour de cette vente" aria-label="Voir la conversation autour de cette vente" className="inline-grid size-6 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><MessagesSquare className="size-3.5" /></button> : null}</span>
          </p>
        ))}
      </div>
      <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Fermer</button></div>
    </Modal>
  );
}
