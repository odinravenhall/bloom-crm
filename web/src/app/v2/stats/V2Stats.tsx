"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, Download, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { Avatar } from "@/rv/components/ui";
import { addDay, Bars, cash, Count, daysBetween, Delta, Donut, fmtDay, int, Lines, PALETTE, paris, pct, Spark, type BarPt, type Slice } from "../kit";

// Bloom v2 → Chiffres : le MÊME écran pour OnlyFans et MYM (25/11/2026, design « Constellation »). Il remplace, dans la
// v2, la copie de MyPulse (MymStats) et celle du dashboard d'Infloww (OfDashboard). Chiffres : `GET /api/v2/stats`
// (app/v2stats.mjs), dans la devise de la plateforme choisie dans le menu. Ce que la plateforme ne donne pas n'est pas
// affiché (abonnés actifs : MYM seulement ; brut : OnlyFans seulement).
// `n` = ventes payées ; `free` = lignes à 0 (abonnements gratuits, courants sur MYM), jamais comptées comme des ventes.
type Cat = { key: string; label: string; total: number; n: number; free: number };
type DayRow = { day: string; total: number; prev: number; n: number; wait: number; cats: Record<string, number>; models: Record<string, number>; subs: number | null; subsEst: boolean };
type ModelRow = { id: string; name: string; avatar: string | null; total: number; prev: number; sales: number };
type Stats = {
  platform: "of" | "mym"; currency: string; mode: "net" | "gross"; canGross: boolean; from: string; to: string; today: string;
  total: number; prev: number; provisional: number; refunds: number; sales: number; buyers: number;
  cats: Cat[]; days: DayRow[]; models: ModelRow[]; who: { ai: number; team: number; other: number }; slots: { d: number; h: number; sum: number; n: number }[]; unmapped: string[];
  all: { id: string; name: string; avatar: string | null }[];
};
type Preset = "today" | "yesterday" | "7d" | "month" | "prev" | "30d" | "12m" | "custom";
type Pt = { key: string; label: string; title: string; total: number; prev: number; n: number; cats: Record<string, number>; models: Record<string, number>; dim?: boolean };

const PRESETS: [Preset, string][] = [["today", "Aujourd’hui"], ["yesterday", "Hier"], ["7d", "7 jours"], ["month", "Ce mois"], ["prev", "Mois dernier"], ["30d", "30 jours"], ["12m", "12 mois"]];
const CAT_COLOR: Record<string, string> = { sub: "#38bdf8", renew: "#22d3ee", ppv: "#3b82f6", mod: "#818cf8", push: "#a78bfa", tip: "#f472b6", post: "#34d399", stream: "#fbbf24", ref: "#fb923c", other: "#6b7280" };
const WEEK: [number, string, string][] = [[1, "Lun", "lundi"], [2, "Mar", "mardi"], [3, "Mer", "mercredi"], [4, "Jeu", "jeudi"], [5, "Ven", "vendredi"], [6, "Sam", "samedi"], [0, "Dim", "dimanche"]];
function rangeOf(p: Preset, custom: [string, string]): [string, string] {
  const t = paris();
  if (p === "today") return [t, t];
  if (p === "yesterday") return [addDay(t, -1), addDay(t, -1)];
  if (p === "7d") return [addDay(t, -6), t];
  if (p === "month") return [t.slice(0, 8) + "01", t];
  if (p === "prev") {
    const end = addDay(t.slice(0, 8) + "01", -1);
    return [end.slice(0, 8) + "01", end];
  }
  if (p === "30d") return [addDay(t, -29), t];
  if (p === "12m") return [addDay(t, -364), t];
  return custom;
}

