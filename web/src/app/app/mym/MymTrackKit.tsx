"use client";

import { useMemo, useState } from "react";
import { BarChart3, Euro, LineChart, Lock, MousePointerClick, Percent, PieChart, UserPlus } from "lucide-react";

// Liens de suivi MYM : ce qui sert à la page de Bloom ET à la page publique d'un partage (chiffres, courbes).
export type TLink = { id: string; name: string; url: string | null; created: string | null; clicks: number; subs: number; ppv: number; ppvN: number; subRev: number; total: number };
export type TDay = { id: string; day: string; clicks: number; subs: number; ppv: number; ppvN: number; total: number };
export type TData = { from: string; to: string; today: string; links: TLink[]; days: TDay[]; since: string | null; at: number | null; error?: string | null; canEdit?: boolean };
export type Metric = "total" | "clicks" | "subs" | "ppv" | "rate";
export const COLORS = ["#2f6bff", "#1fe0a0", "#ff2d7a", "#8b5cf6", "#f7b84b", "#22d3ee", "#f1734f", "#a3e635"];
export const tcard = { background: "#1c1f26", border: "1px solid #2a2e37" };
export const money = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ")} €`;
export const num = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
export const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const frDay = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d || "—");
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");
const fmtOf = (m: Metric) => (v: number) => (m === "total" || m === "ppv" ? money(v) : m === "rate" ? `${v.toFixed(2)} %` : num(Math.round(v)));

export function Kpis({ links }: { links: TLink[] }) {
  const s = (k: "total" | "clicks" | "subs") => links.reduce((a, l) => a + l[k], 0);
  const items: [string, string, React.ReactNode, string][] = [
    ["Revenu total", money(s("total")), <Euro key="a" className="size-5" />, "#2f6bff"],
    ["Clics totaux", num(s("clicks")), <MousePointerClick key="b" className="size-5" />, "#1fe0a0"],
    ["Abonnés (conv.)", num(s("subs")), <UserPlus key="c" className="size-5" />, "#ff2d7a"],
    ["Taux conv.", `${(s("clicks") ? (s("subs") / s("clicks")) * 100 : 0).toFixed(2)} %`, <PieChart key="d" className="size-5" />, "#f1734f"],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, v, icon, color]) => (
        <div key={label} className="flex items-center gap-4 rounded-2xl p-6" style={tcard}>
          <span className="grid size-11 place-items-center rounded-xl" style={{ background: `${color}22`, color }}>{icon}</span>
          <div><p className="text-[11.5px] font-semibold tracking-wider uppercase">{label}</p><p className="mt-1 text-[24px] font-bold" style={{ color: "#f3f4f6" }}>{v}</p></div>
        </div>
      ))}
    </div>
  );
}

