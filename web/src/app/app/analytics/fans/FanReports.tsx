"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, Info, RefreshCw, Search, Upload, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui";
import { DateRange } from "../creators/CreatorReports";
import { BarCursor, Tip, niceTicks } from "../creators/Performance";

// Analytics → Fan reports (OnlyFans) : copie de la page d'Infloww. Une créatrice à la fois (liste à gauche) :
// nouveaux fans, fans actifs, gains par source de trafic, meilleurs fans (+ export CSV).
type Gran = "day" | "week" | "month";
type Sort = "total" | "tips" | "ppv" | "length";
type Account = { id: string; name: string; avatar: string | null; creatorId?: string | null };
type Data = {
  from: string; to: string; days: number; gran: Gran; net: boolean; accounts: Account[]; account: string | null;
  newFans: { label: string; all: number; renews: number; news: number }[];
  totalFans: { label: string; v: number | null; change: number | null }[];
  traffic: { source: string; v: number }[];
  topFans: { name: string; total: number; tips: number; ppv: number; lengthDays: number | null }[];
};

const BLUE = "#2f6bff";
const GREEN = "#2ec4a6";
const RED = "#f26b7a";
const DAY = 864e5;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY));
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SORTS: [Sort, string][] = [
  ["total", "Rank by total spend"],
  ["tips", "Rank by tips"],
  ["ppv", "Rank by PPV sales"],
  ["length", "Rank by subscription length"],
];

