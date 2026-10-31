import "./confidentialite.css";

export const metadata = {
  title: "Politique de confidentialité — Bricky",
  description: "Quelles données Bricky utilise, pourquoi, avec qui elles sont partagées et comment exercer vos droits.",
};

const CONTACT = "bricky.everithing@gmail.com";
const UPDATED = "31 octobre 2026";

export default function ConfidentialitePage() {
  return (
    <main className="page">
      <div className="legal-page">
        <div className="legal-card privacy">
          <a className="legal-back" href="/">← Retour à l'accueil</a>
          <h1>Politique de confidentialité</h1>
          <p className="legal-updated">Dernière mise à jour : {UPDATED}</p>

          <section className="privacy-brief" aria-label="En bref">
            <h2>En bref</h2>
            <ul>
              <li>Bricky n'utilise vos données que pour analyser vos biens et faire fonctionner votre compte.</li>
              <li>Rien n'est vendu, loué ni utilisé pour de la publicité. Aucun traceur publicitaire ni outil de mesure d'audience.</li>
              <li>Chaque utilisateur ne voit que ses propres biens, analyses, photos et comptes rendus.</li>
              <li>Vous pouvez supprimer votre compte à tout moment depuis « Mon compte ».</li>
              <li>Une question : <a href={`mailto:${CONTACT}`}>{CONTACT}</a></li>
            </ul>
          </section>

          <nav className="privacy-toc" aria-label="Sommaire">
            <a href="#responsable">Responsable</a>
            <a href="#donnees">Données</a>
            <a href="#finalites">Finalités</a>
            <a href="#prestataires">Prestataires</a>
            <a href="#ia">Intelligence artificielle</a>
            <a href="#extension">Extension Chrome</a>
            <a href="#transferts">Transferts</a>
            <a href="#conservation">Conservation</a>
            <a href="#droits">Vos droits</a>
            <a href="#stockage">Cookies</a>
          </nav>

          <div className="legal-notice">
            Bricky est en phase de test (bêta). Cette page décrit de bonne foi les données traitées aujourd'hui ; elle ne constitue pas un conseil juridique
            et sera revue avec un professionnel du droit avant le lancement commercial.
          </div>

          <h2 id="responsable">1. Responsable du traitement</h2>
          <p>
            Bricky, service en cours de lancement, exploité par [à compléter — nom et statut juridique de l'exploitant, voir les{" "}
            <a href="/legal/mentions-legales">mentions légales</a>].<br />
            Contact pour toute question sur vos données : <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>

          <h2 id="donnees">2. Données que nous utilisons</h2>
          <h3>Votre compte</h3>
          <p>
            Adresse e-mail ; mot de passe (conservé chiffré par notre prestataire d'authentification, jamais en clair) ; date de naissance, uniquement pour vérifier que vous avez
            18 ans ou plus. Si vous vous connectez avec Google ou Apple, nous recevons de ce service votre adresse e-mail et, le cas échéant, votre nom : jamais votre mot de passe.
            Les réponses au questionnaire d'accueil et votre « Mon projet » (villes, budget, type de bien, surface, rendement visé) sont rattachés à votre compte.
          </p>
          <h3>Les biens que vous analysez</h3>
          <p>
            Ce que vous saisissez ou envoyez : lien, texte ou captures d'une annonce, documents du dossier (DPE, taxe foncière, procès-verbaux d'assemblée générale, bail…),
            adresse, prix, surface, loyer, financement et charges. À partir de l'adresse, Bricky calcule les coordonnées géographiques et le code de la commune pour produire l'analyse.
            Ces documents peuvent contenir des informations sur d'autres personnes (vendeur, locataire, copropriétaires) : envoyez uniquement ce qui est utile à votre analyse.
          </p>
          <h3>Le mode visite</h3>
          <p>
            Votre checklist, vos notes, les réponses de l'agent et les photos prises pendant la visite. Les photos sont rangées dans un espace de stockage privé, accessible
            uniquement depuis votre compte. Évitez de photographier des personnes ou des documents personnels de l'occupant.
          </p>
          <h3>Équipe, agence et contact</h3>
          <p>
            Si vous invitez des collègues, leur adresse e-mail ; si vous personnalisez vos dossiers, le nom, le logo et les coordonnées de votre agence ;
            si vous nous écrivez via le formulaire de contact, votre nom, votre e-mail et votre message.
          </p>
          <h3>Données techniques</h3>
          <p>
            Pour protéger le service contre les abus, nous comptons les requêtes par compte ou, à défaut, par adresse IP. Les erreurs techniques sont enregistrées pour être corrigées.
            Notre hébergeur conserve des journaux de connexion techniques.
          </p>

          <h2 id="finalites">3. Pourquoi nous les utilisons, et sur quelle base</h2>
          <ul>
            <li><strong>Fournir le service</strong> (créer votre compte, lire vos annonces et documents, produire et conserver vos analyses, comptes rendus de visite et dossiers PDF) : exécution du contrat que vous acceptez en créant un compte.</li>
            <li><strong>Vérifier l'âge minimum</strong> de 18 ans : exécution du contrat et respect de nos conditions d'utilisation.</li>
            <li><strong>Sécuriser le service</strong> (limites d'usage, journaux d'erreurs) et <strong>l'améliorer</strong> : notre intérêt légitime à offrir un service fiable.</li>
            <li><strong>Répondre à vos messages</strong> : votre demande.</li>
          </ul>
          <p>Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires ou de profilage commercial.</p>

          <h2 id="prestataires">4. Qui reçoit vos données</h2>
          <p>Uniquement les prestataires nécessaires au service, chacun pour son rôle :</p>
          <ul>
            <li><strong>Supabase</strong> : base de données, authentification et stockage des photos de visite.</li>
            <li><strong>Vercel</strong> : hébergement de l'application.</li>
            <li><strong>Anthropic</strong> : lecture automatique des annonces et documents par intelligence artificielle (voir ci-dessous).</li>
            <li><strong>Google</strong> et <strong>Apple</strong> : uniquement si vous choisissez de vous connecter avec eux.</li>
            <li>
              <strong>Services publics de données</strong> (Géoplateforme de l'IGN, API Découpage administratif, DVF du Cerema, ADEME, Géorisques, data.gouv.fr, OpenStreetMap) :
              au moment de l'analyse, seuls l'adresse, les coordonnées ou le code de la commune nécessaires à la requête leur sont transmis, sans aucune donnée de votre compte.
            </li>
            <li>
              <strong>Stream Estate</strong>, lorsque le radar des bonnes affaires est disponible : les critères de recherche de « Mon projet » (communes, budget, type de bien,
              surface) et les liens d'annonces que vous comparez, sans aucune donnée de votre compte.
            </li>
          </ul>

          <h2 id="ia">5. Intelligence artificielle</h2>
          <p>
            Lorsque la lecture automatique est active, le texte, les captures ou les documents que vous envoyez sont transmis à l'API Claude d'Anthropic, qui en extrait les informations
            utiles (prix, surface, DPE, travaux votés…). Anthropic agit comme prestataire : selon ses conditions commerciales, les données transmises par son API ne servent pas à
            entraîner ses modèles. Nous n'envoyons pas votre adresse e-mail ni les données de votre compte avec ces contenus. Quand l'IA est indisponible, Bricky lit le texte lui-même,
            sans rien transmettre à Anthropic.
          </p>

          <h2 id="extension">6. Extension Chrome et bouton « Envoyer à Bricky »</h2>
          <p>
            L'extension « Bricky – Envoyer une annonce » et le bouton-favori ne lisent que la page ouverte dans l'onglet actif, et seulement au moment où vous cliquez.
            Ils ne fonctionnent pas en arrière-plan, ne lisent pas votre historique et ne collectent rien sur les autres sites.
          </p>
          <ul>
            <li><strong>Ce qui est lu :</strong> l'adresse de la page, son texte et ses données structurées ; avec l'extension, si la case est cochée, une capture de la partie visible de la page.</li>
            <li><strong>Où cela va :</strong> ces éléments sont placés dans l'adresse de la page Bricky qui s'ouvre (après le symbole #, partie qui n'est jamais envoyée à un serveur), puis lus par Bricky dans votre navigateur pour pré-remplir l'analyse, une fois connecté. Ils suivent ensuite le même parcours que le texte d'annonce collé à la main.</li>
            <li><strong>Ce que l'extension conserve :</strong> uniquement l'adresse de Bricky choisie dans ses réglages, dans le stockage de Chrome.</li>
            <li><strong>Utilisation limitée :</strong> ces données servent uniquement à pré-remplir votre analyse. Elles ne sont ni vendues, ni transférées à des tiers hors des prestataires cités plus haut, ni utilisées pour de la publicité ou pour évaluer une solvabilité.</li>
          </ul>

          <h2 id="transferts">7. Transferts hors de l'Union européenne</h2>
          <p>
            Supabase (base de données hébergée aux États-Unis), Vercel et Anthropic sont des sociétés américaines : vos données peuvent donc être traitées aux États-Unis.
            Ces transferts sont encadrés par les garanties prévues par le RGPD (clauses contractuelles types de la Commission européenne et, lorsque le prestataire y adhère,
            le cadre de protection des données UE–États-Unis). Nous étudions un hébergement de la base de données en Europe à mesure que le service se développe.
          </p>

          <h2 id="conservation">8. Combien de temps</h2>
          <ul>
            <li><strong>Compte, biens, analyses, comptes rendus et photos de visite :</strong> tant que votre compte est actif. Ils sont supprimés avec votre compte.</li>
            <li><strong>Messages envoyés via le formulaire de contact :</strong> le temps de traiter votre demande et d'assurer le suivi ; ils sont détachés de votre compte si vous le supprimez.</li>
            <li><strong>Compteurs anti-abus :</strong> environ une heure.</li>
            <li><strong>Journaux d'erreurs :</strong> conservés pour corriger les problèmes du service ; ils sont détachés de votre compte si vous le supprimez.</li>
          </ul>
          <p>Certaines données peuvent être conservées plus longtemps lorsque la loi l'impose (par exemple les pièces comptables liées à un paiement).</p>

          <h2 id="droits">9. Vos droits</h2>
          <p>
            Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données, ainsi que du droit de définir des directives
            sur leur sort après votre décès. Concrètement :
          </p>
          <ul>
            <li>modifier vos informations et votre projet : directement dans l'application ;</li>
            <li>récupérer vos analyses : depuis la rubrique « Export » de votre espace ;</li>
            <li>supprimer votre compte et vos données : depuis « Mon compte » ;</li>
            <li>pour tout le reste : <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Nous répondons dans un délai d'un mois.</li>
          </ul>
          <p>
            Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL :{" "}
            <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">cnil.fr/fr/plaintes</a>.
          </p>

          <h2 id="stockage">10. Cookies et stockage dans votre navigateur</h2>
          <p>
            Bricky n'utilise ni cookie publicitaire, ni outil de mesure d'audience, ni traceur de réseaux sociaux. Il enregistre seulement dans votre navigateur ce qui est
            strictement nécessaire au service : votre session de connexion, le brouillon de l'analyse en cours, une visite commencée hors connexion et vos préférences d'affichage
            (thème clair ou sombre, langue). Ces éléments ne nécessitent pas de consentement et disparaissent si vous videz les données du site.
          </p>

          <h2>11. Sécurité</h2>
          <p>
            Les échanges sont chiffrés (HTTPS). L'accès aux données est contrôlé au niveau de la base : chaque utilisateur ne peut lire que ses propres biens, analyses, comptes
            rendus et photos. Les clés d'accès aux services tiers restent sur nos serveurs et ne sont jamais envoyées à votre navigateur.
          </p>

          <h2>12. Mineurs</h2>
          <p>Bricky est réservé aux personnes de 18 ans ou plus. Nous ne collectons pas sciemment de données concernant des mineurs.</p>

          <h2>13. Modifications</h2>
          <p>
            Cette page évoluera avec le service. En cas de changement important (nouveau prestataire, nouvel usage de vos données), nous vous en informerons dans l'application
            ou par e-mail. La date de dernière mise à jour figure en haut de la page.
          </p>
        </div>
      </div>
    </main>
  );
}
