import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Comment estimer le loyer d'un bien avant de l'acheter — Bricky",
  description: "Un loyer surestimé de 100 € par mois peut transformer un bon investissement en gouffre. Voici comment estimer un loyer fiable avant de signer, sans se fier uniquement au vendeur.",
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
        <span className="eyebrow">Guide · Loyer</span>
        <h1>Comment estimer le loyer d'un bien avant de l'acheter</h1>

        <p>Tout le calcul de rentabilité d'un investissement locatif repose sur un seul chiffre : le loyer. Et pourtant, c'est souvent le chiffre le moins vérifié de tous — beaucoup d'acheteurs reprennent simplement le loyer annoncé par le vendeur ou l'agence, sans le confronter au marché réel. Un loyer surestimé de seulement 100 €/mois peut faire passer un bien de rentable à déficitaire une fois le crédit remboursé.</p>

        <h2>Pourquoi le loyer annoncé par le vendeur n'est pas fiable</h2>
        <p>Le vendeur (ou l'agence qui le représente) a un intérêt direct à présenter le bien sous son meilleur jour, y compris sur le loyer actuel ou potentiel. Trois cas fréquents faussent le chiffre annoncé : un locataire en place depuis longtemps qui paie un loyer historiquement bas (donc un loyer réel, mais qui ne reflète pas ce que vous pourriez obtenir à la relocation) ; un loyer \"potentiel\" optimiste basé sur une estimation non vérifiée ; ou un bien resté volontairement vide pour être présenté sans les défauts d'un locataire réel, avec un loyer cible ambitieux.</p>

        <h2>Les sources fiables pour vérifier un loyer</h2>
        <p>Avant de vous fier à un chiffre, croisez-le avec au moins deux de ces sources :</p>
        <ul>
          <li><strong>L'observatoire des loyers (quand la ville en a un)</strong> : les grandes agglomérations publient des données de loyers moyens par quartier et par type de bien, parfois avec un encadrement légal des loyers à respecter.</li>
          <li><strong>Les annonces de location comparables</strong> sur les portails immobiliers classiques, pour des biens de surface et d'état similaires dans le même quartier — pas juste la même ville, car les écarts entre quartiers peuvent être très importants.</li>
          <li><strong>Les données ANIL (carte des loyers)</strong>, une base construite à partir de loyers réellement pratiqués commune par commune, utile en complément des annonces pour recouper un ordre de grandeur.</li>
          <li><strong>Un professionnel local</strong> (agence de gestion locative du quartier) qui loue déjà des biens comparables et connaît le marché réel, pas celui affiché dans les annonces.</li>
        </ul>

        <h2>Les critères qui font varier un loyer, au-delà de la surface</h2>
        <p>Deux biens de même surface dans la même rue peuvent se louer avec un écart de 15 à 20 % selon : l'étage et la présence d'un ascenseur, la luminosité et l'exposition, la présence d'un extérieur (balcon, terrasse), l'état de la cuisine et de la salle de bain, la performance énergétique du logement (un DPE F ou G devient de plus en plus difficile, voire impossible, à louer selon la réglementation en vigueur), et la proximité des transports en commun ou d'un centre-ville.</p>

        <h2>Le risque spécifique de la vacance locative</h2>
        <p>Un loyer élevé mais qui met six mois à trouver preneur ne vaut rien de plus qu'un loyer plus modeste loué immédiatement. Dans votre calcul de rentabilité, intégrez toujours une provision réaliste pour la vacance locative — un mois par an est une hypothèse raisonnable dans la plupart des marchés, davantage dans une zone où l'offre locative est abondante.</p>

        <h2>Ce qu'il faut faire concrètement avant de signer</h2>
        <p>Demandez systématiquement les quittances de loyer des 12 derniers mois si le bien est déjà loué — c'est la preuve la plus fiable de ce qui est réellement encaissé, bien plus fiable qu'une déclaration verbale. Si le bien est vide, comparez au moins trois annonces de location actives pour des biens comparables dans le même quartier avant de retenir un chiffre pour votre calcul de rentabilité.</p>

        <div className="blog-cta">
          <h3>Bricky estime le loyer automatiquement</h3>
          <p>À partir de l'adresse d'un bien, Bricky croise plusieurs sources de données (dont la carte des loyers ANIL) pour vous donner une estimation de loyer fiable, même quand aucun loyer n'est encore annoncé.</p>
          <Link href="/analyze" className="primary-button" style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 50 }}>Analyser un bien gratuitement →</Link>
        </div>
      </article>
    </main>
  );
}
