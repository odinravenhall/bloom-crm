"use client";

// Briques de graphiques façon shadcn/ui (Recharts) : conteneur à couleurs nommées, infobulle et légende.
import * as React from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/fmt";

export type ChartConfig = Record<string, { label: string; color: string }>;

const Ctx = React.createContext<ChartConfig>({});
export const useChartConfig = () => React.useContext(Ctx);

/** Donne à chaque série une variable CSS --color-<clé>, comme shadcn. */
export function ChartContainer({ config, className, height, children }: { config: ChartConfig; className?: string; height?: number; children: React.ReactElement }) {
  const vars = Object.fromEntries(Object.entries(config).map(([k, v]) => [`--color-${k}`, v.color])) as React.CSSProperties;
  return (
    <Ctx.Provider value={config}>
      <div
        style={{ ...vars, ...(height ? { height } : {}) }}
        className={cn(
          "w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-[var(--color-muted)] [&_.recharts-cartesian-grid_line]:stroke-[color-mix(in_oklab,var(--color-line)_70%,transparent)] [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-white/[0.04] [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </Ctx.Provider>
  );
}

type TipItem = { dataKey?: string | number; name?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> };

/** Infobulle shadcn : titre, une ligne par série avec sa pastille, total optionnel. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  format,
  total,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TipItem[];
  label?: string | number;
  format: (v: number) => string;
  total?: boolean;
  labelFormatter?: (l: string) => string;
}) {
  const config = useChartConfig();
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== undefined && p.value !== null);
  const sum = items.filter((p) => !String(p.dataKey).startsWith("prev")).reduce((a, p) => a + Number(p.value || 0), 0);
  return (
    <div className="min-w-44 rounded-xl border bg-card/95 px-3 py-2.5 text-xs shadow-2xl">
      {label !== undefined ? <p className="mb-1.5 font-semibold">{labelFormatter ? labelFormatter(String(label)) : label}</p> : null}
      <div className="flex flex-col gap-1">
        {items.map((p) => {
          const key = String(p.dataKey);
          const c = config[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: c?.color ?? p.color }} />
              <span className="flex-1 text-muted">{c?.label ?? p.name}</span>
              <span className="font-mono font-semibold text-fg tabular-nums">{format(Number(p.value || 0))}</span>
            </div>
          );
        })}
      </div>
      {total && items.filter((p) => !String(p.dataKey).startsWith("prev")).length > 1 ? (
        <div className="mt-1.5 flex items-center justify-between border-t pt-1.5 font-semibold">
          Total <span className="font-mono tabular-nums">{format(sum)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Légende shadcn (pastilles + libellés). */
export function ChartLegend({ keys, className }: { keys: string[]; className?: string }) {
  const config = useChartConfig();
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-4 pt-3 text-xs text-muted", className)}>
      {keys.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: config[k]?.color }} />
          {config[k]?.label ?? k}
        </span>
      ))}
    </div>
  );
}
