export const metadata = { title: "Mentions légales — Bricky" };

export default function MentionsLegalesPage() {
  return (
    <main className="page">
      <div className="legal-page">
        <div className="legal-card">
          <a className="legal-back" href="/">← Retour à l'accueil</a>
          <h1>Mentions légales</h1>
          <p className="legal-updated">Dernière mise à jour : 20 septembre 2026</p>

          <div className="legal-notice">
            Bricky est actuellement en phase de test (bêta) et n'est pas encore exploité par une structure juridique immatriculée. Les informations ci-dessous seront complétées dès l'immatriculation d'une entreprise. Pour toute question, contactez-nous à l'adresse indiquée en bas de page.
          </div>

          <h2>Éditeur du site</h2>
          <p>
            Éditeur : [à compléter — nom et statut juridique de l'exploitant]<br />
            Adresse : [à compléter]<br />
            Email de contact : [à compléter]<br />
            Numéro SIRET : [à compléter, non applicable tant que l'activité n'est pas immatriculée]
          </p>

          <h2>Directeur de la publication</h2>
          <p>[à compléter]</p>

          <h2>Hébergement</h2>
          <p>
            Le site et l'application sont hébergés par :<br />
            Vercel Inc. — 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis — <a href="https://vercel.com" target="_blank" rel="noreferrer">vercel.com</a>
          </p>
          <p>
            La base de données est hébergée par :<br />
            Supabase Inc. — 970 Toa Payoh North #07-04, Singapour (infrastructure technique répliquée sur Amazon Web Services, région US East) — <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>
          </p>

          <h2>Propriété intellectuelle</h2>
          <p>
            L'ensemble des éléments du site (textes, interface, logo, code source) est protégé au titre du droit d'auteur. Toute reproduction non autorisée est interdite. Les données affichées provenant de sources publiques (IGN, data.gouv.fr, OpenStreetMap, ANIL) restent soumises à leurs licences respectives, mentionnées dans chaque section concernée de l'application.
          </p>

          <h2>Nature du service et limites de responsabilité</h2>
          <p>
            Bricky fournit des analyses et estimations à titre purement informatif, construites à partir de données déclaratives et de sources publiques tierces (cadastre, urbanisme, transactions immobilières, indicateurs de loyer). Ces analyses ne constituent ni un conseil en investissement, ni une expertise immobilière, ni un document opposable. Elles ne remplacent pas l'avis d'un notaire, d'un agent immobilier, d'un diagnostiqueur professionnel, d'un conseiller financier ou de tout professionnel compétent. Bricky ne garantit pas l'exactitude, l'exhaustivité ou l'actualité des données affichées et ne saurait être tenu responsable des décisions prises sur leur seule base.
          </p>

          <h2>Contact</h2>
          <p>Pour toute question relative au site, à vos données personnelles ou à ces mentions légales : [email à compléter]</p>
        </div>
      </div>
    </main>
  );
}
