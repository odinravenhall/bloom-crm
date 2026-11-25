"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown, CircleDollarSign, Gift, Heart, Image as ImageIcon, Images, LineChart, MessageCircle, MessageSquare, Radio,
  Receipt, ScrollText, ShoppingBag, Sparkles, Users, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import type { Me } from "@/lib/types";
import { Avatar } from "@/rv/components/ui";

// Accueil de la v2 : toute l'agence, OnlyFans et MYM réunis. Mise en page inspirée de Moby (grande carte du total,
// pastilles de période, classement) et de Raven CRM (pastilles de variation, barres comparées, répartition).
type Day = { day: string; onlyfans: number; mym: number; provisional: number };
type Row = { creatorId: string; platform: string | null; account?: string; eur: number; prev: number; sales: number };
type Sale = { id: string; creatorId: string; at: string; type: string; net: number; currency: string; fan: string | null; origin: string; by: string | null; provisional: boolean };
type Rev = { total: number; prev: number; provisional: number; sales: number; buyers: number; byType: Record<string, number>; byOrigin: Record<string, number>; days: Day[]; creators: Row[]; recent: Sale[] };
type Seller = { key: string; name: string; kind: string; eur: number; prev: number; sales: number; buyers: number };
type Perf = { sellers: Seller[] };
type PeriodKey = "today" | "yesterday" | "7d" | "month" | "30d" | "12m";
type Data = { key: string; rev: Rev; ctx: Rev | null; perf: Perf | null; from: string; to: string; len: number };
type Pt = { key: string; label: string; title: string; of: number; mym: number; wait: number; prev: number | null; dim?: boolean };

const PERIODS: [PeriodKey, string][] = [["today", "Aujourd’hui"], ["yesterday", "Hier"], ["7d", "7 jours"], ["month", "Ce mois"], ["30d", "30 jours"], ["12m", "12 mois"]];
const OF = "#3b82f6";
const MYM = "#a78bfa";
const WAIT = "rgb(255 255 255 / 0.28)";
const ORIGIN: Record<string, [string, string]> = {
  ai: ["IA Substy", "#3b82f6"], bloom: ["Chatteurs dans Bloom", "#a78bfa"], chatter: ["Chatteurs (Infloww / MyPulse)", "#34d399"], substy: ["Automatisations", "#fbbf24"], auto: ["Automatisations", "#fbbf24"],
  sub: ["Abonnements", "#38bdf8"], creator: ["Compte de la modèle", "#f472b6"], ext: ["Hors Bloom", "#fb923c"], push: ["Push", "#22d3ee"], other: ["Autre", "#6b7280"],
};
const TYPES: [string, string, LucideIcon][] = [["ppv", "Messages payants", MessageSquare], ["tip", "Pourboires", Gift], ["sub", "Abonnements", Heart], ["post", "Posts", ImageIcon], ["stream", "Lives", Radio], ["other", "Autres", CircleDollarSign]];
const TYPE_ONE: Record<string, string> = { ppv: "Message payant", tip: "Pourboire", sub: "Abonnement", post: "Post", stream: "Live", other: "Vente" };
const TYPE_COLOR: Record<string, string> = { ppv: "#3b82f6", tip: "#a78bfa", sub: "#38bdf8", post: "#34d399", stream: "#fbbf24", other: "#6b7280" };

const paris = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
const noon = (s: string) => new Date(`${s}T12:00:00Z`);
const addDay = (s: string, n: number) => {
  const d = noon(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((noon(b).getTime() - noon(a).getTime()) / 864e5);
const eur = (c: number, digits = 0) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(c / 100);
const money = (c: number, cur: string) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur === "USD" ? "USD" : "EUR", currencyDisplay: "narrowSymbol" }).format(c / 100);
const fmtDay = (s: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...o, timeZone: "UTC" }).format(noon(s));
const isMym = (p?: string | null) => /mym/i.test(p || "");
const ago = (iso: string) => {
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return "à l’instant";
  if (ms < 3600_000) return `il y a ${Math.floor(ms / 60_000)} min`;
  if (ms < 86400_000) return `il y a ${Math.floor(ms / 3600_000)} h`;
  return `il y a ${Math.floor(ms / 86400_000)} j`;
};
function rangeOf(k: PeriodKey) {
  const t = paris();
  if (k === "today") return { from: t, to: t };
  if (k === "yesterday") return { from: addDay(t, -1), to: addDay(t, -1) };
  if (k === "7d") return { from: addDay(t, -6), to: t };
  if (k === "month") return { from: t.slice(0, 8) + "01", to: t };
  if (k === "30d") return { from: addDay(t, -29), to: t };
  return { from: addDay(t, -364), to: t };
}
/** Haut d'échelle « rond » dont le quart tombe juste (0, 200, 400, 600, 800…). */
const niceMax = (v: number) => {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return ([1, 1.2, 1.6, 2, 3, 4, 6, 8, 10].find((x) => n <= x) ?? 10) * p;
};

