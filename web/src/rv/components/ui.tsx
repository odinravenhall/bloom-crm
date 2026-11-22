"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/rv/lib/fmt";

export function Logo({ href = "/app", compact }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      {/* Logo dessiné en ligne : il prend la couleur d'accent du thème */}
      <svg viewBox="0 0 64 64" aria-hidden className="size-8 shrink-0 rounded-[10px] shadow-[0_6px_18px_-6px_var(--color-primary)]">
        <defs>
          <linearGradient id="raven-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="color-mix(in oklab, var(--color-primary) 70%, white)" />
            <stop offset="1" stopColor="color-mix(in oklab, var(--color-primary) 62%, black)" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#raven-logo)" />
        <path d="M22 46V18h11.5c6.4 0 10.5 3.6 10.5 9.2 0 4.2-2.4 7.2-6.3 8.4L44.5 46h-7.3l-6.2-9.8H28.6V46H22zm6.6-15.4h4.6c2.7 0 4.2-1.3 4.2-3.5s-1.5-3.5-4.2-3.5h-4.6v7z" fill="#fff" />
      </svg>
      {compact ? null : (
        <span className="text-[17px] font-extrabold tracking-tight">
          Raven <span className="text-primary-soft">CRM</span>
        </span>
      )}
    </Link>
  );
}

export function Card({ children, className, title, action }: { children: React.ReactNode; className?: string; title?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className={cn("card rise min-w-0 rounded-(--radius-card) border bg-card/80 p-5 backdrop-blur md:p-6", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <h2 className="text-lg">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, accent, i = 0 }: { label: string; value: string; sub?: string; accent?: boolean; i?: number }) {
  return (
    <div
      className={cn("stat rise relative min-w-0 overflow-hidden rounded-(--radius-card) border bg-card/80 p-4 backdrop-blur", accent && "stat-accent border-primary/50")}
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</p>
      <p className="mt-1.5 text-[clamp(1.2rem,4vw,1.65rem)] leading-tight font-extrabold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, children }: { eyebrow?: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl md:text-[28px]">{title}</h1>
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
const AVATAR_BG = [
  "linear-gradient(135deg,color-mix(in oklab,var(--color-primary) 65%,white),color-mix(in oklab,var(--color-primary) 45%,black))",
  "linear-gradient(135deg,var(--color-primary),color-mix(in oklab,var(--color-primary) 22%,black))",
  "linear-gradient(135deg,color-mix(in oklab,var(--color-primary) 40%,white),color-mix(in oklab,var(--color-primary) 80%,black))",
  "linear-gradient(135deg,var(--chart-3),color-mix(in oklab,var(--chart-3) 25%,black))",
  "linear-gradient(135deg,var(--chart-2),color-mix(in oklab,var(--chart-2) 25%,black))",
  "linear-gradient(135deg,#4a4a4f,#121214)",
];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({ src, name, size = "size-9", rounded = "rounded-full", className }: { src?: string | null; name?: string | null; size?: string; rounded?: string; className?: string }) {
  // Photo introuvable ou lien expiré (MYM signe ses liens pour un temps) : on affiche les initiales.
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  // eslint-disable-next-line @next/next/no-img-element
  if (src && !bad) return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className={cn(size, rounded, "avatar-img shrink-0 bg-card-2 object-cover", className)} referrerPolicy="no-referrer" />;
  const n = name || "?";
  const big = /size-(1[2-9]|[2-9]\d)/.test(size);
  return (
    <span
      aria-hidden
      className={cn(size, rounded, "grid shrink-0 place-items-center font-extrabold tracking-tight text-white ring-1 ring-white/10 select-none", big ? "text-lg" : "text-[11px]", className)}
      style={{ background: AVATAR_BG[hash(n) % AVATAR_BG.length], boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)" }}
    >
      {initials(n)}
    </span>
  );
}

export function Pill({ children, tone = "muted", className, title }: { children: React.ReactNode; tone?: "muted" | "good" | "bad" | "warn" | "accent" | "info"; className?: string; title?: string }) {
  const tones = {
    muted: "bg-white/5 text-muted",
    good: "bg-emerald-500/15 text-emerald-300",
    bad: "bg-rose-500/15 text-rose-300",
    warn: "bg-amber-500/15 text-amber-300",
    accent: "bg-primary/20 text-primary-soft",
    info: "bg-sky-500/15 text-sky-300",
  };
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap", tones[tone], className)}>
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
  "h-10 w-full rounded-xl border border-input bg-card-2/60 px-3 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-primary";

export const btnCls = {
  primary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-45",
  secondary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-card-2 px-4 text-sm font-semibold transition-colors hover:border-primary/60 disabled:pointer-events-none disabled:opacity-45",
  ghost: "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-card-2 hover:text-fg disabled:opacity-45",
  danger:
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500/15 px-4 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:pointer-events-none disabled:opacity-45",
};

export function PeriodTabs({ current, base }: { current: string; base: string }) {
  const opts: [string, string][] = [
    ["today", "Aujourd’hui"],
    ["24h", "24 h"],
    ["7d", "7 jours"],
    ["30d", "30 jours"],
  ];
  return (
    <div className="flex rounded-xl border bg-card/80 p-1 backdrop-blur">
      {opts.map(([k, l]) => (
        <Link
          key={k}
          href={`${base}?p=${k}`}
          className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors", current === k ? "bg-primary text-white" : "text-muted hover:text-fg")}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}
