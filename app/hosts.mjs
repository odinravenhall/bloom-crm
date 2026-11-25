// Adresses de la NOUVELLE version de Bloom (v2, 25/11/2026) : bloomcrm.fr. Elles servent le même site et la même base
// que l'adresse principale (bloom.ravencrm.xyz), mais le site entier y est la nouvelle version, sans « /v2 » dans
// l'adresse (« / » = son accueil, « /chiffres »… : voir next.config.mjs et web/src/lib/v2host.ts).
// Liste fermée : c'est elle qui dit vers où une connexion a le droit de repartir (jamais une adresse lue dans la requête).
export const V2_HOSTS = (process.env.V2_HOSTS || 'bloomcrm.fr,www.bloomcrm.fr')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter((h) => /^[a-z0-9.-]+$/.test(h));
export const isV2Host = (h) => V2_HOSTS.includes(String(h || '').toLowerCase());
export const V2_ORIGINS = V2_HOSTS.map((h) => `https://${h}`);
