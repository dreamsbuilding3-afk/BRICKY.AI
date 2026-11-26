import type { MetadataRoute } from "next";

// Pages personnelles (biens, analyses, liens de partage…) : rien à faire dans Google.
const PRIVATE_PATHS = [
  "/account", "/properties", "/analyze", "/share", "/espace", "/dossiers", "/team", "/export",
  "/alerts", "/checkout", "/merci", "/reset-password", "/progress", "/projet", "/visite", "/compare",
  "/onboarding", "/api/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: "https://bricky-ai-three.vercel.app/sitemap.xml",
  };
}
