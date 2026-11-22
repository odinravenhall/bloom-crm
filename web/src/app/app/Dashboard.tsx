"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Clock, Gift, Image as ImageIcon, Lock, RefreshCw, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { cn, eur, moneyC, num, when } from "@/lib/fmt";
import { PlatformBadge, useCreators } from "@/lib/creators";
import type { Count, Dashboard as Live, RevenueR, Role } from "@/lib/types";
import { Avatar, Pill } from "@/components/ui";
import { AreaStack, DeltaPct, pctChange } from "@/components/charts";

type P = "today" | "yesterday" | "7d" | "30d" | "month" | "year" | "custom";
const PERIODS: [P, string][] = [
  ["today", "Aujourd’hui"],
  ["yesterday", "Hier"],
  ["7d", "7 j"],
  ["30d", "30 j"],
  ["month", "Ce mois"],
  ["year", "1 an"],
  ["custom", "Dates"],
];
const parisDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const minus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86400e3).toISOString().slice(0, 10);
function range(p: P, custom: { from: string; to: string }) {
  const today = parisDay(Date.now());
  if (p === "today") return { from: today, to: today };
  if (p === "yesterday") return { from: minus(today, 1), to: minus(today, 1) };
  if (p === "7d") return { from: minus(today, 6), to: today };
  if (p === "30d") return { from: minus(today, 29), to: today };
  if (p === "month") return { from: today.slice(0, 8) + "01", to: today };
  if (p === "year") return { from: minus(today, 364), to: today };
  return custom;
}
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

// D'où vient l'argent.
const ORIGINS: [string, string, string][] = [
  ["ai", "IA Substy", "var(--chart-1)"],
  ["bloom", "Chatteurs Bloom", "var(--chart-4)"],
  ["substy", "Automatisations Substy", "var(--chart-5)"],
  ["chatter", "Chatteurs Infloww / MyPulse", "var(--chart-2)"],
  ["sub", "Abonnements", "var(--chart-3)"],
  ["other", "Autres", "var(--chart-7)"],
];
const TYPES: Record<string, string> = { ppv: "PPV", tip: "Pourboire", sub: "Abonnement", post: "Post", stream: "Live", other: "Autre" };
const SALE_ICON: Record<string, typeof Lock> = { ppv: Lock, tip: Gift, post: ImageIcon, sub: UserRound };
const count = (c: Count | undefined) => (c?.n == null ? "—" : `${c.n}${c.more ? "+" : ""}`);
const inbox = (creatorId: string, extra = "") => `/app/messagerie?c=${encodeURIComponent(creatorId)}${extra}`;

