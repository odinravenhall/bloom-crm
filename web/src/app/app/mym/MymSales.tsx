"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Clock, Filter, LineChart, Timer } from "lucide-react";
import { api, toast } from "@/lib/api";

// MYM → Messages → Mes ventes : copie de « Ventes chatting » de MyPulse. Les ventes de la personne connectée (PPV de ses
// messages et pourboires qui les suivent), le temps actif et le temps idle relevés par Bloom.
type Row = { id: string; creator: string; fan: string; amount: number; currency: string; type: "ppv" | "tip"; at: number };
type Data = { rows: Row[]; totals: { count: number; ppv: number; tips: number; sums: Record<string, number> }; activeMs: number; idleMs: number; creators: { id: string; name: string }[] };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const pad = (n: number) => String(n).padStart(2, "0");
const local = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dur = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`;
};
const money = (n: number, cur: string) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur === "USD" ? "$" : "€"}`;

export function MymSales() {
  const [from, setFrom] = useState(() => local(Date.now() - 864e5));
  const [to, setTo] = useState(() => local(Date.now()));
  const [creatorId, setCreatorId] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback((f: string, t: string, c: string) => {
    const p = new URLSearchParams({ from: String(new Date(f).getTime()), to: String(new Date(t).getTime()) });
    if (c) p.set("creatorId", c);
    api<Data>("GET", `/api/my-sales?${p}`).then(setD).catch((e) => toast((e as Error).message, "err"));
  }, []);
  useEffect(() => load(from, to, creatorId), []); // eslint-disable-line react-hooks/exhaustive-deps
  const day = (shift: number) => {
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    const f = local(s.getTime() - shift * 864e5);
    const t = shift ? local(s.getTime()) : local(Date.now());
    setFrom(f);
    setTo(t);
    load(f, t, creatorId);
  };
  const sums = Object.entries(d?.totals.sums ?? {});
  const box = "h-9 w-full rounded-md px-3 text-[12.5px] outline-none";
  const st = { background: "var(--mp-card)", border: "1px solid var(--mp-line)", color: "var(--mp-head)", colorScheme: "dark" as const };
  const tiles: [string, string, string, typeof Clock, string][] = [
    ["Ventes attribuées", String(d?.totals.count ?? "…"), sums.length ? sums.map(([c, n]) => money(n, c)).join(" · ") : "transactions", LineChart, "#299cdb"],
    ["Répartition type", `${d?.totals.ppv ?? 0} PPV`, `${d?.totals.tips ?? 0} tips`, CheckSquare, "#0ab39c"],
    ["Temps actif", d ? dur(d.activeMs) : "…", "sur la période", Timer, "#f7b84b"],
    ["Temps idle", d ? dur(d.idleMs) : "…", "sur la période", Clock, "#f06548"],
  ];

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-bold tracking-wide uppercase" style={{ color: "var(--mp-head)" }}>Ventes chatting</h1>
          <p className="mt-1 text-[12.5px]">Vos ventes personnelles · TIPS + PPV attribués</p>
        </div>
        <div className="w-full max-w-[640px] space-y-1.5">
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={box} style={st} />
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={box} style={st} />
          <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className={box} style={st}>
            <option value="">Tous les créateurs</option>
            {(d?.creators ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2 pt-1">
            <button onClick={() => load(from, to, creatorId)} className="flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] text-white" style={{ background: "#405189" }}><Filter className="size-3" /> Filtrer</button>
            <button onClick={() => day(0)} className="h-7 rounded border px-2.5 text-[12px]" style={{ borderColor: "#0ab39c", color: "#0ab39c" }}>Aujourd’hui</button>
            <button onClick={() => day(1)} className="h-7 rounded border px-2.5 text-[12px]" style={{ borderColor: "#f7b84b", color: "#f7b84b" }}>Hier</button>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([l, v, s, I, c]) => (
          <div key={l} className="rounded-md p-4" style={card}>
            <p className="flex items-center justify-between text-[11.5px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-muted)" }}>{l}<I className="size-4" style={{ color: c }} /></p>
            <p className="mt-3 text-[20px] font-bold" style={{ color: "var(--mp-head)" }}>{v}</p>
            <p className="mt-1 text-[12.5px]">{s}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 overflow-x-auto rounded-md p-3" style={card}>
        <table className="w-full min-w-[720px] text-[13px]">
          <thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["Créateur", "Fan", "Montant", "Devise", "Type", "Date"].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {(d?.rows ?? []).map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--mp-line)" }}>
                <td className="px-3 py-2.5">{r.creator}</td>
                <td className="px-3" style={{ color: "var(--mp-head)" }}>{r.fan}</td>
                <td className="px-3 font-semibold" style={{ color: "var(--mp-up)" }}>{money(r.amount, r.currency)}</td>
                <td className="px-3">{r.currency}</td>
                <td className="px-3"><span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase" style={r.type === "ppv" ? { background: "rgba(64,81,137,.35)", color: "#8ea2e6" } : { background: "rgba(247,184,75,.18)", color: "#f7b84b" }}>{r.type === "ppv" ? "PPV" : "Tip"}</span></td>
                <td className="px-3 whitespace-nowrap">{new Date(r.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
              </tr>
            ))}
            {d && !d.rows.length ? <tr><td colSpan={6} className="border-t py-8 text-center" style={{ borderColor: "var(--mp-line)" }}>Aucune vente attribuée sur la période.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Une vente t’est attribuée quand le fan achète un message payant que tu as envoyé depuis Bloom, ou laisse un pourboire dans les 2 h après ton dernier message. Montants nets, tels que MYM les crédite à la créatrice (lus chez MYM en direct). Le temps actif et idle est relevé depuis le 23/11/2026.</p>
    </div>
  );
}