/** Courbes par lien : Revenus / Clics / Abonnés / PPV / Taux, en cumul ou par jour, sur la période choisie. */
export function TrackChart({ d, dates, setDates }: { d: TData; dates: [string, string]; setDates: (r: [string, string], preset: string) => void }) {
  const [metric, setMetric] = useState<Metric>("total");
  const [mode, setMode] = useState<"cumul" | "daily">("cumul");
  const [preset, setPreset] = useState("30");
  const [tip, setTip] = useState<number | null>(null);
  const [from, to] = dates;
  const days = useMemo(() => {
    const out: string[] = [];
    for (let x = from; x <= to && out.length < 420; x = addDay(x, 1)) out.push(x);
    return out;
  }, [from, to]);
  // Par lien : la valeur de chaque jour (dernier relevé connu), puis cumul ou différence avec la veille.
  const series = useMemo(() => d.links.map((l, i) => {
    const by = new Map(d.days.filter((x) => x.id === l.id).map((x) => [x.day, x]));
    let last: TDay | null = by.get(addDay(from, -1)) ?? null;
    const vals = days.map((day) => {
      const cur = by.get(day) ?? (day <= d.today ? last : null);
      const prev = last;
      if (cur) last = cur;
      if (!cur) return null;
      if (mode === "cumul") return metric === "rate" ? (cur.clicks ? (cur.subs / cur.clicks) * 100 : 0) : cur[metric];
      if (!prev) return null;
      if (metric === "rate") return cur.clicks - prev.clicks > 0 ? Math.max(0, ((cur.subs - prev.subs) / (cur.clicks - prev.clicks)) * 100) : 0;
      return Math.max(0, cur[metric] - prev[metric]);
    });
    return { id: l.id, name: l.name, color: COLORS[i % COLORS.length], vals };
  }), [d, days, from, metric, mode]);
  const fmt = fmtOf(metric);
  const W = 1000, H = 400, L = 70, R = 14, T = 16, B = 30;
  const all = series.flatMap((s) => s.vals).filter((v): v is number => v != null);
  const rawMax = Math.max(...all, 0);
  const p10 = 10 ** Math.floor(Math.log10(rawMax || 1));
  const max = rawMax > 0 ? Math.ceil(rawMax / (p10 / 2)) * (p10 / 2) : 1;
  const n = days.length;
  const x = (i: number) => (n <= 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const step = Math.max(1, Math.ceil(n / 8));
  const pick = (p: string) => {
    setPreset(p);
    setDates(p === "7" ? [addDay(d.today, -6), d.today] : p === "30" ? [addDay(d.today, -29), d.today] : [d.since && d.since < d.today ? d.since : addDay(d.today, -29), d.today], p);
  };
  const tabs: [Metric, string, React.ReactNode][] = [["total", "Revenus", <Euro key="a" className="size-3.5" />], ["clicks", "Clics", <MousePointerClick key="b" className="size-3.5" />], ["subs", "Abonnés", <UserPlus key="c" className="size-3.5" />], ["ppv", "PPV", <Lock key="d" className="size-3.5" />], ["rate", "Taux", <Percent key="e" className="size-3.5" />]];
  return (
    <div className="rounded-2xl p-5" style={tcard}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-xl border p-1 text-[13px] font-semibold" style={{ borderColor: "#2a2e37" }}>{tabs.map(([k, l, icon]) => <button key={k} onClick={() => setMetric(k)} className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5" style={metric === k ? { background: "#1f6fff", color: "#fff" } : undefined}>{icon}{l}</button>)}</div>
        <span className="flex-1" />
        <div className="flex rounded-lg border p-0.5 text-[12px] font-semibold" style={{ borderColor: "#2a2e37" }}>
          <button onClick={() => setMode("cumul")} className="flex items-center gap-1.5 rounded-md px-2.5 py-1" style={mode === "cumul" ? { background: "#2a2e37", color: "#fff" } : undefined}><LineChart className="size-3.5" /> Cumul</button>
          <button onClick={() => setMode("daily")} className="flex items-center gap-1.5 rounded-md px-2.5 py-1" style={mode === "daily" ? { background: "#2a2e37", color: "#fff" } : undefined}><BarChart3 className="size-3.5" /> Daily</button>
        </div>
        {[["7", "7j"], ["30", "30j"], ["max", "Max"]].map(([k, l]) => <button key={k} onClick={() => pick(k)} className="rounded-full border px-3.5 py-1 text-[12.5px] font-semibold" style={preset === k ? { background: "#3b5bff", borderColor: "#3b5bff", color: "#fff" } : { borderColor: "#2a2e37" }}>{l}</button>)}
        <span className="flex items-center gap-2 text-[12.5px]">
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && (setPreset(""), setDates([e.target.value, to], ""))} className="rounded-md px-2 py-1 outline-none" style={{ background: "#12141a", colorScheme: "dark", color: "#f3f4f6" }} />
          →
          <input type="date" value={to} min={from} max={d.today} onChange={(e) => e.target.value && (setPreset(""), setDates([from, e.target.value], ""))} className="rounded-md px-2 py-1 outline-none" style={{ background: "#12141a", colorScheme: "dark", color: "#f3f4f6" }} />
        </span>
      </div>
      <div className="relative mt-4" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setTip(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
        }}>
          {[0, 1, 2, 3, 4, 5].map((k) => {
            const v = (max * k) / 5;
            return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity=".05" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11.5" fill="#c9cdd6">{metric === "rate" ? `${Math.round(v * 10) / 10}%` : metric === "total" || metric === "ppv" ? `${num(Math.round(v))} €` : num(Math.round(v))}</text></g>;
          })}
          {days.map((day, i) => (i % step === 0 ? <text key={day} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"} fontSize="11.5" fill="#c9cdd6">{short(day)}</text> : null))}
          {series.map((s) => {
            const pts = s.vals.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean) as string[];
            return pts.length > 1 ? <polyline key={s.id} points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" /> : pts.length === 1 ? <circle key={s.id} cx={pts[0].split(",")[0]} cy={pts[0].split(",")[1]} r="4.5" fill={s.color} /> : null;
          })}
          {tip != null ? series.map((s) => (s.vals[tip] != null ? <circle key={s.id} cx={x(tip)} cy={y(s.vals[tip] as number)} r="5.5" fill={s.color} /> : null)) : null}
        </svg>
        {tip != null && days[tip] ? (
          <div className="pointer-events-none absolute top-10 z-10 w-60 rounded-xl text-[13px] shadow-xl" style={{ left: `clamp(0px, calc(${(x(tip) / W) * 100}% + 14px), calc(100% - 240px))`, background: "#1a1d24", border: "1px solid #2f3440" }}>
            <p className="flex items-center gap-2 border-b px-4 py-2.5 font-bold" style={{ borderColor: "#2f3440", color: "#f3f4f6" }}>{frDay(days[tip])} <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#2f6bff", color: "#fff" }}>{mode === "cumul" ? "Cumul" : "Daily"}</span></p>
            <div className="space-y-1.5 px-4 py-2.5">{[...series].sort((a, b) => (b.vals[tip] ?? -1) - (a.vals[tip] ?? -1)).map((s) => <p key={s.id} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} /><span className="min-w-0 flex-1 truncate">{s.name}</span><b style={{ color: "#f3f4f6" }}>{s.vals[tip] != null ? fmt(s.vals[tip] as number) : "—"}</b></p>)}</div>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "#7b8fd4" }}>MYM ne donne que le total de chaque lien : Bloom le relève toutes les 10 minutes{d.since ? `, depuis le ${frDay(d.since)}` : ""}. Pas de courbe avant ce premier relevé ; « Daily » = ce qui s’est ajouté dans la journée.</p>
    </div>
  );
}