export function Dashboard({ role }: { role: Role }) {
  // Une modèle voit seulement son chiffre : pas d'origine des ventes, pas de conversations.
  const model = role === "model";
  const { creators } = useCreators();
  const [p, setP] = useState<P>("today");
  const [custom, setCustom] = useState(() => ({ from: minus(parisDay(Date.now()), 6), to: parisDay(Date.now()) }));
  const { from, to } = range(p, custom);
  const [rev, setRev] = useState<RevenueR | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRev = useCallback(async () => {
    setBusy(true);
    try {
      setRev(await api<RevenueR>("GET", `/api/revenue?from=${from}&to=${to}`));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [from, to]);
  const loadLive = useCallback(() => (model ? Promise.resolve() : api<Live>("GET", "/api/dashboard").then(setLive).catch(() => {})), [model]);
  useEffect(() => {
    loadRev();
  }, [loadRev]);
  useEffect(() => {
    loadLive();
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadRev();
      loadLive();
    }, 60_000);
    return () => clearInterval(t);
  }, [loadRev, loadLive]);

  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const of = rev?.creators.filter((c) => c.platform === "onlyfans") ?? [];
  const mym = rev?.creators.filter((c) => c.platform === "mym") ?? [];
  const sum = (l: typeof of, k: "net" | "eur") => l.reduce((a, c) => a + c[k], 0);
  const official = rev ? Math.max(1, rev.total - rev.provisional) : 1;
  const substy = rev ? (rev.byOrigin.ai || 0) + (rev.byOrigin.bloom || 0) + (rev.byOrigin.substy || 0) : 0;
  const chart = useMemo(() => {
    if (!rev) return [];
    const byMonth = rev.days.length > 92;
    const m = new Map<string, { label: string; onlyfans: number; mym: number }>();
    for (const d of rev.days) {
      const key = byMonth ? d.day.slice(0, 7) : d.day;
      const label = new Date(d.day + "T12:00:00").toLocaleDateString("fr-FR", byMonth ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
      const x = m.get(key) ?? { label, onlyfans: 0, mym: 0 };
      x.onlyfans += d.onlyfans / 100;
      x.mym += (d.mym + d.provisional) / 100;
      m.set(key, x);
    }
    return [...m.values()];
  }, [rev]);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      {/* En-tête : période en premier */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">Accueil</h1>
          <p className="mt-1 text-sm text-muted">{from === to ? fmtDay(from) : `Du ${fmtDay(from)} au ${fmtDay(to)}`} · ventes réelles Infloww et MyPulse, nettes</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <button onClick={() => (loadRev(), loadLive())} disabled={busy} title="Actualiser" className="grid size-9 place-items-center rounded-full border bg-card text-muted hover:text-fg">
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          </button>
        </div>
      </div>

      {err ? <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">{err}</p> : null}
      {rev?.unmapped.length ? (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {rev.unmapped.map((id) => byId.get(id)?.name ?? id).join(", ")} : pas encore reliée(s) à Infloww / MyPulse.{" "}
          <Link href="/app/reglages" className="font-semibold underline">
            Relier
          </Link>
        </p>
      ) : null}

      {/* Bandeau : le chiffre, sa composition, les repères */}
      <section className="card grid gap-8 rounded-[2rem] border bg-card p-6 md:p-8 lg:grid-cols-[1.1fr_1.6fr_0.9fr]">
        <div>
          <p className="text-sm font-semibold text-muted">Chiffre d’affaires net</p>
          <p className="mt-1 font-display text-5xl font-semibold tabular-nums md:text-6xl">{rev ? eur(rev.total, 0) : "—"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {rev ? <DeltaPct v={pctChange(rev.total, rev.prev)} suffix={p === "today" ? "vs hier" : "vs période d’avant"} /> : null}
            {rev?.provisional ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Clock className="size-3.5" /> dont {eur(rev.provisional, 0)} en attente de confirmation
              </span>
            ) : null}
          </div>
        </div>
        <div className={model ? "hidden" : ""}>
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-muted">D’où vient l’argent</p>
            <p className="text-sm">
              Substy : <b className="tabular-nums">{eur(substy, 0)}</b> <span className="text-muted">({rev?.total ? Math.round((substy / rev.total) * 100) : 0} %)</span>
            </p>
          </div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-card-2">
            {ORIGINS.map(([k, , color]) => (rev?.byOrigin[k] ? <span key={k} style={{ width: `${(rev.byOrigin[k] / official) * 100}%`, background: color }} /> : null))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {ORIGINS.map(([k, label, color]) => (
              <div key={k} className={cn("flex items-center gap-2 text-sm", !rev?.byOrigin[k] && "opacity-40")}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="min-w-0 flex-1 truncate text-muted">{label}</span>
                <b className="tabular-nums">{eur(rev?.byOrigin[k] || 0, 0)}</b>
              </div>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-1 lg:border-l lg:pl-8">
          {[
            ["OnlyFans", rev ? moneyC(sum(of, "net"), "USD", 0) : "—"],
            ["MYM", rev ? eur(sum(mym, "net"), 0) : "—"],
            ["Ventes", rev ? num(rev.sales) : "—"],
            ["Fans acheteurs", rev ? num(rev.buyers) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="font-display text-xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Courbe */}
      <section>
        <div className="mb-2 flex items-center gap-4 text-sm">
          <h2 className="text-2xl">Évolution</h2>
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2.5 rounded-full" style={{ background: "var(--chart-1)" }} /> OnlyFans
          </span>
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2.5 rounded-full" style={{ background: "var(--chart-2)" }} /> MYM
          </span>
        </div>
        {chart.length ? (
          <AreaStack
            data={chart}
            format={(v) => `${Math.round(v).toLocaleString("fr-FR")} €`}
            series={[
              { key: "onlyfans", label: "OnlyFans", color: "var(--chart-1)" },
              { key: "mym", label: "MYM", color: "var(--chart-2)" },
            ]}
          />
        ) : (
          <p className="py-16 text-center text-sm text-muted">{rev ? "Aucune vente" : "Chargement…"}</p>
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        {/* Créatrices : un tableau */}
        <section>
          <h2 className="mb-3 text-2xl">Créatrices</h2>
          <div className="overflow-x-auto rounded-3xl border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">Créatrice</th>
                  <th className="px-3 py-3 text-right font-semibold">Chiffre</th>
                  <th className="px-3 py-3 font-semibold">Évolution</th>
                  <th className="px-3 py-3 text-right font-semibold">Ventes</th>
                  {model ? null : (
                    <>
                      <th className="px-3 py-3 text-right font-semibold">Non lues</th>
                      <th className="px-3 py-3 text-right font-semibold">À reprendre</th>
                      <th className="px-3 py-3 font-semibold">IA</th>
                      <th />
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {creators.map((c) => {
                  const r = rev?.creators.find((x) => x.creatorId === c.id);
                  const l = live?.creators.find((x) => x.id === c.id);
                  const unmapped = rev?.unmapped.includes(c.id);
                  const mymC = /mym/i.test(c.platform || "");
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar src={c.avatar} name={c.name} size="size-9" />
                          <span>
                            <b className="flex items-center gap-1.5">
                              {c.name} <PlatformBadge c={c} />
                            </b>
                            <span className="text-xs text-muted">{l ? (l.live ? "en direct" : "connexion…") : mymC ? "MYM" : "OnlyFans"}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-display text-lg font-semibold tabular-nums">
                        {unmapped ? <span className="font-sans text-xs text-amber-300">pas reliée</span> : r ? moneyC(r.net, r.currency, 0) : rev ? moneyC(0, mymC ? "EUR" : "USD", 0) : "—"}
                        {r?.provisional ? <span className="block font-sans text-[11px] font-normal text-muted">+ {eur(r.provisional, 0)} en attente</span> : null}
                      </td>
                      <td className="px-3 py-3">{r ? <DeltaPct v={pctChange(r.eur, r.prev)} /> : null}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r?.sales ?? 0}</td>
                      {model ? null : (
                      <>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <Link href={inbox(c.id, "&f=todo")} className="font-semibold text-primary-soft hover:underline">
                          {count(l?.unread)}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <Link href={inbox(c.id, "&f=todo")} className="font-semibold text-amber-300 hover:underline">
                          {count(l?.handoff)}
                        </Link>
                      </td>
                      <td className="px-3 py-3">{c.ai === false ? <Pill>coupée</Pill> : c.ai ? <Pill tone="accent">active</Pill> : null}</td>
                      <td className="px-3 py-3 text-right">
                        <Link href={inbox(c.id)} title="Ouvrir la messagerie" className="inline-grid size-8 place-items-center rounded-full text-muted hover:bg-card-2 hover:text-fg">
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </td>
                      </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Dernières ventes : un fil */}
        <section>
          <h2 className="mb-3 text-2xl">Dernières ventes</h2>
          <ol className="scroll-thin relative max-h-[520px] overflow-y-auto pl-4">
            <span className="absolute top-2 bottom-2 left-[7px] w-px bg-line" />
            {(rev?.recent ?? []).map((s) => {
              const Icon = SALE_ICON[s.type] ?? Gift;
              const o = ORIGINS.find(([k]) => k === s.origin);
              const body = (
                <>
                  <span className="absolute top-3.5 -left-[13px] grid size-[18px] place-items-center rounded-full border bg-card text-primary">
                    <Icon className="size-2.5" />
                  </span>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {s.fan ?? "Fan"} <span className="font-normal text-muted">· {TYPES[s.type] ?? s.type}</span>
                    </span>
                    <span className="shrink-0 font-display text-base font-semibold tabular-nums">{moneyC(s.net, s.currency)}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {byId.get(s.creatorId)?.name ?? ""} · {when(s.at)}
                    {o && !model ? <span>· {s.by ? s.by : o[1]}</span> : null}
                    {s.provisional ? (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <Clock className="size-3" /> en attente
                      </span>
                    ) : null}
                  </span>
                </>
              );
              return (
                <li key={s.id} className="relative">
                  {s.fanId && !model ? (
                    <Link href={inbox(s.creatorId, `&fan=${encodeURIComponent(s.fanId)}`)} className="block rounded-2xl px-3 py-2.5 hover:bg-card">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-3 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
            {rev && !rev.recent.length ? <p className="py-10 text-center text-sm text-muted">Aucune vente sur la période</p> : null}
          </ol>
        </section>
      </div>
    </div>
  );
}
