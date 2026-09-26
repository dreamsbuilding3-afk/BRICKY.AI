import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "LMNP ou micro-foncier : quel régime fiscal choisir — Bricky",
  description: "Location nue ou meublée, micro-foncier, régime réel ou LMNP : ces choix fiscaux changent radicalement la rentabilité nette d'un investissement locatif. Explications simples.",
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
        <span className="eyebrow">Guide · Fiscalité</span>
        <h1>LMNP ou micro-foncier : quel régime fiscal choisir pour son investissement locatif</h1>

        <p>Deux investisseurs qui achètent le même bien, au même prix, avec le même loyer, peuvent obtenir une rentabilité nette très différente selon le régime fiscal choisi. C'est souvent la variable la plus négligée dans les calculs de rentabilité amateurs, alors qu'elle peut représenter plusieurs points de rendement net par an. Voici les grandes options, sans prétendre remplacer un conseil personnalisé — ce choix dépend de votre situation fiscale globale.</p>

        <h2>Location nue : micro-foncier ou régime réel</h2>
        <p>Si vous louez un logement vide (non meublé), deux régimes s'offrent à vous :</p>
        <p><strong>Le micro-foncier</strong> s'applique automatiquement si vos revenus locatifs annuels sont sous un certain seuil (vérifiez le seuil en vigueur, il évolue). Il applique un abattement forfaitaire de 30 % sur les loyers perçus, le reste étant imposé à votre tranche marginale d'imposition plus les prélèvements sociaux. C'est simple à déclarer, mais souvent défavorable si vous avez de vraies charges (intérêts d'emprunt, travaux, taxe foncière) qui dépassent cet abattement forfaitaire de 30 %.</p>
        <p><strong>Le régime réel</strong> permet de déduire vos charges réelles : intérêts d'emprunt, travaux d'entretien, taxe foncière, frais de gestion, assurance, et même de créer un déficit foncier imputable sur votre revenu global dans certaines limites. Pour un bien acheté à crédit avec des charges significatives, le régime réel est très souvent plus avantageux que le micro-foncier, même s'il demande une déclaration plus détaillée.</p>

        <h2>Location meublée : LMNP</h2>
        <p>Si vous louez le bien meublé (avec un mobilier suffisant pour y vivre immédiatement), vous basculez dans un régime fiscal différent : le statut de Loueur en Meublé Non Professionnel (LMNP). Deux options existent également :</p>
        <p><strong>Le micro-BIC</strong> applique un abattement forfaitaire plus généreux qu'en location nue (généralement 50 %, voire davantage pour certains meublés de tourisme classés), sous condition de seuil de revenus.</p>
        <p><strong>Le régime réel en LMNP</strong> est souvent le plus intéressant fiscalement pour un investissement à crédit : en plus de déduire les charges réelles comme en location nue, il permet d'amortir comptablement le bien et le mobilier, ce qui peut réduire la base imposable à zéro pendant de nombreuses années, tout en conservant un cash-flow positif. C'est une mécanique plus complexe (elle demande généralement un comptable), mais c'est un des leviers fiscaux les plus puissants pour un investisseur locatif en France.</p>

        <h2>Pourquoi ce choix doit se faire avant l'achat, pas après</h2>
        <p>Le régime fiscal influence directement votre cash-flow réel après impôt, donc votre capacité à tenir l'investissement dans la durée. Un bien qui semble tout juste à l'équilibre en location nue au régime réel peut devenir clairement positif en LMNP au réel grâce à l'amortissement — ou l'inverse si le bien ne se prête pas à la location meublée (colocation étudiante en zone sans forte demande, par exemple). Simuler les deux régimes sur le même bien avant de signer évite d'avoir à changer de stratégie après coup, ce qui a un coût administratif et parfois fiscal.</p>

        <h2>Ce n'est pas un choix universel</h2>
        <p>Le meilleur régime dépend de votre tranche marginale d'imposition, de votre situation locative (étudiant, jeune actif, famille — pas les mêmes attentes en meublé ou nu), de votre horizon de revente, et du montant de vos charges réelles. Un simulateur générique ne remplace pas un chiffrage sur votre cas précis, mais connaître ces mécanismes avant de rencontrer un comptable ou un conseiller vous permet de poser les bonnes questions et de comprendre ses recommandations.</p>

        <div className="blog-cta">
          <h3>Bricky intègre l'impact fiscal dans son calcul</h3>
          <p>En plus du rendement et du cash-flow, Bricky vous aide à visualiser ce qui change réellement dans votre poche selon les hypothèses retenues sur un bien.</p>
          <Link href="/analyze" className="primary-button" style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 50 }}>Analyser un bien gratuitement →</Link>
        </div>
      </article>
    </main>
  );
}
