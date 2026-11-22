"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Info, RefreshCw, SlidersHorizontal, Upload, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui";
import { DateRange } from "../creators/CreatorReports";
import { BarCursor, Tip, niceTicks } from "../creators/Performance";

// Analytics → Employee reports (OnlyFans) : copie de la page d'Infloww. Données : rapports journaliers d'Infloww
// (ventes et chatting par employé × créatrice), recopiés par le serveur toutes les heures.
type Change = number | null | undefined;
type Gran = "day" | "week" | "month";
type Creator = { id: string; name: string; avatar: string | null };
type M = {
  sales: number; ppv: number; tips: number; dm: number; prio: number; mass: number; msgs: number; ppvs: number; unlocked: number; fans: number; chars: number;
  golden: number | null; unlockRate: number | null; rtSched: number | null; rtClock: number | null; spent: number | null; fanCvr: number | null; perSpent: number | null;
  salesChange?: Change; ppvChange?: Change; tipsChange?: Change; dmChange?: Change; prioChange?: Change; massChange?: Change; msgsChange?: Change; ppvsChange?: Change;
  unlockedChange?: Change; fansChange?: Change; charsChange?: Change; spentChange?: Change; perSpentChange?: Change;
};
type Emp = M & { id: string; name: string; creators: Creator[]; rows: (M & { creator: Creator | null })[] };
type Overview = {
  from: string; to: string; days: number; gran: Gran;
  chart: { label: string; v: number; msgs: number; tips: number; change: number | null }[];
  kpi: { sales: number; unlockRate: number | null; rtSched: number | null; rtClock: number | null };
  employees: Emp[];
  synced: string | null;
};
type Series = { label: string; sales: number; msgs: number; tips: number; change: number | null; dmSent: number; ppvSent: number; unlocked: number; fans: number; chars: number; golden: number | null; unlockRate: number | null }[];

const BLUE = "#2f6bff";
const GREEN = "#2ec4a6";
const RED = "#f26b6b";
const ORANGE = "#f7a14a";
const CMP = [BLUE, GREEN, ORANGE];
const DAY = 864e5;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY));
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = (v: number) => `$${+v.toFixed(2)}`;
const int = (v: number) => v.toLocaleString("fr-FR").replace(/ | /g, " ");
const dur = (ms: number | null) => (ms == null ? "-" : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);

