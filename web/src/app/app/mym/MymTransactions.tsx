"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { card, eur, int, parisToday } from "./MymStats";

// MYM → Stats → Transactions : copie de la page « Transactions » de MyPulse. Tout vient des revenus lus chez MYM en
// direct (montants nets). Sans période : tout ce que Bloom a lu (400 jours).
type Part = { type: string; n: number; amount: number };
type Row = { id: string; creator: string; type: string; label: string; amount: number; fan: string | null; at: number };
type Data = { parts: Part[]; total: number; count: number; rows: Row[]; more: boolean; since: number | null };
const TYPE: Record<string, { label: string; color: string }> = {
  tip: { label: "Pourboires", color: "#1fe0b3" },
  sub: { label: "Abonnement", color: "#2f6bff" },
  ppv: { label: "PPV (Média privé)", color: "#ff0a5f" },
  mod: { label: "Media On Demand", color: "#f1734f" },
  push: { label: "Push", color: "#ff8a1f" },
  other: { label: "Autres", color: "#878a99" },
  refund: { label: "Remboursement", color: "#b9485a" },
};
const when = (t: number) => new Date(t).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const Chip = ({ type }: { type: string }) => {
  const t = TYPE[type] || TYPE.other;
  return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap" style={{ borderColor: t.color, color: t.color, background: `${t.color}1f` }}>{t.label}</span>;
};

