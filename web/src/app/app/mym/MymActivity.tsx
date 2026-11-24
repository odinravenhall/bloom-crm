"use client";

import { useCallback, useEffect, useState } from "react";
import { Filter, History, UserRound, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { fromLocal, int, parisDate, tk, toLocal } from "./MymTeamKit";

// MYM → Pilotage d'équipe → Activité : copie de « Activité de l'équipe » de MyPulse. Le journal des actions faites
// dans Bloom (60 jours glissants) : qui, quand, sur quel compte, sur quel fan.
type Row = { id: number; at: number; user: string | null; creator: string; fan: string | null; action: string; details: string | null };
type Data = { start: number; end: number; total: number; users: number; fans: number; page: number; pages: number; split: { action: string; n: number }[]; people: string[]; creators: { id: string; name: string }[]; rows: Row[]; since: number | null };
const day0 = () => new Date(new Date().setHours(0, 0, 0, 0)).getTime();
const stamp = (t: number) => new Date(t).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(",", "");
const tone = (a: string) => (/bloqué|suspect|supprim|retir|délié/i.test(a) ? ["#f0654822", "#f06548"] : /droit|accès|rôle/i.test(a) ? ["#f7b84b22", "#f7b84b"] : ["#3577f122", "#6f9bff"]);

export function MymActivity() {
  const [start, setStart] = useState(() => toLocal(Date.now() - 7 * 864e5));
  const [end, setEnd] = useState(() => toLocal(Date.now()));
  const [creatorId, setCreatorId] = useState("");
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [size, setSize] = useState(50);
  const [page, setPage] = useState(1);
  const [run, setRun] = useState(0);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    const p = new URLSearchParams({ start: String(fromLocal(start)), end: String(fromLocal(end)), size: String(size), page: String(page) });
    if (creatorId) p.set("creatorId", creatorId);
    if (user) p.set("user", user);
    if (action) p.set("action", action);
    api<Data>("GET", `/api/mym/activity?${p}`).then((r) => (setD(r), setErr(""))).catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, page, size, action]);
  useEffect(() => void load(), [load]);
  const go = () => (setPage(1), setRun((n) => n + 1));
  const quick = (a: number, b: number) => (setStart(toLocal(a)), setEnd(toLocal(b)), setTimeout(go, 0));
  const sel = "h-10 w-full rounded-lg px-3 text-[13.5px] outline-none";
  const Kpi = ({ icon, label, v, color }: { icon: React.ReactNode; label: string; v: string; color: string }) => <div className="flex items-center gap-5 rounded-xl p-6" style={tk.card}><span style={{ color: "var(--mp-head)" }}>{icon}</span><div><p className="text-[11.5px] tracking-wider uppercase">{label}</p><p className="text-[24px] font-bold" style={{ color: "var(--mp-head)" }}>{v}</p><p className="text-[12px]" style={{ color }}>sur la période</p></div></div>;
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <h1 className="text-[20px] font-bold tracking-tight uppercase" style={{ color: "var(--mp-head)" }}>Activité de l’équipe</h1>
      <p className="text-[13.5px]">Journal des actions de vos collaborateurs dans Bloom — 60 jours glissants{d?.since ? `, depuis le ${parisDate(d.since)}` : ""}.</p>
      <div className="mt-3 max-w-5xl space-y-2">
        <div className="grid gap-2 sm:grid-cols-2"><input type="datetime-local" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={sel} style={{ ...tk.inp, colorScheme: "dark" }} /><input type="datetime-local" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} className={sel} style={{ ...tk.inp, colorScheme: "dark" }} /></div>
        <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className={sel} style={tk.inp}><option value="">Tous les créateurs</option>{(d?.creators ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={user} onChange={(e) => setUser(e.target.value)} className={sel} style={tk.inp}><option value="">Tous les collaborateurs</option>{(d?.people ?? []).map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <select value={action} onChange={(e) => (setPage(1), setAction(e.target.value))} className={sel} style={tk.inp}><option value="">Toutes les actions</option>{(d?.split ?? []).map((s) => <option key={s.action} value={s.action}>{s.action} ({s.n})</option>)}</select>
        <p className="flex flex-wrap items-center gap-2">
          <select value={size} onChange={(e) => (setPage(1), setSize(Number(e.target.value)))} className="h-9 rounded-lg px-3 text-[13px] outline-none" style={tk.inp}>{[50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <button onClick={go} className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-white" style={{ background: "#4a57a8" }}><Filter className="size-3.5" /> Filtrer</button>
          <button onClick={() => quick(day0(), Date.now())} className="h-9 rounded-lg border px-3 text-[13px]" style={{ borderColor: "#0ab39c", color: "#0ab39c" }}>Aujourd’hui</button>
          <button onClick={() => quick(day0() - 864e5, day0())} className="h-9 rounded-lg border px-3 text-[13px]" style={{ borderColor: "#f7b84b", color: "#f7b84b" }}>Hier</button>
          <button onClick={() => (setCreatorId(""), setUser(""), setAction(""), quick(Date.now() - 7 * 864e5, Date.now()))} className="h-9 rounded-lg border px-3 text-[13px]" style={{ borderColor: "#3577f1", color: "#6f9bff" }}>Réinitialiser</button>
        </p>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Kpi icon={<History className="size-6" />} label="Actions" v={d ? int(d.total) : "…"} color="#6f7fd4" />
        <Kpi icon={<UsersRound className="size-6" />} label="Collaborateurs actifs" v={d ? int(d.users) : "…"} color="#0ab39c" />
        <Kpi icon={<UserRound className="size-6" />} label="Fans concernés" v={d ? int(d.fans) : "…"} color="#f7b84b" />
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[11.5px]"><span className="mr-2 tracking-wider uppercase">Répartition</span>{(d?.split ?? []).map((s) => <button key={s.action} onClick={() => (setPage(1), setAction(action === s.action ? "" : s.action))} className="rounded px-2 py-0.5 font-semibold" style={{ background: tone(s.action)[0], color: tone(s.action)[1], outline: action === s.action ? "1px solid currentColor" : undefined }}>{s.action} · {int(s.n)}</button>)}</p>
      <div className="mt-3 overflow-x-auto rounded-xl" style={tk.card}>
        <table className="w-full min-w-[900px] text-[13.5px]">
          <thead><tr className="text-left text-[11px] tracking-wider uppercase" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>{["Date", "Créateur", "Collaborateur", "Action", "Fan", "Détails"].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {(d?.rows ?? []).map((r) => <tr key={r.id} className="border-t" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><td className="px-3 py-3 whitespace-nowrap">{stamp(r.at)}</td><td className="px-3">{r.creator || "—"}</td><td className="px-3">{r.user || "—"}</td><td className="px-3"><span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap" style={{ background: tone(r.action)[0], color: tone(r.action)[1] }}>{r.action}</span></td><td className="px-3">{r.fan || ""}</td><td className="px-3 text-[12.5px]" style={{ color: "var(--mp-text)" }}>{r.details || ""}</td></tr>)}
            {d && !d.rows.length ? <tr><td colSpan={6} className="px-3 py-10 text-center" style={{ color: "var(--mp-text)" }}>Aucune action sur cette sélection. Le journal se remplit à partir de sa mise en place : rien n’existe avant.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {d && d.pages > 1 ? <p className="mt-3 flex items-center justify-center gap-3 text-[13px]"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40" style={{ borderColor: "var(--mp-line)" }}>Précédent</button>Page {d.page} / {int(d.pages)}<button disabled={page >= d.pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40" style={{ borderColor: "var(--mp-line)" }}>Suivant</button></p> : null}
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Seules les actions faites dans Bloom sont notées (pas celles faites dans MyPulse ou l’appli MYM). Les messages envoyés ne sont pas listés ici : ils sont dans le Message Dashboard.</p>
    </div>
  );
}
