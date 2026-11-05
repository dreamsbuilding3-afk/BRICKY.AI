// Pages promo plein écran (téléphone) : concours, réduction, annonce.
//
// Pour lancer une campagne : ajoute-la dans CAMPAIGNS avec `active: true`
// (et éventuellement des dates). Elle s'affiche UNE fois par utilisateur, sur
// téléphone, à l'ouverture de « Mes biens ». Tant que CAMPAIGNS est vide, rien
// ne s'affiche. Aperçu des modèles : /promo?modele=concours (ou reduction, annonce).
//
// Un concours doit avoir un règlement (obligatoire en France) : renseigne `legal`.

export type PromoKind = "concours" | "reduction" | "annonce";

export type PromoContent = {
  kind: PromoKind;
  eyebrow: string;     // petite étiquette au-dessus du titre
  title: string;       // grand titre
  subtitle: string;    // une ou deux lignes en gras
  text: string;        // phrase d'accroche
  cta: string;         // texte du bouton à glisser
  href: string;        // où mène le bouton
  badge?: string;      // étiquette flottante (ex. « −30 % »), modèle réduction
  legal?: { label: string; href: string };
};

export type PromoCampaign = PromoContent & {
  id: string;          // change l'id pour réafficher la page à tout le monde
  active: boolean;
  startsAt?: string;   // ISO, optionnel
  endsAt?: string;     // ISO, optionnel
};

/** Textes d'exemple des trois modèles : utilisés pour l'aperçu, à adapter avant toute vraie campagne. */
export const PROMO_TEMPLATES: Record<PromoKind, PromoContent> = {
  concours: {
    kind: "concours",
    eyebrow: "Concours",
    title: "La clé du jackpot",
    subtitle: "Gagne 1 an de Bricky Pro",
    text: "Analyse un bien ce mois-ci et tente ta chance. Un gagnant tiré au sort à la fin du mois.",
    cta: "Glisse pour participer",
    href: "/analyze",
    legal: { label: "Règlement du jeu", href: "/legal/reglement-concours" }, // page à créer avec le vrai règlement
  },
  reduction: {
    kind: "reduction",
    eyebrow: "Offre limitée",
    title: "Les prix tombent",
    subtitle: "−30 % sur ton premier mois Pro",
    text: "Le bon investissement, c'est celui qu'on a vérifié avant de signer.",
    cta: "Glisse pour en profiter",
    href: "/pricing",
    badge: "−30 %",
  },
  annonce: {
    kind: "annonce",
    eyebrow: "Nouveau",
    title: "Visite sans rien oublier",
    subtitle: "Le mode visite arrive sur Bricky",
    text: "Checklist pièce par pièce, photos et questions à poser : ton compte rendu de visite tient dans ta poche.",
    cta: "Glisse pour découvrir",
    href: "/properties",
  },
};

/**
 * Campagne de TEST (fictive) : jamais montrée aux utilisateurs. Elle s'affiche
 * uniquement en ouvrant « Mes biens » avec ?promo=test dans l'adresse, pour voir le rendu.
 */
export const TEST_CAMPAIGN: PromoCampaign = {
  id: "test-reduction-pro",
  active: false,
  kind: "reduction",
  eyebrow: "Offre de lancement",
  title: "Le Pro à prix doux",
  subtitle: "−20 % sur le forfait Pro pendant 3 mois",
  text: "Analyses illimitées, dossiers PDF et comparateur : investis avec un temps d'avance.",
  cta: "Glisse pour en profiter",
  href: "/pricing",
  badge: "−20 %",
};

/** Campagnes réelles. Vide = aucune page promo. */
export const CAMPAIGNS: PromoCampaign[] = [];

export function activeCampaign(now = new Date()): PromoCampaign | null {
  return (
    CAMPAIGNS.find(
      (c) => c.active && (!c.startsAt || Date.parse(c.startsAt) <= now.getTime()) && (!c.endsAt || Date.parse(c.endsAt) > now.getTime()),
    ) ?? null
  );
}

export const promoSeenKey = (id: string) => `bricky_promo_vue_${id}`;
