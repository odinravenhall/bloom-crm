"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bot, Gift, Image as ImageIcon, Lock, MessageCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { cn, hhmm, num, usd, when } from "@/lib/fmt";
import { okRev, type Count, type Dashboard as Dash, type Sale } from "@/lib/types";
import { Avatar, Card, Page, PageHeader, Pill, Segmented, Stat, btnCls } from "@/components/ui";
import { DayBars, DeltaPct } from "@/components/charts";

type Period = "today" | "7d" | "30d";
const VS: Record<Period, string> = { today: "vs hier", "7d": "vs 7 j d’avant", "30d": "vs 30 j d’avant" };
const SALE: Record<string, [typeof Lock, string]> = { ppv: [Lock, "PPV acheté"], tip: [Gift, "Pourboire"], post: [ImageIcon, "Post acheté"] };
const count = (c: Count | undefined) => (c?.n == null ? "—" : `${c.n}${c.more ? "+" : ""}`);
const inbox = (creatorId: string, extra = "") => `/app/messagerie?c=${encodeURIComponent(creatorId)}${extra}`;

export function Dashboard() {
  const [period, setPeriod] = useState<Period>("today");
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p: Period) => {
    setBusy(true);
    try {
      const r = await api<Dash>("GET", `/api/dashboard?period=${p}`);
      if (r.period === p) setD(r);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load(period);
    const t = setInterval(() => document.visibilityState === "visible" && load(period), 60_000);
    return () => clearInterval(t);
  }, [period, load]);

  // Ventes en direct : rafraîchies toutes les 30 s.
  const [sales, setSales] = useState<Sale[] | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") api<Sale[]>("GET", "/api/sales").then(setSales).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  const liveSales = sales ?? d?.sales ?? [];

  const r = okRev(d?.revenue) ? d!.revenue : null;
  const sum = (k: "unread" | "handoff") => (d ? d.creators.reduce((a, c) => a + (c[k]?.n || 0), 0) : 0);
  const more = (k: "unread" | "handoff") => !!d?.creators.some((c) => c[k]?.more);
  const vs = VS[period];
  const bars = (r?.chart ?? []).map((x) => ({ label: new Date(x.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), v: x.v }));

  return (
    <Page>
      <PageHeader eyebrow="Vue d’ensemble" title="Tableau de bord" sub={d ? `Revenus Substy (net, en dollars) · mis à jour à ${hhmm(d.at)}` : "Chargement des chiffres…"}>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Period>
            value={period}
            onChange={setPeriod}
            options={[
              ["today", "Aujourd’hui"],
              ["7d", "7 jours"],
              ["30d", "30 jours"],
            ]}
          />
          <button className={btnCls.secondary} onClick={() => load(period)} disabled={busy} title="Actualiser">
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          </button>
        </div>
      </PageHeader>

      {err ? <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">{err}</p> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat i={0} accent label="Revenus" value={r ? usd(r.total.v) : "—"} sub={r ? <DeltaPct v={r.total.d} suffix={vs} /> : null} />
        <Stat i={1} label="Messages & PPV" value={r ? usd(r.messages.v) : "—"} sub={r ? <DeltaPct v={r.messages.d} /> : null} />
        <Stat i={2} label="Pourboires" value={r ? usd(r.tips.v) : "—"} sub={r ? <DeltaPct v={r.tips.d} /> : null} />
        <Stat i={3} label="Abonnements" value={r ? usd(r.subscriptions.v) : "—"} sub={r ? <DeltaPct v={r.subscriptions.d} /> : null} />
        <Stat i={4} label="Posts" value={r ? usd(r.posts.v) : "—"} sub={r ? <DeltaPct v={r.posts.d} /> : null} />
        <Stat i={5} label="Nouveaux abonnés" value={r ? num(r.newSubs.v) : "—"} sub={r ? <DeltaPct v={r.newSubs.d} /> : null} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <Card title="Revenus par jour" action={r ? <span className="text-sm font-bold tabular-nums">{usd(r.total.v)}</span> : null}>
          {bars.length ? <DayBars data={bars} format={(v) => usd(v, 0)} /> : <p className="py-16 text-center text-sm text-muted">{d ? "Pas de données" : "Chargement…"}</p>}
        </Card>
        <Card
          title={
            <span className="flex items-center gap-2">
              Ventes en direct <span className="pulse-dot size-2 rounded-full bg-primary" />
            </span>
          }
        >
          <div className="scroll-thin -mx-2 flex max-h-[290px] flex-col overflow-y-auto">
            {liveSales.length ? (
              liveSales.map((s) => {
                const [Icon, label] = SALE[s.type] ?? [Gift, s.type];
                const row = (
                  <>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-soft">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {label}
                        {s.fan ? <span className="text-muted"> · {s.fan}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {s.creator} · {when(s.at)}
                      </span>
                    </span>
                    <span className="text-sm font-extrabold text-emerald-300 tabular-nums">{s.price}</span>
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
              })
            ) : (
              <p className="py-10 text-center text-sm text-muted">{d ? "Aucune vente récente" : "Chargement…"}</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Conversations non lues" value={`${sum("unread")}${more("unread") ? "+" : ""}`} sub="toutes créatrices" />
        <Stat label="À reprendre" value={`${sum("handoff")}${more("handoff") ? "+" : ""}`} sub="l’IA a passé la main" />
        <Stat label="Messages de fans" value={num(d?.creators.reduce((a, c) => a + (c.today?.fanIn || 0), 0) ?? 0)} sub="aujourd’hui, vus par Bloom" />
        <Stat label="Réponses IA / équipe" value={d ? `${d.creators.reduce((a, c) => a + (c.today?.ai || 0), 0)} / ${d.creators.reduce((a, c) => a + (c.today?.team || 0), 0)}` : "—"} sub="aujourd’hui" />
      </div>

      <div>
        <h2 className="mb-3 text-lg">Créatrices</h2>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {(d?.creators ?? []).map((c, i) => {
            const cr = okRev(c.revenue) ? c.revenue : null;
            return (
              <section key={c.id} className="card rise flex min-w-0 flex-col gap-4 rounded-(--radius-card) border bg-card/80 p-5 backdrop-blur" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center gap-3">
                  <Avatar src={c.avatar} name={c.name} size="size-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{c.name}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                      <span className={cn("size-2 rounded-full", c.live ? "bg-emerald-400" : "bg-amber-400")} />
                      {c.live ? "en direct" : "temps réel en connexion"}
                      {c.username ? ` · @${c.username}` : ""}
                    </p>
                  </div>
                  {c.ai === false ? <Pill>IA off</Pill> : c.ai ? <Pill tone="accent">IA</Pill> : null}
                </div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-extrabold tabular-nums">{cr ? usd(cr.total.v) : "—"}</span>
                  {cr ? <DeltaPct v={cr.total.d} suffix={vs} /> : null}
                </div>
                {cr ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Pill>PPV / messages {usd(cr.messages.v)}</Pill>
                    <Pill>Pourboires {usd(cr.tips.v)}</Pill>
                    <Pill>Abonnements {usd(cr.subscriptions.v)}</Pill>
                    <Pill tone="good">{cr.newSubs.v} nouveaux abonnés</Pill>
                  </div>
                ) : null}
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["unread", "non lues", c.unread, "text-primary-soft"],
                      ["handoff", "à reprendre", c.handoff, "text-amber-300"],
                      ["ai_off", "IA coupée", c.aiOff, "text-fg"],
                    ] as const
                  ).map(([f, label, v, tone]) => (
                    <Link key={f} href={inbox(c.id, `&f=${f}`)} className="rounded-xl border bg-card-2/60 px-3 py-2 transition-colors hover:border-primary/50">
                      <span className={cn("block text-xl font-extrabold tabular-nums", tone)}>{count(v)}</span>
                      <span className="text-[11px] text-muted">{label}</span>
                    </Link>
                  ))}
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Dernières conversations</p>
                  <div className="-mx-2 flex flex-col">
                    {c.recent.length ? (
                      c.recent.map((x) => (
                        <Link key={x.fanId} href={inbox(c.id, `&fan=${encodeURIComponent(x.fanId)}`)} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/5">
                          <Avatar src={x.avatar} name={x.name} size="size-7" />
                          <span className="shrink-0 text-sm font-semibold">{x.name}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted">
                            {x.last ? (x.last.fromCreator ? "Toi : " : "") + (x.last.text || (x.last.media ? "📷 Média" : "")) : ""}
                          </span>
                          {x.unread ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-bold text-white">{x.unread}</span> : null}
                          <span className="text-[11px] text-muted">{when(x.last?.at)}</span>
                        </Link>
                      ))
                    ) : (
                      <p className="px-2 text-sm text-muted">Aucune conversation</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 border-t pt-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <MessageCircle className="size-3.5" /> {c.today?.fanIn || 0} msg de fans
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Bot className="size-3.5" /> {c.today?.ai || 0} IA
                  </span>
                  <span>·</span>
                  <span>{c.today?.team || 0} équipe</span>
                  <span>·</span>
                  <span>{c.today?.ppv || 0} PPV envoyés aujourd’hui</span>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
