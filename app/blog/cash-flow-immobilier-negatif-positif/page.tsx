import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cash-flow immobilier : pourquoi c'est plus important que le rendement — Bricky",
  description: "Un bien peut afficher un excellent rendement et vous coûter de l'argent chaque mois. Voici comment calculer votre vrai cash-flow avant d'acheter.",
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
        <span className="eyebrow">Guide · Cash-flow</span>
        <h1>Cash-flow immobilier : pourquoi c'est plus important que le rendement</h1>

        <p>Le rendement répond à une question théorique : combien ce bien rapporte-t-il par rapport à son prix ? Le cash-flow répond à une question beaucoup plus concrète : est-ce que je dois sortir de l'argent de ma poche chaque mois pour financer ce bien, ou est-ce qu'il se paie tout seul ? C'est ce deuxième chiffre qui détermine si vous pouvez tenir un investissement dans la durée.</p>

        <h2>La formule du cash-flow mensuel</h2>
        <p><strong>Cash-flow = loyer encaissé − (mensualité de crédit + charges de copropriété + taxe foncière ÷ 12 + assurance + frais de gestion + provision pour vacance locative)</strong></p>
        <p>Chaque terme compte. Beaucoup de simulations amateurs oublient la vacance locative (les mois sans locataire) ou les frais de gestion si le bien est confié à une agence, et arrivent à un cash-flow artificiellement positif.</p>

        <h2>Un exemple concret : bon rendement, mauvais cash-flow</h2>
        <p>Reprenons l'appartement de notre précédent article : 200 000 € (215 000 € frais de notaire inclus), loué 800 €/mois, rendement net d'environ 3,6 %. Supposons qu'il soit financé à 100 % par un crédit sur 20 ans à un taux de 3,8 %, ce qui donne une mensualité d'environ 1 285 €.</p>
        <p>Cash-flow mensuel = 800 − (1 285 + 150 de charges/taxe foncière mensualisées + 15 d'assurance) = <strong>−650 € par mois</strong></p>
        <p>Ce bien, malgré un rendement correct sur le papier, coûte 650 € par mois à son propriétaire. Sur 20 ans, c'est 156 000 € qui sortent de sa poche en plus du bien lui-même. Ce n'est pas nécessairement une mauvaise affaire — tout dépend de la plus-value espérée et de votre capacité financière — mais c'est une information que le rendement seul ne vous donne jamais, et qu'il faut connaître AVANT de signer, pas après.</p>

        <h2>Un cash-flow négatif n'est pas toujours un mauvais investissement</h2>
        <p>Il existe de bonnes raisons d'accepter un cash-flow négatif : un emplacement avec un fort potentiel de plus-value, un effort d'épargne forcé via l'effet de levier du crédit, ou une optimisation fiscale qui compense une partie de l'effort de trésorerie. Le problème n'est pas le cash-flow négatif en soi — c'est de l'apprendre après l'achat, quand il n'y a plus de marge de négociation possible sur le prix.</p>

        <h2>Comment sécuriser votre cash-flow avant de signer</h2>
        <ul>
          <li><strong>Simulez avec un taux de crédit réaliste</strong>, pas le taux le plus bas que vous avez vu en ligne — demandez une simulation à votre banque ou courtier avant de vous engager.</li>
          <li><strong>Intégrez une vacance locative réaliste</strong> : un mois vide par an n'est pas pessimiste, c'est la norme dans beaucoup de villes moyennes.</li>
          <li><strong>Ne sous-estimez pas la copropriété</strong> : un appel de fonds pour travaux de façade ou de toiture peut transformer un cash-flow équilibré en gouffre ponctuel.</li>
          <li><strong>Vérifiez le loyer réellement pratiqué dans le quartier</strong>, pas seulement celui annoncé par le vendeur — un loyer surestimé de 100 €/mois change tout le calcul.</li>
        </ul>

        <div className="blog-cta">
          <h3>Bricky calcule votre cash-flow automatiquement</h3>
          <p>À partir de l'adresse et du prix d'un bien, Bricky estime le loyer réel du marché, simule votre financement et affiche votre cash-flow mensuel avant que vous ne signiez quoi que ce soit.</p>
          <Link href="/analyze" className="primary-button" style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 50 }}>Analyser un bien gratuitement →</Link>
        </div>
      </article>
    </main>
  );
}
