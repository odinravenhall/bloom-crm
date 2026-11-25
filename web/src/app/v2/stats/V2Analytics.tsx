"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { api } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { Avatar } from "@/rv/components/ui";
import { Bars, CAT_COLOR, cash, Count, Delta, downloadCsv, fmtDay, fmtDuration, int, Lines, PALETTE, paris, pct, PeriodBar, Ring, Spark, usePeriod, type BarPt } from "../kit";

// Bloom v2 → Analytique : l'analyse d'UNE modèle, le MÊME écran pour OnlyFans et MYM (25/11/2026, « Constellation »).
// Il remplace, dans la v2, la copie de la page « Analytique » de MyPulse (MymAnalytics) et celle des « Creator reports »
// d'Infloww (CreatorReports). Chiffres dit combien gagne l'agence ; Analytique explique une modèle : d'où vient l'argent,
// qui achète, les abonnés, ce que fait la messagerie, et le détail jour par jour. Données : `GET /api/v2/analytics`
// (app/v2analytics.mjs), mêmes règles que Chiffres (donc mêmes totaux). Ce qu'une plateforme ne donne pas n'est pas
// affiché (abonnés actifs : MYM ; brut : OnlyFans ; nouveaux abonnés OnlyFans : comptés par Substy, demandés à part).
type Cat = { key: string; label: string; total: number; prev: number; n: number; free: number };
type Day = { day: string; total: number; n: number; buyers: number; cats: Record<string, number>; newSubs: number; renewals: number; sent: number | null; ppv: number | null; bought: number | null; subs: number | null; subsEst: boolean };
type ModelRow = { id: string; name: string; avatar: string | null; total: number; prev: number; sales: number };
type Group = { key: "team" | "ai" | "auto" | "creator"; label: string; sent: number; ppv: number; bought: number; reply: number | null };
type Ana = {
  platform: "of" | "mym"; currency: string; mode: "net" | "gross"; canGross: boolean; from: string; to: string; today: string;
  all: { id: string; name: string; avatar: string | null }[]; list: ModelRow[];
  // Sans modèle à analyser (`model` = null), le reste de la réponse est absent : on ne le lit qu'après ce test.
  model: { id: string; name: string; avatar: string | null; since: number | null } | null;
  total: number; prev: number; provisional: number; refunds: number; sales: number; prevSales: number; buyers: number; prevBuyers: number;
  cats: Cat[]; days: Day[]; hours: { h: number; sum: number; n: number }[];
  fans: { fresh: { n: number; total: number }; loyal: { n: number; total: number }; top: { name: string; total: number; n: number; fresh: boolean }[]; shortHistory: boolean };
  subs: { fresh: number; freshPrev: number; renewals: number; renewalsPrev: number; active: number | null; activeStart: number | null; est: boolean; paidOnly: boolean };
  chat: null | { since: number; partial: boolean; sent: number; ppv: number; bought: number; reply: number | null; fans: number; prev: null | { sent: number; ppv: number; bought: number; reply: number | null; fans: number }; by: Group[] };
  unmapped: boolean;
};

