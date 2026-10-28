// Analyse d'une annonce de LOCATION, du point de vue du futur locataire :
// le loyer est-il au prix du marché, et l'annonce respecte-t-elle les règles
// (DPE, dépôt de garantie, honoraires, encadrement des loyers) ?
//
// Calcul pur, sans appel réseau : testable et réutilisable côté client ou serveur.

export type RentalInput = {
  surface_m2: number;
  rent_hc: number | null;
  rent_cc: number | null;
  monthly_charges: number | null;
  is_furnished: boolean | null;
  is_house: boolean;
  dpe_class: string | null;
  deposit: number | null;
  tenant_agency_fees: number | null;
  reference_rent_m2_majore: number | null;
  rent_supplement: number | null;
  energy_cost_annual: number | null;
  household_income: number | null;
};

/** Indicateurs ANIL « carte des loyers » (loyers d'annonce charges comprises, en €/m²). */
export type MarketReference = {
  commune: string | null;
  rent_m2: number;
  rent_m2_low: number | null;
  rent_m2_high: number | null;
  nb_observations: number | null;
  source: string;
};

export type CheckLevel = "ok" | "warn" | "bad";
export type RentalCheck = { level: CheckLevel; title: string; detail: string };

export type PriceVerdict = "good" | "fair" | "high" | "very_high" | "unknown";

export type RentalAssessment = {
  rent_hc: number | null;
  rent_cc: number;
  rent_cc_is_estimate: boolean;
  rent_cc_m2: number;
  market: (MarketReference & { expected_rent_cc: number; expected_low: number | null; expected_high: number | null }) | null;
  diff_pct: number | null;
  price_verdict: PriceVerdict;
  overall: "good" | "fair" | "warning" | "avoid";
  headline: string;
  monthly_total: number;
  energy_monthly: number | null;
  income_needed: number;
  effort_rate_pct: number | null;
  checks: RentalCheck[];
};

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

// Plafonds légaux des honoraires de location à la charge du locataire (€/m²),
// visite + dossier + bail, auxquels s'ajoutent 3 €/m² pour l'état des lieux.
const FEES_CAP_M2 = { tres_tendue: 12, tendue: 10, autre: 8 };
const INVENTORY_FEES_M2 = 3;

