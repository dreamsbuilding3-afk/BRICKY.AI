import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Les erreurs à éviter pour son premier investissement locatif — Bricky",
  description: "Les erreurs les plus fréquentes des primo-investisseurs immobiliers : loyer surestimé, charges oubliées, mauvais emplacement, financement mal négocié. Comment les éviter.",
};

export default function Article() {
  return (
    <main className="page">
      <nav className="nav">
        <Link href="/" className="brand">
          <img src="/mascot-avatar-round.png" alt="" className="brand-avatar" />
          <span>Bricky</span>
        </Link>
        <Link href="/analyze" className="nav-cta">Analyser un bien →</Link>
      </nav>
      <article className="blog-article">
        <Link href="/blog" className="blog-back">← Tous les articles</Link>
        <span className="eyebrow">Guide · Débuter</span>
        <h1>Les erreurs à éviter pour son premier investissement locatif</h1>

        <p>La plupart des erreurs coûteuses en investissement locatif ne viennent pas d'un mauvais bien, mais d'une analyse incomplète avant l'achat. Voici les erreurs les plus fréquentes chez les primo-investisseurs, et comment les éviter concrètement.</p>

        <h2>1. Se fier au rendement brut affiché dans l'annonce</h2>
        <p>Le rendement brut ne tient compte d'aucune charge, d'aucun crédit, d'aucune fiscalité. C'est un point de départ pour comparer rapidement des annonces, jamais un chiffre pour décider d'acheter. Voir notre guide sur <Link href="/blog/calcul-rentabilite-locative">comment calculer la vraie rentabilité d'un bien</Link>.</p>

        <h2>2. Ne pas calculer son cash-flow réel</h2>
        <p>Un bien peut être rentable sur le papier et vous coûter de l'argent chaque mois une fois le crédit remboursé. Beaucoup de primo-investisseurs découvrent ce problème après la signature, quand il n'y a plus de marge de négociation. Voir notre guide sur <Link href="/blog/cash-flow-immobilier-negatif-positif">le calcul du cash-flow</Link>.</p>

        <h2>3. Surestimer le loyer attendu</h2>
        <p>Reprendre le loyer annoncé par le vendeur sans le vérifier est l'une des erreurs les plus fréquentes et les plus coûteuses, parce qu'elle fausse tout le reste du calcul. Voir notre guide sur <Link href="/blog/estimer-loyer-avant-achat">comment estimer un loyer fiable avant d'acheter</Link>.</p>

        <h2>4. Négliger l'état réel de la copropriété</h2>
        <p>Un prix d'achat attractif peut cacher une copropriété qui va voter des travaux de façade, de toiture ou de mise aux normes dans les prochaines années. Demandez systématiquement les procès-verbaux des trois dernières assemblées générales et le carnet d'entretien de l'immeuble avant de vous engager — c'est un document que le vendeur doit vous fournir, et qui révèle souvent des travaux votés ou à venir non mentionnés dans l'annonce.</p>

        <h2>5. Ignorer le Diagnostic de Performance Énergétique (DPE)</h2>
        <p>La réglementation sur la location des logements mal isolés (classés F ou G) se durcit progressivement en France, avec des interdictions de mise en location qui s'étendent aux passoires thermiques. Un bien mal classé peut nécessiter des travaux de rénovation énergétique coûteux pour rester louable, ou devenir tout simplement invendable sur le marché locatif dans les années à venir. Ce risque doit être chiffré avant l'achat, pas découvert après.</p>

        <h2>6. Ne pas vérifier l'urbanisme et le cadastre</h2>
        <p>Un projet de voirie, une zone inondable, un plan local d'urbanisme qui limite les futures extensions ou changements d'usage du bien : ces informations sont publiques mais rarement consultées par un acheteur pressé. Elles peuvent affecter la valeur future du bien ou révéler des contraintes non visibles lors d'une simple visite.</p>

        <h2>7. Emprunter au taux le plus bas vu en ligne, sans simulation réelle</h2>
        <p>Les taux affichés sur les comparateurs en ligne sont indicatifs et dépendent fortement de votre profil (apport, revenus, autres crédits en cours). Basez votre calcul de rentabilité sur une simulation réelle obtenue auprès d'une banque ou d'un courtier, pas sur le meilleur taux que vous avez aperçu sur internet — l'écart peut représenter plusieurs dizaines d'euros de mensualité, donc un cash-flow tout différent.</p>

        <h2>8. Acheter sans avoir défini sa stratégie de sortie</h2>
        <p>Cash-flow immédiat, plus-value à la revente, préparation de la retraite, transmission : chaque objectif oriente vers un type de bien et un montage fiscal différents. Acheter d'abord et se poser la question de la stratégie ensuite conduit souvent à un bien qui ne correspond finalement à aucun de ces objectifs clairement.</p>

        <div className="blog-cta">
          <h3>Évitez ces erreurs dès votre première analyse</h3>
          <p>Bricky vérifie automatiquement le rendement, le cash-flow, le cadastre, l'urbanisme et les risques environnementaux d'un bien avant que vous ne vous engagiez.</p>
          <Link href="/analyze" className="primary-button" style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 50 }}>Analyser un bien gratuitement →</Link>
        </div>
      </article>
    </main>
  );
}
