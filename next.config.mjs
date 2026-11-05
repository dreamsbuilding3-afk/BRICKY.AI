/** @type {import('next').NextConfig} */

// En-têtes de sécurité envoyés avec chaque page :
// - X-Frame-Options : interdit d'afficher Bricky dans un cadre d'un autre site (anti « clickjacking ») ;
// - X-Content-Type-Options : le navigateur ne devine pas le type des fichiers ;
// - Referrer-Policy : les autres sites ne voient que l'adresse du site, jamais le chemin complet ;
// - Permissions-Policy : micro et géolocalisation coupés, caméra réservée à Bricky (photos de visite).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
