"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Kpis, TrackChart, addDay, money, num, tcard, type TData } from "../../app/mym/MymTrackKit";

type Shared = TData & { name: string };
const parisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

export function ShareView({ token }: { token: string }) {
  const [dates, setDates] = useState<[string, string]>(() => [addDay(parisToday(), -29), parisToday()]);
  const [d, setD] = useState<Shared | null>(null);
  const [need, setNeed] = useState(false);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/public/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password, from: dates[0], to: dates[1] }), cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return setD(j), setNeed(false), setErr("");
    setD(null);
    setNeed(!!j.needPassword);
    setErr(j.error || (j.needPassword ? "" : `Erreur ${r.status}`));
  }, [token, password, dates]);
  useEffect(() => void load().catch(() => setErr("Connexion impossible.")), [load]);
  return (
    <div className="mp-font min-h-screen p-4 md:p-8" style={{ background: "#14161b", color: "#aab0bd" }}>
      <div className="mx-auto max-w-6xl">
        {d ? (
          <>
            <h1 className="text-[22px] font-bold" style={{ color: "#f3f4f6" }}>{d.name}</h1>
            <p className="text-[12.5px]">Liens de suivi MYM · chiffres relevés chez MYM{d.at ? ` le ${new Date(d.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
            <div className="mt-4"><Kpis links={d.links} /></div>
            <div className="mt-4"><TrackChart d={d} dates={dates} setDates={(r) => setDates(r)} /></div>
            <div className="mt-4 overflow-x-auto rounded-2xl" style={tcard}>
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr className="text-[11px] tracking-wider uppercase">{["Lien", "Clics", "Abonnés", "Taux", "Revenus", "LTV (sur conv.)"].map((h, i) => <th key={h} className={`border-b px-5 py-4 font-bold ${i ? "text-center" : "text-left"}`} style={{ borderColor: "#2a2e37" }}>{h}</th>)}</tr></thead>
                <tbody>{d.links.map((l) => <tr key={l.id} className="border-b last:border-0" style={{ borderColor: "#2a2e37" }}><td className="px-5 py-4 font-bold" style={{ color: "#f3f4f6" }}>{l.name}</td><td className="px-5 text-center">{num(l.clicks)}</td><td className="px-5 text-center">{num(l.subs)}</td><td className="px-5 text-center">{(l.clicks ? (l.subs / l.clicks) * 100 : 0).toFixed(2)} %</td><td className="px-5 text-center font-bold" style={{ color: "#f3f4f6" }}>{money(l.total)}</td><td className="px-5 text-center">{money(l.subs ? l.total / l.subs : 0)}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : need ? (
          <form onSubmit={(e) => (e.preventDefault(), setPassword(typed))} className="mx-auto mt-24 max-w-sm rounded-2xl p-6" style={tcard}>
            <p className="flex items-center gap-2 text-[17px] font-bold" style={{ color: "#f3f4f6" }}><Lock className="size-4" /> Page protégée</p>
            <p className="mt-2 text-[13px]">Entre le mot de passe qu’on t’a donné pour voir ces statistiques.</p>
            <input type="password" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-4 h-11 w-full rounded-lg px-4 outline-none" style={{ background: "#12141a", border: "1px solid #2a2e37", color: "#f3f4f6" }} />
            {err ? <p className="mt-2 text-[13px]" style={{ color: "#f06548" }}>{err}</p> : null}
            <button className="mt-4 h-10 w-full rounded-lg text-[13.5px] font-semibold text-white" style={{ background: "#3b5bff" }}>Voir</button>
          </form>
        ) : <p className="mt-24 text-center text-[14px]">{err || "Chargement…"}</p>}
      </div>
    </div>
  );
}
