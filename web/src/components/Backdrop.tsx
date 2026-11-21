/** Fond animé de Bloom (lignes lumineuses + grille), repris de Raven CRM. Prend la couleur d'accent. */
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


export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="decor-base absolute inset-0">
        <Lines uid="bloom" />
      </div>
      <div className="bd-vignette" />
    </div>
  );
}
