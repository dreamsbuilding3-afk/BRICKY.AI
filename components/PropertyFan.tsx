"use client";

import { useLocale } from "./LocaleProvider";
import "./propertyFan.css";

// Éventail de vraies photos de biens sous le texte d'accueil.
// Photos libres de droits (Licence Unsplash), compressées en WebP 420×560 (~20 Ko chacune),
// chargées à la demande. Animation CSS légère (flottement), coupée si l'utilisateur réduit les animations.
//   appartement : unsplash.com/photos/ZuHIek5xn_I · villa : Id7u0EkTjBE · immeuble : yyb5HOnHfus
//   maison : x7CdF3Em954 · penthouse : iqGUN6GIl78
const CARDS: { code: string; label: string; pos: number }[] = [
  { code: "maison", label: "ptype.short.maison", pos: -2 },
  { code: "villa", label: "ptype.villa", pos: -1 },
  { code: "appartement", label: "ptype.short.appartement", pos: 0 },
  { code: "immeuble", label: "ptype.short.immeuble", pos: 1 },
  { code: "penthouse", label: "ptype.short.penthouse", pos: 2 },
];

export function PropertyFan() {
  const { t } = useLocale();
  return (
    <section className="pf" aria-label={t("hero.fan.aria")}>
      <div className="pf-stage">
        {CARDS.map((c) => (
          <figure key={c.code} className={`pf-card pf-pos${c.pos < 0 ? "m" : "p"}${Math.abs(c.pos)}`}>
            <img
              src={`/img/biens/${c.code}.webp`}
              alt={t(c.label)}
              width={420}
              height={560}
              loading={c.pos === 0 ? "eager" : "lazy"}
              decoding="async"
            />
            <figcaption>
              <span className="pf-dot" />
              {t(c.label)}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
