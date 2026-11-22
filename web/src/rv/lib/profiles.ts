// Champs des fiches (partagés entre le serveur et l'interface).

// La fiche fan = un seul texte « Notes », une info par ligne (« Métier : plombier »), remplie par l'équipe et l'IA.
export const FAN_FIELDS = [{ k: "notes", label: "Notes", ph: "Prénom : Thomas\nÂge : 34\nMétier : chauffeur poids lourd\nJour de paie : le 5\n…", long: true }] as const;

/** Prénom noté dans les notes (ligne « Prénom : … »). */
export function firstNameOf(notes?: string) {
  return /^\s*pr[ée]nom\s*:\s*(.+)$/im.exec(notes || "")?.[1]?.trim().slice(0, 40) || null;
}

// La fiche modèle = un seul texte collé tel quel (la fiche de l'agence, avec ses emojis et ses rubriques).
export const MODEL_FIELDS = [{ k: "sheet", label: "Fiche", ph: "Colle ici la fiche complète de la modèle…", long: true, max: 20000 }] as const;

// Anciennes fiches (une case par rubrique) : reprises dans le texte unique.
const LEGACY_MODEL_FIELDS: [string, string][] = [
  ["persona", "👤 Qui elle est"],
  ["physique", "👁️ Physique"],
  ["tone", "🙂 Personnalité & façon d’écrire"],
  ["life", "☀️ Sa vie"],
  ["does", "✅ Contenu qu’elle fait"],
  ["doesnt", "⚠️ Ce qu’elle NE fait PAS"],
  ["prices", "🏷️ Prix conseillés"],
  ["rules", "📩 Règles / à savoir"],
];

/** Texte de la fiche modèle (nouveau format, ou ancien format converti). */
export function modelSheetText(p: ProfileData | null | undefined): string {
  if (!p) return "";
  if (typeof p.sheet === "string" && p.sheet.trim()) return p.sheet;
  return LEGACY_MODEL_FIELDS.filter(([k]) => p[k]?.trim())
    .map(([k, title]) => `${title}\n${p[k].trim()}`)
    .join("\n\n");
}

export type ProfileData = Record<string, string>;

export function cleanProfile(input: unknown, fields: readonly { k: string; max?: number }[]): ProfileData {
  const out: ProfileData = {};
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const f of fields) {
    const v = src[f.k];
    if (typeof v === "string" && v.trim()) out[f.k] = v.slice(0, f.max ?? 3000);
  }
  return out;
}

/** Garde les marques internes (`_rn` note Reveal importée, `_ai` ajouts de l'IA, `_cantPay`…) lors d'un enregistrement depuis l'interface. */
export function keepImportMark(prev: Record<string, unknown>, next: ProfileData): ProfileData {
  const keep = Object.fromEntries(Object.entries(prev).filter(([k]) => k.startsWith("_")));
  return { ...keep, ...next } as ProfileData;
}
