// Fond animé de Bloom (propre à Bloom) : tous les décors sont dans la page, le CSS n'affiche que celui de
// <html data-decor> (les autres ne tournent pas). Mouvements lents, coupés par « Réduire les animations ».

// Hasard reproductible (même rendu serveur / navigateur).
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function Aurora() {
  return (
    <>
      <span className="au-blob au-1" />
      <span className="au-blob au-2" />
      <span className="au-blob au-3" />
    </>
  );
}

function Petals() {
  const r = rng(7);
  return (
    <>
      {Array.from({ length: 16 }, (_, i) => {
        const size = 10 + r() * 14;
        return (
          <svg
            key={i}
            className="petal"
            viewBox="0 0 20 20"
            width={size}
            height={size}
            style={{ left: `${r() * 100}%`, animationDuration: `${18 + r() * 16}s`, animationDelay: `-${r() * 30}s`, opacity: 0.18 + r() * 0.25 }}
          >
            <path d="M10 1 C15 5 17 11 10 19 C3 11 5 5 10 1 Z" fill="var(--color-primary)" />
          </svg>
        );
      })}
    </>
  );
}

function Fireflies() {
  const r = rng(11);
  return (
    <>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="firefly"
          style={{ left: `${r() * 100}%`, top: `${r() * 100}%`, animationDuration: `${7 + r() * 9}s, ${2.5 + r() * 3}s`, animationDelay: `-${r() * 12}s, -${r() * 4}s` }}
        />
      ))}
    </>
  );
}

function Waves() {
  return (
    <svg className="waves" viewBox="0 0 1600 300" preserveAspectRatio="none">
      {[0, 1, 2].map((k) => (
        <path
          key={k}
          className={`wave wave-${k}`}
          d="M0 160 C200 100 400 220 600 160 S1000 100 1200 160 S1600 220 1800 160 S2200 100 2400 160 S2800 220 3200 160 V300 H0 Z"
          fill="var(--color-primary)"
        />
      ))}
    </svg>
  );
}

const DRAW = { aurora: Aurora, petals: Petals, fireflies: Fireflies, waves: Waves };

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      {(Object.keys(DRAW) as (keyof typeof DRAW)[]).map((id) => {
        const D = DRAW[id];
        return (
          <div key={id} className={`decor decor-${id}`}>
            <D />
          </div>
        );
      })}
      <div className="bd-vignette" />
    </div>
  );
}
