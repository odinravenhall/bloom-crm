"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeEuro, BarChart3, CalendarDays, Clock, Download, Gift, Lock, Pin, RefreshCcw, Send, ShoppingBag, TrendingUp, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { download } from "@/lib/xlsx";
import { Avatar } from "@/components/ui";

// MYM → Stats → Statistiques Globales : copie de la « Vue d'ensemble » de MyPulse, sur les revenus lus chez MYM en direct
// (montants nets). Tous les comptes MYM reliés que la personne voit, ensemble ; aujourd'hui par défaut.
export type Day = { day: string; sub: number; renew: number; ppv: number; mod: number; push: number; tip: number; other: number; refund: number; total: number; nPpv: number; nTips: number; newSubs: number; renewals: number; subs: number | null; subsEst?: boolean };
export type Creator = { id: string; name: string; handle: string | null; avatar: string | null; since: number | null; days: Day[] };
export type Slot = { d: number; h: number; sum: number; n: number };
export type Data = { from: string; to: string; today: string; creators: Creator[]; slots?: Slot[]; subsSince: string | null };
export type Preset = "today" | "yesterday" | "7" | "30" | "month" | "prev" | "year" | "custom";
export const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
/** Une couleur par modèle (courbes, anneau autour de la photo). */
export const PALETTE = ["#c7ff4a", "#1fe0b3", "#7b8fd4", "#f7b84b", "#ff5c8a", "#22d3ee", "#f1734f", "#8b5cf6"];
export const LIME = { background: "var(--mp-accent)", color: "var(--mp-on-accent)" };
export const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ")} €`;
export const int = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
export const parisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
export const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const fr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");
export const long = (d: string) => {
  const s = new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return s[0].toUpperCase() + s.slice(1);
};
export function range(p: Preset, today: string): [string, string] {
  if (p === "yesterday") return [addDay(today, -1), addDay(today, -1)];
  if (p === "7") return [addDay(today, -6), today];
  if (p === "30") return [addDay(today, -29), today];
  if (p === "month") return [`${today.slice(0, 8)}01`, today];
  if (p === "prev") {
    const end = addDay(`${today.slice(0, 8)}01`, -1);
    return [`${end.slice(0, 8)}01`, end];
  }
  if (p === "year") return [`${today.slice(0, 4)}-01-01`, today];
  return [today, today];
}

