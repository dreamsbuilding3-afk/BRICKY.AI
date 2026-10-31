// « Prix à proposer » : à partir du prix demandé, de la valeur de marché (ventes
// réelles DVF), du DPE, des travaux et de la tendance des prix, Bricky propose une
// offre d'ouverture, un prix cible et un prix plafond, avec les arguments chiffrés.
// C'est une estimation indicative : Bricky ne connaît ni l'urgence du vendeur ni la
// concurrence sur le bien.

export type OfferInput = {
  price: number;                    // prix demandé
  marketValue?: number | null;      // valeur estimée (comparables DVF)
  marketConfidence?: number | null; // 0–100
  trendAnnualPct?: number | null;   // évolution annuelle des prix du secteur
  dpe?: string | null;              // A…G
  renovation?: number | null;       // budget travaux connu
  condition?: string | null;        // « À rénover »…
  coproWorksVoted?: number | null;  // travaux de copro votés (montant pour l'immeuble)
};

export type OfferArgument = { label: string; detail: string; amount: number | null };

export type OfferResult = {
  opening: number;  // offre d'ouverture
  target: number;   // prix visé
  ceiling: number;  // à ne pas dépasser
  marginPct: number;
  arguments: OfferArgument[];
  basis: "marché" | "prix demandé";
};

const DPE_DISCOUNT: Record<string, { pct: number; why: string }> = {
  G: { pct: 0.08, why: "Logement G : interdit à la location depuis 2025 tant que les travaux ne sont pas faits." },
  F: { pct: 0.05, why: "Logement F : interdit à la location à partir de 2028 sans travaux de rénovation." },
  E: { pct: 0.02, why: "Logement E : concerné par l'interdiction de louer en 2034, travaux à prévoir." },
};

const round = (n: number, step = 1000) => Math.round(n / step) * step;

export function computeOffer(input: OfferInput): OfferResult | null {
  const price = input.price;
  if (!price || price < 10_000) return null;
  const args: OfferArgument[] = [];
  const reliableMarket = !!input.marketValue && (input.marketConfidence ?? 0) >= 40;
  let reference = price;
  let basis: OfferResult["basis"] = "prix demandé";

  // 1. Le prix face aux ventes réelles du secteur
  if (reliableMarket) {
    const mv = input.marketValue!;
    const gap = (price - mv) / mv;
    if (gap > 0.02) {
      reference = mv;
      basis = "marché";
      args.push({ label: "Au-dessus du marché", detail: `Le prix demandé est ${Math.round(gap * 100)} % au-dessus des ventes réelles comparables du secteur.`, amount: Math.round(price - mv) });
    } else if (gap < -0.05) {
      args.push({ label: "Déjà sous le marché", detail: "Le prix est inférieur aux ventes comparables : la marge de négociation est faible, ne tarde pas.", amount: null });
    }
  }

  let target = reference;

  // 2. Performance énergétique
  const dpe = input.dpe?.toUpperCase();
  if (dpe && DPE_DISCOUNT[dpe]) {
    const cut = Math.round(reference * DPE_DISCOUNT[dpe].pct);
    target -= cut;
    args.push({ label: `DPE ${dpe}`, detail: DPE_DISCOUNT[dpe].why, amount: cut });
  }

  // 3. Travaux à faire
  const works = input.renovation && input.renovation > 0 ? input.renovation : null;
  if (works) {
    const cut = Math.round(works * 0.6); // une partie des travaux est en général déjà intégrée au prix
    target -= cut;
    args.push({ label: "Travaux à prévoir", detail: `${works.toLocaleString("fr-FR")} € de travaux : à faire valoir dans l'offre (devis à l'appui).`, amount: cut });
  } else if (input.condition && /r[ée]nover|restructurer/i.test(input.condition)) {
    const cut = Math.round(reference * 0.05);
    target -= cut;
    args.push({ label: "Bien à rénover", detail: "État « à rénover » : fais chiffrer les travaux avant l'offre, c'est ton meilleur argument.", amount: cut });
  }

  // 4. Tendance du marché
  if (input.trendAnnualPct != null && input.trendAnnualPct < -1) {
    const cut = Math.round(reference * Math.min(0.03, Math.abs(input.trendAnnualPct) / 100));
    target -= cut;
    args.push({ label: "Prix en baisse dans le secteur", detail: `Les prix du secteur baissent d'environ ${Math.abs(input.trendAnnualPct).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % par an.`, amount: cut });
  }

  // 5. Travaux de copropriété déjà votés (montant pour l'immeuble : pas de déduction automatique)
  if (input.coproWorksVoted && input.coproWorksVoted > 0) {
    args.push({ label: "Travaux votés en copropriété", detail: `${input.coproWorksVoted.toLocaleString("fr-FR")} € votés pour l'immeuble : exige qu'ils restent à la charge du vendeur, ou déduis ta quote-part.`, amount: null });
  }

  // Sans argument particulier, la négociation d'usage tourne autour de 3 % ;
  // sous le marché, on vise le prix demandé.
  const belowMarket = args.some((a) => a.label === "Déjà sous le marché");
  if (target >= price) target = belowMarket ? price : price * 0.97;

  // Bornes : jamais au-dessus du prix demandé, jamais une offre irréaliste (> 15 % sous le prix)
  target = Math.min(price, Math.max(price * 0.85, target));
  const opening = Math.max(price * 0.82, target * 0.96);
  const ceiling = Math.min(price, Math.max(target * 1.04, reliableMarket ? Math.min(price, input.marketValue!) : target));

  const t = round(target);
  return {
    opening: Math.min(round(opening), t),
    target: t,
    ceiling: Math.max(round(ceiling), t),
    marginPct: Math.round(((price - t) / price) * 1000) / 10,
    arguments: args,
    basis,
  };
}
