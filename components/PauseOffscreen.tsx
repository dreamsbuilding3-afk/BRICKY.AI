"use client";

import { useEffect } from "react";

// Met en pause les animations en boucle (bandeaux qui défilent, objets qui flottent)
// tant qu'elles sont hors de l'écran : le téléphone n'anime plus ce qu'on ne voit pas.
// Rien ne change à l'écran : l'animation reprend dès que la zone redevient visible.
const SELECTORS = [
  ".capability-marquee",
  ".lm-track",
  ".island-steps",
  ".trust-grid",
  ".hero-floaters",
  ".pf",
].join(",");

export function PauseOffscreen() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.classList.toggle("anim-off", !e.isIntersecting);
      },
      { rootMargin: "120px 0px" },
    );
    const scan = () => {
      document.querySelectorAll(SELECTORS).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
    };
    scan();
    // Les pages se remplissent après chargement des données : on rescanne quand le DOM change.
    let pending = 0;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = window.setTimeout(() => { pending = 0; scan(); }, 300);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); window.clearTimeout(pending); };
  }, []);
  return null;
}
