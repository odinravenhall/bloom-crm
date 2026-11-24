"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeEuro, CalendarDays, Download, Gift, Lock, Pin, RefreshCcw, Send, ShoppingBag, TrendingUp, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { download } from "@/lib/xlsx";
import { Avatar } from "@/components/ui";

// MYM → Stats → Statistiques Globales : copie de la « Vue d'ensemble » de MyPulse, sur les revenus lus chez MYM en direct
// (montants nets). Tous les comptes MYM reliés que la personne voit, ensemble ; aujourd'hui par défaut.
type Day = { day: string; sub: number; renew: number; ppv: number; mod: number; push: number; tip: number; other: number; refund: number; total: number; nPpv: number; nTips: number; newSubs: number; renewals: number; subs: number | null };
type Creator = { id: string; name: string; handle: string | null; avatar: string | null; since: number | null; days: Day[] };
type Data = { from: string; to: string; today: string; creators: Creator[]; subsSince: string | null };
type Preset = "today" | "yesterday" | "7" | "30" | "month" | "prev" | "year" | "custom";
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const LIME = { background: "var(--mp-accent)", color: "var(--mp-on-accent)" };
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ")} €`;
const int = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
const parisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const fr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");
const long = (d: string) => {
  const s = new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return s[0].toUpperCase() + s.slice(1);
};
function range(p: Preset, today: string): [string, string] {
  if (p === "yesterday") return [addDay(today, -1), addDay(today, -1)];
  if (p === "7") return [addDay(today, -6), today];
  if (p === "30") return [addDay(today, -29), today];
  if (p === "month") return [`${today.slice(0, 8)}01`, today];
  if (p === "prev") {
    const end = addDay(`${today.slice(0, 8)}01`, -1);
    return [`${end.slice(0, 8)}01`, end];
  }
  if (p === "year") return [`${today.slice(0, 4)}-01-01`, today];
  return [today, today];
}

