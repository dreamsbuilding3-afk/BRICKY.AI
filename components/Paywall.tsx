"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import "./paywall.css";

// Paywall « dès le départ » (méthode LPS Studio) :
// 1. pas d'analyse complète gratuite : le paiement est la porte d'entrée ;
// 2. l'utilisateur voit d'abord SON résultat (score + verdict), le reste est flouté ;
// 3. le paywall tombe au moment où il veut « débloquer » ;
// 4. une offre recommandée ressort d'elle-même (Pro annuel) ;
// 5. celui qui ferme n'est pas perdu : dernière chance avec le pack 3 analyses.
//
// Interrupteur : NEXT_PUBLIC_PAYWALL=off dans Vercel coupe le paywall sans toucher au code.
export const PAYWALL_ON = process.env.NEXT_PUBLIC_PAYWALL !== "off";

/** Accès complet aux analyses : tout forfait payant (Essentiel, Pro, Agence) ou compte fondateur. */
export function useFullAccess() {
  const [state, setState] = useState<{ loading: boolean; paid: boolean }>({ loading: PAYWALL_ON, paid: !PAYWALL_ON });
  useEffect(() => {
    if (!PAYWALL_ON) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_my_subscription");
      if (cancelled) return;
      const code = !error && data && typeof data === "object" ? String((data as { plan_code?: string }).plan_code || "") : "";
      setState({ loading: false, paid: code !== "" && code !== "decouverte" });
    })();
    return () => { cancelled = true; };
  }, []);
  return state;
}

type Pro = { monthly: number; yearly: number | null; quota: number | null };
const eur = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

const UNLOCKS = [
  "Le prix à proposer au vendeur",
  "Rendement net et cash-flow mois par mois",
  "Risques du terrain, cadastre et urbanisme",
  "Le dossier PDF à montrer à la banque",
];

export function Paywall() {
  const [pro, setPro] = useState<Pro>({ monthly: 3400, yearly: 34000, quota: 25 });
  const [billing, setBilling] = useState<"annuel" | "mensuel">("annuel");
  const [step, setStep] = useState<"offer" | "last" | "closed">("offer");

  // Prix lus dans la base, pour rester alignés sur la page Tarifs.
  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select("price_monthly_cents, price_yearly_cents, monthly_analysis_quota")
      .eq("plan_code", "pro")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.price_monthly_cents) setPro({ monthly: data.price_monthly_cents, yearly: data.price_yearly_cents ?? null, quota: data.monthly_analysis_quota ?? null });
      });
  }, []);

  const yearly = pro.yearly ?? pro.monthly * 12;
  const perMonth = Math.round(yearly / 12);
  const monthsFree = Math.round((pro.monthly * 12 - yearly) / pro.monthly);
  const href = `/checkout?plan=pro&periode=${billing}`;

  if (step === "closed") {
    return (
      <div className="pw-bar" role="region" aria-label="Analyse verrouillée">
        <span>Le détail de cette analyse est verrouillé.</span>
        <button type="button" className="pw-bar-btn" onClick={() => setStep("offer")}>Débloquer</button>
      </div>
    );
  }

  if (step === "last") {
    return (
      <div className="pw-card pw-last" role="dialog" aria-labelledby="pw-last-title">
        <button type="button" className="pw-close" onClick={() => setStep("closed")} aria-label="Fermer">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <span className="pw-eyebrow">Avant de partir</span>
        <h3 id="pw-last-title" className="pw-title">Juste ce bien ?</h3>
        <p className="pw-text">Le pack 3 analyses débloque celle-ci et deux autres biens, sans abonnement.</p>
        <div className="pw-pack"><b>12 €</b><span>une seule fois · 3 analyses complètes</span></div>
        <a className="pw-cta" href="/checkout?plan=pack">Débloquer avec le pack</a>
        <button type="button" className="pw-skip" onClick={() => setStep("closed")}>Non merci</button>
      </div>
    );
  }

  return (
    <div className="pw-card" role="dialog" aria-labelledby="pw-title">
      <button type="button" className="pw-close" onClick={() => setStep("last")} aria-label="Fermer">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      <span className="pw-eyebrow">Votre analyse complète est prête</span>
      <h3 id="pw-title" className="pw-title">Débloquez le détail de ce bien</h3>
      <ul className="pw-unlocks">
        {UNLOCKS.map((u) => (
          <li key={u}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {u}
          </li>
        ))}
      </ul>
      <div className="pw-offers" role="radiogroup" aria-label="Formule">
        <button type="button" role="radio" aria-checked={billing === "annuel"} className={"pw-offer" + (billing === "annuel" ? " is-on" : "")} onClick={() => setBilling("annuel")}>
          <span className="pw-offer-badge">Recommandé</span>
          <span className="pw-offer-name">Pro annuel</span>
          <span className="pw-offer-price"><b>{eur(perMonth)} €</b> / mois</span>
          <span className="pw-offer-note">{eur(yearly)} € par an{monthsFree >= 1 ? ` · ${monthsFree} mois offerts` : ""}</span>
        </button>
        <button type="button" role="radio" aria-checked={billing === "mensuel"} className={"pw-offer" + (billing === "mensuel" ? " is-on" : "")} onClick={() => setBilling("mensuel")}>
          <span className="pw-offer-name">Pro mensuel</span>
          <span className="pw-offer-price"><b>{eur(pro.monthly)} €</b> / mois</span>
          <span className="pw-offer-note">Sans engagement</span>
        </button>
      </div>
      <a className="pw-cta" href={href}>Débloquer mon analyse</a>
      <p className="pw-fine">{pro.quota ? `${pro.quota} analyses par mois` : "Analyses illimitées"} · résiliable à tout moment</p>
    </div>
  );
}
