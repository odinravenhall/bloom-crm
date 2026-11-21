"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Clock, Gift, Image as ImageIcon, Lock, RefreshCw, Sparkles, UserRound, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn, eur, hhmm, moneyC, num, when } from "@/lib/fmt";
import { useCreators } from "@/lib/creators";
import type { Count, Dashboard as Live, RevenueR } from "@/lib/types";
import { Avatar, Card, Page, PageHeader, Pill, Segmented, Stat, btnCls } from "@/components/ui";
import { DeltaPct, StackBars, pctChange } from "@/components/charts";

type P = "today" | "yesterday" | "7d" | "30d" | "month" | "year" | "custom";
const PERIODS: [P, string][] = [
  ["today", "Aujourd’hui"],
  ["yesterday", "Hier"],
  ["7d", "7 jours"],
  ["30d", "30 jours"],
  ["month", "Ce mois"],
  ["year", "1 an"],
  ["custom", "Dates"],
];
const parisDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const minus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86400e3).toISOString().slice(0, 10);
function range(p: P, custom: { from: string; to: string }) {
  const today = parisDay(Date.now());
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: minus(today, 1), to: minus(today, 1) };
    case "7d":
      return { from: minus(today, 6), to: today };
    case "30d":
      return { from: minus(today, 29), to: today };
    case "month":
      return { from: today.slice(0, 8) + "01", to: today };
    case "year":
      return { from: minus(today, 364), to: today };
    default:
      return custom;
  }
}

// D'où vient l'argent (ordre d'affichage).
const ORIGINS: [string, string, string, typeof Bot][] = [
  ["ai", "IA Substy", "var(--chart-1)", Bot],
  ["bloom", "Chatteurs dans Bloom", "var(--chart-2)", UserRound],
  ["substy", "Automatisations Substy", "var(--chart-5)", Sparkles],
  ["chatter", "Chatteurs Infloww / MyPulse", "var(--chart-3)", Users],
  ["sub", "Abonnements", "var(--chart-4)", Gift],
  ["other", "Autres ventes", "var(--chart-7)", ImageIcon],
];
const TYPES: Record<string, string> = { ppv: "PPV / messages", tip: "Pourboires", sub: "Abonnements", post: "Posts", stream: "Lives", other: "Autre" };
const SALE_ICON: Record<string, typeof Lock> = { ppv: Lock, tip: Gift, post: ImageIcon, sub: UserRound };
const count = (c: Count | undefined) => (c?.n == null ? "—" : `${c.n}${c.more ? "+" : ""}`);
const inbox = (creatorId: string, extra = "") => `/app/messagerie?c=${encodeURIComponent(creatorId)}${extra}`;

