import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Comment calculer la rentabilité d'un investissement locatif — Bricky",
  description: "Rendement brut, rendement net, et pourquoi ces deux chiffres seuls ne suffisent pas à savoir si un bien est un bon investissement. Formules et exemple concret.",
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
        <span className="eyebrow">Guide · Rentabilité</span>
        <h1>Comment calculer la rentabilité d'un investissement locatif</h1>

        <p>Avant de signer pour un bien locatif, presque tout le monde calcule un chiffre : le rendement. C'est utile, mais c'est aussi le calcul le plus mal fait et le plus mal interprété de tout l'investissement immobilier. Un rendement de 6 % peut cacher un bien qui vous coûte de l'argent chaque mois, et un rendement de 3 % peut correspondre à un excellent investissement. Voici comment calculer ces chiffres correctement, et surtout ce qu'ils ne vous disent pas.</p>

        <h2>Le rendement brut : le calcul le plus simple, et le plus trompeur</h2>
        <p>Le rendement brut est celui qu'on voit affiché sur la plupart des annonces et des simulateurs rapides. Sa formule :</p>
        <p><strong>Rendement brut = (loyer annuel ÷ prix d'achat) × 100</strong></p>
        <p>Exemple : un appartement acheté 200 000 € qui se loue 800 €/mois, soit 9 600 €/an.</p>
        <p>Rendement brut = (9 600 ÷ 200 000) × 100 = <strong>4,8 %</strong></p>
        <p>Le problème de ce chiffre, c'est qu'il ne tient compte d'aucune charge : ni la taxe foncière, ni la copropriété, ni l'assurance, ni les périodes de vacance locative, ni les frais de gestion, ni les travaux. Deux biens avec un rendement brut identique peuvent avoir une rentabilité réelle très différente selon ces charges.</p>

        <h2>Le rendement net : on retire les charges</h2>
        <p>Le rendement net corrige une partie du problème en déduisant les charges annuelles récurrentes :</p>
        <p><strong>Rendement net = ((loyer annuel − charges annuelles) ÷ prix d'achat total) × 100</strong></p>
        <p>Le prix d'achat total inclut ici les frais de notaire et les éventuels travaux, pas seulement le prix affiché dans l'annonce — c'est une erreur fréquente qui gonfle artificiellement le rendement.</p>
        <p>Reprenons l'exemple précédent, avec des frais de notaire de 15 000 € (donc un prix d'achat total de 215 000 €) et des charges annuelles de 1 800 € (taxe foncière, copropriété, assurance PNO) :</p>
        <p>Rendement net = ((9 600 − 1 800) ÷ 215 000) × 100 = <strong>3,6 %</strong></p>
        <p>On passe de 4,8 % à 3,6 % rien qu'en intégrant les frais d'acquisition et les charges courantes — sans même parler de fiscalité ou de crédit.</p>

        <h2>Le rendement net-net : après impôts</h2>
        <p>Selon votre régime fiscal (micro-foncier, réel, LMNP...), l'imposition sur les loyers perçus peut réduire encore ce chiffre de façon significative, parfois de plusieurs points. C'est un calcul propre à votre situation personnelle (tranche marginale d'imposition, régime choisi), donc il ne peut pas être généralisé dans un article, mais c'est la dernière étape avant d'avoir un chiffre vraiment comparable entre deux biens.</p>

        <h2>Ce que le rendement ne vous dit jamais : l'argent qui sort réellement de votre poche</h2>
        <p>Voici le point le plus important de cet article : le rendement, même net, ne dit rien sur votre trésorerie mensuelle réelle si vous financez le bien à crédit. Un bien avec un excellent rendement net peut très bien vous coûter 150 € de votre poche chaque mois une fois la mensualité de prêt payée — et un bien avec un rendement plus modeste peut s'autofinancer complètement, voire vous rapporter du cash chaque mois.</p>
        <p>C'est ce deuxième calcul — le cash-flow — qui détermine si vous pouvez tenir l'investissement dans la durée sans puiser dans votre épargne. On le détaille dans l'article suivant : <Link href="/blog/cash-flow-immobilier-negatif-positif">Cash-flow immobilier : pourquoi c'est plus important que le rendement</Link>.</p>

        <h2>Récapitulatif</h2>
        <table>
          <thead>
            <tr><th>Indicateur</th><th>Ce qu'il inclut</th><th>Utilité</th></tr>
          </thead>
          <tbody>
            <tr><td>Rendement brut</td><td>Loyer ÷ prix d'achat</td><td>Comparaison rapide entre annonces, rien de plus</td></tr>
            <tr><td>Rendement net</td><td>+ charges, frais de notaire, travaux</td><td>Comparaison sérieuse entre biens</td></tr>
            <tr><td>Rendement net-net</td><td>+ fiscalité personnelle</td><td>Chiffre le plus proche de la réalité</td></tr>
            <tr><td>Cash-flow</td><td>+ crédit, vacance locative, gestion</td><td>Dit si le bien s'autofinance vraiment</td></tr>
          </tbody>
        </table>

        <div className="blog-cta">
          <h3>Envie de ne plus faire ces calculs à la main ?</h3>
          <p>Bricky calcule automatiquement le rendement, le cash-flow et les risques d'un bien à partir de son adresse et de son prix.</p>
          <Link href="/analyze" className="primary-button" style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 50 }}>Analyser un bien gratuitement →</Link>
        </div>
      </article>
    </main>
  );
}