// Colonnes du tableau « Chatting statistics » (ordre et noms d'Infloww). null = donnée de planning qu'Infloww ne partage pas.
type Col = { key: string; label: string; tip?: string; get: ((r: M) => React.ReactNode) | null; sort?: (r: M) => number };
const withCh = (v: React.ReactNode, c: Change) => (
  <span className="whitespace-nowrap">
    {v} <Ch c={c} />
  </span>
);
const green = (v: number | null) => <span style={{ color: v == null ? undefined : GREEN }}>{v == null ? "-" : `${v.toFixed(2)}%`}</span>;
const COLS: Col[] = [
  { key: "sales", label: "Sales", tip: "Sales attributed to the employee, based on your sales settings", get: (r) => withCh(usd(r.sales), r.salesChange), sort: (r) => r.sales },
  { key: "ppv", label: "PPV sales", tip: "Sales from PPVs", get: (r) => withCh(usd(r.ppv), r.ppvChange), sort: (r) => r.ppv },
  { key: "tips", label: "Tips", tip: "Tips attributed to the employee", get: (r) => withCh(usd(r.tips), r.tipsChange), sort: (r) => r.tips },
  { key: "dm", label: "Direct message sales", tip: "Sales from the employee's own messages (not mass or automated)", get: (r) => withCh(usd(r.dm), r.dmChange), sort: (r) => r.dm },
  { key: "msgs", label: "Direct messages sent", tip: "Messages sent, without mass and automated messages", get: (r) => withCh(int(r.msgs), r.msgsChange), sort: (r) => r.msgs },
  { key: "ppvs", label: "Direct PPVs sent", tip: "PPVs sent in direct messages", get: (r) => withCh(int(r.ppvs), r.ppvsChange), sort: (r) => r.ppvs },
  { key: "golden", label: "Golden ratio", tip: "PPVs sent ÷ messages sent", get: (r) => green(r.golden), sort: (r) => r.golden ?? -1 },
  { key: "unlocked", label: "PPVs unlocked", tip: "PPVs bought by fans", get: (r) => withCh(int(r.unlocked), r.unlockedChange), sort: (r) => r.unlocked },
  { key: "unlockRate", label: "Unlock rate", tip: "PPVs unlocked ÷ PPVs sent", get: (r) => green(r.unlockRate), sort: (r) => r.unlockRate ?? -1 },
  { key: "prio", label: "Priority mass message sales", tip: "Sales from priority mass messages", get: (r) => withCh(usd(r.prio), r.prioChange), sort: (r) => r.prio },
  { key: "mass", label: "OF mass message sales", tip: "Sales from OnlyFans mass messages", get: (r) => withCh(usd(r.mass), r.massChange), sort: (r) => r.mass },
  { key: "fans", label: "Fans chatted", tip: "Fans the employee chatted with", get: (r) => withCh(int(r.fans), r.fansChange), sort: (r) => r.fans },
  { key: "spent", label: "Fans who spent money", tip: "Fans who bought something attributed to the employee", get: (r) => (r.spent == null ? "-" : withCh(int(r.spent), r.spentChange)), sort: (r) => r.spent ?? -1 },
  { key: "fanCvr", label: "Fan CVR", tip: "Fans who spent money ÷ fans chatted", get: (r) => (r.fanCvr == null ? "-" : `${r.fanCvr}%`), sort: (r) => r.fanCvr ?? -1 },
  { key: "perSpent", label: "Avg earnings per fan who spent money", tip: "Sales ÷ fans who spent money", get: (r) => (r.perSpent == null ? "-" : withCh(usd(r.perSpent), r.perSpentChange)), sort: (r) => r.perSpent ?? -1 },
  { key: "chars", label: "Character count", tip: "Characters typed, without mass, automated and script messages", get: (r) => withCh(int(r.chars), r.charsChange), sort: (r) => r.chars },
  { key: "rtSched", label: "Response time (based on scheduled hours)", tip: "Average response time during scheduled shifts", get: (r) => dur(r.rtSched), sort: (r) => r.rtSched ?? -1 },
  { key: "rtClock", label: "Response time (based on clocked hours)", tip: "Average response time during clocked hours", get: (r) => dur(r.rtClock), sort: (r) => r.rtClock ?? -1 },
  { key: "sched", label: "Scheduled hours", tip: "Not shared by Infloww yet", get: () => "0min" },
  { key: "clocked", label: "Clocked hours", tip: "Not shared by Infloww yet", get: () => <span style={{ color: BLUE }}>0min</span> },
  { key: "hoursPro", label: "Hours on Messages Pro", tip: "Not shared by Infloww yet", get: null },
  { key: "salesHour", label: "Sales per hour", tip: "Not shared by Infloww yet", get: null },
  { key: "msgsHour", label: "Messages sent per hour", tip: "Not shared by Infloww yet", get: null },
  { key: "fansHour", label: "Fans chatted per hour", tip: "Not shared by Infloww yet", get: null },
];
const CKEY = "bloom.of.employee-metrics";

function Ch({ c }: { c: Change }) {
  if (c === undefined) return null;
  if (c == null) return <span className="text-[11px]">-</span>;
  return <span className="text-[11px] font-semibold" style={{ color: c > 0 ? GREEN : c < 0 ? RED : RED }}>{c.toFixed(2)}%</span>;
}