export function MymStats() {
  const [preset, setPreset] = useState<Preset>("today");
  const [[from, to], setDates] = useState<[string, string]>(() => range("today", parisToday()));
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const [hs, setHs] = useState<number | null>(null);
  useEffect(() => {
    let dead = false;
    const load = () => api<Data>("GET", `/api/mym/stats?from=${from}&to=${to}`).then((r) => !dead && (setD(r), setErr(""))).catch((e) => !dead && setErr((e as Error).message));
    setPin(null);
    setHover(null);
    load();
    // La période contient aujourd'hui : les chiffres se rafraîchissent tout seuls.
    const t = to >= parisToday() ? setInterval(load, 60_000) : null;
    return () => {
      dead = true;
      if (t) clearInterval(t);
    };
  }, [from, to]);
  const pick = (p: Preset) => (setPreset(p), setDates(range(p, parisToday())));
  const days = useMemo(() => {
    const n = d?.creators[0]?.days.length ?? 0;
    return Array.from({ length: n }, (_, i) => {
      const rows = d!.creators.map((c) => c.days[i]);
      const sum = (k: keyof Day) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      const known = rows.filter((r) => r.subs != null);
      return { day: rows[0].day, total: sum("total"), sub: sum("sub"), renew: sum("renew"), ppv: sum("ppv"), mod: sum("mod"), push: sum("push"), tip: sum("tip"), other: sum("other"), refund: sum("refund"), newSubs: sum("newSubs"), renewals: sum("renewals"), subs: known.length === rows.length && rows.length ? sum("subs") : null, subsEst: rows.some((r) => r.subsEst) };
    });
  }, [d]);
  const T = useMemo(() => {
    const s = (k: "total" | "sub" | "renew" | "ppv" | "mod" | "push" | "tip" | "other" | "refund" | "newSubs" | "renewals") => days.reduce((a, x) => a + x[k], 0);
    return { total: s("total"), sub: s("sub"), renew: s("renew"), ppv: s("ppv"), mod: s("mod"), push: s("push"), tip: s("tip"), other: s("other"), refund: s("refund"), newSubs: s("newSubs"), renewals: s("renewals") };
  }, [days]);
  const shown = pin ?? hover;
  const exportCsv = () => {
    if (!d) return;
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    const q = (s: string) => `"${s}"`;
    const head = ["Date", "Créateur", "Plateforme", "Devise", q("CA abonnements NET"), q("CA PPV + Push + MoD NET"), q("CA pourboires NET"), q("CA autres NET"), q("CA total NET"), q("Nb ventes PPV"), q("Nb pourboires"), q("Nouveaux abonnés"), "Renouvellements", q("Total abonnés"), q("LTV du jour")].join(";");
    const lines = d.creators.flatMap((c) => c.days.map((x) => [fr(x.day), c.name, "MYM", "EUR", n(x.sub + x.renew), n(x.ppv + x.push + x.mod), n(x.tip), n(x.other), n(x.total), x.nPpv, x.nTips, x.newSubs, x.renewals, x.subs ?? "", n(x.newSubs ? x.total / x.newSubs : 0)].join(";")));
    download(new Blob([`﻿${[head, ...lines].join("\n")}\n`], { type: "text/csv;charset=utf-8" }), `bloom_mym_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.csv`);
  };
  const lastSubs = [...days].reverse().find((x) => x.subs != null)?.subs ?? null;
  const cats: [string, number, React.ReactNode][] = [["Abonnement", T.sub, <UserPlus key="a" className="size-4" />], ["Renouvellement", T.renew, <RefreshCcw key="b" className="size-4" />], ["Média privé", T.ppv, <Lock key="c" className="size-4" />], ["Media On Demand", T.mod, <ShoppingBag key="d" className="size-4" />], ["Médias push", T.push, <Send key="e" className="size-4" />], ["Pourboires", T.tip, <Gift key="f" className="size-4" />], ["Autres", T.other, <BadgeEuro key="g" className="size-4" />]];
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="relative flex flex-wrap items-end gap-4 overflow-hidden rounded-2xl p-6" style={{ background: "radial-gradient(70% 140% at 85% 0%, rgba(199,255,74,.13), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.25)" }}>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Tableau de bord</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>Vue d’ensemble</h1>
          <p className="mt-1 text-[13px]">Suivi de vos performances et revenus en temps réel.</p>
          <p className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold" style={{ color: "var(--mp-head)" }}>
            <span className="flex h-7 items-center gap-1.5 rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}><Users className="size-3.5" style={{ color: "var(--mp-accent)" }} /> {d?.creators.length ?? "…"} créateur{(d?.creators.length ?? 0) > 1 ? "s" : ""} suivi{(d?.creators.length ?? 0) > 1 ? "s" : ""}</span>
            <span className="flex h-7 items-center rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}>MYM</span>
          </p>
        </div>
        <button onClick={exportCsv} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "#3d4a2c", color: "var(--mp-head)" }}><Download className="size-4" /> Export CSV</button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-xl p-1 text-[12.5px] font-medium" style={card}>
          {([["today", "Auj."], ["yesterday", "Hier"], ["7", "7j"], ["30", "30j"], ["month", "Mois"], ["prev", "M-1"], ["year", "Année"]] as [Preset, string][]).map(([k, l]) => <button key={k} onClick={() => pick(k)} className="rounded-lg px-3 py-1.5" style={preset === k ? { ...LIME, fontWeight: 700 } : undefined}>{l}</button>)}
        </div>
        <label className="flex h-[38px] items-center gap-2 rounded-xl px-3 text-[13px]" style={card}>
          <CalendarDays className="size-4" style={{ color: "var(--mp-accent)" }} />
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && (setPreset("custom"), setDates([e.target.value, to < e.target.value ? e.target.value : to]))} className="bg-transparent outline-none" style={{ colorScheme: "dark", color: "var(--mp-head)" }} />
          →
          <input type="date" value={to} min={from} max={parisToday()} onChange={(e) => e.target.value && (setPreset("custom"), setDates([from > e.target.value ? e.target.value : from, e.target.value]))} className="bg-transparent outline-none" style={{ colorScheme: "dark", color: "var(--mp-head)" }} />
        </label>
        <span className="flex-1" />
        <span className="rounded-xl px-3 py-2 text-[12.5px] font-bold" style={LIME} title="MYM ne donne que les montants nets (ce qui est crédité à la créatrice).">Net</span>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.25fr_3fr]">
        <div className="flex flex-col justify-center rounded-2xl p-6" style={{ background: "radial-gradient(90% 120% at 90% 0%, rgba(199,255,74,.2), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.3)" }}>
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-accent)" }}><TrendingUp className="size-4" /> Chiffre d’affaires</p>
          <p className="mt-2 text-[40px] leading-none font-bold" style={{ color: "var(--mp-accent)" }}>{d ? eur(T.total) : "…"}</p>
          <p className="mt-3 text-[12.5px]">Moyenne / Jour <b className="ml-1" style={{ color: "var(--mp-head)" }}>{d && days.length ? eur(T.total / days.length) : "…"}</b></p>
          {T.refund < 0 ? <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Remboursements sur la période : {eur(T.refund)} (non déduits)</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cats.map(([label, v, icon], i) => (
            <div key={label} className={`rounded-2xl p-4 ${i >= 4 ? "lg:col-span-1" : ""}`} style={card}>
              <p className="flex items-center gap-2.5 text-[11.5px] font-semibold tracking-wider uppercase"><span className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{icon}</span>{label}</p>
              <p className="mt-3 text-[19px] font-semibold" style={{ color: "var(--mp-head)" }}>{d ? eur(v) : "…"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl p-5" style={card}>
        <Head icon={<TrendingUp className="size-4" />} title="Évolution des revenus" creators={d?.creators ?? []} />
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Area points={days.map((x) => ({ label: x.day, v: x.total }))} series={d && d.creators.length > 1 ? d.creators.map((c, i) => ({ color: PALETTE[i % PALETTE.length], vals: c.days.map((x) => x.total) })) : undefined} hover={shown} pinned={pin != null} onHover={(i) => pin == null && setHover(i)} onPick={(i) => setPin(pin === i ? null : i)} fmt={(v) => eur(v)} />
          <div className="rounded-xl" style={{ background: "var(--mp-card-2)", border: "1px solid var(--mp-line)" }}>
            {shown != null && days[shown] ? (
              <>
                <p className="flex items-center justify-between border-b px-4 py-3 text-[13px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>
                  {long(days[shown].day)}
                  {pin != null ? <span className="flex items-center gap-2 text-[10.5px] font-bold uppercase" style={{ color: "var(--mp-accent)" }}><Pin className="size-3" /> Jour figé <button onClick={() => setPin(null)} className="rounded-full border px-2 py-0.5 normal-case" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Libérer</button></span> : <Pin className="size-3.5 opacity-50" />}
                </p>
                <div className="px-4 py-2">
                  {d!.creators.map((c, i) => <p key={c.id} className="flex items-center gap-2.5 py-1.5 text-[13px]">{d!.creators.length > 1 ? <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} /> : null}<Avatar src={c.avatar} name={c.name} size="size-7" /><b className="min-w-0 flex-1 truncate" style={{ color: "var(--mp-head)" }}>{c.name}</b><b style={{ color: "var(--mp-head)" }}>{eur(c.days[shown].total)}</b></p>)}
                  <p className="mt-2 border-t pt-2 text-[11.5px] leading-relaxed" style={{ borderColor: "var(--mp-line)" }}>Média privé {eur(days[shown].ppv)} · Pourboires {eur(days[shown].tip)}{days[shown].mod ? ` · MoD ${eur(days[shown].mod)}` : ""}{days[shown].push ? ` · Push ${eur(days[shown].push)}` : ""}{days[shown].sub + days[shown].renew ? ` · Abonnements ${eur(days[shown].sub + days[shown].renew)}` : ""}<br />{int(days[shown].newSubs)} nouveaux abonnés · {int(days[shown].renewals)} renouvellements</p>
                </div>
              </>
            ) : (
              <><p className="border-b px-4 py-3 text-[13px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Performance Journalière</p><p className="px-4 py-3 text-[12px]" style={{ color: "#7b8fd4" }}>Survolez la courbe pour le détail, puis cliquez sur un point pour obtenir les stats du jour (et figer la journée).</p></>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl p-5" style={card}>
        <Head icon={<UserPlus className="size-4" />} title="Nouveaux abonnés" creators={d?.creators ?? []} right={<><span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "#0ab39c33", color: "#0ab39c" }}>{int(T.newSubs)} nouveaux</span><span className="ml-1.5 rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "#f7b84b33", color: "#f7b84b" }}>{int(T.renewals)} renouv.</span></>} />
        <Bars points={days.map((x) => ({ label: x.day, v: x.newSubs, v2: x.renewals }))} />
        <p className="mt-2 text-[11.5px]" style={{ color: "#7b8fd4" }}>Nouveau = premier abonnement du fan connu de Bloom sur ce modèle. Renouv. = abonnement d’un fan déjà abonné avant (dans l’historique lu chez MYM). Abonnements gratuits compris.</p>
      </div>

      <div className="mt-4 rounded-2xl p-5" style={card}>
        <Head icon={<Users className="size-4" />} title="Total abonnés actifs" creators={d?.creators ?? []} right={hs != null && days[hs]?.subs != null ? <span className="rounded px-2 py-0.5 text-[11.5px] font-bold" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>{fr(days[hs].day)} · {int(days[hs].subs as number)}{days[hs].subsEst ? " (estimé)" : ""}{hs > 0 && days[hs - 1].subs != null ? <b className="ml-1.5" style={{ color: (days[hs].subs as number) >= (days[hs - 1].subs as number) ? "#3cd188" : "#f06548" }}>{(days[hs].subs as number) >= (days[hs - 1].subs as number) ? "▲" : "▼"}{int(Math.abs((days[hs].subs as number) - (days[hs - 1].subs as number)))}</b> : null}</span> : lastSubs != null ? <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "#40518955", color: "#7b8fd4" }}>{int(lastSubs)} actifs</span> : null} />
        {days.some((x) => x.subs != null) ? <Area points={days.map((x) => ({ label: x.day, v: x.subs }))} series={d && d.creators.length > 1 ? d.creators.map((c, i) => ({ color: PALETTE[i % PALETTE.length], vals: c.days.map((x) => x.subs) })) : undefined} hover={hs} pinned={false} onHover={setHs} onPick={() => {}} fmt={(v) => int(Math.round(v))} h={210} /> : <p className="py-10 text-center text-[13px]">Pas encore de relevé sur cette période.</p>}
        <p className="mt-2 text-[11.5px]" style={{ color: "#7b8fd4" }}>Nombre d’abonnés actifs donné par MYM, relevé par Bloom toutes les 10 minutes (dernière valeur de chaque jour){d?.subsSince ? `, depuis le ${fr(d.subsSince)}` : ""}.{days.some((x) => x.subsEst) ? " Avant cette date, la courbe est estimée : le relevé moins les nouveaux abonnés arrivés entre-temps (MYM ne donne ni l’historique ni les désabonnements, les vrais chiffres étaient donc un peu plus hauts)." : ""}</p>
      </div>

      <Slots slots={d?.slots ?? []} />

      <div className="mt-4 rounded-2xl p-5" style={card}>
        <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}><BarChart3 className="size-4" /></span><div><b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>Comparatif modèles</b><p className="text-[12px]">Performance individuelle sur la période sélectionnée</p></div></div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead><tr className="text-left text-[11px] tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>{["Modèle", "CA total", "Nouveaux subs", "Renouv.", "PPV", "Tips", "LTV / new sub", "Part du CA"].map((h, i) => <th key={h} className={`border-b px-2 py-2 font-semibold ${i && i < 7 ? "text-right" : ""}`} style={{ borderColor: "var(--mp-line)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {(d?.creators ?? []).map((c) => {
                const s = (k: "total" | "ppv" | "mod" | "push" | "tip" | "newSubs" | "renewals" | "nPpv" | "nTips") => c.days.reduce((a, x) => a + x[k], 0);
                const tot = s("total");
                const share = T.total > 0 ? (tot / T.total) * 100 : 0;
                return (
                  <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)" }}>
                    <td className="px-2 py-2.5"><span className="flex items-center gap-2.5"><Avatar src={c.avatar} name={c.name} size="size-7" /><b style={{ color: "var(--mp-head)" }}>{c.name}</b></span></td>
                    <td className="px-2 text-right font-bold" style={{ color: "var(--mp-accent)" }}>{eur(tot)}</td>
                    <td className="px-2 text-right"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#0ab39c33", color: "#0ab39c" }}>{int(s("newSubs"))}</span></td>
                    <td className="px-2 text-right"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#f7b84b33", color: "#f7b84b" }}>{int(s("renewals"))}</span></td>
                    <td className="px-2 text-right" style={{ color: "var(--mp-head)" }}><b>{eur(s("ppv") + s("mod") + s("push"))}</b> <span style={{ color: "var(--mp-muted)" }}>({int(s("nPpv"))})</span></td>
                    <td className="px-2 text-right" style={{ color: "var(--mp-head)" }}><b>{eur(s("tip"))}</b> <span style={{ color: "var(--mp-muted)" }}>({int(s("nTips"))})</span></td>
                    <td className="px-2 text-right font-bold" style={{ color: "var(--mp-head)" }}>{eur(s("newSubs") ? tot / s("newSubs") : 0)}</td>
                    <td className="px-2"><span className="flex items-center gap-2"><span className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full" style={{ background: "var(--mp-card-2)" }}><span className="block h-full rounded-full" style={{ width: `${share}%`, background: "var(--mp-accent)" }} /></span><span className="w-10 text-right text-[11.5px]">{Math.round(share)}%</span></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Revenus lus directement chez MYM (compte relié), en montants nets, jours de Paris.{d?.creators.some((c) => c.since && c.since > Date.parse(`${from}T00:00:00Z`)) ? " L’historique de Bloom ne couvre pas toute la période pour au moins un compte." : ""}</p>
    </div>
  );
}

export function Head({ icon, title, creators, right }: { icon: React.ReactNode; title: string; creators: Creator[]; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{icon}</span>
      <b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>{title}</b>
      <span className="flex border-l pl-3" style={{ borderColor: "var(--mp-line)" }}>{creators.slice(0, 8).map((c, i) => <span key={c.id} className="-ml-1.5 rounded-full first:ml-0" style={{ boxShadow: `0 0 0 2px ${creators.length > 1 ? PALETTE[i % PALETTE.length] : "var(--mp-accent)"}` }} title={c.name}><Avatar src={c.avatar} name={c.name} size="size-8" /></span>)}</span>
      <span className="flex-1" />
      {right}
    </div>
  );
}

export const W = 1000;
export const nice = (max: number) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const m = max / p;
  return (m <= 1 ? 1 : m <= 1.4 ? 1.4 : m <= 2 ? 2 : m <= 3.5 ? 3.5 : m <= 5 ? 5 : m <= 7 ? 7 : 10) * p;
};
export const ticksX = (n: number) => {
  const step = Math.max(1, Math.ceil(n / 8));
  return Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0);
};

