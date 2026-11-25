"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Pencil, Plus, Power, RefreshCw, Search, Share2, Trash2 } from "lucide-react";
import { api, toast } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { Avatar } from "@/rv/components/ui";
import { Bars, cash, Delta, fmtDay, int, Modal, PALETTE, paris, pct, PeriodBar, Ring, Spark, usePeriod, type BarPt } from "../kit";

// Bloom v2 → Liens de suivi : le MÊME écran pour OnlyFans et MYM (25/11/2026, « Constellation »). Il remplace, dans la
// v2, la copie de MyPulse (MymTrack) et celle d'Infloww (TrackingLinks). Lecture : `GET /api/v2/links` (app/v2links.mjs),
// même forme pour les deux plateformes. Ce qui diffère vraiment reste différent :
//  - OnlyFans : liens FAITS PAR BLOOM (« /l/<code> ») — on peut les modifier, les désactiver, leur donner un coût, voir
//    les fans arrivés par chacun (routes « /api/track/… ») ;
//  - MYM : liens du compte MYM — Bloom lit leurs totaux, les crée et les supprime CHEZ MYM, et peut en partager les
//    chiffres sur une page publique (routes « /api/mym/track/… »).
type Trio = { clicks: number; subs: number; revenue: number };
type LinkRow = {
  id: string; name: string; url: string | null; code: string | null; dest: string | null; created: string | null; active: boolean;
  clicks: number; subs: number; revenue: number; buyers: number | null; items: number | null; parts: { subs: number; content: number } | null;
  source: string | null; tags: string[]; cost: number; listId: string | null; listName: string | null; createdBy: string | null;
  period: Trio; prev: Trio; days: [number, number, number][];
};
type ModelRow = { id: string; name: string; avatar: string | null; links: number; subs: number; clicks: number };
type Data = {
  platform: "of" | "mym"; currency: string; mode: "net" | "gross"; canGross: boolean; from: string; to: string; today: string;
  all: { id: string; name: string; avatar: string | null }[]; list: ModelRow[]; native: boolean; canEdit: boolean;
  // Sans modèle (`model` = null), le reste de la réponse est absent : on ne le lit qu'après ce test.
  model: { id: string; name: string; avatar: string | null } | null;
  links: LinkRow[]; days: string[]; period: Trio; prev: Trio; since: string | null; covered: boolean; prevCovered: boolean; at: number | null; error: string | null;
  sources?: string[]; tags?: string[]; profile?: string;
};
type Metric = "revenue" | "clicks" | "subs";
type Win = null | { kind: "new" } | { kind: "shares" } | { kind: "edit" | "delete" | "detail"; link: LinkRow };