export function EmployeeReports() {
  const { t, lang } = useT();
  const loc = lang === "en" ? "en-US" : lang;
  const yesterday = addDays(iso(new Date()), -1);
  const [tab, setTab] = useState<"overview" | "performance">("overview");
  const [range, setRange] = useState({ from: addDays(yesterday, -6), to: yesterday });
  const [gran, setGran] = useState<Gran>("day");
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [cmp, setCmp] = useState<(string | null)[]>([null, null, null]);
  const [cmpData, setCmpData] = useState<Record<string, Series>>({});
  const [asc, setAsc] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "sales", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<{ key: string; on: boolean }[]>(COLS.map((c) => ({ key: c.key, on: true })));
  const [showCols, setShowCols] = useState(false);
  const [emp, setEmp] = useState<string | null>(null);
  const [empData, setEmpData] = useState<Series | null>(null);

  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(CKEY) || "null");
      if (Array.isArray(m)) setCols([...m.filter((x) => COLS.some((y) => y.key === x.key)), ...COLS.filter((y) => !m.some((x: { key: string }) => x.key === y.key)).map((y) => ({ key: y.key, on: true }))]);
    } catch {}
  }, []);

  const qs = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({ from: range.from, to: range.to, gran, ...extra }).toString(), [range, gran]);
  useEffect(() => {
    setBusy(true);
    api<Overview>("GET", `/api/of-reports/employees?${qs()}`)
      .then(setData)
      .catch((e) => toast((e as Error).message, "err"))
      .finally(() => setBusy(false));
  }, [qs, nonce]);
  // Courbes des employés comparés / de l'employé choisi.
  const ids = useMemo(() => [...new Set([...cmp.filter(Boolean), emp].filter(Boolean) as string[])], [cmp, emp]);
  useEffect(() => {
    ids.forEach((id) =>
      api<{ series: Series }>("GET", `/api/of-reports/employee?${qs({ id })}`)
        .then((r) => setCmpData((d) => ({ ...d, [`${id}|${qs()}`]: r.series })))
        .catch(() => {}),
    );
  }, [ids, qs, nonce]);
  useEffect(() => setEmpData(emp ? cmpData[`${emp}|${qs()}`] ?? null : null), [emp, cmpData, qs]);
  useEffect(() => {
    if (!emp && data?.employees.length) setEmp(data.employees[0].id);
  }, [data, emp]);

  const days = Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / DAY) + 1;
  const dateLabel = (s: string) => (gran === "month" ? parse(`${s}-15`).toLocaleDateString(loc, { month: "short", year: "numeric" }) : parse(s).toLocaleDateString(loc, { month: "short", day: "numeric" }));
  const emps = data?.employees ?? [];
  const nameOf = (id: string) => emps.find((e) => e.id === id)?.name ?? id;
  const ranking = useMemo(() => [...emps].sort((a, b) => (asc ? a.sales - b.sales : b.sales - a.sales)), [emps, asc]);
  const shown = cols.filter((c) => c.on).map((c) => COLS.find((x) => x.key === c.key)!);
  const rows = useMemo(() => {
    const c = COLS.find((x) => x.key === sort.key);
    const r = [...emps];
    if (sort.key === "name") r.sort((a, b) => a.name.localeCompare(b.name) * sort.dir);
    else if (c?.sort) r.sort((a, b) => (c.sort!(a) - c.sort!(b)) * sort.dir);
    return r;
  }, [emps, sort]);
  const cmpChart = useMemo(() => {
    const sel = cmp.filter(Boolean) as string[];
    if (!sel.length) return null;
    const base = cmpData[`${sel[0]}|${qs()}`];
    if (!base) return [];
    return base.map((p, i) => Object.fromEntries([["label", p.label], ...sel.map((id) => [id, cmpData[`${id}|${qs()}`]?.[i]?.sales ?? 0])]));
  }, [cmp, cmpData, qs]);

  const exportCsv = () => {
    const head = ["Employee", "Creators", ...shown.filter((c) => c.get).map((c) => t(c.label))];
    const val = (r: M, c: Col) => {
      const v = c.sort ? c.sort(r) : "";
      return v === -1 ? "" : String(v);
    };
    const lines = [head, ...rows.map((r) => [r.name, r.creators.map((c) => c.name).join(" / "), ...shown.filter((c) => c.get).map((c) => val(r, c))])];
    const esc = (x: string) => (/[",;\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
    const blob = new Blob(["﻿" + lines.map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `employee-report-${range.from}-${range.to}.csv`;
    a.click();
  };

  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--of-line)" }}>
        <h1 className="flex items-center gap-3 text-[17px] font-semibold">
          {t("Employee reports")}
          <span className="text-[13px] font-normal" style={{ color: "var(--of-muted)" }}>UTC+01:00</span>
          <Info className="size-4" style={{ color: "var(--of-muted)" }} />
        </h1>
        <button onClick={() => setNonce((n) => n + 1)} title={t("Refresh")} className="grid size-8 place-items-center rounded-lg" style={{ background: "var(--of-card)" }}>
          <RefreshCw className={cn("size-4", busy && "animate-spin")} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md px-3 py-2.5 text-[14px]" style={{ background: "var(--of-card)" }}>
        <Info className="size-4 shrink-0" style={{ color: ORANGE }} />
        {t("The sales data is based on your organization's sales settings.")}
        {data?.synced ? (
          <span className="ml-auto text-[12px]" style={{ color: "var(--of-muted)" }}>
            {t("Infloww data up to")} {dateLabel(data.synced)}
          </span>
        ) : null}
      </div>

      {/* Onglets + filtres */}
      <div className="sticky top-0 z-20 -mx-1 mt-3 flex flex-wrap items-center gap-3 border-b px-1 pt-1" style={{ background: "var(--of-page)", borderColor: "var(--of-line)" }}>
        {(["overview", "performance"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className="border-b-2 px-1 pb-2.5 text-[14px] font-medium" style={tab === k ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent" }}>
            {t(k === "overview" ? "Overview" : "Employee performance")}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2 pb-2">
          <DateRange range={range} setRange={setRange} lang={loc} t={t} />
          <ShownBy value={gran} set={setGran} days={days} t={t} />
        </div>
      </div>

      {tab === "overview" ? (
        <>
          {/* Ventes des employés */}
          <section className="mt-5">
            <Title tip={t("Sales attributed to employees, from messages and tips")}>{t("Employee sales")}</Title>
            <div className="mt-3 h-[310px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.chart ?? []} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--of-line)" />
                  <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--of-muted)", fontSize: 12 }} ticks={niceTicks(Math.max(0, ...(data?.chart ?? []).map((b) => b.v)))} domain={[0, "dataMax"]} tickFormatter={(v) => v.toLocaleString("en-US")} width={48} />
                  <Tooltip
                    cursor={<BarCursor />}
                    content={({ active, payload }) => {
                      const x = active && payload?.[0]?.payload;
                      if (!x) return null;
                      return (
                        <Tip>
                          <p>{dateLabel(x.label)}</p>
                          <p>
                            {t("Earnings")}: {amt(x.v)} {t("Growth")}: {x.change == null ? "-" : `${x.change.toFixed(2)}%`}
                          </p>
                          <p className="pl-2">{t("From Messages")}: {amt(x.msgs)}</p>
                          <p className="pl-2">{t("From Tips")}: {amt(x.tips)}</p>
                        </Tip>
                      );
                    }}
                  />
                  <Bar dataKey="v" fill={BLUE} maxBarSize={50} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Comparaison + classement */}
          <section className="mt-8 flex flex-col gap-6 lg:flex-row">
            <div className="min-w-0 flex-1">
              <Title tip={t("Compare the sales of up to three employees")}>{t("Employee comparison")}</Title>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {cmp.map((v, i) => (
                  <Fragment key={i}>
                    {i ? <span style={{ color: "var(--of-muted)" }}>-</span> : null}
                    <Select value={v} options={emps.map((e) => ({ id: e.id, name: e.name }))} placeholder={t("Select")} t={t} onChange={(id) => setCmp((c) => c.map((x, j) => (j === i ? id : x)))} color={v ? CMP[i] : undefined} />
                  </Fragment>
                ))}
              </div>
              {cmpChart ? (
                <div className="mt-4 h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cmpChart} margin={{ left: 0, right: 16, top: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--of-line)" />
                      <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--of-muted)", fontSize: 12 }} width={48} />
                      <Tooltip
                        cursor={{ stroke: "var(--of-text)", strokeDasharray: "4 3" }}
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <Tip>
                              <p>{dateLabel(String(label))}</p>
                              {payload.map((p) => (
                                <p key={String(p.dataKey)} className="flex items-center justify-between gap-6">
                                  <span className="flex items-center gap-1.5">
                                    <span className="size-2 rounded-full" style={{ background: p.color }} />
                                    {nameOf(String(p.dataKey))}
                                  </span>
                                  <b>{amt(Number(p.value))}</b>
                                </p>
                              ))}
                            </Tip>
                          ) : null
                        }
                      />
                      {(cmp.filter(Boolean) as string[]).map((id) => (
                        <Line key={id} dataKey={id} stroke={CMP[cmp.indexOf(id)]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="grid h-[260px] place-items-center text-center text-[14px]" style={{ color: "var(--of-muted)" }}>
                  <div>
                    <SlidersHorizontal className="mx-auto mb-3 size-10 opacity-60" />
                    {t("Select up to three employees to compare")}
                  </div>
                </div>
              )}
            </div>
            <div className="w-full lg:w-[300px]">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold">{t("Sales ranking")}</h3>
                <button onClick={() => setAsc(!asc)} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--of-muted)" }}>
                  {t(asc ? "Ascending" : "Descending")} <ChevronDown className="size-3.5" />
                </button>
              </div>
              <div className="of-scroll mt-3 max-h-[300px] overflow-y-auto pr-2">
                {ranking.map((e, i) => (
                  <div key={e.id} className="flex items-center gap-3 py-2.5 text-[14px]">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold" style={!asc && i < 3 ? { background: GREEN, color: "#fff" } : { background: "var(--of-line)" }}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    <span style={{ color: BLUE }}>{usd(e.sales)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Statistiques de chatting */}
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[16px] font-semibold">{t("Chatting statistics")}</h3>
              <div className="flex items-center gap-4">
                <button onClick={() => setShowCols(true)} className="flex items-center gap-1.5 text-[14px]">
                  <SlidersHorizontal className="size-4" /> {t("Custom metrics")}
                </button>
                <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px]" style={{ borderColor: BLUE, color: BLUE }}>
                  <Upload className="size-3.5" /> {t("Export")}
                </button>
              </div>
            </div>
            <p className="mt-3 text-[12px]" style={{ color: "var(--of-muted)" }}>
              {t("Percentage changes are calculated based on the change in value in the selected time frame against the same time frame preceding it.")}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  [data ? usd(data.kpi.sales) : "-", "Total sales"],
                  [data?.kpi.unlockRate != null ? `${data.kpi.unlockRate.toFixed(2)}%` : "-", "Unlock rate"],
                  [dur(data?.kpi.rtSched ?? null), "Average response time (based on scheduled hours)"],
                  [dur(data?.kpi.rtClock ?? null), "Average response time (based on clocked hours)"],
                  ["0min", "Total number of scheduled hours"],
                ] as const
              ).map(([v, k]) => (
                <div key={k} className="relative rounded-lg border p-5" style={{ borderColor: "var(--of-line)" }}>
                  <p className="text-[27px] font-semibold tabular-nums">{v}</p>
                  <p className="mt-1 pr-6 text-[12px]" style={{ color: "var(--of-muted)" }}>{t(k)}</p>
                  <Info className="absolute right-4 bottom-5 size-4" style={{ color: "var(--of-muted)" }} />
                </div>
              ))}
            </div>
            <div className="of-scroll mt-4 overflow-x-auto rounded-lg" style={{ background: "var(--of-card)" }}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left" style={{ background: "var(--of-line)" }}>
                    <Th label={t("Employees")} k="name" sort={sort} setSort={setSort} sticky />
                    <th className="px-4 py-3 font-medium whitespace-nowrap">{t("Creators")}</th>
                    {shown.map((c) => (
                      <Th key={c.key} label={t(c.label)} k={c.key} tip={c.tip ? t(c.tip) : undefined} sort={sort} setSort={c.sort ? setSort : undefined} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const many = r.creators.length > 1;
                    const isOpen = open.has(r.id);
                    return (
                      <Fragment key={r.id}>
                        <tr className="border-b" style={{ borderColor: "var(--of-line)" }}>
                          <td className="sticky left-0 z-10 px-3 py-3 whitespace-nowrap" style={{ background: "var(--of-card)" }}>
                            <span className="flex items-center gap-2">
                              {many ? (
                                <button onClick={() => setOpen((s) => (s.has(r.id) ? (s.delete(r.id), new Set(s)) : new Set(s.add(r.id))))} className="grid size-6 place-items-center">
                                  <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                                </button>
                              ) : (
                                <span className="size-6" />
                              )}
                              {r.name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {many ? (
                              <span className="flex -space-x-2">
                                {r.creators.slice(0, 3).map((c) => (
                                  <span key={c.id} title={c.name} className="rounded-full ring-2" style={{ ["--tw-ring-color" as string]: "var(--of-card)" }}>
                                    <Avatar src={c.avatar} name={c.name} size="size-8" />
                                  </span>
                                ))}
                                {r.creators.length > 3 ? (
                                  <span className="grid size-8 place-items-center rounded-full text-[11px] ring-2" style={{ background: "var(--of-area)", ["--tw-ring-color" as string]: "var(--of-card)" }}>
                                    +{r.creators.length - 3}
                                  </span>
                                ) : null}
                              </span>
                            ) : r.creators[0] ? (
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                <Avatar src={r.creators[0].avatar} name={r.creators[0].name} size="size-8" />
                                {r.creators[0].name}
                              </span>
                            ) : null}
                          </td>
                          {shown.map((c) => (
                            <td key={c.key} className="px-4 py-3 whitespace-nowrap tabular-nums">
                              {c.get ? c.get(r) : "-"}
                            </td>
                          ))}
                        </tr>
                        {isOpen
                          ? r.rows.map((x, i) => (
                              <tr key={i} className="border-b text-[12.5px]" style={{ borderColor: "var(--of-line)", background: "var(--of-page)" }}>
                                <td className="sticky left-0 z-10 px-3 py-2.5" style={{ background: "var(--of-page)" }} />
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  {x.creator ? (
                                    <span className="flex items-center gap-2">
                                      <Avatar src={x.creator.avatar} name={x.creator.name} size="size-7" />
                                      {x.creator.name}
                                    </span>
                                  ) : null}
                                </td>
                                {shown.map((c) => (
                                  <td key={c.key} className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                                    {c.get ? c.get(x) : "-"}
                                  </td>
                                ))}
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                  {data && !rows.length ? (
                    <tr>
                      <td colSpan={shown.length + 2} className="px-4 py-10 text-center" style={{ color: "var(--of-muted)" }}>
                        {t("No data available")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <Performance emps={emps} emp={emp} setEmp={setEmp} data={empData} dateLabel={dateLabel} t={t} />
      )}

      {showCols ? (
        <ColsModal
          t={t}
          value={cols}
          onClose={() => setShowCols(false)}
          onApply={(m) => {
            setCols(m);
            try {
              localStorage.setItem(CKEY, JSON.stringify(m));
            } catch {}
            setShowCols(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** Onglet « Employee performance » : un employé à la fois (puces + liste), ses courbes jour par jour. */
function Performance({ emps, emp, setEmp, data, dateLabel, t }: { emps: Emp[]; emp: string | null; setEmp: (id: string) => void; data: Series | null; dateLabel: (s: string) => string; t: (s: string) => string }) {
  const strip = useRef<HTMLDivElement>(null);
  const s = data ?? [];
  const axis = { tickLine: false, axisLine: false, tick: { fill: "var(--of-muted)", fontSize: 12 } } as const;
  const xAxis = <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} />;
  const grid = <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--of-line)" />;
  const one = (label: string, color: string, fmt: (v: number) => string) =>
    function OneTip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Record<string, unknown>; value?: unknown }[] }) {
      const x = active && payload?.[0];
      if (!x) return null;
      return (
        <Tip>
          <p>{dateLabel(String(x.payload?.label ?? ""))}</p>
          <p className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: color }} />
              {t(label)}
            </span>
            <b>{fmt(Number(x.value))}</b>
          </p>
        </Tip>
      );
    };
  const pctMax = (k: "golden" | "unlockRate") => {
    const m = Math.max(0, ...s.map((x) => x[k] ?? 0));
    return niceTicks(m || 1);
  };
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button onClick={() => strip.current?.scrollBy({ left: -300, behavior: "smooth" })} className="grid size-7 shrink-0 place-items-center rounded-md border" style={{ borderColor: "var(--of-line)" }}>
            <ChevronLeft className="size-4" />
          </button>
          <div ref={strip} className="flex min-w-0 flex-1 gap-3 overflow-x-hidden">
            {emps.map((e) => (
              <button key={e.id} onClick={() => setEmp(e.id)} className="shrink-0 rounded-md border px-4 py-1.5 text-[14px] whitespace-nowrap" style={emp === e.id ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--of-line)" }}>
                {e.name}
              </button>
            ))}
          </div>
          <button onClick={() => strip.current?.scrollBy({ left: 300, behavior: "smooth" })} className="grid size-7 shrink-0 place-items-center rounded-md border" style={{ borderColor: "var(--of-line)" }}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <Select value={emp} options={emps.map((e) => ({ id: e.id, name: e.name }))} placeholder={t("Select")} t={t} onChange={(id) => id && setEmp(id)} wide />
      </div>

      <Title tip={t("Sales attributed to the employee, from messages and tips")} className="mt-6">{t("Sales")}</Title>
      <div className="mt-3 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={s} margin={{ left: 0, right: 8, top: 8 }}>
            {grid}
            {xAxis}
            <YAxis {...axis} ticks={niceTicks(Math.max(0, ...s.map((b) => b.sales)))} domain={[0, "dataMax"]} width={48} />
            <Tooltip
              cursor={<BarCursor />}
              content={({ active, payload }) => {
                const x = active && payload?.[0]?.payload;
                if (!x) return null;
                return (
                  <Tip>
                    <p>{dateLabel(x.label)}</p>
                    <p>
                      {t("Earnings")}: {amt(x.sales)} {t("Growth")}: {x.change == null ? "-" : `${x.change.toFixed(2)}%`}
                    </p>
                    {x.msgs ? <p className="pl-2">{t("From Messages")}: {amt(x.msgs)}</p> : null}
                    {x.tips ? <p className="pl-2">{t("From Tips")}: {amt(x.tips)}</p> : null}
                  </Tip>
                );
              }}
            />
            <Bar dataKey="sales" fill={BLUE} maxBarSize={50} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3 className="mt-8 text-[16px] font-semibold">{t("Message statistics")}</h3>
      <div className="mt-3 h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={s} margin={{ left: 0, right: 8, top: 8 }} barGap={4}>
            {grid}
            {xAxis}
            <YAxis {...axis} ticks={niceTicks(Math.max(0, ...s.map((b) => b.dmSent)))} domain={[0, "dataMax"]} width={48} />
            <Tooltip
              cursor={<BarCursor />}
              content={({ active, payload }) => {
                const x = active && payload?.[0]?.payload;
                if (!x) return null;
                return (
                  <Tip>
                    <p>{dateLabel(x.label)}</p>
                    {(
                      [
                        ["Direct messages sent", BLUE, x.dmSent],
                        ["Direct PPVs sent", GREEN, x.ppvSent],
                        ["PPVs unlocked", RED, x.unlocked],
                      ] as const
                    ).map(([k, c, v]) => (
                      <p key={k} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: c }} />
                          {t(k)}
                        </span>
                        <b>{v}</b>
                      </p>
                    ))}
                  </Tip>
                );
              }}
            />
            <Legend iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: "var(--of-text)", fontSize: 12 }}>{t(String(v))}</span>} />
            <Bar dataKey="dmSent" name="Direct messages sent" fill={BLUE} maxBarSize={14} isAnimationActive={false} />
            <Bar dataKey="ppvSent" name="Direct PPVs sent" fill={GREEN} maxBarSize={14} isAnimationActive={false} />
            <Bar dataKey="unlocked" name="PPVs unlocked" fill={RED} maxBarSize={14} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <Title tip={t("Fans the employee chatted with")}>{t("Fans chatted")}</Title>
          <div className="mt-3 h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s} margin={{ left: 0, right: 8, top: 8 }}>
                {grid}
                {xAxis}
                <YAxis {...axis} ticks={niceTicks(Math.max(0, ...s.map((b) => b.fans)))} domain={[0, "dataMax"]} width={40} />
                <Tooltip cursor={<BarCursor />} content={one("Fans chatted", BLUE, (v) => String(v))} />
                <Bar dataKey="fans" fill={BLUE} maxBarSize={4} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <Title tip={t("Characters typed, without mass, automated and script messages")}>{t("Character count")}</Title>
          <div className="mt-3 h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s} margin={{ left: 0, right: 16, top: 8 }}>
                {grid}
                <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} padding={{ left: 30, right: 30 }} />
                <YAxis {...axis} ticks={niceTicks(Math.max(0, ...s.map((b) => b.chars)))} domain={[0, "dataMax"]} tickFormatter={(v) => v.toLocaleString("en-US")} width={56} />
                <Tooltip cursor={{ stroke: "var(--of-text)", strokeDasharray: "4 3" }} content={one("Character count", GREEN, (v) => v.toLocaleString("en-US"))} />
                <Line dataKey="chars" type="monotone" stroke={GREEN} strokeWidth={2.5} dot={{ r: 2.5, fill: GREEN }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        {(
          [
            ["golden", "Golden ratio", ORANGE, "PPVs sent ÷ messages sent"],
            ["unlockRate", "Unlock rate", RED, "PPVs unlocked ÷ PPVs sent"],
          ] as const
        ).map(([k, label, color, tip]) => (
          <div key={k}>
            <Title tip={t(tip)}>{t(label)}</Title>
            <div className="mt-3 h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s} margin={{ left: 0, right: 16, top: 8 }}>
                  {grid}
                  <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} padding={{ left: 30, right: 30 }} />
                  <YAxis {...axis} ticks={pctMax(k)} domain={[0, "dataMax"]} tickFormatter={(v) => `${v}%`} width={44} />
                  <Tooltip cursor={{ stroke: "var(--of-text)", strokeDasharray: "4 3" }} content={one(label, color, (v) => `${v.toFixed(2)}%`)} />
                  <Line dataKey={k} stroke={color} strokeWidth={2.5} dot={{ r: 2.5, fill: color }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Title({ children, tip, className }: { children: React.ReactNode; tip: string; className?: string }) {
  return (
    <h3 className={cn("flex items-center gap-2 text-[16px] font-semibold", className)}>
      {children}
      <span title={tip}>
        <Info className="size-3.5" style={{ color: "var(--of-muted)" }} />
      </span>
    </h3>
  );
}

function Th({ label, k, tip, sort, setSort, sticky }: { label: string; k: string; tip?: string; sort: { key: string; dir: 1 | -1 }; setSort?: (s: { key: string; dir: 1 | -1 }) => void; sticky?: boolean }) {
  const on = sort.key === k;
  return (
    <th className={cn("px-4 py-3 align-middle font-medium", sticky && "sticky left-0 z-10")} style={sticky ? { background: "var(--of-line)" } : undefined}>
      <span className="flex min-w-[110px] max-w-[170px] items-center gap-1.5">
        <span className="leading-tight">{label}</span>
        {tip ? (
          <span title={tip}>
            <Info className="size-3.5 shrink-0" style={{ color: "var(--of-muted)" }} />
          </span>
        ) : null}
        {setSort ? (
          <button onClick={() => setSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : -1 })} className="ml-auto shrink-0 text-[10px] leading-none" style={{ color: on ? BLUE : "var(--of-muted)" }}>
            {on ? (sort.dir === 1 ? "▲" : "▼") : "▲▼"}
          </button>
        ) : null}
      </span>
    </th>
  );
}

function Select({ value, options, placeholder, onChange, t, color, wide }: { value: string | null; options: { id: string; name: string }[]; placeholder: string; onChange: (id: string | null) => void; t: (s: string) => string; color?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);
  const cur = options.find((o) => o.id === value);
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} className={cn("flex h-9 items-center justify-between gap-2 rounded-md border px-3 text-[14px]", wide ? "w-[200px]" : "w-[105px]")} style={{ borderColor: "var(--of-line)" }}>
        <span className="flex min-w-0 items-center gap-1.5 truncate" style={{ color: cur ? "var(--of-text)" : "var(--of-muted)" }}>
          {color ? <span className="size-2 shrink-0 rounded-full" style={{ background: color }} /> : null}
          <span className="truncate">{cur?.name ?? placeholder}</span>
        </span>
        {cur && !wide ? (
          <X className="size-3.5 shrink-0" onClick={(e) => (e.stopPropagation(), onChange(null))} />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" style={{ color: "var(--of-muted)" }} />
        )}
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-56 rounded-md border p-1 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)", ...(wide ? { right: 0 } : { left: 0 }) }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search")} className="mb-1 h-8 w-full rounded px-2 text-[13px] outline-none" style={{ background: "var(--of-page)" }} />
          <div className="of-scroll max-h-64 overflow-y-auto">
            {options
              .filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()))
              .map((o) => (
                <button key={o.id} onClick={() => (onChange(o.id), setOpen(false))} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[13px] hover:opacity-80">
                  {o.name}
                  {o.id === value ? <Check className="size-3.5" style={{ color: BLUE }} /> : null}
                </button>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ShownBy({ value, set, days, t }: { value: Gran; set: (g: Gran) => void; days: number; t: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const ok = (g: Gran) => (g === "week" ? days >= 14 && days <= 365 : g === "month" ? days > 62 : true);
  useEffect(() => {
    if (!ok(value)) set("day");
  });
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)} className="flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[14px]" style={{ borderColor: "var(--of-line)" }}>
        {t(`Shown by ${value}`)} <ChevronDown className="size-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-30 w-44 rounded-md border p-1 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
          {(["day", "week", "month"] as Gran[]).map((g) => (
            <button key={g} disabled={!ok(g)} onMouseDown={() => (set(g), setOpen(false))} className="block w-full rounded px-2.5 py-1.5 text-left text-[14px] disabled:opacity-40" style={value === g ? { background: "var(--of-line)" } : undefined}>
              {t(`Shown by ${g}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColsModal({ t, value, onClose, onApply }: { t: (s: string) => string; value: { key: string; on: boolean }[]; onClose: () => void; onApply: (m: { key: string; on: boolean }[]) => void }) {
  const [m, setM] = useState(value);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-xl p-5" style={{ background: "var(--of-card)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-semibold">{t("Custom metrics")}</h3>
          <button onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        <div className="of-scroll mt-4 max-h-[60vh] overflow-y-auto">
          {m.map((c) => {
            const def = COLS.find((x) => x.key === c.key)!;
            return (
              <label key={c.key} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-[14px]">
                <input type="checkbox" checked={c.on} onChange={() => setM((x) => x.map((y) => (y.key === c.key ? { ...y, on: !y.on } : y)))} />
                {t(def.label)}
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-4 py-1.5 text-[14px]" style={{ borderColor: "var(--of-line)" }}>
            {t("Cancel")}
          </button>
          <button onClick={() => onApply(m)} className="rounded-md px-4 py-1.5 text-[14px] text-white" style={{ background: BLUE }}>
            {t("Apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
