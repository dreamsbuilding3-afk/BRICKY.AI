import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bricky-ai-three.vercel.app"),
  title: {
    default: "Bricky — Know the deal before you make it",
    template: "%s · Bricky",
  },
  description: "Analysez un bien immobilier avant de prendre une décision : rendement, cash-flow, risques, cadastre et urbanisme, en un clic.",
  keywords: ["investissement immobilier", "rentabilité locative", "cash-flow", "rendement locatif", "analyse immobilière", "cadastre", "urbanisme PLU"],
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Bricky — Know the deal before you make it",
    description: "Analysez un bien immobilier avant de prendre une décision : rendement, cash-flow, risques, cadastre et urbanisme, en un clic.",
    url: "https://bricky-ai-three.vercel.app",
    siteName: "Bricky",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bricky — Know the deal before you make it",
    description: "Analysez un bien immobilier avant de prendre une décision : rendement, cash-flow, risques, cadastre et urbanisme, en un clic.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
