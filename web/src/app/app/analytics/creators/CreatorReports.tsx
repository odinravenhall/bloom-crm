"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleDollarSign, Download, Feather, Filter, GripVertical,
  Info, MessageCircle, Radio, RefreshCw, Repeat2, Search, SlidersHorizontal, SquareUser, StickyNote, Tag, Upload, UsersRound, X, type LucideIcon,
} from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui";
import { Performance } from "./Performance";

// Analytics → Creator reports (OnlyFans) : copie de la page d'Infloww. Couleurs : variables --of-* (sombre / clair),
// orange d'Infloww pour les accents de cette page.
type Change = number | null;
type Account = { id: string; name: string; avatar: string | null };
type Row = {
  id: string; name: string; avatar: string | null; subscriptions: number; subscriptionsChange: Change; subNew: number; subRecurring: number; tips: number; messages: number; posts: number; streams: number;
  total: number; totalChange: Change; contribution: number; contributionChange: Change; refunds: number; avgHourly: number; newSubs: number | null; renewals: number; spenders: number; avgPerSpender: number;
  avgPerTx: number; replyMs: number | null; fansChatted: number | null; messagesSent: number | null; ppvSent: number | null;
  newSubsChange?: Change; newSubLtv?: number | null; spendersChange?: Change; avgPerSpenderChange?: Change; avgPerTxChange?: Change;
  replyMsChange?: Change; fansChattedChange?: Change; messagesSentChange?: Change; ppvSentChange?: Change;
};
type Channel = "subscriptions" | "tips" | "posts" | "messages" | "referrals" | "streams";
type Report = {
  from: string; to: string; days: number; gran: Gran; net: boolean; accounts: Account[];
  summary: Record<"total" | Channel, { v: number; change: Change }>;
  trends: ({ label: string; total: number; change: Change } & Record<Channel, number>)[];
  kpi: { creators: number; messages: number; total: number; refunded: number };
  creators: Row[];
};
type Gran = "hour" | "day" | "week" | "month";

const ORANGE = "#f28c5b";
const BAR = "#c0603d";
const CH: { key: Channel; label: string; color: string; icon: LucideIcon }[] = [
  { key: "subscriptions", label: "Subscriptions", color: "#3b9df8", icon: Repeat2 },
  { key: "tips", label: "Tips", color: "#57b45c", icon: CircleDollarSign },
  { key: "posts", label: "Posts", color: "#f0883e", icon: StickyNote },
  { key: "messages", label: "Messages", color: "#b56fd8", icon: MessageCircle },
  { key: "referrals", label: "Referrals", color: "#e9578a", icon: UsersRound },
  { key: "streams", label: "Streams", color: "#c8b02c", icon: Radio },
];
const DAY = 864e5;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY));
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (v: number) => (Math.abs(v) >= 1000 ? `$${+(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`);

