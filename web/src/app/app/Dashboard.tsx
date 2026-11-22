"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CalendarRange, Clock, Gift, Image as ImageIcon, Lock, RefreshCw, ShoppingBag, Sparkles, TrendingDown, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { cn, eur, moneyC, num, when } from "@/lib/fmt";
import { PlatformBadge, useCreators } from "@/lib/creators";
import type { Count, Dashboard as Live, RevenueR, Role } from "@/lib/types";
import { Avatar, Pill } from "@/components/ui";
import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { pctChange } from "@/components/charts";

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
const euros = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`);

// D'où vient l'argent : nuances de la couleur principale (blanc et gris par défaut), de la plus forte à la plus discrète.
const ORIGINS: { k: string; label: string; color: string }[] = [
  { k: "ai", label: "IA Substy", color: "var(--color-primary)" },
  { k: "bloom", label: "Chatteurs Bloom", color: "var(--color-accent-2)" },
  { k: "chatter", label: "Chatteurs Infloww / MyPulse", color: "color-mix(in oklab, var(--color-primary) 55%, var(--color-card))" },
  { k: "substy", label: "Automatisations Substy", color: "color-mix(in oklab, var(--color-primary) 38%, var(--color-card))" },
  { k: "sub", label: "Abonnements", color: "color-mix(in oklab, var(--color-primary) 26%, var(--color-card))" },
  { k: "other", label: "Autres", color: "color-mix(in oklab, var(--color-primary) 16%, var(--color-card))" },
];
const TYPES: { k: string; label: string; color: string }[] = [
  { k: "ppv", label: "PPV", color: "var(--color-primary)" },
  { k: "tip", label: "Pourboires", color: "color-mix(in oklab, var(--color-primary) 70%, var(--color-card))" },
  { k: "sub", label: "Abonnements", color: "color-mix(in oklab, var(--color-primary) 45%, var(--color-card))" },
  { k: "post", label: "Posts", color: "color-mix(in oklab, var(--color-primary) 30%, var(--color-card))" },
  { k: "other", label: "Autres", color: "color-mix(in oklab, var(--color-primary) 18%, var(--color-card))" },
];
const TYPE_LABEL: Record<string, string> = { ppv: "PPV", tip: "Pourboire", sub: "Abonnement", post: "Post", stream: "Live", other: "Autre" };
const SALE_ICON: Record<string, typeof Lock> = { ppv: Lock, tip: Gift, post: ImageIcon, sub: UserRound };
const count = (c: Count | undefined) => (c?.n == null ? "—" : `${c.n}${c.more ? "+" : ""}`);
// Messagerie : une conversation précise = « <créatrice>~<fan> ».
const inboxLink = (creatorId: string, fanId?: string | null) => (fanId ? `/app/messagerie?c=${encodeURIComponent(`${creatorId}~${fanId}`)}` : "/app/messagerie");

const AREA: ChartConfig = { onlyfans: { label: "OnlyFans", color: "var(--color-primary)" }, mym: { label: "MYM", color: "var(--color-accent-2)" } };

/** Accueil : le chiffre de la période, sa courbe, d'où vient l'argent, les créatrices et les dernières ventes. */
export function Dashboard({ role, name }: { role: Role; name?: string }) {
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
  // Courbe : par jour (par mois au-delà de 3 mois), en euros, OnlyFans et MYM.
  const series = useMemo(() => {
    if (!rev) return [];
    const byMonth = rev.days.length > 92;
    const m = new Map<string, { label: string; onlyfans: number; mym: number; total: number }>();
    for (const d of rev.days) {
      const key = byMonth ? d.day.slice(0, 7) : d.day;
      const label = new Date(d.day + "T12:00:00").toLocaleDateString("fr-FR", byMonth ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
      const x = m.get(key) ?? { label, onlyfans: 0, mym: 0, total: 0 };
      x.onlyfans += d.onlyfans / 100;
      x.mym += (d.mym + d.provisional) / 100;
      x.total = x.onlyfans + x.mym;
      m.set(key, x);
    }
    return [...m.values()];
  }, [rev]);
  // D'où vient l'argent. Les ventes Infloww / MyPulse ne disent pas si c'est l'IA de Substy qui a vendu : on prend le chiffre
  // de l'IA donné par Substy, et on le retire de « autres » puis des chatteurs (pour ne pas compter deux fois).
  const origins = useMemo(() => {
    const v: Record<string, number> = { ...(rev?.byOrigin ?? {}) };
    const ai = rev?.ai?.net ?? 0;
    if (ai > (v.ai || 0)) {
      let extra = ai - (v.ai || 0);
      v.ai = ai;
      for (const k of ["other", "chatter"]) {
        const take = Math.min(extra, v[k] || 0);
        v[k] = (v[k] || 0) - take;
        extra -= take;
      }
    }
    return ORIGINS.map((o) => ({ ...o, value: (v[o.k] || 0) / 100 })).filter((o) => o.value > 0);
  }, [rev]);
  const aiDays = useMemo(() => {
    if (!rev?.ai?.days.length) return [];
    return rev.ai.days.map((d) => ({ label: new Date(d.day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), ai: d.ai / 100, employee: d.employee / 100 }));
  }, [rev]);
  const types = useMemo(() => TYPES.map((t) => ({ ...t, value: (rev?.byType[t.k] || 0) / 100 })).filter((t) => t.value > 0), [rev]);
  const ranked = useMemo(
    () =>
      creators
        .map((c) => ({ c, r: rev?.creators.find((x) => x.creatorId === c.id), l: live?.creators.find((x) => x.id === c.id) }))
        .sort((a, b) => (b.r?.eur || 0) - (a.r?.eur || 0)),
    [creators, rev, live],
  );
  const topEur = Math.max(1, ...ranked.map((x) => x.r?.eur || 0));
  const delta = rev ? pctChange(rev.total, rev.prev) : null;
  const basket = rev && rev.sales ? rev.total / rev.sales : 0;
  const substy = rev ? (rev.ai?.net ?? 0) || (rev.byOrigin.ai || 0) + (rev.byOrigin.substy || 0) : 0;
  const ofEur = rev ? rev.creators.filter((c) => c.platform === "onlyfans").reduce((a, c) => a + c.eur, 0) : 0;
  const mymEur = rev ? rev.creators.filter((c) => c.platform === "mym").reduce((a, c) => a + c.eur, 0) : 0;
  const hour = new Date().getHours();
  const hello = hour < 6 ? "Bonne nuit" : hour < 18 ? "Bonjour" : "Bonsoir";

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {hello}
            {name ? ` ${name.split(" ")[0]}` : ""} 👋
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            <span className="text-grad">Accueil</span>
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <CalendarRange className="size-4" />
            {from === to ? fmtDay(from) : `Du ${fmtDay(from)} au ${fmtDay(to)}`} · ventes réelles Infloww et MyPulse, nettes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-0.5 rounded-xl border bg-card/70 p-1">
            {PERIODS.map(([k, l]) => (
              <button key={k} onClick={() => setP(k)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors", p === k ? "bg-primary text-white" : "text-muted hover:text-fg")}>
                {l}
              </button>
            ))}
          </div>
          {p === "custom" ? (
            <div className="flex items-center gap-1.5">
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} className="h-9 rounded-lg border bg-card px-2.5 text-sm" />
              <span className="text-muted">→</span>
              <input type="date" value={custom.to} min={custom.from} max={parisDay(Date.now())} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} className="h-9 rounded-lg border bg-card px-2.5 text-sm" />
            </div>
          ) : null}
          <button onClick={() => (loadRev(), loadLive())} disabled={busy} title="Actualiser" className="grid size-9 place-items-center rounded-xl border bg-card text-muted hover:text-fg">
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          </button>
        </div>
      </div>

      {err ? <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">{err}</p> : null}
      {rev?.unmapped.length && !model ? (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {rev.unmapped.map((id) => byId.get(id)?.name ?? id).join(", ")} : pas encore reliée(s) à Infloww / MyPulse.{" "}
          <Link href="/app/reglages" className="font-semibold underline">
            Relier
          </Link>
        </p>
      ) : null}

      {/* Les chiffres clés */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card relative col-span-2 flex flex-col overflow-hidden rounded-2xl border bg-card p-5 lg:row-span-2">
          <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full opacity-25 blur-3xl" style={{ backgroundImage: "var(--grad)" }} />
          <p className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Wallet className="size-4 text-primary-soft" /> Chiffre d’affaires net
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-3">
            <p className="text-4xl font-extrabold tracking-tight tabular-nums md:text-5xl">{rev ? eur(rev.total, 0) : "—"}</p>
            {delta != null && isFinite(delta) ? (
              <span className={cn("mb-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums", delta >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {Math.abs(delta).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % {p === "today" ? "vs hier" : "vs avant"}
              </span>
            ) : null}
          </div>
          {rev?.provisional ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
              <Clock className="size-3.5" /> dont {eur(rev.provisional, 0)} en attente de confirmation
            </p>
          ) : null}
          {series.length > 1 ? (
            <ChartContainer config={{ total: { label: "Chiffre", color: "var(--color-primary)" } }} className="mt-auto h-20 pt-3">
              <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="kpi-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--color-primary)" stopOpacity={0.45} />
                    <stop offset="1" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area dataKey="total" type="monotone" stroke="var(--color-primary)" strokeWidth={2} fill="url(#kpi-spark)" isAnimationActive={false} />
              </AreaChart>
            </ChartContainer>
          ) : null}
        </div>
        <Kpi icon={ShoppingBag} label="Ventes" value={rev ? num(rev.sales) : "—"} sub={rev ? `panier moyen ${eur(basket, 0)}` : undefined} />
        <Kpi icon={Users} label="Fans acheteurs" value={rev ? num(rev.buyers) : "—"} sub={rev && rev.buyers ? `${eur(rev.total / rev.buyers, 0)} par fan` : undefined} />
        {model ? null : (
          <Kpi
            icon={Sparkles}
            label="Fait par l’IA Substy"
            value={rev ? eur(substy, 0) : "—"}
            sub={rev ? `${rev.total ? Math.round((substy / rev.total) * 100) : 0} % du chiffre${rev.ai ? ` · ${rev.ai.ppvPaid}/${rev.ai.ppvSent} PPV achetés` : ""}` : undefined}
            accent
          />
        )}
        <Kpi icon={Wallet} label="OnlyFans · MYM" value={rev ? `${short(ofEur / 100)} · ${short(mymEur / 100)}` : "—"} sub="en euros" />
      </div>

      {/* Courbe */}
      <section className="card rounded-2xl border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">Évolution du chiffre</h2>
          <div className="ml-auto">
            <ChartContainer config={AREA} className="hidden">
              <AreaChart data={[]} />
            </ChartContainer>
            <Legend config={AREA} />
          </div>
        </div>
        {series.length ? (
          <ChartContainer config={AREA} className="h-[280px]">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                {Object.keys(AREA).map((k) => (
                  <linearGradient key={k} id={`evo-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={`var(--color-${k})`} stopOpacity={0.5} />
                    <stop offset="1" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 6" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} />
              <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={short} />
              <ChartTooltip cursor={{ stroke: "var(--color-line)" }} content={<ChartTooltipContent format={euros} total />} />
              <Area dataKey="mym" type="monotone" stackId="a" stroke="var(--color-mym)" strokeWidth={2} fill="url(#evo-mym)" isAnimationActive={false} />
              <Area dataKey="onlyfans" type="monotone" stackId="a" stroke="var(--color-onlyfans)" strokeWidth={2} fill="url(#evo-onlyfans)" isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="py-20 text-center text-sm text-muted">{rev ? "Aucune vente sur la période" : "Chargement…"}</p>
        )}
      </section>

      {/* L'IA de Substy : ses ventes et son travail sur la période (chiffres de Substy). */}
      {!model && rev?.ai ? (
        <section className="card rounded-2xl border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-white">
              <Sparkles className="size-4" />
            </span>
            <div className="mr-auto">
              <h2 className="text-lg font-bold">IA Substy</h2>
              <p className="text-xs text-muted">Ce que l’IA a vendu et envoyé sur la période, d’après Substy.</p>
            </div>
            <Legend config={{ ai: { label: "IA", color: "var(--color-primary)" }, employee: { label: "Équipe", color: "color-mix(in oklab, var(--color-primary) 40%, var(--color-card))" } }} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="grid grid-cols-2 gap-2 self-start">
              {(
                [
                  ["Ventes nettes", eur(rev.ai.net, 0)],
                  ["Pourboires", eur(rev.ai.tips, 0)],
                  ["PPV achetés", `${num(rev.ai.ppvPaid)} / ${num(rev.ai.ppvSent)}`],
                  ["Taux de déblocage", `${Math.round(rev.ai.unlockRate * 100)} %`],
                  ["Messages envoyés", num(rev.ai.messages)],
                  ["Par PPV acheté", rev.ai.ppvPaid ? eur(rev.ai.net / rev.ai.ppvPaid, 0) : "—"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl border bg-card-2/50 px-3 py-2">
                  <p className="text-[11px] text-muted">{k}</p>
                  <p className="text-lg font-bold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {aiDays.length > 1 ? (
              <ChartContainer config={{ ai: { label: "IA", color: "var(--color-primary)" }, employee: { label: "Équipe", color: "color-mix(in oklab, var(--color-primary) 40%, var(--color-card))" } }} className="h-[220px]">
                <AreaChart data={aiDays} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="ai-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--color-ai)" stopOpacity={0.45} />
                      <stop offset="1" stopColor="var(--color-ai)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 6" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} />
                  <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={short} />
                  <ChartTooltip cursor={{ stroke: "var(--color-line)" }} content={<ChartTooltipContent format={euros} />} />
                  <Area dataKey="employee" type="monotone" stroke="var(--color-employee)" strokeWidth={1.5} fill="transparent" isAnimationActive={false} />
                  <Area dataKey="ai" type="monotone" stroke="var(--color-ai)" strokeWidth={2} fill="url(#ai-fill)" isAnimationActive={false} />
                </AreaChart>
              </ChartContainer>
            ) : (
              <p className="grid place-items-center text-sm text-muted">Choisis au moins 2 jours pour voir la courbe.</p>
            )}
          </div>
        </section>
      ) : null}

      {/* D'où vient l'argent + par type de vente */}
      {!model ? (
        <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          <section className="card rounded-2xl border bg-card p-5">
            <h2 className="text-lg font-bold">D’où vient l’argent</h2>
            <p className="text-xs text-muted">Qui a fait chaque vente : l’IA, l’équipe dans Bloom, les chatteurs Infloww / MyPulse…</p>
            {origins.length ? (
              <div className="mt-3 grid items-center gap-4 sm:grid-cols-[200px_1fr]">
                <ChartContainer config={Object.fromEntries(origins.map((o) => [o.k, { label: o.label, color: o.color }]))} className="h-[200px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent format={euros} />} />
                    <Pie data={origins} dataKey="value" nameKey="k" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {origins.map((o) => (
                        <Cell key={o.k} fill={o.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-col gap-2">
                  {origins.map((o) => {
                    const total = origins.reduce((a, x) => a + x.value, 0) || 1;
                    return (
                      <div key={o.k} className="flex items-center gap-2.5 text-sm">
                        <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: o.color }} />
                        <span className="min-w-0 flex-1 truncate text-muted">{o.label}</span>
                        <span className="text-xs text-muted tabular-nums">{Math.round((o.value / total) * 100)} %</span>
                        <b className="w-20 text-right tabular-nums">{euros(o.value)}</b>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted">{rev ? "Aucune vente sur la période" : "Chargement…"}</p>
            )}
          </section>
          <section className="card rounded-2xl border bg-card p-5">
            <h2 className="text-lg font-bold">Par type de vente</h2>
            <p className="text-xs text-muted">PPV, pourboires, abonnements, posts.</p>
            {types.length ? (
              <ChartContainer config={Object.fromEntries(types.map((t) => [t.k, { label: t.label, color: t.color }]))} className="mt-3 h-[200px]">
                <BarChart data={types} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" width={92} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={{ fill: "rgb(255 255 255 / 0.04)" }} content={<ChartTooltipContent format={euros} labelKey="label" />} />
                  <Bar dataKey="value" radius={8} barSize={22} isAnimationActive={false}>
                    {types.map((t) => (
                      <Cell key={t.k} fill={t.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted">{rev ? "Aucune vente sur la période" : "Chargement…"}</p>
            )}
          </section>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        {/* Classement des créatrices */}
        <section className="card rounded-2xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-bold">Créatrices</h2>
            <span className="text-xs text-muted">classées par chiffre</span>
          </div>
          <div className="flex flex-col gap-1">
            {ranked.map(({ c, r, l }, i) => {
              const unmapped = rev?.unmapped.includes(c.id);
              const mymC = /mym/i.test(c.platform || "");
              const d = r ? pctChange(r.eur, r.prev) : null;
              return (
                <div key={c.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.03]">
                  <span className={cn("w-5 text-center text-xs font-bold tabular-nums", i < 3 ? "text-primary-soft" : "text-muted")}>{i + 1}</span>
                  <Avatar src={c.avatar} name={c.name} size="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      {c.name} <PlatformBadge c={c} />
                      {l && !model ? <span className={cn("size-1.5 rounded-full", l.live ? "bg-emerald-400" : "bg-amber-400")} title={l.live ? "en direct" : "connexion…"} /> : null}
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card-2">
                      <div className="h-full rounded-full" style={{ width: `${((r?.eur || 0) / topEur) * 100}%`, backgroundImage: "var(--grad)" }} />
                    </div>
                  </div>
                  {!model ? (
                    // Colonnes de largeur fixe : les barres ont toutes la même longueur. Un clic ouvre ces conversations.
                    <div className="hidden shrink-0 items-center text-xs sm:flex">
                      <Link href={`/app/messagerie?model=${encodeURIComponent(c.id)}&only=unread`} className="w-[78px] rounded-md px-1.5 py-1 text-right text-muted hover:bg-white/[0.05] hover:text-fg" title="Ouvrir les messages non lus">
                        <b className="text-fg tabular-nums">{count(l?.unread)}</b> non lus
                      </Link>
                      <Link href={`/app/messagerie?model=${encodeURIComponent(c.id)}&only=handoff`} className="w-[104px] rounded-md px-1.5 py-1 text-right text-muted hover:bg-white/[0.05] hover:text-fg" title="Ouvrir les conversations où l’IA a passé la main">
                        <b className="text-amber-300 tabular-nums">{count(l?.handoff)}</b> à reprendre
                      </Link>
                      <span className="w-[96px] px-1.5 text-right text-muted" title="Vendu par l’IA de Substy (chiffre de Substy)">
                        {rev?.ai?.perCreator[c.id]?.net ? (
                          <>
                            <b className="text-fg tabular-nums">{eur(rev.ai.perCreator[c.id].net, 0)}</b> par l’IA
                          </>
                        ) : (
                          <span className="opacity-50">— par l’IA</span>
                        )}
                      </span>
                    </div>
                  ) : null}
                  <div className="w-28 text-right">
                    <p className="text-sm font-bold tabular-nums">{unmapped ? <span className="text-xs font-semibold text-amber-300">pas reliée</span> : r ? moneyC(r.net, r.currency, 0) : rev ? moneyC(0, mymC ? "EUR" : "USD", 0) : "—"}</p>
                    {d != null && isFinite(d) ? (
                      <p className={cn("text-[11px] font-semibold tabular-nums", d >= 0 ? "text-emerald-300" : "text-rose-300")}>
                        {d >= 0 ? "+" : ""}
                        {Math.round(d)} %
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted">{r?.sales ? `${r.sales} ventes` : " "}</p>
                    )}
                  </div>
                  {!model ? (
                    <Link href={inboxLink(c.id)} title="Ouvrir la messagerie" className="grid size-8 place-items-center rounded-lg text-muted opacity-0 group-hover:opacity-100 hover:bg-card-2 hover:text-fg">
                      <ArrowUpRight className="size-4" />
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* Dernières ventes */}
        <section className="card rounded-2xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-bold">Dernières ventes</h2>
            <span className="pulse-dot size-2 rounded-full bg-emerald-400" title="Mis à jour en continu" />
          </div>
          <ol className="scroll-thin flex max-h-[460px] flex-col gap-1 overflow-y-auto">
            {(rev?.recent ?? []).map((s) => {
              const Icon = SALE_ICON[s.type] ?? Gift;
              const o = ORIGINS.find((x) => x.k === s.origin);
              const body = (
                <span className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-soft">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {s.fan ?? "Fan"} <span className="font-normal text-muted">· {TYPE_LABEL[s.type] ?? s.type}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      {byId.get(s.creatorId)?.name ?? ""} · {when(s.at)}
                      {o && !model ? <span>· {s.by ? s.by : o.label}</span> : null}
                      {s.provisional ? <Pill tone="warn">en attente</Pill> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{moneyC(s.net, s.currency)}</span>
                </span>
              );
              return (
                <li key={s.id}>
                  {s.fanId && !model ? (
                    <Link href={inboxLink(s.creatorId, s.fanId)} className="block rounded-xl px-2 py-2 hover:bg-white/[0.03]">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-2 py-2">{body}</div>
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

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: typeof Wallet; label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("card rounded-2xl border bg-card p-4", accent && "border-primary/30")}>
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span className={cn("grid size-7 place-items-center rounded-lg", accent ? "bg-primary text-white" : "bg-card-2 text-primary-soft")}>
          <Icon className="size-3.5" />
        </span>
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

/** Légende d'un graphique (même pastilles que ChartLegendContent, hors du conteneur). */
function Legend({ config }: { config: ChartConfig }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {Object.entries(config).map(([k, v]) => (
        <span key={k} className="flex items-center gap-1.5 text-muted">
          <span className="size-2.5 rounded-[3px]" style={{ background: v.color }} />
          {v.label}
        </span>
      ))}
    </div>
  );
}

export { ChartLegendContent };
