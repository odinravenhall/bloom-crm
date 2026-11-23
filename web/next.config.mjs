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
  // MYM → Importer des médias : les vidéos passent par ici vers l'API (10 Mo par défaut).
  experimental: { proxyClientMaxBodySize: "500mb" },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API}/api/:path*` },
      { source: "/media", destination: `${API}/media` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
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
