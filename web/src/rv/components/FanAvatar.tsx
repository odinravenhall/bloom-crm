import { UserRound } from "lucide-react";
import type { Badge } from "@/rv/lib/tiers";
import { cn } from "@/rv/lib/fmt";
import { Avatar } from "./ui";

/**
 * Photo du fan : sa photo Reveal s'il en a une, sinon une silhouette aux couleurs du CRM
 * (la couleur principale choisie dans Réglages → Apparence). Plus d'icône de palier ni d'emoji pour l'instant.
 */
export function FanAvatar({ src, name, size = "size-11" }: { src?: string | null; name?: string | null; totalSpent?: number; badge?: Badge | null; size?: string }) {
  if (src) return <Avatar src={src} name={name} size={size} />;
  const big = /size-(1[2-9]|[2-9]\d)/.test(size);
  return (
    <span aria-hidden className={cn(size, "grid shrink-0 place-items-center rounded-full bg-primary/20 text-primary-soft ring-1 ring-primary/40 select-none")}>
      <UserRound className={big ? "size-7" : "size-5"} />
    </span>
  );
}
