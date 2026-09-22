"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase/client";

type Plan = {
  plan_code: string;
  name: string;
  price_monthly_cents: number;
  price_yearly_cents: number | null;
  lifetime_analysis_quota: number | null;
  monthly_analysis_quota: number | null;
  can_download_pdf: boolean;
  can_use_financing_simulator: boolean;
  can_share_link: boolean;
  can_compare_properties: boolean;
  can_set_alerts: boolean;
  white_label: boolean;
  multi_user: boolean;
  api_export: boolean;
  sort_order: number;
};

function formatPrice(cents: number) {
  if (cents === 0) return "Gratuit";
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €/mois";
}

function analysesLabel(plan: Plan) {
  if (plan.lifetime_analysis_quota != null) {
    return plan.lifetime_analysis_quota + " analyse gratuite à vie";
  }
  if (plan.monthly_analysis_quota == null) return "Analyses illimitées";
  return "Jusqu'à " + plan.monthly_analysis_quota + " analyses / mois";
}

function featureList(plan: Plan): string[] {
  const items: string[] = [analysesLabel(plan)];
  items.push(plan.can_download_pdf ? "Dossier PDF téléchargeable" : "Dossier PDF non téléchargeable");
  items.push(plan.can_use_financing_simulator ? "Simulateur de financement" : "Pas de simulateur de financement");
  if (plan.can_share_link) items.push("Partage de lien en lecture seule");
  if (plan.can_compare_properties) items.push("Comparaison multi-biens");
  if (plan.can_set_alerts) items.push("Alertes sur nouvelles annonces");
  if (plan.white_label) items.push("Dossier en marque blanche");
  if (plan.multi_user) items.push("Comptes multi-utilisateurs");
  if (plan.api_export) items.push("Export API / CSV");
  return items;
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: planRows } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("sort_order", { ascending: true });
      setPlans((planRows as Plan[]) || []);

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        const { data: sub } = await supabase.rpc("get_my_subscription");
        if (sub && typeof sub === "object" && "plan_code" in sub) {
          setCurrentPlan((sub as { plan_code: string }).plan_code);
        }
      }
      setLoading(false);
    })();
  }, []);

  return (
    <main className="page">
      <nav className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="mark">B</span>Bricky
        </Link>
        <div className="nav-links">
          <Link className="navlink" href="/login">Se connecter</Link>
          <Link className="nav-cta" href="/analyze">Analyser un bien →</Link>
        </div>
      </nav>

      <section className="pricing-intro">
        <span className="eyebrow">Tarifs</span>
        <h1>Un abonnement pour chaque niveau d'investisseur.</h1>
        <p className="sub">
          Commencez avec une analyse gratuite. Passez à un palier supérieur quand vous avez besoin de plus d'analyses,
          du dossier PDF, du partage ou des outils pensés pour les professionnels.
        </p>
      </section>

      {loading ? null : (
        <section className="pricing-grid">
          {plans.map((plan) => (
            <div
              key={plan.plan_code}
              className={"pricing-card" + (currentPlan === plan.plan_code ? " pricing-card-current" : "")}
            >
              {currentPlan === plan.plan_code ? <span className="pricing-current-badge">Votre palier actuel</span> : null}
              <h2>{plan.name}</h2>
              <div className="pricing-price">{formatPrice(plan.price_monthly_cents)}</div>
              {plan.price_yearly_cents ? (
                <div className="pricing-yearly">
                  ou {(plan.price_yearly_cents / 100).toLocaleString("fr-FR")} €/an
                </div>
              ) : null}
              <ul className="pricing-features">
                {featureList(plan).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {plan.plan_code === "decouverte" ? (
                <Link className="secondary-button pricing-cta" href="/analyze">
                  Commencer gratuitement
                </Link>
              ) : plan.plan_code === "agence" ? (
                <Link className="secondary-button pricing-cta" href="/account">
                  Nous contacter
                </Link>
              ) : (
                <Link className="primary-button pricing-cta" href="/account">
                  Choisir ce palier
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="pricing-note">
        <p>
          Le paiement en ligne arrive bientôt. En attendant, contactez-nous depuis votre page compte pour activer un
          abonnement payant manuellement.
        </p>
      </section>

      <footer className="footer">
        <span>Bricky · Property intelligence, built for decisions.</span>
        <span className="footer-links">
          <a href="/legal/mentions-legales">Mentions légales</a>
          <a href="/legal/cgu">CGU</a>
          <a href="/legal/confidentialite">Confidentialité</a>
        </span>
      </footer>
    </main>
  );
}
