"use client";

import Link from "next/link";
import { useLocale } from "./LocaleProvider";

/* Visuel d'ouverture de la page Tarifs : un grand « 0 € » chromé en relief,
   un dossier Bricky en verre fumé derrière, des étincelles, sur fond nuit
   traversé de lumière orange. Tout est en SVG / CSS : net à toutes les tailles. */

const Sparkle = ({ className }: { className: string }) => (
  <svg className={"ph-sparkle " + className} viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 0 C21.6 12 28 18.4 40 20 C28 21.6 21.6 28 20 40 C18.4 28 12 21.6 0 20 C12 18.4 18.4 12 20 0 Z" fill="url(#ph-chrome)" />
  </svg>
);

const DEPTH = Array.from({ length: 18 }, (_, i) => i + 1);

export default function PricingHero() {
  const { t } = useLocale();
  return (
    <section className="pricing-hero" aria-labelledby="pricing-hero-title">
      <div className="ph-stage" aria-hidden="true">
        {/* dégradés partagés */}
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="ph-chrome" x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset=".18" stopColor="#dcdce2" />
              <stop offset=".38" stopColor="#8e909a" />
              <stop offset=".52" stopColor="#f5f5f7" />
              <stop offset=".72" stopColor="#a7a9b2" />
              <stop offset="1" stopColor="#ececf0" />
            </linearGradient>
            <linearGradient id="ph-side" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff8a4d" />
              <stop offset=".55" stopColor="#ff5a1f" />
              <stop offset="1" stopColor="#7a2606" />
            </linearGradient>
            <linearGradient id="ph-rim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
              <stop offset="1" stopColor="#ffffff" stopOpacity=".15" />
            </linearGradient>
          </defs>
        </svg>

        {/* dossier Bricky en verre fumé */}
        <div className="ph-card">
          <div className="ph-card-top">
            <span className="ph-card-mark">B</span>
            <span className="ph-card-label">{t("pricing.hero.cardLabel")}</span>
            <img className="ph-card-house" src="/img/biens-3d/maison.webp" alt="" width="56" height="56" decoding="async" />
          </div>
          <div className="ph-card-score">
            <span>{t("pricing.hero.cardScore")}</span>
            <strong>82<small>/100</small></strong>
            <i><b /></i>
          </div>
          <div className="ph-card-foot">
            <span>{t("pricing.hero.cardNumber")}</span>
            <span>{t("pricing.hero.cardSub")}</span>
          </div>
        </div>

        {/* grand 0 € chromé en relief */}
        <svg className="ph-zero" viewBox="0 0 380 320">
          <g className="ph-glyphs">
            {DEPTH.map((i) => (
              <text key={"z" + i} x={150 + i * 1.1} y={272 + i * 0.75} className="ph-zero-txt" fill="url(#ph-side)">0</text>
            ))}
            <text x="150" y="272" className="ph-zero-txt" fill="url(#ph-chrome)" stroke="url(#ph-rim)" strokeWidth="2">0</text>
            {DEPTH.slice(0, 10).map((i) => (
              <text key={"e" + i} x={300 + i * 0.9} y={150 + i * 0.6} className="ph-euro-txt" fill="url(#ph-side)">€</text>
            ))}
            <text x="300" y="150" className="ph-euro-txt" fill="url(#ph-chrome)" stroke="url(#ph-rim)" strokeWidth="1.5">€</text>
          </g>
        </svg>

        <Sparkle className="ph-sparkle-1" />
        <Sparkle className="ph-sparkle-2" />
        <Sparkle className="ph-sparkle-3" />
      </div>

      <div className="ph-copy">
        <span className="ph-chip"><span className="ph-chip-mark">B</span>Bricky</span>
        <h2 id="pricing-hero-title">
          <span className="ph-title-1">{t("pricing.hero.title1")}</span>
          <span className="ph-title-2">{t("pricing.hero.title2")}</span>
        </h2>
        <p className="ph-sub">{t("pricing.hero.sub")}</p>
        <Link href="/analyze" className="ph-cta">
          {t("pricing.hero.cta")}
          <span className="ph-cta-arrow" aria-hidden="true">↗</span>
        </Link>
      </div>
    </section>
  );
}
