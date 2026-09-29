import Link from "next/link";

export const metadata = { title: "Exemple d'analyse — Bricky" };

function Metric({ label, value, suffix }: { label: string; value: string | number; suffix: string }) {
  return <div className="metric"><span>{label}</span><b>{value}{suffix}</b></div>;
}

export default function DemoPage() {
  return (
    <main className="page">
      <nav className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="mark">B</span>Bricky
        </Link>
        <div className="nav-links">
          <Link className="navlink" href="/pricing">Tarifs</Link>
          <Link className="navlink" href="/login">Se connecter</Link>
          <Link className="nav-cta" href="/analyze">Essai gratuit de 7 jours →</Link>
        </div>
      </nav>

      <section className="analysis-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Exemple</span>
          <h1>À quoi ressemble une analyse <span className="accent">Bricky</span>.</h1>
          <p className="sub">Un aperçu complet, avec des données fictives, pour vous montrer le résultat avant de créer un compte.</p>
        </div>

        <div className="demo-disclaimer">
          <span>🧪</span>
          <span><b>Exemple fictif</b> — cette page illustre le rendu d'une analyse Bricky avec un bien inventé. Aucune donnée réelle n'est utilisée ici.</span>
        </div>

        <section className="result-panel decision-dashboard">
          <div className="result-head">
            <div>
              <span className="eyebrow">Exemple · Appartement T3, Lyon 3e (fictif)</span>
              <h2>Voici ce que Bricky en pense.</h2>
            </div>
            <div className="result-head-actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="verdict-pill verdict-interesting">Intéressant</span>
              <span className="status-dot">● Décision</span>
            </div>
          </div>

          <div className="metric-grid">
            <Metric label="Prix" value={(185000).toLocaleString("fr-FR")} suffix=" €" />
            <Metric label="Loyer estimé" value={850} suffix=" €/mois" />
            <Metric label="Rendement brut" value={5.5} suffix=" %" />
            <Metric label="Cash-flow mensuel" value="+95" suffix=" €" />
          </div>

          <div className="dashboard-section market-card">
            <div className="section-heading">
              <div><h3>Valeur marché</h3><small>Transactions comparables · données disponibles</small></div>
              <span className="market-badge">82% confiance</span>
            </div>
            <div className="market-grid">
              <Metric label="Prix du bien" value={(3200).toLocaleString("fr-FR")} suffix=" €/m²" />
              <Metric label="Marché médian" value={(3450).toLocaleString("fr-FR")} suffix=" €/m²" />
              <Metric label="Valeur estimée" value={(199000).toLocaleString("fr-FR")} suffix=" €" />
              <Metric label="Écart au marché" value="-7,3" suffix=" %" />
            </div>
          </div>

          <div className="dashboard-section">
            <h3>Risques de sol &amp; environnement</h3>
            <div className="risk-list">
              <div className="risk-item">
                <span>Retrait-gonflement des argiles</span>
                <span className="risk-badge risk-badge-medium">Aléa moyen</span>
                <p>Une étude de sol est recommandée avant travaux d'extension.</p>
              </div>
              <div className="risk-item">
                <span>Risque inondation</span>
                <span className="risk-badge risk-badge-low">Aléa faible</span>
                <p>Aucun signal fort identifié sur la parcelle.</p>
              </div>
            </div>
          </div>

          <div className="dashboard-section">
            <h3>Checklist de vérification</h3>
            <div className="checklist-list">
              <div className="checklist-item" style={{ cursor: "default" }}>
                <input type="checkbox" readOnly checked={false} />
                <div><b>Demander le règlement de copropriété</b><p>À réclamer au vendeur avant toute offre.</p></div>
              </div>
              <div className="checklist-item" style={{ cursor: "default" }}>
                <input type="checkbox" readOnly checked={true} />
                <div><b>Vérifier l'historique des sinistres</b><p>Aucun sinistre déclaré sur les 10 dernières années.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="cta-band" style={{ marginTop: 40 }}>
          <h2>Prêt à lancer votre propre analyse ?</h2>
          <Link className="nav-cta" href="/analyze">Essai gratuit de 7 jours →</Link>
          <div className="trial-note trial-note-light">Sans carte bancaire · résiliable à tout moment</div>
        </section>
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
