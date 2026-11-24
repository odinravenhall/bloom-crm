"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Maximize, MessageCircle, Monitor, Pause, Play, Search, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { tk } from "./MymTeamKit";

// MYM → Pilotage d'équipe → En direct : copie de « Équipe en direct » de MyPulse. Qui a Bloom ouvert maintenant, sur
// quelle page, quel compte, quel fan, depuis quel appareil. Mis à jour toutes les 10 secondes.
type Person = { userId: number; name: string; avatar: string | null; role: string | null; since: number; at: number; page: string | null; active: boolean; device: { label: string; kind: "desktop" | "mobile" | "unknown" }; country: string | null; creator: string | null; hidden: boolean; fan: string | null };
type Data = { now: number; people: Person[]; creators: { id: string; name: string }[] };
const LIME = { background: "var(--mp-accent)", color: "var(--mp-on-accent)" };
const PAGES: [RegExp, string][] = [[/chatting/, "Chat"], [/switchboard/, "Switchboard"], [/messagerie|^\/pro/, "Messagerie"], [/message-dashboard|ventes-equipe|shifts|activite|en-direct|moderation|equipe/, "Pilotage d’équipe"], [/stats|analytique|transactions|liens/, "Stats"], [/push|mods|massdm|envoi/, "Envois groupés"], [/scripts/, "Scripts"], [/planification|feed|amis|importer|vault/, "Médias"], [/abonnes|anciens|interesses|groupes|fans/, "Fans"]];
const pageName = (p: string | null) => (p ? PAGES.find(([re]) => re.test(p))?.[1] || "Bloom" : "Bloom");
const ago = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? "moins d’une minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const countryName = (c: string | null) => {
  if (!c || c === "XX") return "Pays inconnu";
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(c) || c;
  } catch {
    return c;
  }
};

