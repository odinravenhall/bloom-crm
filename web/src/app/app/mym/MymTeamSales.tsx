"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Download, Euro, Filter, MessageSquareText, Search, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { download } from "@/lib/xlsx";
import { AuthorNote, ContextModal, Who, eur, fromLocal, int, parisDate, parisTime, tk, toLocal, type Sender, type TCreator } from "./MymTeamKit";

// MYM → Pilotage d'équipe → Ventes équipe : copie du « Messaging Money Team » de MyPulse. Ventes = contenus payants et
// pourboires lus chez MYM (nets) ; le vendeur = l'auteur du message acheté (ou du dernier message avant le pourboire).
type Seller = Sender & { sales: number; ppv: number; tips: number; amount: number; caPpv: number; caTips: number; rank: number; prevAmount: number | null; prevSales: number | null; prevRank: number | null };
type Row = { id: string; creatorId: string; creator: string; seller: Sender; fan: string; fanId: string; amount: number; type: string; at: number; messageId: string | null };
type Resume = { key: string; name: string; type: Sender["type"]; reactivity: number | null; proposed: number; sold: number; conv: number; golden: number; caPpv: number; caTips: number; total: number };
type Data = { start: number; end: number; creators: TCreator[]; sellers: Seller[]; rows: Row[]; resume: Resume[]; total: number; prevTotal: number; sales: number; prevSales: number; ppv: number; prevPpv: number; tips: number; prevTips: number; attributedSince: number };
const day0 = (t = Date.now()) => new Date(new Date(t).setHours(0, 0, 0, 0)).getTime();
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const TYPE: Record<string, string> = { ppv: "Média privé", tip: "Pourboire", push: "Média push" };

