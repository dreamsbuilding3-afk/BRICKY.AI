/** @type {import('next').NextConfig} */

// En-têtes de sécurité appliqués à toutes les pages et routes API.
const securityHeaders = [
  // Empêche d'afficher Bricky dans une iframe d'un autre site (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Le navigateur ne « devine » pas le type d'un fichier (PDF, CSV…).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Les liens sortants ne transmettent que le domaine, jamais l'URL complète
  // (évite de fuiter un lien de partage /share/<jeton> vers un site tiers).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Fonctions du navigateur non utilisées par l'app : désactivées.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages privées ou personnelles : jamais dans les moteurs de recherche.
      {
        source: "/:dir(share|account|properties|analyze|espace|dossiers|team|export|alerts|checkout|merci|reset-password|progress|projet|visite|compare|onboarding)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
