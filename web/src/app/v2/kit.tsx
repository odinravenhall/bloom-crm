"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

// Bloom v2 — les briques communes des écrans redessinés (direction « Constellation ») : dates, montants, pastille de
// variation, petite courbe, anneau, barres et courbes. Tout nouvel écran de la v2 part d'ici, pour que le CRM ait le même
// visage partout. (L'accueil, écrit avant, a encore ses propres copies : à faire passer ici.)

// ---------------------------------------------------------------- dates (jours de Paris) et nombres
export const paris = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
const noon = (s: string) => new Date(`${s}T12:00:00Z`);
export const addDay = (s: string, n: number) => {
  const d = noon(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((noon(b).getTime() - noon(a).getTime()) / 864e5);
export const fmtDay = (s: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...o, timeZone: "UTC" }).format(noon(s));
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const int = (n: number) => n.toLocaleString("fr-FR");
/** Montant en centimes → « 1 234,56 € » / « 1 234,56 $ ». */
export const cash = (cents: number, currency = "EUR", digits = 2) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency === "USD" ? "USD" : "EUR", currencyDisplay: "narrowSymbol", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(cents / 100);
/** Haut d'échelle « rond » dont le quart tombe juste (0, 200, 400, 600, 800…). */
export const niceMax = (v: number) => {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return ([1, 1.2, 1.6, 2, 3, 4, 6, 8, 10].find((x) => n <= x) ?? 10) * p;
};
/** Une couleur par modèle (courbes, anneau, tableau) : toujours la même pour une même place dans la liste. */
export const PALETTE = ["#3b82f6", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#22d3ee", "#fb923c", "#818cf8", "#f87171", "#2dd4bf", "#c084fc", "#facc15"];

// ---------------------------------------------------------------- tracés
/** Courbe lissée passant par les points. */
export const smooth = (pts: [number, number][]) => {
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
/** Rectangle aux coins du haut arrondis. */
export const topRound = (x: number, y: number, w: number, h: number, r: number) => {
  const q = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h} L${x},${y + q} Q${x},${y} ${x + q},${y} L${x + w - q},${y} Q${x + w},${y} ${x + w},${y + q} L${x + w},${y + h} Z`;
};
export function useWidth<T extends HTMLElement>() {
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

// ---------------------------------------------------------------- petites pièces
/** Chiffre qui monte jusqu'à sa valeur. */
export function Count({ value, format }: { value: number; format: (n: number) => string }) {
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

/** Pastille de variation par rapport à la période d'avant. `quiet` : pas de « nouveau » quand l'historique manque. */
export function Delta({ now, before, quiet }: { now: number; before: number; quiet?: boolean }) {
  if (!(before > 0)) return now > 0 && !quiet ? <span className="v2-delta" data-dir="up">nouveau</span> : <span className="v2-delta" data-dir="flat">—</span>;
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

/** Petite courbe au bas d'une grande carte. */
export function Spark({ v, color, h = 46 }: { v: number[]; color: string; h?: number }) {
  const id = useId().replace(/:/g, "");
  if (v.length < 2) return <div style={{ height: h }} />;
  const W = 300;
  const max = Math.max(1, ...v);
  const pts = v.map((x, i): [number, number] => [(i * W) / (v.length - 1), h - 3 - (x / max) * (h - 9)]);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }} aria-hidden>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.32" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${smooth(pts)} L${W},${h} L0,${h} Z`} fill={`url(#${id})`} className="v2-fade-in" />
      <path d={smooth(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export type Slice = { label: string; value: number; color: string };
/** Anneau de répartition : la plus grosse part au centre. */
export function Donut({ items }: { items: Slice[] }) {
  const total = items.reduce((a, x) => a + x.value, 0);
  const r = 54;
  const C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="relative mx-auto size-[150px]">
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
          <p className="v2-num text-[22px] leading-none font-bold">{total > 0 && items[0] ? pct(items[0].value, total) : 0} %</p>
          <p className="mx-auto mt-1 line-clamp-2 max-w-[88px] text-[10.5px] leading-tight text-muted">{items[0]?.label ?? "Aucune vente"}</p>
        </div>
      </div>
    </div>
  );
}

const TIP = { background: "#121215", borderColor: "rgb(255 255 255 / 0.12)", boxShadow: "0 18px 40px -18px rgb(0 0 0 / 0.9)" };

// ---------------------------------------------------------------- barres
export type BarPt = { key: string; label: string; title: string; parts: { v: number; color: string; label: string }[]; prev?: number | null; dim?: boolean };
/**
 * Barres par jour (ou par mois). Sans `compare` : une barre empilée par point (une couleur par part). Avec `compare` :
 * le total à côté de celui de la période d'avant (`prev`), en gris.
 */
export function Bars({ pts, compare = false, fmt, color = "#3b82f6", height = 250 }: { pts: BarPt[]; compare?: boolean; fmt: (v: number, digits?: number) => string; color?: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, L = 52, R = 6, T = 12, B = 26;
  const n = pts.length;
  const tot = (p: BarPt) => p.parts.reduce((a, x) => a + x.v, 0);
  const max = niceMax(Math.max(1, ...pts.map((p) => Math.max(tot(p), compare ? p.prev ?? 0 : 0))));
  const iw = Math.max(0, w - L - R);
  const band = n ? iw / n : 0;
  const base = H - B;
  const y = (v: number) => T + (base - T) * (1 - v / max);
  const cx = (i: number) => L + band * i + band / 2;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 40))));
  const h = hover == null ? null : pts[hover];
  return (
    <div ref={ref} className="relative mt-3">
      {w ? (
        <svg width={w} height={H} className="block" onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line x1={L} x2={w - R} y1={y(max * k)} y2={y(max * k)} stroke="rgb(255 255 255 / 0.06)" strokeDasharray={k ? "3 5" : undefined} />
              <text x={L - 10} y={y(max * k) + 4} textAnchor="end" fontSize="11" fill="#7c7c84">{fmt(max * k, 0)}</text>
            </g>
          ))}
          {hover != null ? <rect x={L + band * hover} y={T - 4} width={band} height={base - T + 4} rx="6" fill="rgb(255 255 255 / 0.04)" /> : null}
          {pts.map((p, i) => {
            const bw = Math.max(2, Math.min(compare ? 12 : 22, band * (compare ? 0.36 : 0.62)));
            const x0 = compare ? cx(i) + 0.5 : cx(i) - bw / 2;
            const parts = (compare ? [{ v: tot(p), color }] : p.parts).filter((s) => s.v > 0);
            let acc = 0;
            return (
              <g key={p.key} opacity={p.dim ? 0.3 : 1}>
                {compare && p.prev ? <path className="v2-bar" style={{ ["--i" as string]: i }} d={topRound(cx(i) - bw - 0.5, y(p.prev), bw, base - y(p.prev), 3)} fill="#33333a" /> : null}
                <g className="v2-bar" style={{ ["--i" as string]: i }}>
                  {parts.map((s, k) => {
                    const y1 = y(acc + s.v);
                    const hh = y(acc) - y1;
                    acc += s.v;
                    return k === parts.length - 1 ? <path key={k} d={topRound(x0, y1, bw, hh, 3)} fill={s.color} /> : <rect key={k} x={x0} y={y1} width={bw} height={hh} fill={s.color} />;
                  })}
                </g>
              </g>
            );
          })}
          {pts.map((p, i) => (i % every === 0 ? <text key={p.key} x={cx(i)} y={H - 7} textAnchor="middle" fontSize="11" fill={p.dim ? "#4b4b52" : "#7c7c84"}>{p.label}</text> : null))}
          {pts.map((p, i) => <rect key={p.key} x={L + band * i} y={0} width={band} height={base} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        </svg>
      ) : <div style={{ height: H }} />}
      {h && hover != null ? (
        <div className="pointer-events-none absolute top-1 z-10 w-[220px] rounded-xl border p-3 text-[12px]" style={{ left: Math.max(0, Math.min(w - 220, cx(hover) - 110)), ...TIP }}>
          <b className="block text-[12.5px] first-letter:uppercase">{h.title}</b>
          {compare ? null : h.parts.filter((s) => s.v > 0).map((s) => (
            <p key={s.label} className="mt-1 flex justify-between gap-3"><span className="flex min-w-0 items-center gap-1.5 text-muted"><i className="size-2 shrink-0 rounded-sm" style={{ background: s.color }} /><span className="truncate">{s.label}</span></span><b className="v2-num shrink-0">{fmt(s.v)}</b></p>
          ))}
          <p className={`flex justify-between ${compare ? "mt-2" : "mt-2 border-t pt-2"}`} style={{ borderColor: "rgb(255 255 255 / 0.08)" }}><span>Total</span><b className="v2-num">{fmt(tot(h))}</b></p>
          {compare && h.prev != null ? <p className="mt-0.5 flex items-center justify-between text-muted"><span>Avant</span><span className="flex items-center gap-1.5"><span className="v2-num">{fmt(h.prev)}</span><Delta now={tot(h)} before={h.prev} /></span></p> : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- courbes
export type Serie = { id: string; name: string; color: string; values: (number | null)[] };
/** Une courbe par série (une couleur chacune). Une valeur `null` coupe la courbe (jour sans donnée). */
export function Lines({ labels, series, fmt, height = 250, area = false }: { labels: { key: string; label: string; title: string }[]; series: Serie[]; fmt: (v: number, digits?: number) => string; height?: number; area?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const H = height, L = 52, R = 10, T = 12, B = 26;
  const n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const iw = Math.max(0, w - L - R);
  const base = H - B;
  const x = (i: number) => (n > 1 ? L + (i * iw) / (n - 1) : L + iw / 2);
  const y = (v: number) => T + (base - T) * (1 - v / max);
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 44))));
  /** Morceaux de courbe entre deux trous. */
  const segments = (vals: (number | null)[]) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    vals.forEach((v, i) => {
      if (v == null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push([x(i), y(v)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const first = series[0];
  return (
    <div ref={ref} className="relative mt-3">
      {w ? (
        <svg width={w} height={H} className="block" onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.round(n > 1 ? ((e.clientX - r.left - L) / iw) * (n - 1) : 0))));
        }}>
          <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={first?.color ?? "#3b82f6"} stopOpacity="0.28" /><stop offset="1" stopColor={first?.color ?? "#3b82f6"} stopOpacity="0" /></linearGradient></defs>
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line x1={L} x2={w - R} y1={y(max * k)} y2={y(max * k)} stroke="rgb(255 255 255 / 0.06)" strokeDasharray={k ? "3 5" : undefined} />
              <text x={L - 10} y={y(max * k) + 4} textAnchor="end" fontSize="11" fill="#7c7c84">{fmt(max * k, 0)}</text>
            </g>
          ))}
          {area && first ? segments(first.values).map((seg, k) => (seg.length > 1 ? <path key={k} d={`${smooth(seg)} L${seg[seg.length - 1][0]},${base} L${seg[0][0]},${base} Z`} fill={`url(#${gid})`} className="v2-fade-in" /> : null)) : null}
          {series.map((s) => segments(s.values).map((seg, k) => (seg.length > 1 ? <path key={`${s.id}:${k}`} d={smooth(seg)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" pathLength={1} className="v2-draw" /> : <circle key={`${s.id}:${k}`} cx={seg[0][0]} cy={seg[0][1]} r="3" fill={s.color} />)))}
          {hover != null ? <line x1={x(hover)} x2={x(hover)} y1={T} y2={base} stroke="rgb(255 255 255 / 0.14)" /> : null}
          {hover != null ? series.map((s) => (s.values[hover] == null ? null : <circle key={s.id} cx={x(hover)} cy={y(s.values[hover] as number)} r="4" fill="#050506" stroke={s.color} strokeWidth="2.2" />)) : null}
          {labels.map((l, i) => (i % every === 0 ? <text key={l.key} x={x(i)} y={H - 7} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="#7c7c84">{l.label}</text> : null))}
        </svg>
      ) : <div style={{ height: H }} />}
      {hover != null && labels[hover] ? (
        <div className="pointer-events-none absolute top-1 z-10 w-[220px] rounded-xl border p-3 text-[12px]" style={{ left: Math.max(0, Math.min(w - 220, x(hover) - 110)), ...TIP }}>
          <b className="block text-[12.5px] first-letter:uppercase">{labels[hover].title}</b>
          {[...series].filter((s) => s.values[hover] != null).sort((a, b) => (b.values[hover] as number) - (a.values[hover] as number)).slice(0, 10).map((s) => (
            <p key={s.id} className="mt-1 flex justify-between gap-3"><span className="flex min-w-0 items-center gap-1.5 text-muted"><i className="size-2 shrink-0 rounded-full" style={{ background: s.color }} /><span className="truncate">{s.name}</span></span><b className="v2-num shrink-0">{fmt(s.values[hover] as number)}</b></p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
