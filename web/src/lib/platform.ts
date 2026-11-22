"use client";

// Le CRM est coupé en deux : on travaille sur OnlyFans OU sur MYM (Reveal plus tard), comme le choix de plateforme
// d'Infloww. Le choix est gardé dans un cookie « bloom_pf » : le serveur ne montre alors que les créatrices de cette
// plateforme (messagerie, chiffres, scripts, vault, envoi groupé…). L'IA et l'équipe restent communes.
// « all » : vue d'ensemble de toute l'agence (toutes les modèles, chiffres globaux).
export type Pf = "all" | "of" | "mym";
export const PF_LABEL: Record<Pf, string> = { all: "Toute l’agence", of: "OnlyFans", mym: "MYM" };

export function getPf(): Pf {
  if (typeof document === "undefined") return "all";
  const m = /(?:^|;\s*)bloom_pf=(of|mym|all)(?:;|$)/.exec(document.cookie);
  return (m?.[1] as Pf) || "all";
}
export function setPf(p: Pf) {
  document.cookie = `bloom_pf=${p}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax; Secure`;
}
/** Pages communes aux deux plateformes (toutes les créatrices y sont visibles). */
export const isCommonPage = (path: string) => /^\/app\/(ia|equipe|creatrices|reglages|parametres)(\/|$)/.test(path);