export function FanReports() {
  const { t, lang } = useT();
  const loc = lang === "en" ? "en-US" : lang;
  const yesterday = addDays(iso(new Date()), -1);
  const [range, setRange] = useState({ from: addDays(yesterday, -6), to: yesterday });
  const [gran, setGran] = useState<Gran>("day");
  const [net, setNet] = useState(true);
  const [acc, setAcc] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("total");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [dl, setDl] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    setBusy(true);
    const p = new URLSearchParams({ from: range.from, to: range.to, gran, net: net ? "1" : "0", sort, ...(acc ? { account: acc } : {}) });
    api<Data>("GET", `/api/of-reports/fans?${p}`)
      .then((d) => (setData(d), !acc && d.account && setAcc(d.account)))
      .catch((e) => toast((e as Error).message, "err"))
      .finally(() => setBusy(false));
  }, [range, gran, net, acc, sort, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const load = () =>
      api<{ counts: Record<string, number> }>("GET", "/api/rv/inbox?tab=reply")
        .then((r) => setUnread(r.counts || {}))
        .catch(() => {});
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(id);
  }, []);

  const days = Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / DAY) + 1;
  const dateLabel = (s: string) => (gran === "month" ? parse(`${s}-15`).toLocaleDateString(loc, { month: "short", year: "numeric" }) : parse(s).toLocaleDateString(loc, { month: "short", day: "numeric" }));
  const list = useMemo(() => [...(data?.accounts ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const lengthTxt = (d: number | null) => (d == null ? "-" : d < 30 ? `${d} ${t(d === 1 ? "day" : "days")}` : `${Math.floor(d / 30)} ${t(Math.floor(d / 30) === 1 ? "month" : "months")}`);
  const axis = { tickLine: false, axisLine: false, tick: { fill: "var(--of-muted)", fontSize: 12 } } as const;
  const legend = <Legend iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: "var(--of-text)", fontSize: 12 }}>{t(String(v))}</span>} />;

  return (
    <div className="flex min-h-full gap-3 p-3" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      {/* Créatrices */}
      <div className="flex w-[184px] shrink-0 flex-col gap-2">
        <h1 className="flex h-9 items-center gap-2.5 px-1 text-[16px] font-semibold">
          {t("Fan reports")}
          <span className="text-[13px] font-normal" style={{ color: "var(--of-muted)" }}>UTC+01:00</span>
        </h1>
        <div className="flex gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-md border px-2.5" style={{ borderColor: "var(--of-line)", background: "var(--of-field)" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
            <Search className="size-4 shrink-0" style={{ color: "var(--of-muted)" }} />
          </label>
          <button onClick={() => setNonce((n) => n + 1)} title={t("Refresh")} className="grid size-10 place-items-center rounded-md border" style={{ borderColor: "var(--of-line)", background: "var(--of-field)" }}>
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          </button>
        </div>
        <div className="flex h-8 items-center justify-between rounded-md px-3 text-[14px]" style={{ background: "var(--of-pick-bar)", color: BLUE }}>
          {t("All creators")} <ChevronDown className="size-3.5" style={{ color: "var(--of-muted)" }} />
        </div>
        <div className="of-scroll sticky top-3 flex max-h-[calc(100vh-140px)] flex-col overflow-y-auto rounded-md" style={{ background: "var(--of-pick-list)" }}>
          {list
            .filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
            .map((a) => (
              <button key={a.id} onClick={() => setAcc(a.id)} className="flex items-center gap-2.5 px-3 py-3.5 text-left text-[14px] font-medium" style={acc === a.id ? { background: "var(--of-pick)" } : undefined}>
                <span className="relative shrink-0">
                  <Avatar src={a.avatar} name={a.name} size="size-9" rounded="rounded-md" />
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 bg-emerald-500" style={{ borderColor: "var(--of-pick-list)" }} />
                </span>
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {a.creatorId && unread[a.creatorId] ? (
                  <span className="rounded-full px-1.5 text-[10px] leading-4 font-bold text-white tabular-nums" style={{ background: "#f26b6b" }}>
                    {unread[a.creatorId] > 99 ? "99+" : unread[a.creatorId]}
                  </span>
                ) : null}
              </button>
            ))}
        </div>
      </div>

      {/* Rapport */}
      <div className="min-w-0 flex-1 rounded-xl" style={{ background: "var(--of-card)" }}>
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-end gap-2 rounded-t-xl border-b px-5 py-3" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
          <DateRange range={range} setRange={setRange} lang={loc} t={t} />
          <MiniSelect value={gran} set={(g) => setGran(g as Gran)} options={(["day", "week", "month"] as Gran[]).map((g) => [g, t(`Shown by ${g}`), g === "week" ? days >= 14 && days <= 365 : g === "month" ? days > 62 : true])} />
          <span title={t("Earnings are shown after the OnlyFans fee when net is chosen")}>
            <Info className="size-4" style={{ color: "var(--of-muted)" }} />
          </span>
          <MiniSelect value={net ? "net" : "gross"} set={(v) => setNet(v === "net")} options={[["net", t("Net earnings"), true], ["gross", t("Gross earnings"), true]]} small />
        </div>

        <div className="p-5">
          <Title tip={t("New subscribers and renewals per period")}>
            {t("New fans (growth & trends)")} <span className="text-[14px] font-medium" style={{ color: GREEN }}>UTC+00:00</span>
          </Title>
          <div className="mt-3 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.newFans ?? []} margin={{ left: 0, right: 20, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--of-line)" />
                <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} padding={{ left: 40, right: 40 }} />
                <YAxis {...axis} ticks={niceTicks(Math.max(0, ...(data?.newFans ?? []).map((x) => x.all)))} domain={[0, "dataMax"]} width={40} />
                <Tooltip
                  cursor={{ stroke: "var(--of-text)", strokeDasharray: "4 3" }}
                  content={({ active, payload }) => {
                    const x = active && payload?.[0]?.payload;
                    if (!x) return null;
                    return (
                      <Tip>
                        <p>{dateLabel(x.label)}</p>
                        <p>{t("All")}: {x.all}</p>
                        <p>{t("Renews")}: {x.renews}</p>
                        <p>{t("New subscribers")}: {x.news}</p>
                      </Tip>
                    );
                  }}
                />
                {legend}
                <Line dataKey="all" name="All" stroke={BLUE} strokeWidth={2} dot={{ r: 2.5, fill: BLUE }} isAnimationActive={false} />
                <Line dataKey="renews" name="Renews" stroke={GREEN} strokeWidth={2} dot={{ r: 2.5, fill: GREEN }} isAnimationActive={false} />
                <Line dataKey="news" name="New subscribers" stroke={RED} strokeWidth={2} dot={{ r: 2.5, fill: RED }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Title tip={t("Active fans at the end of each period")} className="mt-10">{t("Total fans (growth & trends)")}</Title>
          <div className="mt-3 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.totalFans ?? []} margin={{ left: 0, right: 20, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--of-line)" />
                <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} padding={{ left: 60, right: 60 }} />
                <YAxis {...axis} ticks={niceTicks(Math.max(0, ...(data?.totalFans ?? []).map((x) => x.v ?? 0)) * 1.15)} domain={[0, "dataMax"]} tickFormatter={(v) => v.toLocaleString("en-US")} width={56} />
                <Tooltip
                  cursor={{ stroke: "var(--of-text)", strokeDasharray: "4 3" }}
                  content={({ active, payload }) => {
                    const x = active && payload?.[0]?.payload;
                    if (!x) return null;
                    return (
                      <Tip>
                        <p>{dateLabel(x.label)}</p>
                        <p>
                          {t("Active fans")}: {x.v ?? "-"}{" "}
                          {x.change != null ? <span style={{ color: x.change >= 0 ? GREEN : RED }}>{x.change.toFixed(2)}%</span> : null}
                        </p>
                      </Tip>
                    );
                  }}
                />
                {legend}
                <Line dataKey="v" name="Active fans" stroke={BLUE} strokeWidth={2} dot={{ r: 2.5, fill: BLUE }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Title tip={t("Earnings by the source the fans came from")} className="mt-10">{t("Traffic earnings")}</Title>
          <div className="mt-3 h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.traffic ?? []} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--of-line)" />
                <XAxis dataKey="source" tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} />
                <YAxis {...axis} ticks={niceTicks(Math.max(0, ...(data?.traffic ?? []).map((x) => x.v)))} domain={[0, "dataMax"]} tickFormatter={(v) => v.toLocaleString("en-US")} width={56} />
                <Tooltip
                  cursor={<BarCursor />}
                  content={({ active, payload }) => {
                    const x = active && payload?.[0]?.payload;
                    if (!x) return null;
                    return (
                      <Tip>
                        <p>{x.source}</p>
                        <p>{t("Total earnings")}: {usd(x.v)}</p>
                      </Tip>
                    );
                  }}
                />
                <Bar dataKey="v" fill={BLUE} maxBarSize={40} minPointSize={1} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <Title tip={t("Fans who spent the most in the period")}>{t("Top fans")}</Title>
            <div className="flex items-center gap-2">
              <button onClick={() => setDl(true)} className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px]" style={{ borderColor: "var(--of-line)" }}>
                <Upload className="size-3.5" /> {t("Download report")}
              </button>
              <MiniSelect value={sort} set={(v) => setSort(v as Sort)} options={SORTS.map(([k, l]) => [k, t(l), true])} small />
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left" style={{ background: "var(--of-line)" }}>
                  {["Fan name", "Total spend", "Tips", "PPV sales", "Subscription length"].map((h) => (
                    <th key={h} className="px-4 py-4 font-medium">{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.topFans ?? []).map((f, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                    <td className="px-4 py-4">{f.name}</td>
                    <td className="border-l px-4 py-4 tabular-nums" style={{ borderColor: "var(--of-line)" }}>{usd(f.total)}</td>
                    <td className="border-l px-4 py-4 tabular-nums" style={{ borderColor: "var(--of-line)" }}>{usd(f.tips)}</td>
                    <td className="border-l px-4 py-4 tabular-nums" style={{ borderColor: "var(--of-line)" }}>{usd(f.ppv)}</td>
                    <td className="border-l px-4 py-4" style={{ borderColor: "var(--of-line)" }}>{lengthTxt(f.lengthDays)}</td>
                  </tr>
                ))}
                {data && !data.topFans.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center" style={{ color: "var(--of-muted)" }}>
                      {t("No data available")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {dl && acc ? <DownloadModal t={t} loc={loc} account={acc} initial={{ range, net, sort }} onClose={() => setDl(false)} /> : null}
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

function MiniSelect({ value, set, options, small }: { value: string; set: (v: string) => void; options: [string, string, boolean][]; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o[0] === value);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)} className={cn("flex items-center gap-1.5 rounded-md border px-2.5", small ? "h-8 min-w-[130px] justify-between text-[12px]" : "h-9 text-[14px]")} style={{ borderColor: "var(--of-line)" }}>
        <span className="truncate">{cur?.[1]}</span> <ChevronDown className="size-3.5 shrink-0" />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-30 min-w-full rounded-md border p-1 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
          {options.map(([k, l, ok]) => (
            <button key={k} disabled={!ok} onMouseDown={() => (set(k), setOpen(false))} className="block w-full rounded px-2.5 py-1.5 text-left text-[13px] whitespace-nowrap disabled:opacity-40" style={value === k ? { color: "#2f6bff" } : undefined}>
              {l}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** « Download report » d'Infloww : période, brut / net, tri → le CSV se télécharge tout de suite. */
function DownloadModal({ t, loc, account, initial, onClose }: { t: (s: string) => string; loc: string; account: string; initial: { range: { from: string; to: string }; net: boolean; sort: Sort }; onClose: () => void }) {
  const [range, setRange] = useState(initial.range);
  const [net, setNet] = useState(initial.net);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const submit = () => {
    const p = new URLSearchParams({ account, from: range.from, to: range.to, net: net ? "1" : "0", sort });
    const a = document.createElement("a");
    a.href = `/api/of-reports/fans.csv?${p}`;
    a.click();
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[680px] rounded-xl" style={{ background: "var(--of-card)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--of-line)" }}>
          <h3 className="text-[16px] font-semibold">{t("Download report")}</h3>
          <button onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-5 px-5 py-5 text-[14px]">
          <div>
            <p className="mb-2">{t("Date range")}</p>
            <div className="flex items-center gap-3">
              <DateRange range={range} setRange={setRange} lang={loc} t={t} />
              <span style={{ color: "var(--of-muted)" }}>UTC+01:00</span>
            </div>
          </div>
          <div>
            <p className="mb-2">{t("Earnings calculation")}</p>
            <div className="flex gap-6">
              {([
                [false, "Gross earnings"],
                [true, "Net earnings"],
              ] as const).map(([v, l]) => (
                <label key={l} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={net === v} onChange={() => setNet(v)} /> {t(l)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2">{t("Sort by")}</p>
            <MiniSelect value={sort} set={(v) => setSort(v as Sort)} options={SORTS.map(([k, l]) => [k, t(l), true])} />
          </div>
          <p style={{ color: "var(--of-muted)" }}>{t("The report is downloaded right away as a CSV file (Excel, Google Sheets).")}</p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--of-line)" }}>
          <button onClick={onClose} className="rounded-md border px-4 py-1.5" style={{ borderColor: "var(--of-line)" }}>
            {t("Cancel")}
          </button>
          <button onClick={submit} className="rounded-md px-4 py-1.5 text-white" style={{ background: "#2f6bff" }}>
            {t("Submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
