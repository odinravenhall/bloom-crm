"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleDollarSign, Info, MessageCircle, Plus, Search, Settings, ShieldCheck, TrendingDown, TrendingUp, Users, UsersRound } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// MYM → Compte Creator : copie de « Mes Comptes » de MyPulse (ventes MyPulse de chaque modèle MYM, équipe, accès).
type Acc = {
  id: string; name: string; handle: string | null; avatar: string | null; total: number; delta: number | null; series: number[]; newSubs: number; error: string | null;
  fans: { active: number; old: number; interested: number; checked: number; payers: number }; team: { leads: number; chatters: number; total: number }; online: { name: string; avatar: string | null }[];
};
type Data = { days: number; mode: "net" | "gross"; role: string; perms: string[]; totals: { revenue: number; delta: number | null; perDay: number; series: number[]; active: number; old: number; interested: number; checked: number; newSubs: number; accounts: number; online: number }; accounts: Acc[] };
const eur = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ")} €`;
const int = (v: number) => v.toLocaleString("fr-FR").replace(/ | /g, " ");

/** Petite courbe (comme les sparklines de MyPulse). */
function Spark({ data, w = 110, h = 34, fill = false }: { data: number[]; w?: number; h?: number; fill?: boolean }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - (v / max) * (h - 3) - 1.5]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ maxWidth: fill ? undefined : w }}>
      {fill ? <path d={`${d} L${w},${h} L0,${h} Z`} fill="rgba(199,255,74,.10)" /> : null}
      <path d={d} fill="none" stroke="var(--mp-accent)" strokeWidth={fill ? 1.6 : 1.3} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function Delta({ v, isNew }: { v: number | null; isNew?: boolean }) {
  if (isNew) return <span className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(199,255,74,.15)", color: "var(--mp-accent)" }}>Nouveau</span>;
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: up ? "rgba(60,209,136,.15)" : "rgba(240,101,72,.15)", color: up ? "var(--mp-up)" : "var(--mp-down)" }}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{Math.abs(v)}%
    </span>
  );
}
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };

