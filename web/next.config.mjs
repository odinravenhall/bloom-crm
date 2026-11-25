/** @type {import('next').NextConfig} */
// L'API (conteneur « app », alias réseau « api ») fait tout le travail avec Substy et Discord :
// le navigateur ne parle qu'à ce site, qui relaie /api et /media.
const API = process.env.API_URL || "http://api:3000";
// Adresse dédiée à « Accès MYM (Direct) » : tout ce qui y arrive part vers le relais du site MYM (app/mymsite.mjs).
const MYM_SITE_HOST = process.env.MYM_SITE_HOST || "mym.ravencrm.xyz";
// Adresses de la NOUVELLE version (bloomcrm.fr) : même site, mais TOUT le site y est la nouvelle version, sans « /v2 »
// dans l'adresse (« / » = l'accueil, « /chiffres » = l'écran Chiffres…). Les pages restent rangées dans app/v2 : ce
// sont les règles ci-dessous qui font le lien. Même liste que app/hosts.mjs et lib/v2host.ts.
// Discord ne connaît que l'adresse principale : « Se connecter avec Discord » y fait l'aller-retour, puis l'API
// ramène sur l'adresse de départ avec un lien à usage unique (voir /api/auth/callback).
const V2_HOSTS = (process.env.V2_HOSTS || "bloomcrm.fr,www.bloomcrm.fr").split(",").map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+$/.test(h));
const MAIN = (process.env.PUBLIC_URL || "https://bloom.ravencrm.xyz").replace(/\/$/, "");

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Pas de compression ici : le flux temps réel (/api/live) doit passer sans être retenu.
  compress: false,
  images: { unoptimized: true },
  // L'adresse du relais du site MYM, connue du navigateur : l'écran « Site MYM » sait ainsi, dès le clic, s'il peut
  // l'afficher dans un cadre (même site que Bloom) ou s'il doit ouvrir un nouvel onglet (MymDirect.tsx).
  // Et la liste des adresses de la nouvelle version (lib/v2host.ts).
  env: { NEXT_PUBLIC_MYM_SITE_HOST: MYM_SITE_HOST, NEXT_PUBLIC_V2_HOSTS: V2_HOSTS.join(",") },
  // MYM → Importer des médias : les vidéos passent par ici vers l'API (10 Mo par défaut).
  experimental: { proxyClientMaxBodySize: "500mb" },
  async redirects() {
    return V2_HOSTS.flatMap((host) => {
      const has = [{ type: "host", value: host.replace(/\./g, "\\.") }];
      return [
        // Pas de « /v2 » dans les adresses ici : on l'enlève des anciens liens et des favoris.
        { source: "/v2", has, destination: "/", permanent: false },
        { source: "/v2/:path*", has, destination: "/:path*", permanent: false },
        // Pages de la version actuelle dont l'écran existe dans la nouvelle.
        { source: "/app", has, destination: "/", permanent: false },
        { source: "/app/messagerie", has, destination: "/messagerie", permanent: false },
        { source: "/app/scripts", has, destination: "/scripts", permanent: false },
        { source: "/app/of-manager", has, destination: "/of-manager", permanent: false },
        { source: "/app/of-manager/:page", has, destination: "/of-manager?p=:page", permanent: false },
        { source: "/api/auth/discord", has, destination: `${MAIN}/api/auth/discord?to=${host}`, permanent: false },
      ];
    });
  },
  async rewrites() {
    const onV2 = (host) => [{ type: "host", value: host.replace(/\./g, "\\.") }];
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: MYM_SITE_HOST }], destination: `${API}/mymsite/` },
        { source: "/:path*", has: [{ type: "host", value: MYM_SITE_HOST }], destination: `${API}/mymsite/:path*` },
        // Nouvelle adresse : la racine EST l'accueil de la nouvelle version (elle passe avant la page « / » du site).
        ...V2_HOSTS.map((host) => ({ source: "/", has: onV2(host), destination: "/v2" })),
      ],
      afterFiles: [
        { source: "/api/:path*", destination: `${API}/api/:path*` },
        { source: "/media", destination: `${API}/media` },
        // Nouvelle adresse : « /chiffres » affiche l'écran rangé dans « /v2/chiffres ». Ces règles ne sont regardées
        // qu'APRÈS les vraies pages (« /connexion », « /app/… », « /pro »…), « /api » et « /media ».
        ...V2_HOSTS.map((host) => ({ source: "/:screen([a-z][a-z0-9-]*)", has: onV2(host), destination: "/v2/:screen" })),
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        // Pas sur l'adresse du site MYM relayé : il est affiché dans un cadre de Bloom.
        missing: [{ type: "host", value: MYM_SITE_HOST }],
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
