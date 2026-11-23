import type { Me } from "./types";

// Accès page par page (Role settings) : chemin → clé de permission (même liste que PERMS dans app/staff.mjs).
const PATHS: [string, string][] = [
  ["/app/of-manager", "ofmanager"],
  ["/app/of", "dashboard"],
  ["/app/analytics/creators", "analytics.creators"],
  ["/app/analytics/employees", "analytics.employees"],
  ["/app/analytics/fans", "analytics.fans"],
  ["/app/analytics/messages", "analytics.messages"],
  ["/pro", "messagespro"],
  ["/app/smart", "growth.smart"],
  ["/app/listes", "growth.lists"],
  ["/app/autofollow", "growth.autofollow"],
  ["/app/vault", "growth.vault"],
  ["/app/scripts", "growth.scripts"],
  ["/app/tracking", "growth.tracking"],
  ["/app/sensitive", "growth.sensitive"],
  ["/app/ia", "growth.ai"],
  ["/app/creators", "creators"],
  ["/app/employees", "employees"],
];

/** Clé de permission d'une adresse (null = page libre). */
export function permOfPath(path: string): string | null {
  const p = path.split("?")[0];
  for (const [prefix, key] of PATHS) if (p === prefix || p.startsWith(prefix + "/")) return key;
  return null;
}
/** La personne peut-elle ouvrir cette adresse ? (sans liste de permissions : on laisse les rôles décider). */
export function canOpen(me: Pick<Me, "perms">, path: string) {
  const key = permOfPath(path);
  return !key || !me.perms || me.perms.includes(key);
}
