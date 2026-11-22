"use client";

import { cn } from "@/rv/lib/fmt";

const DAY = 864e5;

/** Jour d'abonnement du fan : 1, 2 ou 3 (premiers jours), sinon null (fan normal). */
export function newSubDay(subscribedAt: string | null | undefined, now = Date.now()) {
  if (!subscribedAt) return null;
  const t = Date.parse(subscribedAt);
  if (!t || now < t) return null;
  const d = Math.floor((now - t) / DAY) + 1;
  return d <= 3 ? d : null;
}

/** Badge « NEW SUB +1 / +2 / +3 » : fan arrivé il y a moins de 3 jours (KYC + script de découverte à lancer). */
export function NewSubBadge({ subscribedAt, className }: { subscribedAt: string | null | undefined; className?: string }) {
  const d = newSubDay(subscribedAt);
  if (!d) return null;
  return (
    <span
      title={`Nouvel abonné : jour ${d} sur 3 (abonné le ${new Date(subscribedAt!).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})`}
      className={cn("inline-flex shrink-0 items-center rounded px-1 text-[10px] font-extrabold tracking-wide whitespace-nowrap uppercase", d === 1 ? "bg-primary text-white" : d === 2 ? "bg-primary/70 text-white" : "bg-primary/25 text-primary-soft", className)}
    >
      New sub +{d}
    </span>
  );
}
