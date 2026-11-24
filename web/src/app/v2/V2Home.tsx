"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowRight, MessageCircle, ScrollText, Images, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import type { Me } from "@/lib/types";

type Day = { day: string; onlyfans: number; mym: number; provisional: number };
type Row = { creatorId: string; platform: string | null; account?: string; eur: number; prev: number; sales: number };
type Sale = { id: string; creatorId: string; at: string; type: string; net: number; currency: string; fan: string | null; origin: string; by: string | null; provisional: boolean };
type Rev = { total: number; prev: number; provisional: number; sales: number; buyers: number; byType: Record<string, number>; byOrigin: Record<string, number>; days: Day[]; creators: Row[]; recent: Sale[] };

const paris = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
const addDay = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const eur = (c: number, digits = 0) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(c / 100);
const money = (c: number, cur: string) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur === "USD" ? "USD" : "EUR" }).format(c / 100);
const shortDay = (s: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${s}T12:00:00Z`));
const ORIGIN: Record<string, string> = { ai: "IA Substy", bloom: "Chatteurs dans Bloom", chatter: "Chatteurs (Infloww / MyPulse)", substy: "Automatisations Substy", auto: "Automatisations", sub: "Abonnements", creator: "Compte de la modèle", ext: "Hors Bloom", push: "Push", other: "Autre" };
const TYPE: Record<string, string> = { ppv: "Message payant", message: "Message payant", tip: "Pourboire", sub: "Abonnement", post: "Post", media: "Média", push: "Push" };
const isMym = (p?: string | null) => /mym/i.test(p || "");

/** Chiffre qui monte jusqu'à sa valeur. */
function Count({ value, format }: { value: number; format: (n: number) => string }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(value);
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setV(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(v)}</>;
}

/** Courbe lissée passant par les points. */
function path(pts: [number, number][]) {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

function Chart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900, H = 250, L = 8, R = 8, T = 14, B = 26;
  const max = Math.max(1, ...days.map((d) => d.onlyfans + d.mym + d.provisional)) * 1.12;
  const x = (i: number) => L + (days.length > 1 ? (i * (W - L - R)) / (days.length - 1) : 0);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const total = days.map((d, i): [number, number] => [x(i), y(d.onlyfans + d.mym + d.provisional)]);
  const mym = days.map((d, i): [number, number] => [x(i), y(d.mym)]);
  const base = H - B;
  const area = (p: [number, number][]) => (p.length ? `${path(p)} L${p[p.length - 1][0]},${base} L${p[0][0]},${base} Z` : "");
  const h = hover == null ? null : days[hover];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round((((e.clientX - r.left) / r.width) * W - L) / ((W - L - R) / Math.max(1, days.length - 1)));
        setHover(Math.max(0, Math.min(days.length - 1, i)));
      }}>
        <defs>
          <linearGradient id="v2a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity="0.42" /><stop offset="1" stopColor="#3b82f6" stopOpacity="0" /></linearGradient>
          <linearGradient id="v2b" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b7bff" stopOpacity="0.4" /><stop offset="1" stopColor="#8b7bff" stopOpacity="0" /></linearGradient>
          <linearGradient id="v2l" x1="0" x2="1"><stop offset="0" stopColor="#7cc4ff" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((k) => <line key={k} x1={L} x2={W - R} y1={y((max / 1.12) * k)} y2={y((max / 1.12) * k)} stroke="#1c2843" strokeDasharray="3 6" />)}
        <path d={area(total)} fill="url(#v2a)" className="v2-fade" />
        <path d={area(mym)} fill="url(#v2b)" className="v2-fade" />
        <path d={path(mym)} fill="none" stroke="#8b7bff" strokeWidth="2" pathLength={1} className="v2-draw" style={{ ["--len" as string]: 1 }} />
        <path d={path(total)} fill="none" stroke="url(#v2l)" strokeWidth="2.6" strokeLinecap="round" pathLength={1} className="v2-draw" style={{ ["--len" as string]: 1 }} />
        {days.map((d, i) => (i % Math.ceil(days.length / 7) === 0 || i === days.length - 1 ? <text key={d.day} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} fontSize="11" fill="#5f7199">{shortDay(d.day)}</text> : null))}
        {hover != null ? <g><line x1={x(hover)} x2={x(hover)} y1={T} y2={base} stroke="#3b82f6" strokeOpacity="0.5" /><circle cx={total[hover][0]} cy={total[hover][1]} r="5" fill="#060a14" stroke="#7cc4ff" strokeWidth="2.5" /><circle cx={mym[hover][0]} cy={mym[hover][1]} r="4" fill="#060a14" stroke="#8b7bff" strokeWidth="2" /></g> : null}
      </svg>
      {h && hover != null ? (
        <div className="pointer-events-none absolute top-1 z-10 w-44 rounded-xl border p-3 text-[12px] shadow-2xl" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 88px), calc(100% - 176px))`, background: "#0a1120", borderColor: "var(--color-line)" }}>
          <b className="block text-[12.5px]">{shortDay(h.day)}</b>
          <p className="mt-1.5 flex justify-between"><span className="text-muted">OnlyFans</span><b style={{ color: "var(--v2-of)" }}>{eur(h.onlyfans)}</b></p>
          <p className="flex justify-between"><span className="text-muted">MYM</span><b style={{ color: "var(--v2-mym)" }}>{eur(h.mym)}</b></p>
          {h.provisional ? <p className="flex justify-between"><span className="text-muted">En attente</span><b>{eur(h.provisional)}</b></p> : null}
          <p className="mt-1.5 flex justify-between border-t pt-1.5" style={{ borderColor: "var(--color-line)" }}><span>Total</span><b>{eur(h.onlyfans + h.mym + h.provisional)}</b></p>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ mym }: { mym: boolean }) {
  return <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide" style={{ color: mym ? "var(--v2-mym)" : "var(--v2-of)", background: mym ? "rgb(139 123 255 / 0.13)" : "rgb(56 168 255 / 0.13)" }}>{mym ? "MYM" : "OF"}</span>;
}

