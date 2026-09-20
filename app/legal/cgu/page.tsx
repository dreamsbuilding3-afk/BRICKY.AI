export const metadata = { title: "Conditions générales d'utilisation — Bricky" };

export default function CGUPage() {
  return (
    <main className="page">
      <div className="legal-page">
        <div className="legal-card">
          <a className="legal-back" href="/">← Retour à l'accueil</a>
          <h1>Conditions générales d'utilisation</h1>
          <p className="legal-updated">Dernière mise à jour : 20 septembre 2026 — version bêta</p>

          <div className="legal-notice">
            Bricky est en version bêta. Le service, ses fonctionnalités et ces conditions peuvent évoluer. Toute évolution substantielle vous sera signalée.
          </div>

          <h2>1. Objet</h2>
          <p>
            Bricky est un outil d'aide à la décision pour l'investissement immobilier. À partir d'une annonce ou de données saisies par l'utilisateur, le service produit une analyse indicative : estimation de rentabilité, comparables de marché, données cadastrales et d'urbanisme, points de risque et liste de vérifications à effectuer avant une décision d'achat.
          </p>

          <h2>2. Compte utilisateur</h2>
          <p>
            L'accès au service nécessite la création d'un compte (email et mot de passe). Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée depuis votre compte. Vous pouvez demander la suppression de votre compte et de vos données à tout moment via la page "Mon compte" ou par email.
          </p>

          <h2>3. Description et limites du service</h2>
          <p>
            Les analyses produites par Bricky reposent sur des données déclaratives (saisies par vous) et des données publiques tierces : cadastre et urbanisme (IGN, Géoportail de l'Urbanisme), transactions immobilières (DVF), indicateurs de loyer (ANIL), points d'intérêt (OpenStreetMap). Ces sources peuvent être incomplètes, indisponibles ponctuellement ou ne pas couvrir toutes les zones géographiques. Lorsqu'une donnée fiable n'est pas disponible, Bricky l'indique explicitement plutôt que d'inventer une valeur.
          </p>
          <p>
            Les estimations financières (loyer, rendement, valeur de marché) sont des ordres de grandeur statistiques et ne constituent pas une garantie de résultat. Bricky n'est pas un conseiller en investissement financier ni un professionnel de l'immobilier au sens réglementaire.
          </p>

          <h2>4. Disponibilité du service</h2>
          <p>
            Le service est fourni "en l'état", en phase de test. Aucune garantie de disponibilité continue ou d'absence d'erreur n'est apportée. Des interruptions ou évolutions peuvent survenir sans préavis pendant cette phase.
          </p>

          <h2>5. Tarifs</h2>
          <p>
            Le service est actuellement proposé gratuitement pendant sa phase de test. Une évolution vers un modèle payant pourra être mise en place ultérieurement ; les utilisateurs existants en seront informés avant toute mise en application, avec un délai raisonnable pour accepter ou résilier leur compte.
          </p>

          <h2>6. Usage autorisé</h2>
          <p>
            Vous vous engagez à ne pas utiliser le service à des fins illégales, à ne pas tenter d'en perturber le fonctionnement (surcharge automatisée, extraction massive de données, contournement des limites d'usage) et à ne pas revendre l'accès au service sans autorisation.
          </p>

          <h2>7. Responsabilité</h2>
          <p>
            Bricky ne saurait être tenu responsable des décisions d'investissement, d'achat ou de gestion prises sur la base des analyses fournies. Il appartient à l'utilisateur de vérifier les informations auprès des sources officielles et de professionnels compétents avant tout engagement.
          </p>

          <h2>8. Droit applicable</h2>
          <p>Les présentes conditions sont régies par le droit français. Tout litige relève, à défaut de résolution amiable, des juridictions compétentes.</p>

          <h2>9. Contact</h2>
          <p>Pour toute question sur ces conditions : [email à compléter]</p>
        </div>
      </div>
    </main>
  );
}