export function MymAccounts() {
  const { setCreator } = useCreators();
  const [days, setDays] = useState(90);
  const [mode, setMode] = useState<"net" | "gross">("net");
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    setD(null);
    api<Data>("GET", `/api/mym/accounts?days=${days}&mode=${mode}`).then(setD).catch((e) => toast((e as Error).message, "err"));
  }, [days, mode]);
  const shown = useMemo(() => (d?.accounts ?? []).filter((a) => !q || `${a.name} ${a.handle || ""}`.toLowerCase().includes(q.toLowerCase())), [d, q]);
  const T = d?.totals;

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      {/* En-tête « Vos comptes » */}
      <div className="relative overflow-hidden rounded-2xl p-6 md:p-7" style={{ background: "radial-gradient(120% 140% at 100% 0%, rgba(199,255,74,.16), transparent 55%), linear-gradient(135deg, #1d2219, #171a1d)", border: "1px solid rgba(199,255,74,.18)" }}>
        <p className="flex items-center gap-2 text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-accent)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Vos comptes</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold" style={{ color: "var(--mp-head)" }}>Mes Comptes</h1>
            <p className="mt-1 text-[13px]">Chiffre d’affaires, fans et équipe de chaque compte, au même endroit.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
              <span className="flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: "var(--mp-line)" }}><Users className="size-3.5" style={{ color: "var(--mp-accent)" }} /> Comptes : {T?.accounts ?? "…"}</span>
              <span className="flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: "var(--mp-line)" }}>MYM · {T?.accounts ?? "…"}</span>
              <span className="flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: "var(--mp-line)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-up)" }} /> En ligne : {T?.online ?? 0}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/app/employees" className="flex h-11 items-center gap-2 rounded-[14px] border px-4 text-[14px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)", background: "rgba(0,0,0,.25)" }}><UsersRound className="size-4" /> Accès globaux</Link>
            <span title="Les comptes MYM s’ajoutent dans Substy (et MyPulse pour les chiffres)" className="flex h-11 cursor-not-allowed items-center gap-2 rounded-[14px] px-5 text-[14.5px] font-semibold opacity-60" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}><Plus className="size-4" /> Ajouter un compte</span>
          </div>
        </div>
      </div>

      {/* Période + Net / Brut */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-muted)" }}>Période</span>
        <div className="flex rounded-lg p-1" style={card}>
          {[7, 14, 30, 60, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)} className="rounded-md px-3 py-1 text-[13px] font-medium" style={days === n ? { background: "var(--mp-accent)", color: "var(--mp-on-accent)" } : undefined}>{n} j</button>
          ))}
        </div>
        <span className="flex-1" />
        <div className="flex rounded-lg p-1" style={card}>
          {(["net", "gross"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="rounded-md px-3 py-1 text-[13px] font-medium" style={mode === m ? { background: "var(--mp-accent)", color: "var(--mp-on-accent)" } : undefined}>{m === "net" ? "Net" : "Brut"}</button>
          ))}
        </div>
      </div>

      {/* Chiffres */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl p-5 pb-0" style={{ background: "radial-gradient(90% 120% at 90% 0%, rgba(199,255,74,.14), transparent 60%), #1c2018", border: "1px solid rgba(199,255,74,.25)" }}>
          <p className="flex items-center gap-2 text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-accent)" }}><CircleDollarSign className="size-4" /> Chiffre d’affaires · {days} derniers jours <span title="Chiffres de Substy pour les comptes MYM"><Info className="size-3.5 opacity-70" /></span></p>
          <p className="mt-2 text-[38px] leading-none font-bold" style={{ color: "var(--mp-accent)" }}>{T ? eur(T.revenue) : "…"}</p>
          <p className="mt-3 flex items-center gap-2 text-[12px]"><Delta v={T?.delta ?? null} /> vs les {days} jours précédents</p>
          <p className="mt-2 text-[12px]">Moyenne / jour <b style={{ color: "var(--mp-head)" }}>{T ? eur(T.perDay) : "…"}</b></p>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{mode === "net" ? "Montants nets (après la part de MYM)" : "Montants bruts (payés par les fans)"}</p>
          <div className="-mx-5 mt-3">{T ? <Spark data={T.series} w={600} h={56} fill /> : <div className="h-14" />}</div>
        </div>
        <Kpi icon={<span className="text-[11px] font-black">m</span>} label="MYM" value={T ? eur(T.revenue) : "…"} foot={<><Delta v={T?.delta ?? null} /> Comptes : {T?.accounts ?? 0}</>} />
        <Kpi icon={<Users className="size-4" />} label="Abonnés actifs" value={T ? int(T.active) : "…"} foot={<>Somme des comptes affichés · {T ? int(T.newSubs) : 0} nouveaux sur la période</>} />
        <Kpi icon={<ShieldCheck className="size-4" />} label="Comptes" value={T ? String(T.accounts) : "…"} foot={<>{T?.online ?? 0} membre(s) de l’équipe en ligne</>} />
      </div>

      {/* Liste des comptes */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg p-1 text-[13px]" style={card}>
          <span className="rounded-md px-3 py-1 font-medium" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}>Tous {d?.accounts.length ?? ""}</span>
        </div>
        <span className="flex-1" />
        <label className="flex h-9 w-[260px] items-center gap-2 rounded-lg px-3 text-[13px]" style={card}>
          <Search className="size-4" style={{ color: "var(--mp-muted)" }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un compte..." className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
      </div>
      <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
        {shown.map((a) => (
          <div key={a.id} className="flex flex-col rounded-2xl p-3.5" style={{ ...card, borderTop: "2px solid var(--mp-purple)" }}>
            <div className="flex items-center gap-3 px-1 pt-1">
              <span className="relative">
                <Avatar src={a.avatar} name={a.name} size="size-11" rounded="rounded-xl" />
                <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-black text-[8px] font-black text-white">m</span>
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>{a.name}</p>
                <p className="flex items-center gap-2 text-[12px]" style={{ color: "var(--mp-muted)" }}>MYM{a.handle ? <span>@{a.handle}</span> : null}{a.error ? <span style={{ color: "var(--mp-down)" }}>chiffres indisponibles</span> : null}</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl p-3.5" style={{ background: "var(--mp-card-2)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-muted)" }}>CA · {days} j</p>
                  <p className="mt-1 text-[22px] font-semibold" style={{ color: "var(--mp-head)" }}>{eur(a.total)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Delta v={a.delta} />
                  <div className="w-[110px]"><Spark data={a.series} /></div>
                </div>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2 text-[12px]" style={{ borderColor: "var(--mp-line)" }}>
                <span>Nouveaux abonnés</span><b style={{ color: "var(--mp-head)" }}>{int(a.newSubs)}</b>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {([[int(a.fans.active), "Abonnés", "/app/mym/abonnes"], [int(a.fans.old), "Anciens", "/app/mym/anciens"], [int(a.fans.interested), "Intéressés", "/app/mym/interesses"]] as const).map(([v, l, href]) => (
                <Link key={l} href={href} onClick={() => setCreator(a.id)} className="rounded-xl px-3 py-2.5" style={{ border: "1px solid var(--mp-line)" }}>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>{v}</p>
                  <p className="text-[10.5px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-muted)" }}>{l}</p>
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 px-1 text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-muted)" }}>
              Collaborateurs
              <span title="Admins, managers, team leaders" className="flex items-center gap-1 rounded px-1.5 py-0.5 normal-case" style={{ background: "rgba(60,209,136,.15)", color: "var(--mp-up)" }}><BadgeCheck className="size-3" />{a.team.leads}</span>
              <span title="Chatteurs" className="flex items-center gap-1 rounded px-1.5 py-0.5 normal-case" style={{ background: "rgba(247,184,75,.15)", color: "#f7b84b" }}><MessageCircle className="size-3" />{a.team.chatters}</span>
              <span className="flex items-center gap-1 normal-case"><Users className="size-3" />{a.team.total}</span>
              <span className="flex-1" />
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: a.online.length ? "var(--mp-up)" : "var(--mp-muted)" }} /> En ligne :</span>
              {a.online.length ? (
                <span className="flex -space-x-1.5">{a.online.slice(0, 5).map((o) => <span key={o.name} title={o.name} className="ring-2 ring-[var(--mp-card)] rounded-full"><Avatar src={o.avatar} name={o.name} size="size-6" /></span>)}</span>
              ) : <span className="normal-case">Personne</span>}
            </div>
            <p className="mt-3 px-1 text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-muted)" }}>Vos permissions</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
              <span className="rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{d?.role}</span>
              {(d?.perms ?? []).slice(0, 4).map((p) => <span key={p} className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--mp-line)" }}>{p}</span>)}
              {(d?.perms.length ?? 0) > 4 ? <span className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--mp-line)" }}>+{d!.perms.length - 4}</span> : null}
            </div>
            <span className="flex-1" />
            <Link href={`/app/messagerie?c=${encodeURIComponent(a.id)}`} onClick={() => setCreator(a.id)} className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}>Accéder <ArrowRight className="size-4" /></Link>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link href="/app/employees" className="flex h-9 items-center justify-center gap-1.5 rounded-xl border text-[13px]" style={{ borderColor: "var(--mp-line)" }}><UsersRound className="size-4" /> Équipe</Link>
              <Link href="/app/ia" onClick={() => setCreator(a.id)} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border text-[13px]" style={{ borderColor: "var(--mp-line)" }}><Settings className="size-4" /> Réglages</Link>
            </div>
          </div>
        ))}
        {d && !shown.length ? <p className="py-12 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>Aucun compte</p> : null}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, foot }: { icon: React.ReactNode; label: string; value: string; foot: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl p-5" style={card}>
      <p className="flex items-center gap-2 text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--mp-muted)" }}>
        <span className="grid size-7 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{icon}</span>{label}
      </p>
      <p className="mt-auto pt-6 text-[24px] font-semibold" style={{ color: "var(--mp-head)" }}>{value}</p>
      <p className="mt-auto flex items-center gap-2 pt-6 text-[12px]" style={{ color: "var(--mp-muted)" }}>{foot}</p>
    </div>
  );
}
