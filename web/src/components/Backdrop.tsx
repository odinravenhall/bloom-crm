/**
 * Fond animé du CRM, au choix (Réglages → Apparence → Décor). CSS + SVG (et un canvas pour « Constellation »).
 * Tous les décors sont dans la page ; seul celui de <html data-decor="…"> s'affiche (les autres ne tournent pas).
 * Ils prennent la couleur d'accent (--color-primary). « Lignes » est repris de Ravenhall.
 */
import type { CSSProperties, ReactNode } from "react";
type DecorId = "none" | "lines" | "aurora" | "stars" | "waves" | "bokeh" | "neon" | "constellation" | "rain" | "lava" | "hearts";
import { Constellation } from "./Constellation";

// Hasard reproductible (même rendu serveur / navigateur).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0;
    return ((s ^ (s >>> 13)) >>> 0) / 4294967296;
  };
}
type Vars = CSSProperties & Record<`--${string}`, string | number>;

// ---------------------------------------------------------------- Lignes (d'origine)
const LINES = [
  { d: "M-200 760 L1800 40", c: "r", w: 1.4, dur: 9, delay: 0 },
  { d: "M-200 900 L1800 180", c: "w", w: 1, dur: 13, delay: 2.5 },
  { d: "M-200 620 L1800 -100", c: "r", w: 1, dur: 11, delay: 5 },
  { d: "M-200 1040 L1800 320", c: "r", w: 2, dur: 15, delay: 1.2 },
  { d: "M-200 480 L1800 -240", c: "w", w: 0.8, dur: 10, delay: 7 },
  { d: "M200 1100 L1900 490", c: "w", w: 1.2, dur: 17, delay: 3.8 },
];

function Lines({ uid }: { uid: string }) {
  return (
    <>
      <div className="bd-grid" />
      <div className="bd-glow bd-glow-a" />
      <div className="bd-glow bd-glow-b" />
      <svg className="bd-lines" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`bd-r${uid}`} x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--color-primary)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`bd-w${uid}`} x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {LINES.map((l, i) => (
          <g key={i}>
            <path d={l.d} stroke={l.c === "r" ? "var(--color-primary)" : "#fff"} strokeOpacity={l.c === "r" ? 0.07 : 0.035} strokeWidth={l.w} fill="none" />
            <path
              d={l.d}
              className="bd-streak"
              stroke={`url(#bd-${l.c}${uid})`}
              strokeWidth={l.w + 0.6}
              strokeLinecap="round"
              fill="none"
              pathLength={1000}
              style={{ animationDuration: `${l.dur}s`, animationDelay: `-${l.delay}s` }}
            />
          </g>
        ))}
      </svg>
    </>
  );
}

// ---------------------------------------------------------------- Aurore
function Aurora() {
  return (
    <>
      <div className="au-band au-1" />
      <div className="au-band au-2" />
      <div className="au-band au-3" />
      <div className="au-stars" />
    </>
  );
}

// ---------------------------------------------------------------- Étoiles (le ciel défile, 3 profondeurs)
const STAR_LAYERS = [
  { tile: 720, n: 70, size: [0.8, 1.6], dur: 140, tw: 5 },
  { tile: 520, n: 40, size: [1.2, 2.2], dur: 80, tw: 3.6 },
  { tile: 380, n: 14, size: [1.8, 3], dur: 42, tw: 2.4 },
].map((L, k) => {
  const r = rng(11 + k * 97);
  const dots = Array.from({ length: L.n }, () => {
    const x = Math.round(r() * L.tile);
    const y = Math.round(r() * L.tile);
    const s = (L.size[0] + r() * (L.size[1] - L.size[0])).toFixed(2);
    const a = (0.55 + r() * 0.45).toFixed(2);
    return `radial-gradient(${s}px ${s}px at ${x}px ${y}px, rgb(255 255 255 / ${a}), transparent)`;
  });
  return {
    backgroundImage: dots.join(","),
    backgroundSize: `${L.tile}px ${L.tile}px`,
    "--t": `${L.tile}px`,
    animationDuration: `${L.dur}s, ${L.tw}s`,
    animationDelay: `0s, -${k * 1.3}s`,
  } as Vars;
});
const SHOOTS = [
  { top: "8%", left: "82%", dur: 7, delay: 0 },
  { top: "3%", left: "52%", dur: 8.5, delay: 1.4 },
  { top: "20%", left: "96%", dur: 6.5, delay: 2.9 },
  { top: "12%", left: "34%", dur: 9, delay: 4.1 },
  { top: "30%", left: "70%", dur: 7.5, delay: 5.6 },
  { top: "1%", left: "18%", dur: 8, delay: 6.8 },
];

