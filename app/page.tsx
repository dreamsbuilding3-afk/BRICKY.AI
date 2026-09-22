export default function Home() {
  return (
    <main className="page">
      <nav className="nav">
        <div className="brand"><span className="mark">B</span>Bricky</div>
        <div className="nav-links">
          <a className="navlink" href="/login">Se connecter</a>
          <a className="nav-cta" href="/analyze">Analyser un bien →</a>
        </div>
      </nav>

      <section className="hero">
        <span className="eyebrow">Built for smarter property decisions</span>
        <h1>Know the <span className="stroke">deal</span> before you <span className="accent">make it</span>.</h1>
        <p className="sub">
          Collez une annonce ou déposez un PDF. Bricky croise les données du bien, le marché, les risques, le cadastre et l’environnement pour vous aider à décider quoi vérifier avant de vous engager.
        </p>

        <form className="analyzer" action="/analyze">
          <input name="url" placeholder="Collez l’URL d’une annonce immobilière…" aria-label="URL de l'annonce" />
          <button type="submit">Analyser le bien</button>
        </form>
        <div className="proof">Prix · comparables · rendement · risques · données manquantes · actions</div>
      </section>

      <section className="steps">
        <div className="steps-intro">
          <span className="eyebrow">Comment ça marche</span>
          <h2>Trois étapes, zéro devinette.</h2>
        </div>
        <div className="steps-grid">
          <article className="card step-card">
            <span className="step-number">1</span>
            <h2>Collez ou déposez</h2>
            <p>Un lien d’annonce ou un PDF (annonce, dossier). Bricky en extrait automatiquement prix, surface, pièces, DPE, GES et adresse.</p>
          </article>
          <article className="card step-card">
            <span className="step-number">2</span>
            <h2>Bricky analyse</h2>
            <p>Comparables de marché, rendement locatif, risques, données cadastrales et urbanisme, environnement (transports, commerces, écoles…).</p>
          </article>
          <article className="card step-card">
            <span className="step-number">3</span>
            <h2>Vous décidez</h2>
            <p>Un verdict clair, les points de vigilance, ce qu’il reste à vérifier, et un dossier PDF complet à télécharger.</p>
          </article>
        </div>
      </section>

      <section className="features">
        <details className="card info-card">
          <summary>
            <h2>Ce qu’on sait</h2>
            <p>Données de l’annonce et sources publiques structurées, avec leur niveau de confiance.</p>
            <span className="info-more-btn">Voir plus <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">Prix affiché, surface Carrez, nombre de pièces, étage, DPE/GES, année de construction, taxe foncière estimée, prix au m² comparé au marché local — chaque donnée est tracée avec sa source et son niveau de confiance.</div>
        </details>
        <details className="card info-card">
          <summary>
            <h2>Ce qu’on ne sait pas</h2>
            <p>Les informations critiques absentes sont identifiées au lieu d’être remplacées par des suppositions.</p>
            <span className="info-more-btn">Voir plus <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">Travaux réalisés, charges de copropriété exactes, procédures en cours, nuisances de voisinage, historique des sinistres : Bricky les signale comme lacunes plutôt que de deviner à votre place.</div>
        </details>
        <details className="card info-card">
          <summary>
            <h2>Ce qu’il faut faire</h2>
            <p>Risques, questions à poser, documents à demander et prochaines vérifications avant une offre.</p>
            <span className="info-more-btn">Voir plus <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">Diagnostics à réclamer, PV d’AG et règlement de copropriété, questions précises à poser au vendeur, points de négociation et vérifications à faire sur place avant de vous engager.</div>
        </details>
      </section>

      <section className="highlight-band">
        <div className="highlight-intro">
          <span className="eyebrow">Dans chaque analyse</span>
          <h2>Tout ce qu’il faut pour décider, au même endroit.</h2>
        </div>
        <div className="highlight-grid">
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">01</span><span className="highlight-tag">Localisation</span></div>
            <h3>Localisation détaillée</h3>
            <p>Carte précise du bien avec transports, commerces, écoles et services à proximité, distance par distance.</p>
            <div className="highlight-stat">300+ points d’intérêt croisés</div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">02</span><span className="highlight-tag">Officiel</span></div>
            <h3>Cadastre &amp; urbanisme</h3>
            <p>Parcelle, zonage PLU, bâti recensé — les données officielles croisées automatiquement.</p>
            <div className="highlight-stat">Cadastre.gouv.fr · Géorisques</div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">03</span><span className="highlight-tag">Livrable</span></div>
            <h3>Dossier PDF complet</h3>
            <p>Synthèse, finances, risques, cadastre et environnement réunis dans un document téléchargeable en un clic.</p>
            <div className="highlight-stat">Prêt en quelques secondes</div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">04</span><span className="highlight-tag">Flexible</span></div>
            <h3>Fichiers acceptés</h3>
            <p>Lien d’annonce ou PDF déposé directement — Bricky s’adapte à ce que vous avez sous la main.</p>
            <div className="highlight-stat">URL ou PDF, au choix</div>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <h2>Prêt à savoir si ce bien mérite votre attention ?</h2>
        <a className="nav-cta" href="/analyze">Lancer une analyse gratuite →</a>
      </section>

      <footer className="footer"><span>Bricky · Property intelligence, built for decisions.</span><span className="footer-links"><a href="/legal/mentions-legales">Mentions légales</a><a href="/legal/cgu">CGU</a><a href="/legal/confidentialite">Confidentialité</a></span></footer>
    </main>
  );
}
