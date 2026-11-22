/** Fond de Bloom : crème, voiles pétale et sauge, et deux branches fleuries dessinées au trait dans les coins. Fixe, sans animation. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <Branch className="flora" style={{ right: -40, bottom: -30, width: 420, transform: "rotate(-8deg)" }} />
      <Branch className="flora" style={{ left: -60, top: -50, width: 300, transform: "rotate(172deg)" }} />
    </div>
  );
}

function Flower({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse key={a} rx={r * 0.42} ry={r} cy={-r} transform={`rotate(${a})`} fill="none" stroke="currentColor" strokeWidth="1.4" />
      ))}
      <circle r={r * 0.32} fill="currentColor" />
    </g>
  );
}

function Branch({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 400 400" className={className} style={style}>
      <path d="M380 390 C 300 320, 260 250, 230 170 S 170 60, 110 30" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M262 236 C 300 222, 330 200, 345 168 C 310 172, 282 196, 262 236 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M236 180 C 196 176, 168 156, 152 126 C 190 128, 218 150, 236 180 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M300 300 C 336 300, 362 286, 380 260 C 346 256, 318 272, 300 300 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <Flower x={110} y={30} r={22} />
      <Flower x={200} y={105} r={14} />
      <Flower x={345} y={150} r={11} />
    </svg>
  );
}