export function MymTransactions() {
  const { creators } = useCreators();
  const [cid, setCid] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [d, setD] = useState<Data | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const url = (offset: number) => `/api/mym/transactions?offset=${offset}${cid ? `&creatorId=${encodeURIComponent(cid)}` : ""}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}${types.length ? `&types=${types.join(",")}` : ""}`;
  useEffect(() => {
    let dead = false;
    api<Data>("GET", url(0)).then((r) => !dead && (setD(r), setRows(r.rows), setErr(""))).catch((e) => !dead && setErr((e as Error).message));
    return () => void (dead = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, from, to, types]);
  const more = async () => {
    setBusy(true);
    try {
      const r = await api<Data>("GET", url(rows.length));
      setRows([...rows, ...r.rows]);
      setD(r);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const paid = (d?.parts ?? []).filter((p) => p.amount > 0);
  const sum = paid.reduce((a, p) => a + p.amount, 0);
  // Anneau : un arc par type payant.
  const R = 92, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1"><h1 className="text-[28px] font-bold" style={{ color: "#7b8fd4" }}>Transactions</h1><p className="text-[13px]">Lues chez MYM en direct, montants nets.</p></div>
        <p className="flex h-12 items-center gap-3 rounded-full px-6 text-[11.5px] font-semibold tracking-wider uppercase" style={card}>Total sélection <b className="text-[19px] tracking-normal" style={{ color: "#1fe0b3" }}>{d ? eur(d.total) : "…"}</b></p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl p-4" style={card}>
        <label className="flex h-[38px] items-center gap-2 rounded-lg px-3 text-[13px]" style={{ background: "var(--mp-card-2)" }}>
          <CalendarDays className="size-4" /> Période
          <input type="date" value={from} max={to || parisToday()} onChange={(e) => setFrom(e.target.value)} className="bg-transparent outline-none" style={{ colorScheme: "dark", color: "var(--mp-head)" }} />
          →
          <input type="date" value={to} min={from} max={parisToday()} onChange={(e) => setTo(e.target.value)} className="bg-transparent outline-none" style={{ colorScheme: "dark", color: "var(--mp-head)" }} />
          {from || to ? <button onClick={() => (setFrom(""), setTo(""))} className="text-[12px] underline">Tout</button> : null}
        </label>
        {creators.length > 1 ? <select value={cid} onChange={(e) => setCid(e.target.value)} className="h-[38px] rounded-lg px-3 text-[13px] outline-none" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}><option value="">Tous les comptes MYM</option>{creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : null}
        <span className="flex-1" />
        <span className="flex flex-wrap items-center gap-1.5 text-[12px]">Filtrer par types
          {["tip", "sub", "ppv", "mod", "push", "refund"].map((k) => {
            const on = types.includes(k);
            return <button key={k} onClick={() => setTypes(on ? types.filter((x) => x !== k) : [...types, k])} className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold" style={on ? { borderColor: TYPE[k].color, color: TYPE[k].color, background: `${TYPE[k].color}1f` } : { borderColor: "var(--mp-line)" }}>{TYPE[k].label}</button>;
          })}
        </span>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <div className="rounded-xl" style={card}>
          <p className="border-b px-4 py-3 text-[16px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Répartition</p>
          <table className="w-full text-[13px]">
            <thead><tr className="text-[11px] tracking-wider uppercase" style={{ background: "var(--mp-card-2)", color: "var(--mp-muted)" }}><th className="px-3 py-2.5 text-left font-semibold">Type</th><th className="px-3 text-center font-semibold">Vol.</th><th className="px-3 text-right font-semibold">Montant</th></tr></thead>
            <tbody>
              {(d?.parts ?? []).map((p) => <tr key={p.type} className="border-b" style={{ borderColor: "var(--mp-line)" }}><td className="px-3 py-3"><Chip type={p.type} /></td><td className="px-3 text-center"><span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--mp-card-2)" }}>{int(p.n)}</span></td><td className="px-3 text-right font-bold" style={{ color: "var(--mp-head)" }}>{eur(p.amount)}</td></tr>)}
              <tr><td className="px-3 py-3 text-[12px] font-bold uppercase" style={{ color: "var(--mp-head)" }}>Total</td><td className="px-3 text-center text-[12px]">{d ? int(d.count) : "…"}</td><td className="px-3 text-right font-bold" style={{ color: "#1fe0b3", background: "var(--mp-card-2)" }}>{d ? eur(d.total) : "…"}</td></tr>
            </tbody>
          </table>
          {d?.parts.some((p) => p.type === "refund") ? <p className="px-3 pb-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Les remboursements ne sont pas déduits du total.</p> : null}
        </div>
        <div className="rounded-xl" style={card}>
          <p className="border-b px-4 py-3 text-[16px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Visuel</p>
          <div className="relative grid place-items-center p-4">
            <svg viewBox="0 0 240 240" className="w-full max-w-[280px] -rotate-90">
              {sum > 0 ? paid.map((p) => {
                const len = (p.amount / sum) * C;
                const el = <circle key={p.type} cx="120" cy="120" r={R} fill="none" stroke={(TYPE[p.type] || TYPE.other).color} strokeWidth={hover === p.type ? 34 : 28} strokeDasharray={`${Math.max(0, len - 1)} ${C}`} strokeDashoffset={-acc} onMouseEnter={() => setHover(p.type)} onMouseLeave={() => setHover(null)} />;
                acc += len;
                return el;
              }) : <circle cx="120" cy="120" r={R} fill="none" stroke="#2f343a" strokeWidth="28" />}
            </svg>
            {hover ? <p className="pointer-events-none absolute rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: (TYPE[hover] || TYPE.other).color }}>{(TYPE[hover] || TYPE.other).label} : {eur(paid.find((p) => p.type === hover)?.amount ?? 0)}</p> : null}
          </div>
          <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 pb-4 text-[12.5px]">{(d?.parts ?? []).filter((p) => p.type !== "refund").map((p) => <span key={p.type} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: (TYPE[p.type] || TYPE.other).color }} />{(TYPE[p.type] || TYPE.other).label}</span>)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl" style={card}>
        <p className="border-b px-4 py-3 text-[16px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Historique</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead><tr className="text-left text-[11px] tracking-wider uppercase" style={{ background: "var(--mp-card-2)", color: "var(--mp-muted)" }}>{["ID", "Type", "Montant", "Source", ...(creators.length > 1 && !cid ? ["Compte"] : []), "Date"].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)" }}>
                  <td className="px-3 py-3 text-[12px]" style={{ color: "var(--mp-muted)" }}>#{r.id}</td>
                  <td className="px-3" title={r.label}><Chip type={r.type} /></td>
                  <td className="px-3 font-bold" style={{ color: r.amount < 0 ? "var(--mp-down)" : "var(--mp-head)" }}>{eur(r.amount)}</td>
                  <td className="px-3" style={{ color: "var(--mp-head)" }}><span className="flex items-center gap-1.5"><MessageCircle className="size-3.5 opacity-60" />{r.fan || "—"}</span></td>
                  {creators.length > 1 && !cid ? <td className="px-3">{r.creator}</td> : null}
                  <td className="px-3" style={{ color: "var(--mp-head)" }}>{when(r.at)}</td>
                </tr>
              ))}
              {d && !rows.length ? <tr><td colSpan={6} className="px-3 py-8 text-center">Aucune transaction sur cette sélection.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {d?.more ? <p className="border-t p-3 text-center" style={{ borderColor: "var(--mp-line)" }}><button onClick={more} disabled={busy} className="rounded-lg border px-4 py-2 text-[13px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>{busy ? "…" : `Afficher la suite (${int(rows.length)} sur ${int(d.count)})`}</button></p> : null}
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{d?.since ? `Historique lu chez MYM depuis le ${when(d.since).slice(0, 10)}. ` : ""}La date de confirmation du paiement (colonne « Statut » de MyPulse) n’est pas reprise.</p>
    </div>
  );
}
