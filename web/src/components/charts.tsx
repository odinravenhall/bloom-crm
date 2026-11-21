"use client";

// Graphiques de Bloom, façon shadcn/ui (Recharts), repris de Raven CRM.
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/fmt";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "./chart-ui";

/** Barres par jour (une série). */
export function DayBars({ data, format, height = 240 }: { data: { label: string; v: number }[]; format: (v: number) => string; height?: number }) {
  const config: ChartConfig = { v: { label: "Revenus", color: "var(--color-primary)" } };
  return (
    <ChartContainer config={config} className="w-full" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
        <YAxis tickLine={false} axisLine={false} width={58} tickFormatter={(v: number) => format(v)} />
        <Tooltip cursor content={<ChartTooltipContent format={format} />} />
        <Bar dataKey="v" fill="var(--color-v)" radius={[5, 5, 0, 0]} maxBarSize={34} />
      </BarChart>
    </ChartContainer>
  );
}

/** Barres empilées (par plateforme), avec légende. */
export function StackBars({
  data,
  series,
  format,
  height = 260,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string; color: string }[];
  format: (v: number) => string;
  height?: number;
}) {
  const config: ChartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
  return (
    <div>
      <ChartContainer config={config} className="w-full" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => format(v)} />
          <Tooltip cursor content={<ChartTooltipContent format={format} total />} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={`var(--color-${s.key})`} radius={i === series.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]} maxBarSize={34} />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center justify-center gap-4 pt-3 text-xs text-muted">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Évolution en % entre deux montants (null si pas de comparaison possible). */
export const pctChange = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

/** Pastille d'évolution en %. */
export function DeltaPct({ v, suffix }: { v: number | null | undefined; suffix?: string }) {
  if (v === null || v === undefined || !isFinite(v)) return null;
  if (Math.abs(v) < 0.5) return <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-bold text-muted">= 0 %</span>;
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap tabular-nums", v > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
      {v > 0 ? "↗" : "↘"} {Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 })} %{suffix ? <span className="ml-1 font-medium text-muted">{suffix}</span> : null}
    </span>
  );
}
