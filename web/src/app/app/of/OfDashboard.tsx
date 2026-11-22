"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgePlus, ChevronDown, FileText, Info, Lightbulb, MessageCircleMore, Rows3, UserRoundPlus, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { readUserPrefs } from "../settings/Settings";
import { useT } from "@/lib/i18n";

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
  employeeSales: { label: string; v: number; msgs: number; tips: number; future: boolean }[];
  hourly: boolean;
  unmapped: string[];
};

// Couleurs du dashboard d'Infloww (sombre ou clair : variables --of-* de globals.css).
const C = {
  page: "var(--of-page)",
  card: "var(--of-card)",
  line: "var(--of-line)",
  text: "var(--of-text)",
  muted: "var(--of-muted)",
  blue: "var(--of-blue)",
  blueSoft: "var(--of-blue-soft)",
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
const short = (d: string, lang: string) => new Date(`${d}T12:00:00`).toLocaleDateString(lang === "en" ? "en-US" : lang, { month: "short", day: "numeric" });

/** Dashboard OnlyFans : copie du dashboard d'Infloww (gains de l'agence sur OnlyFans, ventes de l'équipe). */
export function OfDashboard() {
  const [period, setPeriod] = useState<Period>("week");
  const [mode, setMode] = useState<Mode>("net");
  const [data, setData] = useState<Data | null>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const { t, lang } = useT();

  useEffect(() => {
    let live = true;
    const load = () =>
      api<Data>("GET", `/api/of-dashboard?period=${period}&mode=${mode}&weekStart=${readUserPrefs().weekStart}`)
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
  const chart = (data?.employeeSales ?? []).map((p) => ({ ...p, name: data?.hourly ? p.label : short(p.label, lang) }));
  const max = Math.max(1, ...chart.map((p) => p.v));
  // Graduations « rondes » comme Infloww (environ 5 intervalles de 1, 2 ou 5 × 10ⁿ : 0 → 10 000 par 2 000…).
  const step = (() => {
    const raw = max / 5;
    const pow = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((k) => k * pow).find((x) => x >= raw) ?? 10 * pow;
  })();
  const top = Math.max(step, Math.ceil(max / step) * step);
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: C.page, color: C.text }}>
      {/* Creator earnings overview */}
      <section className="rounded-2xl p-6" style={{ background: C.card }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-[15px] font-semibold">
            {t("Creator earnings overview")} <Info className="size-3.5" style={{ color: C.muted }} />
          </h1>
          <span className="flex items-center gap-1.5 text-[13px]" style={{ color: C.muted }}>
            UTC+01:00 <Info className="size-3.5" />
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="relative">
              <button onClick={() => setModeOpen((o) => !o)} className="flex h-9 w-36 items-center justify-between rounded-lg border px-3 text-[13px]" style={{ borderColor: C.line, background: C.page }}>
                {t(mode === "net" ? "Net earnings" : "Gross earnings")}
                <ChevronDown className="size-4" style={{ color: C.muted }} />
              </button>
              {modeOpen ? (
                <div className="absolute top-full right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border py-1" style={{ borderColor: C.line, background: C.card }}>
                  {(["gross", "net"] as Mode[]).map((m) => (
                    <button key={m} onClick={() => (setMode(m), setModeOpen(false))} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/5" style={{ color: m === mode ? C.blue : C.text }}>
                      {t(m === "net" ? "Net earnings" : "Gross earnings")}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex h-9 items-center rounded-lg border p-0.5" style={{ borderColor: C.line, background: C.page }}>
              {PERIODS.map(([k, l]) => (
                <button key={k} onClick={() => setPeriod(k)} className="h-full rounded-md px-4 text-[12px] font-medium" style={period === k ? { background: C.blueSoft, color: C.blue } : { color: C.text }}>
                  {t(l)}
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
              {t("Total earnings")}
            </p>
            <p className="font-semibold tracking-tight tabular-nums" style={{ color: C.blue }}>
              <span className="text-2xl">$</span>
              <span className="text-[34px]">{data ? data.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</span>
            </p>
            {data?.provisional ? (
              <p className="text-[11px]" style={{ color: C.muted }}>
                {t("incl. {v} provisional (Substy sales not confirmed yet)", { v: usd(data.provisional) })}
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
                      {t(b.label)}
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
            {t("Not linked to Infloww yet (not counted): {v}.", { v: data.unmapped.join(", ") })}
          </p>
        ) : null}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* My shifts */}
        <section className="flex min-h-[420px] flex-col rounded-2xl p-6 lg:row-span-2" style={{ background: C.card }}>
          <Title>{t("My shifts")}</Title>
          <NoData label={t("No data")} />
        </section>

        {/* Employee sales */}
        <section className="rounded-2xl p-6" style={{ background: C.card }}>
          <Title>{t("Employee sales")}</Title>
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 10, right: 24, left: 0, bottom: 0 }} onMouseMove={(e) => setHover(typeof e?.activeTooltipIndex === "number" ? e.activeTooltipIndex : null)} onMouseLeave={() => setHover(null)}>
                <defs>
                  <linearGradient id="of-emp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: "var(--of-area)", stopOpacity: 0.9 }} />
                    <stop offset="100%" style={{ stopColor: "var(--of-area)", stopOpacity: 0.15 }} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={C.line} strokeDasharray="4 4" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: C.muted, fontSize: 12 }} dy={8} interval={chart.length > 14 ? 1 : 0} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: C.muted, fontSize: 11 }} width={48} domain={[0, top]} ticks={Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)} tickFormatter={(v: number) => v.toLocaleString("en-US")} />
                <Tooltip
                  cursor={{ stroke: C.muted, strokeDasharray: "4 4", strokeWidth: 1 }}
                  content={({ active, label }) => {
                    if (!active || hover == null) return null;
                    const pt = chart[hover];
                    if (!pt) return null;
                    const prev = hover > 0 ? chart[hover - 1].v : 0;
                    const growth = prev > 0 ? ((pt.v - prev) / prev) * 100 : null;
                    return (
                      <div className="rounded-md border px-3 py-2 text-[13px] leading-[1.45] text-white shadow-xl" style={{ background: "rgba(48,48,50,.94)", borderColor: "rgba(255,255,255,.12)" }}>
                        <p>{label}</p>
                        <p>
                          {t("Earnings")}: ${pt.v.toFixed(2)}
                          {growth != null ? ` ${t("Growth")}: ${growth.toFixed(2)}%` : ""}
                        </p>
                        <p className="pl-2">
                          {t("From Messages")}: ${pt.msgs.toFixed(2)}
                        </p>
                        <p className="pl-2">
                          {t("From Tips")}: ${pt.tips.toFixed(2)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={C.blue}
                  strokeWidth={3}
                  fill="url(#of-emp)"
                  // Survol : le remplissage s'éclaircit et les autres points s'estompent (comme Infloww).
                  fillOpacity={hover == null ? 1 : 0.45}
                  dot={(d: { cx?: number; cy?: number; index?: number }) => (
                    <circle key={d.index} cx={d.cx} cy={d.cy} r={4} strokeWidth={2} style={{ fill: "var(--of-card)", stroke: C.blue, opacity: hover == null || hover === d.index ? 1 : 0.35 }} />
                  )}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: C.blue, fill: "var(--of-card)" }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Scheduled hours */}
        <section className="flex min-h-[240px] flex-col rounded-2xl p-6" style={{ background: C.card }}>
          <Title>{t("Scheduled hours")}</Title>
          <NoData label={t("No data")} />
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

function NoData({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
      <svg viewBox="0 0 64 72" className={cn("h-16 w-14")} aria-hidden>
        <path d="M8 6h34l14 14v44a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4Z" style={{ fill: "var(--of-card)", stroke: "var(--of-text)" }} strokeWidth="2.5" />
        <path d="M42 6v14h14" fill="none" style={{ stroke: "var(--of-text)" }} strokeWidth="2.5" />
        <path d="M14 20h18M14 27h22" style={{ stroke: "var(--of-muted)" }} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M18 42h8M38 42h8M25 52h14" stroke="#2f6bff" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-[13px]" style={{ color: C.muted }}>
        {label}
      </p>
    </div>
  );
}