/** Chiffre qui monte jusqu'à sa valeur. */
function Count({ value, format }: { value: number; format: (n: number) => string }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (document.documentElement.classList.contains("motion-off") || matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(value);
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setV(a + (value - a) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => (cancelAnimationFrame(raf), void (from.current = value));
  }, [value]);
  return <>{format(v)}</>;
}

/** Pastille de variation par rapport à la période d'avant. */
function Delta({ now, before }: { now: number; before: number }) {
  if (!(before > 0)) return now > 0 ? <span className="v2-delta" data-dir="up">nouveau</span> : <span className="v2-delta" data-dir="flat">—</span>;
  const p = ((now - before) / before) * 100;
  const dir = Math.abs(p) < 0.5 ? "flat" : p > 0 ? "up" : "down";
  const a = Math.abs(p);
  return (
    <span className="v2-delta" data-dir={dir}>
      {dir === "up" ? <ArrowUpRight className="size-3" /> : dir === "down" ? <ArrowDownRight className="size-3" /> : null}
      {a >= 100 ? Math.round(a) : a.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
    </span>
  );
}

function PfTag({ mym }: { mym: boolean }) {
  return <span className="v2-tag" style={{ color: mym ? MYM : "#7dd3fc", background: mym ? "rgb(167 139 250 / 0.13)" : "rgb(56 189 248 / 0.12)" }}>{mym ? "MYM" : "OF"}</span>;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
/** Rectangle aux coins du haut arrondis. */
const topRound = (x: number, y: number, w: number, h: number, r: number) => {
  const q = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h} L${x},${y + q} Q${x},${y} ${x + q},${y} L${x + w - q},${y} Q${x + w},${y} ${x + w},${y + q} L${x + w},${y + h} Z`;
};
/** Courbe lissée passant par les points. */
const smooth = (pts: [number, number][]) => {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
};

/** Le graphique : barres empilées par plateforme, ou comparées à la période d'avant ; ou en courbe. */
function Chart({ pts, mode, compare }: { pts: Pt[]; mode: "bars" | "line"; compare: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 300, L = 50, R = 6, T = 14, B = 28;
  const n = pts.length;
  const tot = (p: Pt) => p.of + p.mym + p.wait;
  const max = niceMax(Math.max(1, ...pts.map((p) => Math.max(tot(p), compare ? p.prev ?? 0 : 0))));
  const iw = Math.max(0, w - L - R);
  const band = n ? iw / n : 0;
  const base = H - B;
  const y = (v: number) => T + (base - T) * (1 - v / max);
  const cx = (i: number) => L + band * i + band / 2;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 40))));
  const h = hover == null ? null : pts[hover];
  const line = pts.map((p, i): [number, number] => [cx(i), y(tot(p))]);
  const lineMym = pts.map((p, i): [number, number] => [cx(i), y(p.mym)]);
  const linePrev = pts.map((p, i): [number, number] => [cx(i), y(p.prev ?? 0)]);
  return (
    <div ref={ref} className="relative mt-3">
      {w ? (
        <svg width={w} height={H} className="block" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="v2area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={OF} stopOpacity="0.32" /><stop offset="1" stopColor={OF} stopOpacity="0" /></linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line x1={L} x2={w - R} y1={y(max * k)} y2={y(max * k)} stroke="rgb(255 255 255 / 0.06)" strokeDasharray={k ? "3 5" : undefined} />
              <text x={L - 10} y={y(max * k) + 4} textAnchor="end" fontSize="11" fill="#7c7c84">{eur(max * k)}</text>
            </g>
          ))}
          {hover != null ? <rect x={L + band * hover} y={T - 4} width={band} height={base - T + 4} rx="6" fill="rgb(255 255 255 / 0.04)" /> : null}
          {mode === "bars" ? pts.map((p, i) => {
            const bw = Math.max(2, Math.min(compare ? 13 : 26, band * (compare ? 0.34 : 0.62)));
            const x0 = compare ? cx(i) + 1 : cx(i) - bw / 2;
            const parts = (compare ? [[tot(p), OF]] : [[p.of, OF], [p.mym, MYM], [p.wait, WAIT]]).filter((s) => (s[0] as number) > 0) as [number, string][];
            let acc = 0;
            return (
              <g key={p.key} opacity={p.dim ? 0.3 : 1}>
                {compare && p.prev ? <path className="v2-bar" style={{ ["--i" as string]: i }} d={topRound(cx(i) - bw - 1, y(p.prev), bw, base - y(p.prev), 3)} fill="#3a3a42" /> : null}
                <g className="v2-bar" style={{ ["--i" as string]: i }}>
                  {parts.map(([v, c], k) => {
                    const y1 = y(acc + v);
                    const hh = y(acc) - y1;
                    acc += v;
                    return k === parts.length - 1 ? <path key={k} d={topRound(x0, y1, bw, hh, 3.5)} fill={c} /> : <rect key={k} x={x0} y={y1} width={bw} height={hh} fill={c} />;
                  })}
                </g>
              </g>
            );
          }) : !n ? null : (
            <g>
              <path d={`${smooth(line)} L${line[n - 1]?.[0] ?? L},${base} L${line[0]?.[0] ?? L},${base} Z`} fill="url(#v2area)" className="v2-fade-in" />
              {compare ? <path d={smooth(linePrev)} fill="none" stroke="#5b5b64" strokeWidth="1.6" strokeDasharray="4 5" /> : <path d={smooth(lineMym)} fill="none" stroke={MYM} strokeWidth="1.8" pathLength={1} className="v2-draw" />}
              <path d={smooth(line)} fill="none" stroke={OF} strokeWidth="2.4" strokeLinecap="round" pathLength={1} className="v2-draw" />
              {hover != null ? <circle cx={line[hover][0]} cy={line[hover][1]} r="4.5" fill="#050506" stroke="#93c5fd" strokeWidth="2.2" /> : null}
            </g>
          )}
          {pts.map((p, i) => (i % every === 0 ? <text key={p.key} x={cx(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={p.dim ? "#4b4b52" : "#7c7c84"}>{p.label}</text> : null))}
          {pts.map((p, i) => <rect key={p.key} x={L + band * i} y={0} width={band} height={base} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        </svg>
      ) : <div style={{ height: H }} />}
      {h && hover != null ? (
        <div className="pointer-events-none absolute top-1 z-10 w-[196px] rounded-xl border p-3 text-[12px]" style={{ left: Math.max(0, Math.min(w - 196, cx(hover) - 98)), background: "#121215", borderColor: "rgb(255 255 255 / 0.1)", boxShadow: "0 18px 40px -18px rgb(0 0 0 / 0.9)" }}>
          <b className="block text-[12.5px] first-letter:uppercase">{h.title}</b>
          {compare ? null : (
            <>
              <p className="mt-2 flex justify-between"><span className="flex items-center gap-1.5 text-muted"><i className="size-2 rounded-sm" style={{ background: OF }} />OnlyFans</span><b className="v2-num">{eur(h.of)}</b></p>
              <p className="mt-0.5 flex justify-between"><span className="flex items-center gap-1.5 text-muted"><i className="size-2 rounded-sm" style={{ background: MYM }} />MYM</span><b className="v2-num">{eur(h.mym)}</b></p>
              {h.wait ? <p className="mt-0.5 flex justify-between"><span className="flex items-center gap-1.5 text-muted"><i className="size-2 rounded-sm" style={{ background: WAIT }} />En attente</span><b className="v2-num">{eur(h.wait)}</b></p> : null}
            </>
          )}
          <p className={`flex justify-between ${compare ? "mt-2" : "mt-2 border-t pt-2"}`} style={{ borderColor: "rgb(255 255 255 / 0.08)" }}><span>Total</span><b className="v2-num">{eur(tot(h))}</b></p>
          {compare && h.prev != null ? <p className="mt-0.5 flex items-center justify-between text-muted"><span>Période d’avant</span><span className="flex items-center gap-1.5"><span className="v2-num">{eur(h.prev)}</span><Delta now={tot(h)} before={h.prev} /></span></p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Anneau de répartition (comme Raven) : la plus grosse part au centre. */
function Donut({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((a, x) => a + x.value, 0);
  const r = 54;
  const C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="relative mx-auto size-[176px]">
      <svg viewBox="0 0 140 140" className="size-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth="15" />
        {total > 0 ? items.map((it) => {
          const share = (it.value / total) * C;
          const len = Math.max(0.5, share - (items.length > 1 ? 2.5 : 0));
          const el = <circle key={it.label} className="v2-arc" cx="70" cy="70" r={r} fill="none" stroke={it.color} strokeWidth="15" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} style={{ ["--circ" as string]: C }} />;
          off += share;
          return el;
        }) : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="v2-num text-[25px] leading-none font-bold">{total > 0 && items[0] ? Math.round((items[0].value / total) * 100) : 0} %</p>
          <p className="mx-auto mt-1.5 max-w-[92px] truncate text-[11px] text-muted">{items[0]?.label ?? "Aucune vente"}</p>
        </div>
      </div>
    </div>
  );
}

/** Barre de progression fine sous une ligne de classement (comme Moby). */
function Progress({ value, max, color, i }: { value: number; max: number; color: string; i: number }) {
  return <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}><i className="v2-grow block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, (value / (max || 1)) * 100))}%`, background: color, ["--i" as string]: i }} /></div>;
}