const dayOf = (t: number) => fmtDay(paris(new Date(t)), { day: "numeric", month: "long", year: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n > 1 ? many : one}`;

/** Petite case de chiffre à l'intérieur d'une carte. */
function Tile({ label, value, chip, sub, title }: { label: string; value: React.ReactNode; chip?: React.ReactNode; sub?: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0 rounded-xl border px-3 py-2.5" title={title} style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.02)" }}>
      <p className="truncate text-[11.5px] text-muted">{label}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><b className="v2-num text-[18px] leading-tight">{value}</b>{chip}</p>
      {sub ? <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p> : null}
    </div>
  );
}

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2Analytics({ pf }: { pf: Pf }) {
  const period = usePeriod();
  const { from, to } = period;
  const modelKey = `bloom.v2.analytics.model.${pf}`;
  // La modèle analysée la dernière fois (par plateforme) ; vide = la première du classement, choisie par le serveur.
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem(modelKey) || "";
    } catch {
      return "";
    }
  });
  const [gross, setGross] = useState(false);
  const [data, setData] = useState<{ key: string; s: Ana } | null>(null);
  const [subsData, setSubsData] = useState<{ key: string; v: number | null; prev: number | null } | null>(null);
  const [err, setErr] = useState("");
  const key = `${from}|${to}|${model}|${gross}`;
  const pickModel = (id: string) => {
    setModel(id);
    try {
      localStorage.setItem(modelKey, id);
    } catch {}
  };
  useEffect(() => {
    let stop = false;
    const q = `pf=${pf}&from=${from}&to=${to}${model ? `&creatorId=${encodeURIComponent(model)}` : ""}${gross ? "&mode=gross" : ""}`;
    const load = () =>
      api<Ana>("GET", `/api/v2/analytics?${q}`)
        .then((s) => !stop && (setData({ key: `${from}|${to}|${model}|${gross}`, s }), setErr("")))
        .catch((e) => !stop && setErr(e instanceof Error ? e.message : "Analyse indisponible"));
    load();
    // La période contient aujourd'hui : l'analyse se rafraîchit toute seule (moins souvent sur une longue période).
    const t = to >= paris() ? setInterval(() => document.visibilityState === "visible" && load(), period.len > 62 ? 300_000 : 60_000) : null;
    return () => {
      stop = true;
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, model, gross, pf]);

  const s = data?.s ?? null;
  const m = s?.model ?? null;
  const mid = m?.id ?? "";
  // OnlyFans : les nouveaux abonnés (gratuits compris) sont comptés par Substy ; sa réponse peut prendre quelques
  // secondes, elle est donc demandée à part, une fois par modèle et par période.
  const subsKey = `${pf}|${from}|${to}|${mid}`;
  useEffect(() => {
    if (pf !== "of" || !mid) return;
    let stop = false;
    const k = `${pf}|${from}|${to}|${mid}`;
    api<{ v: number | null; prev: number | null }>("GET", `/api/v2/analytics/subs?pf=of&from=${from}&to=${to}&creatorId=${encodeURIComponent(mid)}`)
      .then((r) => !stop && setSubsData({ key: k, v: r.v, prev: r.prev }))
      .catch(() => !stop && setSubsData({ key: k, v: null, prev: null }));
    return () => {
      stop = true;
    };
  }, [pf, from, to, mid]);
  const ofSubs = subsData && subsData.key === subsKey ? subsData : null; // null = réponse pas encore arrivée

  const busy = !!data && data.key !== key;
  const cur = s?.currency ?? (pf === "mym" ? "EUR" : "USD");
  const fmt = (v: number, digits = 2) => cash(v, cur, digits);
  const pfName = pf === "mym" ? "MYM" : "OnlyFans";
  const colorOf = (id: string) => PALETTE[Math.max(0, (s?.all ?? []).findIndex((x) => x.id === id)) % PALETTE.length];
  const len = m && s ? s.days.length : period.len;
  // Bloom garde environ un an de ventes : au-delà de six mois, la « période d'avant » serait incomplète.
  const noCompare = len > 180;
  const delta = (now: number, before: number, invert = false) => (noCompare ? null : <Delta now={now} before={before} invert={invert} />);

  const v = useMemo(() => {
    if (!s || !s.model) return null;
    const days = s.days;
    const n = days.length;
    const unit: "heure" | "jour" | "mois" = n <= 2 ? "heure" : n > 62 ? "mois" : "jour";
    // Les jours tels quels, ou regroupés par mois sur une longue période.
    type G = { key: string; label: string; title: string; cats: Record<string, number>; newSubs: number; renewals: number };
    let groups: G[];
    if (unit === "mois") {
      const by = new Map<string, G>();
      for (const d of days) {
        const k = d.day.slice(0, 7);
        const g = by.get(k) ?? { key: k, label: fmtDay(k + "-01", { month: "short" }), title: fmtDay(k + "-01", { month: "long", year: "numeric" }), cats: {}, newSubs: 0, renewals: 0 };
        for (const [c, x] of Object.entries(d.cats)) g.cats[c] = (g.cats[c] || 0) + x;
        g.newSubs += d.newSubs;
        g.renewals += d.renewals;
        by.set(k, g);
      }
      groups = [...by.values()];
    } else groups = days.map((d) => ({ key: d.day, label: fmtDay(d.day, { day: "2-digit" }), title: fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" }), cats: d.cats, newSubs: d.newSubs, renewals: d.renewals }));
    const hourBars: BarPt[] = s.hours.map((h) => ({ key: String(h.h), label: `${h.h}h`, title: `De ${h.h} h à ${h.h + 1} h · ${h.n} vente${h.n > 1 ? "s" : ""}`, parts: [{ v: h.sum, color: "#3b82f6", label: "Contenus et pourboires" }] }));
    const best = [...s.hours].sort((a, b) => b.sum - a.sum)[0];
    const known = days.map((d) => d.subs).filter((x): x is number => x != null);
    return {
      unit, hourBars,
      bars: groups.map((g): BarPt => ({ key: g.key, label: g.label, title: g.title, parts: s.cats.map((c) => ({ v: g.cats[c.key] || 0, color: CAT_COLOR[c.key] ?? "#6b7280", label: c.label })) })),
      subBars: groups.map((g): BarPt => ({ key: g.key, label: g.label, title: g.title, parts: [{ v: g.newSubs, color: "#38bdf8", label: s.subs.paidOnly ? "Abonnements payés" : "Nouveaux abonnés" }, { v: g.renewals, color: "#22d3ee", label: "Renouvellements" }] })),
      labels: days.map((d) => ({ key: d.day, label: fmtDay(d.day, { day: "2-digit" }), title: fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" }) })),
      bestHour: best && best.n > 0 ? best : null,
      hasActive: known.length > 0,
      sparkTotal: days.map((d) => d.total),
      sparkBuyers: days.map((d) => d.buyers),
      sparkSpend: days.map((d) => (d.buyers ? d.total / d.buyers : 0)),
      sparkSales: days.map((d) => d.n),
    };
  }, [s]);

  const exportCsv = () => {
    if (!s || !m) return;
    const num = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    const blank = (x: number | null) => (x == null ? "" : String(x));
    const mym = s.platform === "mym";
    const head = ["Jour", `Total ${s.mode === "gross" ? "brut" : "net"} (${cur})`, ...s.cats.map((c) => c.label), "Ventes", "Acheteurs", mym ? "Nouveaux abonnés" : "Abonnements payés", "Renouvellements", "Messages envoyés", "Contenus payants envoyés", "Contenus payants achetés", ...(mym ? ["Abonnés actifs"] : [])];
    const lines = s.days.map((d) => [d.day, num(d.total), ...s.cats.map((c) => num(d.cats[c.key] || 0)), String(d.n), String(d.buyers), String(d.newSubs), String(d.renewals), blank(d.sent), blank(d.ppv), blank(d.bought), ...(mym ? [blank(d.subs)] : [])]);
    downloadCsv(`bloom-analytique-${m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "modele"}-${s.from}_${s.to}.csv`, head, lines);
  };

  const stat = (label: string, value: React.ReactNode, sub: React.ReactNode, spark: number[], color: string, i: number, hi = false) => (
    <div className={`v2-card v2-rise p-4 ${hi ? "hi" : ""}`} style={{ ["--i" as string]: i }}>
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className="v2-big mt-1" style={{ fontSize: 25 }}>{value}</p>
      <p className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">{sub}</p>
      {spark.length > 1 ? <div className="mt-2"><Spark key={`${data?.key}|${label}`} v={spark} color={color} h={38} /></div> : null}
    </div>
  );
  const types = m && s ? s.cats.filter((c) => c.total > 0 || c.prev > 0 || c.free > 0).sort((a, b) => b.total - a.total) : [];
  const chat = m && s ? s.chat : null;
  const authors = (chat?.by ?? []).filter((g) => g.sent > 0);
  // Nouveaux abonnés : MYM les lit dans ses ventes (gratuits compris) ; OnlyFans les demande à Substy (0 alors que la
  // modèle vend = Substy ne la suit pas, donc « inconnu »).
  const newSubs = !m || !s ? null : s.platform === "mym" ? { v: s.subs.fresh, prev: s.subs.freshPrev as number | null } : ofSubs && ofSubs.v != null && !(ofSubs.v === 0 && s.total > 0) ? { v: ofSubs.v, prev: ofSubs.prev } : null;
  const fansTotal = m && s ? s.fans.fresh.total + s.fans.loyal.total : 0;

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Statistiques · {pfName}</p>
          <h1 className="v2-h1 mt-1">Analytique</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {s?.canGross ? (
            <div className="v2-segbar" title="Net : ce que touche l’agence après la commission d’OnlyFans. Brut : ce que les fans ont payé.">
              <button className="v2-seg" data-on={!gross} onClick={() => setGross(false)}>Net</button>
              <button className="v2-seg" data-on={gross} onClick={() => setGross(true)}>Brut</button>
            </div>
          ) : null}
          <button onClick={exportCsv} disabled={!m} className="v2-select" title="Télécharger le détail jour par jour de cette modèle (fichier pour Excel)"><Download className="size-4 text-muted" />Exporter</button>
        </div>
      </div>
      <PeriodBar period={period} />
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* La colonne des modèles : le classement de la période, un clic = l'analyse de cette modèle */}
        <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 2 }}>
          <div className="v2-card p-1.5">
            <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Modèles · {period.label}</p>
            <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:max-h-[calc(100dvh-230px)] lg:space-y-0.5 lg:overflow-y-auto">
              {(s?.list ?? []).map((x) => (
                <button key={x.id} onClick={() => pickModel(x.id)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.id} aria-pressed={mid === x.id} title={`Analyser ${x.name}`}>
                  <Ring color={colorOf(x.id)}><Avatar src={x.avatar} name={x.name} size="size-8" /></Ring>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                    <span className="v2-num mt-0.5 block text-[11.5px] text-muted">{fmt(x.total, 0)}</span>
                  </span>
                  {noCompare ? null : <span className="hidden lg:inline-flex"><Delta now={x.total} before={x.prev} quiet /></span>}
                </button>
              ))}
              {s && !s.list.length ? <p className="px-2 py-3 text-[12.5px] text-muted">Aucune modèle {pfName}.</p> : null}
              {!s ? <p className="px-2 py-3 text-[12.5px] text-muted">Chargement…</p> : null}
            </div>
          </div>
        </aside>

        <div className="min-w-0" style={{ opacity: busy ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
          {s && !m ? <div className="v2-card v2-rise p-8 text-center text-[13.5px] text-muted">Aucune modèle {pfName} à analyser pour l’instant.</div> : null}
          {!s && !err ? <div className="v2-card p-8 text-center text-[13.5px] text-muted">Chargement…</div> : null}
          {s && m && v ? (
            <>
              {/* Qui on regarde */}
              <div className="v2-rise flex flex-wrap items-center gap-3" style={{ ["--i" as string]: 2 }}>
                <Ring color={colorOf(m.id)}><Avatar src={m.avatar} name={m.name} size="size-11" /></Ring>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[19px] leading-tight font-bold tracking-[-0.02em]">{m.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted">{pfName} · {period.label}{m.since ? ` · ventes connues depuis le ${dayOf(m.since)}` : ""}</p>
                </div>
              </div>
              {s.unmapped ? <p className="mt-3 rounded-xl border px-4 py-3 text-[12.5px] text-muted" style={{ borderColor: "rgb(245 158 11 / 0.3)", background: "rgb(245 158 11 / 0.06)" }}>Aucun compte Infloww n’est relié à cette modèle : ses ventes ne sont pas connues (Paramètres → Branchements).</p> : null}

              {/* Les quatre chiffres clés */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {stat(`Chiffre d’affaires ${s.mode === "gross" ? "brut" : "net"}`, <Count value={s.total} format={(x) => fmt(x)} />, <>{noCompare ? <span>période trop longue pour être comparée</span> : <><Delta now={s.total} before={s.prev} /><span>vs période d’avant</span></>}{s.provisional ? <span title="Ventes vues en direct, pas encore confirmées par la plateforme">· {fmt(s.provisional, 0)} en attente</span> : null}</>, v.sparkTotal, "#3b82f6", 3, true)}
                {stat("Acheteurs", int(s.buyers), <>{delta(s.buyers, s.prevBuyers)}<span>{s.fans.fresh.n ? `dont ${plural(s.fans.fresh.n, "nouveau", "nouveaux")}` : "fans qui ont payé"}</span></>, v.sparkBuyers, "#a78bfa", 4)}
                {stat("Dépense par acheteur", s.buyers ? fmt(s.total / s.buyers) : "—", <>{s.buyers && s.prevBuyers ? delta(s.total / s.buyers, s.prev / s.prevBuyers) : null}<span>en moyenne sur la période</span></>, v.sparkSpend, "#34d399", 5)}
                {stat("Panier moyen", s.sales ? fmt(s.total / s.sales) : "—", <>{s.sales && s.prevSales ? delta(s.total / s.sales, s.prev / s.prevSales) : null}<span>{plural(s.sales, "vente")}</span></>, v.sparkSales, "#fbbf24", 6)}
              </div>

              {/* D'où vient l'argent */}
              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
                <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 7 }}>
                  <p className="v2-card-title">{v.unit === "heure" ? "Ventes par heure" : `Revenu par ${v.unit}`}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
                    {v.unit === "heure" ? <span>Contenus payants et pourboires, heure de Paris</span> : types.filter((c) => c.total > 0).map((c) => <span key={c.key} className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: CAT_COLOR[c.key] ?? "#6b7280" }} />{c.label}</span>)}
                    {v.unit !== "heure" && !types.some((c) => c.total > 0) ? <span>Aucune vente sur la période</span> : null}
                  </p>
                  <Bars key={`${data?.key}|rev`} pts={v.unit === "heure" ? v.hourBars : v.bars} fmt={fmt} />
                </section>
                <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 8 }}>
                  <p className="v2-card-title">Par type de vente</p>
                  <div className="mt-3 space-y-3">
                    {types.map((c) => (
                      <div key={c.key}>
                        <p className="flex items-center gap-2 text-[12.5px]">
                          <i className="size-2.5 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.key] ?? "#6b7280" }} />
                          <span className="min-w-0 flex-1 truncate">{c.label}</span>
                          {delta(c.total, c.prev)}
                          <b className="v2-num w-[86px] shrink-0 text-right">{fmt(c.total)}</b>
                        </p>
                        <p className="mt-1.5 flex items-center gap-2">
                          <span className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}><i className="v2-grow block h-full rounded-full" style={{ width: `${pct(c.total, s.total)}%`, background: CAT_COLOR[c.key] ?? "#6b7280" }} /></span>
                          <span className="w-[112px] shrink-0 truncate text-right text-[11px] text-muted">{c.n ? `${plural(c.n, "vente")} · ${pct(c.total, s.total)} %` : c.free ? plural(c.free, "gratuit") : "aucune vente"}</span>
                        </p>
                      </div>
                    ))}
                    {!types.length ? <p className="text-[12.5px] text-muted">Aucune vente sur la période.</p> : null}
                    {s.refunds ? <p className="flex items-center gap-2 border-t pt-3 text-[12.5px]" style={{ borderColor: "rgb(255 255 255 / 0.06)" }} title="Les remboursements ne sont pas retirés du chiffre d’affaires : ils sont comptés à part."><i className="size-2.5 shrink-0 rounded-full" style={{ background: "var(--v2-down)" }} /><span className="flex-1">Remboursements <span className="text-muted">(comptés à part)</span></span><b className="v2-num" style={{ color: "var(--v2-down)" }}>{fmt(s.refunds)}</b></p> : null}
                  </div>
                </section>
              </div>

              {/* Qui achète, et à quelle heure */}
              <div className={`mt-3 grid gap-3 ${v.unit === "heure" ? "" : "xl:grid-cols-2"}`}>
                <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 9 }}>
                  <p className="v2-card-title">Acheteurs</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">Nouveaux = premier achat pendant la période ; déjà connus = ils avaient acheté avant.</p>
                  <div className={`mt-3 grid gap-x-6 gap-y-4 ${v.unit === "heure" ? "lg:grid-cols-2" : ""}`}>
                    <div>
                      <div className="flex h-2 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}>
                        <i className="v2-grow block h-full" style={{ width: `${pct(s.fans.fresh.total, fansTotal)}%`, background: "#3b82f6" }} />
                        <i className="block h-full flex-1" style={{ background: fansTotal ? "#a78bfa" : "transparent" }} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="flex items-center gap-1.5 text-[11.5px] text-muted"><i className="size-2 rounded-full" style={{ background: "#3b82f6" }} />Nouveaux</p>
                          <p className="v2-num mt-1 text-[18px] leading-tight font-bold">{int(s.fans.fresh.n)}</p>
                          <p className="v2-num mt-0.5 text-[11.5px] text-muted">{fmt(s.fans.fresh.total, 0)} · {pct(s.fans.fresh.total, fansTotal)} %</p>
                        </div>
                        <div>
                          <p className="flex items-center gap-1.5 text-[11.5px] text-muted"><i className="size-2 rounded-full" style={{ background: "#a78bfa" }} />Déjà connus</p>
                          <p className="v2-num mt-1 text-[18px] leading-tight font-bold">{int(s.fans.loyal.n)}</p>
                          <p className="v2-num mt-0.5 text-[11.5px] text-muted">{fmt(s.fans.loyal.total, 0)} · {pct(s.fans.loyal.total, fansTotal)} %</p>
                        </div>
                      </div>
                      {s.fans.shortHistory && s.buyers ? <p className="mt-3 text-[11.5px] text-muted">Historique court : Bloom ne connaît pas les achats d’avant le {m.since ? dayOf(m.since) : "début de ses relevés"}, certains « nouveaux » ont pu acheter avant.</p> : null}
                    </div>
                    <div>
                      <p className="text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">Meilleurs acheteurs</p>
                      <div className="mt-2 space-y-1.5">
                        {s.fans.top.slice(0, 8).map((f, i) => (
                          <p key={`${f.name}:${i}`} className="flex items-center gap-2 text-[12.5px]">
                            <span className="v2-num w-4 shrink-0 text-center text-[11.5px] font-semibold text-muted">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                            {f.fresh ? <span className="v2-delta shrink-0" data-dir="up">nouveau</span> : null}
                            <span className="shrink-0 text-[11.5px] text-muted">{plural(f.n, "achat")}</span>
                            <b className="v2-num w-[78px] shrink-0 text-right">{fmt(f.total)}</b>
                          </p>
                        ))}
                        {!s.fans.top.length ? <p className="text-[12.5px] text-muted">Aucun acheteur sur la période.</p> : null}
                      </div>
                    </div>
                  </div>
                </section>
                {v.unit === "heure" ? null : (
                  <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 10 }}>
                    <p className="v2-card-title">À quelle heure elle vend</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">Contenus payants et pourboires de la période, par heure de Paris{v.bestHour ? ` · meilleure heure : ${v.bestHour.h} h (${fmt(v.bestHour.sum, 0)})` : ""}</p>
                    <Bars key={`${data?.key}|hours`} pts={v.hourBars} fmt={fmt} height={228} />
                  </section>
                )}
              </div>

              {/* Les abonnés */}
              <section className="v2-card v2-rise mt-3 p-4" style={{ ["--i" as string]: 11 }}>
                <p className="v2-card-title">Abonnés</p>
                <p className="mt-0.5 text-[11.5px] text-muted">{s.platform === "mym" ? "Abonnements lus chez MYM, gratuits compris." : "Nouveaux abonnés comptés par Substy (gratuits compris) ; abonnements payés et renouvellements lus chez Infloww."}</p>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                  <Tile label="Nouveaux abonnés" value={newSubs ? int(newSubs.v) : s.platform === "of" && !ofSubs ? "…" : "—"} chip={newSubs && newSubs.prev != null ? delta(newSubs.v, newSubs.prev) : null} sub={newSubs ? "gratuits compris" : s.platform === "of" && ofSubs ? "Substy ne suit pas ses abonnés" : undefined} />
                  {s.platform === "of" ? <Tile label="Abonnements payés" value={int(s.subs.fresh)} chip={delta(s.subs.fresh, s.subs.freshPrev)} sub="premiers paiements" /> : null}
                  <Tile label="Renouvellements" value={int(s.subs.renewals)} chip={delta(s.subs.renewals, s.subs.renewalsPrev)} sub={s.platform === "mym" ? "fans déjà abonnés avant" : "abonnements reconduits"} />
                  {s.platform === "mym" ? <Tile label="Abonnés actifs" value={s.subs.active != null ? int(s.subs.active) : "—"} chip={s.subs.active != null && s.subs.activeStart != null ? <span className="v2-delta" data-dir={s.subs.active > s.subs.activeStart ? "up" : s.subs.active < s.subs.activeStart ? "down" : "flat"}>{s.subs.active > s.subs.activeStart ? "+" : ""}{int(s.subs.active - s.subs.activeStart)}</span> : null} sub={s.subs.est ? "début de période estimé" : "relevé par Bloom chaque jour"} /> : null}
                  <Tile label="Chiffre par nouvel abonné" value={newSubs && newSubs.v > 0 ? fmt(s.total / newSubs.v) : "—"} sub="chiffre de la période ÷ nouveaux abonnés" title="Ce que rapporte, en moyenne, chaque nouvel abonné de la période." />
                </div>
                {v.unit === "heure" ? null : (
                  <div className={`mt-2 grid gap-x-6 ${v.hasActive ? "xl:grid-cols-2" : ""}`}>
                    <div className="min-w-0">
                      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted"><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: "#38bdf8" }} />{s.subs.paidOnly ? "Abonnements payés" : "Nouveaux abonnés"}</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: "#22d3ee" }} />Renouvellements</span><span>· par {v.unit}</span></p>
                      {s.subs.fresh + s.subs.renewals > 0 ? <Bars key={`${data?.key}|subs`} pts={v.subBars} fmt={(x) => int(Math.round(x))} height={210} whole /> : <p className="py-8 text-center text-[12.5px] text-muted">{s.subs.paidOnly ? "Aucun abonnement payé sur la période (page gratuite, ou pas de nouvel abonné payant)." : "Aucun abonnement sur la période."}</p>}
                    </div>
                    {v.hasActive ? (
                      <div className="min-w-0">
                        <p className="mt-3 text-[11.5px] text-muted">Abonnés actifs, jour après jour{s.subs.est ? " (les jours d’avant le premier relevé sont estimés)" : ""}</p>
                        <Lines key={`${data?.key}|active`} labels={v.labels} series={[{ id: "subs", name: "Abonnés actifs", color: "#38bdf8", values: s.days.map((d) => d.subs) }]} fmt={(x) => int(Math.round(x))} height={210} area />
                      </div>
                    ) : null}
                  </div>
                )}
              </section>

              {/* La messagerie */}
              <section className="v2-card v2-rise mt-3 p-4" style={{ ["--i" as string]: 12 }}>
                <p className="v2-card-title">Messagerie</p>
                <p className="mt-0.5 text-[11.5px] text-muted">Les messages envoyés aux fans de cette modèle, vus par Bloom (120 jours gardés).{chat?.partial ? ` Suivis depuis le ${dayOf(chat.since)} : la période n’est pas complète.` : ""}</p>
                {chat ? (
                  <>
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                      <Tile label="Messages envoyés" value={int(chat.sent)} chip={chat.prev ? delta(chat.sent, chat.prev.sent) : null} />
                      <Tile label="Fans contactés" value={int(chat.fans)} chip={chat.prev ? delta(chat.fans, chat.prev.fans) : null} />
                      <Tile label="Temps de réponse" value={fmtDuration(chat.reply)} chip={chat.prev && chat.reply != null && chat.prev.reply != null ? delta(chat.reply, chat.prev.reply, true) : null} title="En moyenne, du premier message du fan resté sans réponse jusqu’à la réponse (au plus 24 h)." />
                      <Tile label="Payants envoyés" title="Contenus payants envoyés en conversation, vus par Bloom." value={int(chat.ppv)} chip={chat.prev ? delta(chat.ppv, chat.prev.ppv) : null} />
                      <Tile label="Payants achetés" title="Achats repérés sur ces envois." value={int(chat.bought)} chip={chat.prev ? delta(chat.bought, chat.prev.bought) : null} />
                      <Tile label="Taux d’achat" value={chat.ppv ? `${pct(chat.bought, chat.ppv)} %` : "—"} chip={chat.prev && chat.ppv && chat.prev.ppv ? delta(chat.bought / chat.ppv, chat.prev.bought / chat.prev.ppv) : null} title="Contenus payants achetés ÷ contenus payants envoyés." />
                    </div>
                    {authors.length ? (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[560px] text-[12.5px]">
                          <thead>
                            <tr className="text-left text-[10.5px] tracking-[0.1em] text-muted uppercase">
                              <th className="py-2 font-semibold">Qui écrit</th><th className="py-2 text-right font-semibold">Messages</th><th className="py-2 pl-4 font-semibold">Part</th><th className="py-2 text-right font-semibold">Payants envoyés</th><th className="py-2 text-right font-semibold">Achetés</th><th className="py-2 text-right font-semibold">Taux d’achat</th><th className="py-2 text-right font-semibold">Temps de réponse</th>
                            </tr>
                          </thead>
                          <tbody>
                            {authors.map((g) => (
                              <tr key={g.key} className="border-t" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                                <td className="py-2.5 font-semibold">{g.key === "ai" && s.platform === "mym" ? "IA (estimée)" : g.label}</td>
                                <td className="v2-num py-2.5 text-right">{int(g.sent)}</td>
                                <td className="py-2.5 pl-4"><span className="flex items-center gap-2"><span className="h-1 w-[72px] overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}><i className="v2-grow block h-full rounded-full" style={{ width: `${pct(g.sent, chat.sent)}%`, background: "#3b82f6" }} /></span><span className="v2-num text-[11.5px] text-muted">{pct(g.sent, chat.sent)} %</span></span></td>
                                <td className="v2-num py-2.5 text-right">{int(g.ppv)}</td>
                                <td className="v2-num py-2.5 text-right">{int(g.bought)}</td>
                                <td className="v2-num py-2.5 text-right">{g.ppv ? `${pct(g.bought, g.ppv)} %` : "—"}</td>
                                <td className="v2-num py-2.5 text-right">{fmtDuration(g.reply)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className="mt-3 text-[12.5px] text-muted">Aucun message envoyé sur la période.</p>}
                    <p className="mt-2 text-[11.5px] text-muted">« Achetés » = les achats repérés sur ces envois en conversation. Un contenu acheté autrement (envoi groupé fait sur la plateforme, ancien message) n’y est pas : ce nombre peut être plus petit que les ventes du haut de la page.{s.platform === "mym" ? " Côté MYM, la part de l’IA est estimée : Substy ne dit pas quels messages viennent de son IA." : ""}</p>
                  </>
                ) : <p className="mt-3 text-[12.5px] text-muted">Bloom n’a pas encore vu de message pour cette modèle sur cette période.</p>}
              </section>

              {/* Jour par jour */}
              <section className="v2-card v2-rise mt-3 p-4" style={{ ["--i" as string]: 13 }}>
                <p className="v2-card-title">Jour par jour</p>
                <div className="v2-scroll mt-2 max-h-[440px] overflow-auto">
                  <table className="w-full min-w-[760px] text-[12.5px]">
                    <thead className="sticky top-0 z-10" style={{ background: "var(--color-card)" }}>
                      <tr className="text-left text-[10.5px] tracking-[0.1em] text-muted uppercase">
                        <th className="py-2 font-semibold">Jour</th><th className="py-2 text-right font-semibold">Chiffre</th><th className="py-2 text-right font-semibold">Ventes</th><th className="py-2 text-right font-semibold">Acheteurs</th><th className="py-2 text-right font-semibold">{s.subs.paidOnly ? "Abo. payés" : "Nouv. abonnés"}</th><th className="py-2 text-right font-semibold">Renouv.</th><th className="py-2 text-right font-semibold">Messages</th><th className="py-2 text-right font-semibold">Payants envoyés</th><th className="py-2 text-right font-semibold">Achetés</th>{s.platform === "mym" ? <th className="py-2 text-right font-semibold">Abonnés actifs</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {[...s.days].reverse().map((d) => (
                        <tr key={d.day} className="border-t" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                          <td className="py-2 font-medium first-letter:uppercase">{fmtDay(d.day, { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td className="v2-num py-2 text-right font-bold" style={d.total ? undefined : { color: "var(--color-muted)", fontWeight: 500 }}>{fmt(d.total)}</td>
                          <td className="v2-num py-2 text-right">{int(d.n)}</td>
                          <td className="v2-num py-2 text-right">{int(d.buyers)}</td>
                          <td className="v2-num py-2 text-right">{int(d.newSubs)}</td>
                          <td className="v2-num py-2 text-right">{int(d.renewals)}</td>
                          <td className="v2-num py-2 text-right">{d.sent == null ? "—" : int(d.sent)}</td>
                          <td className="v2-num py-2 text-right">{d.ppv == null ? "—" : int(d.ppv)}</td>
                          <td className="v2-num py-2 text-right">{d.bought == null ? "—" : int(d.bought)}</td>
                          {s.platform === "mym" ? <td className="v2-num py-2 text-right">{d.subs == null ? "—" : `${int(d.subs)}${d.subsEst ? " *" : ""}`}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {s.days.some((d) => d.subsEst) ? <p className="mt-2 text-[11.5px] text-muted">* estimé (avant le premier relevé de Bloom).</p> : null}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
