"use client";

// Le CRM est coupé en deux : on travaille sur OnlyFans OU sur MYM (Reveal plus tard), comme le choix de plateforme
// d'Infloww. Le choix est gardé dans un cookie « bloom_pf » : le serveur ne montre alors que les créatrices de cette
// plateforme (messagerie, chiffres, scripts, vault, envoi groupé…). L'IA et l'équipe restent communes.
// Une seule plateforme à la fois (OnlyFans par défaut). Seul l'Accueil montre toute l'agence.
export type Pf = "of" | "mym";
export const PF_LABEL: Record<Pf, string> = { of: "OnlyFans", mym: "MYM" };

export function getPf(): Pf {
  if (typeof document === "undefined") return "of";
  return /(?:^|;\s*)bloom_pf=mym(?:;|$)/.test(document.cookie) ? "mym" : "of";
}
export function setPf(p: Pf) {
  document.cookie = `bloom_pf=${p}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax; Secure`;
}
/** Pages qui voient toutes les créatrices : l'Accueil (toute l'agence) et les pages communes (IA, équipe, réglages). */
export const isCommonPage = (path: string) => path === "/app" || path === "/v2" || /^\/app\/(ia|equipe|creatrices|reglages|parametres)(\/|$)/.test(path);
