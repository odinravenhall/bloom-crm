export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// Devise : OnlyFans en dollars, MYM en euros. La messagerie donne la devise de chaque créatrice (setModelCurrencies)
// et celle de la conversation ouverte (setCurrentModel), utilisée par défaut.
const MODEL_CUR = new Map<string, string>();
let CUR = "EUR";
export function setModelCurrencies(models: { id: string; platform?: string | null }[]) {
  for (const m of models) MODEL_CUR.set(m.id, /mym/i.test(m.platform || "") ? "EUR" : "USD");
}
export const curOf = (modelId?: string | null) => (modelId && MODEL_CUR.get(modelId)) || CUR;
export function setCurrentModel(modelId?: string | null) {
  if (modelId && MODEL_CUR.has(modelId)) CUR = MODEL_CUR.get(modelId)!;
}

/** Centimes -> « 24,00 € » / « 24,00 $ » (devise de la créatrice). */
export function money(cents: number | null | undefined, dec = 2, cur?: string) {
  return ((cents || 0) / 100).toLocaleString("fr-FR", { style: "currency", currency: cur || CUR, currencyDisplay: "narrowSymbol", minimumFractionDigits: dec, maximumFractionDigits: dec });
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

/** Durée à la seconde pour les chronos en direct : « 37 s », « 4 min 07 », puis comme dur(). */
export function durSec(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
  return dur(ms);
}

export function waitTone(ms: number) {
  return ms < 5 * 60000 ? "good" : ms < 15 * 60000 ? "warn" : "bad";
}

export function clock(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return today ? t : `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${t}`;
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (ms < 90_000) return "à l’instant";
  return "il y a " + dur(ms);
}

export const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("fr-FR"));
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—");