export function MymTeamSales() {
  const [start, setStart] = useState(() => toLocal(day0() - 6 * 864e5));
  const [end, setEnd] = useState(() => toLocal(Date.now()));
  const [creatorId, setCreatorId] = useState("");
  const [sender, setSender] = useState("");
  const [run, setRun] = useState(0);
  const [tab, setTab] = useState<"sum" | "rows" | "resume">("sum");
  const [menu, setMenu] = useState(false);
  const [d, setD] = useState<Data | null>(null);
  const [all, setAll] = useState<Seller[]>([]);
  const [err, setErr] = useState("");
  const [ctx, setCtx] = useState<string | null>(null);
  const load = useCallback(() => {
    const p = new URLSearchParams({ start: String(fromLocal(start)), end: String(fromLocal(end)) });
    if (creatorId) p.set("creatorId", creatorId);
    if (sender) p.set("sender", sender);
    api<Data>("GET", `/api/mym/team/sales?${p}`).then((r) => (setD(r), setErr(""), !sender && setAll(r.sellers))).catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  useEffect(() => void load(), [load]);
  const go = () => setRun((n) => n + 1);
  const quick = (a: number, b: number) => (setStart(toLocal(a)), setEnd(toLocal(b)), setMenu(false), setTimeout(go, 0));
  const shortcuts: [string, () => void][] = (() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), dd = now.getDate();
    const first = dd <= 15;
    const cur: [number, number] = first ? [new Date(y, m, 1).getTime(), new Date(y, m, 16).getTime()] : [new Date(y, m, 16).getTime(), new Date(y, m + 1, 1).getTime()];
    const prev: [number, number] = first ? [new Date(y, m - 1, 16).getTime(), new Date(y, m, 1).getTime()] : [new Date(y, m, 1).getTime(), new Date(y, m, 16).getTime()];
    const monday = day0() - ((now.getDay() + 6) % 7) * 864e5;
    return [["Quinzaine précédente", () => quick(prev[0], prev[1] - 60_000)], ["Quinzaine en cours", () => quick(cur[0], Math.min(Date.now(), cur[1] - 60_000))], ["Semaine précédente", () => quick(monday - 7 * 864e5, monday - 60_000)], ["Semaine en cours", () => quick(monday, Date.now())], ["Hier", () => quick(day0() - 864e5, day0() - 60_000)], ["Aujourd’hui", () => quick(day0(), Date.now())]];
  })();
  const csv = (name: string, head: string[], lines: (string | number)[][]) => download(new Blob([`﻿${[head, ...lines].map((l) => l.map((v) => (/[;"\n ]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(";")).join("\n")}\n`], { type: "text/csv;charset=utf-8" }), name);
  const n2 = (v: number) => v.toFixed(2).replace(".", ",");
  const delta = d && d.prevTotal > 0 ? ((d.total - d.prevTotal) / d.prevTotal) * 100 : null;
  const evo = (cur: number, prev: number | null) => (prev == null ? <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "#299cdb22", color: "#299cdb" }}>Nouveau</span> : prev > 0 ? <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={cur >= prev ? { background: "#0ab39c22", color: "#0ab39c" } : { background: "#f0654822", color: "#f06548" }}>{cur >= prev ? "▲" : "▼"} {(((cur - prev) / prev) * 100).toFixed(1).replace(".", ",")} %</span> : "–");
  const sel = "h-9 rounded-lg px-3 text-[13px] outline-none";
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <p className="flex flex-wrap items-center gap-3"><b className="text-[19px] tracking-tight uppercase" style={{ color: "var(--mp-head)" }}>Ventes équipe</b><span className="text-[12.5px]">Tous les comptes MYM · tous les chatteurs</span><span className="rounded-md px-3 py-1 text-[12px] font-bold text-white" style={{ background: "#3b7cff" }} title="MYM ne montre que les montants nets.">Net</span></p>
      <AuthorNote />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="datetime-local" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={sel} style={{ ...tk.inp, colorScheme: "dark" }} />
        <input type="datetime-local" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} className={sel} style={{ ...tk.inp, colorScheme: "dark" }} />
        <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className={sel} style={tk.inp}><option value="">Tous les créateurs</option>{(d?.creators ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={sender} onChange={(e) => setSender(e.target.value)} className={sel} style={tk.inp}><option value="">Tous les chatteurs</option>{all.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
        <button onClick={go} className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-white" style={{ background: "#4a57a8" }}><Filter className="size-3.5" /> Filtrer</button>
        <span className="relative"><button onClick={() => setMenu(!menu)} className="flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px]" style={{ borderColor: "#3577f1", color: "#6f9bff" }}><CalendarDays className="size-3.5" /> Raccourcis <ChevronDown className="size-3.5" /></button>
          {menu ? <span className="absolute top-10 left-0 z-20 w-52 rounded-lg py-1 shadow-xl" style={{ background: "var(--mp-card-2)", border: "1px solid var(--mp-line)" }}>{shortcuts.map(([l, f], i) => <button key={l} onClick={f} className={`block w-full px-4 py-2 text-left text-[13px] hover:brightness-125 ${i === 2 || i === 4 ? "border-t" : ""}`} style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>{l}</button>)}</span> : null}
        </span>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}

      <div className="mt-3 grid gap-3 md:grid-cols-3 lg:max-w-5xl">
        <div className="flex items-center gap-4 rounded-xl p-4" style={tk.card}><span className="grid size-11 place-items-center rounded-lg" style={{ background: "#0ab39c22", color: "#22d3ee" }}><TrendingUp className="size-5" /></span><div><p className="text-[11.5px] uppercase">Ventes</p><p className="text-[24px] leading-tight font-bold" style={{ color: "var(--mp-head)" }}>{d ? int(d.sales) : "…"}</p>{d ? <p className="text-[12px]" style={{ color: d.sales >= d.prevSales ? "#0ab39c" : "#f06548" }}>{d.sales >= d.prevSales ? "▲" : "▼"} {signed(d.sales - d.prevSales)} vs période précédente</p> : null}</div></div>
        <div className="flex items-center gap-4 rounded-xl p-4" style={tk.card}><span className="grid size-11 place-items-center rounded-lg" style={{ background: "#3b7cff22", color: "#6f9bff" }}><MessageSquareText className="size-5" /></span><div><p className="text-[11.5px] uppercase">Répartition type</p><p className="text-[24px] leading-tight font-bold" style={{ color: "var(--mp-head)" }}>{d ? int(d.ppv) : "…"} PPV {d ? <span className="text-[12px] font-semibold" style={{ color: "#0ab39c" }}>({signed(d.ppv - d.prevPpv)})</span> : null}</p>{d ? <p className="text-[12px]" style={{ color: "#22d3ee" }}>{int(d.tips)} pourboires ({signed(d.tips - d.prevTips)})</p> : null}</div></div>
        <div className="flex items-center gap-4 rounded-xl p-4" style={tk.card}><span className="grid size-11 place-items-center rounded-lg" style={{ background: "#0ab39c22", color: "#3cd188" }}><Euro className="size-5" /></span><div><p className="text-[11.5px] uppercase">Montant net · EUR</p><p className="text-[24px] leading-tight font-bold" style={{ color: "var(--mp-head)" }}>{d ? eur(d.total) : "…"}</p>{delta != null ? <p className="text-[12px]" style={{ color: delta >= 0 ? "#0ab39c" : "#f06548" }}>{delta >= 0 ? "▲" : "▼"} {delta.toFixed(1).replace(".", ",")} % vs période précédente</p> : null}</div></div>
      </div>

      <div className="mt-4 rounded-xl" style={tk.card}>
        <p className="flex flex-wrap items-center gap-1 border-b px-4 pt-3" style={{ borderColor: "var(--mp-line)" }}>
          {([["sum", "Ventes de synthèse"], ["rows", "Détail des ventes"], ["resume", "Résumé chatter"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="px-4 py-2.5 text-[13.5px] font-medium" style={tab === k ? { color: "#6f7fd4", borderBottom: "2px solid #6f7fd4" } : { color: "var(--mp-head)" }}>{l}</button>)}
          <span className="flex-1" />
          {d ? <button onClick={() => (tab === "rows" ? csv("bloom_ventes_detail.csv", ["Créateur", "Chatteur", "Fan", "Montant net", "Devise", "Type", "Date"], d.rows.map((r) => [r.creator, r.seller.name, r.fan, n2(r.amount), "EUR", TYPE[r.type] || r.type, `${parisDate(r.at)} ${parisTime(r.at)}`])) : tab === "resume" ? csv("bloom_resume_chatter.csv", ["Chatteur", "Réactivité (s)", "Proposé", "Vendu", "Taux conv. %", "Golden ratio %", "CA PPV", "CA tips", "CA total"], d.resume.map((r) => [r.name, r.reactivity ?? "", r.proposed, r.sold, n2(r.conv), n2(r.golden), n2(r.caPpv), n2(r.caTips), n2(r.total)])) : csv("bloom_ventes_synthese.csv", ["Rang", "Chatteur", "Ventes", "Médias privés", "Pourboires", "Montant net", "Période préc."], d.sellers.map((s) => [s.rank, s.name, s.sales, s.ppv, s.tips, n2(s.amount), s.prevAmount == null ? "" : n2(s.prevAmount)])))} className="mb-1 flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-semibold" style={{ background: "#3577f122", color: "#6f9bff" }}><Download className="size-3.5" /> Exporter CSV (;)</button> : null}
        </p>
        <div className="overflow-x-auto p-3">
          {tab === "sum" ? (
            <>
              {d ? <p className="mb-2 text-[12px]">Progression calculée par rapport à la période précédente : du {parisDate(d.start - (d.end - d.start))} {parisTime(d.start - (d.end - d.start))} au {parisDate(d.start)} {parisTime(d.start)}.</p> : null}
              <table className="w-full min-w-[820px] text-[13.5px]">
                <thead><tr className="text-[11px] tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>{["#", "Chatter", "Ventes", "Médias privés", "Pourboires", "Montant net", "Période préc.", "Évolution", "Rang"].map((h, i) => <th key={h} className={`border-b px-3 py-3 font-semibold ${i > 1 ? "text-center" : "text-left"}`} style={{ borderColor: "var(--mp-line)" }}>{h}</th>)}</tr></thead>
                <tbody>{(d?.sellers ?? []).map((s) => (
                  <tr key={s.key} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>
                    <td className="px-3 py-3 font-bold" style={{ color: s.rank <= 3 ? "#f7b84b" : "var(--mp-muted)" }}>{s.rank}</td>
                    <td className="px-3 font-semibold"><Who s={s} /></td>
                    <td className="px-3 text-center">{s.sales}{s.prevSales != null && s.sales !== s.prevSales ? <span className="ml-1 text-[11.5px]" style={{ color: s.sales > s.prevSales ? "#0ab39c" : "#f06548" }}>({signed(s.sales - s.prevSales)})</span> : null}</td>
                    <td className="px-3 text-center">{s.ppv}</td><td className="px-3 text-center">{s.tips}</td>
                    <td className="px-3 text-center font-bold">{eur(s.amount)}</td>
                    <td className="px-3 text-center" style={{ color: "var(--mp-muted)" }}>{s.prevAmount == null ? "–" : eur(s.prevAmount)}</td>
                    <td className="px-3 text-center">{evo(s.amount, s.prevAmount)}</td>
                    <td className="px-3 text-center">{s.prevRank == null ? evo(1, null) : s.prevRank === s.rank ? "=" : <b style={{ color: s.prevRank > s.rank ? "#0ab39c" : "#f06548" }}>{s.prevRank > s.rank ? "▲" : "▼"} {Math.abs(s.prevRank - s.rank)}</b>}</td>
                  </tr>
                ))}{d && !d.sellers.length ? <tr><td colSpan={9} className="py-10 text-center">Aucune vente sur cette période.</td></tr> : null}</tbody>
              </table>
            </>
          ) : tab === "rows" ? (
            <table className="w-full min-w-[860px] text-[13.5px]">
              <thead><tr className="text-left text-[11px] tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>{["Créateur", "Chatter", "Fan", "Montant net", "Devise", "Type", "Date", "Contexte"].map((h) => <th key={h} className="border-b px-3 py-3 font-semibold" style={{ borderColor: "var(--mp-line)" }}>{h}</th>)}</tr></thead>
              <tbody>{(d?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>
                  <td className="px-3 py-3 font-semibold">{r.creator}</td><td className="px-3"><Who s={r.seller} /></td><td className="px-3">{r.fan}</td><td className="px-3 font-bold">{r.amount.toFixed(2).replace(".", ",")}</td><td className="px-3">EUR</td>
                  <td className="px-3"><span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "#3577f122", color: "#6f9bff" }}>{TYPE[r.type] || r.type}</span></td>
                  <td className="px-3 whitespace-nowrap">{parisDate(r.at)} {parisTime(r.at)}</td>
                  <td className="px-3">{/-/.test(r.fanId) ? <button onClick={() => setCtx(r.messageId ? `id=${encodeURIComponent(r.messageId)}&creator=${encodeURIComponent(r.creatorId)}&fan=${encodeURIComponent(r.fanId)}&at=${r.at}` : `creator=${encodeURIComponent(r.creatorId)}&fan=${encodeURIComponent(r.fanId)}&at=${r.at}`)} title="Voir la conversation autour de la vente" className="grid size-8 place-items-center rounded border" style={{ borderColor: "#3577f1", color: "#6f9bff" }}><Search className="size-3.5" /></button> : "—"}</td>
                </tr>
              ))}{d && !d.rows.length ? <tr><td colSpan={8} className="py-10 text-center">Aucune vente sur cette période.</td></tr> : null}</tbody>
            </table>
          ) : (
            <table className="w-full min-w-[900px] text-[13.5px]">
              <thead><tr className="text-[11px] tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>{["Chatter", "Réactivité", "Proposé", "Vendu", "Taux conv.", "Golden ratio", "CA PPV", "CA tips", "CA total"].map((h, i) => <th key={h} className={`border-b px-3 py-3 font-semibold ${i ? "text-center" : "text-left"}`} style={{ borderColor: "var(--mp-line)" }}>{h}</th>)}</tr></thead>
              <tbody>{(d?.resume ?? []).map((r) => (
                <tr key={r.key} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>
                  <td className="px-3 py-3 font-semibold"><Who s={r} /></td>
                  <td className="px-3 text-center font-bold" style={{ color: r.reactivity == null ? undefined : r.reactivity < 300 ? "#f7b84b" : "#f06548" }}>{r.reactivity == null ? "–" : `${r.reactivity}s`}</td>
                  <td className="px-3 text-center"><span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: "#3577f122", color: "#6f9bff" }}>{r.proposed}</span></td>
                  <td className="px-3 text-center"><span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: "#0ab39c22", color: "#3cd188" }}>{r.sold}</span></td>
                  <td className="px-3 text-center">{r.conv.toFixed(1)}%</td><td className="px-3 text-center">{r.golden.toFixed(1)}%</td>
                  <td className="px-3 text-center" style={{ color: "#6f7fd4" }}>{eur(r.caPpv)}</td><td className="px-3 text-center" style={{ color: "#f7b84b" }}>{eur(r.caTips)}</td><td className="px-3 text-center font-bold">{eur(r.total)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--mp-muted)" }}>Bloom cherche l’auteur d’une vente seulement sur les 14 derniers jours : les ventes plus anciennes sont « Non attribué ». Réactivité = temps de réponse moyen. Proposé = PPV payants envoyés. Golden ratio = PPV payants proposés / messages envoyés.{d && d.rows.length >= 500 ? " Le détail montre les 500 dernières ventes." : ""}</p>
      {ctx ? <ContextModal query={ctx} onClose={() => setCtx(null)} /> : null}
    </div>
  );
}
