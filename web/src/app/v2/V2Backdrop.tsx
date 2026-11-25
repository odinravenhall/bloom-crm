import type { CSSProperties } from "react";

// Fond de la v2 : le ciel étoilé de Raven CRM, en plus calme (moins d'étoiles, étoiles filantes rares).
// Positions tirées d'une graine fixe : le même ciel pour tout le monde, à chaque affichage.
type Vars = CSSProperties & Record<`--${string}`, string>;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const LAYERS = [
  { tile: 640, n: 52, size: [0.9, 1.7], dur: 260, tw: 5.2 },
  { tile: 470, n: 16, size: [1.3, 2.3], dur: 160, tw: 3.8 },
].map((L, k) => {
  const r = rng(23 + k * 131);
  const dots = Array.from({ length: L.n }, () => {
    const x = Math.round(r() * L.tile);
    const y = Math.round(r() * L.tile);
    const s = (L.size[0] + r() * (L.size[1] - L.size[0])).toFixed(2);
    const a = (0.45 + r() * 0.5).toFixed(2);
    return `radial-gradient(${s}px ${s}px at ${x}px ${y}px, rgb(255 255 255 / ${a}), transparent)`;
  });
  return { backgroundImage: dots.join(","), backgroundSize: `${L.tile}px ${L.tile}px`, "--t": `${L.tile}px`, animationDuration: `${L.dur}s, ${L.tw}s`, animationDelay: `0s, -${k * 1.3}s` } as Vars;
});
const SHOOTS = [
  { top: "7%", left: "80%", dur: 14, delay: 2 },
  { top: "18%", left: "97%", dur: 19, delay: 9 },
  { top: "2%", left: "46%", dur: 23, delay: 15 },
];

export function V2Backdrop() {
  return (
    <div className="v2-backdrop" aria-hidden>
      <div className="v2-nebula" />
      {LAYERS.map((s, i) => <div key={i} className="v2-stars" style={s} />)}
      {SHOOTS.map((s, i) => <span key={i} className="v2-shoot" style={{ top: s.top, left: s.left, animationDuration: `${s.dur}s`, animationDelay: `-${s.delay}s` }} />)}
    </div>
  );
}
