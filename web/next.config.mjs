/** @type {import('next').NextConfig} */
// L'API (conteneur « app », alias réseau « api ») fait tout le travail avec Substy et Discord :
// le navigateur ne parle qu'à ce site, qui relaie /api et /media.
const API = process.env.API_URL || "http://api:3000";
// Adresse dédiée à « Accès MYM (Direct) » : tout ce qui y arrive part vers le relais du site MYM (app/mymsite.mjs).
const MYM_SITE_HOST = process.env.MYM_SITE_HOST || "mym.ravencrm.xyz";
// Adresses de la NOUVELLE version (v2) : même site, mais la racine y ouvre /v2. Même liste que app/hosts.mjs.
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
  // MYM → Importer des médias : les vidéos passent par ici vers l'API (10 Mo par défaut).
  experimental: { proxyClientMaxBodySize: "500mb" },
  async redirects() {
    return V2_HOSTS.flatMap((host) => {
      const has = [{ type: "host", value: host.replace(/\./g, "\\.") }];
      return [
        { source: "/", has, destination: "/v2", permanent: false },
        { source: "/app", has, destination: "/v2", permanent: false },
        { source: "/app/messagerie", has, destination: "/v2/messagerie", permanent: false },
        { source: "/api/auth/discord", has, destination: `${MAIN}/api/auth/discord?to=${host}`, permanent: false },
      ];
    });
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: MYM_SITE_HOST }], destination: `${API}/mymsite/` },
        { source: "/:path*", has: [{ type: "host", value: MYM_SITE_HOST }], destination: `${API}/mymsite/:path*` },
      ],
      afterFiles: [
        { source: "/api/:path*", destination: `${API}/api/:path*` },
        { source: "/media", destination: `${API}/media` },
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