// Colonnes du tableau (« Custom metrics »), comme Infloww. null = donnée OnlyFans que Bloom n'a pas.
type Metric = { key: string; label: string; on: boolean; tip?: string; get: ((r: Row) => React.ReactNode) | null; sort?: (r: Row) => number };
const money = (v: number) => <span className="font-mono">{usd(v)}</span>;
const withChange = (v: number, c: Change, pct = false) => (
  <span className="font-mono whitespace-nowrap">
    {pct ? `${v.toFixed(2)}%` : usd(v)} <ChangeTxt c={c} />
  </span>
);
// Nombre (ou texte) suivi de son évolution, comme Infloww (« 443 -3.70% »).
const numChange = (v: React.ReactNode, c: Change | undefined) => (
  <span className="font-mono whitespace-nowrap">
    {v} <ChangeTxt c={c ?? null} />
  </span>
);
const METRICS: Metric[] = [
  { key: "subscriptions", label: "Total subscription earnings", on: true, tip: "New and recurring subscriptions", get: (r) => withChange(r.subscriptions, r.subscriptionsChange), sort: (r) => r.subscriptions },
  { key: "subNew", label: "Subscription earnings", on: false, get: (r) => money(r.subNew), sort: (r) => r.subNew },
  { key: "subRecurring", label: "Recurring subscription earnings", on: false, get: (r) => money(r.subRecurring), sort: (r) => r.subRecurring },
  { key: "tips", label: "Tips", on: true, get: (r) => money(r.tips), sort: (r) => r.tips },
  { key: "messages", label: "Message", on: true, get: (r) => money(r.messages), sort: (r) => r.messages },
  { key: "engagement", label: "Engagement earnings ratio", on: true, tip: "Data from OnlyFans", get: null },
  { key: "streams", label: "Streams", on: false, get: (r) => money(r.streams), sort: (r) => r.streams },
  { key: "posts", label: "Posts", on: false, get: (r) => money(r.posts), sort: (r) => r.posts },
  { key: "total", label: "Total earnings", on: true, tip: "All earnings in the period", get: (r) => withChange(r.total, r.totalChange), sort: (r) => r.total },
  { key: "avgHourly", label: "Avg hourly earnings", on: false, get: (r) => money(r.avgHourly), sort: (r) => r.avgHourly },
  { key: "refunds", label: "Refunds", on: false, get: (r) => money(r.refunds), sort: (r) => r.refunds },
  { key: "contribution", label: "Contribution %", on: true, tip: "Share of the total earnings", get: (r) => withChange(r.contribution, r.contributionChange, true), sort: (r) => r.contribution },
  { key: "ofRanking", label: "OF ranking", on: true, tip: "Data from OnlyFans", get: null },
  { key: "following", label: "Following", on: false, get: null },
  { key: "renewOn", label: "Fans with renew on", on: true, get: null },
  { key: "renewPct", label: "Renew on %", on: false, get: null },
  { key: "visitors", label: "Profile visitors", on: true, get: null },
  { key: "guestVisitors", label: "Guest profile visitors", on: false, get: null },
  { key: "userVisitors", label: "User profile visitors", on: false, get: null },
  { key: "newSubs", label: "New subscribers", on: true, get: (r) => numChange(r.newSubs ?? "- -", r.newSubsChange), sort: (r) => r.newSubs ?? -1 },
  { key: "renewals", label: "Subscriber renewals", on: true, get: (r) => numChange(r.renewals, null), sort: (r) => r.renewals },
  { key: "ltv", label: "New subscriber LTV", on: true, get: (r) => (r.newSubLtv == null ? <span className="font-mono">- -</span> : money(r.newSubLtv)), sort: (r) => r.newSubLtv ?? -1 },
  { key: "conversion", label: "New subscriber conversion", on: true, get: null },
  { key: "activeFans", label: "Active fans", on: true, get: null },
  { key: "expiredChange", label: "Change in expired fan count", on: false, get: null },
  { key: "spenders", label: "Number of spenders", on: true, get: (r) => numChange(r.spenders, r.spendersChange), sort: (r) => r.spenders },
  { key: "avgPerSpender", label: "Avg spend per spender", on: true, get: (r) => numChange(usd(r.avgPerSpender), r.avgPerSpenderChange), sort: (r) => r.avgPerSpender },
  { key: "avgPerTx", label: "Avg spend per transaction", on: false, get: (r) => numChange(usd(r.avgPerTx), r.avgPerTxChange), sort: (r) => r.avgPerTx },
  { key: "totalFans", label: "Total number of fans", on: false, get: null },
  { key: "avgPerFan", label: "Avg earnings per fan", on: false, get: null },
  { key: "avgSubLength", label: "Avg subscription length", on: false, get: null },
  { key: "replyMs", label: "Reply time", on: true, get: (r) => numChange(r.replyMs == null ? "- -" : fmtMs(r.replyMs), r.replyMsChange), sort: (r) => r.replyMs ?? -1 },
  { key: "fansChatted", label: "Fans chatted", on: true, get: (r) => numChange(r.fansChatted ?? "- -", r.fansChattedChange), sort: (r) => r.fansChatted ?? -1 },
  { key: "messagesSent", label: "Messages sent", on: true, get: (r) => numChange(r.messagesSent ?? "- -", r.messagesSentChange), sort: (r) => r.messagesSent ?? -1 },
  { key: "ppvSent", label: "PPVs sent", on: true, get: (r) => numChange(r.ppvSent ?? "- -", r.ppvSentChange), sort: (r) => r.ppvSent ?? -1 },
];
const fmtMs = (ms: number) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : ms < 3600e3 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${(ms / 3600e3).toFixed(1)}h`);
const MKEY = "bloom.of.creator-metrics";
const FKEY = "bloom.of.creator-report";

function ChangeTxt({ c }: { c: Change }) {
  if (c == null) return null;
  const up = c > 0;
  if (c === 0) return <span style={{ color: "var(--of-text)" }}>0.00%</span>;
  return (
    <span className="inline-flex items-center gap-0.5" style={{ color: up ? "#3fb950" : "#f0548c" }}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}
      {up ? "+" : ""}
      {c.toFixed(2)}%
    </span>
  );
}

export function CreatorReports() {
  const { t, lang } = useT();
  const yesterday = addDays(iso(new Date()), -1);
  const [tab, setTab] = useState<"overview" | "performance">("overview");
  const [range, setRange] = useState({ from: addDays(yesterday, -6), to: yesterday });
  const [sel, setSel] = useState<string[]>([]);
  const [net, setNet] = useState(true);
  const [gran, setGran] = useState<Gran>("day");
  const [perfGran, setPerfGran] = useState<Gran>("day");
  const [chGran, setChGran] = useState<Gran>("day");
  const [chans, setChans] = useState<Channel[]>(CH.map((c) => c.key));
  const [data, setData] = useState<Report | null>(null);
  const [chData, setChData] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<{ key: string; on: boolean }[]>(METRICS.map((m) => ({ key: m.key, on: m.on })));
  const [showMetrics, setShowMetrics] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>({ key: "name", dir: 1 });
  const [barHover, setBarHover] = useState<number | null>(null);

  // Filtres et colonnes gardés sur cet ordinateur.
  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(MKEY) || "null");
      if (Array.isArray(m)) setMetrics([...m.filter((x) => METRICS.some((y) => y.key === x.key)), ...METRICS.filter((y) => !m.some((x: { key: string }) => x.key === y.key)).map((y) => ({ key: y.key, on: y.on }))]);
      const f = JSON.parse(localStorage.getItem(FKEY) || "null");
      if (f) (setSel(f.sel || []), setNet(f.net !== false));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(FKEY, JSON.stringify({ sel, net }));
    } catch {}
  }, [sel, net]);

  const qs = useCallback(
    (g: Gran) => {
      const p = new URLSearchParams({ from: range.from, to: range.to, net: net ? "1" : "0", gran: g });
      if (sel.length) p.set("accounts", sel.join(","));
      return p.toString();
    },
    [range, net, sel],
  );
  const load = useCallback(() => {
    setBusy(true);
    Promise.all([api<Report>("GET", `/api/of-reports/creators?${qs(gran)}`), api<Report>("GET", `/api/of-reports/creators?${qs(chGran)}`)])
      .then(([a, b]) => (setData(a), setChData(b)))
      .catch((e) => toast((e as Error).message, "err"))
      .finally(() => setBusy(false));
  }, [qs, gran, chGran]);
  useEffect(() => {
    load();
  }, [load]);

  const days = Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / DAY) + 1;
  const reset = () => {
    setRange({ from: addDays(yesterday, -6), to: yesterday });
    setSel([]);
    setNet(true);
    setGran("day");
    setPerfGran("day");
    setChGran("day");
    setChans(CH.map((c) => c.key));
  };
  const loc = lang === "en" ? "en-US" : lang;
  const dateLabel = (s: string, g: Gran, year = false) => {
    if (g === "hour") return new Date(s).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
    if (g === "month") return parse(`${s}-15`).toLocaleDateString(loc, { month: "short", year: "numeric" });
    return parse(s).toLocaleDateString(loc, { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  };

  const cols = metrics.filter((m) => m.on).map((m) => METRICS.find((x) => x.key === m.key)!);
  const rows = useMemo(() => {
    const r = [...(data?.creators ?? [])];
    const m = sort && METRICS.find((x) => x.key === sort.key);
    if (sort?.key === "name") r.sort((a, b) => a.name.localeCompare(b.name) * sort.dir);
    else if (m?.sort) r.sort((a, b) => (m.sort!(a) - m.sort!(b)) * sort!.dir);
    return r;
  }, [data, sort]);
  const breakdown = CH.map((c) => ({ ...c, v: data?.summary[c.key].v ?? 0 }));
  const bTotal = breakdown.reduce((a, b) => a + b.v, 0);

  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex items-start justify-between">
        <h1 className="flex items-center gap-2.5 text-[24px] font-semibold">
          {t("Creator reports")}
          <span className="text-[13px] font-normal" style={{ color: "var(--of-muted)" }}>
            UTC+01:00
          </span>
          <Info className="size-4" style={{ color: "var(--of-muted)" }} />
        </h1>
        <button onClick={load} title={t("Refresh")} className="grid size-8 place-items-center rounded-lg" style={{ background: "var(--of-card)" }}>
          <RefreshCw className={cn("size-4", busy && "animate-spin")} />
        </button>
      </div>
      <div className="mt-3 flex gap-1">
        {(["overview", "performance"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className="rounded-lg px-3 py-1.5 text-[15px] font-semibold" style={tab === k ? { background: "var(--of-card)" } : { color: "var(--of-muted)" }}>
            {t(k === "overview" ? "Overview" : "Creator performance")}
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="sticky top-0 z-20 -mx-1 mt-3 flex flex-wrap items-center gap-3 px-1 py-2" style={{ background: "var(--of-page)" }}>
        <DateRange range={range} setRange={setRange} lang={loc} t={t} />
        {tab === "performance" ? <ShownBy value={perfGran} set={setPerfGran} days={days} t={t} /> : null}
        {tab === "overview" ? (
        <>
        <Dropdown icon={Tag} label={t("Creator tag")} width={220}>
          {() => <p className="px-3 py-3 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("No data available")}</p>}
        </Dropdown>
        <Dropdown icon={SquareUser} label={sel.length ? `${t("Creator")} · ${sel.length}` : t("Creator")} width={260}>
          {(q) => (
            <div className="max-h-[420px] overflow-y-auto">
              {(data?.accounts ?? [])
                .filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
                .map((a) => {
                  const on = sel.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => setSel((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[14px] hover:opacity-80">
                      <span className="grid size-4 place-items-center rounded border" style={{ borderColor: on ? ORANGE : "var(--of-muted)", background: on ? ORANGE : "transparent" }}>
                        {on ? <Check className="size-3 text-white" /> : null}
                      </span>
                      <Avatar src={a.avatar} name={a.name} size="size-7" />
                      {a.name}
                    </button>
                  );
                })}
            </div>
          )}
        </Dropdown>
        </>
        ) : null}
        <label className="flex items-center gap-2.5 text-[15px]">
          {t("Show net earnings")}
          <button role="switch" aria-checked={net} onClick={() => setNet(!net)} className="relative h-[26px] w-12 rounded-full transition-colors" style={{ background: net ? ORANGE : "var(--of-line)" }}>
            <span className={cn("absolute top-[3px] size-5 rounded-full bg-white transition-all", net ? "left-[25px]" : "left-[3px]")} />
          </button>
        </label>
        <button onClick={reset} className="text-[14px] font-medium" style={{ color: ORANGE }}>
          {t("Reset")}
        </button>
      </div>

      {tab === "overview" ? (
        <>
          {/* Earnings summary */}
          <h2 className="mt-3 flex items-center gap-2 text-[20px] font-semibold">
            {t("Earnings summary")}
            <span title={t("An overview of total earnings based on your managed creators during this period")}>
              <Info className="size-4" style={{ color: "var(--of-muted)" }} />
            </span>
          </h2>
          <section className="mt-3 grid gap-x-10 gap-y-6 rounded-xl p-7 md:grid-cols-4" style={{ background: "var(--of-card)" }}>
            <Stat icon={Feather} label={t("Total earnings")} s={data?.summary.total} big />
            <div className="grid gap-x-10 gap-y-6 md:col-span-3 md:grid-cols-3">
              {(["subscriptions", "posts", "messages", "tips", "referrals", "streams"] as Channel[]).map((k) => {
                const c = CH.find((x) => x.key === k)!;
                return <Stat key={k} icon={c.icon} label={t(c.label)} s={data?.summary[k]} />;
              })}
            </div>
          </section>

          {/* Earnings trends */}
          <section className="mt-4 rounded-xl p-5" style={{ background: "var(--of-card)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle t={t}>{t("Earnings trends")}</CardTitle>
              <GranSwitch value={gran} set={setGran} days={days} t={t} />
            </div>
            <div className="mt-4 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(data?.trends ?? []).map((x) => ({ ...x, name: dateLabel(x.label, data!.gran) }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} onMouseMove={(e) => setBarHover(typeof e?.activeTooltipIndex === "number" ? e.activeTooltipIndex : null)} onMouseLeave={() => setBarHover(null)}>
                  <CartesianGrid vertical={false} stroke="var(--of-line)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--of-text)", fontSize: 13 }} dy={6} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--of-muted)", fontSize: 12 }} tickFormatter={short} width={52} />
                  <Tooltip
                    cursor={false}
                    content={({ active, payload }) => {
                      const x = payload?.[0]?.payload as Report["trends"][number] | undefined;
                      if (!active || !x) return null;
                      return (
                        <Glass title={dateLabel(x.label, data!.gran, true)}>
                          <Line2 k={t("Earnings")} v={usd(x.total)} />
                          {x.change != null ? <Line2 k={t("Growth")} v={`${x.change > 0 ? "+" : ""}${x.change.toFixed(2)}%`} /> : null}
                        </Glass>
                      );
                    }}
                  />
                  <Bar dataKey="total" fill={BAR} radius={[6, 6, 0, 0]} maxBarSize={96} isAnimationActive={false}>
                    {(data?.trends ?? []).map((_, i) => (
                      <Cell key={i} fill={BAR} fillOpacity={barHover == null || barHover === i ? 1 : 0.45} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
            {/* Earnings by channel */}
            <section className="rounded-xl p-5" style={{ background: "var(--of-card)" }}>
              <CardTitle t={t}>{t("Earnings by channel")}</CardTitle>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Dropdown icon={Filter} label={t("Channels")} width={220} small>
                  {() =>
                    CH.map((c) => {
                      const on = chans.includes(c.key);
                      return (
                        <button key={c.key} onClick={() => setChans((s) => (on ? s.filter((x) => x !== c.key) : [...s, c.key]))} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[14px]">
                          <span className="grid size-4 place-items-center rounded border" style={{ borderColor: on ? ORANGE : "var(--of-muted)", background: on ? ORANGE : "transparent" }}>
                            {on ? <Check className="size-3 text-white" /> : null}
                          </span>
                          <span className="size-2 rounded-full" style={{ background: c.color }} />
                          {t(c.label)}
                        </button>
                      );
                    })
                  }
                </Dropdown>
                <GranSwitch value={chGran} set={setChGran} days={days} t={t} />
              </div>
              <div className="mt-3 h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(chData?.trends ?? []).map((x) => ({ ...x, name: dateLabel(x.label, chData!.gran) }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--of-line)" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--of-text)", fontSize: 13 }} dy={6} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--of-muted)", fontSize: 12 }} tickFormatter={short} width={52} />
                    <Tooltip
                      cursor={{ stroke: "var(--of-muted)" }}
                      content={({ active, payload }) => {
                        const x = payload?.[0]?.payload as Report["trends"][number] | undefined;
                        if (!active || !x) return null;
                        return (
                          <Glass title={dateLabel(x.label, chData!.gran, true)}>
                            {CH.map((c) => (
                              <Line2 key={c.key} dot={c.color} k={t(c.label)} v={usd(x[c.key])} />
                            ))}
                          </Glass>
                        );
                      }}
                    />
                    {CH.filter((c) => chans.includes(c.key)).map((c) => (
                      <Line key={c.key} type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Earnings breakdown */}
            <section className="rounded-xl p-5" style={{ background: "var(--of-card)" }}>
              <h3 className="text-[16px] font-semibold">{t("Earnings breakdown")}</h3>
              <div className="mx-auto mt-2 h-[190px] w-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={breakdown.filter((b) => b.v > 0)} dataKey="v" nameKey="label" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {breakdown
                        .filter((b) => b.v > 0)
                        .map((b) => (
                          <Cell key={b.key} fill={b.color} />
                        ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        const b = payload?.[0]?.payload as (typeof breakdown)[number] | undefined;
                        if (!active || !b || !data) return null;
                        return (
                          <Glass title={`${dateLabel(data.from, "day")} - ${dateLabel(data.to, "day", true)}`}>
                            <Line2 dot={b.color} k={t(b.label)} v={`${bTotal ? ((b.v / bTotal) * 100).toFixed(2) : 0}%   ${usd(b.v)}`} />
                          </Glass>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-col gap-1 text-[14px]">
                {breakdown.map((b) => (
                  <div key={b.key} className="grid grid-cols-[1fr_70px_100px] items-center">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: b.color }} />
                      {t(b.label)}
                    </span>
                    <span className="text-right tabular-nums">{bTotal ? `${+((b.v / bTotal) * 100).toFixed(2)}%` : "0%"}</span>
                    <span className="text-right font-mono">{usd(b.v)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Creator statistics */}
          <div className="mt-7 flex items-center justify-between">
            <h2 className="text-[20px] font-semibold">{t("Creator statistics")}</h2>
            <button onClick={() => setShowExport(true)} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[14px] font-medium" style={{ background: "var(--of-card)" }}>
              <Upload className="size-4" /> {t("Export")}
            </button>
          </div>
          <div className="mt-3 rounded-lg border px-4 py-2.5 text-[13px]" style={{ borderColor: "var(--of-line)", background: "var(--of-page)" }}>
            <p>• {t("Percentage change is calculated based on the change in value in the selected time frame against the same time frame immediately before it.")}</p>
            <p>• {t("Data marked “—” comes from OnlyFans and is not available in Bloom yet.")}</p>
          </div>
        </>
      ) : null}

      {tab === "performance" ? <Performance range={range} net={net} gran={perfGran} accounts={data?.accounts ?? []} t={t} lang={loc} /> : null}

      {tab === "overview" ? (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {(
              [
                ["Creators", data ? String(data.kpi.creators) : "—"],
                ["Message earnings", data ? usd(data.kpi.messages) : "—"],
                ["Total earnings", data ? usd(data.kpi.total) : "—"],
                ["Refunded", data ? usd(data.kpi.refunded) : "—"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl p-4" style={{ background: "var(--of-card)" }}>
                <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                  {t(k)} <Info className="size-3.5" style={{ color: "var(--of-muted)" }} />
                </p>
                <p className="mt-2 text-[30px] font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={() => setShowMetrics(true)} className="flex items-center gap-1.5 text-[14px]">
              <SlidersHorizontal className="size-4" /> {t("Custom metrics")}
            </button>
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl" style={{ background: "var(--of-card)" }}>
            <table className="w-full min-w-[1100px] text-[14px]">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "var(--of-line)" }}>
                  <Th label={t("Creator")} k="name" sort={sort} setSort={setSort} />
                  {cols.map((c) => (
                    <Th key={c.key} label={t(c.label)} k={c.key} tip={c.tip ? t(c.tip) : undefined} sort={sort} setSort={c.sort ? setSort : undefined} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-2.5">
                        <Avatar src={r.avatar} name={r.name} size="size-7" />
                        {r.name}
                      </span>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-4 py-3 whitespace-nowrap">
                        {c.get ? c.get(r) : <span className="font-mono" style={{ color: "var(--of-muted)" }}>- -</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {data && !rows.length ? (
                  <tr>
                    <td colSpan={cols.length + 1} className="px-4 py-10 text-center" style={{ color: "var(--of-muted)" }}>
                      {t("No data available")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {showMetrics ? <MetricsModal t={t} value={metrics} onClose={() => setShowMetrics(false)} onApply={(m) => (setMetrics(m), localStorage.setItem(MKEY, JSON.stringify(m)), setShowMetrics(false))} /> : null}
      {showExport ? <ExportModal t={t} range={range} net={net} qs={(p) => `${qs(gran)}&${p}`} onClose={() => setShowExport(false)} /> : null}
    </div>
  );
}

/** « Shown by day » d'Infloww (onglet Creator performance) : heure ≤ 2 jours, semaine 14 à 365 jours, mois > 62 jours. */
function ShownBy({ value, set, days, t }: { value: Gran; set: (g: Gran) => void; days: number; t: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const ok = (g: Gran) => (g === "hour" ? days <= 2 : g === "week" ? days >= 14 && days <= 365 : g === "month" ? days > 62 : true);
  useEffect(() => {
    if (!ok(value)) set("day");
  });
  const label = (g: Gran) => t(`Shown by ${g}`);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)} className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[14px]" style={{ background: "var(--of-card)" }}>
        {label(value)} <ChevronDown className="size-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-10 z-30 w-44 rounded-md border p-1 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
          {(["hour", "day", "week", "month"] as Gran[]).map((g) => (
            <button key={g} disabled={!ok(g)} onMouseDown={() => (set(g), setOpen(false))} className="block w-full rounded px-2.5 py-1.5 text-left text-[14px] disabled:opacity-40" style={value === g ? { background: "var(--of-line)" } : undefined}>
              {label(g)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ icon: I, label, s, big }: { icon: LucideIcon; label: string; s?: { v: number; change: Change }; big?: boolean }) {
  return (
    <div>
      <p className={cn("flex items-center gap-1.5 font-semibold", big ? "text-[19px]" : "text-[16px]")} style={{ color: "var(--of-muted)" }}>
        <I className="size-4" />
        {label}
      </p>
      <p className={cn("font-semibold tabular-nums", big ? "text-[34px]" : "text-[28px]")}>{s ? usd(s.v) : "—"}</p>
      <p className={cn("font-semibold", big ? "text-[19px]" : "text-[15px]")}>{s ? <ChangeTxt c={s.change ?? 0} /> : null}</p>
    </div>
  );
}

function CardTitle({ children, t }: { children: React.ReactNode; t: (s: string) => string }) {
  return (
    <h3 className="flex items-center gap-2 text-[16px] font-semibold">
      {children}
      <span title={t("Earnings of your managed creators in the selected period")}>
        <Info className="size-3.5" style={{ color: "var(--of-muted)" }} />
      </span>
    </h3>
  );
}

function Glass({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[220px] rounded-xl border px-4 py-3 text-[14px] text-white shadow-2xl backdrop-blur-md" style={{ background: "rgba(40,40,42,.78)", borderColor: "rgba(255,255,255,.14)" }}>
      <p className="border-b pb-2 font-semibold" style={{ borderColor: "rgba(255,255,255,.14)" }}>
        {title}
      </p>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </div>
  );
}
function Line2({ k, v, dot }: { k: string; v: string; dot?: string }) {
  return (
    <p className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-1.5 text-white/75">
        {dot ? <span className="size-1.5 rounded-full" style={{ background: dot }} /> : null}
        {k}
      </span>
      <span className="font-mono whitespace-pre">{v}</span>
    </p>
  );
}

function Th({ label, k, tip, sort, setSort }: { label: string; k: string; tip?: string; sort: { key: string; dir: 1 | -1 } | null; setSort?: (s: { key: string; dir: 1 | -1 }) => void }) {
  return (
    <th className="px-4 py-3 font-semibold whitespace-nowrap">
      <button disabled={!setSort} onClick={() => setSort?.({ key: k, dir: sort?.key === k && sort.dir === -1 ? 1 : -1 })} className="flex items-center gap-1.5">
        {label}
        {tip ? (
          <span title={tip}>
            <Info className="size-3.5" style={{ color: "var(--of-muted)" }} />
          </span>
        ) : null}
        {setSort ? <span style={{ color: sort?.key === k ? ORANGE : "var(--of-muted)" }}>{sort?.key === k ? (sort.dir === -1 ? "↓" : "↑") : "↕"}</span> : null}
      </button>
    </th>
  );
}

function GranSwitch({ value, set, days, t }: { value: Gran; set: (g: Gran) => void; days: number; t: (s: string) => string }) {
  const rules: [Gran, string, boolean, string][] = [
    ["hour", "Hour", days <= 2, "Date range must be 2 days or less for this option"],
    ["day", "Day", true, ""],
    ["week", "Week", days >= 14 && days <= 365, "Date range must be between 14 to 365 days for this option"],
    ["month", "Month", days > 62, "Date range must be more than 62 days for this option"],
  ];
  return (
    <div className="flex items-center gap-1 text-[14px]">
      {rules.map(([g, l, ok, why]) => (
        <button key={g} disabled={!ok} title={ok ? undefined : t(why)} onClick={() => set(g)} className="rounded-md px-2 py-1 disabled:cursor-not-allowed" style={value === g ? { background: "var(--of-side-on)", fontWeight: 600 } : { color: "var(--of-muted)", opacity: ok ? 1 : 0.6 }}>
          {t(l)}
        </button>
      ))}
    </div>
  );
}

function Dropdown({ icon: I, label, width, small, children }: { icon: LucideIcon; label: string; width: number; small?: boolean; children: (q: string) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={cn("flex items-center gap-2 rounded-lg px-3 text-[14px]", small ? "h-8" : "h-9")} style={{ background: "var(--of-card)", color: "var(--of-muted)" }}>
        <I className="size-4" /> {label} <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute top-full left-0 z-30 mt-1 rounded-lg border p-2 shadow-2xl" style={{ width, background: "var(--of-card)", borderColor: "var(--of-line)" }}>
          {small ? null : (
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" style={{ color: "var(--of-muted)" }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-full rounded-md pl-8 text-[14px] outline-none" style={{ background: "var(--of-page)", color: "var(--of-text)" }} />
            </div>
          )}
          {children(q)}
        </div>
      ) : null}
    </div>
  );
}

/** Choix de la période (comme Infloww) : raccourcis à gauche, deux mois de calendrier. */
export function DateRange({ range, setRange, lang, t }: { range: { from: string; to: string }; setRange: (r: { from: string; to: string }) => void; lang: string; t: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [month, setMonth] = useState(() => range.to.slice(0, 7));
  const box = useRef<HTMLDivElement>(null);
  const today = iso(new Date());
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);
  const fmt = (s: string) => parse(s).toLocaleDateString(lang, { month: "short", day: "numeric", year: "numeric" });
  const y = today.slice(0, 4);
  const presets: [string, { from: string; to: string }][] = [
    ["Last 7 days", { from: addDays(today, -7), to: addDays(today, -1) }],
    ["Last 30 days", { from: addDays(today, -30), to: addDays(today, -1) }],
    ["Last 90 days", { from: addDays(today, -90), to: addDays(today, -1) }],
    ["Last 365 days", { from: addDays(today, -365), to: addDays(today, -1) }],
    [y, { from: `${y}-01-01`, to: today }],
    ...Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Number(y), Number(today.slice(5, 7)) - 1 - i, 1);
      const f = iso(d);
      const last = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return [d.toLocaleDateString(lang, { month: "long" }), { from: f, to: last < today ? last : today }] as [string, { from: string; to: string }];
    }),
  ];
  const shift = (m: string, n: number) => {
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const clickDay = (d: string) => {
    if (!pick) return setPick(d);
    const [a, b] = pick <= d ? [pick, d] : [d, pick];
    setRange({ from: a, to: b });
    setPick(null);
    setOpen(false);
  };
  const cal = (m: string) => {
    const first = parse(`${m}-01`);
    const start = addDays(`${m}-01`, -first.getDay());
    const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    return (
      <div className="w-[238px]">
        <div className="grid grid-cols-7 text-center text-[12px] font-semibold">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
          {cells.map((d) => {
            const inMonth = d.slice(0, 7) === m;
            const edge = d === range.from || d === range.to || d === pick;
            const inside = d > range.from && d < range.to;
            const future = d > today;
            return (
              <button
                key={d}
                disabled={future}
                onClick={() => clickDay(d)}
                className={cn("m-0.5 h-7 rounded text-[13px]", d === today && !edge && "border")}
                style={{
                  background: edge ? ORANGE : inside ? "rgba(242,140,91,.28)" : undefined,
                  color: edge ? "#fff" : !inMonth || future ? "var(--of-muted)" : "var(--of-text)",
                  borderColor: ORANGE,
                  opacity: !inMonth ? 0.45 : 1,
                }}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 items-center gap-3 rounded-lg px-3 text-[14px]" style={{ background: "var(--of-card)" }}>
        <CalendarDays className="size-4" />
        {fmt(range.from)} <span style={{ color: "var(--of-muted)" }}>→</span> {fmt(range.to)}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute top-full left-0 z-30 mt-1 flex rounded-lg border shadow-2xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
          <div className="max-h-[300px] w-40 overflow-y-auto border-r py-2" style={{ borderColor: "var(--of-line)" }}>
            <p className="px-4 py-1.5 text-[14px]" style={{ color: "var(--of-muted)" }}>
              {t("Custom")}
            </p>
            {presets.map(([l, r]) => (
              <button key={l} onClick={() => (setRange(r), setOpen(false))} className="block w-full px-4 py-1.5 text-left text-[14px] capitalize hover:opacity-75">
                {t(l)}
              </button>
            ))}
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between px-1 pb-2 text-[13px] font-semibold">
              <span className="flex gap-1">
                <button onClick={() => setMonth(shift(month, -12))}>
                  <ChevronsLeft className="size-4" />
                </button>
                <button onClick={() => setMonth(shift(month, -1))}>
                  <ChevronLeft className="size-4" />
                </button>
              </span>
              <span className="flex w-full justify-around">
                <span>{parse(`${shift(month, -1)}-15`).toLocaleDateString(lang, { month: "short", year: "numeric" })}</span>
                <span>{parse(`${month}-15`).toLocaleDateString(lang, { month: "short", year: "numeric" })}</span>
              </span>
              <span className="flex gap-1">
                <button onClick={() => setMonth(shift(month, 1))}>
                  <ChevronRight className="size-4" />
                </button>
                <button onClick={() => setMonth(shift(month, 12))}>
                  <ChevronsRight className="size-4" />
                </button>
              </span>
            </div>
            <div className="flex gap-4">
              {cal(shift(month, -1))}
              {cal(month)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** « Creator report metrics » : colonnes du tableau, à cocher et à réordonner (glisser). */
function MetricsModal({ t, value, onClose, onApply }: { t: (s: string) => string; value: { key: string; on: boolean }[]; onClose: () => void; onApply: (m: { key: string; on: boolean }[]) => void }) {
  const [list, setList] = useState(value);
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <Modal title={t("Creator report metrics")} onClose={onClose} footer={<ModalButtons t={t} onCancel={onClose} onOk={() => onApply(list)} ok={t("Apply")} />}>
      <div className="flex flex-col">
        {list.map((m, i) => {
          const def = METRICS.find((x) => x.key === m.key)!;
          return (
            <div
              key={m.key}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (drag == null || drag === i) return;
                setList((l) => {
                  const n = [...l];
                  const [x] = n.splice(drag, 1);
                  n.splice(i, 0, x);
                  return n;
                });
                setDrag(i);
              }}
              onDragEnd={() => setDrag(null)}
              className="flex items-center gap-3 rounded-md px-1 py-1.5 text-[14px]"
              style={drag === i ? { background: "var(--of-side-on)" } : undefined}
            >
              <GripVertical className="size-4 cursor-grab" style={{ color: "var(--of-muted)" }} />
              <span className="flex-1">
                {t(def.label)}
                {def.get ? null : <span style={{ color: "var(--of-muted)" }}> · OnlyFans</span>}
              </span>
              <button role="switch" aria-checked={m.on} onClick={() => setList((l) => l.map((x) => (x.key === m.key ? { ...x, on: !x.on } : x)))} className="relative h-5 w-9 rounded-full" style={{ background: m.on ? ORANGE : "var(--of-line)" }}>
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", m.on ? "left-[18px]" : "left-0.5")} />
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function ExportModal({ t, range, net, qs, onClose }: { t: (s: string) => string; range: { from: string; to: string }; net: boolean; qs: (p: string) => string; onClose: () => void }) {
  const [calc, setCalc] = useState<"gross" | "net">(net ? "net" : "gross");
  const [fmt, setFmt] = useState<"total" | "day" | "both">("total");
  const [type, setType] = useState<"all" | "selected">("all");
  const radio = (on: boolean) => (
    <span className="grid size-4 place-items-center rounded-full border" style={{ borderColor: on ? ORANGE : "var(--of-muted)" }}>
      {on ? <span className="size-2 rounded-full" style={{ background: ORANGE }} /> : null}
    </span>
  );
  return (
    <Modal
      title={t("Export creator statistics report")}
      onClose={onClose}
      footer={
        <ModalButtons
          t={t}
          onCancel={onClose}
          ok={t("Export")}
          onOk={() => {
            window.location.href = `/api/of-reports/creators.csv?${qs(`format=${fmt}`).replace(/net=[01]/, `net=${calc === "net" ? 1 : 0}`)}${type === "all" ? "" : ""}`;
            onClose();
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 text-[14px]">
        <div>
          <p className="font-semibold">{t("Report period")}</p>
          <p className="mt-1">
            {range.from} 00:00:00 - {addDays(range.to, 1)} 00:00:00 <span style={{ color: "var(--of-muted)" }}>(UTC+01:00)</span>
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{t("Data type")}</p>
          <button onClick={() => setType("all")} className="flex items-center gap-2">
            {radio(type === "all")} {t("All data")}
          </button>
          <button onClick={() => setType("selected")} className="flex items-start gap-2 text-left">
            <span className="mt-0.5">{radio(type === "selected")}</span>
            <span>
              {t("Selected fields")}
              <span className="block text-[13px]" style={{ color: "var(--of-muted)" }}>
                {t("Based on selection in filters and custom metrics as shown on page")}
              </span>
            </span>
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{t("Earnings calculation")}</p>
          <button onClick={() => setCalc("gross")} className="flex items-center gap-2">
            {radio(calc === "gross")} {t("Gross earnings")}
          </button>
          <button onClick={() => setCalc("net")} className="flex items-center gap-2">
            {radio(calc === "net")} {t("Net earnings")}
          </button>
        </div>
        <div>
          <p className="font-semibold">{t("Format")}</p>
          <select value={fmt} onChange={(e) => setFmt(e.target.value as typeof fmt)} className="mt-2 h-10 w-full rounded-lg border px-3" style={{ background: "var(--of-page)", borderColor: "var(--of-line)", color: "var(--of-text)" }}>
            <option value="total">{t("Display total numbers")}</option>
            <option value="day">{t("Display by day")}</option>
            <option value="both">{t("Display total numbers and by day")}</option>
          </select>
        </div>
        <p className="text-[13px]" style={{ color: "var(--of-muted)" }}>
          <Download className="mr-1 inline size-3.5" />
          {t("The report is downloaded right away as a CSV file (Excel, Google Sheets).")}
        </p>
      </div>
    </Modal>
  );
}

function Modal({ title, children, footer, onClose }: { title: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[88vh] w-full max-w-[600px] flex-col overflow-hidden rounded-xl border shadow-2xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)", color: "var(--of-text)" }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--of-line)" }}>
          <h2 className="text-[22px] font-semibold">{title}</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--of-side-on)" }}>
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--of-line)" }}>
          {footer}
        </div>
      </div>
    </div>
  );
}
function ModalButtons({ t, onCancel, onOk, ok }: { t: (s: string) => string; onCancel: () => void; onOk: () => void; ok: string }) {
  return (
    <>
      <button onClick={onCancel} className="h-10 rounded-lg px-4 text-[15px] font-semibold" style={{ background: "var(--of-side-on)" }}>
        {t("Cancel")}
      </button>
      <button onClick={onOk} className="h-10 rounded-lg px-4 text-[15px] font-semibold text-white" style={{ background: ORANGE }}>
        {ok}
      </button>
    </>
  );
}