export function V2Home({ me }: { me: Me }) {
  const { creators } = useCreators();
  const staff = me.role === "admin" || me.role === "manager" || me.role === "lead";
  const canSeeNumbers = me.role !== "chatter";
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [only, setOnly] = useState("");
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<"bars" | "line">("bars");
  const [cmp, setCmp] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const key = `${period}|${only}`;
  useEffect(() => {
    try {
      const p = localStorage.getItem("bloom.v2.home.period") as PeriodKey | null;
      if (p && PERIODS.some(([k]) => k === p)) setPeriod(p);
      if (localStorage.getItem("bloom.v2.home.mode") === "line") setMode("line");
    } catch {}
  }, []);
  const save = (k: string, v: string) => {
    try {
      localStorage.setItem("bloom.v2.home." + k, v);
    } catch {}
  };
  useEffect(() => {
    if (!canSeeNumbers) return;
    let stop = false;
    const q = `&pf=all${only ? `&only=${encodeURIComponent(only)}` : ""}`;
    const load = () => {
      const { from, to } = rangeOf(period);
      const len = daysBetween(from, to) + 1;
      // Deuxième appel : les 14 derniers jours autour d'une période courte, sinon la période d'avant (pour comparer).
      const ctx = len < 7 ? { from: addDay(to, -13), to } : len <= 62 ? { from: addDay(from, -len), to: addDay(from, -1) } : null;
      Promise.all([
        api<Rev>("GET", `/api/revenue?from=${from}&to=${to}${q}`),
        ctx ? api<Rev>("GET", `/api/revenue?from=${ctx.from}&to=${ctx.to}${q}&lite=1`).catch(() => null) : Promise.resolve(null),
        staff ? api<Perf>("GET", `/api/performance?from=${from}&to=${to}${q}`).catch(() => null) : Promise.resolve(null),
      ])
        .then(([rev, c, perf]) => !stop && (setData({ key: `${period}|${only}`, rev, ctx: c, perf, from, to, len }), setErr("")))
        .catch((e) => !stop && setErr(e instanceof Error ? e.message : "Chiffres indisponibles"));
    };
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => (stop = true, clearInterval(t));
  }, [canSeeNumbers, staff, period, only]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !(e.target as Element).closest?.("[data-model-box]") && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const rev = data?.rev ?? null;
  const busy = !!data && data.key !== key;
  const view = useMemo(() => {
    if (!data) return null;
    const { rev: r, ctx, from, len } = data;
    const short = len < 7;
    const canCompare = !short && len <= 62 && !!ctx && ctx.days.length === r.days.length;
    let pts: Pt[];
    if (short && ctx) pts = ctx.days.map((d) => ({ key: d.day, label: fmtDay(d.day, { day: "2-digit" }), title: fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" }), of: d.onlyfans, mym: d.mym, wait: d.provisional, prev: null, dim: d.day < from }));
    else if (len > 62) {
      const by = new Map<string, Pt>();
      for (const d of r.days) {
        const m = d.day.slice(0, 7);
        const p = by.get(m) ?? { key: m, label: fmtDay(m + "-01", { month: "short" }), title: fmtDay(m + "-01", { month: "long", year: "numeric" }), of: 0, mym: 0, wait: 0, prev: null };
        p.of += d.onlyfans;
        p.mym += d.mym;
        p.wait += d.provisional;
        by.set(m, p);
      }
      pts = [...by.values()];
    } else pts = r.days.map((d, i) => ({ key: d.day, label: fmtDay(d.day, { day: "2-digit" }), title: fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" }), of: d.onlyfans, mym: d.mym, wait: d.provisional, prev: canCompare ? (ctx!.days[i].onlyfans + ctx!.days[i].mym + ctx!.days[i].provisional) : null }));
    const rows = [...r.creators].filter((c) => c.eur > 0 || c.prev > 0).sort((a, b) => b.eur - a.eur);
    const of = rows.filter((c) => !isMym(c.platform)).reduce((a, c) => a + c.eur, 0);
    const mym = rows.filter((c) => isMym(c.platform)).reduce((a, c) => a + c.eur, 0);
    const origins = Object.entries(r.byOrigin).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: ORIGIN[k]?.[0] ?? k, value: v, color: ORIGIN[k]?.[1] ?? "#6b7280" }));
    const types = Object.entries(r.byType).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: TYPES.find((t) => t[0] === k)?.[1] ?? k, value: v, color: TYPE_COLOR[k] ?? "#6b7280" }));
    return { pts, rows, of, mym, origins, types, short, canCompare, sub: short ? "Les 14 derniers jours" : len > 62 ? "Mois par mois" : "Jour par jour" };
  }, [data]);

  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()));
  const hello = hour < 6 ? "Bonne nuit" : hour < 18 ? "Bonjour" : "Bonsoir";
  const first = (me.name || "").split(/[\s._-]/)[0];
  const nameOf = (id: string) => creators.find((c) => String(c.id) === String(id));

  // Chatteurs : pas de chiffres, un accueil simple avec leurs modèles et des raccourcis.
  if (!canSeeNumbers) {
    const links: { href: string; label: string; text: string; Icon: LucideIcon; c: string }[] = [
      { href: "/v2/messagerie", label: "Messagerie", text: "Répondre aux fans", Icon: MessageCircle, c: "blue" },
      { href: "/v2/scripts", label: "Scripts", text: "Les messages prêts à envoyer", Icon: ScrollText, c: "violet" },
      { href: "/v2/fans", label: "Fans", text: "Listes et fiches", Icon: Users, c: "green" },
      { href: "/v2/medias", label: "Médias", text: "Photos et vidéos des modèles", Icon: Images, c: "orange" },
    ];
    return (
      <div className="mx-auto max-w-[920px] px-5 py-9 md:px-8">
        <p className="v2-eyebrow v2-rise">Bloom CRM</p>
        <h1 className="v2-h1 v2-rise mt-1.5" style={{ ["--i" as string]: 1 }}>{hello} {first}</h1>
        <p className="v2-rise mt-1.5 text-[13.5px] text-muted" style={{ ["--i" as string]: 2 }}>Tes modèles : {creators.length ? creators.map((c) => c.name).join(", ") : "aucune pour l’instant, demande à ton team leader."}</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {links.map((l, i) => (
            <Link key={l.href} href={l.href} className="v2-card v2-rise flex items-center gap-4 p-5 transition hover:border-white/15" style={{ ["--i" as string]: i + 3 }}>
              <span className="v2-ico size-11" data-c={l.c}><l.Icon className="size-5" /></span>
              <span className="min-w-0 flex-1"><b className="block text-[14.5px]">{l.label}</b><span className="text-[13px] text-muted">{l.text}</span></span>
              <ArrowRight className="size-4 text-muted" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const periodLabel = PERIODS.find(([k]) => k === period)?.[1] ?? "";
  const picked = only === "of" ? "OnlyFans" : only === "mym" ? "MYM" : only ? nameOf(only)?.name ?? "Modèle" : "Toutes les modèles";
  const ofModels = creators.filter((c) => !isMym(c.platform));
  const mymModels = creators.filter((c) => isMym(c.platform));
  const total = rev?.total ?? 0;
  const aiShare = rev && total > 0 ? Math.round(((rev.byOrigin.ai ?? 0) / total) * 100) : null;
  const tiles: { label: string; value: string; sub?: string; Icon: LucideIcon; c: string }[] = [
    { label: "Ventes", value: rev ? rev.sales.toLocaleString("fr-FR") : "…", sub: rev?.provisional ? `+ ${eur(rev.provisional)} en attente` : undefined, Icon: ShoppingBag, c: "green" },
    { label: "Panier moyen", value: rev ? (rev.sales ? eur((total - rev.provisional) / rev.sales, 2) : "—") : "…", Icon: Receipt, c: "rose" },
    { label: "Acheteurs", value: rev ? rev.buyers.toLocaleString("fr-FR") : "…", Icon: Users, c: "orange" },
    staff ? { label: "Vendu par l’IA", value: aiShare == null ? "—" : `${aiShare} %`, sub: rev?.byOrigin.ai ? eur(rev.byOrigin.ai) : undefined, Icon: Sparkles, c: "violet" } : { label: "Abonnements", value: rev ? eur(rev.byType.sub ?? 0) : "…", Icon: Heart, c: "violet" },
  ];
  const sellers = (data?.perf?.sellers ?? []).filter((s) => s.eur > 0 || s.prev > 0).slice(0, 8);
  const topRow = view?.rows[0]?.eur || 1;
  const topSeller = sellers[0]?.eur || 1;
  const ring = staff ? view?.origins ?? [] : view?.types ?? [];
  const ringTotal = ring.reduce((a, x) => a + x.value, 0) || 1;
  const pickModel = (v: string) => (setOnly(v), setMenu(false));
  const opt = (v: string, label: React.ReactNode, lead: React.ReactNode) => (
    <button key={v || "all"} role="option" aria-selected={only === v} onClick={() => pickModel(v)} className="v2-menu-item" data-on={only === v}>
      {lead}<span className="min-w-0 flex-1 truncate">{label}</span>{only === v ? <Check className="size-4 shrink-0" style={{ color: "var(--v2-sky)" }} /> : null}
    </button>
  );

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-7 md:px-8 md:py-8">
      {/* En-tête : titre à gauche, modèle et période à droite */}
      <div className="v2-rise flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Pilotage · {fmtDay(paris(), { month: "long", year: "numeric" })}</p>
          <h1 className="v2-h1 mt-1.5">Vue d’ensemble</h1>
          <p className="mt-1.5 flex items-center gap-2 text-[13.5px] text-muted"><span className="v2-live" /> Les ventes de l’agence, en direct. {hello} {first}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div data-model-box className="relative">
            <button onClick={() => setMenu(!menu)} aria-haspopup="listbox" aria-expanded={menu} className="v2-btn-ghost" style={{ borderRadius: 999, height: 40 }}>
              <Users className="size-4" style={{ color: "var(--v2-sky)" }} /><span className="max-w-[170px] truncate">{picked}</span><ChevronDown className="size-4 text-muted" />
            </button>
            {menu ? (
              <div className="v2-menu v2-scroll max-h-[420px] w-[264px] overflow-y-auto" role="listbox" aria-label="Modèles affichées" style={{ right: 0, top: "calc(100% + 6px)" }}>
                {opt("", "Toutes les modèles", <span className="v2-ico size-7" data-c="plain"><Users className="size-3.5" /></span>)}
                {ofModels.length && mymModels.length ? (
                  <>
                    <p className="v2-menu-label">Plateformes</p>
                    {opt("of", "OnlyFans", <span className="v2-pf-mark" data-pf="of">OF</span>)}
                    {opt("mym", "MYM", <span className="v2-pf-mark" data-pf="mym">MY</span>)}
                  </>
                ) : null}
                {creators.length > 1 ? <p className="v2-menu-label">Modèles</p> : null}
                {creators.length > 1 ? creators.map((c) => opt(String(c.id), <span className="flex items-center gap-2"><span className="truncate">{c.name}</span><PfTag mym={isMym(c.platform)} /></span>, <Avatar src={c.avatar} name={c.name} size="size-7" />)) : null}
              </div>
            ) : null}
          </div>
          <div className="v2-pillbar v2-noscroll max-w-full overflow-x-auto">
            {PERIODS.map(([k, l]) => <button key={k} onClick={() => (setPeriod(k), save("period", k))} className="v2-pill" data-on={period === k}>{l}</button>)}
          </div>
        </div>
      </div>
      {err ? <p className="mt-5 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      <div style={{ opacity: busy ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
        {/* Le total de la période (comme Moby) */}
        <section className="v2-hero v2-rise mt-6 grid gap-6 p-6 md:p-7 lg:grid-cols-[1.05fr_1fr]" style={{ ["--i" as string]: 1 }}>
          <div className="flex min-w-0 flex-col justify-center">
            <p className="v2-eyebrow" style={{ color: "#a9b4c9" }}>Total des gains · {periodLabel}</p>
            <p className="v2-num mt-3 text-[50px] leading-none font-extrabold tracking-[-0.04em] md:text-[66px]">{rev ? <Count value={total} format={(n) => eur(n, 2)} /> : <span className="text-muted">…</span>}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
              {rev ? <Delta now={rev.total} before={rev.prev} /> : null}
              <span className="text-muted">par rapport à la période d’avant{rev && rev.prev > 0 ? ` (${eur(rev.prev)})` : ""}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
              <span className="flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: OF }} /><span className="text-muted">OnlyFans</span><b className="v2-num">{eur(view?.of ?? 0, 2)}</b></span>
              <span className="flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: MYM }} /><span className="text-muted">MYM</span><b className="v2-num">{eur(view?.mym ?? 0, 2)}</b></span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 self-center sm:grid-cols-2">
            {tiles.map((t) => (
              <div key={t.label} className="v2-tile">
                <span className="v2-ico size-10" data-c={t.c}><t.Icon className="size-[18px]" /></span>
                <div className="min-w-0">
                  <p className="truncate text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase">{t.label}</p>
                  <p className="v2-num mt-0.5 truncate text-[20px] leading-tight font-bold">{t.value}</p>
                  {t.sub ? <p className="truncate text-[11.5px] text-muted">{t.sub}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Par type de vente (comme la rangée de Raven) */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {TYPES.map(([k, label, Icon], i) => {
            const v = rev?.byType[k] ?? 0;
            return (
              <div key={k} className="v2-card v2-rise p-4" style={{ ["--i" as string]: i + 2 }}>
                <p className="flex items-center gap-2 text-[12.5px] text-muted"><Icon className="size-[15px] shrink-0" /><span className="truncate">{label}</span></p>
                <p className="v2-num mt-2 text-[19px] leading-none font-bold" style={v ? undefined : { color: "var(--color-muted)" }}>{eur(v, 2)}</p>
                <p className="mt-2 text-[11.5px] text-muted">{total > 0 && v ? `${Math.round((v / total) * 100)} % du total` : "—"}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
          <section className="v2-card v2-rise min-w-0 p-5" style={{ ["--i" as string]: 5 }}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="v2-card-title">Évolution des gains</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{periodLabel} · {view?.sub.toLowerCase() ?? ""}</p>
              </div>
              {view?.canCompare ? (
                <div className="v2-segbar">
                  <button className="v2-seg" data-on={!cmp} onClick={() => setCmp(false)}>Plateformes</button>
                  <button className="v2-seg" data-on={cmp} onClick={() => setCmp(true)} title="Comparer chaque jour à la période d’avant">Comparer</button>
                </div>
              ) : null}
              <div className="v2-segbar">
                <button className="v2-seg" data-on={mode === "line"} onClick={() => (setMode("line"), save("mode", "line"))} title="Courbe" aria-label="Courbe"><LineChart className="size-3.5" /></button>
                <button className="v2-seg" data-on={mode === "bars"} onClick={() => (setMode("bars"), save("mode", "bars"))} title="Barres" aria-label="Barres"><BarChart3 className="size-3.5" /></button>
              </div>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
              {cmp && view?.canCompare ? (
                <><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: OF }} />{periodLabel}</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: "#4a4a52" }} />Période d’avant</span></>
              ) : (
                <><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: OF }} />{mode === "line" ? "Total" : "OnlyFans"}</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: MYM }} />{mode === "line" ? "dont MYM" : "MYM"}</span>{mode === "bars" && rev?.provisional ? <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm" style={{ background: WAIT }} />En attente de confirmation</span> : null}</>
              )}
            </p>
            {view ? <Chart key={`${data?.key}|${mode}|${cmp}`} pts={view.pts} mode={mode} compare={cmp && view.canCompare} /> : <div style={{ height: 312 }} />}
          </section>

          <section className="v2-card v2-rise flex min-w-0 flex-col p-5" style={{ ["--i" as string]: 6 }}>
            <p className="v2-card-title">Répartition</p>
            <p className="mt-0.5 text-[12.5px] text-muted">{staff ? "Qui a vendu" : "Par type de vente"}</p>
            <div className="mt-5"><Donut key={data?.key} items={ring} /></div>
            <div className="mt-5 space-y-2">
              {ring.slice(0, 6).map((o) => (
                <p key={o.label} className="flex items-center gap-2 text-[12.5px]">
                  <i className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="text-[11.5px] text-muted">{Math.round((o.value / ringTotal) * 100)} %</span>
                  <b className="v2-num w-[78px] text-right">{eur(o.value)}</b>
                </p>
              ))}
              {!ring.length ? <p className="text-[12.5px] text-muted">{rev ? "Aucune vente sur la période." : "Chargement…"}</p> : null}
            </div>
          </section>
        </div>

        <div className={`mt-3 grid gap-3 ${staff ? "lg:grid-cols-2" : ""}`}>
          <section className="v2-card v2-rise min-w-0 p-5" style={{ ["--i" as string]: 7 }}>
            <div className="flex items-center"><p className="v2-card-title flex-1">Top modèles</p><span className="text-[12px] text-muted">{periodLabel}</span></div>
            <div className="mt-2">
              {(view?.rows ?? []).slice(0, 8).map((r, i) => {
                const c = nameOf(r.creatorId);
                const mym = isMym(r.platform ?? c?.platform);
                return (
                  <div key={`${r.creatorId}:${r.account}`} className="border-b py-3 last:border-b-0" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                    <div className="flex items-center gap-3">
                      <span className="v2-num w-4 shrink-0 text-center text-[12.5px] font-semibold text-muted">{i + 1}</span>
                      <Avatar src={c?.avatar} name={c?.name || r.account} size="size-9" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2"><b className="truncate text-[14px]">{c?.name || r.account || "Compte"}</b><PfTag mym={mym} /></p>
                        <p className="truncate text-[11.5px] text-muted">{r.sales.toLocaleString("fr-FR")} vente{r.sales > 1 ? "s" : ""}{total > 0 ? ` · ${Math.round((r.eur / total) * 100)} % du total` : ""}</p>
                      </div>
                      <b className="v2-num shrink-0 text-[14.5px]">{eur(r.eur, 2)}</b>
                      <span className="flex w-[62px] shrink-0 justify-end"><Delta now={r.eur} before={r.prev} /></span>
                    </div>
                    <div className="pl-7"><Progress value={r.eur} max={topRow} color={mym ? MYM : OF} i={i} /></div>
                  </div>
                );
              })}
              {view && !view.rows.length ? <p className="py-6 text-center text-[13px] text-muted">Aucune vente sur la période.</p> : null}
              {!view ? <p className="py-6 text-center text-[13px] text-muted">Chargement…</p> : null}
            </div>
          </section>

          {staff ? (
            <section className="v2-card v2-rise min-w-0 p-5" style={{ ["--i" as string]: 8 }}>
              <div className="flex items-center"><p className="v2-card-title flex-1">Top chatteurs</p><Link href="/v2/equipe-ventes" className="flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: "var(--v2-sky)" }}>Classement complet <ArrowRight className="size-3.5" /></Link></div>
              <div className="mt-2">
                {sellers.map((s, i) => (
                  <div key={s.key} className="border-b py-3 last:border-b-0" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                    <div className="flex items-center gap-3">
                      <span className="v2-num w-6 shrink-0 text-[12.5px] font-semibold text-muted">#{i + 1}</span>
                      {s.kind === "ai" ? <span className="v2-ico size-9" data-c="blue" style={{ borderRadius: 999 }}><Sparkles className="size-4" /></span> : <Avatar name={s.name} size="size-9" />}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2"><b className="truncate text-[14px]">{s.name}</b>{s.kind === "bloom" ? <span className="v2-tag">Bloom</span> : null}</p>
                        <p className="truncate text-[11.5px] text-muted">{s.sales.toLocaleString("fr-FR")} vente{s.sales > 1 ? "s" : ""}{s.buyers ? ` · ${s.buyers.toLocaleString("fr-FR")} acheteur${s.buyers > 1 ? "s" : ""}` : ""}</p>
                      </div>
                      <b className="v2-num shrink-0 text-[14.5px]">{eur(s.eur, 2)}</b>
                      <span className="flex w-[62px] shrink-0 justify-end"><Delta now={s.eur} before={s.prev} /></span>
                    </div>
                    <div className="pl-9"><Progress value={s.eur} max={topSeller} color={OF} i={i} /></div>
                  </div>
                ))}
                {data && !sellers.length ? <p className="py-6 text-center text-[13px] text-muted">Le classement de tes chatteurs, dès la première vente.</p> : null}
                {!data ? <p className="py-6 text-center text-[13px] text-muted">Chargement…</p> : null}
              </div>
            </section>
          ) : null}
        </div>

        <section className="v2-card v2-rise mt-3 p-5" style={{ ["--i" as string]: 9 }}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="v2-card-title">Dernières ventes</p>
              <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted"><span className="v2-live" /> En direct, les 10 dernières de la période</p>
            </div>
            {staff ? <Link href="/v2/chiffres" className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold" style={{ color: "var(--v2-sky)" }}>Toutes les statistiques <ArrowRight className="size-3.5" /></Link> : null}
          </div>
          <div className="mt-2 grid gap-x-8 lg:grid-cols-2">
            {(rev?.recent ?? []).slice(0, 10).map((s) => {
              const c = nameOf(s.creatorId);
              const who = staff ? s.by || (s.origin === "ai" ? "IA Substy" : s.origin === "sub" ? null : ORIGIN[s.origin]?.[0] ?? null) : null;
              return (
                <div key={s.id} className="flex items-center gap-3 border-b py-2.5" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                  <Avatar name={s.fan || "Fan"} size="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold">{s.fan || "Fan"}</p>
                    <p className="truncate text-[11.5px] text-muted">{TYPE_ONE[s.type] ?? "Vente"}{who ? ` · par ${who}` : ""}{c ? ` · ${c.name}` : ""} · {ago(s.at)}</p>
                  </div>
                  {s.provisional ? <span className="v2-tag shrink-0" title="Vente vue en direct, pas encore confirmée par la plateforme">en attente</span> : null}
                  <b className="v2-num shrink-0 text-[13.5px]" style={{ color: s.provisional ? "var(--color-muted)" : "var(--v2-up)" }}>+{money(s.net, s.currency)}</b>
                </div>
              );
            })}
          </div>
          {rev && !rev.recent.length ? <p className="py-6 text-center text-[13px] text-muted">Tes ventes arriveront ici, à la seconde.</p> : null}
          {!rev ? <p className="py-6 text-center text-[13px] text-muted">Chargement…</p> : null}
        </section>
      </div>
    </div>
  );
}