export function Dashboard() {
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
      const r = await api<RevenueR>("GET", `/api/revenue?from=${from}&to=${to}`);
      setRev(r);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [from, to]);
  const loadLive = useCallback(() => api<Live>("GET", "/api/dashboard").then(setLive).catch(() => {}), []);
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
  const delta = rev ? pctChange(rev.total, rev.prev) : null;
  const vs = p === "today" ? "vs hier" : p === "yesterday" ? "vs avant-hier" : "vs période d’avant";
  const of = rev?.creators.filter((c) => c.platform === "onlyfans") ?? [];
  const mym = rev?.creators.filter((c) => c.platform === "mym") ?? [];
  const sum = (l: typeof of, k: "net" | "eur") => l.reduce((a, c) => a + c[k], 0);
  const substy = rev ? (rev.byOrigin.ai || 0) + (rev.byOrigin.bloom || 0) + (rev.byOrigin.substy || 0) : 0;
  const official = rev ? rev.total - rev.provisional : 0;

  // Graphique : par jour, ou par mois au-delà de 3 mois.
  const chart = useMemo(() => {
    if (!rev) return [];
    const byMonth = rev.days.length > 92;
    const m = new Map<string, { label: string; onlyfans: number; mym: number; provisional: number }>();
    for (const d of rev.days) {
      const key = byMonth ? d.day.slice(0, 7) : d.day;
      const label = byMonth
        ? new Date(d.day + "T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
        : new Date(d.day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      const x = m.get(key) ?? { label, onlyfans: 0, mym: 0, provisional: 0 };
      x.onlyfans += d.onlyfans / 100;
      x.mym += d.mym / 100;
      x.provisional += d.provisional / 100;
      m.set(key, x);
    }
    return [...m.values()];
  }, [rev]);

  return (
    <Page>
      <PageHeader
        eyebrow="Vue d’ensemble"
        title="Tableau de bord"
        sub={rev ? `Ventes réelles Infloww (OnlyFans) et MyPulse (MYM), nettes, en euros · mis à jour à ${hhmm(Date.now())}` : "Chargement des chiffres…"}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<P> value={p} onChange={setP} options={PERIODS} />
          {p === "custom" ? (
            <div className="flex items-center gap-1.5 rounded-xl border bg-card/80 p-1 backdrop-blur">
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} className="h-8 rounded-lg bg-card-2 px-2 text-sm [color-scheme:dark]" />
              <span className="text-muted">→</span>
              <input type="date" value={custom.to} min={custom.from} max={parisDay(Date.now())} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} className="h-8 rounded-lg bg-card-2 px-2 text-sm [color-scheme:dark]" />
            </div>
          ) : null}
          <button className={btnCls.secondary} onClick={() => (loadRev(), loadLive())} disabled={busy} title="Actualiser">
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          </button>
        </div>
      </PageHeader>

      {err ? <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">{err}</p> : null}
      {rev?.unmapped.length ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {rev.unmapped.map((id) => byId.get(id)?.name ?? id).join(", ")} : pas encore reliée(s) à Infloww / MyPulse, donc pas comptée(s).{" "}
          <Link href="/app/reglages" className="font-semibold underline">
            Relier
          </Link>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat i={0} accent label="Chiffre d’affaires net" value={rev ? eur(rev.total, 0) : "—"} sub={rev ? <DeltaPct v={delta} suffix={vs} /> : null} />
        <Stat i={1} label="OnlyFans" value={rev ? moneyC(sum(of, "net"), "USD", 0) : "—"} sub={rev ? `${eur(sum(of, "eur"), 0)} · Infloww` : null} />
        <Stat i={2} label="MYM" value={rev ? eur(sum(mym, "net"), 0) : "—"} sub={rev ? "MyPulse" : null} />
        <Stat i={3} label="Rapporté par Substy" value={rev ? eur(substy, 0) : "—"} sub={rev && rev.total ? `${Math.round((substy / rev.total) * 100)} % du total` : null} />
        <Stat i={4} label="Ventes" value={rev ? num(rev.sales) : "—"} sub={rev ? `${num(rev.buyers)} fans acheteurs` : null} />
        <Stat
          i={5}
          label="En attente de confirmation"
          value={rev ? eur(rev.provisional, 0) : "—"}
          sub={rev ? (rev.provisional ? "vu chez Substy, pas encore chez Infloww / MyPulse" : "tout est confirmé") : null}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Card title="Chiffre d’affaires" action={rev ? <span className="text-sm font-bold tabular-nums">{eur(rev.total, 0)}</span> : null}>
          {chart.length ? (
            <StackBars
              data={chart}
              format={(v) => `${Math.round(v).toLocaleString("fr-FR")} €`}
              series={[
                { key: "onlyfans", label: "OnlyFans", color: "var(--chart-1)" },
                { key: "mym", label: "MYM", color: "var(--chart-2)" },
                ...(rev?.provisional ? [{ key: "provisional", label: "En attente", color: "var(--chart-7)" }] : []),
              ]}
            />
          ) : (
            <p className="py-16 text-center text-sm text-muted">{rev ? "Aucune vente" : "Chargement…"}</p>
          )}
        </Card>
        <Card title="D’où vient l’argent">
          <div className="flex flex-col gap-2.5">
            {ORIGINS.filter(([k]) => rev?.byOrigin[k]).map(([k, label, color, Icon]) => {
              const v = rev!.byOrigin[k] || 0;
              const share = official ? v / Math.max(1, official) : 0;
              return (
                <div key={k}>
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="size-4 text-muted" />
                    <span className="flex-1">{label}</span>
                    <b className="tabular-nums">{eur(v, 0)}</b>
                    <span className="w-10 text-right text-xs text-muted tabular-nums">{Math.round(share * 100)} %</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card-2">
                    <div className="bar-grow h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: color }} />
                  </div>
                </div>
              );
            })}
            {rev && !Object.keys(rev.byOrigin).length ? <p className="text-sm text-muted">Aucune vente sur la période.</p> : null}
            <p className="mt-1 text-xs text-muted">
              « IA Substy » et « Chatteurs dans Bloom » : PPV envoyés par l’IA ou depuis Bloom, puis achetés (Bloom connaît l’expéditeur depuis son arrivée). Les ventes plus anciennes gardent l’attribution d’Infloww / MyPulse ; sans chatteur, elles sont dans « Autres ventes ».
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div>
          <h2 className="mb-3 text-lg">Créatrices</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {creators.map((c, i) => {
              const r = rev?.creators.find((x) => x.creatorId === c.id);
              const l = live?.creators.find((x) => x.id === c.id);
              const unmapped = rev?.unmapped.includes(c.id);
              return (
                <section key={c.id} className="card rise flex min-w-0 flex-col gap-3 rounded-(--radius-card) border bg-card/80 p-5 backdrop-blur" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-center gap-3">
                    <Avatar src={c.avatar} name={c.name} size="size-11" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{c.name}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                        <span className={cn("size-2 rounded-full", l?.live ? "bg-emerald-400" : "bg-amber-400")} />
                        {/mym/i.test(c.platform || "") ? "MYM" : "OnlyFans"} · {l?.live ? "en direct" : "temps réel en connexion"}
                      </p>
                    </div>
                    {c.ai === false ? <Pill>IA off</Pill> : c.ai ? <Pill tone="accent">IA</Pill> : null}
                  </div>
                  {unmapped ? (
                    <p className="text-sm text-amber-200">Pas encore reliée à Infloww / MyPulse.</p>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-2xl font-extrabold tabular-nums">{r ? moneyC(r.net, r.currency, 0) : rev ? moneyC(0, /mym/i.test(c.platform || "") ? "EUR" : "USD", 0) : "—"}</span>
                      {r ? <DeltaPct v={pctChange(r.eur, r.prev)} /> : null}
                      {r?.provisional ? <Pill tone="warn">+ {eur(r.provisional, 0)} en attente</Pill> : null}
                    </div>
                  )}
                  {r ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(r.byType)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => (
                          <Pill key={k}>
                            {TYPES[k] ?? k} {eur(v, 0)}
                          </Pill>
                        ))}
                      <Pill tone="good">{r.sales} ventes</Pill>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["todo", "non lues", l?.unread, "text-primary-soft"],
                        ["todo", "à reprendre", l?.handoff, "text-amber-300"],
                        ["all", "IA coupée", l?.aiOff, "text-fg"],
                      ] as const
                    ).map(([f, label, v, tone]) => (
                      <Link key={label} href={inbox(c.id, `&f=${f}`)} className="rounded-xl border bg-card-2/60 px-3 py-2 transition-colors hover:border-primary/50">
                        <span className={cn("block text-xl font-extrabold tabular-nums", tone)}>{count(v)}</span>
                        <span className="text-[11px] text-muted">{label}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        <Card
          title={
            <span className="flex items-center gap-2">
              Dernières ventes <span className="pulse-dot size-2 rounded-full bg-primary" />
            </span>
          }
        >
          <div className="scroll-thin -mx-2 flex max-h-[560px] flex-col overflow-y-auto">
            {(rev?.recent ?? []).map((s) => {
              const Icon = SALE_ICON[s.type] ?? Gift;
              const o = ORIGINS.find(([k]) => k === s.origin);
              const row = (
                <>
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-soft">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {TYPES[s.type] ?? s.type}
                      {s.fan ? <span className="text-muted"> · {s.fan}</span> : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
                      {byId.get(s.creatorId)?.name ?? ""} · {when(s.at)}
                      {o ? <Pill className="ml-1">{s.by ? `${o[1].replace(/s$/, "")} : ${s.by}` : o[1]}</Pill> : null}
                      {s.provisional ? (
                        <Pill tone="warn">
                          <Clock className="size-3" /> en attente
                        </Pill>
                      ) : null}
                    </span>
                  </span>
                  <span className="text-sm font-extrabold text-emerald-300 tabular-nums">{moneyC(s.net, s.currency)}</span>
                </>
              );
              return s.fanId ? (
                <Link key={s.id} href={inbox(s.creatorId, `&fan=${encodeURIComponent(s.fanId)}`)} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                  {row}
                </Link>
              ) : (
                <div key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  {row}
                </div>
              );
            })}
            {rev && !rev.recent.length ? <p className="py-10 text-center text-sm text-muted">Aucune vente sur la période</p> : null}
          </div>
        </Card>
      </div>
    </Page>
  );
}
