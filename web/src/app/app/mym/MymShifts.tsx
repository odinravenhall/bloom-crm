"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, RefreshCw, Search, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { download } from "@/lib/xlsx";
import { AuthorNote, addDay, dur, hmin, int, parisDate, parisTime, parisToday, tk, type TCreator } from "./MymTeamKit";

// MYM → Pilotage d'équipe → Contrôle des shifts : copie de MyPulse (Activité du chatteur, Relevé d'activité d'équipe).
// Tout est calculé sur les messages envoyés depuis Bloom (les seuls dont Bloom connaît l'auteur).
type Vac = { day: string; start: string; end: string; endDay: string; startAt: number; endAt: number; activeMin: number; messages: number; models: { name: string; n: number }[] };
type Chatter = { name: string; id: number | null; messages: number; activeMin: number; shifts: number; vacations: Vac[]; models: { name: string; n: number }[]; replyAvg: number | null; replyMedian: number | null; first: number; last: number; ppvPaid: number; ppvFree: number };
type Data = { from: string; to: string; idle: number; cut: number; start: number; end: number; creators: TCreator[]; chatters: Chatter[]; minutes?: [number, number][]; totals: { chatters: number; vacations: number; activeMin: number; messages: number; models: number; of: number }; unnamed?: number };
const frDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const secs = (s: number | null) => (s == null ? "—" : dur(s * 1000).replace("m ", " min ").replace(/(\d+)s$/, "$1 s"));

