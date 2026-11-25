"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowUpRight, CalendarDays, MoreHorizontal, X } from "lucide-react";
import { toast } from "@/lib/api";

// Bloom v2 — les briques communes des écrans redessinés (direction « Constellation ») : dates, montants, période
// (onglets + dates au choix), pastille de variation, petite courbe, anneau, barres et courbes, export. Tout nouvel écran
// de la v2 part d'ici, pour que le CRM ait le même visage partout. (L'accueil, écrit avant, a encore ses propres copies :
// à faire passer ici.)

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
/** Une couleur par type de vente, la même sur tous les écrans (clés de `CATS`, app/v2stats.mjs). */
export const CAT_COLOR: Record<string, string> = { sub: "#38bdf8", renew: "#22d3ee", ppv: "#3b82f6", mod: "#818cf8", push: "#a78bfa", tip: "#f472b6", post: "#34d399", stream: "#fbbf24", ref: "#fb923c", other: "#6b7280" };
/** Durée lisible : « 45 s », « 4 min 05 », « 2 h 10 ». */
export const fmtDuration = (ms: number | null | undefined) => {
  if (ms == null) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ${String(sec % 60).padStart(2, "0")}`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
};
/** Fait télécharger un tableau pour Excel (séparateur « ; », accents lisibles). */
export function downloadCsv(name: string, head: string[], lines: string[][]) {
  const esc = (x: string) => (/[";\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
  const blob = new Blob(["\ufeff" + [head, ...lines].map((l) => l.map(esc).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------- période
export type Preset = "today" | "yesterday" | "7d" | "month" | "prev" | "30d" | "12m" | "custom";
export const PRESETS: [Preset, string][] = [["today", "Aujourd’hui"], ["yesterday", "Hier"], ["7d", "7 jours"], ["month", "Ce mois"], ["prev", "Mois dernier"], ["30d", "30 jours"], ["12m", "12 mois"]];
export function rangeOf(p: Preset, custom: [string, string]): [string, string] {
  const t = paris();
  if (p === "today") return [t, t];
  if (p === "yesterday") return [addDay(t, -1), addDay(t, -1)];
  if (p === "7d") return [addDay(t, -6), t];
  if (p === "month") return [t.slice(0, 8) + "01", t];
  if (p === "prev") {
    const end = addDay(t.slice(0, 8) + "01", -1);
    return [end.slice(0, 8) + "01", end];
  }
  if (p === "30d") return [addDay(t, -29), t];
  if (p === "12m") return [addDay(t, -364), t];
  return custom;
}
/** Semaine du lundi au dimanche : celle en cours (`back` = 0, jusqu'à aujourd'hui) ou une d'avant. */
export function weekRange(back = 0): [string, string] {
  const t = paris();
  const mon = addDay(t, -((noon(t).getUTCDay() + 6) % 7) - 7 * back);
  return [mon, back ? addDay(mon, 6) : t];
}
/** Quinzaine (du 1 au 15, puis du 16 à la fin du mois : les périodes de paie) : celle en cours ou la précédente. */
export function fortnightRange(back = 0): [string, string] {
  const t = paris();
  const month = t.slice(0, 8);
  const first = Number(t.slice(8)) <= 15;
  if (!back) return [month + (first ? "01" : "16"), t];
  if (!first) return [month + "01", month + "15"];
  const end = addDay(month + "01", -1);
  return [end.slice(0, 8) + "16", end];
}
const SHORTCUTS: [string, () => [string, string]][] = [["Cette semaine", () => weekRange(0)], ["Semaine dernière", () => weekRange(1)], ["Quinzaine en cours", () => fortnightRange(0)], ["Quinzaine d’avant", () => fortnightRange(1)]];
const PERIOD_KEY = "bloom.v2.stats.period";
/**
 * La période des écrans de chiffres. Elle suit la personne d'un écran à l'autre (gardée dans le navigateur ; des dates
 * au choix ne sont pas gardées). À n'utiliser que dans un écran chargé côté navigateur (c'est le cas de V2Screen).
 */
export function usePeriod() {
  const [preset, setPreset] = useState<Preset>(() => {
    try {
      const p = localStorage.getItem(PERIOD_KEY) as Preset | null;
      if (p && PRESETS.some(([k]) => k === p)) return p;
    } catch {}
    return "month";
  });
  const [custom, setCustom] = useState<[string, string]>(() => [addDay(paris(), -6), paris()]);
  const [from, to] = rangeOf(preset, custom);
  const pick = (p: Preset) => {
    setPreset(p);
    try {
      if (p !== "custom") localStorage.setItem(PERIOD_KEY, p);
    } catch {}
  };
  return {
    preset, from, to, pick,
    len: daysBetween(from, to) + 1,
    label: preset === "custom" ? `${fmtDay(from, { day: "numeric", month: "short" })} → ${fmtDay(to, { day: "numeric", month: "short" })}` : PRESETS.find(([k]) => k === preset)?.[1] ?? "",
    // Dates au choix : dans l'ordre, et pas plus de 400 jours (ce que le serveur accepte) — une année mal tapée
    // (« 0026 ») donnerait sinon une période affichée qui n'est pas celle des chiffres.
    setRange: (a: string, b: string) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const min = addDay(hi, -400);
      setCustom([lo < min ? min : lo, hi]);
      setPreset("custom");
    },
  };
}
export type Period = ReturnType<typeof usePeriod>;

/** Ferme un menu ouvert quand on clique ailleurs que dans « [data-pop=nom] », ou sur Échap. */
export function useDismiss(open: boolean, close: () => void, name: string) {
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => !(e.target as Element).closest?.(`[data-pop="${name}"]`) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", out), document.removeEventListener("keydown", esc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name]);
}

/**
 * Fenêtre par-dessus l'écran (créer, modifier, confirmer). Elle est posée à la racine de la v2, hors de « .v2-frame » :
 * dans ce cadre, une position fixe suit le contenu qui défile et la fenêtre se retrouverait hors de vue.
 */
export function Modal({ title, sub, onClose, wide = false, sticky = false, width, children }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; wide?: boolean; sticky?: boolean; /** Largeur au choix (pixels), pour les grandes fenêtres (médias). */ width?: number; children: React.ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  // `sticky` : un formulaire qu'on ne veut pas perdre — ni Échap ni un clic à côté ne le ferment (seulement ✕ / Annuler).
  const keep = useRef(sticky);
  keep.current = sticky;
  useEffect(() => setHost(document.querySelector(".v2")), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !keep.current && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!host) return null;
  return createPortal(
    <div className="v2-fade-in fixed inset-0 z-[90] grid place-items-center overflow-y-auto p-4" style={{ background: "rgb(0 0 0 / 0.66)", backdropFilter: "blur(3px)" }} onMouseDown={(e) => e.target === e.currentTarget && !sticky && onClose()}>
      <div role="dialog" aria-modal="true" className={`v2-card w-full p-5 ${width ? "" : wide ? "max-w-[860px]" : "max-w-[480px]"}`} style={{ background: "#0e0e11", boxShadow: "0 40px 90px -30px rgb(0 0 0 / 0.95)", maxWidth: width }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[17px] leading-tight font-bold tracking-[-0.02em]">{title}</p>
            {sub ? <p className="mt-1 text-[12.5px] text-muted">{sub}</p> : null}
          </div>
          <button onClick={onClose} className="v2-sq" style={{ width: 32, height: 32 }} aria-label="Fermer"><X className="size-4" /></button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    host,
  );
}

/**
 * Pose un élément à la racine de la v2, au-dessus des fenêtres : pour ouvrir par-dessus un formulaire une fenêtre d'un
 * composant d'avant (choix de médias du vault…), qui se place elle-même en position fixe.
 */
export function Layer({ children, className }: { children: React.ReactNode; className?: string }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => setHost(document.querySelector(".v2")), []);
  return host ? createPortal(<div className={className} style={{ position: "relative", zIndex: 95 }}>{children}</div>, host) : null;
}

/** Le petit menu « ⋯ » d'une ligne (modifier, dupliquer, supprimer…). `name` : unique sur l'écran. */
export function RowMenu({ name, items }: { name: string; items: { label: string; danger?: boolean; go: () => void }[] }) {
  const [open, setOpen] = useState(false);
  useDismiss(open, () => setOpen(false), name);
  return (
    <span data-pop={name} className="relative shrink-0 pr-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Actions" className="grid size-6 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><MoreHorizontal className="size-3.5" /></button>
      {open ? <span className="v2-menu right-0 block w-[168px]" style={{ top: "calc(100% + 4px)" }}>{items.map((it) => <button key={it.label} type="button" onClick={() => (setOpen(false), it.go())} className="v2-menu-item" style={it.danger ? { color: "var(--v2-down)" } : undefined}>{it.label}</button>)}</span> : null}
    </span>
  );
}

/** Demander confirmation avant une action qu'on ne peut pas défaire. `go` fait l'action ; une erreur s'affiche. */
export function Confirm({ title, text, button, go, onClose }: { title: string; text: string; button: string; go: () => Promise<unknown>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await go();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action impossible", "err");
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-[13px] leading-relaxed text-muted">{text}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void run()} disabled={busy} className="v2-btn" data-kind="danger">{busy ? "Un instant…" : button}</button>
      </div>
    </Modal>
  );
}

/** Interrupteur (actif / inactif). */
export function Switch({ on, onChange, disabled, title }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} title={title} onClick={() => onChange(!on)} className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: on ? "var(--v2-blue)" : "rgb(255 255 255 / 0.16)" }}>
      <span className="absolute top-[3px] size-4 rounded-full bg-white transition-all" style={{ left: on ? 19 : 3 }} />
    </button>
  );
}

/** Les onglets de période et le choix de dates : la même ligne sur tous les écrans de chiffres. */
export function PeriodBar({ period, i = 1 }: { period: Period; i?: number }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<[string, string]>([period.from, period.to]);
  useDismiss(open, () => setOpen(false), "period");
  const field = "mt-1 h-9 w-full rounded-lg border bg-transparent px-2 text-[13px] outline-none focus:border-(--v2-blue)";
  return (
    <div className="v2-rise relative z-20 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ ["--i" as string]: i }}>
      <div className="v2-tabs v2-noscroll max-w-full overflow-x-auto">
        {PRESETS.map(([k, l]) => <button key={k} onClick={() => (period.pick(k), setOpen(false))} className="v2-tab" data-on={period.preset === k}>{l}</button>)}
      </div>
      <div data-pop="period" className="relative">
        <button onClick={() => (setDraft([period.from, period.to]), setOpen(!open))} className="v2-tab flex items-center gap-1.5" data-on={period.preset === "custom"} aria-expanded={open}><CalendarDays className="size-3.5" />{period.preset === "custom" ? period.label : "Dates"}</button>
        {open ? (
          <div className="v2-menu w-[264px] p-3" style={{ left: 0, top: "calc(100% + 4px)" }}>
            <div className="mb-3 grid grid-cols-2 gap-1.5 border-b pb-3" style={{ borderColor: "rgb(255 255 255 / 0.08)" }}>
              {SHORTCUTS.map(([label, range]) => <button key={label} type="button" onClick={() => (period.setRange(...range()), setOpen(false))} className="h-8 rounded-lg border text-[11.5px] font-semibold text-muted transition-colors hover:border-white/20 hover:text-(--color-fg)" style={{ borderColor: "var(--color-line)" }}>{label}</button>)}
            </div>
            <p className="text-[11.5px] font-semibold text-muted">Du</p>
            <input type="date" value={draft[0]} max={draft[1]} onChange={(e) => setDraft([e.target.value || draft[0], draft[1]])} className={field} style={{ borderColor: "var(--color-line)", colorScheme: "dark" }} />
            <p className="mt-2.5 text-[11.5px] font-semibold text-muted">Au</p>
            <input type="date" value={draft[1]} min={draft[0]} max={paris()} onChange={(e) => setDraft([draft[0], e.target.value || draft[1]])} className={field} style={{ borderColor: "var(--color-line)", colorScheme: "dark" }} />
            <button onClick={() => (period.setRange(draft[0], draft[1]), setOpen(false))} className="v2-btn mt-3 w-full" style={{ height: 34 }}>Afficher</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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

/**
 * Pastille de variation par rapport à la période d'avant. `quiet` : pas de « nouveau » quand l'historique manque.
 * `invert` : quand baisser est une bonne nouvelle (temps de réponse) — la flèche suit le sens, la couleur le résultat.
 */
export function Delta({ now, before, quiet, invert }: { now: number; before: number; quiet?: boolean; invert?: boolean }) {
  if (!(before > 0)) return now > 0 && !quiet ? <span className="v2-delta" data-dir={invert ? "flat" : "up"}>nouveau</span> : <span className="v2-delta" data-dir="flat">—</span>;
  const p = ((now - before) / before) * 100;
  const way = Math.abs(p) < 0.5 ? "flat" : p > 0 ? "up" : "down";
  const dir = way === "flat" || !invert ? way : way === "up" ? "down" : "up";
  const a = Math.abs(p);
  return (
    <span className="v2-delta" data-dir={dir}>
      {way === "up" ? <ArrowUpRight className="size-3" /> : way === "down" ? <ArrowDownRight className="size-3" /> : null}
      {a >= 100 ? Math.round(a) : a.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
    </span>
  );
}

/**
 * Photo d'une modèle entourée de SA couleur (la même que ses courbes). L'anneau est dessiné DANS la boîte : rien ne
 * dépasse, donc rien n'est rogné par un conteneur qui défile (défaut signalé le 25/11/2026 dans un tableau, où
 * l'anneau en ombre extérieure était coupé à gauche).
 */
export function Ring({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="grid shrink-0 rounded-full p-[3.5px]" style={{ boxShadow: `inset 0 0 0 2px ${color}` }}>{children}</span>;
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
 * le total à côté de celui de la période d'avant (`prev`), en gris. `whole` : l'axe compte des unités (abonnés,
 * messages), ses graduations restent des nombres entiers.
 */
export function Bars({ pts, compare = false, fmt, color = "#3b82f6", height = 250, whole = false }: { pts: BarPt[]; compare?: boolean; fmt: (v: number, digits?: number) => string; color?: string; height?: number; whole?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, L = 52, R = 6, T = 12, B = 26;
  const n = pts.length;
  const tot = (p: BarPt) => p.parts.reduce((a, x) => a + x.v, 0);
  const top = niceMax(Math.max(1, ...pts.map((p) => Math.max(tot(p), compare ? p.prev ?? 0 : 0))));
  const max = whole ? Math.max(4, Math.ceil(top / 4) * 4) : top;
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
