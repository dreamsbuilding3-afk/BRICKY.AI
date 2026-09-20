export const metadata = { title: "Politique de confidentialité — Bricky" };

export default function ConfidentialitePage() {
  return (
    <main className="page">
      <div className="legal-page">
        <div className="legal-card">
          <a className="legal-back" href="/">← Retour à l'accueil</a>
          <h1>Politique de confidentialité</h1>
          <p className="legal-updated">Dernière mise à jour : 20 septembre 2026</p>

          <div className="legal-notice">
            Cette page n'est pas un conseil juridique. Elle décrit de bonne foi les données traitées par Bricky à ce stade du service ; elle sera affinée avec l'accompagnement d'un professionnel du droit avant tout lancement commercial.
          </div>

          <h2>Responsable de traitement</h2>
          <p>[à compléter — nom et statut juridique de l'exploitant, voir les mentions légales]. Contact : [email à compléter].</p>

          <h2>Données collectées</h2>
          <p>
            Compte : adresse email, mot de passe (stocké de façon chiffrée par notre prestataire d'authentification, jamais en clair).<br />
            Biens analysés : adresse, prix, surface, loyer et autres caractéristiques que vous saisissez ou que Bricky extrait d'une annonce que vous fournissez.<br />
            Données dérivées : coordonnées géographiques et code INSEE de la commune, calculés automatiquement à partir de l'adresse pour produire l'analyse (cadastre, marché, environnement).
          </p>

          <h2>Finalités</h2>
          <p>Ces données sont utilisées uniquement pour fournir le service (générer vos analyses, les retrouver dans "Mes biens", générer vos dossiers PDF) et pour améliorer le produit. Elles ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.</p>

          <h2>Base légale</h2>
          <p>Le traitement repose sur l'exécution du service que vous avez demandé en créant un compte, et sur notre intérêt légitime à améliorer la fiabilité du produit.</p>

          <h2>Destinataires et sous-traitants</h2>
          <p>
            Vos données sont hébergées par Supabase Inc. (base de données et authentification) et Vercel Inc. (application). Certaines analyses interrogent, au moment de la demande, des services publics tiers (IGN/Géoplateforme, data.gouv.fr, OpenStreetMap) : seules l'adresse et les coordonnées nécessaires à la requête leur sont transmises, sans donnée de compte associée.
          </p>

          <h2>Transferts hors Union européenne</h2>
          <p>
            L'infrastructure technique de notre hébergeur de base de données (Supabase) s'appuie sur des serveurs situés aux États-Unis. Ce transfert est encadré par les clauses contractuelles types de nos prestataires. Nous étudions une migration vers une région européenne à mesure que le service se développe.
          </p>

          <h2>Durée de conservation</h2>
          <p>Vos données sont conservées tant que votre compte est actif. En cas de suppression de compte, vos données personnelles et vos analyses sont supprimées, sous réserve des durées de conservation imposées par la loi.</p>

          <h2>Vos droits</h2>
          <p>
            Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition sur vos données. Vous pouvez les exercer directement depuis la page "Mon compte" (suppression de compte) ou par email à [à compléter]. Vous disposez également du droit d'introduire une réclamation auprès de la CNIL (cnil.fr).
          </p>

          <h2>Cookies</h2>
          <p>
            Bricky utilise un cookie strictement nécessaire au fonctionnement du service (maintien de votre session de connexion), déposé par notre prestataire d'authentification Supabase. Ce cookie ne nécessite pas de consentement préalable au titre de la réglementation applicable. Aucun cookie publicitaire ou de mesure d'audience n'est utilisé à ce jour.
          </p>

          <h2>Sécurité</h2>
          <p>L'accès à vos données est protégé par des règles de sécurité au niveau de la base de données (chaque utilisateur ne peut voir que ses propres biens et analyses) et par le chiffrement des mots de passe.</p>

          <h2>Contact</h2>
          <p>Pour toute question relative à vos données : [email à compléter]</p>
        </div>
      </div>
    </main>
  );
}
