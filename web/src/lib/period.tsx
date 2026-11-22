"use client";

import { useState } from "react";
import { cn } from "@/lib/fmt";

/** Périodes communes (Accueil, Performances), en jours de Paris. */
export type P = "today" | "yesterday" | "7d" | "30d" | "month" | "year" | "custom";
export const PERIODS: [P, string][] = [
  ["today", "Aujourd’hui"],
  ["yesterday", "Hier"],
  ["7d", "7 j"],
  ["30d", "30 j"],
  ["month", "Ce mois"],
  ["year", "1 an"],
  ["custom", "Dates"],
];
export const parisDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
export const minus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86400e3).toISOString().slice(0, 10);
export const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
export const fmtRange = (from: string, to: string) => (from === to ? fmtDay(from) : `Du ${fmtDay(from)} au ${fmtDay(to)}`);

export function range(p: P, custom: { from: string; to: string }) {
  const today = parisDay(Date.now());
  if (p === "today") return { from: today, to: today };
  if (p === "yesterday") return { from: minus(today, 1), to: minus(today, 1) };
  if (p === "7d") return { from: minus(today, 6), to: today };
  if (p === "30d") return { from: minus(today, 29), to: today };
  if (p === "month") return { from: today.slice(0, 8) + "01", to: today };
  if (p === "year") return { from: minus(today, 364), to: today };
  return custom;
}

/** La période choisie et son sélecteur. */
export function usePeriod(initial: P = "today") {
  const [p, setP] = useState<P>(initial);
  const [custom, setCustom] = useState(() => ({ from: minus(parisDay(Date.now()), 6), to: parisDay(Date.now()) }));
  const { from, to } = range(p, custom);
  const picker = (
    <>
      <div className="flex flex-wrap gap-1">
        {PERIODS.map(([k, l]) => (
          <button key={k} onClick={() => setP(k)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", p === k ? "border-primary bg-petal text-primary-soft" : "bg-card text-muted hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>
      {p === "custom" ? (
        <div className="flex items-center gap-1.5">
          <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} className="h-9 rounded-full border bg-card px-3 text-sm" />
          <span className="text-muted">→</span>
          <input type="date" value={custom.to} min={custom.from} max={parisDay(Date.now())} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} className="h-9 rounded-full border bg-card px-3 text-sm" />
        </div>
      ) : null}
    </>
  );
  return { p, from, to, picker };
}