const METRICS: [Metric, string, 0 | 1 | 2][] = [["revenue", "Revenus", 2], ["clicks", "Clics", 0], ["subs", "Abonnés", 1]];
const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n > 1 ? many : one}`;
const rate = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—");
const longDay = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDay(d, { day: "numeric", month: "short", year: "numeric" }) : d || "—");
const copyText = (t: string) => navigator.clipboard.writeText(t).then(() => toast("Adresse copiée")).catch(() => toast("Copie impossible", "err"));
const message = (e: unknown) => (e instanceof Error ? e.message : "Action impossible");

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2Links({ pf }: { pf: Pf }) {
  const period = usePeriod();
  const { from, to } = period;
  const modelKey = `bloom.v2.links.model.${pf}`;
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem(modelKey) || "";
    } catch {
      return "";
    }
  });
  const [gross, setGross] = useState(false);
  const [data, setData] = useState<{ key: string; s: Data } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<Metric>("revenue");
  const [q, setQ] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [sort, setSort] = useState<{ key: string; up: boolean }>({ key: "revenue", up: false });
  const [win, setWin] = useState<Win>(null);
  const key = `${from}|${to}|${model}|${gross}`;
  const pickModel = (id: string) => {
    setModel(id);
    setQ("");
    try {
      localStorage.setItem(modelKey, id);
    } catch {}
  };
  // Seule la dernière demande partie compte : en changeant vite de modèle, une réponse en retard ne remplace pas la bonne.
  const seq = useRef(0);
  const load = useCallback(
    (fresh = false) => {
      const id = ++seq.current;
      return api<Data>("GET", `/api/v2/links?pf=${pf}&from=${from}&to=${to}${model ? `&creatorId=${encodeURIComponent(model)}` : ""}${gross ? "&mode=gross" : ""}${fresh ? "&fresh=1" : ""}`)
        .then((s) => void (id === seq.current && (setData({ key: `${from}|${to}|${model}|${gross}`, s }), setErr(""))))
        .catch((e) => void (id === seq.current && setErr(message(e))));
    },
    [pf, from, to, model, gross],
  );
  useEffect(() => {
    void load();
    // La période contient aujourd'hui : les chiffres se rafraîchissent tout seuls.
    const t = to >= paris() ? setInterval(() => document.visibilityState === "visible" && void load(), 60_000) : null;
    return () => {
      if (t) clearInterval(t);
    };
  }, [load, to]);

  const s = data?.s ?? null;
  const m = s?.model ?? null;
  const mid = m?.id ?? "";
  const stale = !!data && data.key !== key;
  const cur = s?.currency ?? (pf === "mym" ? "EUR" : "USD");
  const fmt = (v: number, digits = 2) => cash(v, cur, digits);
  const pfName = pf === "mym" ? "MYM" : "OnlyFans";
  const mym = pf === "mym";
  const urlOf = (l: LinkRow) => l.url ?? (l.code ? `${window.location.origin}/l/${l.code}` : null);
  const colorOf = (id: string) => PALETTE[Math.max(0, (m && s ? s.links : []).findIndex((l) => l.id === id)) % PALETTE.length];
  const modelColor = (id: string) => PALETTE[Math.max(0, (s?.all ?? []).findIndex((x) => x.id === id)) % PALETTE.length];

  const v = useMemo(() => {
    if (!s || !s.model) return null;
    const n = s.days.length;
    const life = s.links.reduce((x, l) => ({ clicks: x.clicks + l.clicks, subs: x.subs + l.subs, revenue: x.revenue + l.revenue }), { clicks: 0, subs: 0, revenue: 0 });
    const perDay = s.days.map((_, i) => s.links.reduce((x, l) => [x[0] + (l.days[i]?.[0] || 0), x[1] + (l.days[i]?.[1] || 0), x[2] + (l.days[i]?.[2] || 0)], [0, 0, 0]));
    // La période n'est comparable à celle d'avant que si les deux sont entièrement connues (MYM : depuis le 1er relevé).
    const comparable = s.covered && s.prevCovered && n <= 180;
    // Premier jour dont le détail est connu côté MYM : le lendemain du premier relevé.
    const known = s.since ? fmtDay(new Date(Date.parse(`${s.since}T12:00:00Z`) + 864e5).toISOString().slice(0, 10), { day: "numeric", month: "long" }) : null;
    return { n, life, perDay, comparable, known, unit: n > 62 ? "mois" : "jour" };
  }, [s]);

  const chart = useMemo(() => {
    if (!s || !s.model || !v) return null;
    const k = METRICS.find((x) => x[0] === metric)![2];
    // Les sept liens qui pèsent le plus sur la période pour cette mesure ; les autres sont regroupés.
    const weight = (l: LinkRow) => l.days.reduce((a, d) => a + d[k], 0);
    const ranked = [...s.links].sort((a, b) => weight(b) - weight(a));
    const top = ranked.slice(0, 7).filter((l) => weight(l) > 0);
    const rest = ranked.filter((l) => !top.includes(l));
    type G = { key: string; label: string; title: string; idx: number[] };
    let groups: G[];
    if (v.unit === "mois") {
      const by = new Map<string, G>();
      s.days.forEach((d, i) => {
        const mo = d.slice(0, 7);
        const g = by.get(mo) ?? { key: mo, label: fmtDay(mo + "-01", { month: "short" }), title: fmtDay(mo + "-01", { month: "long", year: "numeric" }), idx: [] };
        g.idx.push(i);
        by.set(mo, g);
      });
      groups = [...by.values()];
    } else groups = s.days.map((d, i) => ({ key: d, label: fmtDay(d, { day: "2-digit" }), title: fmtDay(d, { weekday: "long", day: "numeric", month: "long" }), idx: [i] }));
    const sumOf = (l: LinkRow, idx: number[]) => idx.reduce((a, i) => a + (l.days[i]?.[k] || 0), 0);
    const pts: BarPt[] = groups.map((g) => ({
      key: g.key, label: g.label, title: g.title,
      parts: [...top.map((l) => ({ v: sumOf(l, g.idx), color: PALETTE[Math.max(0, s.links.indexOf(l)) % PALETTE.length], label: l.name })), ...(rest.length ? [{ v: rest.reduce((a, l) => a + sumOf(l, g.idx), 0), color: "#52525b", label: "Autres liens" }] : [])],
    }));
    return { pts, top, any: s.links.some((l) => weight(l) > 0) };
  }, [s, v, metric]);

  // Colonnes du tableau : les mêmes pour les deux plateformes, puis ce que seule l'une des deux sait donner.
  const cols = useMemo(() => {
    const money = (x: number) => cash(x, cur);
    const base: { key: string; label: string; title?: string; get: (l: LinkRow) => number | null; show: (l: LinkRow) => string; tone?: (l: LinkRow) => string | undefined }[] = [
      { key: "clicks", label: "Clics", get: (l) => l.clicks, show: (l) => int(l.clicks) },
      { key: "subs", label: "Abonnés", title: "Abonnés arrivés par ce lien", get: (l) => l.subs, show: (l) => int(l.subs) },
      { key: "rate", label: "Taux", title: "Abonnés ÷ clics", get: (l) => (l.clicks ? l.subs / l.clicks : 0), show: (l) => rate(l.subs, l.clicks) },
      { key: "revenue", label: "Revenus", title: "Ce qu’ont dépensé les abonnés arrivés par ce lien", get: (l) => l.revenue, show: (l) => money(l.revenue) },
      { key: "perSub", label: "Par abonné", title: "Revenus ÷ abonnés", get: (l) => (l.subs ? l.revenue / l.subs : 0), show: (l) => (l.subs ? money(l.revenue / l.subs) : "—") },
    ];
    if (mym) return [...base, { key: "items", label: "Achats", title: "Contenus payants achetés par ces abonnés", get: (l: LinkRow) => l.items, show: (l: LinkRow) => int(l.items ?? 0) }];
    return [
      ...base,
      { key: "buyers", label: "Acheteurs", title: "Abonnés qui ont dépensé au moins une fois", get: (l: LinkRow) => l.buyers, show: (l: LinkRow) => `${int(l.buyers ?? 0)}${l.subs ? ` · ${pct(l.buyers ?? 0, l.subs)} %` : ""}` },
      { key: "cost", label: "Coût", title: "Ce que la promo a coûté (saisi à la main)", get: (l: LinkRow) => l.cost, show: (l: LinkRow) => (l.cost ? money(l.cost) : "—") },
      { key: "profit", label: "Bénéfice", title: "Revenus − coût", get: (l: LinkRow) => l.revenue - l.cost, show: (l: LinkRow) => (l.cost ? money(l.revenue - l.cost) : "—"), tone: (l: LinkRow) => (!l.cost ? undefined : l.revenue - l.cost >= 0 ? "var(--v2-up)" : "var(--v2-down)") },
      { key: "roi", label: "ROI", title: "Bénéfice ÷ coût", get: (l: LinkRow) => (l.cost ? (l.revenue - l.cost) / l.cost : null), show: (l: LinkRow) => (l.cost ? `${Math.round(((l.revenue - l.cost) / l.cost) * 100)} %` : "—") },
    ];
  }, [mym, cur]);
  const rows = useMemo(() => {
    if (!s || !s.model) return [];
    const col = cols.find((c) => c.key === sort.key);
    const word = q.trim().toLowerCase();
    return s.links
      .filter((l) => (showOff || l.active) && (!word || l.name.toLowerCase().includes(word) || (l.source || "").toLowerCase().includes(word) || l.tags.some((t) => t.toLowerCase().includes(word))))
      .sort((a, b) => {
        const x = sort.key === "name" ? a.name.localeCompare(b.name, "fr") : sort.key === "created" ? (a.created || "").localeCompare(b.created || "") : (col?.get(a) ?? -Infinity) - (col?.get(b) ?? -Infinity);
        return sort.up ? x : -x;
      });
  }, [s, cols, sort, q, showOff]);
  const sortBy = (k: string) => setSort((o) => ({ key: k, up: o.key === k ? !o.up : k === "name" }));
  const off = m && s ? s.links.filter((l) => !l.active).length : 0;

  const refresh = () => {
    setBusy(true);
    load(true).finally(() => setBusy(false));
  };
  const toggle = async (l: LinkRow) => {
    try {
      await api("POST", "/api/track/links/active", { creatorId: mid, ids: [Number(l.id)], active: !l.active });
      toast(l.active ? "Lien désactivé : ses clics ne sont plus comptés" : "Lien réactivé");
      await load();
    } catch (e) {
      toast(message(e), "err");
    }
  };

  // Le total depuis la création en grand (ce que les deux plateformes savent donner), la période choisie en dessous.
  const stat = (label: string, total: React.ReactNode, onPeriod: string, now: number, before: number, spark: number[], color: string, i: number, hi = false) => (
    <div className={`v2-card v2-rise p-4 ${hi ? "hi" : ""}`} style={{ ["--i" as string]: i }}>
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className="v2-big mt-1" style={{ fontSize: 25 }}>{total}</p>
      <p className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted"><span><b className="v2-num font-semibold" style={{ color: "var(--color-fg)" }}>{onPeriod}</b> sur la période</span>{v?.comparable ? <Delta now={now} before={before} quiet /> : null}</p>
      {spark.length > 1 ? <div className="mt-2"><Spark key={`${data?.key}|${label}`} v={spark} color={color} h={38} /></div> : null}
    </div>
  );
  const head = (k: string, label: string, title?: string, left = false) => (
    <th className={`py-2 font-semibold ${left ? "text-left" : "pl-3 text-right"}`}>
      <button onClick={() => sortBy(k)} title={title} className={`inline-flex items-center gap-1 tracking-[0.1em] uppercase hover:text-(--color-fg) ${sort.key === k ? "text-(--color-fg)" : ""}`}>
        {label}{sort.key === k ? sort.up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Statistiques · {pfName}</p>
          <h1 className="v2-h1 mt-1">Liens de suivi</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {s?.canGross ? (
            <div className="v2-segbar" title="Net : ce que touche l’agence après la commission d’OnlyFans. Brut : ce que les fans ont payé.">
              <button className="v2-seg" data-on={!gross} onClick={() => setGross(false)}>Net</button>
              <button className="v2-seg" data-on={gross} onClick={() => setGross(true)}>Brut</button>
            </div>
          ) : null}
          {mym && m ? <button onClick={refresh} disabled={busy} className="v2-select" title="Relire les liens sur le site de MYM"><RefreshCw className={`size-4 text-muted ${busy ? "animate-spin" : ""}`} />Actualiser</button> : null}
          {mym && m && s?.canEdit ? <button onClick={() => setWin({ kind: "shares" })} className="v2-select" title="Montrer les chiffres de certains liens sur une page publique"><Share2 className="size-4 text-muted" />Partages</button> : null}
          {m && s?.canEdit ? <button onClick={() => setWin({ kind: "new" })} className="v2-btn" style={{ height: 36 }}><Plus className="size-4" />Nouveau lien</button> : null}
        </div>
      </div>
      <PeriodBar period={period} />
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* La colonne des modèles : celles qui gagnent le plus d'abonnés par leurs liens d'abord */}
        <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 2 }}>
          <div className="v2-card p-1.5">
            <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Modèles</p>
            <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:max-h-[calc(100dvh-230px)] lg:space-y-0.5 lg:overflow-y-auto">
              {(s?.list ?? []).map((x) => (
                <button key={x.id} onClick={() => pickModel(x.id)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.id} aria-pressed={mid === x.id} title={`Voir les liens de ${x.name}`}>
                  <Ring color={modelColor(x.id)}><Avatar src={x.avatar} name={x.name} size="size-8" /></Ring>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted">{x.links ? `${plural(x.links, "lien")} · ${plural(x.subs, "abonné")}` : "aucun lien"}</span>
                  </span>
                </button>
              ))}
              {s && !s.list.length ? <p className="px-2 py-3 text-[12.5px] text-muted">Aucune modèle {pfName}.</p> : null}
              {!s ? <p className="px-2 py-3 text-[12.5px] text-muted">Chargement…</p> : null}
            </div>
          </div>
        </aside>

        <div className="min-w-0" style={{ opacity: stale ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
          {s && !m ? <div className="v2-card v2-rise p-8 text-center text-[13.5px] text-muted">Aucune modèle {pfName} pour l’instant.</div> : null}
          {!s && !err ? <div className="v2-card p-8 text-center text-[13.5px] text-muted">Chargement…</div> : null}
          {s && m && v && chart ? (
            <>
              <div className="v2-rise flex flex-wrap items-center gap-3" style={{ ["--i" as string]: 2 }}>
                <Ring color={modelColor(m.id)}><Avatar src={m.avatar} name={m.name} size="size-11" /></Ring>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[19px] leading-tight font-bold tracking-[-0.02em]">{m.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {mym ? `${s.links.length ? plural(s.links.length, "lien") : "Aucun lien"} sur son compte MYM${s.at ? ` · lus à ${new Date(s.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}` : `${s.links.length - off ? plural(s.links.length - off, "lien Bloom actif", "liens Bloom actifs") : "Aucun lien Bloom actif"}${off ? ` · ${plural(off, "désactivé")}` : ""}`}
                  </p>
                </div>
              </div>
              {s.error ? <p className="mt-3 rounded-xl border px-4 py-3 text-[12.5px]" style={{ borderColor: "rgb(245 158 11 / 0.3)", background: "rgb(245 158 11 / 0.06)", color: "#fbbf24" }}>La dernière lecture chez MYM a échoué : {s.error} Les chiffres affichés sont ceux de la lecture d’avant.</p> : null}

              {!s.links.length ? (
                <div className="v2-card v2-rise mt-3 p-8 text-center">
                  <p className="text-[15px] font-bold">Aucun lien de suivi pour {m.name}</p>
                  <p className="mx-auto mt-2 max-w-[520px] text-[13px] text-muted">{mym ? "Un lien de suivi MYM dit combien de clics, d’abonnés et de revenus viennent d’un endroit précis (bio Instagram, TikTok, une campagne…)." : "Un lien de suivi Bloom renvoie vers la page OnlyFans de la modèle en comptant les clics : on sait ensuite combien d’abonnés et de revenus viennent de chaque endroit (bio Instagram, Reddit, une campagne…)."}</p>
                  {s.canEdit ? <button onClick={() => setWin({ kind: "new" })} className="v2-btn mt-4"><Plus className="size-4" />Créer le premier lien</button> : null}
                </div>
              ) : (
                <>
                  {/* Ce que tous ses liens ont rapporté depuis leur création, et sur la période choisie */}
                  <p className="v2-rise mt-4 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase" style={{ ["--i" as string]: 3 }}>Tous ses liens, depuis leur création</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {stat("Clics", int(v.life.clicks), `+${int(s.period.clicks)}`, s.period.clicks, s.prev.clicks, v.perDay.map((d) => d[0]), "#3b82f6", 3, true)}
                    {stat("Abonnés gagnés", int(v.life.subs), `+${int(s.period.subs)}`, s.period.subs, s.prev.subs, v.perDay.map((d) => d[1]), "#a78bfa", 4)}
                    {stat("Taux de conversion", rate(v.life.subs, v.life.clicks), rate(s.period.subs, s.period.clicks), s.period.clicks ? s.period.subs / s.period.clicks : 0, s.prev.clicks ? s.prev.subs / s.prev.clicks : 0, v.perDay.map((d) => (d[0] ? d[1] / d[0] : 0)), "#34d399", 5)}
                    {stat(`Revenus${s.canGross ? (s.mode === "gross" ? " bruts" : " nets") : ""}`, fmt(v.life.revenue), `+${fmt(s.period.revenue)}`, s.period.revenue, s.prev.revenue, v.perDay.map((d) => d[2]), "#fbbf24", 6)}
                  </div>
                  {mym && !s.covered ? <p className="mt-3 rounded-xl border px-4 py-3 text-[12.5px] text-muted" style={{ borderColor: "rgb(59 130 246 / 0.3)", background: "rgb(59 130 246 / 0.06)" }}>MYM ne donne que le total de chaque lien. Bloom relève ces totaux chaque jour depuis le {s.since ? longDay(s.since) : "début de ses relevés"} : {v.known ? `le détail par jour n’existe qu’à partir du ${v.known}, les chiffres « sur la période » ne comptent donc que depuis cette date.` : "le détail par jour arrivera avec le prochain relevé."}</p> : null}

                  <section className="v2-card v2-rise mt-3 min-w-0 p-4" style={{ ["--i" as string]: 7 }}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <p className="v2-card-title flex-1">Par {v.unit}</p>
                      <div className="v2-segbar">{METRICS.map(([k, l]) => <button key={k} className="v2-seg" data-on={metric === k} onClick={() => setMetric(k)}>{l}</button>)}</div>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
                      {chart.top.map((l) => <span key={l.id} className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: colorOf(l.id) }} />{l.name}</span>)}
                    </p>
                    {chart.any ? <Bars key={`${data?.key}|${metric}`} pts={chart.pts} fmt={metric === "revenue" ? fmt : (x) => int(Math.round(x))} whole={metric !== "revenue"} /> : <p className="py-12 text-center text-[12.5px] text-muted">{mym ? "Aucun changement relevé sur la période dans les chiffres que MYM donne pour ses liens." : "Rien sur la période pour cette mesure."}</p>}
                  </section>

                  {/* Tous les liens, avec leurs totaux depuis la création */}
                  <section className="v2-card v2-rise mt-3 min-w-0 p-4" style={{ ["--i" as string]: 8 }}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="v2-card-title">Les liens</p>
                        <p className="mt-0.5 text-[11.5px] text-muted">Totaux depuis la création de chaque lien. Un clic sur un titre de colonne trie le tableau.</p>
                      </div>
                      {off ? <button onClick={() => setShowOff(!showOff)} className="v2-seg border" data-on={showOff} style={{ borderColor: "var(--color-line)", height: 34 }}>{showOff ? "Masquer" : "Afficher"} les désactivés ({off})</button> : null}
                      {s.links.length > 6 ? <label className="flex h-[34px] w-[210px] items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}><Search className="size-3.5 shrink-0 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un lien" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" /></label> : null}
                    </div>
                    <div className="v2-scroll mt-2 overflow-x-auto">
                      <table className="w-full text-[12.5px]" style={{ minWidth: mym ? 820 : 1080 }}>
                        <thead>
                          <tr className="text-[10.5px] text-muted">
                            {head("name", "Lien", undefined, true)}
                            {cols.map((c) => <Fragment key={c.key}>{head(c.key, c.label, c.title)}</Fragment>)}
                            <th className="w-px py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((l) => {
                            const url = urlOf(l);
                            return (
                              <tr key={l.id} className="border-t" style={{ borderColor: "rgb(255 255 255 / 0.05)", opacity: l.active ? 1 : 0.5 }}>
                                <td className="py-2.5 pr-2">
                                  <span className="flex items-center gap-2.5">
                                    <i className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(l.id) }} />
                                    <span className="min-w-0">
                                      <b className="block max-w-[230px] truncate text-[13.5px]">{l.name}{l.active ? null : <span className="ml-2 text-[11px] font-medium text-muted">désactivé</span>}</b>
                                      <span className="mt-0.5 flex max-w-[260px] items-center gap-1.5 text-[11.5px] text-muted">
                                        <span className="truncate">{[`créé le ${longDay(l.created)}`, l.source, ...l.tags.map((t) => `#${t}`)].filter(Boolean).join(" · ")}</span>
                                        {url ? <button onClick={() => copyText(url)} title={`Copier l’adresse du lien : ${url}`} className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold hover:bg-white/[0.06]" style={{ color: "var(--v2-sky)" }}><Copy className="size-3" />Copier</button> : null}
                                      </span>
                                    </span>
                                  </span>
                                </td>
                                {cols.map((c) => <td key={c.key} className="v2-num py-2.5 pl-3 text-right whitespace-nowrap" style={{ color: c.tone?.(l), fontWeight: c.key === "revenue" ? 700 : undefined }}>{c.show(l)}</td>)}
                                <td className="py-2.5 pl-3">
                                  <span className="flex justify-end gap-1">
                                    {mym ? (
                                      s.canEdit ? <button onClick={() => setWin({ kind: "delete", link: l })} title="Supprimer ce lien sur le compte MYM" className="v2-sq" style={{ width: 30, height: 30 }}><Trash2 className="size-3.5" /></button> : null
                                    ) : (
                                      <>
                                        <button onClick={() => setWin({ kind: "detail", link: l })} title="Voir les fans arrivés par ce lien" className="v2-sq" style={{ width: 30, height: 30 }}><Eye className="size-3.5" /></button>
                                        <button onClick={() => setWin({ kind: "edit", link: l })} title="Modifier ce lien" className="v2-sq" style={{ width: 30, height: 30 }}><Pencil className="size-3.5" /></button>
                                        <button onClick={() => toggle(l)} title={l.active ? "Désactiver : le lien redirige toujours, mais ses clics ne sont plus comptés" : "Réactiver ce lien"} className="v2-sq" data-on={!l.active} style={{ width: 30, height: 30 }}><Power className="size-3.5" /></button>
                                      </>
                                    )}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {rows.length > 1 ? (
                            <tr className="border-t font-bold" style={{ borderColor: "rgb(255 255 255 / 0.12)" }}>
                              <td className="py-2.5">Total ({rows.length} liens)</td>
                              {cols.map((c) => {
                                const sum = (f: (l: LinkRow) => number) => rows.reduce((a, l) => a + f(l), 0);
                                const t: Record<string, string> = { clicks: int(sum((l) => l.clicks)), subs: int(sum((l) => l.subs)), rate: rate(sum((l) => l.subs), sum((l) => l.clicks)), revenue: fmt(sum((l) => l.revenue)), perSub: sum((l) => l.subs) ? fmt(sum((l) => l.revenue) / sum((l) => l.subs)) : "—", items: int(sum((l) => l.items ?? 0)), buyers: int(sum((l) => l.buyers ?? 0)), cost: sum((l) => l.cost) ? fmt(sum((l) => l.cost)) : "—", profit: sum((l) => l.cost) ? fmt(sum((l) => l.revenue - l.cost)) : "—", roi: "" };
                                return <td key={c.key} className="v2-num py-2.5 pl-3 text-right whitespace-nowrap">{t[c.key] ?? ""}</td>;
                              })}
                              <td />
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    {!rows.length ? <p className="py-6 text-center text-[13px] text-muted">Aucun lien ne correspond.</p> : null}
                    <p className="mt-3 text-[11.5px] text-muted">{mym ? "Chiffres donnés par MYM pour chaque lien de son compte. Créer ou supprimer un lien agit directement sur le compte MYM de la modèle." : "Les clics sont comptés en direct. Chaque nouvel abonné est rattaché au dernier clic fait sur un lien Bloom dans les 30 minutes d’avant ; ses dépenses, vues chez Substy, comptent ensuite pour ce lien."}</p>
                  </section>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>

      {win?.kind === "new" && m && s ? (mym ? <MymNew creatorId={m.id} name={m.name} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : <OfForm creatorId={m.id} link={null} sources={s.sources ?? []} tags={s.tags ?? []} profile={s.profile ?? "https://onlyfans.com/"} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} />) : null}
      {win?.kind === "edit" && m && s ? <OfForm creatorId={m.id} link={win.link} sources={s.sources ?? []} tags={s.tags ?? []} profile={s.profile ?? "https://onlyfans.com/"} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : null}
      {win?.kind === "detail" && m ? <OfDetail link={win.link} url={urlOf(win.link)} gross={gross} onClose={() => setWin(null)} /> : null}
      {win?.kind === "delete" && m ? <MymDelete creatorId={m.id} link={win.link} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : null}
      {win?.kind === "shares" && m && s ? <MymShares creatorId={m.id} links={s.links} onClose={() => setWin(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- OnlyFans : créer / modifier un lien de Bloom
function OfForm({ creatorId, link, sources, tags, profile, onClose, onDone }: { creatorId: string; link: LinkRow | null; sources: string[]; tags: string[]; profile: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: link?.name ?? "", source: link?.source ?? "Instagram", dest: link?.dest ?? profile, cost: link?.cost ? String(link.cost / 100) : "", tags: link?.tags ?? [], listId: link?.listId ?? "", listName: link?.listName ?? "" });
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ id: string; name: string }[]>("GET", `/api/fan-lists?creatorId=${encodeURIComponent(creatorId)}`).then((r) => setLists(Array.isArray(r) ? r : [])).catch(() => {});
  }, [creatorId]);
  const known = [...new Set([...tags, ...f.tags])];
  const addTag = () => {
    const t = tag.trim().slice(0, 40);
    if (t && !f.tags.includes(t)) setF({ ...f, tags: [...f.tags, t] });
    setTag("");
  };
  const destOk = /^https:\/\/([\w-]+\.)*onlyfans\.com\/[^\s/?#]/i.test(f.dest.trim());
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/track/links", { creatorId, id: link ? Number(link.id) : undefined, name: f.name, source: f.source, dest: f.dest.trim(), cost: Number(f.cost.replace(",", ".")) || 0, tags: f.tags, listId: f.listId || null, listName: f.listName || null });
      toast(link ? "Lien modifié" : "Lien créé");
      onDone();
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  return (
    <Modal title={link ? "Modifier le lien" : "Nouveau lien de suivi"} sub="Un lien Bloom compte les clics puis renvoie vers la page OnlyFans de la modèle." onClose={onClose}>
      <label className="v2-label" htmlFor="lk-name">Nom du lien</label>
      <input id="lk-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} placeholder="Ex : Bio Instagram, Reddit novembre" className="v2-field" />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="v2-label" htmlFor="lk-source">D’où viennent les clics</label>
          <select id="lk-source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className="v2-field" style={{ colorScheme: "dark" }}>
            {[...new Set([...sources, f.source])].map((x) => <option key={x} value={x} style={{ background: "#121215" }}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="v2-label" htmlFor="lk-cost">Coût de la promo, en $ <span className="font-normal">(facultatif)</span></label>
          <input id="lk-cost" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="0" className="v2-field" />
        </div>
      </div>
      <label className="v2-label mt-3" htmlFor="lk-dest">Page OnlyFans de destination</label>
      <input id="lk-dest" value={f.dest} onChange={(e) => setF({ ...f, dest: e.target.value })} placeholder="https://onlyfans.com/son-pseudo" className="v2-field" style={f.dest && !destOk ? { borderColor: "var(--v2-down)" } : undefined} />
      <p className="mt-1 text-[11.5px]" style={{ color: f.dest && !destOk ? "var(--v2-down)" : "var(--color-muted)" }}>L’adresse complète de sa page : https://onlyfans.com/son-pseudo</p>
      <p className="v2-label mt-3">Tags <span className="font-normal">(facultatif)</span></p>
      <div className="flex flex-wrap items-center gap-1.5">
        {known.map((t) => {
          const on = f.tags.includes(t);
          return <button key={t} type="button" onClick={() => setF({ ...f, tags: on ? f.tags.filter((x) => x !== t) : [...f.tags, t] })} className="v2-seg border" data-on={on} style={{ borderColor: "var(--color-line)" }}>#{t}</button>;
        })}
        <input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} onBlur={addTag} placeholder="+ ajouter" className="h-[26px] w-[92px] rounded-[7px] border bg-transparent px-2 text-[12px] outline-none focus:border-(--v2-blue)" style={{ borderColor: "var(--color-line)" }} />
      </div>
      {lists.length ? (
        <>
          <label className="v2-label mt-3" htmlFor="lk-list">Liste de fans <span className="font-normal">(facultatif)</span></label>
          <select id="lk-list" value={f.listId} onChange={(e) => setF({ ...f, listId: e.target.value, listName: lists.find((l) => l.id === e.target.value)?.name ?? "" })} className="v2-field" style={{ colorScheme: "dark" }}>
            <option value="" style={{ background: "#121215" }}>Aucune</option>
            {lists.map((l) => <option key={l.id} value={l.id} style={{ background: "#121215" }}>{l.name}</option>)}
          </select>
          <p className="mt-1 text-[11.5px] text-muted">La liste est gardée avec le lien ; l’ajout automatique des fans viendra quand Substy le permettra.</p>
        </>
      ) : null}
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button onClick={save} disabled={busy || !f.name.trim() || !destOk} className="v2-btn">{busy ? "Enregistrement…" : link ? "Enregistrer" : "Créer le lien"}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- OnlyFans : les fans arrivés par un lien
type FanRow = { fanId: string; name: string; username: string | null; subscribedAt: number | null; total: number; subs: number; posts: number; messages: number; streams: number; tips: number };
function OfDetail({ link, url, gross, onClose }: { link: LinkRow; url: string | null; gross: boolean; onClose: () => void }) {
  const [fans, setFans] = useState<FanRow[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ fans: FanRow[] }>("GET", `/api/track/details?id=${encodeURIComponent(link.id)}&net=${gross ? 0 : 1}`).then((r) => setFans(r.fans)).catch((e) => setErr(message(e)));
  }, [link.id, gross]);
  const usd = (cents: number) => cash(cents, "USD");
  const per = (a: number, b: number) => (b > 0 ? usd(a / b) : "—");
  const tiles: [string, string, string?][] = [
    ["Clics", int(link.clicks)], ["Abonnés", int(link.subs), `${rate(link.subs, link.clicks)} des clics`], ["Acheteurs", int(link.buyers ?? 0), `${rate(link.buyers ?? 0, link.subs)} des abonnés`], [`Revenus ${gross ? "bruts" : "nets"}`, usd(link.revenue)],
    ["Coût de la promo", link.cost ? usd(link.cost) : "—"], ["Bénéfice", link.cost ? usd(link.revenue - link.cost) : "—", link.cost ? `ROI ${Math.round(((link.revenue - link.cost) / link.cost) * 100)} %` : undefined], ["Par clic", per(link.revenue, link.clicks), link.cost ? `coût ${per(link.cost, link.clicks)}` : "revenu"], ["Par abonné", per(link.revenue, link.subs), link.cost ? `coût ${per(link.cost, link.subs)}` : "revenu"],
  ];
  return (
    <Modal wide title={link.name} sub={[`créé le ${longDay(link.created)}`, link.createdBy ? `par ${link.createdBy}` : null, link.source, ...link.tags.map((t) => `#${t}`), link.listName ? `liste « ${link.listName} »` : null].filter(Boolean).join(" · ")} onClose={onClose}>
      {url ? <button onClick={() => copyText(url)} className="flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left text-[12.5px]" style={{ borderColor: "var(--color-line)" }} title="Copier l’adresse du lien"><span className="min-w-0 flex-1 truncate font-mono">{url}</span><span className="text-muted">→</span><span className="min-w-0 max-w-[40%] truncate text-muted">{link.dest}</span><Copy className="size-3.5 shrink-0" style={{ color: "var(--v2-sky)" }} /></button> : null}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="min-w-0 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.02)" }}>
            <p className="truncate text-[11.5px] text-muted">{label}</p>
            <p className="v2-num mt-1 truncate text-[17px] leading-tight font-bold">{value}</p>
            {sub ? <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p> : null}
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">Fans arrivés par ce lien{fans ? ` · ${fans.length}` : ""}</p>
      {err ? <p className="mt-2 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="v2-scroll mt-1 max-h-[320px] overflow-auto">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead className="sticky top-0" style={{ background: "#0e0e11" }}>
            <tr className="text-left text-[10.5px] tracking-[0.1em] text-muted uppercase">
              <th className="py-2 font-semibold">Fan</th><th className="py-2 text-right font-semibold">Abonné le</th>{["Total", "Abonnement", "Messages", "Pourboires", "Publications", "Lives"].map((h) => <th key={h} className="py-2 pl-3 text-right font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(fans ?? []).map((x) => (
              <tr key={x.fanId} className="border-t" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                <td className="py-2"><b className="block max-w-[200px] truncate">{x.name}</b><span className="text-[11.5px] text-muted">@{x.username || x.fanId}</span></td>
                <td className="py-2 text-right text-muted">{x.subscribedAt ? fmtDay(paris(new Date(x.subscribedAt)), { day: "numeric", month: "short" }) : "—"}</td>
                {([x.total, x.subs, x.messages, x.tips, x.posts, x.streams] as number[]).map((n, i) => <td key={i} className="v2-num py-2 pl-3 text-right" style={i === 0 ? { fontWeight: 700 } : n ? undefined : { color: "var(--color-muted)" }}>{usd(Math.round(n * 100))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {fans && !fans.length ? <p className="py-6 text-center text-[12.5px] text-muted">Aucun abonné rattaché à ce lien pour l’instant.</p> : null}
        {!fans && !err ? <p className="py-6 text-center text-[12.5px] text-muted">Chargement…</p> : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- MYM : créer / supprimer un lien sur le compte
function MymNew({ creatorId, name: who, onClose, onDone }: { creatorId: string; name: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = /^[a-zA-Z0-9_-]{1,60}$/.test(name);
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/mym/track/create", { creatorId, name });
      toast("Lien créé sur le compte MYM");
      onDone();
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  return (
    <Modal title="Nouveau lien de suivi" sub={`Le lien est créé tout de suite sur le compte MYM de ${who}, puis affiché ici.`} onClose={onClose}>
      <label className="v2-label" htmlFor="ml-name">Nom du lien</label>
      <input id="ml-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok && !busy && go()} maxLength={60} placeholder="Ex : Insta_Bio, TikTok-Campagne" className="v2-field" style={name && !ok ? { borderColor: "var(--v2-down)" } : undefined} />
      <p className="mt-1.5 text-[11.5px]" style={{ color: name && !ok ? "var(--v2-down)" : "var(--color-muted)" }}>Lettres, chiffres, tiret (-) et tiret bas (_) seulement : MYM refuse les espaces, les accents et la ponctuation.</p>
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button onClick={go} disabled={!ok || busy} className="v2-btn">{busy ? "Création…" : "Créer le lien"}</button>
      </div>
    </Modal>
  );
}

function MymDelete({ creatorId, link, onClose, onDone }: { creatorId: string; link: LinkRow; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/mym/track/delete", { creatorId, id: link.id, confirm: true });
      toast("Lien supprimé sur le compte MYM");
      onDone();
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  return (
    <Modal title="Supprimer ce lien de suivi ?" onClose={onClose}>
      <p className="text-[13px] leading-relaxed text-muted">Le lien <b style={{ color: "var(--color-fg)" }}>{link.name}</b> sera supprimé sur le compte MYM. Son adresse ne fonctionnera plus et MYM n’affichera plus ses chiffres ({int(link.clicks)} clics, {int(link.subs)} abonnés) : <b style={{ color: "var(--color-fg)" }}>ce n’est pas récupérable</b>.</p>
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button onClick={go} disabled={busy} className="v2-btn" data-kind="danger">{busy ? "Suppression…" : "Supprimer le lien"}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- MYM : pages publiques de partage
type Share = { id: string; name: string; hasPassword: boolean; expires: number | null; links: string[]; by: string | null; at: number };
function MymShares({ creatorId, links, onClose }: { creatorId: string; links: LinkRow[]; onClose: () => void }) {
  const [list, setList] = useState<Share[] | null>(null);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState("");
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState("");
  const load = useCallback(() => api<{ shares: Share[] }>("GET", `/api/mym/track/shares?creatorId=${encodeURIComponent(creatorId)}`).then((r) => setList(r.shares)).catch((e) => setErr(message(e))), [creatorId]);
  useEffect(() => void load(), [load]);
  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ token: string }>("POST", "/api/mym/track/share", { creatorId, name, password, links: picked, expires: expires ? new Date(expires).getTime() : null });
      setMade(`${window.location.origin}/partage/${r.token}`);
      setName("");
      setPassword("");
      setExpires("");
      setPicked([]);
      await load();
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  const revoke = async (id: string) => {
    await api("POST", "/api/mym/track/share/delete", { creatorId, id }).then(() => toast("Partage supprimé : son adresse ne marche plus")).catch((e) => toast(message(e), "err"));
    void load();
  };
  return (
    <Modal wide title="Partages des chiffres" sub="Une page publique, sans compte Bloom, qui montre les chiffres de quelques liens : pour une agence partenaire ou un rapport. Mot de passe et date de fin au choix." onClose={onClose}>
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.02)" }}>
        <p className="text-[13.5px] font-bold">Créer un partage</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><label className="v2-label" htmlFor="sh-name">Nom (pour s’y retrouver)</label><input id="sh-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex : Rapport hebdo" className="v2-field" /></div>
          <div><label className="v2-label" htmlFor="sh-end">Date de fin <span className="font-normal">(facultatif)</span></label><input id="sh-end" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} className="v2-field" style={{ colorScheme: "dark" }} /></div>
          <div><label className="v2-label" htmlFor="sh-pw">Mot de passe <span className="font-normal">(facultatif)</span></label><input id="sh-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={200} placeholder="Vide = accès libre" className="v2-field" /></div>
        </div>
        <p className="v2-label mt-3">Liens montrés <button type="button" onClick={() => setPicked(picked.length === links.length ? [] : links.map((l) => l.id))} className="ml-2 font-semibold" style={{ color: "var(--v2-sky)" }}>{picked.length === links.length ? "Tout décocher" : "Tout cocher"}</button></p>
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => {
            const on = picked.includes(l.id);
            return <button key={l.id} type="button" onClick={() => setPicked(on ? picked.filter((x) => x !== l.id) : [...picked, l.id])} className="v2-seg border" data-on={on} aria-pressed={on} style={{ borderColor: "var(--color-line)" }}>{l.name}</button>;
          })}
        </div>
        {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
        <div className="mt-4 flex justify-end"><button onClick={create} disabled={busy || !picked.length} className="v2-btn">{busy ? "Création…" : "Créer le partage"}</button></div>
        {made ? (
          <div className="mt-3 rounded-[10px] border px-3 py-2.5 text-[12.5px]" style={{ borderColor: "rgb(16 185 129 / 0.4)", background: "rgb(16 185 129 / 0.08)" }}>
            <p style={{ color: "var(--v2-up)" }}>Partage créé. Copie son adresse maintenant : elle ne sera plus affichée.</p>
            <button onClick={() => copyText(made)} className="mt-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left font-mono text-[12px]" style={{ borderColor: "var(--color-line)" }}><span className="min-w-0 flex-1 truncate">{made}</span><Copy className="size-3.5 shrink-0" /></button>
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">Partages en cours</p>
      <div className="mt-2 space-y-1.5">
        {(list ?? []).map((sh) => (
          <div key={sh.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-3 py-2 text-[12.5px]" style={{ borderColor: "var(--color-line)" }}>
            <b className="min-w-0 flex-1 truncate">{sh.name}</b>
            <span className="max-w-[260px] truncate text-muted">{sh.links.map((id) => links.find((l) => l.id === id)?.name || "lien supprimé").join(", ")}</span>
            <span className="text-muted">{sh.hasPassword ? "mot de passe" : "accès libre"}</span>
            <span style={sh.expires && sh.expires < Date.now() ? { color: "var(--v2-down)" } : { color: "var(--color-muted)" }}>{sh.expires ? `${sh.expires < Date.now() ? "fini le" : "jusqu’au"} ${new Date(sh.expires).toLocaleDateString("fr-FR")}` : "sans fin"}</span>
            <button onClick={() => revoke(sh.id)} title="Supprimer ce partage : son adresse ne marchera plus" className="v2-sq" style={{ width: 28, height: 28 }}><Trash2 className="size-3.5" /></button>
          </div>
        ))}
        {list && !list.length ? <p className="py-3 text-center text-[12.5px] text-muted">Aucun partage pour l’instant.</p> : null}
        {!list && !err ? <p className="py-3 text-center text-[12.5px] text-muted">Chargement…</p> : null}
      </div>
    </Modal>
  );
}