/** Accueil commun de la v2 : toute l'agence, OnlyFans et MYM ensemble. */
export function V2Home({ me }: { me: Me }) {
  const { creators } = useCreators();
  const boss = me.role !== "chatter";
  const [rev, setRev] = useState<Rev | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!boss) return;
    let stop = false;
    const load = () => {
      const to = paris();
      api<Rev>("GET", `/api/revenue?from=${addDay(to, -29)}&to=${to}&pf=all`).then((r) => !stop && (setRev(r), setErr(""))).catch((e) => !stop && setErr(e instanceof Error ? e.message : "Chiffres indisponibles"));
    };
    load();
    const t = setInterval(load, 60000);
    return () => (stop = true, clearInterval(t));
  }, [boss]);

  const k = useMemo(() => {
    const d = rev?.days ?? [];
    const sum = (l: Day[]) => l.reduce((a, x) => a + x.onlyfans + x.mym + x.provisional, 0);
    const today = sum(d.slice(-1));
    const yesterday = sum(d.slice(-2, -1));
    const w = sum(d.slice(-7));
    const wPrev = sum(d.slice(-14, -7));
    const of = d.reduce((a, x) => a + x.onlyfans, 0);
    const mym = d.reduce((a, x) => a + x.mym, 0);
    return { today, yesterday, w, wPrev, of, mym };
  }, [rev]);
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()));
  const hello = hour < 6 ? "Bonne nuit" : hour < 18 ? "Bonjour" : "Bonsoir";
  const first = (me.name || "").split(/[\s._-]/)[0];
  const nameOf = (id: string) => creators.find((c) => String(c.id) === String(id));

  if (!boss) {
    const links = [
      { href: "/v2/messagerie", label: "Messagerie", text: "Répondre aux fans", Icon: MessageCircle },
      { href: "/v2/scripts", label: "Scripts", text: "Les messages prêts à envoyer", Icon: ScrollText },
      { href: "/v2/fans", label: "Fans", text: "Listes et fiches", Icon: Users },
      { href: "/v2/medias", label: "Médias", text: "Photos et vidéos des modèles", Icon: Images },
    ];
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 md:px-8">
        <h1 className="v2-rise text-[34px] leading-tight font-semibold tracking-[-0.03em]">{hello} <span className="v2-grad">{first}</span></h1>
        <p className="v2-rise mt-2 text-muted" style={{ ["--i" as string]: 1 }}>Tes modèles : {creators.length ? creators.map((c) => c.name).join(", ") : "aucune pour l’instant, demande à ton team leader."}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {links.map((l, i) => (
            <Link key={l.href} href={l.href} className="v2-card v2-lift v2-rise flex items-center gap-4 p-5" style={{ ["--i" as string]: i + 2 }}>
              <span className="grid size-11 place-items-center rounded-xl" style={{ background: "rgb(59 130 246 / 0.14)", color: "var(--v2-sky)" }}><l.Icon className="size-5" /></span>
              <span className="min-w-0 flex-1"><b className="block">{l.label}</b><span className="text-[13px] text-muted">{l.text}</span></span>
              <ArrowRight className="size-4 text-muted" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const delta = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
  const tiles = [
    { label: "Aujourd’hui", value: k.today, d: delta(k.today, k.yesterday), sub: "par rapport à hier" },
    { label: "7 derniers jours", value: k.w, d: delta(k.w, k.wPrev), sub: "par rapport aux 7 jours d’avant" },
    { label: "30 derniers jours", value: rev?.total ?? 0, d: rev ? delta(rev.total, rev.prev) : null, sub: "par rapport aux 30 jours d’avant" },
  ];
  const rows = [...(rev?.creators ?? [])].filter((c) => c.eur > 0).sort((a, b) => b.eur - a.eur);
  const top = rows[0]?.eur || 1;
  const origins = Object.entries(rev?.byOrigin ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const oTotal = origins.reduce((a, [, v]) => a + v, 0) || 1;
  const split = k.of + k.mym || 1;

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 md:px-9 md:py-10">
      <div className="v2-rise flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-muted"><span className="v2-live" /> En direct · toute l’agence, OnlyFans et MYM</p>
          <h1 className="mt-2 text-[34px] leading-[1.1] font-semibold tracking-[-0.035em] md:text-[40px]">{hello} <span className="v2-grad">{first}</span></h1>
        </div>
        <Link href="/v2/messagerie" className="flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98]" style={{ background: "linear-gradient(135deg, var(--v2-blue), var(--v2-deep))", boxShadow: "0 10px 30px -12px rgb(59 130 246 / 0.9)" }}><MessageCircle className="size-4" /> Ouvrir la messagerie</Link>
      </div>
      {err ? <p className="mt-6 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#5b2530", background: "#1f0f15", color: "#ff9aa8" }}>{err}</p> : null}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {tiles.map((t, i) => (
          <div key={t.label} className="v2-card v2-lift v2-rise p-5" style={{ ["--i" as string]: i + 1 }}>
            <p className="text-[12.5px] font-medium text-muted">{t.label}</p>
            <p className={`mt-2 text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums ${i === 2 ? "v2-grad" : ""}`}>{rev ? <Count value={t.value} format={(n) => eur(n)} /> : <span className="text-muted">…</span>}</p>
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
              {t.d == null ? null : <span className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold" style={{ color: t.d >= 0 ? "#34d399" : "#fb7185", background: t.d >= 0 ? "rgb(52 211 153 / 0.12)" : "rgb(251 113 133 / 0.12)" }}>{t.d >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(t.d)} %</span>}
              {t.d == null ? "pas de comparaison" : t.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.75fr_1fr]">
        <div className="v2-card v2-rise p-5" style={{ ["--i" as string]: 4 }}>
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <b className="text-[15px]">Chiffre par jour</b>
            <span className="flex-1" />
            <span className="flex items-center gap-1.5 text-[12px] text-muted"><i className="size-2 rounded-full" style={{ background: "var(--v2-sky)" }} /> Total</span>
            <span className="flex items-center gap-1.5 text-[12px] text-muted"><i className="size-2 rounded-full" style={{ background: "var(--v2-mym)" }} /> dont MYM</span>
          </div>
          {rev ? <Chart days={rev.days} /> : <div className="h-[230px]" />}
        </div>
        <div className="v2-card v2-rise flex flex-col p-5" style={{ ["--i" as string]: 5 }}>
          <b className="text-[15px]">Les deux plateformes</b>
          <p className="mt-0.5 text-[12px] text-muted">30 derniers jours, tout en euros</p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full" style={{ background: "var(--color-card-2)" }}>
            <i className="v2-grow h-full" style={{ width: `${(k.of / split) * 100}%`, background: "linear-gradient(90deg, #7cc4ff, #3b82f6)" }} />
            <i className="v2-grow h-full" style={{ width: `${(k.mym / split) * 100}%`, background: "linear-gradient(90deg, #8b7bff, #6a55f0)", ["--i" as string]: 2 }} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[{ n: "OnlyFans", v: k.of, c: "var(--v2-of)" }, { n: "MYM", v: k.mym, c: "var(--v2-mym)" }].map((p) => (
              <div key={p.n} className="rounded-xl p-3.5" style={{ background: "var(--color-card-2)" }}>
                <p className="flex items-center gap-1.5 text-[12px] text-muted"><i className="size-2 rounded-full" style={{ background: p.c }} />{p.n}</p>
                <p className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">{eur(p.v)}</p>
                <p className="text-[11.5px] text-muted">{Math.round((p.v / split) * 100)} %</p>
              </div>
            ))}
          </div>
          <span className="flex-1" />
          <p className="mt-4 text-[12px] text-muted">{rev ? `${rev.sales.toLocaleString("fr-FR")} ventes · ${rev.buyers.toLocaleString("fr-FR")} acheteurs` : ""}{rev?.provisional ? ` · ${eur(rev.provisional)} en attente de confirmation` : ""}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="v2-card v2-rise p-5" style={{ ["--i" as string]: 6 }}>
          <b className="text-[15px]">Modèles</b>
          <div className="mt-4 space-y-3.5">
            {rows.length ? rows.map((r, i) => {
              const c = nameOf(r.creatorId);
              const mym = isMym(r.platform ?? c?.platform);
              const d = delta(r.eur, r.prev);
              return (
                <div key={`${r.creatorId}:${r.account}`} className="flex items-center gap-3">
                  {c?.avatar ? <img src={c.avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" /> : <span className="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "var(--color-card-2)" }}>{(c?.name || "?")[0]}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13.5px]"><b className="truncate">{c?.name || r.account || "Compte"}</b><Chip mym={mym} /><span className="flex-1" /><b className="tabular-nums">{eur(r.eur)}</b>{d == null ? null : <span className="w-12 text-right text-[11.5px] font-semibold" style={{ color: d >= 0 ? "#34d399" : "#fb7185" }}>{d >= 0 ? "+" : ""}{d} %</span>}</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--color-card-2)" }}><i className="v2-grow block h-full rounded-full" style={{ width: `${Math.max(2, (r.eur / top) * 100)}%`, background: mym ? "linear-gradient(90deg, #8b7bff, #6a55f0)" : "linear-gradient(90deg, #7cc4ff, #3b82f6)", ["--i" as string]: i }} /></div>
                  </div>
                </div>
              );
            }) : <p className="text-[13px] text-muted">{rev ? "Aucune vente sur la période." : "Chargement…"}</p>}
          </div>
        </div>
        <div className="v2-card v2-rise p-5" style={{ ["--i" as string]: 7 }}>
          <b className="text-[15px]">Qui a vendu</b>
          <div className="mt-4 space-y-3">
            {origins.length ? origins.map(([o, v], i) => (
              <div key={o}>
                <p className="flex items-center text-[13px]"><span className="truncate">{ORIGIN[o] || o}</span><span className="flex-1" /><b className="tabular-nums">{eur(v)}</b><span className="w-11 text-right text-[11.5px] text-muted">{Math.round((v / oTotal) * 100)} %</span></p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--color-card-2)" }}><i className="v2-grow block h-full rounded-full" style={{ width: `${Math.max(2, (v / oTotal) * 100)}%`, background: "linear-gradient(90deg, #7cc4ff, #3b82f6)", opacity: 1 - i * 0.12, ["--i" as string]: i }} /></div>
              </div>
            )) : <p className="text-[13px] text-muted">{rev ? "Rien à afficher." : "Chargement…"}</p>}
          </div>
        </div>
      </div>

      <div className="v2-card v2-rise mt-4 p-5" style={{ ["--i" as string]: 8 }}>
        <div className="flex items-center"><b className="text-[15px]">Dernières ventes</b><span className="flex-1" /><Link href="/v2/chiffres" className="flex items-center gap-1 text-[12.5px] font-medium" style={{ color: "var(--v2-sky)" }}>Tous les chiffres <ArrowRight className="size-3.5" /></Link></div>
        <div className="mt-3 divide-y" style={{ borderColor: "var(--color-line)" }}>
          {(rev?.recent ?? []).slice(0, 10).map((s) => {
            const c = nameOf(s.creatorId);
            return (
              <div key={s.id} className="flex items-center gap-3 py-2.5 text-[13px]" style={{ borderColor: "var(--color-line)" }}>
                <span className="w-12 shrink-0 text-[12px] text-muted tabular-nums">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(s.at))}</span>
                <span className="min-w-0 flex-1 truncate"><b>{s.fan || "Fan"}</b> <span className="text-muted">· {TYPE[s.type] || s.type} · {c?.name || "—"}</span></span>
                <span className="hidden truncate text-[12px] text-muted sm:block">{s.by || ORIGIN[s.origin] || ""}</span>
                <Chip mym={isMym(c?.platform) || s.currency === "EUR"} />
                <b className="w-20 text-right tabular-nums" style={s.provisional ? { opacity: 0.6 } : undefined}>{money(s.net, s.currency)}</b>
              </div>
            );
          })}
          {rev && !rev.recent.length ? <p className="py-3 text-[13px] text-muted">Aucune vente récente.</p> : null}
        </div>
      </div>
    </div>
  );
}
