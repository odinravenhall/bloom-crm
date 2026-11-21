export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Montant en dollars (Substy compte en USD) : « 1 234,50 $ ». */
export function usd(v: number | null | undefined, dec?: number) {
  const n = v || 0;
  const d = dec ?? (Number.isInteger(n) ? 0 : 2);
  return n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) + " $";
}

/** Durée lisible : « 12 min », « 2 h 05 », « 3 j 4 h ». */
export function dur(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, "0")}`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}

export const hhmm = (iso: string | number) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Heure si aujourd'hui, « hier », sinon la date courte. */
export function when(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(iso);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export function ago(iso: string | number | null | undefined) {
  if (!iso) return "—";
  const ms = Date.now() - (typeof iso === "number" ? iso : Date.parse(iso));
  if (ms < 90_000) return "à l’instant";
  return "il y a " + dur(ms);
}

export const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("fr-FR"));

/** Durée à la seconde pour les chronos en direct : « 37 s », « 4 min 07 », puis comme dur(). */
export function durSec(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
  return dur(ms);
}

/** Couleur de l'attente d'un fan : vert < 5 min, orange < 15 min, rouge au-delà (comme Raven CRM). */
export function waitTone(ms: number) {
  return ms < 5 * 60000 ? "good" : ms < 15 * 60000 ? "warn" : "bad";
}
