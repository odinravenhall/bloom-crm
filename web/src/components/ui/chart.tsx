"use client";

// Graphiques de Bloom, à la manière de shadcn/ui (ChartContainer + ChartTooltipContent + ChartLegendContent),
// sur Recharts. Chaque série a une couleur dans `config` ; elle est posée en variable CSS --color-<clé>
// et les graphiques l'utilisent par « var(--color-<clé>) ». Suit le thème et la couleur d'accent.
import * as React from "react";
import * as Recharts from "recharts";
import { cn } from "@/lib/fmt";

export type ChartConfig = Record<string, { label: string; color: string }>;

const Ctx = React.createContext<ChartConfig>({});
export const useChart = () => React.useContext(Ctx);

export function ChartContainer({ config, className, children }: { config: ChartConfig; className?: string; children: React.ComponentProps<typeof Recharts.ResponsiveContainer>["children"] }) {
  const vars = Object.fromEntries(Object.entries(config).map(([k, v]) => [`--color-${k}`, v.color])) as React.CSSProperties;
  return (
    <Ctx.Provider value={config}>
      <div
        style={vars}
        className={cn(
          "aspect-auto w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-[var(--color-muted)] [&_.recharts-cartesian-grid_line]:stroke-[var(--color-line)] [&_.recharts-reference-line_line]:stroke-[var(--color-line)] [&_.recharts-surface]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-layer]:outline-none",
          className,
        )}
      >
        <Recharts.ResponsiveContainer width="100%" height="100%">
          {children}
        </Recharts.ResponsiveContainer>
      </div>
    </Ctx.Provider>
  );
}

export const ChartTooltip = Recharts.Tooltip;
export const ChartLegend = Recharts.Legend;

type TipItem = { dataKey?: string | number; name?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> };

/** Bulle d'aide : titre (ou étiquette de l'axe), puis chaque série avec sa couleur et sa valeur formatée. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  format = (v) => String(v),
  labelKey,
  total,
}: {
  active?: boolean;
  payload?: TipItem[];
  label?: string | number;
  format?: (v: number) => string;
  labelKey?: string;
  total?: boolean;
}) {
  const config = useChart();
  if (!active || !payload?.length) return null;
  const title = labelKey ? String(payload[0]?.payload?.[labelKey] ?? "") : label;
  const sum = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
  return (
    <div className="min-w-40 rounded-xl border bg-panel-strong px-3 py-2 text-xs shadow-xl">
      {title !== undefined && title !== "" ? <p className="mb-1.5 font-semibold">{title}</p> : null}
      <div className="flex flex-col gap-1">
        {payload.map((p) => {
          const key = String(p.dataKey ?? p.name ?? "");
          const c = config[key] ?? config[String(p.name)];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: c?.color ?? p.color }} />
              <span className="flex-1 text-muted">{c?.label ?? p.name}</span>
              <b className="tabular-nums">{format(Number(p.value) || 0)}</b>
            </div>
          );
        })}
        {total && payload.length > 1 ? (
          <div className="mt-1 flex items-center gap-2 border-t pt-1">
            <span className="flex-1 text-muted">Total</span>
            <b className="tabular-nums">{format(sum)}</b>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Légende : pastille + nom de chaque série. */
export function ChartLegendContent({ keys, className }: { keys?: string[]; className?: string }) {
  const config = useChart();
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs", className)}>
      {(keys ?? Object.keys(config)).map((k) => (
        <span key={k} className="flex items-center gap-1.5 text-muted">
          <span className="size-2.5 rounded-[3px]" style={{ background: config[k]?.color }} />
          {config[k]?.label ?? k}
        </span>
      ))}
    </div>
  );
}
