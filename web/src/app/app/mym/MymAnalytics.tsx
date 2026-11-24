"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarDays, Home, ReceiptText, RefreshCcw, ShoppingBag, Table2, Tag, TrendingUp, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Area, LIME, W, addDay, card, eur, fr, int, long, nice, parisToday, range, short, ticksX, type Data, type Day, type Preset } from "./MymStats";

// MYM → Stats → Analytique : copie de la page « Analytique » de MyPulse, pour UN compte MYM relié. Mêmes chiffres que
// Statistiques Globales (revenus lus chez MYM en direct, montants nets), vus jour après jour et par type de revenu.
type P = Preset | "all";
const TYPES: { k: "ppv" | "tip" | "push" | "mod" | "sub" | "renew" | "other"; label: string; color: string }[] = [
  { k: "ppv", label: "Médias privés", color: "#1ea672" },
  { k: "tip", label: "Pourboires", color: "#cc8400" },
  { k: "push", label: "Médias push", color: "#0b8a0b" },
  { k: "mod", label: "Media On Demand", color: "#f1734f" },
  { k: "sub", label: "Abonnements", color: "#3b82f6" },
  { k: "renew", label: "Renouvellements", color: "#8b5cf6" },
  { k: "other", label: "Autres", color: "#878a99" },
];

