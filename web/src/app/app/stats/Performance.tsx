"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { cn, eur, num } from "@/lib/fmt";
import { useCreators } from "@/lib/creators";
import { fmtRange, usePeriod } from "@/lib/period";
import type { Perf, PerfSeller } from "@/lib/types";
import { Avatar, Pill, Table, tdCls, thCls } from "@/components/ui";
import { DeltaPct, pctChange } from "@/components/charts";

const KIND: Record<PerfSeller["kind"], [string, "accent" | "info" | "muted" | "good"]> = {
  bloom: ["Bloom", "accent"],
  platform: ["Infloww / MyPulse", "info"],
  ai: ["IA Substy", "good"],
  other: ["sans chatteur", "muted"],
};
type Filter = "all" | PerfSeller["kind"];
const FILTERS: [Filter, string][] = [
  ["all", "Tous"],
  ["bloom", "Chatteurs Bloom"],
  ["platform", "Infloww / MyPulse"],
  ["ai", "IA"],
];

/** Performances : qui fait le chiffre (chatteurs Bloom, chatteurs Infloww / MyPulse, IA), sur quelle créatrice, et comparé à la période d'avant. */
export function Performance() {
  const { creators } = useCreators();
  const { from, to, picker } = usePeriod("7d");
  const [data, setData] = useState<Perf | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [cid, setCid] = useState("");

  const load = useCallback(() => {
    setBusy(true);
    setErr("");
    api<Perf>("GET", `/api/performance?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setBusy(false));
  }, [from, to]);
  useEffect(load, [load]);

  const name = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const sellers = useMemo(() => {
    const l = (data?.sellers ?? []).filter((s) => filter === "all" || s.kind === filter);
    if (!cid) return l;
    return l.map((s) => ({ ...s, eur: s.creators[cid] || 0 })).filter((s) => s.eur > 0).sort((a, b) => b.eur - a.eur);
  }, [data, filter, cid]);
  const top = Math.max(1, ...sellers.map((s) => s.eur));
  const sum = (k: PerfSeller["kind"]) => (data?.sellers ?? []).filter((s) => s.kind === k).reduce((a, s) => a + s.eur, 0);
  const nonSub = data ? data.total - data.subs : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">Performances</h1>
          <p className="mt-1 text-sm text-muted">{fmtRange(from, to)} · ventes confirmées Infloww et MyPulse, nettes, en euros</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {picker}
          <button onClick={load} disabled={busy} title="Actualiser" className="grid size-9 place-items-center rounded-full border bg-card text-muted hover:text-fg">
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          </button>
        </div>
      </div>
      {err ? <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">{err}</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Band label="Chiffre total" value={eur(data.total, 0)} delta={pctChange(data.total, data.prev)} accent />
            <Band label="Chatteurs Bloom" value={eur(sum("bloom"), 0)} sub={share(sum("bloom"), nonSub)} />
            <Band label="Infloww / MyPulse" value={eur(sum("platform"), 0)} sub={share(sum("platform"), nonSub)} />
            <Band label="IA Substy" value={eur(sum("ai"), 0)} sub={share(sum("ai"), nonSub)} />
            <Band label="Abonnements" value={eur(data.subs, 0)} sub="pas attribués à un chatteur" />
          </div>

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-2xl">Par chatteur</h2>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", filter === k ? "border-primary bg-petal text-primary-soft" : "bg-card text-muted hover:text-fg")}>
                    {l}
                  </button>
                ))}
              </div>
              <select value={cid} onChange={(e) => setCid(e.target.value)} className="h-8 rounded-full border bg-card px-3 text-xs font-semibold">
                <option value="">Toutes les créatrices</option>
                {data.creators.map((c) => (
                  <option key={c.creatorId} value={c.creatorId}>
                    {name.get(c.creatorId)?.name ?? c.creatorId}
                  </option>
                ))}
              </select>
            </div>
            <Table
              className="mx-0 rounded-2xl border bg-card md:mx-0"
              head={
                <>
                  <th className={thCls}>#</th>
                  <th className={thCls}>Chatteur</th>
                  <th className={cn(thCls, "text-right")}>Chiffre</th>
                  <th className={cn(thCls, "text-right")}>PPV</th>
                  <th className={cn(thCls, "text-right")}>Pourboires</th>
                  <th className={cn(thCls, "text-right")}>Ventes</th>
                  <th className={cn(thCls, "text-right")}>Acheteurs</th>
                  <th className={cn(thCls, "text-right")}>Panier moyen</th>
                  <th className={cn(thCls, "text-right")} title="Envoyés depuis Bloom sur la période">Messages / PPV envoyés</th>
                  <th className={thCls}>Créatrices</th>
                </>
              }
            >
              {sellers.map((s, i) => {
                const all = !cid;
                return (
                  <tr key={s.key} className="border-t">
                    <td className={cn(tdCls, "text-muted")}>{i + 1}</td>
                    <td className={cn(tdCls, "min-w-56")}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{s.name}</span>
                        <Pill tone={KIND[s.kind][1]}>{KIND[s.kind][0]}</Pill>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-card-2">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(s.eur / top) * 100}%` }} />
                      </div>
                    </td>
                    <td className={cn(tdCls, "text-right")}>
                      <span className="font-semibold">{eur(s.eur, 0)}</span> {all ? <DeltaPct v={pctChange(s.eur, s.prev)} /> : null}
                    </td>
                    <td className={cn(tdCls, "text-right")}>{all ? eur(s.ppv, 0) : "—"}</td>
                    <td className={cn(tdCls, "text-right")}>{all ? eur(s.tips, 0) : "—"}</td>
                    <td className={cn(tdCls, "text-right")}>{all ? num(s.sales) : "—"}</td>
                    <td className={cn(tdCls, "text-right")}>{all ? num(s.buyers) : "—"}</td>
                    <td className={cn(tdCls, "text-right")}>{all && s.sales ? eur(s.eur / s.sales, 0) : "—"}</td>
                    <td className={cn(tdCls, "text-right")}>{s.msgs != null ? `${num(s.msgs)} / ${num(s.ppvSent)}` : "—"}</td>
                    <td className={tdCls}>
                      <div className="flex -space-x-1.5">
                        {Object.entries(s.creators)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 5)
                          .map(([id, v]) => (
                            <span key={id} title={`${name.get(id)?.name ?? id} : ${eur(v, 0)}`}>
                              <Avatar src={name.get(id)?.avatar} name={name.get(id)?.name} size="size-6" className="ring-2 ring-card" />
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!sellers.length ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-sm text-muted">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              ) : null}
            </Table>
            <p className="mt-2 text-xs text-muted">
              Une vente va au chatteur Bloom qui a envoyé le PPV acheté, sinon à l’IA Substy, sinon au chatteur qu’Infloww ou MyPulse a noté. Abonnements à part. Comparaison : la période d’avant, de même durée.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl">Par créatrice</h2>
            <Table
              className="mx-0 rounded-2xl border bg-card md:mx-0"
              head={
                <>
                  <th className={thCls}>Créatrice</th>
                  <th className={cn(thCls, "text-right")}>Chiffre</th>
                  <th className={cn(thCls, "text-right")}>Abonnements</th>
                  <th className={thCls}>Meilleurs chatteurs</th>
                </>
              }
            >
              {data.creators.map((c) => {
                const cr = name.get(c.creatorId);
                const best = Object.entries(c.sellers)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([k, v]) => `${data.sellers.find((s) => s.key === k)?.name ?? "?"} ${eur(v, 0)}`);
                return (
                  <tr key={c.creatorId} className="border-t">
                    <td className={tdCls}>
                      <div className="flex items-center gap-2">
                        <Avatar src={cr?.avatar} name={cr?.name} size="size-7" />
                        <span className="font-semibold">{cr?.name ?? c.creatorId}</span>
                      </div>
                    </td>
                    <td className={cn(tdCls, "text-right")}>
                      <span className="font-semibold">{eur(c.eur, 0)}</span> <DeltaPct v={pctChange(c.eur, c.prev)} />
                    </td>
                    <td className={cn(tdCls, "text-right")}>{eur(c.subs, 0)}</td>
                    <td className={cn(tdCls, "text-sm text-muted")}>{best.join(" · ") || "—"}</td>
                  </tr>
                );
              })}
            </Table>
          </section>
        </>
      ) : !err ? (
        <p className="p-10 text-center text-sm text-muted">Chargement…</p>
      ) : null}
    </div>
  );
}

const share = (v: number, total: number) => (total > 0 ? `${Math.round((v / total) * 100)} % des ventes hors abonnements` : undefined);

function Band({ label, value, sub, delta, accent }: { label: string; value: React.ReactNode; sub?: string; delta?: number | null; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card px-4 py-3", accent && "border-primary/40")}>
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", accent && "text-primary-soft")}>{value}</p>
      {delta !== undefined ? <DeltaPct v={delta} suffix="vs avant" /> : null}
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </div>
  );
}