/** Meilleurs créneaux : une case par heure de Paris et par jour de la semaine, d'autant plus bleue qu'on y a vendu. */
function Heat({ slots, fmt }: { slots: Stats["slots"]; fmt: (v: number, digits?: number) => string }) {
  const map = new Map(slots.map((s) => [s.d * 24 + s.h, s]));
  const max = Math.max(1, ...slots.map((s) => s.sum));
  const best = [...slots].sort((a, b) => b.sum - a.sum).slice(0, 3);
  return (
    <>
      <div className="mt-4 grid gap-[3px]" style={{ gridTemplateColumns: "30px repeat(24, minmax(0, 1fr))" }}>
        {WEEK.map(([d, short, long]) => (
          <Fragment key={d}>
            <span className="text-[10.5px] leading-[17px] text-muted">{short}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const s = map.get(d * 24 + h);
              return <i key={h} title={`${long} ${h} h : ${s ? `${fmt(s.sum)} · ${s.n} vente${s.n > 1 ? "s" : ""}` : "aucune vente"}`} className="h-[17px] rounded-[4px]" style={{ background: s ? `rgb(59 130 246 / ${(0.16 + 0.84 * (s.sum / max)).toFixed(2)})` : "rgb(255 255 255 / 0.035)" }} />;
            })}
          </Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[9.5px] text-muted">{h % 3 === 0 ? `${h}h` : ""}</span>)}
      </div>
      <div className="mt-3 space-y-1.5">
        {best.map((s, i) => (
          <p key={`${s.d}:${s.h}`} className="flex items-center gap-2 text-[12.5px]">
            <span className="v2-num w-4 text-center text-[11.5px] font-semibold text-muted">{i + 1}</span>
            <span className="flex-1 first-letter:uppercase">{WEEK.find((w) => w[0] === s.d)?.[2]} · {s.h} h</span>
            <span className="text-[11.5px] text-muted">{s.n} vente{s.n > 1 ? "s" : ""}</span>
            <b className="v2-num w-[82px] text-right">{fmt(s.sum)}</b>
          </p>
        ))}
        {!best.length ? <p className="text-[12.5px] text-muted">Aucune vente de contenu sur la période.</p> : null}
      </div>
    </>
  );
}