export function MymLive() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "idle">("all");
  const [account, setAccount] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (paused) return;
    let dead = false;
    const load = () => api<Data>("GET", "/api/mym/live").then((r) => !dead && (setD(r), setErr(""), setAt(Date.now()))).catch((e) => !dead && setErr((e as Error).message));
    load();
    const t = setInterval(load, 10_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [paused]);
  const people = useMemo(() => (d?.people ?? []).filter((p) => (filter === "all" || (filter === "active") === p.active) && (!account || p.creator === account) && (!q.trim() || `${p.name} ${p.creator ?? ""} ${p.fan ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [d, filter, account, q]);
  const all = d?.people ?? [];
  const count = <T,>(key: (p: Person) => T) => {
    const m = new Map<T, number>();
    for (const p of all) m.set(key(p), (m.get(key(p)) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const covered = (d?.creators ?? []).map((c) => ({ name: c.name, n: all.filter((p) => p.creator === c.name).length }));
  const Bars = ({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: [string, number][] }) => (
    <div className="rounded-2xl p-5" style={tk.card}>
      <p className="flex items-center gap-2 text-[15px] font-bold" style={{ color: "var(--mp-head)" }}><span style={{ color: "var(--mp-accent)" }}>{icon}</span>{title}</p>
      <div className="mt-3 space-y-3">{rows.map(([l, n]) => <div key={l}><p className="flex justify-between text-[13px]" style={{ color: "var(--mp-head)" }}><span>{l}</span><b>{n}</b></p><p className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--mp-card-2)" }}><span className="block h-full rounded-full" style={{ width: `${Math.max(4, (n / Math.max(1, all.length)) * 100)}%`, background: "var(--mp-accent)" }} /></p></div>)}{!rows.length ? <p className="text-[12.5px]">—</p> : null}</div>
    </div>
  );
  const doing = (p: Person) => <span className="flex min-w-0 flex-wrap items-center gap-x-2"><b style={{ color: "var(--mp-head)" }}>{pageName(p.page)}</b>{p.creator ? <span>sur {p.creator}</span> : p.hidden ? <i>sur un compte hors de votre périmètre</i> : null}{p.fan ? <span className="flex items-center gap-1" style={{ color: "var(--mp-head)" }}><MessageCircle className="size-3.5" style={{ color: "var(--mp-accent)" }} /> parle à {p.fan}</span> : null}</span>;
  const Initial = ({ p }: { p: Person }) => <span className="grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-bold" style={{ border: "2px solid var(--mp-accent)", color: "var(--mp-head)" }}>{(p.name || "?")[0].toUpperCase()}</span>;
  const Status = ({ p }: { p: Person }) => <span className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: p.active ? "var(--mp-accent)" : "var(--mp-muted)" }}><span className="size-2 rounded-full" style={{ background: p.active ? "var(--mp-accent)" : "#878a99" }} />{p.active ? "Actif" : "Inactif"}</span>;
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-6" style={{ background: "radial-gradient(70% 140% at 85% 0%, rgba(199,255,74,.13), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.25)" }}>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> En direct</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>Équipe en direct</h1>
          <p className="mt-1 max-w-2xl text-[13.5px]">Qui a Bloom ouvert maintenant, depuis quel appareil, et ce qu’il fait. Mis à jour toutes les 10 secondes.</p>
        </div>
        <div className="text-right"><p className="text-[48px] leading-none font-bold" style={{ color: "var(--mp-head)" }}>{all.length}</p><p className="text-[12.5px]">connectés en ce moment</p><p className="text-[11.5px]">{paused ? "En pause" : at ? "Mis à jour à l’instant" : "…"}</p></div>
        <div className="flex flex-col gap-2">
          <button onClick={() => setPaused(!paused)} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "#3d4a2c", color: "var(--mp-head)" }}>{paused ? <Play className="size-4" /> : <Pause className="size-4" />} {paused ? "Reprendre" : "Pause"}</button>
          <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}))} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "#3d4a2c", color: "var(--mp-head)" }}><Maximize className="size-4" /> Plein écran</button>
        </div>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={account} onChange={(e) => setAccount(e.target.value)} className="h-11 rounded-xl px-3 text-[13.5px] outline-none" style={tk.inp}><option value="">Tous les comptes</option>{(d?.creators ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
        <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-xl px-3" style={tk.inp}><Search className="size-4" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Membre, compte ou fan…" className="w-full bg-transparent text-[13.5px] outline-none" /></label>
        <span className="flex rounded-xl p-1 text-[13px]" style={tk.card}>{([["all", "Tous", all.length], ["active", "Actifs", all.filter((p) => p.active).length], ["idle", "Inactifs", all.filter((p) => !p.active).length]] as const).map(([k, l, n]) => <button key={k} onClick={() => setFilter(k)} className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={filter === k ? { ...LIME, fontWeight: 700 } : undefined}>{l} <b>{n}</b></button>)}</span>
        <span className="flex rounded-xl p-1" style={tk.card}><button onClick={() => setView("grid")} className="grid size-8 place-items-center rounded-lg" style={view === "grid" ? LIME : undefined}><LayoutGrid className="size-4" /></button><button onClick={() => setView("list")} className="grid size-8 place-items-center rounded-lg" style={view === "list" ? LIME : undefined}><List className="size-4" /></button></span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([["Actifs", all.filter((p) => p.active).length, <Zap key="a" className="size-5" />], ["Connectés", all.length, <Monitor key="b" className="size-5" />], ["Comptes couverts", `${covered.filter((c) => c.n).length}/${covered.length}`, <ShieldCheck key="c" className="size-5" />], ["Sur un fan", all.filter((p) => p.fan).length, <MessageCircle key="d" className="size-5" />]] as [string, number | string, React.ReactNode][]).map(([l, v, icon]) => <div key={l} className="flex items-center gap-4 rounded-2xl p-4" style={tk.card}><span className="grid size-10 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{icon}</span><div><p className="text-[12.5px]">{l}</p><p className="text-[24px] leading-tight font-bold" style={{ color: "var(--mp-head)" }}>{v}</p></div></div>)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[3fr_1fr]">
        <div className={view === "grid" ? "grid content-start gap-4 md:grid-cols-2" : "space-y-2"}>
          {people.map((p) => view === "grid" ? (
            <div key={p.userId} className="rounded-2xl p-5" style={tk.card}>
              <p className="flex items-center gap-3"><Initial p={p} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b className="text-[16px]" style={{ color: "var(--mp-head)" }}>{p.name}</b>{p.role ? <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--mp-line)" }}>{p.role}</span> : null}<Status p={p} /></span><span className="block text-[12.5px]">Connecté depuis {ago(d!.now - p.since)}</span></span></p>
              <div className="mt-4 rounded-xl p-4" style={{ background: "var(--mp-card-2)", border: "1px solid var(--mp-line)" }}>
                <p className="flex items-center gap-3 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>{p.device.kind === "mobile" ? <Smartphone className="size-4" /> : <Monitor className="size-4" />}{p.device.label}</p>
                <p className="mt-0.5 pl-7 text-[12.5px]">{countryName(p.country)}</p>
                <p className="mt-3 flex items-center gap-2 text-[13px]"><span className="size-2 shrink-0 rounded-full" style={{ background: p.active ? "var(--mp-accent)" : "#878a99" }} />{doing(p)}</p>
              </div>
            </div>
          ) : (
            <p key={p.userId} className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-[13px]" style={tk.card}><Initial p={p} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b className="text-[15px]" style={{ color: "var(--mp-head)" }}>{p.name}</b>{p.role ? <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--mp-line)" }}>{p.role}</span> : null}<Status p={p} /></span><span className="flex flex-wrap gap-x-2">{doing(p)}<span>· {p.device.label} · {countryName(p.country)} · Connecté depuis {ago(d!.now - p.since)}</span></span></span></p>
          ))}
          {d && !people.length ? <p className="rounded-2xl p-8 text-center text-[13.5px]" style={tk.card}>Personne ne correspond.</p> : null}
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl p-5" style={tk.card}>
            <p className="flex items-center gap-2 text-[15px] font-bold" style={{ color: "var(--mp-head)" }}><ShieldCheck className="size-4" style={{ color: "var(--mp-accent)" }} /> Couverture des comptes</p>
            <p className="mt-1 text-[12.5px]">Comptes avec quelqu’un dessus : {covered.filter((c) => c.n).length} sur {covered.length}.</p>
            <div className="mt-3 space-y-3">{covered.map((c) => <div key={c.name}><p className="flex justify-between text-[13px]" style={{ color: "var(--mp-head)" }}><span>{c.name}</span><b>{c.n}</b></p><p className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--mp-card-2)" }}><span className="block h-full rounded-full" style={{ width: c.n ? "100%" : "0%", background: "var(--mp-accent)" }} /></p></div>)}</div>
          </div>
          <Bars title="Connexions par pays" icon={<Zap className="size-4" />} rows={count((p) => countryName(p.country))} />
          <Bars title="Appareils" icon={<Monitor className="size-4" />} rows={count((p) => (p.device.kind === "desktop" ? "Ordinateur" : p.device.kind === "mobile" ? "Mobile" : "Inconnu"))} />
        </div>
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>« Actif » = sur le chat ou un fan ouvert ; « Inactif » = Bloom ouvert sur une autre page. Une personne compte une fois, sur son dernier appareil. Le pays n’apparaît que si l’hébergeur le transmet ; Bloom ne connaît pas la ville.</p>
    </div>
  );
}