function Stars() {
  return (
    <>
      <div className="st-nebula" />
      {STAR_LAYERS.map((s, i) => (
        <div key={i} className="st-layer" style={s} />
      ))}
      {SHOOTS.map((s, i) => (
        <span key={i} className="st-shoot" style={{ top: s.top, left: s.left, animationDuration: `${s.dur}s`, animationDelay: `-${s.delay}s` }} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Vagues
// Une vague périodique sur 3200 de large (période 800) : on la décale de la moitié en boucle, sans saut.
function wave(y: number, amp: number, phase: number) {
  let d = `M0 ${y}`;
  for (let x = 0; x < 3200; x += 400) {
    const up = (x / 400 + phase) % 2 === 0 ? -amp : amp;
    d += ` Q${x + 200} ${y + up} ${x + 400} ${y}`;
  }
  return d + " L3200 400 L0 400 Z";
}
const WAVES = [
  { d: wave(150, 46, 0), o: 0.07, dur: 34 },
  { d: wave(200, 38, 1), o: 0.09, dur: 24 },
  { d: wave(255, 30, 0), o: 0.12, dur: 17 },
];

function Waves() {
  return (
    <>
      <div className="wv-glow" />
      {WAVES.map((w, i) => (
        <svg key={i} className="wv-svg" viewBox="0 0 3200 400" preserveAspectRatio="none" style={{ animationDuration: `${w.dur}s` }}>
          <path d={w.d} fill="var(--color-primary)" fillOpacity={w.o} stroke="var(--color-primary)" strokeOpacity={w.o * 2.2} strokeWidth="2" />
        </svg>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Bulles
const BUBBLES = (() => {
  const r = rng(424242);
  return Array.from({ length: 18 }, (_, i) => {
    const size = Math.round(18 + r() * 120);
    return {
      left: `${(r() * 96).toFixed(1)}%`,
      size,
      dur: (22 + r() * 26).toFixed(1),
      delay: (r() * 40).toFixed(1),
      blur: size > 90 ? 6 : size > 50 ? 3 : 1,
      soft: i % 3 === 0,
    };
  });
})();

function Bokeh() {
  return (
    <>
      <div className="bk-glow" />
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className={b.soft ? "bk-bubble bk-soft" : "bk-bubble"}
          style={{ left: b.left, width: b.size, height: b.size, filter: `blur(${b.blur}px)`, animationDuration: `${b.dur}s`, animationDelay: `-${b.delay}s` }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Néon (rétro)
function ridge(seed: number, base: number, amp: number) {
  const r = rng(seed);
  let pts = `0,${base}`;
  for (let x = 0; x <= 1600; x += 40 + Math.round(r() * 60)) pts += ` ${x},${Math.round(base - r() * amp)}`;
  return pts + ` 1600,${base}`;
}
const RIDGES = [ridge(7, 150, 120), ridge(19, 150, 70)];

function Neon() {
  return (
    <>
      <div className="nn-sky" />
      <div className="nn-stars" />
      <div className="nn-sun" />
      <svg className="nn-mountains" viewBox="0 0 1600 150" preserveAspectRatio="none">
        {RIDGES.map((p, i) => (
          <polygon key={i} points={p} fill="var(--color-bg)" stroke="var(--color-primary)" strokeOpacity={i ? 0.9 : 0.5} strokeWidth={i ? 2 : 1.5} />
        ))}
      </svg>
      <div className="nn-floor-wrap">
        <div className="nn-floor" />
      </div>
      <div className="nn-horizon" />
    </>
  );
}

// ---------------------------------------------------------------- Pluie de lumière
const DROPS = (() => {
  const r = rng(9090);
  return Array.from({ length: 48 }, () => ({
    left: `${(r() * 110 - 5).toFixed(1)}%`,
    h: Math.round(60 + r() * 140),
    dur: (0.9 + r() * 1.4).toFixed(2),
    delay: (r() * 3).toFixed(2),
    o: (0.25 + r() * 0.6).toFixed(2),
  }));
})();

function Rain() {
  return (
    <>
      <div className="rn-glow" />
      <div className="rn-wrap">
        {DROPS.map((d, i) => (
          <span key={i} className="rn-drop" style={{ left: d.left, height: d.h, opacity: d.o, animationDuration: `${d.dur}s`, animationDelay: `-${d.delay}s` }} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Lave (lampe à lave)
const BLOBS = (() => {
  const r = rng(5151);
  return Array.from({ length: 7 }, (_, i) => ({
    left: `${(r() * 85).toFixed(1)}%`,
    top: `${(r() * 80).toFixed(1)}%`,
    size: Math.round(220 + r() * 260),
    dx: `${Math.round((r() - 0.5) * 900)}px`,
    dy: `${Math.round((r() - 0.5) * 600)}px`,
    dur: (12 + r() * 12).toFixed(1),
    delay: (r() * 20).toFixed(1),
    hue: [0, 40, -40, 80, 0, -70, 20][i],
  }));
})();

function Lava() {
  return (
    <>
      {BLOBS.map((b, i) => (
        <span
          key={i}
          className="lv-blob"
          style={
            {
              left: b.left,
              top: b.top,
              width: b.size,
              height: b.size,
              "--dx": b.dx,
              "--dy": b.dy,
              "--hue": b.hue,
              animationDuration: `${b.dur}s`,
              animationDelay: `-${b.delay}s`,
            } as Vars
          }
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Cœurs
const HEART = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
const HEARTS = (() => {
  const r = rng(1402);
  return Array.from({ length: 22 }, (_, i) => ({
    left: `${(r() * 96).toFixed(1)}%`,
    size: Math.round(14 + r() * 38),
    dur: (9 + r() * 12).toFixed(1),
    delay: (r() * 20).toFixed(1),
    alt: i % 3 === 0,
    blur: r() > 0.7 ? 2 : 0,
  }));
})();

function Hearts() {
  return (
    <>
      <div className="hr-glow" />
      {HEARTS.map((h, i) => (
        <span key={i} className="hr-heart" style={{ left: h.left, width: h.size, height: h.size, filter: h.blur ? `blur(${h.blur}px)` : undefined, animationDuration: `${h.dur}s`, animationDelay: `-${h.delay}s` }}>
          <svg viewBox="0 0 24 24" className={h.alt ? "hr-alt" : undefined}>
            <path d={HEART} />
          </svg>
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Constellation (canvas, suit la souris)
function ConstellationDecor({ uid }: { uid: string }) {
  return <Constellation preview={!!uid} />;
}

const DRAW: Record<Exclude<DecorId, "none">, (p: { uid: string }) => ReactNode> = {
  lines: Lines,
  aurora: Aurora,
  stars: Stars,
  waves: Waves,
  bokeh: Bokeh,
  neon: Neon,
  constellation: ConstellationDecor,
  rain: Rain,
  lava: Lava,
  hearts: Hearts,
};

/** Fond de toutes les pages : chaque décor est présent, le CSS n'affiche que celui choisi. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      {(Object.keys(DRAW) as (keyof typeof DRAW)[]).map((id) => {
        const D = DRAW[id];
        return (
          <div key={id} className={`decor decor-${id}`}>
            <D uid="" />
          </div>
        );
      })}
      <div className="bd-vignette" />
    </div>
  );
}

/** Miniature animée d'un décor (choix dans Réglages) : le décor en 1600×900, réduit à la taille de la vignette. */
export function DecorPreview({ id, scale }: { id: DecorId; scale: number }) {
  if (id === "none") return null;
  const D = DRAW[id];
  return (
    <div className="decor-preview" style={{ transform: `scale(${scale})` }} aria-hidden>
      <div className={`decor decor-${id}`}>
        <D uid={`-p-${id}`} />
      </div>
      <div className="bd-vignette" />
    </div>
  );
}