export function assessRental(input: RentalInput, market: MarketReference | null): RentalAssessment {
  const checks: RentalCheck[] = [];
  const surface = input.surface_m2;

  // --- Loyer hors charges / charges comprises
  let rentHc = input.rent_hc;
  let rentCc = input.rent_cc;
  let rentCcIsEstimate = false;
  if (rentCc === null && rentHc !== null) {
    if (input.monthly_charges !== null) rentCc = rentHc + input.monthly_charges;
    else {
      rentCc = rentHc;
      rentCcIsEstimate = true;
      checks.push({
        level: "warn",
        title: "Charges non indiquées",
        detail: "L'annonce ne précise pas les charges. Elles s'ajoutent au loyer : demande le montant de la provision mensuelle.",
      });
    }
  }
  if (rentHc === null && rentCc !== null && input.monthly_charges !== null) rentHc = rentCc - input.monthly_charges;
  const cc = rentCc ?? 0;
  const ccM2 = surface > 0 ? cc / surface : 0;

  // --- Comparaison au marché (ANIL : loyers charges comprises)
  let marketOut: RentalAssessment["market"] = null;
  let diffPct: number | null = null;
  let priceVerdict: PriceVerdict = "unknown";
  if (market && market.rent_m2 > 0 && cc > 0) {
    marketOut = {
      ...market,
      expected_rent_cc: round(market.rent_m2 * surface),
      expected_low: market.rent_m2_low ? round(market.rent_m2_low * surface) : null,
      expected_high: market.rent_m2_high ? round(market.rent_m2_high * surface) : null,
    };
    const ratio = ccM2 / market.rent_m2;
    diffPct = round((ratio - 1) * 100);
    if (ratio <= 0.92) priceVerdict = "good";
    else if (ratio <= 1.08) priceVerdict = "fair";
    else if (market.rent_m2_high === null || ccM2 <= market.rent_m2_high) priceVerdict = "high";
    else priceVerdict = "very_high";
    if (input.is_furnished) {
      checks.push({
        level: "ok",
        title: "Logement meublé",
        detail: "La référence de marché porte sur des logements vides : un meublé se loue en général un peu plus cher, tiens-en compte.",
      });
    }
  }

  // --- DPE (calendrier de la loi Climat et résilience pour les nouveaux baux)
  const dpe = input.dpe_class?.toUpperCase() ?? null;
  if (!dpe) {
    checks.push({ level: "warn", title: "DPE absent", detail: "Le diagnostic de performance énergétique est obligatoire dans l'annonce. Demande-le avant de visiter." });
  } else if (dpe === "G") {
    checks.push({
      level: "bad",
      title: "DPE G : logement non décent",
      detail: "Depuis le 1er janvier 2025, un logement classé G ne peut plus être loué avec un nouveau bail. Tu peux exiger des travaux ou une baisse de loyer.",
    });
  } else if (dpe === "F") {
    checks.push({
      level: "warn",
      title: "DPE F : passoire énergétique",
      detail: "Chauffage coûteux, et ce logement ne pourra plus être loué avec un nouveau bail à partir de 2028.",
    });
  } else if (dpe === "E") {
    checks.push({ level: "warn", title: "DPE E", detail: "Consommation d'énergie assez élevée : vérifie l'estimation des factures." });
  } else {
    checks.push({ level: "ok", title: `DPE ${dpe}`, detail: "Bonne performance énergétique." });
  }

  // --- Dépôt de garantie : 1 mois HC (vide), 2 mois HC (meublé)
  if (input.deposit !== null && rentHc !== null && rentHc > 0) {
    const maxMonths = input.is_furnished ? 2 : 1;
    const max = rentHc * maxMonths;
    if (input.deposit > max + 1) {
      checks.push({
        level: "bad",
        title: "Dépôt de garantie trop élevé",
        detail: `${euros(input.deposit)} demandés, alors que le maximum légal est ${maxMonths} mois de loyer hors charges, soit ${euros(max)}${input.is_furnished === null ? " (2 mois si le logement est meublé)" : ""}.`,
      });
    } else {
      checks.push({ level: "ok", title: "Dépôt de garantie conforme", detail: `${euros(input.deposit)}, dans la limite légale.` });
    }
  }

  // --- Honoraires d'agence à la charge du locataire
  if (input.tenant_agency_fees !== null && input.tenant_agency_fees > 0 && surface > 0) {
    const maxAnywhere = (FEES_CAP_M2.tres_tendue + INVENTORY_FEES_M2) * surface;
    const maxOutsideTense = (FEES_CAP_M2.autre + INVENTORY_FEES_M2) * surface;
    if (input.tenant_agency_fees > maxAnywhere + 1) {
      checks.push({
        level: "bad",
        title: "Frais d'agence au-dessus du plafond",
        detail: `${euros(input.tenant_agency_fees)} demandés : même en zone très tendue, le plafond est de ${euros(maxAnywhere)} pour ${surface.toLocaleString("fr-FR")} m² (état des lieux inclus).`,
      });
    } else if (input.tenant_agency_fees > maxOutsideTense + 1) {
      checks.push({
        level: "warn",
        title: "Frais d'agence élevés",
        detail: `${euros(input.tenant_agency_fees)} : autorisé seulement en zone tendue ou très tendue. Ailleurs, le plafond est de ${euros(maxOutsideTense)} pour ${surface.toLocaleString("fr-FR")} m².`,
      });
    } else {
      checks.push({ level: "ok", title: "Frais d'agence dans les plafonds", detail: `${euros(input.tenant_agency_fees)} pour ${surface.toLocaleString("fr-FR")} m².` });
    }
  }

  // --- Encadrement des loyers (valeurs affichées dans l'annonce)
  if (input.reference_rent_m2_majore !== null && rentHc !== null && surface > 0) {
    const maxBase = input.reference_rent_m2_majore * surface;
    const base = rentHc - (input.rent_supplement ?? 0);
    if (base > maxBase + 1) {
      checks.push({
        level: "bad",
        title: "Loyer au-dessus de l'encadrement",
        detail: `Le loyer de base (${euros(base)}) dépasse le loyer de référence majoré (${euros(maxBase)}). Tu peux le contester.`,
      });
    } else {
      checks.push({ level: "ok", title: "Encadrement des loyers respecté", detail: `Loyer de base sous le plafond de ${euros(maxBase)}.` });
    }
    if (input.rent_supplement && input.rent_supplement > 0) {
      checks.push({
        level: "warn",
        title: "Complément de loyer",
        detail: `${euros(input.rent_supplement)}/mois en plus : il n'est permis que pour des caractéristiques exceptionnelles (vue, terrasse…). Il peut être contesté dans les 3 mois après la signature.`,
      });
    }
  }

  // --- Budget : coût total et taux d'effort
  const energyMonthly = input.energy_cost_annual ? round(input.energy_cost_annual / 12) : null;
  const monthlyTotal = round(cc + (energyMonthly ?? 0));
  const incomeNeeded = round(cc * 3);
  let effortRate: number | null = null;
  if (input.household_income && input.household_income > 0) {
    effortRate = round((cc / input.household_income) * 100);
    if (effortRate > 40) {
      checks.push({ level: "bad", title: "Loyer trop lourd pour ton budget", detail: `Le loyer représente ${effortRate} % de tes revenus. Au-delà de 33 %, la plupart des propriétaires refusent le dossier.` });
    } else if (effortRate > 33) {
      checks.push({ level: "warn", title: "Budget serré", detail: `Le loyer représente ${effortRate} % de tes revenus (repère courant : 33 % maximum).` });
    } else {
      checks.push({ level: "ok", title: "Budget OK", detail: `Le loyer représente ${effortRate} % de tes revenus.` });
    }
  }

  const hasBad = checks.some((c) => c.level === "bad");
  let overall: RentalAssessment["overall"];
  let headline: string;
  if (hasBad) {
    overall = "avoid";
    headline = "Attention : cette annonce pose problème";
  } else if (priceVerdict === "good") {
    overall = "good";
    headline = "Bon prix pour le secteur";
  } else if (priceVerdict === "fair") {
    overall = "fair";
    headline = "Loyer dans le prix du marché";
  } else if (priceVerdict === "high" || priceVerdict === "very_high") {
    overall = "warning";
    headline = priceVerdict === "very_high" ? "Loyer nettement au-dessus du marché" : "Loyer un peu au-dessus du marché";
  } else {
    overall = "fair";
    headline = "Pas de référence de marché pour cette commune";
  }

  return {
    rent_hc: rentHc,
    rent_cc: round(cc),
    rent_cc_is_estimate: rentCcIsEstimate,
    rent_cc_m2: round(ccM2, 1),
    market: marketOut,
    diff_pct: diffPct,
    price_verdict: priceVerdict,
    overall,
    headline,
    monthly_total: monthlyTotal,
    energy_monthly: energyMonthly,
    income_needed: incomeNeeded,
    effort_rate_pct: effortRate,
    checks,
  };
}
