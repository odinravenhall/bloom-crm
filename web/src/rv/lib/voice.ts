// Dictée vocale du chat : réglages de l'agence + transformation du texte dicté en style « messages entre copines ».
// Partagé serveur / navigateur (pas de "server-only"). Aucune IA : des règles, appliquées « parfois » (comme une vraie fille
// qui n'abrège pas tout, tout le temps), avec un hasard figé pendant une dictée pour que le texte ne bouge pas en direct.

export type VoiceConfig = {
  /** Bouton micro visible dans le chat (coupé par défaut, activé par un admin dans Configuration). */
  enabled: boolean;
  /** Style girly : contractions, abréviations, « ouii », « trop bieen »… */
  girly: boolean;
  /** Dosage du style girly, 0 à 1 (0,3 léger · 0,55 naturel · 0,85 fort · 1 toujours). */
  dose: number;
  /** Garder / ajouter les « ? » (questions détectées dans la phrase ou à l'intonation). Toute autre ponctuation est retirée. */
  keepQuestion: boolean;
  /** Détecter les questions à l'intonation (la voix monte en fin de phrase). */
  intonation: boolean;
  /** Envoyer tout seul à la fin de la dictée (sinon le texte reste dans la zone, le chatteur relit et fait Entrée). */
  autoSend: boolean;
  /** Règles en plus, une par ligne : « avant => après » (toujours appliquées). Plusieurs choix : « avant => a | b | c » (un au hasard). */
  custom: string;
  /** Corrections des erreurs de la reconnaissance, une par ligne : « avant => après » (appliquées avant le style). */
  fixes: string;
};

export const DEFAULT_VOICE: VoiceConfig = { enabled: false, girly: true, dose: 0.55, keepQuestion: true, intonation: true, autoSend: false, custom: "", fixes: "" };

export const DOSES: { v: number; label: string; sub: string }[] = [
  { v: 0.3, label: "Léger", sub: "quelques contractions, rarement une abréviation" },
  { v: 0.55, label: "Naturel", sub: "comme une vraie fille : parfois oui, parfois non" },
  { v: 0.85, label: "Fort", sub: "beaucoup d’abréviations et d’allongements" },
  { v: 1, label: "Toujours", sub: "toutes les règles à chaque fois (pour tester)" },
];

export function parseVoice(v: unknown): VoiceConfig {
  let o: Partial<VoiceConfig> = {};
  try {
    o = (typeof v === "string" ? JSON.parse(v) : v) as Partial<VoiceConfig>;
  } catch {}
  if (!o || typeof o !== "object") o = {};
  const bool = (k: keyof VoiceConfig) => (typeof o[k] === "boolean" ? (o[k] as boolean) : (DEFAULT_VOICE[k] as boolean));
  const dose = Number(o.dose);
  return {
    enabled: bool("enabled"),
    girly: bool("girly"),
    dose: Number.isFinite(dose) ? Math.min(1, Math.max(0, dose)) : DEFAULT_VOICE.dose,
    keepQuestion: bool("keepQuestion"),
    intonation: bool("intonation"),
    autoSend: bool("autoSend"),
    custom: typeof o.custom === "string" ? o.custom.slice(0, 5000) : "",
    fixes: typeof o.fixes === "string" ? o.fixes.slice(0, 5000) : "",
  };
}

/** Séparateur de phrases venant de la dictée (une pause = une phrase). */
export const SEG = " ";
/** Marque « la voix est montée en fin de phrase » posée par la dictée. */
export const RISING = "⸮";

// Limites de mot qui comprennent les accents (\b de JS ne connaît que l'ASCII).
const B = "(?<![\\p{L}\\p{N}'])";
const E = "(?![\\p{L}\\p{N}])";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Expression entière (insensible à la casse), espaces souples entre les mots, apostrophe facultative. */
const word = (from: string) => new RegExp(B + from.trim().split(/\s+/).map((w) => w.split("'").map(esc).join("[' ]?")).join("\\s+") + E, "giu");

