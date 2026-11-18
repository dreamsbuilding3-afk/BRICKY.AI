"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";

// Boutons « langue » et « clair / sombre ».
// Quand la page a une barre de navigation, ils s'y rangent (à droite, avant le menu sur
// téléphone) au lieu de flotter par-dessus et de cacher les boutons de la barre.
// Sur les pages sans barre (connexion, questionnaire…), ils restent en haut à droite.
export function SiteTools() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    let frame = 0;
    const find = () => {
      frame = 0;
      const nav = document.querySelector<HTMLElement>("nav.nav");
      if (!nav) { setSlot(null); return; }
      let el = nav.querySelector<HTMLElement>(":scope > .nav-tools");
      if (!el) {
        el = document.createElement("div");
        el.className = "nav-tools";
        nav.appendChild(el);
      }
      setSlot((prev) => (prev === el ? prev : el));
    };
    find();
    // Les barres de navigation de l'app apparaissent parfois après le chargement de la session.
    const mo = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(find); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [pathname]);

  if (!mounted) return null;
  const tools = (
    <>
      <LanguageToggle />
      <ThemeToggle />
    </>
  );
  return slot && slot.isConnected ? createPortal(tools, slot) : tools;
}
