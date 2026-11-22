// Paliers de dépense (mêmes seuils que les listes automatiques « 01 - Petit payeur »… de la page Listes).
// Affichés façon Moby dans la messagerie : l'icône remplace la photo, le nom du palier + le montant sous l'aperçu.

export type Tier = { key: string; min: number; label: string; icon: string; ring: string; text: string };

export const TIERS: Tier[] = [
  { key: "grosse-baleine", min: 150000, label: "Grosse baleine", icon: "👑", ring: "bg-fuchsia-500/20 ring-fuchsia-400/50", text: "text-fuchsia-300" },
  { key: "baleine", min: 75000, label: "Baleine", icon: "🐋", ring: "bg-sky-500/20 ring-sky-400/50", text: "text-sky-300" },
  { key: "petite-baleine", min: 30000, label: "Petite baleine", icon: "🐬", ring: "bg-cyan-500/20 ring-cyan-400/50", text: "text-cyan-300" },
  { key: "gros-payeur", min: 15000, label: "Gros payeur", icon: "🔥", ring: "bg-orange-500/20 ring-orange-400/50", text: "text-orange-300" },
  { key: "regulier", min: 5000, label: "Payeur régulier", icon: "⭐", ring: "bg-amber-500/20 ring-amber-400/40", text: "text-amber-300" },
  { key: "petit", min: 500, label: "Petit payeur", icon: "💸", ring: "bg-emerald-500/15 ring-emerald-400/40", text: "text-emerald-300" },
];

export function tierOf(cents: number) {
  return TIERS.find((t) => cents >= t.min) ?? null;
}

/** Icônes au choix (en plus du palier automatique) pour marquer un fan à la main. */
export const BADGE_ICONS = ["🔥", "🐋", "🐬", "👑", "⭐", "💸", "💎", "❤️", "😈", "🎂", "⚠️", "🚫", "📄", "🧊"];

export type Badge = { icon: string | null; label: string | null };

/**
 * Ce qu'on affiche pour un fan : icône/étiquette choisies à la main en priorité, sinon le palier automatique.
 * icon "photo" = garder sa vraie photo.
 */
export function badgeOf(totalSpent: number, manual?: Badge | null) {
  const t = tierOf(totalSpent);
  const icon = manual?.icon === "photo" ? null : manual?.icon || t?.icon || null;
  const label = manual?.label || t?.label || null;
  return { icon, label, tier: t, ring: t?.ring ?? "bg-white/10 ring-white/20", text: t?.text ?? "text-primary-soft" };
}
