// Adresses de la NOUVELLE version de Bloom (bloomcrm.fr). Le site entier y est la nouvelle version, SANS « /v2 » dans
// l'adresse : « / » = l'accueil, « /chiffres » = l'écran Chiffres… Sur l'adresse principale (bloom.ravencrm.xyz), la
// nouvelle version vit toujours sous « /v2 », à côté de la version actuelle (« /app », « /pro »).
// Les pages restent rangées dans app/v2 : c'est next.config.mjs qui réécrit les adresses, avec la même liste
// (posée dans NEXT_PUBLIC_V2_HOSTS au moment de la construction du site ; même liste que app/hosts.mjs).
export const V2_HOSTS = (process.env.NEXT_PUBLIC_V2_HOSTS || "bloomcrm.fr,www.bloomcrm.fr")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export const isV2Host = (host?: string | null) => V2_HOSTS.includes(String(host || "").toLowerCase().replace(/:\d+$/, ""));

/** Le début des adresses de la nouvelle version sur cette adresse : rien sur bloomcrm.fr, « /v2 » ailleurs. */
export const v2BaseOf = (host?: string | null) => (isV2Host(host) ? "" : "/v2");

/** L'adresse d'un écran : `v2Url(base, "/chiffres")` ; sans chemin, l'accueil (« / » ou « /v2 »). */
export const v2Url = (base: string, path = "") => `${base}${path}` || "/";

/**
 * Le chemin « officiel » d'une page, celui de l'adresse principale (« /v2/chiffres »), quelle que soit l'adresse où
 * l'on est. C'est lui qu'on envoie au serveur (présence, « En direct ») : un seul vocabulaire côté serveur.
 */
export const canonicalPath = (path: string, host?: string | null) =>
  isV2Host(host) && !/^\/(?:v2|app|pro|connexion|partage|l)(?:\/|$)/.test(path) ? `/v2${path === "/" ? "" : path}` : path;