/** `pf` = la plateforme affichée par cet onglet (elle est envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2Stats({ pf }: { pf: Pf }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[string, string]>(() => [addDay(paris(), -6), paris()]);
  const [draft, setDraft] = useState<[string, string]>(custom);
  const [model, setModel] = useState("");
  const [gross, setGross] = useState(false);
  const [view, setView] = useState<"types" | "models" | "compare">("types");
  const [ringBy, setRingBy] = useState<"type" | "model" | "who">("type");
  const [menu, setMenu] = useState(false);
  const [dates, setDates] = useState(false);
  const [data, setData] = useState<{ key: string; s: Stats; ctx: Stats | null } | null>(null);
  const [err, setErr] = useState("");
  const [from, to] = rangeOf(preset, custom);
  const key = `${from}|${to}|${model}|${gross}`;
  useEffect(() => {
    try {
      const p = localStorage.getItem("bloom.v2.stats.period") as Preset | null;
      if (p && PRESETS.some(([k]) => k === p)) setPreset(p);
    } catch {}
  }, []);
  const pickPreset = (p: Preset) => {
    setPreset(p);
    setDates(false);
    try {
      if (p !== "custom") localStorage.setItem("bloom.v2.stats.period", p);
    } catch {}
  };
  useEffect(() => {
    let stop = false;
    const q = `&pf=${pf}${model ? `&creatorId=${encodeURIComponent(model)}` : ""}${gross ? "&mode=gross" : ""}`;
    const len = daysBetween(from, to) + 1;
    const load = () =>
      Promise.all([
        api<Stats>("GET", `/api/v2/stats?from=${from}&to=${to}${q}`),
        // Période courte : on demande aussi les 14 derniers jours, pour que le graphique ait de quoi comparer.
        len < 7 ? api<Stats>("GET", `/api/v2/stats?from=${addDay(to, -13)}&to=${to}${q}`).catch(() => null) : Promise.resolve(null),
      ])
        .then(([s, ctx]) => !stop && (setData({ key: `${from}|${to}|${model}|${gross}`, s, ctx }), setErr("")))
        .catch((e) => !stop && setErr(e instanceof Error ? e.message : "Chiffres indisponibles"));
    load();
    // La période contient aujourd'hui : les chiffres se rafraîchissent tout seuls (moins souvent sur une longue période,
    // dont le calcul est plus lourd pour le serveur).
    const t = to >= paris() ? setInterval(() => document.visibilityState === "visible" && load(), len > 62 ? 300_000 : 60_000) : null;
    return () => {
      stop = true;
      if (t) clearInterval(t);
    };
  }, [from, to, model, gross, pf]);
  useEffect(() => {
    if (!menu && !dates) return;
    const close = (e: MouseEvent) => !(e.target as Element).closest?.("[data-pop]") && (setMenu(false), setDates(false));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setMenu(false), setDates(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", close), document.removeEventListener("keydown", esc));
  }, [menu, dates]);

  const s = data?.s ?? null;
  const busy = !!data && data.key !== key;
  const cur = s?.currency ?? "EUR";
  const fmt = (v: number, digits = 2) => cash(v, cur, digits);
  const v = useMemo(() => {
    if (!data) return null;
    const { s: st, ctx } = data;
    const len = st.days.length;
    const short = len < 7 && !!ctx;
    const src = short ? ctx!.days : st.days;
    let pts: Pt[];
    if (len > 62) {
      // Longue période : un point par mois.
      const by = new Map<string, Pt>();
      for (const d of src) {
        const m = d.day.slice(0, 7);
        const p = by.get(m) ?? { key: m, label: fmtDay(m + "-01", { month: "short" }), title: fmtDay(m + "-01", { month: "long", year: "numeric" }), total: 0, prev: 0, n: 0, cats: {}, models: {} };
        p.total += d.total;
        p.n += d.n;
        for (const [k, x] of Object.entries(d.cats)) p.cats[k] = (p.cats[k] || 0) + x;
        for (const [k, x] of Object.entries(d.models)) p.models[k] = (p.models[k] || 0) + x;
        by.set(m, p);
      }
      pts = [...by.values()];
    } else pts = src.map((d) => ({ key: d.day, label: fmtDay(d.day, { day: "2-digit" }), title: fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" }), total: d.total, prev: d.prev, n: d.n, cats: d.cats, models: d.models, dim: short && d.day < st.from }));
    const colorOf = (id: string) => PALETTE[Math.max(0, st.all.findIndex((m) => m.id === id)) % PALETTE.length];
    const best = st.days.reduce<DayRow | null>((a, d) => (d.total > (a?.total ?? 0) ? d : a), null);
    let acc = 0;
    const subs = st.days.map((d) => d.subs);
    const known = subs.filter((x): x is number => x != null);
    // Période courte : les petites courbes et la moyenne portent sur les 14 derniers jours (un seul point ne dit rien).
    const trend = short ? ctx!.days : st.days;
    return {
      pts, short, len, colorOf, best,
      sparkTotal: trend.map((d) => d.total),
      sparkSales: trend.map((d) => d.n),
      avg: short ? ctx!.total / ctx!.days.length : st.total / len,
      canCompare: !short && len <= 62,
      // Bloom garde environ un an de ventes : au-delà de six mois, la « période d'avant » serait incomplète.
      noCompare: len > 180,
      unit: len > 62 ? "mois" : "jour",
      cumul: trend.map((d) => (acc += d.total)),
      subs: known.length ? { values: subs, last: known[known.length - 1], first: known[0], est: st.days.some((d) => d.subsEst) } : null,
    };
  }, [data]);

  const exportCsv = () => {
    if (!s) return;
    const num = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    const withSubs = !!v?.subs;
    const head = ["Jour", `Total ${s.mode === "gross" ? "brut" : "net"} (${cur})`,...s.cats.map((c) => c.label), "Ventes", ...(withSubs ? ["Abonnés actifs"] : [])];
    const lines = s.days.map((d) => [d.day, num(d.total), ...s.cats.map((c) => num(d.cats[c.key] || 0)), String(d.n), ...(withSubs ? [d.subs == null ? "" : String(d.subs)] : [])].join(";"));
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bloom-chiffres-${s.platform === "mym" ? "mym" : "onlyfans"}-${s.from}_${s.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const pfName = s ? (s.platform === "mym" ? "MYM" : "OnlyFans") : "";
  const periodLabel = preset === "custom" ? `${fmtDay(from, { day: "numeric", month: "short" })} → ${fmtDay(to, { day: "numeric", month: "short" })}` : PRESETS.find(([k]) => k === preset)?.[1] ?? "";
  const picked = model ? s?.all.find((m) => m.id === model)?.name ?? "Modèle" : "Toutes les modèles";
  const compare = view === "compare" && !!v?.canCompare;
  const byModel = view === "models" && (s?.models.length ?? 0) > 1;
  const shown = (s?.models ?? []).filter((m) => m.total > 0);
  const slices: Slice[] = !s ? [] : ringBy === "model" ? shown.map((m) => ({ label: m.name, value: m.total, color: v!.colorOf(m.id) })) : ringBy === "who" ? [{ label: "IA", value: s.who.ai, color: "#3b82f6" }, { label: "Chatteurs", value: s.who.team, color: "#a78bfa" }, { label: "Autre", value: s.who.other, color: "#6b7280" }].filter((x) => x.value > 0).sort((a, b) => b.value - a.value) : s.cats.filter((c) => c.total > 0).sort((a, b) => b.total - a.total).map((c) => ({ label: c.label, value: c.total, color: CAT_COLOR[c.key] ?? "#6b7280" }));
  const sliceTotal = slices.reduce((a, x) => a + x.value, 0) || 1;
  const bars: BarPt[] = !s || !v ? [] : v.pts.map((p) => ({ key: p.key, label: p.label, title: p.title, dim: p.dim, prev: p.prev, parts: compare ? [{ v: p.total, color: "#3b82f6", label: "Total" }] : s.cats.map((c) => ({ v: p.cats[c.key] || 0, color: CAT_COLOR[c.key] ?? "#6b7280", label: c.label })) }));
  const len = v?.len ?? 1;
  // Une carte par type de vente : toujours les trois premiers de la plateforme, les autres seulement s'il s'y est passé
  // quelque chose sur la période (sinon une rangée de cartes à zéro).
  const tiles = (s?.cats ?? []).filter((c, i) => i < 3 || c.n > 0 || c.free > 0);

  const stat = (label: string, value: React.ReactNode, sub: React.ReactNode, spark: number[], color: string, i: number, hi = false) => (
    <div className={`v2-card v2-rise p-4 ${hi ? "hi" : ""}`} style={{ ["--i" as string]: i }}>
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className="v2-big mt-1">{s ? value : <span className="text-muted">…</span>}</p>
      <p className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">{sub}</p>
      <div className="mt-2"><Spark key={`${data?.key}|${label}`} v={spark} color={color} /></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 md:px-7 md:py-7">
      {/* En-tête : titre à gauche ; modèle, net / brut, export et période à droite */}
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Statistiques{pfName ? ` · ${pfName}` : ""}</p>
          <h1 className="v2-h1 mt-1">Chiffres</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <div data-pop className="relative">
            <button onClick={() => (setDates(false), setMenu(!menu))} aria-haspopup="listbox" aria-expanded={menu} className="v2-select">
              <Users className="size-4 text-muted" /><span className="max-w-[170px] truncate">{picked}</span><ChevronDown className="size-3.5 text-muted" />
            </button>
            {menu && s ? (
              <div className="v2-menu v2-scroll max-h-[420px] w-[250px] overflow-y-auto" role="listbox" aria-label="Modèle affichée" style={{ right: 0, top: "calc(100% + 6px)" }}>
                <button role="option" aria-selected={!model} onClick={() => (setModel(""), setMenu(false))} className="v2-menu-item" data-on={!model}><Users className="size-4 text-muted" /><span className="flex-1">Toutes les modèles</span>{!model ? <Check className="size-4" style={{ color: "var(--v2-sky)" }} /> : null}</button>
                {s.all.map((m) => (
                  <button key={m.id} role="option" aria-selected={model === m.id} onClick={() => (setModel(m.id), setMenu(false))} className="v2-menu-item" data-on={model === m.id}>
                    <Avatar src={m.avatar} name={m.name} size="size-6" /><span className="min-w-0 flex-1 truncate">{m.name}</span>{model === m.id ? <Check className="size-4 shrink-0" style={{ color: "var(--v2-sky)" }} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {s?.canGross ? (
            <div className="v2-segbar" title="Net : ce que touche l’agence après la commission d’OnlyFans. Brut : ce que les fans ont payé.">
              <button className="v2-seg" data-on={!gross} onClick={() => setGross(false)}>Net</button>
              <button className="v2-seg" data-on={gross} onClick={() => setGross(true)}>Brut</button>
            </div>
          ) : null}
          <button onClick={exportCsv} disabled={!s} className="v2-select" title="Télécharger les chiffres jour par jour (fichier pour Excel)"><Download className="size-4 text-muted" />Exporter</button>
        </div>
      </div>
      <div className="v2-rise relative z-20 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ ["--i" as string]: 1 }}>
        <div className="v2-tabs v2-noscroll max-w-full overflow-x-auto">
          {PRESETS.map(([k, l]) => <button key={k} onClick={() => pickPreset(k)} className="v2-tab" data-on={preset === k}>{l}</button>)}
        </div>
        <div data-pop className="relative">
          <button onClick={() => (setMenu(false), setDraft([from, to]), setDates(!dates))} className="v2-tab flex items-center gap-1.5" data-on={preset === "custom"} aria-expanded={dates}><CalendarDays className="size-3.5" />{preset === "custom" ? periodLabel : "Dates"}</button>
          {dates ? (
            <div className="v2-menu w-[252px] p-3" style={{ left: 0, top: "calc(100% + 4px)" }}>
              <p className="text-[11.5px] font-semibold text-muted">Du</p>
              <input type="date" value={draft[0]} max={draft[1]} onChange={(e) => setDraft([e.target.value || draft[0], draft[1]])} className="mt-1 h-9 w-full rounded-lg border bg-transparent px-2 text-[13px] outline-none focus:border-(--v2-blue)" style={{ borderColor: "var(--color-line)", colorScheme: "dark" }} />
              <p className="mt-2.5 text-[11.5px] font-semibold text-muted">Au</p>
              <input type="date" value={draft[1]} min={draft[0]} max={paris()} onChange={(e) => setDraft([draft[0], e.target.value || draft[1]])} className="mt-1 h-9 w-full rounded-lg border bg-transparent px-2 text-[13px] outline-none focus:border-(--v2-blue)" style={{ borderColor: "var(--color-line)", colorScheme: "dark" }} />
              <button onClick={() => (setCustom(draft[0] <= draft[1] ? draft : [draft[1], draft[0]]), pickPreset("custom"))} className="v2-btn mt-3 w-full" style={{ height: 34 }}>Afficher</button>
            </div>
          ) : null}
        </div>
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {s?.unmapped.length ? <p className="mt-4 rounded-xl border px-4 py-3 text-[12.5px] text-muted" style={{ borderColor: "rgb(245 158 11 / 0.3)", background: "rgb(245 158 11 / 0.06)" }}>Pas de chiffres pour {s.unmapped.join(", ")} : aucun compte Infloww n’est relié à {s.unmapped.length > 1 ? "ces modèles" : "cette modèle"} (Paramètres → Branchements).</p> : null}

      <div style={{ opacity: busy ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
        {/* Les trois grandes cartes */}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {stat(`Chiffre d’affaires${s ? (s.mode === "gross" ? " brut" : " net") : ""}`, s ? <Count value={s.total} format={(n) => fmt(n)} /> : null, <>{v?.noCompare ? <span>période trop longue pour être comparée</span> : <>{s ? <Delta now={s.total} before={s.prev} /> : null}<span>vs période d’avant{s && s.prev > 0 ? ` (${fmt(s.prev, 0)})` : ""}</span></>}{s?.provisional ? <span title="Ventes vues en direct, pas encore confirmées par la plateforme">· dont {fmt(s.provisional, 0)} en attente</span> : null}</>, v?.sparkTotal ?? [], "#3b82f6", 2, true)}
          {stat("Ventes", s ? int(s.sales) : null, <span>{s?.sales ? `panier moyen ${fmt(s.total / s.sales)}` : "aucune vente"}{s?.buyers ? ` · ${int(s.buyers)} acheteur${s.buyers > 1 ? "s" : ""}` : ""}</span>, v?.sparkSales ?? [], "#a78bfa", 3)}
          {stat("Moyenne par jour", s && v ? fmt(v.avg) : null, <span>{v?.short ? "sur les 14 derniers jours" : v?.best && v.best.total > 0 ? `meilleur jour : ${fmtDay(v.best.day, { day: "numeric", month: "short" })} (${fmt(v.best.total, 0)})` : "sur la période"}</span>, v?.cumul ?? [], "#34d399", 4)}
        </div>

        {/* Par type de vente */}
        <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {tiles.map((c, i) => (
            <div key={c.key} className="v2-card v2-rise p-3.5" style={{ ["--i" as string]: i + 5 }}>
              <p className="flex items-center gap-2 text-[12px] text-muted"><i className="size-2 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.key] ?? "#6b7280" }} /><span className="truncate">{c.label}</span></p>
              <p className="v2-num mt-1.5 truncate text-[18px] leading-tight font-bold" style={c.total ? undefined : { color: "var(--color-muted)" }}>{fmt(c.total)}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-muted">{c.n && c.free ? `${int(c.n)} payant${c.n > 1 ? "s" : ""} · ${int(c.free)} gratuit${c.free > 1 ? "s" : ""}` : c.n ? `${int(c.n)} vente${c.n > 1 ? "s" : ""} · ${pct(c.total, s!.total)} %` : c.free ? `${int(c.free)} gratuit${c.free > 1 ? "s" : ""}` : "—"}</p>
            </div>
          ))}
          {s?.refunds ? (
            <div className="v2-card v2-rise p-3.5" title="Les remboursements ne sont pas retirés du chiffre d’affaires : ils sont comptés à part.">
              <p className="flex items-center gap-2 text-[12px] text-muted"><i className="size-2 shrink-0 rounded-full" style={{ background: "var(--v2-down)" }} /><span className="truncate">Remboursements</span></p>
              <p className="v2-num mt-1.5 truncate text-[18px] leading-tight font-bold" style={{ color: "var(--v2-down)" }}>{fmt(s.refunds)}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-muted">comptés à part</p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)]">
          <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 9 }}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="v2-card-title flex-1">Revenu par {v?.unit ?? "jour"}</p>
              <div className="v2-segbar">
                <button className="v2-seg" data-on={view === "types" || (!compare && !byModel)} onClick={() => setView("types")} title="La part de chaque type de vente">Types</button>
                {(s?.models.length ?? 0) > 1 ? <button className="v2-seg" data-on={byModel} onClick={() => setView("models")} title="Une courbe par modèle">Modèles</button> : null}
                {v?.canCompare ? <button className="v2-seg" data-on={compare} onClick={() => setView("compare")} title="Chaque jour à côté du même jour de la période d’avant">Comparer</button> : null}
              </div>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
              {compare ? (
                <><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: "#3b82f6" }} />{periodLabel}</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: "#3a3a42" }} />Avant</span></>
              ) : byModel ? shown.map((m) => <span key={m.id} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: v!.colorOf(m.id) }} />{m.name}</span>) : (s?.cats ?? []).filter((c) => c.total > 0).map((c) => <span key={c.key} className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: CAT_COLOR[c.key] ?? "#6b7280" }} />{c.label}</span>)}
              {v?.short ? <span>· les 14 derniers jours, la période choisie en clair</span> : null}
            </p>
            {!s || !v ? <div style={{ height: 262 }} /> : byModel ? (
              <Lines key={`${data?.key}|m`} labels={v.pts} series={shown.map((m) => ({ id: m.id, name: m.name, color: v.colorOf(m.id), values: v.pts.map((p) => p.models[m.id] || 0) }))} fmt={fmt} />
            ) : (
              <Bars key={`${data?.key}|${compare}`} pts={bars} compare={compare} fmt={fmt} />
            )}
          </section>

          <section className="v2-card v2-rise flex min-w-0 flex-col p-4" style={{ ["--i" as string]: 10 }}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="v2-card-title flex-1">Répartition</p>
              <div className="v2-segbar">
                <button className="v2-seg" data-on={ringBy === "type"} onClick={() => setRingBy("type")}>Types</button>
                {(s?.models.length ?? 0) > 1 ? <button className="v2-seg" data-on={ringBy === "model"} onClick={() => setRingBy("model")}>Modèles</button> : null}
                <button className="v2-seg" data-on={ringBy === "who"} onClick={() => setRingBy("who")} title="Qui a vendu les contenus payants envoyés en message">Vendeurs</button>
              </div>
            </div>
            <div className="mt-4"><Donut key={`${data?.key}|${ringBy}`} items={slices} /></div>
            <div className="mt-4 space-y-1.5">
              {slices.slice(0, 6).map((o) => (
                <p key={o.label} className="flex items-center gap-2 text-[12.5px]">
                  <i className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="text-[11.5px] text-muted">{pct(o.value, sliceTotal)} %</span>
                  <b className="v2-num w-[82px] text-right">{fmt(o.value, 0)}</b>
                </p>
              ))}
              {!slices.length ? <p className="text-[12.5px] text-muted">{s ? "Aucune vente sur la période." : "Chargement…"}</p> : null}
              {ringBy === "who" && s ? <p className="pt-1 text-[11.5px] text-muted">{s.platform === "mym" ? "Contenus payants seulement. Côté MYM, la part de l’IA est estimée." : "Messages payants seulement."}</p> : null}
            </div>
          </section>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 11 }}>
            <div className="mb-1 flex items-center"><p className="v2-card-title flex-1">Comparatif des modèles</p>{model ? <button onClick={() => setModel("")} className="text-[12.5px] font-semibold" style={{ color: "var(--v2-sky)" }}>Voir toutes les modèles</button> : null}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] tracking-[0.1em] text-muted uppercase">
                    <th className="py-2 font-semibold">Modèle</th><th className="py-2 text-right font-semibold">Chiffre</th><th className="py-2 pl-4 font-semibold">Part</th><th className="py-2 text-right font-semibold">Ventes</th><th className="py-2 text-right font-semibold">Panier</th><th className="py-2 text-right font-semibold">Évolution</th>
                  </tr>
                </thead>
                <tbody>
                  {(s?.models ?? []).map((m) => (
                    <tr key={m.id} onClick={() => setModel(model === m.id ? "" : m.id)} className="cursor-pointer border-t transition hover:bg-white/[0.03]" style={{ borderColor: "rgb(255 255 255 / 0.05)" }} title={model === m.id ? "Revenir à toutes les modèles" : `Voir seulement ${m.name}`}>
                      <td className="py-2.5"><span className="flex items-center gap-2.5"><span className="grid rounded-full" style={{ boxShadow: `0 0 0 2px var(--color-card), 0 0 0 4px ${v?.colorOf(m.id) ?? "#3b82f6"}` }}><Avatar src={m.avatar} name={m.name} size="size-7" /></span><b className="truncate text-[13.5px]">{m.name}</b></span></td>
                      <td className="v2-num py-2.5 text-right text-[13.5px] font-bold">{fmt(m.total)}</td>
                      <td className="py-2.5 pl-4"><span className="flex items-center gap-2"><span className="h-1 w-[72px] overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}><i className="v2-grow block h-full rounded-full" style={{ width: `${pct(m.total, s!.total)}%`, background: v?.colorOf(m.id) }} /></span><span className="v2-num text-[11.5px] text-muted">{pct(m.total, s!.total)} %</span></span></td>
                      <td className="v2-num py-2.5 text-right">{int(m.sales)}</td>
                      <td className="v2-num py-2.5 text-right">{m.sales ? fmt(m.total / m.sales) : "—"}</td>
                      <td className="py-2.5 text-right">{v?.noCompare ? <span className="v2-delta" data-dir="flat">—</span> : <Delta now={m.total} before={m.prev} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {s && !s.models.length ? <p className="py-6 text-center text-[13px] text-muted">Aucune modèle {pfName} à afficher.</p> : null}
            {!s ? <p className="py-6 text-center text-[13px] text-muted">Chargement…</p> : null}
          </section>

          <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 12 }}>
            <p className="v2-card-title">Meilleurs créneaux de vente</p>
            <p className="mt-0.5 text-[11.5px] text-muted">Contenus payants et pourboires, heure de Paris</p>
            {s ? <Heat slots={s.slots} fmt={fmt} /> : <div style={{ height: 190 }} />}
          </section>
        </div>

        {/* Abonnés actifs : la plateforme ne le donne que côté MYM */}
        {v?.subs ? (
          <section className="v2-card v2-rise mt-3 p-4" style={{ ["--i" as string]: 13 }}>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="v2-card-title">Abonnés actifs</p>
                <p className="mt-0.5 text-[11.5px] text-muted">{v.subs.est ? "Relevé par Bloom chaque jour ; les jours d’avant le premier relevé sont estimés." : "Relevé par Bloom chaque jour."}</p>
              </div>
              <p className="v2-big" style={{ fontSize: 24 }}>{int(v.subs.last)}</p>
              <span className="v2-delta mb-1" data-dir={v.subs.last > v.subs.first ? "up" : v.subs.last < v.subs.first ? "down" : "flat"}>{v.subs.last > v.subs.first ? "+" : ""}{int(v.subs.last - v.subs.first)} sur la période</span>
            </div>
            <Lines key={`${data?.key}|subs`} labels={s!.days.map((d) => ({ key: d.day, label: fmtDay(d.day, { day: "2-digit" }), title: fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" }) }))} series={[{ id: "subs", name: "Abonnés actifs", color: "#38bdf8", values: v.subs.values }]} fmt={(x) => int(Math.round(x))} height={200} area />
          </section>
        ) : null}
      </div>
    </div>
  );
}