/** Courbe lissée qui ne dépasse jamais ses points (pas de bosse ni de creux inventés entre deux jours). */
export function smooth(pts: [number, number][]) {
  const n = pts.length;
  if (!n) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / (p[0] - pts[i][0] || 1));
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (2 * m[i - 1] * m[i]) / (m[i - 1] + m[i])));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < n; i++) {
    const dx = (pts[i][0] - pts[i - 1][0]) / 3;
    d += ` C${pts[i - 1][0] + dx},${pts[i - 1][1] + t[i - 1] * dx} ${pts[i][0] - dx},${pts[i][1] - t[i] * dx} ${pts[i][0]},${pts[i][1]}`;
  }
  return d;
}

const WEEK = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const h2 = (h: number) => String(h).padStart(2, "0");
/** Meilleurs créneaux de vente : top 10 + deux cartes de chaleur (chiffre d'affaires, nombre de ventes). */
export function Slots({ slots }: { slots: Slot[] }) {
  const top = [...slots].sort((a, b) => b.sum - a.sum).slice(0, 10);
  const grid = (k: "sum" | "n", rgb: string) => {
    const max = Math.max(...slots.map((x) => x[k]), 0);
    return (
      <div className="mt-3 overflow-x-auto">
        <div className="grid min-w-[420px] gap-[3px] text-[10.5px]" style={{ gridTemplateColumns: "34px repeat(24, minmax(0, 1fr))", maxWidth: 560 }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center italic" style={{ color: "var(--mp-muted)" }}>{h % 2 ? "" : `${h}h`}</span>)}
          {WEEK.map((w, dI) => [<span key={w} className="self-center italic" style={{ color: "var(--mp-muted)" }}>{w.slice(0, 3)}</span>, ...Array.from({ length: 24 }, (_, h) => {
            const x = slots.find((z) => z.d === dI && z.h === h);
            return <span key={`${dI}-${h}`} title={x ? `${w} ${h2(h)}h–${h2(h + 1)}h : ${eur(x.sum)} · ${x.n} vente${x.n > 1 ? "s" : ""}` : `${w} ${h2(h)}h : aucune vente`} className="h-[19px] rounded-[4px]" style={{ background: x && max > 0 ? `rgba(${rgb},${0.16 + 0.84 * (x[k] / max)})` : "transparent" }} />;
          })])}
        </div>
        <p className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--mp-muted)" }}>Faible <span className="h-1.5 w-20 rounded-full" style={{ background: `linear-gradient(90deg, rgba(${rgb},.16), rgb(${rgb}))` }} /> Élevé</p>
      </div>
    );
  };
  return (
    <div className="mt-4 rounded-2xl p-5" style={card}>
      <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}><Clock className="size-4" /></span><div><b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>Meilleurs créneaux de vente</b><p className="text-[12px]">Contenu payant et pourboires sur la période, heure de Paris</p></div></div>
      {slots.length ? (
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-[11px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Top 10 créneaux</p>
            <div className="mt-2 space-y-2">
              {top.map((x, i) => (
                <p key={`${x.d}-${x.h}`} className="flex items-center gap-4 rounded-xl px-4 py-2.5" style={{ background: "var(--mp-card-2)", border: "1px solid var(--mp-line)" }}>
                  <b className="w-7 text-[13px]" style={{ color: i === 0 ? "#f7b84b" : i === 2 ? "#f1963b" : "var(--mp-muted)" }}>#{i + 1}</b>
                  <span className="min-w-0 flex-1"><b className="block text-[13px]" style={{ color: "var(--mp-head)" }}>{WEEK[x.d]} {h2(x.h)}h–{h2(x.h + 1)}h</b><span className="text-[11.5px]">{x.n} vente{x.n > 1 ? "s" : ""} · moy. {eur(x.sum / x.n)}</span></span>
                  <b className="text-[13.5px]" style={{ color: "var(--mp-accent)" }}>{eur(x.sum)}</b>
                </p>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Carte de chaleur — CA médias et pourboires</p>
            {grid("sum", "199,255,74")}
            <p className="mt-5 text-[11px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Carte de chaleur — nb de ventes</p>
            {grid("n", "32,201,151")}
          </div>
        </div>
      ) : <p className="py-8 text-center text-[13px]">Aucune vente sur cette période.</p>}
    </div>
  );
}

/** Courbe pleine (revenus, total d'abonnés). Survol = jour montré ; clic = jour figé. Les jours sans valeur sont sautés. */
export function Area({ points, series, hover, pinned, onHover, onPick, fmt, h = 300 }: { points: { label: string; v: number | null }[]; series?: { color: string; vals: (number | null)[] }[]; hover: number | null; pinned: boolean; onHover: (i: number | null) => void; onPick: (i: number) => void; fmt: (v: number) => string; h?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const L = 64, R = 14, T = 14, B = 30;
  // Plusieurs modèles : une courbe chacune (`series`), sinon la courbe du total.
  const lines = series && series.length > 1 ? series : [{ color: "#c7ff4a", vals: points.map((p) => p.v) }];
  const vals = lines.flatMap((l) => l.vals).filter((v): v is number => v != null);
  const lo = fmt(1.5).includes("€") || !vals.length ? 0 : Math.max(0, Math.floor((Math.min(...vals) * 0.9) / 100) * 100);
  const max = lo + nice(Math.max(...vals, lo + 1) - lo);
  const n = points.length;
  const x = (i: number) => (n <= 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - (v - lo) / (max - lo)) * (h - T - B);
  const drawn = lines.map((l) => {
    const pts = l.vals.map((v, i) => (v == null ? null : ([x(i), y(v)] as [number, number]))).filter((p): p is [number, number] => !!p);
    return { color: l.color, pts, path: smooth(pts) };
  });
  const at = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    return n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
  };
  const hx = hover != null && hover < n ? x(hover) : null;
  const gid = `mpArea${h}`;
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${h}`} className="w-full select-none" style={{ cursor: "pointer" }} onMouseMove={(e) => onHover(at(e))} onMouseLeave={() => onHover(null)} onClick={(e) => onPick(at(e))}>
      <defs>{drawn.map((l, i) => <linearGradient key={i} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={l.color} stopOpacity={drawn.length > 1 ? 0.22 : 0.38} /><stop offset="1" stopColor={l.color} stopOpacity=".03" /></linearGradient>)}</defs>
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const v = lo + ((max - lo) * k) / 5;
        return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity=".06" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11.5" fill="#878a99">{fmt(v)}</text></g>;
      })}
      {ticksX(n).map((i) => <text key={i} x={x(i)} y={h - 8} textAnchor={n > 1 && i === n - 1 ? "end" : n > 1 && i === 0 ? "start" : "middle"} fontSize="11.5" fill="#878a99">{short(points[i].label)}</text>)}
      {drawn.map((l, i) => (l.pts.length > 1 ? <g key={i}><path d={`${l.path} L${l.pts[l.pts.length - 1][0]},${h - B} L${l.pts[0][0]},${h - B} Z`} fill={`url(#${gid}-${i})`} /><path d={l.path} fill="none" stroke={l.color} strokeWidth="2.2" /></g> : l.pts.length === 1 ? <circle key={i} cx={l.pts[0][0]} cy={l.pts[0][1]} r="4.5" fill="#141a11" stroke={l.color} strokeWidth="2.4" /> : null))}
      {hx != null && lines.some((l) => l.vals[hover as number] != null) ? <><line x1={hx} x2={hx} y1={T} y2={h - B} stroke="#c7ff4a" strokeOpacity={pinned ? 0.6 : 0.25} strokeDasharray={pinned ? undefined : "4 4"} />{lines.map((l, i) => (l.vals[hover as number] != null ? <circle key={i} cx={hx} cy={y(l.vals[hover as number] as number)} r="6" fill="#fff" stroke={l.color} strokeWidth="2.5" /> : null))}</> : null}
    </svg>
  );
}

export function Bars({ points }: { points: { label: string; v: number; v2: number }[] }) {
  const [tip, setTip] = useState<number | null>(null);
  const h = 230, L = 44, R = 14, T = 14, B = 30;
  const max = nice(Math.max(...points.map((p) => p.v), 1));
  const n = points.length;
  const slot = (W - L - R) / Math.max(n, 1);
  const bw = Math.max(2, slot * 0.72);
  const y = (v: number) => T + (1 - v / max) * (h - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="mt-4 w-full select-none" onMouseLeave={() => setTip(null)}>
      {[0, 1, 2, 3, 4].map((k) => {
        const v = (max * k) / 4;
        return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity=".06" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11.5" fill="#878a99">{Math.round(v)}</text></g>;
      })}
      {points.map((p, i) => <rect key={p.label} x={L + i * slot + (slot - bw) / 2} y={y(p.v)} width={bw} height={Math.max(0, h - B - y(p.v))} rx={Math.min(3, bw / 3)} fill="#a8d83f" opacity={tip == null || tip === i ? 1 : 0.55} onMouseEnter={() => setTip(i)} />)}
      {ticksX(n).map((i) => <text key={i} x={L + i * slot + slot / 2} y={h - 8} textAnchor="middle" fontSize="11.5" fill="#878a99">{short(points[i].label)}</text>)}
      {tip != null ? (() => {
        const p = points[tip];
        const cx = Math.min(W - R - 95, Math.max(L + 95, L + tip * slot + slot / 2));
        return <g pointerEvents="none"><rect x={cx - 95} y={T} width="190" height="46" rx="8" fill="#1a1d21" stroke="#3a4047" /><text x={cx} y={T + 19} textAnchor="middle" fontSize="12" fontWeight="600" fill="#f1f6e8">{short(p.label)}</text><text x={cx} y={T + 36} textAnchor="middle" fontSize="11.5" fill="#ced4da">{p.v} nouveaux · {p.v2} renouv.</text></g>;
      })() : null}
    </svg>
  );
}