export function MymStats() {
  const [preset, setPreset] = useState<Preset>("today");
  const [[from, to], setDates] = useState<[string, string]>(() => range("today", parisToday()));
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  useEffect(() => {
    let dead = false;
    const load = () => api<Data>("GET", `/api/mym/stats?from=${from}&to=${to}`).then((r) => !dead && (setD(r), setErr(""))).catch((e) => !dead && setErr((e as Error).message));
    setPin(null);
    setHover(null);
    load();
    // La période contient aujourd'hui : les chiffres se rafraîchissent tout seuls.
    const t = to >= parisToday() ? setInterval(load, 60_000) : null;
    return () => {
      dead = true;
      if (t) clearInterval(t);
    };
  }, [from, to]);
  const pick = (p: Preset) => (setPreset(p), setDates(range(p, parisToday())));
  const days = useMemo(() => {
    const n = d?.creators[0]?.days.length ?? 0;
    return Array.from({ length: n }, (_, i) => {
      const rows = d!.creators.map((c) => c.days[i]);
      const sum = (k: keyof Day) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      const known = rows.filter((r) => r.subs != null);
      return { day: rows[0].day, total: sum("total"), sub: sum("sub"), renew: sum("renew"), ppv: sum("ppv"), mod: sum("mod"), push: sum("push"), tip: sum("tip"), other: sum("other"), refund: sum("refund"), newSubs: sum("newSubs"), renewals: sum("renewals"), subs: known.length === rows.length && rows.length ? sum("subs") : null };
    });
  }, [d]);
  const T = useMemo(() => {
    const s = (k: "total" | "sub" | "renew" | "ppv" | "mod" | "push" | "tip" | "other" | "refund" | "newSubs" | "renewals") => days.reduce((a, x) => a + x[k], 0);
    return { total: s("total"), sub: s("sub"), renew: s("renew"), ppv: s("ppv"), mod: s("mod"), push: s("push"), tip: s("tip"), other: s("other"), refund: s("refund"), newSubs: s("newSubs"), renewals: s("renewals") };
  }, [days]);
  const shown = pin ?? hover;
  const exportCsv = () => {
    if (!d) return;
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    const q = (s: string) => `"${s}"`;
    const head = ["Date", "Créateur", "Plateforme", "Devise", q("CA abonnements NET"), q("CA PPV + Push + MoD NET"), q("CA pourboires NET"), q("CA autres NET"), q("CA total NET"), q("Nb ventes PPV"), q("Nb pourboires"), q("Nouveaux abonnés"), "Renouvellements", q("Total abonnés"), q("LTV du jour")].join(";");
    const lines = d.creators.flatMap((c) => c.days.map((x) => [fr(x.day), c.name, "MYM", "EUR", n(x.sub + x.renew), n(x.ppv + x.push + x.mod), n(x.tip), n(x.other), n(x.total), x.nPpv, x.nTips, x.newSubs, x.renewals, x.subs ?? "", n(x.newSubs ? x.total / x.newSubs : 0)].join(";")));
    download(new Blob([`﻿${[head, ...lines].join("\n")}\n`], { type: "text/csv;charset=utf-8" }), `bloom_mym_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.csv`);
  };
  const lastSubs = [...days].reverse().find((x) => x.subs != null)?.subs ?? null;
  const cats: [string, number, React.ReactNode][] = [["Abonnement", T.sub, <UserPlus key="a" className="size-4" />], ["Renouvellement", T.renew, <RefreshCcw key="b" className="size-4" />], ["Média privé", T.ppv, <Lock key="c" className="size-4" />], ["Media On Demand", T.mod, <ShoppingBag key="d" className="size-4" />], ["Médias push", T.push, <Send key="e" className="size-4" />], ["Pourboires", T.tip, <Gift key="f" className="size-4" />], ["Autres", T.other, <BadgeEuro key="g" className="size-4" />]];
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="relative flex flex-wrap items-end gap-4 overflow-hidden rounded-2xl p-6" style={{ background: "radial-gradient(70% 140% at 85% 0%, rgba(199,255,74,.13), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.25)" }}>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Tableau de bord</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>Vue d’ensemble</h1>
          <p className="mt-1 text-[13px]">Suivi de vos performances et revenus en temps réel.</p>
          <p className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold" style={{ color: "var(--mp-head)" }}>
            <span className="flex h-7 items-center gap-1.5 rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}><Users className="size-3.5" style={{ color: "var(--mp-accent)" }} /> {d?.creators.length ?? "…"} créateur{(d?.creators.length ?? 0) > 1 ? "s" : ""} suivi{(d?.creators.length ?? 0) > 1 ? "s" : ""}</span>
            <span className="flex h-7 items-center rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}>MYM</span>
          </p>
        </div>
        <button onClick={exportCsv} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "#3d4a2c", color: "var(--mp-head)" }}><Download className="size-4" /> Export CSV</button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-xl p-1 text-[12.5px] font-medium" style={card}>
          {([["today", "Auj."], ["yesterday", "Hier"], ["7", "7j"], ["30", "30j"], ["month", "Mois"], ["prev", "M-1"], ["year", "Année"]] as [Preset, string][]).map(([k, l]) => <button key={k} onClick={() => pick(k)} className="rounded-lg px-3 py-1.5" style={preset === k ? { ...LIME, fontWeight: 700 } : undefined}>{l}</button>)}
        </div>
        <label className="flex h-[38px] items-center gap-2 rounded-xl px-3 text-[13px]" style={card}>
          <CalendarDays className="size-4" style={{ color: "var(--mp-accent)" }} />
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && (setPreset("custom"), setDates([e.target.value, to < e.target.value ? e.target.value : to]))} className="bg-transparent outline-none" style={{ colorScheme: "dark", color: "var(--mp-head)" }} />
          →
          <input type="date" value={to} min={from} max={parisToday()} onChange={(e) => e.target.value && (setPreset("custom"), setDates([from > e.target.value ? e.target.value : from, e.target.value]))} className="bg-transparent outline-none" style={{ colorScheme: "dark", color: "var(--mp-head)" }} />
        </label>
        <span className="flex-1" />
        <span className="rounded-xl px-3 py-2 text-[12.5px] font-bold" style={LIME} title="MYM ne donne que les montants nets (ce qui est crédité à la créatrice).">Net</span>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.25fr_3fr]">
        <div className="flex flex-col justify-center rounded-2xl p-6" style={{ background: "radial-gradient(90% 120% at 90% 0%, rgba(199,255,74,.2), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.3)" }}>
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-accent)" }}><TrendingUp className="size-4" /> Chiffre d’affaires</p>
          <p className="mt-2 text-[40px] leading-none font-bold" style={{ color: "var(--mp-accent)" }}>{d ? eur(T.total) : "…"}</p>
          <p className="mt-3 text-[12.5px]">Moyenne / Jour <b className="ml-1" style={{ color: "var(--mp-head)" }}>{d && days.length ? eur(T.total / days.length) : "…"}</b></p>
          {T.refund < 0 ? <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Remboursements sur la période : {eur(T.refund)} (non déduits)</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cats.map(([label, v, icon], i) => (
            <div key={label} className={`rounded-2xl p-4 ${i >= 4 ? "lg:col-span-1" : ""}`} style={card}>
              <p className="flex items-center gap-2.5 text-[11.5px] font-semibold tracking-wider uppercase"><span className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{icon}</span>{label}</p>
              <p className="mt-3 text-[19px] font-semibold" style={{ color: "var(--mp-head)" }}>{d ? eur(v) : "…"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl p-5" style={card}>
        <Head icon={<TrendingUp className="size-4" />} title="Évolution des revenus" creators={d?.creators ?? []} />
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Area points={days.map((x) => ({ label: x.day, v: x.total }))} hover={shown} pinned={pin != null} onHover={(i) => pin == null && setHover(i)} onPick={(i) => setPin(pin === i ? null : i)} fmt={(v) => eur(v)} />
          <div className="rounded-xl" style={{ background: "var(--mp-card-2)", border: "1px solid var(--mp-line)" }}>
            {shown != null && days[shown] ? (
              <>
                <p className="flex items-center justify-between border-b px-4 py-3 text-[13px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>
                  {long(days[shown].day)}
                  {pin != null ? <span className="flex items-center gap-2 text-[10.5px] font-bold uppercase" style={{ color: "var(--mp-accent)" }}><Pin className="size-3" /> Jour figé <button onClick={() => setPin(null)} className="rounded-full border px-2 py-0.5 normal-case" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Libérer</button></span> : <Pin className="size-3.5 opacity-50" />}
                </p>
                <div className="px-4 py-2">
                  {d!.creators.map((c) => <p key={c.id} className="flex items-center gap-2.5 py-1.5 text-[13px]"><Avatar src={c.avatar} name={c.name} size="size-7" /><b className="min-w-0 flex-1 truncate" style={{ color: "var(--mp-head)" }}>{c.name}</b><b style={{ color: "var(--mp-head)" }}>{eur(c.days[shown].total)}</b></p>)}
                  <p className="mt-2 border-t pt-2 text-[11.5px] leading-relaxed" style={{ borderColor: "var(--mp-line)" }}>Média privé {eur(days[shown].ppv)} · Pourboires {eur(days[shown].tip)}{days[shown].mod ? ` · MoD ${eur(days[shown].mod)}` : ""}{days[shown].push ? ` · Push ${eur(days[shown].push)}` : ""}{days[shown].sub + days[shown].renew ? ` · Abonnements ${eur(days[shown].sub + days[shown].renew)}` : ""}<br />{int(days[shown].newSubs)} nouveaux abonnés · {int(days[shown].renewals)} renouvellements</p>
                </div>
              </>
            ) : (
              <><p className="border-b px-4 py-3 text-[13px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Performance Journalière</p><p className="px-4 py-3 text-[12px]" style={{ color: "#7b8fd4" }}>Survolez la courbe pour le détail, puis cliquez sur un point pour obtenir les stats du jour (et figer la journée).</p></>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl p-5" style={card}>
        <Head icon={<UserPlus className="size-4" />} title="Nouveaux abonnés" creators={d?.creators ?? []} right={<><span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "#0ab39c33", color: "#0ab39c" }}>{int(T.newSubs)} nouveaux</span><span className="ml-1.5 rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "#f7b84b33", color: "#f7b84b" }}>{int(T.renewals)} renouv.</span></>} />
        <Bars points={days.map((x) => ({ label: x.day, v: x.newSubs, v2: x.renewals }))} />
        <p className="mt-2 text-[11.5px]" style={{ color: "#7b8fd4" }}>Nouveau = premier abonnement du fan connu de Bloom sur ce modèle. Renouv. = abonnement d’un fan déjà abonné avant (dans les 180 jours d’historique lus chez MYM). Abonnements gratuits compris.</p>
      </div>

      <div className="mt-4 rounded-2xl p-5" style={card}>
        <Head icon={<Users className="size-4" />} title="Total abonnés actifs" creators={d?.creators ?? []} right={lastSubs != null ? <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "#40518955", color: "#7b8fd4" }}>{int(lastSubs)} actifs</span> : null} />
        {days.some((x) => x.subs != null) ? <Area points={days.map((x) => ({ label: x.day, v: x.subs }))} hover={null} pinned={false} onHover={() => {}} onPick={() => {}} fmt={(v) => int(Math.round(v))} h={210} /> : <p className="py-10 text-center text-[13px]">Pas encore de relevé sur cette période.</p>}
        <p className="mt-2 text-[11.5px]" style={{ color: "#7b8fd4" }}>Nombre d’abonnés actifs donné par MYM, relevé par Bloom toutes les 10 minutes (dernière valeur de chaque jour){d?.subsSince ? `, depuis le ${fr(d.subsSince)}` : ""}. MYM ne donne pas l’historique : pas de courbe avant cette date.</p>
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Revenus lus directement chez MYM (compte relié), en montants nets, jours de Paris.{d?.creators.some((c) => c.since && c.since > Date.parse(`${from}T00:00:00Z`)) ? " L’historique de Bloom ne couvre pas toute la période pour au moins un compte." : ""}</p>
    </div>
  );
}

function Head({ icon, title, creators, right }: { icon: React.ReactNode; title: string; creators: Creator[]; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{icon}</span>
      <b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>{title}</b>
      <span className="flex border-l pl-3" style={{ borderColor: "var(--mp-line)" }}>{creators.slice(0, 8).map((c) => <span key={c.id} className="-ml-1.5 rounded-full first:ml-0" style={{ boxShadow: "0 0 0 2px var(--mp-accent)" }} title={c.name}><Avatar src={c.avatar} name={c.name} size="size-8" /></span>)}</span>
      <span className="flex-1" />
      {right}
    </div>
  );
}

const W = 1000;
const nice = (max: number) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const m = max / p;
  return (m <= 1 ? 1 : m <= 1.4 ? 1.4 : m <= 2 ? 2 : m <= 3.5 ? 3.5 : m <= 5 ? 5 : m <= 7 ? 7 : 10) * p;
};
const ticksX = (n: number) => {
  const step = Math.max(1, Math.ceil(n / 8));
  return Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0);
};

