import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bricky — Know the deal before you make it",
  description: "Analysez un bien immobilier avant de prendre une décision.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
