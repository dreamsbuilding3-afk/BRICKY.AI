"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PromoSplash } from "../../components/PromoSplash";
import { PROMO_TEMPLATES, type PromoKind } from "../../lib/promo";

const KINDS: { kind: PromoKind; label: string }[] = [
  { kind: "concours", label: "Concours" },
  { kind: "reduction", label: "Réduction" },
  { kind: "annonce", label: "Annonce" },
];

// Aperçu des pages promo : /promo?modele=concours | reduction | annonce
export default function PromoPreviewPage() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}

function Preview() {
  const raw = useSearchParams().get("modele");
  const kind: PromoKind = raw === "reduction" || raw === "annonce" ? raw : "concours";
  return (
    <>
      <nav className="ps-switch" aria-label="Choisir un modèle">
        {KINDS.map((k) => (
          <a key={k.kind} href={`/promo?modele=${k.kind}`} className={k.kind === kind ? "is-on" : ""}>{k.label}</a>
        ))}
      </nav>
      <PromoSplash key={kind} content={PROMO_TEMPLATES[kind]} preview />
    </>
  );
}