/** Courbe pleine (revenus, total d'abonnés). Survol = jour montré ; clic = jour figé. Les jours sans valeur sont sautés. */
function Area({ points, hover, pinned, onHover, onPick, fmt, h = 330 }: { points: { label: string; v: number | null }[]; hover: number | null; pinned: boolean; onHover: (i: number | null) => void; onPick: (i: number) => void; fmt: (v: number) => string; h?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const L = 64, R = 14, T = 14, B = 30;
  const vals = points.map((p) => p.v).filter((v): v is number => v != null);
  const lo = fmt(1.5).includes("€") || !vals.length ? 0 : Math.max(0, Math.floor((Math.min(...vals) * 0.9) / 100) * 100);
  const max = lo + nice(Math.max(...vals, lo + 1) - lo);
  const n = points.length;
  const x = (i: number) => (n <= 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - (v - lo) / (max - lo)) * (h - T - B);
  const pts = points.map((p, i) => (p.v == null ? null : ([x(i), y(p.v)] as [number, number]))).filter((p): p is [number, number] => !!p);
  // Courbe lissée (les tangentes sont bornées pour ne pas passer sous zéro).
  let path = "";
  pts.forEach((p, i) => {
    if (!i) return void (path = `M${p[0]},${p[1]}`);
    const a = pts[i - 1];
    const dx = (p[0] - a[0]) / 2.4;
    path += ` C${a[0] + dx},${a[1]} ${p[0] - dx},${p[1]} ${p[0]},${p[1]}`;
  });
  const at = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    return n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
  };
  const hp = hover != null && points[hover]?.v != null ? ([x(hover), y(points[hover].v as number)] as const) : null;
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${h}`} className="w-full select-none" style={{ cursor: "pointer" }} onMouseMove={(e) => onHover(at(e))} onMouseLeave={() => onHover(null)} onClick={(e) => onPick(at(e))}>
      <defs><linearGradient id="mpArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c7ff4a" stopOpacity=".38" /><stop offset="1" stopColor="#c7ff4a" stopOpacity=".03" /></linearGradient></defs>
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const v = lo + ((max - lo) * k) / 5;
        return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity=".06" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11.5" fill="#878a99">{fmt(v)}</text></g>;
      })}
      {ticksX(n).map((i) => <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="11.5" fill="#878a99">{short(points[i].label)}</text>)}
      {pts.length > 1 ? <><path d={`${path} L${pts[pts.length - 1][0]},${h - B} L${pts[0][0]},${h - B} Z`} fill="url(#mpArea)" /><path d={path} fill="none" stroke="#c7ff4a" strokeWidth="2.2" /></> : null}
      {pts.length === 1 ? <circle cx={pts[0][0]} cy={pts[0][1]} r="4.5" fill="#141a11" stroke="#c7ff4a" strokeWidth="2.4" /> : null}
      {hp ? <><line x1={hp[0]} x2={hp[0]} y1={T} y2={h - B} stroke="#c7ff4a" strokeOpacity={pinned ? 0.6 : 0.25} strokeDasharray={pinned ? undefined : "4 4"} /><circle cx={hp[0]} cy={hp[1]} r="6" fill="#fff" stroke="#c7ff4a" strokeWidth="2.5" /></> : null}
    </svg>
  );
}

function Bars({ points }: { points: { label: string; v: number; v2: number }[] }) {
  const [tip, setTip] = useState<number | null>(null);
  const h = 330, L = 44, R = 14, T = 14, B = 30;
  const max = nice(Math.max(...points.map((p) => p.v), 1));
  const n = points.length;
  const slot = (W - L - R) / Math.max(n, 1);
  const bw = Math.max(2, slot * 0.72);
  const y = (v: number) => T + (1 - v / max) * (h - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="mt-4 w-full select-none" onMouseLeave={() => setTip(null)}>
      {[0, 1, 2, 3, 4, 5, 6].map((k) => {
        const v = (max * k) / 6;
        return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity=".06" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11.5" fill="#878a99">{Math.round(v)}</text></g>;
      })}
      {points.map((p, i) => <rect key={p.label} x={L + i * slot + (slot - bw) / 2} y={y(p.v)} width={bw} height={Math.max(0, h - B - y(p.v))} rx={Math.min(3, bw / 3)} fill="#a8d83f" opacity={tip == null || tip === i ? 1 : 0.55} onMouseEnter={() => setTip(i)} />)}
      {ticksX(n).map((i) => <text key={i} x={L + i * slot + slot / 2} y={h - 8} textAnchor="middle" fontSize="11.5" fill="#878a99">{short(points[i].label)}</text>)}
      {tip != null ? (() => {
        const p = points[tip];
        const cx = Math.min(W - R - 95, Math.max(L + 95, L + tip * slot + slot / 2));
        return <g pointerEvents="none"><rect x={cx - 95} y={T} width="190" height="46" rx="8" fill="#1a1d21" stroke="#3a4047" /><text x={cx} y={T + 19} textAnchor="middle" fontSize="12" fontWeight="600" fill="#f1f6e8">{short(p.label)}</text><text x={cx} y={T + 36} textAnchor="middle" fontSize="11.5" fill="#ced4da">{p.v} nouveaux · {p.v2} renouv.</text></g>;
      })() : null}
    </svg>
  );
}
