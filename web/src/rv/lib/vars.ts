/** Variables des scripts : {prénom} (ou {prenom}) remplacé par le prénom du fan. */
const PRENOM = /\{\s*pr[ée]nom\s*\}/gi;

export function hasVars(text: string) {
  return PRENOM.test(text) && !(PRENOM.lastIndex = 0);
}

/** Remplace les variables. Prénom inconnu : la variable est retirée proprement (« Coucou {prénom} ! » → « Coucou ! »). */
export function fillVars(text: string, v: { prenom?: string | null }) {
  if (!text) return { text, missing: false };
  PRENOM.lastIndex = 0;
  const has = PRENOM.test(text);
  PRENOM.lastIndex = 0;
  if (!has) return { text, missing: false };
  if (v.prenom) return { text: text.replace(PRENOM, v.prenom), missing: false };
  const out = text
    .replace(PRENOM, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,!?.…])/g, "$1")
    .replace(/(^|\n)[ ,]+/g, "$1")
    .trim();
  return { text: out, missing: true };
}

/** Prénom du fan : ligne « Prénom : … » de sa fiche, sinon son surnom s'il ressemble à un prénom. */
export function firstNameFrom(notes: string | null | undefined, nickname: string | null | undefined) {
  const m = /^\s*pr[ée]nom\s*:\s*([^\n,(]+)/im.exec(notes || "");
  if (m && m[1].trim()) return m[1].trim().split(/\s+/)[0];
  const n = String(nickname || "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim();
  if (/^[\p{Lu}][\p{Ll}'-]{1,19}$/u.test(n)) return n;
  return null;
}