export function MymAnalytics() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [preset, setPreset] = useState<P>("month");
  const [[from, to], setDates] = useState<[string, string]>(() => range("month", parisToday()));
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [table, setTable] = useState(false);
  const [hs, setHs] = useState<number | null>(null);
  useEffect(() => {
    if (!creatorId) return;
    let dead = false;
    const load = () => api<Data>("GET", `/api/mym/stats?from=${from}&to=${to}&creatorId=${encodeURIComponent(creatorId)}`).then((r) => !dead && (setD(r), setErr(""))).catch((e) => !dead && (setD(null), setErr((e as Error).message)));
    load();
    const t = to >= parisToday() ? setInterval(load, 60_000) : null;
    return () => {
      dead = true;
      if (t) clearInterval(t);
    };
  }, [from, to, creatorId]);
  const c = d?.creators[0] ?? null;
  const days: Day[] = c?.days ?? [];
  const pick = (p: P) => {
    setPreset(p);
    const today = parisToday();
    // « Tout » : tout ce que Bloom a lu chez MYM (400 jours au plus).
    setDates(p === "all" ? [addDay(today, -400), today] : range(p as Preset, today));
  };
  const T = useMemo(() => {
    const s = (k: keyof Day) => days.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    return { total: s("total"), newSubs: s("newSubs"), renewals: s("renewals"), sales: s("nPpv") + s("nTips"), by: TYPES.map((t) => ({ ...t, v: s(t.k) })).filter((t) => t.v > 0) };
  }, [days]);
  const lastSubs = [...days].reverse().find((x) => x.subs != null)?.subs ?? null;
  const kpi: [string, string, React.ReactNode][] = [
    ["Nouveaux abonnés", int(T.newSubs), <UserPlus key="a" className="size-4" />],
    ["Renouvellements", int(T.renewals), <RefreshCcw key="b" className="size-4" />],
    ["Abonnés actifs", lastSubs != null ? int(lastSubs) : "…", <Users key="c" className="size-4" />],
    ["Ventes", int(T.sales), <ShoppingBag key="d" className="size-4" />],
    ["Panier moyen", eur(T.sales ? T.total / T.sales : 0), <Tag key="e" className="size-4" />],
    ["CA par nouvel abonné", eur(T.newSubs ? T.total / T.newSubs : 0), <Users key="f" className="size-4" />],
  ];
  const shownTypes = T.by.length ? T.by : TYPES.slice(0, 3).map((t) => ({ ...t, v: 0 }));
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="relative flex flex-wrap items-end gap-4 overflow-hidden rounded-2xl p-6" style={{ background: "radial-gradient(70% 140% at 85% 0%, rgba(199,255,74,.13), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.25)" }}>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Analytique</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>Performances de {c?.name || creator?.name || "…"}</h1>
          <p className="mt-1 text-[13px]">Chiffre d’affaires, abonnés et ventes du compte, jour après jour.</p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--mp-head)" }}>
            <span className="flex h-7 items-center rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}>MYM</span>
            <span className="flex h-7 items-center rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}>Montants en EUR</span>
            {c?.since ? <span className="flex h-7 items-center gap-1.5 rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}><CalendarDays className="size-3.5" style={{ color: "var(--mp-accent)" }} /> Données depuis le {fr(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(c.since)))}</span> : null}
            {creators.length > 1 ? <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="h-7 rounded-full border bg-transparent px-3 outline-none" style={{ borderColor: "#3d4a2c" }}>{creators.map((x) => <option key={x.id} value={x.id} style={{ background: "#222" }}>{x.name}</option>)}</select> : null}
          </p>
        </div>
        <Link href="/app/mym/transactions" className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "#3d4a2c", color: "var(--mp-head)" }}><ReceiptText className="size-4" /> Transactions</Link>
        <Link href="/app/mym/stats" className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "#3d4a2c", color: "var(--mp-head)" }}><Home className="size-4" /> Vue d’ensemble</Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-xl p-1 text-[12.5px] font-medium" style={card}>
          {([["today", "Aujourd’hui"], ["yesterday", "Hier"], ["7", "7 j"], ["30", "30 j"], ["month", "Mois"], ["prev", "M-1"], ["year", "Année"], ["all", "Tout"]] as [P, string][]).map(([k, l]) => <button key={k} onClick={() => pick(k)} className="rounded-lg px-3 py-1.5" style={preset === k ? { ...LIME, fontWeight: 700 } : undefined}>{l}</button>)}
        </div>
        <label className="flex h-[38px] items-center gap-2 rounded-xl px-3 text-[13px]" style={card}>
          <CalendarDays className="size-4" style={{ color: "var(--mp-accent)" }} />
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && (setPreset("custom"), setDates([e.target.value, to]))} className="bg-transparent outline-none" style={{ colorScheme: "dark", color: "var(--mp-head)" }} />
          →
          <input type="date" value={to} min={from} max={parisToday()} onChange={(e) => e.target.value && (setPreset("custom"), setDates([from, e.target.value]))} className="bg-transparent outline-none" style={{ colorScheme: "dark", color: "var(--mp-head)" }} />
        </label>
        <span className="flex-1" />
        <span className="rounded-xl px-3 py-2 text-[12.5px] font-bold" style={LIME} title="MYM ne montre que les montants nets (ce qui est crédité à la créatrice) : pas de vue « Brut ».">Net</span>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
      {!creatorId ? <p className="mt-6 text-[13px]">Aucun compte MYM.</p> : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.25fr_3fr]">
        <div className="flex flex-col justify-center rounded-2xl p-6" style={{ background: "radial-gradient(90% 120% at 90% 0%, rgba(199,255,74,.2), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.3)" }}>
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><TrendingUp className="size-4" style={{ color: "var(--mp-accent)" }} /> Chiffre d’affaires net</p>
          <p className="mt-2 text-[40px] leading-none font-bold" style={{ color: "var(--mp-accent)" }}>{d ? eur(T.total) : "…"}</p>
          <p className="mt-3 text-[12.5px]">Moyenne par jour <b className="ml-1" style={{ color: "var(--mp-head)" }}>{d && days.length ? eur(T.total / days.length) : "…"}</b></p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kpi.map(([label, v, icon]) => (
            <div key={label} className="rounded-2xl p-4" style={card}>
              <p className="flex items-center gap-2.5 text-[11.5px] font-semibold tracking-wider uppercase"><span className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{icon}</span>{label}</p>
              <p className="mt-3 text-[20px] font-semibold" style={{ color: "var(--mp-head)" }}>{d ? v : "…"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl p-5" style={card}>
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}><BarChart3 className="size-4" /></span>
          <div className="min-w-0 flex-1"><b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>Chiffre d’affaires</b><p className="text-[12px]">Par jour et par type de revenu</p></div>
          <button onClick={() => setTable(!table)} title="Tableau jour par jour" className="grid size-9 place-items-center rounded-xl border" style={{ borderColor: table ? "var(--mp-accent)" : "var(--mp-line)", color: table ? "var(--mp-accent)" : "var(--mp-text)" }}><Table2 className="size-4" /></button>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[2.4fr_1fr]">
          <div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: "var(--mp-head)" }}>{shownTypes.map((t) => <span key={t.k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: t.color }} />{t.label}</span>)}</p>
            <Stack days={days} types={shownTypes} />
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--mp-card-2)", border: "1px solid var(--mp-line)" }}>
            <p className="text-[11px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Répartition du chiffre d’affaires</p>
            {T.by.length ? T.by.sort((a, b) => b.v - a.v).map((t) => {
              const pc = T.total > 0 ? (t.v / T.total) * 100 : 0;
              return (
                <div key={t.k} className="mt-4">
                  <p className="flex items-center gap-2 text-[13px]"><span className="size-2.5 rounded-[3px]" style={{ background: t.color }} /><span className="min-w-0 flex-1 truncate" style={{ color: "var(--mp-head)" }}>{t.label}</span><b style={{ color: "var(--mp-head)" }}>{eur(t.v)}</b><span className="w-10 text-right text-[12px]">{pc < 1 ? pc.toFixed(1) : Math.round(pc)}%</span></p>
                  <p className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "#1a1d21" }}><span className="block h-full rounded-full" style={{ width: `${pc}%`, background: t.color }} /></p>
                </div>
              );
            }) : <p className="mt-4 text-[12.5px]">Aucune vente sur cette période.</p>}
          </div>
        </div>
        {table ? (
          <div className="mt-4 max-h-[420px] overflow-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="sticky top-0" style={{ background: "var(--mp-card)" }}><tr className="text-[11px] tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>{["Jour", "Chiffre d’affaires", "Nouveaux abonnés", "Renouvellements", "Ventes", "Abonnés actifs"].map((h, i) => <th key={h} className={`border-b px-2 py-2 font-semibold ${i ? "text-right" : "text-left"}`} style={{ borderColor: "var(--mp-line)" }}>{h}</th>)}</tr></thead>
              <tbody>{[...days].reverse().map((x) => <tr key={x.day} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><td className="px-2 py-2 font-medium">{long(x.day)}</td><td className="px-2 text-right">{eur(x.total)}</td><td className="px-2 text-right">{int(x.newSubs)}</td><td className="px-2 text-right">{int(x.renewals)}</td><td className="px-2 text-right">{int(x.nPpv + x.nTips)}</td><td className="px-2 text-right">{x.subs != null ? `${int(x.subs)}${x.subsEst ? " *" : ""}` : "—"}</td></tr>)}</tbody>
            </table>
            {days.some((x) => x.subsEst) ? <p className="mt-2 text-[11.5px]" style={{ color: "#7b8fd4" }}>* estimé (avant le premier relevé de Bloom).</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl p-5" style={card}>
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}><Users className="size-4" /></span><div className="min-w-0 flex-1"><b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>Abonnés actifs</b><p className="text-[12px]">Nombre d’abonnés au fil du temps</p></div>{hs != null && days[hs]?.subs != null ? <span className="rounded px-2 py-0.5 text-[11.5px] font-bold" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>{long(days[hs].day)} · {int(days[hs].subs as number)}{days[hs].subsEst ? " (estimé)" : ""}</span> : null}</div>
          {days.some((x) => x.subs != null) ? <Area points={days.map((x) => ({ label: x.day, v: x.subs }))} hover={hs} pinned={false} onHover={setHs} onPick={() => {}} fmt={(v) => int(Math.round(v))} h={420} /> : <p className="py-10 text-center text-[13px]">Pas encore de relevé sur cette période.</p>}
          {days.some((x) => x.subsEst) ? <p className="mt-1 text-[11.5px]" style={{ color: "#7b8fd4" }}>Avant le {d?.subsSince ? fr(d.subsSince) : "premier relevé"} : estimation (relevé moins les nouveaux abonnés arrivés entre-temps, désabonnements inconnus).</p> : null}
        </div>
        <div className="rounded-2xl p-5" style={card}>
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}><UserPlus className="size-4" /></span><div><b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>Nouveaux abonnés et renouvellements</b><p className="text-[12px]">Par jour</p></div></div>
          <p className="mt-3 flex gap-4 text-[12.5px]" style={{ color: "var(--mp-head)" }}><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: "#3b82f6" }} />Nouveaux abonnés</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: "#f1602e" }} />Renouvellements</span></p>
          <Stack days={days} types={[{ k: "newSubs", label: "Nouveaux abonnés", color: "#3b82f6" }, { k: "renewals", label: "Renouvellements", color: "#f1602e" }]} count />
        </div>
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Revenus lus directement chez MYM (compte relié), en montants nets, jours de Paris.</p>
    </div>
  );
}

