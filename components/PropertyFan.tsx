"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocale } from "./LocaleProvider";
import "./propertyFan.css";

// Carrousel « coverflow » de vraies photos de biens sous le texte d'accueil :
// carte centrale mise en avant, voisines inclinées en perspective, titre + sous-titre
// en bas de carte, compteur en haut, pastilles d'infos sous la carte active.
// Photos libres de droits (Licence Unsplash).
//   appartement : unsplash.com/photos/ZuHIek5xn_I · villa : Id7u0EkTjBE · maison : x7CdF3Em954
//   immeuble : unsplash.com/photos/a86c648900de (immeuble d'angle en brique, servi par le CDN Unsplash)
//   penthouse : unsplash.com/photos/a63773e24fe4 (piscine sur le toit, servi par le CDN Unsplash)
const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=600&h=900&fit=crop&auto=format&q=72`;

type Card = {
  code: string;
  label: string;
  sub: string;
  img: string;
  rooms: number;
  roomsKey: string;
  area: number;
  feat: string;
  dpe: string;
};

const CARDS: Card[] = [
  { code: "maison", label: "ptype.short.maison", sub: "fan.sub.maison", img: "/img/biens/maison.webp", rooms: 4, roomsKey: "fan.rooms", area: 120, feat: "fan.feat.jardin", dpe: "C" },
  { code: "villa", label: "ptype.villa", sub: "fan.sub.villa", img: "/img/biens/villa.webp", rooms: 6, roomsKey: "fan.rooms", area: 240, feat: "fan.feat.piscine", dpe: "B" },
  { code: "appartement", label: "ptype.short.appartement", sub: "fan.sub.appartement", img: "/img/biens/appartement.webp", rooms: 3, roomsKey: "fan.rooms", area: 68, feat: "fan.feat.balcon", dpe: "C" },
  { code: "immeuble", label: "ptype.short.immeuble", sub: "fan.sub.immeuble", img: unsplash("photo-1755567818043-a86c648900de"), rooms: 8, roomsKey: "fan.lots", area: 540, feat: "fan.feat.rendement", dpe: "D" },
  { code: "penthouse", label: "ptype.short.penthouse", sub: "fan.sub.penthouse", img: unsplash("photo-1789374474571-a63773e24fe4"), rooms: 5, roomsKey: "fan.rooms", area: 180, feat: "fan.feat.rooftop", dpe: "B" },
];
const N = CARDS.length;
const AUTO_MS = 4200;

const Icon = {
  rooms: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14M2 20h20M12 12h.01" /></svg>
  ),
  area: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" /></svg>
  ),
  feat: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.2 5.4L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.6z" /></svg>
  ),
  dpe: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
  ),
};

export function PropertyFan() {
  const { t } = useLocale();
  const [active, setActive] = useState(2);
  const [paused, setPaused] = useState(false);
  const drag = useRef<{ x: number; id: number } | null>(null);

  const go = useCallback((dir: number) => setActive((a) => (a + dir + N) % N), []);

  // Défilement automatique (coupé au survol, au focus, onglet caché ou animations réduites).
  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) go(1);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, go, active]);

  const card = CARDS[active];

  return (
    <section
      className="pf"
      aria-label={t("hero.fan.aria")}
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div
        className="pf-stage"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, id: e.pointerId };
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {CARDS.map((c, i) => {
          const off = ((i - active + N + 2) % N) - 2; // position relative : -2 … 2
          return (
            <button
              key={c.code}
              type="button"
              className="pf-card"
              data-off={off}
              aria-current={off === 0}
              aria-label={`${t(c.label)} — ${t(c.sub)}`}
              tabIndex={off === 0 ? 0 : -1}
              onClick={() => setActive(i)}
              style={{ "--d": `${Math.abs(off) * 0.12}s` } as CSSProperties}
            >
              <img src={c.img} alt="" width={400} height={600} loading={Math.abs(off) <= 1 ? "eager" : "lazy"} decoding="async" draggable={false} />
              <span className="pf-shade" />
              <span className="pf-count">
                {i + 1}/{N}
              </span>
              <span className="pf-cap">
                <b>{t(c.label)}</b>
                <small>{t(c.sub)}</small>
              </span>
            </button>
          );
        })}
      </div>

      <ul className="pf-chips" key={card.code} aria-live="polite">
        <li>
          {Icon.rooms}
          {t(card.roomsKey, { n: card.rooms })}
        </li>
        <li>
          {Icon.area}
          {card.area} m²
        </li>
        <li>
          {Icon.feat}
          {t(card.feat)}
        </li>
        <li>
          {Icon.dpe}
          {t("fan.dpe", { l: card.dpe })}
        </li>
      </ul>
    </section>
  );
}
