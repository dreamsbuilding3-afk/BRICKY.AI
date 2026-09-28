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

const PLAN_AUDIENCE: Record<string, string> = {
  decouverte: "Particuliers : un premier avis avant d'acheter",
  essentiel: "Investisseurs particuliers actifs",
  pro: "Indépendants & auto-entrepreneurs de l'immobilier",
  agence: "Agences & équipes",
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
  items.push(plan.can_download_pdf ? "Dossier PDF téléchargeable, prêt à partager" : "Dossier PDF non téléchargeable");
  items.push(plan.can_use_financing_simulator ? "Simulateur de financement pour chiffrer vos dossiers" : "Pas de simulateur de financement");
  if (plan.can_share_link) items.push("Partage de lien en lecture seule avec clients ou associés");
  if (plan.can_compare_properties) items.push("Comparaison multi-biens pour arbitrer entre plusieurs opportunités");
  if (plan.can_set_alerts) items.push("Alertes sur les nouvelles annonces correspondant à vos critères");
  if (plan.white_label) items.push("Dossier en marque blanche, aux couleurs de votre agence");
  if (plan.multi_user) items.push("Comptes multi-utilisateurs pour toute l'équipe");
  if (plan.api_export) items.push("Export API / CSV pour connecter vos outils internes");
  return items;
}

function Check({ ok }: { ok: boolean }) {
  return ok ? <span className="pricing-compare-check">✓</span> : <span className="pricing-compare-dash">—</span>;
}

function ctaLabel(plan: Plan) {
  if (plan.plan_code === "decouverte") return "Commencer";
  if (plan.plan_code === "agence") return "Nous contacter";
  return "Choisir";
}

function ctaHref(plan: Plan) {
  if (plan.plan_code === "decouverte") return "/analyze";
  if (plan.plan_code === "agence") return "/account";
  return "/account";
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
          <Link className="nav-cta" href="/analyze">Essai gratuit de 7 jours →</Link>
        </div>
      </nav>

      <section className="pricing-intro">
        <span className="eyebrow">Tarifs</span>
        <h1>Un abonnement pour chaque niveau d'investisseur.</h1>
        <p className="sub">
          Du particulier qui vérifie un premier achat à l'agence qui traite des dizaines de dossiers par mois :
          chaque palier est pensé pour un usage précis — particulier, auto-entrepreneur, indépendant, investisseur
          ou agence. Commencez avec une analyse gratuite, puis profitez de 7 jours d'essai gratuit sur les paliers
          payants, sans carte bancaire.
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
              {PLAN_AUDIENCE[plan.plan_code] ? (
                <div className="pricing-audience">{PLAN_AUDIENCE[plan.plan_code]}</div>
              ) : null}
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
                <div className="pricing-cta-wrap">
                <Link className="primary-button pricing-cta" href="/account">
                  Essai gratuit
                </Link>
                <span className="pricing-cta-note">7 jours offerts, sans carte</span>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {!loading && plans.length > 0 && (
        <section className="pricing-compare">
          <div className="pricing-compare-intro">
            <span className="eyebrow">Comparatif</span>
            <h2>Comparer tous les paliers en détail</h2>
            <p>Chaque ligne compte : repérez en un coup d'œil ce qui change d'un palier à l'autre — du particulier à l'agence — et choisissez le vôtre directement depuis le tableau.</p>
          </div>
          <div className="pricing-compare-scroll">
            <table className="pricing-compare-table">
              <thead>
                <tr>
                  <th></th>
                  {plans.map((plan) => (
                    <th key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      {plan.name}
                      {plan.plan_code === "pro" ? <span className="pricing-compare-popular">Populaire</span> : null}
                      {PLAN_AUDIENCE[plan.plan_code] ? (
                        <span className="pricing-compare-audience">{PLAN_AUDIENCE[plan.plan_code]}</span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="pricing-compare-section">
                  <td colSpan={plans.length + 1}>Analyses &amp; rapports</td>
                </tr>
                <tr>
                  <td>Analyses incluses</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      {analysesLabel(plan)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Dossier PDF téléchargeable</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_download_pdf} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Simulateur de financement</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_use_financing_simulator} />
                    </td>
                  ))}
                </tr>
                <tr className="pricing-compare-section">
                  <td colSpan={plans.length + 1}>Partage &amp; comparaison</td>
                </tr>
                <tr>
                  <td>Partage de lien (clients, associés)</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_share_link} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Comparaison multi-biens (investisseurs)</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_compare_properties} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Alertes sur nouvelles annonces</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_set_alerts} />
                    </td>
                  ))}
                </tr>
                <tr className="pricing-compare-section">
                  <td colSpan={plans.length + 1}>Agence &amp; équipe</td>
                </tr>
                <tr>
                  <td>Dossier en marque blanche (agences)</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.white_label} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Comptes multi-utilisateurs (équipes)</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.multi_user} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Export API / CSV (outils internes)</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.api_export} />
                    </td>
                  ))}
                </tr>
                <tr className="pricing-compare-cta-row">
                  <td></td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Link
                        className={(plan.plan_code === "decouverte" || plan.plan_code === "agence" ? "secondary-button" : "primary-button") + " pricing-compare-cta"}
                        href={ctaHref(plan)}
                      >
                        {ctaLabel(plan)}
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
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
