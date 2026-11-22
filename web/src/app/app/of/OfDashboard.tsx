"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgePlus, ChevronDown, FileText, Info, Lightbulb, MessageCircleMore, Rows3, UserRoundPlus, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/fmt";

type Period = "yesterday" | "today" | "week" | "month";
type Mode = "net" | "gross";
type Data = {
  period: Period;
  mode: Mode;
  from: string;
  to: string;
  total: number;
  provisional: number;
  sales: number;
  blocks: { subscriptions: number; posts: number; messages: number; tips: number; referrals: number; streams: number };
  employeeSales: { label: string; v: number; future: boolean }[];
  hourly: boolean;
  unmapped: string[];
};

// Couleurs du dashboard d'Infloww.
const C = {
  page: "#0b0b0c",
  card: "#1c1c1e",
  line: "#2a2a2d",
  text: "#f4f4f5",
  muted: "#8e8e93",
  blue: "#2f6bff",
  blueSoft: "rgba(47,107,255,.16)",
};
const PERIODS: [Period, string][] = [
  ["yesterday", "Yesterday"],
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
];
const BLOCKS: { key: keyof Data["blocks"]; label: string; icon: LucideIcon; color: string }[] = [
  { key: "subscriptions", label: "Subscriptions", icon: BadgePlus, color: "#34d399" },
  { key: "posts", label: "Posts", icon: FileText, color: "#2dd4bf" },
  { key: "messages", label: "Messages", icon: MessageCircleMore, color: "#c084fc" },
  { key: "tips", label: "Tips", icon: Lightbulb, color: "#60a5fa" },
  { key: "referrals", label: "Referrals", icon: UserRoundPlus, color: "#f87171" },
  { key: "streams", label: "Streams", icon: Rows3, color: "#3b82f6" },
];
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Dashboard OnlyFans : copie du dashboard d'Infloww (gains de l'agence sur OnlyFans, ventes de l'équipe). */
export function OfDashboard() {
  const [period, setPeriod] = useState<Period>("week");
  const [mode, setMode] = useState<Mode>("net");
  const [data, setData] = useState<Data | null>(null);
  const [modeOpen, setModeOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      api<Data>("GET", `/api/of-dashboard?period=${period}&mode=${mode}`)
        .then((d) => live && setData(d))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [period, mode]);

  // Comme Infloww : les jours (ou heures) à venir sont à 0 sur la courbe.
  const chart = (data?.employeeSales ?? []).map((p) => ({ ...p, name: data?.hourly ? p.label : short(p.label) }));
  const max = Math.max(1, ...chart.map((p) => p.v));
  const step = max > 4000 ? Math.ceil(max / 4 / 1000) * 1000 : max > 400 ? 1000 : max > 40 ? 100 : 10;
  const top = Math.max(step, Math.ceil(max / step) * step);

  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: C.page, color: C.text }}>
      {/* Creator earnings overview */}
      <section className="rounded-2xl p-6" style={{ background: C.card }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-[15px] font-semibold">
            Creator earnings overview <Info className="size-3.5" style={{ color: C.muted }} />
          </h1>
          <span className="flex items-center gap-1.5 text-[13px]" style={{ color: C.muted }}>
            UTC+01:00 <Info className="size-3.5" />
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="relative">
              <button onClick={() => setModeOpen((o) => !o)} className="flex h-9 w-36 items-center justify-between rounded-lg border px-3 text-[13px]" style={{ borderColor: C.line, background: C.page }}>
                {mode === "net" ? "Net earnings" : "Gross earnings"}
                <ChevronDown className="size-4" style={{ color: C.muted }} />
              </button>
              {modeOpen ? (
                <div className="absolute top-full right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border py-1" style={{ borderColor: C.line, background: C.card }}>
                  {(["net", "gross"] as Mode[]).map((m) => (
                    <button key={m} onClick={() => (setMode(m), setModeOpen(false))} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/5" style={{ color: m === mode ? C.blue : C.text }}>
                      {m === "net" ? "Net earnings" : "Gross earnings"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex h-9 items-center rounded-lg border p-0.5" style={{ borderColor: C.line, background: C.page }}>
              {PERIODS.map(([k, l]) => (
                <button key={k} onClick={() => setPeriod(k)} className="h-full rounded-md px-4 text-[12px] font-medium" style={period === k ? { background: C.blueSoft, color: C.blue } : { color: C.text }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-y-6 md:grid-cols-[1.35fr_1fr_1fr_1fr]">
          <div className="flex flex-col justify-center">
            <span className="grid size-11 place-items-center rounded-full" style={{ background: C.blue }}>
              {/* Logo OnlyFans en blanc sur le rond bleu, comme Infloww */}
              <svg viewBox="0 0 32 32" className="size-7" aria-label="OnlyFans">
                <circle cx="13" cy="17" r="6.6" fill="none" stroke="#fff" strokeWidth="3.6" />
                <path d="M17.2 9.4h8.6c-1 3.4-3.4 5.9-6.6 6.6 1.4-2.2 1.3-4.8-2-6.6Z" fill="#fff" />
                <path d="M19.3 16.2c2.6-.4 4.4-1.7 5.4-3.4-.4 4.9-3.6 8.7-8.3 9.6 1.7-1.6 2.7-3.7 2.9-6.2Z" fill="#fff" opacity=".85" />
              </svg>
            </span>
            <p className="mt-4 text-[11px] font-semibold" style={{ color: C.blue }}>
              Total earnings
            </p>
            <p className="font-semibold tracking-tight tabular-nums" style={{ color: C.blue }}>
              <span className="text-2xl">$</span>
              <span className="text-[34px]">{data ? data.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</span>
            </p>
            {data?.provisional ? (
              <p className="text-[11px]" style={{ color: C.muted }}>
                dont {usd(data.provisional)} provisoire (ventes Substy pas encore confirmées)
              </p>
            ) : null}
          </div>
          {[0, 1, 2].map((col) => (
            <div key={col} className="flex flex-col justify-between gap-8 px-0 md:border-l md:px-9" style={{ borderColor: C.line }}>
              {[BLOCKS[col], BLOCKS[col + 3]].map((b) => (
                <div key={b.key} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[19px] font-semibold tabular-nums">{data ? usd(data.blocks[b.key]) : "—"}</p>
                    <p className="text-[12px]" style={{ color: C.muted }}>
                      {b.label}
                    </p>
                  </div>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: `${b.color}22`, color: b.color }}>
                    <b.icon className="size-5" />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {data?.unmapped.length ? (
          <p className="mt-5 text-[12px]" style={{ color: C.muted }}>
            Pas encore reliées à Infloww (non comptées) : {data.unmapped.join(", ")}.
          </p>
        ) : null}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* My shifts */}
        <section className="flex min-h-[420px] flex-col rounded-2xl p-6 lg:row-span-2" style={{ background: C.card }}>
          <Title>My shifts</Title>
          <NoData />
        </section>

        {/* Employee sales */}
        <section className="rounded-2xl p-6" style={{ background: C.card }}>
          <Title>Employee sales</Title>
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="of-emp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3a3a3c" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#3a3a3c" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={C.line} strokeDasharray="4 4" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: C.muted, fontSize: 12 }} dy={8} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: C.muted, fontSize: 11 }} width={48} domain={[0, top]} ticks={Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)} tickFormatter={(v: number) => v.toLocaleString("en-US")} />
                <Tooltip
                  cursor={{ stroke: C.line }}
                  contentStyle={{ background: C.page, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: C.muted }}
                  formatter={(v) => [usd(Number(v)), "Employee sales"]}
                />
                <Area type="monotone" dataKey="v" stroke={C.blue} strokeWidth={3} fill="url(#of-emp)" dot={{ r: 4, fill: "#fff", stroke: C.blue, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Scheduled hours */}
        <section className="flex min-h-[240px] flex-col rounded-2xl p-6" style={{ background: C.card }}>
          <Title>Scheduled hours</Title>
          <NoData />
        </section>
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-semibold">
      {children} <Info className="size-3.5" style={{ color: C.muted }} />
    </h2>
  );
}

function NoData() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
      <svg viewBox="0 0 64 72" className={cn("h-16 w-14")} aria-hidden>
        <path d="M8 6h34l14 14v44a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4Z" fill="#3a3a3c" stroke="#8e8e93" strokeWidth="2.5" />
        <path d="M42 6v14h14" fill="none" stroke="#8e8e93" strokeWidth="2.5" />
        <path d="M14 20h18M14 27h22" stroke="#8e8e93" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M18 42h8M38 42h8M25 52h14" stroke="#2f6bff" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-[13px]" style={{ color: C.muted }}>
        No data
      </p>
    </div>
  );
}
