"use client";

import { useState, useEffect } from "react";

const CAPABILITY_ROW_1 = [
  { label: "Rendement net & cash-flow réel", color: "accent" },
  { label: "Données cadastrales & urbanisme", color: "blue" },
  { label: "300+ points de risques environnementaux", color: "green" },
  { label: "Comparables du marché local", color: "accent" },
  { label: "Analyse via URL ou PDF d'annonce", color: "blue" },
];

const CAPABILITY_ROW_2 = [
  { label: "Dossier PDF complet", color: "green" },
  { label: "Estimation de loyer fiable", color: "accent" },
  { label: "Scénarios conservateur / optimiste", color: "blue" },
  { label: "Checklist avant achat", color: "amber" },
  { label: "Comparateur de biens", color: "green" },
];

const TESTIMONIALS = [
  {
    quote: "Avant Bricky, je passais des heures à chercher les infos d'un bien et à faire mes calculs sur plusieurs fichiers. Maintenant, j'ai une vision claire du potentiel du bien en quelques minutes. Je vois immédiatement ce qui est intéressant… et ce qui ne l'est pas.",
    name: "Thomas",
    role: "Investisseur immobilier",
  },
  {
    quote: "Je pensais que l'investissement immobilier était réservé aux personnes qui maîtrisent déjà tout. Bricky m'a vraiment simplifié les choses. Les données sont regroupées au même endroit et surtout, je comprends enfin ce que je regarde avant de prendre une décision.",
    name: "Sarah",
    role: "Première acquisition",
  },
  {
    quote: "Le plus gros changement pour moi, c'est la vitesse d'analyse. Au lieu de passer énormément de temps sur chaque opportunité, je peux rapidement identifier les biens qui méritent une vraie analyse. Bricky est devenu un réflexe avant même de commencer mes recherches.",
    name: "Julien",
    role: "Marchand de biens",
  },
  {
    quote: "Ce que j'aime avec Bricky, ce n'est pas seulement d'avoir des chiffres. C'est de comprendre ce qu'ils veulent dire. En quelques instants, je sais quelles informations sont disponibles, lesquelles manquent et quels éléments doivent être vérifiés avant d'aller plus loin.",
    name: "Nicolas",
    role: "Investisseur immobilier",
  },
];

function CapabilityMarquee() {
  return (
    <section className="capability-marquee" aria-hidden="true">
      <div className="capability-marquee-rows">
        <div className="capability-marquee-track">
          {[...CAPABILITY_ROW_1, ...CAPABILITY_ROW_1].map((c, i) => (
            <span className="capability-pill" key={"r1-" + i}>
              <span className={"capability-dot capability-dot-" + c.color} />
              {c.label}
            </span>
          ))}
        </div>
        <div className="capability-marquee-track reverse">
          {[...CAPABILITY_ROW_2, ...CAPABILITY_ROW_2].map((c, i) => (
            <span className="capability-pill" key={"r2-" + i}>
              <span className={"capability-dot capability-dot-" + c.color} />
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stars() {
  return (
    <div className="testimonial-stars" aria-hidden="true">
      {"★★★★★"}
    </div>
  );
}

function Testimonials() {
  return (
    <section className="testimonials">
      <div className="testimonials-intro">
        <span className="eyebrow">Ils utilisent Bricky</span>
        <h2>Ce que ça change, au quotidien.</h2>
      </div>
      <div className="testimonials-track">
        {TESTIMONIALS.map((t) => (
          <figure className="testimonial-card" key={t.name}>
            <Stars />
            <blockquote>“{t.quote}”</blockquote>
            <figcaption>
              <span className="testimonial-name">{t.name}</span>
              <span className="testimonial-role">{t.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="page">
      <nav className={"nav nav-has-burger nav-floating" + (scrolled ? " nav-floating-scrolled" : "")}>
        <div className="brand"><span className="mark">B</span>Bricky</div>
        <button
          type="button"
          className={"nav-burger" + (menuOpen ? " nav-burger-open" : "")}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className={"nav-links" + (menuOpen ? " nav-links-open" : "")}>
          <a className="navlink" href="/pricing" onClick={() => setMenuOpen(false)}>Tarifs</a>
          <a className="navlink" href="/login" onClick={() => setMenuOpen(false)}>Se connecter</a>
          <a className="nav-cta" href="/analyze" onClick={() => setMenuOpen(false)}>Essai gratuit de 7 jours →</a>
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
        <div className="trial-note">7 jours d’essai gratuit sur les paliers payants · sans carte bancaire</div>
      </section>

      <CapabilityMarquee />

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
            <span className="info-number">1</span>
            <h2>Ce qu’on sait</h2>
            <p>Données de l’annonce et sources publiques structurées, avec leur niveau de confiance.</p>
            <span className="info-more-btn">Voir plus <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">Prix affiché, surface Carrez, nombre de pièces, étage, DPE/GES, année de construction, taxe foncière estimée, prix au m² comparé au marché local — chaque donnée est tracée avec sa source et son niveau de confiance.</div>
        </details>
        <details className="card info-card">
          <summary>
            <span className="info-number">2</span>
            <h2>Ce qu’on ne sait pas</h2>
            <p>Les informations critiques absentes sont identifiées au lieu d’être remplacées par des suppositions.</p>
            <span className="info-more-btn">Voir plus <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">Travaux réalisés, charges de copropriété exactes, procédures en cours, nuisances de voisinage, historique des sinistres : Bricky les signale comme lacunes plutôt que de deviner à votre place.</div>
        </details>
        <details className="card info-card">
          <summary>
            <span className="info-number">3</span>
            <h2>Ce qu’il faut faire</h2>
            <p>Risques, questions à poser, documents à demander et prochaines vérifications avant une offre.</p>
            <span className="info-more-btn">Voir plus <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">Diagnostics à réclamer, PV d’AG et règlement de copropriété, questions précises à poser au vendeur, points de négociation et vérifications à faire sur place avant de vous engager.</div>
        </details>
      </section>

      <Testimonials />

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
        <a className="nav-cta" href="/analyze">Essai gratuit de 7 jours →</a>
        <div className="trial-note trial-note-light">Sans carte bancaire · résiliable à tout moment</div>
      </section>

      <footer className="footer"><span>Bricky · Property intelligence, built for decisions.</span><span className="footer-links"><a href="/legal/mentions-legales">Mentions légales</a><a href="/legal/cgu">CGU</a><a href="/legal/confidentialite">Confidentialité</a></span></footer>
    </main>
  );
}