// Hasard reproductible : même graine + même règle + même occurrence = même choix (le texte ne « clignote » pas pendant la dictée).
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rand(seed: number, key: string) {
  let t = (hash(key) + seed * 0x9e3779b1) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Mots dictés pour la ponctuation et les retours à la ligne.
const SPOKEN: [RegExp, string][] = [
  [new RegExp("\\s*" + B + "points? d'interrogation" + E, "giu"), " ?"],
  [new RegExp("\\s*" + B + "points? d'exclamation" + E, "giu"), " "],
  [new RegExp("\\s*" + B + "(?:à|a) la ligne" + E + "\\s*", "giu"), "\n"],
  [new RegExp("\\s*" + B + "nouvelle ligne" + E + "\\s*", "giu"), "\n"],
  [new RegExp("\\s*" + B + "points? de suspension" + E, "giu"), " "],
];

/**
 * Règles girly. kind : c = contraction (très naturelle, souvent), a = abréviation (de temps en temps),
 * e = allongement (« ouii » : rarement, 2 au plus par message). Plusieurs sorties = une au hasard.
 * L'ordre compte (expressions longues d'abord). Le texte est déjà en minuscules.
 */
type Kind = "c" | "a" | "e";
const GIRLY: [Kind, string, string[]][] = [
  ["a", "je ne sais pas", ["jsp", "jsais pas", "je sais pas"]],
  ["a", "je sais pas", ["jsp", "jsais pas"]],
  ["c", "il y a", ["y'a", "y a"]],
  ["c", "je suis", ["jsuis", "chuis"]],
  ["c", "tu es", ["t'es"]],
  ["c", "tu as", ["t'as"]],
  ["c", "tu avais", ["t'avais"]],
  ["c", "tu étais", ["t'étais"]],
  ["c", "je te", ["jte"]],
  ["c", "je me", ["jme"]],
  ["c", "je vais", ["jvais"]],
  ["c", "je veux", ["jveux"]],
  ["c", "je peux", ["jpeux"]],
  ["c", "je pense", ["jpense"]],
  ["c", "je crois", ["jcrois"]],
  ["c", "je le", ["jle"]],
  ["c", "qu'est-ce que", ["qu'est ce que"]],
  ["c", "qu'est-ce qui", ["qu'est ce qui"]],
  ["c", "est-ce que", ["est ce que"]],
  ["a", "s'il te plaît", ["stp"]],
  ["a", "s'il te plait", ["stp"]],
  ["a", "parce que", ["pcq", "parce que"]],
  ["a", "pourquoi", ["pk", "pq"]],
  ["a", "d'accord", ["dacc", "d'acc"]],
  ["a", "aujourd'hui", ["ajd", "auj"]],
  ["a", "toujours", ["tjrs", "tjr"]],
  ["a", "vraiment", ["vrmt", "vrm"]],
  ["a", "peut-être", ["ptet", "ptetre"]],
  ["a", "peut être", ["ptet", "ptetre"]],
  ["a", "merci beaucoup", ["merci bcp", "merciii bcp"]],
  ["a", "beaucoup", ["bcp"]],
  ["a", "tout de suite", ["tt de suite"]],
  ["a", "quelque chose", ["qlq chose"]],
  ["a", "quand même", ["qd même"]],
  ["a", "petit", ["ptit"]],
  ["a", "petite", ["ptite"]],
  ["a", "rendez-vous", ["rdv"]],
  ["a", "c'est vrai", ["c vrai"]],
  ["e", "oui", ["ouii", "ouiii"]],
  ["e", "ouais", ["ouaiis", "ouaiiis"]],
  ["e", "trop bien", ["trop bieen", "trop bieeen"]],
  ["e", "trop mignon", ["trop mignoon"]],
  ["e", "trop beau", ["trop beauu"]],
  ["e", "merci", ["merciii", "mercii"]],
  ["e", "coucou", ["coucouu", "coucouuu"]],
  ["e", "j'adore", ["j'adoore", "j'adoooore"]],
  ["e", "bisous", ["bisouus", "bisouuus"]],
  ["e", "grave", ["graave"]],
  ["e", "mdr", ["mdrr", "mdrrr"]],
  ["e", "hâte", ["hâââte", "haaate"]],
  ["e", "non", ["nonn", "nooon"]],
  ["e", "chou", ["chouu"]],
  ["e", "génial", ["géniaal"]],
  ["e", "salut", ["saluut"]],
];
const COMPILED = GIRLY.map(([kind, from, to]) => ({ kind, from, to, re: word(from) }));

// « ne » de négation (« il ne veut pas » → « il veut pas ») : à l'oral on ne le dit presque jamais.
const NEG_NE = new RegExp(B + "ne\\s+(?=(?:[\\p{L}'-]+\\s+){1,3}?(?:pas|jamais|plus|rien|personne)" + E + ")", "giu");
const NEG_N = new RegExp(B + "(je|tu|on|il|elle|ils|elles|ça|ca) n'(?=[\\p{L}'-]+\\s+(?:[\\p{L}'-]+\\s+)?(?:pas|jamais|plus|rien|personne)" + E + ")", "giu");

// --- Questions sans point d'interrogation (la dictée n'en met pas) ---
const LEAD = "(?:(?:et|alors|sinon|bon|mais|du coup|dis|dis moi|dis-moi|hey|coucou|ouii?|ok|bref|là|la|euh)\\s+)*";
/** Phrases qui commencent comme une question. */
const Q_START = new RegExp(
  "^" + LEAD +
    "(?:est[- ]ce (?:que|qu')|qu'est[- ]ce|pourquoi|pk|comment|combien|où|quel âge|qui|" +
    "tu (?:veux|voudrais|peux|pourrais|aimes|aimerais|kiffes|préfères|penses|crois|connais|dors|bosses|travailles|rentres|as envie|as déjà|es libre|es dispo|es où|habites)|" +
    "t'(?:as envie|as déjà|aimes|es libre|es dispo|es où|habites|en penses)|ça te (?:dit|plaît|plait|tente|va)|vous (?:voulez|pouvez|faites))" + E,
  "iu",
);
/** Question au milieu de la phrase (« et sinon là tu fais quoi en ce moment »). */
const Q_MID = new RegExp(
  B + "(?:(?:tu|t'|vous|on|il|elle)\\s?[\\p{L}'-]+(?:\\s+[\\p{L}'-]+)?\\s+(?:quoi|où|combien)|c'est (?:quoi|qui|où|quand|combien|comment)|" +
    "[\\p{L}]+-(?:tu|vous)|tu (?:fais|as fait|veux|penses|en penses) quoi|t'(?:as fait|en penses) quoi)" + E,
  "giu",
);
/** Fins de phrase qui font une question (« c'est bien non », « et toi »). */
const Q_END = new RegExp(B + "(?:hein|ou pas|et toi|ça va|ca va|tu crois|c'est ça|t'es sûr|t'es sure|tu trouves|pas vrai)\\s*$", "iu");
/** Nouvelle proposition qui suit une question (« tu fais quoi | moi je m'ennuie »). */
const NEW_CLAUSE = /^\s+(?:moi|je|j'|jsuis|perso|parce|pcq|car|mais|en tout cas|bref)(?![\p{L}])/iu;
/** Début d'une deuxième idée après une question en début de phrase. */
const SECOND = /\s+(?=(?:parce que|pcq|car|moi je|mais moi|perso)(?![\p{L}]))/iu;

function addQuestion(chunk: string): string {
  if (!chunk.trim() || /\?\s*$/.test(chunk)) return chunk;
  if (Q_START.test(chunk.trim())) {
    // « pourquoi tu réponds pas | parce que… » : le ? se met avant la deuxième idée.
    const cut = SECOND.exec(chunk);
    return cut ? `${chunk.slice(0, cut.index)} ?${chunk.slice(cut.index)}` : chunk.replace(/\s*$/, " ?");
  }
  if (Q_END.test(chunk)) return chunk.replace(/\s*$/, " ?");
  Q_MID.lastIndex = 0;
  const m = Q_MID.exec(chunk);
  if (!m) return chunk;
  const end = m.index + m[0].length;
  if (NEW_CLAUSE.test(chunk.slice(end))) return `${chunk.slice(0, end)} ?${chunk.slice(end)}`;
  return chunk.replace(/\s*$/, " ?");
}

/** Règles perso de l'agence : « avant => après » ou « avant => a | b | c », une par ligne. */
export function parseCustom(s: string): [string, string[]][] {
  return String(s || "")
    .split("\n")
    .map((l) => l.split(/=>|→/))
    .filter((p) => p.length === 2 && p[0].trim())
    .map((p) => [p[0].trim().toLowerCase(), p[1].split("|").map((x) => x.trim())] as [string, string[]])
    .slice(0, 300);
}

// --- Corrections des erreurs de la reconnaissance vocale (homophones) ---
// Seulement des cas sûrs : « j'ai mis » n'est remplacé par « jamais » que là où « j'ai mis » n'a aucun sens.
const JAMAIS_AFTER = "(?:ça|ca|rien|personne|de la vie|de ma vie|vu|vue|fait|été|eu|dit|pensé|pu|su|connu|essayé|testé|plus|encore|au grand jamais|non plus|avec toi|avec moi|sans toi)";
const BUILTIN_FIXES: [RegExp, string][] = [
  [new RegExp(B + "j'ai mis(?=\\s*$)", "giu"), "jamais"],
  [new RegExp(B + "j'ai mis(?=\\s+" + JAMAIS_AFTER + E + ")", "giu"), "jamais"],
  [new RegExp("(?<=" + B + "(?:plus|presque|toujours ou|ou|quasi|quasiment)\\s+)j'ai mis" + E, "giu"), "jamais"],
  [new RegExp("(?<=" + B + "(?:ne|n')\\s?[\\p{L}'-]+\\s+)j'ai mis" + E, "giu"), "jamais"],
  [new RegExp(B + "sa (?=va|fait|me|te|y est|marche|dépend|m'|t')", "giu"), "ça "],
  [new RegExp(B + "(?:ces|ses|sait) (?=trop|vrai|bon|bien|chaud|mignon|beau|ouf|fou|grave|nul|pas|sûr|sur|clair|cool|top|parfait|dommage|normal|quoi|qui|toi|moi)", "giu"), "c'est "],
  [new RegExp(B + "(?:tes|thé) (?=trop|vraiment|où|ou|là|la|sûr|sur|chou|beau|mignon|fou|grave|qui|libre|dispo|pas|toujours|encore|chaud|réveillé|couché|seul|parti)", "giu"), "t'es "],
  [new RegExp(B + "(?:j'ai|g) (?=suis)", "giu"), "je "],
];

/** Corrige les erreurs connues de la dictée (texte déjà en minuscules). Liste intégrée + liste de l'agence. */
export function applyFixes(t: string, fixes: string): string {
  let c = t;
  for (const [re, to] of BUILTIN_FIXES) c = c.replace(re, to);
  for (const [from, to] of parseCustom(fixes)) c = c.replace(word(from), to[0] ?? "");
  return c.replace(/\s+/g, " ").trim();
}

type StyleOpts = Pick<VoiceConfig, "girly" | "keepQuestion" | "custom"> & Partial<Pick<VoiceConfig, "dose" | "fixes">> & { seed?: number };

const tidy = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Comme `stylize`, mais rend le résultat de chaque phrase dictée (séparées par `SEG`) à part,
 * pour la relecture (mots douteux, alternatives). `stylize(t) === tidy(stylizeSegments(t).join(" "))`.
 */
export function stylizeSegments(raw: string, cfg: StyleOpts): string[] {
  const seed = cfg.seed ?? 1;
  const d = cfg.girly ? Math.min(1, Math.max(0, cfg.dose ?? DEFAULT_VOICE.dose)) : 0;
  const prob: Record<Kind, number> = { c: d >= 1 ? 1 : 0.45 + 0.5 * d, a: d >= 1 ? 1 : 0.85 * d, e: d >= 1 ? 1 : 0.6 * d };
  const maxE = d >= 1 ? 99 : d >= 0.7 ? 3 : d >= 0.4 ? 2 : 1;
  const seen: Record<string, number> = {};
  let elongations = 0;
  const pick = (key: string, list: string[]) => list[Math.floor(rand(seed, key + "#pick") * list.length)] ?? list[0];

  const one = (chunk: string) => {
    const nl = chunk.startsWith("\n") ? "\n" : "";
    let c = chunk.replace(/^\n/, "");
    const rising = c.includes(RISING);
    const asked = /\?/.test(c);
    c = c.replace(new RegExp(RISING, "g"), " ");
    // Ponctuation retirée (on garde les apostrophes, les tirets dans les mots et les emojis).
    c = c.replace(/[.,;:…"«»()[\]{}_*/\|~^!?]+/g, " ").replace(/ - | -|- /g, " ").replace(/\s+/g, " ").trim();
    if (!c) return nl;
    c = applyFixes(c, cfg.fixes ?? "");
    // Négation : le « ne » saute (toujours, c'est comme ça qu'on parle).
    if (cfg.girly) {
      c = c.replace(NEG_N, (_, p: string) => (p === "je" ? "j'" : p === "tu" ? "t'" : p + " "));
      c = c.replace(NEG_NE, "");
    }
    if (cfg.keepQuestion) {
      c = addQuestion(c);
      if ((asked || rising) && !/\?\s*$/.test(c)) c += " ?";
    }
    if (cfg.girly && d > 0) {
      for (const r of COMPILED) {
        c = c.replace(r.re, (m) => {
          const n = (seen[r.from] = (seen[r.from] ?? 0) + 1);
          const key = `${r.from}:${n}`;
          if (r.kind === "e" && elongations >= maxE) return m;
          if (rand(seed, key) >= prob[r.kind]) return m;
          if (r.kind === "e") elongations++;
          return pick(key, r.to);
        });
      }
    }
    for (const [from, to] of parseCustom(cfg.custom)) {
      c = c.replace(word(from), () => {
        const n = (seen["custom:" + from] = (seen["custom:" + from] ?? 0) + 1);
        return pick(`custom:${from}:${n}`, to);
      });
    }
    return nl + c;
  };

  return String(raw || "")
    .split(SEG)
    .map((seg) => {
      let t = seg.replace(/[’`´]/g, "'");
      for (const [re, to] of SPOKEN) t = t.replace(re, to);
      t = t.toLocaleLowerCase("fr-FR");
      // Une phrase écrite (. ! ? retour à la ligne) = un morceau, traité à part pour repérer les questions.
      return tidy(t.split(/(?<=[.!?])\s+|(?=\n)/u).map(one).join(" "));
    });
}

/**
 * Transforme le texte dicté en message prêt à envoyer.
 * Le texte peut contenir des fins de phrase `SEG` et des marques d'intonation montante `RISING` (posées par la dictée).
 */
export function stylize(raw: string, cfg: StyleOpts): string {
  return tidy(stylizeSegments(raw, cfg).join(" "));
}