export function MymShifts() {
  const [tab, setTab] = useState<"one" | "team">("team");
  const [from, setFrom] = useState(() => addDay(parisToday(), -6));
  const [to, setTo] = useState(parisToday);
  const [idle, setIdle] = useState(3);
  const [cut, setCut] = useState(60);
  const [picked, setPicked] = useState<string[]>([]);
  const [who, setWho] = useState("");
  const [run, setRun] = useState(0);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    setBusy(true);
    const p = new URLSearchParams({ from, to, idle: String(idle), cut: String(cut) });
    if (picked.length) p.set("creators", picked.join(","));
    if (who) p.set("chatter", who);
    api<Data>("GET", `/api/mym/team/shifts?${p}`).then((r) => (setD(r), setErr(""))).catch((e) => setErr((e as Error).message)).finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, who]);
  useEffect(() => void load(), [load]);
  const go = () => setRun((n) => n + 1);
  const days = (n: number) => (setTo(parisToday()), setFrom(addDay(parisToday(), -(n - 1))), setTimeout(go, 0));
  const exportCsv = () => {
    if (!d) return;
    const q = (s: string | number) => (/[ ;"]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
    const head = ["Chatteur", '"ID chatteur"', "Jour", "Début", "Fin", '"Jour de fin"', '"Temps actif"', "Messages", "Modèles"].join(";");
    const lines = d.chatters.flatMap((c) => c.vacations.map((v) => [q(c.name), c.id ?? "", frDay(v.day), v.start, v.end, frDay(v.endDay), v.activeMin, v.messages, `"${v.models.map((m) => `${m.name} (${m.n})`).join(", ")}"`].join(";")));
    const n = picked.length || d.creators.length;
    download(new Blob([`﻿${[head, ...lines].join("\n")}\n`], { type: "text/csv;charset=utf-8" }), `bloom-${n}modele${n > 1 ? "s" : ""}_${d.from}_${d.to}_pause${d.idle}min_coupure${d.cut}min.csv`);
  };
  const me = useMemo(() => d?.chatters.find((c) => c.name === who) ?? null, [d, who]);
  const inp = "mt-1.5 h-10 w-full rounded-lg px-3 text-[13.5px] outline-none";
  const Kpi = ({ label, sub, v }: { label: string; sub?: string; v: React.ReactNode }) => <div className="rounded-2xl p-4" style={tk.card}><p className="text-[11px] font-bold tracking-wider uppercase">{label}</p>{sub ? <p className="mt-1 text-[12px]">{sub}</p> : null}<p className="mt-2 text-[22px] font-bold" style={{ color: "var(--mp-head)" }}>{v}</p></div>;
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <p className="flex gap-1 border-b" style={{ borderColor: "var(--mp-line)" }}>{([["one", "Activité du chatteur"], ["team", "Relevé d’activité d’équipe"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="px-4 py-2.5 text-[13.5px] font-medium" style={tab === k ? { color: "#6f7fd4", borderBottom: "2px solid #6f7fd4" } : { color: "var(--mp-head)" }}>{l}</button>)}</p>
      <AuthorNote />
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}

      <div className="mt-4 rounded-2xl p-5" style={tk.card}>
        {tab === "team" ? (
          <>
            <b className="text-[17px]" style={{ color: "var(--mp-head)" }}>Relevé d’activité d’équipe</b>
            <p className="mt-1 text-[12.5px]">Les vacations de tous les chatteurs qui ont écrit depuis Bloom sur la période. Une ligne par vacation dans l’export CSV.</p>
            <p className="mt-4 text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Périmètre du relevé</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg p-2" style={tk.inp}>
              {(d?.creators ?? []).map((c) => {
                const on = !picked.length || picked.includes(c.id);
                return <button key={c.id} onClick={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} className="rounded px-2.5 py-1 text-[13px] font-medium" style={on ? { background: "#405189", color: "#fff" } : { background: "transparent", border: "1px solid var(--mp-line)" }}>{c.name}</button>;
              })}
              <button onClick={() => setPicked([])} className="rounded border px-2.5 py-1 text-[12px]" style={{ borderColor: "#3577f1", color: "#6f9bff" }}>Tous les comptes MYM ({d?.creators.length ?? 0})</button>
            </p>
          </>
        ) : (
          <label className="block max-w-md text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Chatteur<select value={who} onChange={(e) => setWho(e.target.value)} className={inp} style={tk.inp}><option value="">Choisir…</option>{(d?.chatters ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="min-w-[150px] flex-1 text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Du<input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inp} style={{ ...tk.inp, colorScheme: "dark" }} /></label>
          <label className="min-w-[150px] flex-1 text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Au<input type="date" value={to} min={from} max={parisToday()} onChange={(e) => e.target.value && setTo(e.target.value)} className={inp} style={{ ...tk.inp, colorScheme: "dark" }} /></label>
          <label className="w-36 text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Seuil d’inactivité (min)<input type="number" min={1} max={60} value={idle} onChange={(e) => setIdle(Math.max(1, Number(e.target.value) || 3))} className={inp} style={tk.inp} /></label>
          <label className="w-36 text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Coupure de shift (min)<input type="number" min={1} max={600} value={cut} onChange={(e) => setCut(Math.max(1, Number(e.target.value) || 60))} className={inp} style={tk.inp} /></label>
          <span className="flex flex-wrap gap-2">
            <button onClick={go} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold text-white" style={{ background: "#4a57a8" }}>{tab === "team" ? <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> : <Search className="size-4" />} {tab === "team" ? "Actualiser le tableau" : "Rechercher"}</button>
            {tab === "team" ? <button onClick={exportCsv} disabled={!d?.chatters.length} className="flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold disabled:opacity-40" style={{ background: "#3577f122", color: "#6f9bff" }}><Download className="size-4" /> Exporter en CSV</button> : null}
          </span>
        </div>
        <p className="mt-3 flex flex-wrap gap-2">{[["Aujourd’hui", 1], ["7 jours", 7], ["30 jours", 30], ["60 jours", 60]].map(([l, n]) => <button key={l} onClick={() => days(n as number)} className="rounded-full border px-3 py-1 text-[12.5px]" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>{l}</button>)}<span className="self-center text-[12px]">60 jours au plus.</span></p>
      </div>

      {d && !d.chatters.length ? <p className="mt-4 rounded-2xl p-6 text-center text-[13.5px]" style={tk.card}>Aucun message envoyé depuis Bloom sur cette période.{d.unnamed ? ` Bloom a vu passer ${int(d.unnamed)} message${d.unnamed > 1 ? "s" : ""} écrit${d.unnamed > 1 ? "s" : ""} ailleurs (IA, MyPulse, appli MYM), sans pouvoir dire par qui.` : ""}</p> : null}

      {tab === "team" && d?.chatters.length ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Chatteurs actifs" v={int(d.totals.chatters)} /><Kpi label="Vacations" v={int(d.totals.vacations)} /><Kpi label="Temps actif cumulé" v={hmin(d.totals.activeMin)} /><Kpi label="Messages envoyés" v={int(d.totals.messages)} /><Kpi label="Modèles travaillés" v={<>{d.totals.models}<span className="text-[14px] opacity-60">/{d.totals.of}</span></>} />
          </div>
          <div className="mt-4 rounded-2xl p-5" style={tk.card}>
            <b className="text-[15px]" style={{ color: "var(--mp-head)" }}>Détail par chatteur</b>
            <p className="mt-1 text-[12px] leading-relaxed">Une ligne par vacation. Pause dès {d.idle} min sans message, nouvelle vacation dès {d.cut} min de coupure. Temps de réponse : du premier message du fan resté sans réponse à la réponse, quand elle arrive en moins de 30 min.</p>
            <div className="mt-3 space-y-2">
              {d.chatters.map((c) => (
                <div key={c.name} className="rounded-lg border" style={{ borderColor: "var(--mp-line)" }}>
                  <button onClick={() => setOpen(open === c.name ? null : c.name)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left text-[13px]">
                    <ChevronRight className={`size-3.5 transition-transform ${open === c.name ? "rotate-90" : ""}`} />
                    <b className="text-[14px]" style={{ color: "var(--mp-head)" }}>{c.name}</b>
                    {c.models.map((m) => <span key={m.name} className="rounded-full border px-2 py-0.5 text-[11.5px]" style={{ borderColor: "var(--mp-line)" }}>{m.name} <b>{int(m.n)}</b></span>)}
                    <span className="flex-1" />
                    <span className="flex items-center gap-1"><Timer className="size-3.5" /> Réponse : {secs(c.replyAvg)} en moyenne (médiane {secs(c.replyMedian)})</span>
                    <span>{c.shifts} shift(s)</span><span>{hmin(c.activeMin)} actives</span><span>{int(c.messages)} message(s)</span>
                  </button>
                  {open === c.name ? (
                    <div className="overflow-x-auto border-t" style={{ borderColor: "var(--mp-line)" }}>
                      <table className="w-full min-w-[640px] text-[13.5px]">
                        <thead><tr className="text-left text-[11px] tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>{["Jour", "Début", "Fin", "Temps actif", "Messages", "Modèles"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                        <tbody>{c.vacations.map((v) => <tr key={v.startAt} className="border-t" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><td className="px-3 py-2">{longDay(v.day)}</td><td className="px-3">{v.start}</td><td className="px-3">{v.end}{v.endDay !== v.day ? <span className="ml-1 text-[11px] opacity-60">+1 j</span> : null}</td><td className="px-3">{hmin(v.activeMin)}</td><td className="px-3">{int(v.messages)}</td><td className="px-3">{v.models.map((m) => <span key={m.name} className="mr-1.5 rounded-full border px-2 py-0.5 text-[11.5px]" style={{ borderColor: "var(--mp-line)" }}>{m.name} {int(m.n)}</span>)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {tab === "one" && me && d ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Premier message" sub="Heure de démarrage observée" v={`${parisDate(me.first).slice(0, 5)} ${parisTime(me.first)}`} />
            <Kpi label="Dernier message" sub="Heure de fin observée" v={`${parisDate(me.last).slice(0, 5)} ${parisTime(me.last)}`} />
            <Kpi label="Messages envoyés" sub="Total sur la période" v={int(me.messages)} />
            <Kpi label="PPV proposés" sub={`${int(me.ppvFree)} gratuit · ${int(me.ppvPaid)} payant`} v={int(me.ppvFree + me.ppvPaid)} />
            <Kpi label="Golden ratio" sub="PPV payants proposés / messages" v={`${(me.messages ? (me.ppvPaid / me.messages) * 100 : 0).toFixed(1)}%`} />
            <Kpi label="Comptes liés" sub="Modèles où il a écrit" v={me.models.length} />
            <Kpi label="Chatting actif" sub={`Minutes avec messages réguliers (pause dès ${d.idle} min)`} v={`${int(me.activeMin)} min`} />
            <Kpi label="Messages / heure active" sub="Intensité pendant les phases actives" v={(me.activeMin ? me.messages / (me.activeMin / 60) : 0).toFixed(1)} />
            <Kpi label="Shifts" sub={`Coupure dès ${d.cut} min sans message`} v={me.shifts} />
            <Kpi label="Temps de réponse" sub={`Médiane ${secs(me.replyMedian)}`} v={secs(me.replyAvg)} />
          </div>
          <div className="mt-4 rounded-2xl p-5" style={tk.card}>
            <b className="text-[16px]" style={{ color: "var(--mp-head)" }}>Activité minute par minute</b>
            <p className="mt-1 text-[12px]">Nombre de messages envoyés à chaque minute. Les vides sont les pauses.</p>
            <Minutes points={d.minutes ?? []} start={d.start} end={Math.min(d.end, Date.now())} />
          </div>
        </>
      ) : tab === "one" && d?.chatters.length ? <p className="mt-4 rounded-2xl p-6 text-center text-[13.5px]" style={tk.card}>Choisis un chatteur.</p> : null}
    </div>
  );
}

/** Une barre par minute où le chatteur a écrit, sur toute la période. */
function Minutes({ points, start, end }: { points: [number, number][]; start: number; end: number }) {
  const [tip, setTip] = useState<[number, number] | null>(null);
  const W = 1000, H = 320, L = 34, R = 10, T = 12, B = 28;
  const max = Math.max(...points.map((p) => p[1]), 1);
  const x = (t: number) => L + ((t - start) / Math.max(1, end - start)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const span = end - start;
  const step = span <= 2 * 864e5 ? 3 * 3600e3 : span <= 8 * 864e5 ? 12 * 3600e3 : span <= 31 * 864e5 ? 3 * 864e5 : 7 * 864e5;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += step) ticks.push(t);
  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" onMouseLeave={() => setTip(null)} onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const t = start + ((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * span;
        let best: [number, number] | null = null;
        for (const p of points) if (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
        setTip(best && Math.abs(best[0] - t) < span / 60 ? best : null);
      }}>
        {Array.from({ length: max + 1 }, (_, v) => (max <= 8 || v % Math.ceil(max / 6) === 0 ? <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity=".05" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#878a99">{v}</text></g> : null))}
        {points.map((p) => <line key={p[0]} x1={x(p[0])} x2={x(p[0])} y1={y(0)} y2={y(p[1])} stroke="#1f6fff" strokeWidth="1.4" />)}
        {ticks.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="#878a99">{parisDate(t).slice(0, 5)} {parisTime(t)}</text>)}
      </svg>
      {tip ? <p className="pointer-events-none absolute top-2 right-3 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white" style={{ background: "#000c" }}>{parisDate(tip[0]).slice(0, 5)} {parisTime(tip[0])} · {tip[1]} message{tip[1] > 1 ? "s" : ""}</p> : null}
    </div>
  );
}
