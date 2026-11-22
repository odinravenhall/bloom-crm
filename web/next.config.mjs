/** @type {import('next').NextConfig} */
// L'API (conteneur « app », alias réseau « api ») fait tout le travail avec Substy et Discord :
// le navigateur ne parle qu'à ce site, qui relaie /api et /media.
const API = process.env.API_URL || "http://api:3000";

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Pas de compression ici : le flux temps réel (/api/live) doit passer sans être retenu.
  compress: false,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API}/api/:path*` },
      { source: "/media", destination: `${API}/media` },
      // OF Manager : le site OnlyFans / MYM intégré de Substy, relayé par l'API (adresses « /s/<session>/… »).
      { source: "/s/:path*", destination: `${API}/ofb/s/:path*` },
      { source: "/static/prod/:path*", destination: `${API}/ofb/static/prod/:path*` },
    ];
  },
  async headers() {
    return [
      {
        // Toutes les pages sauf le site intégré (affiché dans un cadre de Bloom : SAMEORIGIN, posé par l'API).
        source: "/((?!s/|static/prod/).*)",
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