/** Barres empilées par jour (revenus par type, ou abonnés). Survol = détail du jour. */
function Stack({ days, types, count = false }: { days: Day[]; types: { k: keyof Day; label: string; color: string }[]; count?: boolean }) {
  const [tip, setTip] = useState<number | null>(null);
  const h = count ? 420 : 330, L = 52, R = 10, T = 14, B = 30;
  const val = (x: Day, k: keyof Day) => Math.max(0, Number(x[k]) || 0);
  const tot = (x: Day) => types.reduce((a, t) => a + val(x, t.k), 0);
  const max = nice(Math.max(...days.map(tot), 1));
  const n = days.length;
  const slot = (W - L - R) / Math.max(n, 1);
  const bw = Math.min(46, Math.max(2, slot * 0.66));
  const y = (v: number) => T + (1 - v / max) * (h - T - B);
  const p = tip != null ? days[tip] : null;
  return (
    <div className="relative mt-2" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full select-none">
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (max * k) / 4;
          return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity=".06" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11.5" fill="#878a99">{count ? Math.round(v) : `${Math.round(v)}€`}</text></g>;
        })}
        {days.map((x, i) => {
          let acc = 0;
          return (
            <g key={x.day} opacity={tip == null || tip === i ? 1 : 0.5}>
              {types.map((t) => {
                const v = val(x, t.k);
                if (!v) return null;
                const y1 = y(acc + v);
                const r = <rect key={String(t.k)} x={L + i * slot + (slot - bw) / 2} y={y1} width={bw} height={Math.max(0.5, y(acc) - y1 - (acc ? 1 : 0))} rx={Math.min(4, bw / 3)} fill={t.color} />;
                acc += v;
                return r;
              })}
              <rect x={L + i * slot} y={T} width={slot} height={h - T - B} fill="transparent" onMouseEnter={() => setTip(i)} />
            </g>
          );
        })}
        {ticksX(n).map((i) => <text key={i} x={L + i * slot + slot / 2} y={h - 8} textAnchor="middle" fontSize="11.5" fill="#878a99">{short(days[i].day)}</text>)}
      </svg>
      {p && tip != null ? (
        <div className="pointer-events-none absolute top-6 z-10 w-56 rounded-xl text-[12.5px] shadow-xl" style={{ left: `clamp(0px, calc(${((L + tip * slot + slot / 2) / W) * 100}% - 112px), calc(100% - 224px))`, background: "#1a1d21", border: "1px solid #3a4047" }}>
          <p className="border-b px-3 py-2 font-semibold" style={{ borderColor: "#3a4047", color: "var(--mp-head)" }}>{long(p.day)}</p>
          <div className="space-y-1.5 px-3 py-2.5">
            {!count ? <p className="flex justify-between font-bold" style={{ color: "var(--mp-head)" }}><span>Total</span><span>{eur(p.total)}</span></p> : null}
            {types.filter((t) => val(p, t.k) > 0 || count).map((t) => <p key={String(t.k)} className="flex items-center gap-2"><span className="h-0.5 w-3 rounded" style={{ background: t.color }} /><span className="flex-1">{t.label}</span><b style={{ color: "var(--mp-head)" }}>{count ? int(val(p, t.k)) : eur(val(p, t.k))}</b></p>)}
            {!count ? <div className="mt-2 space-y-1 border-t pt-2 italic" style={{ borderColor: "#3a4047" }}><p className="flex justify-between"><span>Nouveaux abonnés</span><b className="not-italic" style={{ color: "var(--mp-head)" }}>{int(p.newSubs)}</b></p><p className="flex justify-between"><span>Renouvellements</span><b className="not-italic" style={{ color: "var(--mp-head)" }}>{int(p.renewals)}</b></p><p className="flex justify-between"><span>Ventes</span><b className="not-italic" style={{ color: "var(--mp-head)" }}>{int(p.nPpv + p.nTips)}</b></p></div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
