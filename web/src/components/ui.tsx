import Link from "next/link";
import { cn } from "@/lib/fmt";

export function Logo({ href = "/app", compact }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <BloomMark className="size-9 shrink-0" />
      {compact ? null : (
        <span className="text-[21px] leading-none font-extrabold tracking-tight">
          <span className="text-grad">bloom</span>
          <span className="ml-1.5 align-middle text-[9px] font-bold tracking-[0.22em] text-muted">CRM</span>
        </span>
      )}
    </Link>
  );
}

/** Le logo : une fleur blanche sur une pastille en dégradé de la couleur d'accent (sans identifiant SVG : le logo peut être affiché plusieurs fois). */
export function BloomMark({ className }: { className?: string }) {
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-[30%] ${className ?? ""}`} style={{ backgroundImage: "var(--grad)" }} aria-hidden>
      <svg viewBox="0 0 64 64" className="size-[78%]">
        <g transform="translate(32 33)">
          {[0, 72, 144, 216, 288].map((r) => (
            <path key={r} d="M0 -3 C -9 -10, -9 -22, 0 -26 C 9 -22, 9 -10, 0 -3 Z" transform={`rotate(${r})`} fill="#fff" fillOpacity="0.93" />
          ))}
          <circle r="5" fill="var(--color-primary)" />
        </g>
      </svg>
    </span>
  );
}

export function Card({ children, className, title, action }: { children: React.ReactNode; className?: string; title?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className={cn("card min-w-0 rounded-(--radius-card) border bg-card p-5 md:p-6", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <h2 className="text-xl">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, accent, i = 0 }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean; i?: number }) {
  return (
    <div
      className={cn("stat relative min-w-0 overflow-hidden rounded-(--radius-card) border bg-card p-4", accent && "stat-accent")}
     
    >
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <p className="mt-1 font-display text-[clamp(1.35rem,4vw,1.9rem)] leading-tight font-semibold tabular-nums">{value}</p>
      {sub ? <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, children }: { eyebrow?: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">{eyebrow}</p> : null}
        <h1 className="mt-1 text-3xl md:text-[38px] md:leading-tight">{title}</h1>
        {sub ? <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p> : null}
      </div>
      {children}
    </header>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">{children}</div>;
}

export function initials(name: string) {
  const words = name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/[\s'-]+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Fonds des avatars sans photo : nuances de la couleur d'accent (suivent le thème).
const AVATAR_BG = ["#d4537e", "#6f9478", "#e08a62", "#8f78bd", "#c99536", "#5c8fa8"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({ src, name, size = "size-9", rounded = "rounded-full", className }: { src?: string | null; name?: string | null; size?: string; rounded?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" loading="lazy" className={cn(size, rounded, "avatar-img shrink-0 bg-card-2 object-cover", className)} referrerPolicy="no-referrer" />;
  const n = name || "?";
  const big = /size-(1[2-9]|[2-9]\d)/.test(size);
  return (
    <span
      aria-hidden
      className={cn(size, rounded, "grid shrink-0 place-items-center font-extrabold tracking-tight text-white ring-2 ring-white select-none", big ? "text-lg" : "text-[11px]", className)}
      style={{ background: AVATAR_BG[hash(n) % AVATAR_BG.length] }}
    >
      {initials(n)}
    </span>
  );
}

export function Pill({ children, tone = "muted", className, title }: { children: React.ReactNode; tone?: "muted" | "good" | "bad" | "warn" | "accent" | "info"; className?: string; title?: string }) {
  const tones = {
    muted: "bg-white/5 text-muted",
    good: "bg-sage-soft text-emerald-300",
    bad: "bg-rose-500/15 text-rose-300",
    warn: "bg-amber-500/15 text-amber-300",
    accent: "bg-petal text-primary-soft",
    info: "bg-sky-500/15 text-sky-300",
  };
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export const thCls = "px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-muted uppercase whitespace-nowrap";
export const tdCls = "px-3 py-2.5 whitespace-nowrap tabular-nums";

export function Table({ head, children, className }: { head: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-5 overflow-x-auto md:-mx-6", className)}>
      <table className="w-full min-w-max text-sm">
        <thead className="border-b">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-full border border-input bg-card px-4 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-primary";

export const btnCls = {
  primary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_var(--color-primary)] transition-colors hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-45",
  secondary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/60 hover:text-primary-soft disabled:pointer-events-none disabled:opacity-45",
  ghost: "inline-flex h-9 items-center justify-center gap-2 rounded-full px-3 text-sm text-muted transition-colors hover:bg-card-2 hover:text-fg disabled:opacity-45",
  danger:
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500/15 px-4 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:pointer-events-none disabled:opacity-45",
};

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap rounded-full border bg-card p-1">
      {options.map(([k, l]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors", value === k ? "bg-petal text-primary-soft" : "text-muted hover:text-fg")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Rubrique pas encore faite. */
export function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div className="card mx-auto mt-10 flex max-w-xl flex-col items-center gap-3 rounded-(--radius-card) border bg-card p-10 text-center">
      <BloomMark className="size-14" />
      <span className="rounded-full bg-sage-soft px-3 py-0.5 text-[11px] font-bold tracking-wide text-sage uppercase">Bientôt</span>
      <h1 className="text-2xl">{title}</h1>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
