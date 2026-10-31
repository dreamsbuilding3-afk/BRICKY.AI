// Radar des bonnes affaires : traduit « Mon projet » en recherche Stream Estate,
// puis note chaque annonce trouvée (prix face aux ventes réelles DVF, rendement
// estimé avec la carte des loyers ANIL, baisses de prix, DPE).
// Calcul pur, sans appel réseau : testable et utilisable côté client.

import type { SearchProject } from "./searchProject";
import type { RadarListing } from "./streamEstate";

// Types Bricky → types Stream Estate
const TYPE_MAP: Record<string, string[]> = {
  appartement: ["FLAT"],
  studio: ["FLAT"],
  maison: ["HOUSE"],
  immeuble: ["BUILDING"],
  local_commercial: ["COMMERCIAL_PREMISES", "SHOP"],
  parking: ["PARKING"],
  terrain: ["LAND"],
};

export const STREAM_TYPE_LABELS: Record<string, string> = {
  FLAT: "Appartement", HOUSE: "Maison", BUILDING: "Immeuble", PARKING: "Parking", OFFICE: "Bureau",
  LAND: "Terrain", SHOP: "Commerce", COMMERCIAL_PREMISES: "Local commercial",
};

/** Critères de recherche Stream Estate à partir du projet. `since` : seulement ce qui a bougé depuis. */
export function buildCriteria(project: SearchProject, inseeCodes: string[], since: string): Record<string, unknown> {
  const types = [...new Set((project.types.length ? project.types : ["appartement", "maison"]).flatMap((t) => TYPE_MAP[t] ?? []))];
  const property: Record<string, unknown> = {
    transaction: { type: "SELL" },
    type: { in: types.length ? types : ["FLAT", "HOUSE"] },
    pricing: { displayed: { gte: 10000, ...(project.budget_max ? { lte: project.budget_max } : {}) } },
    locations: { countryCode: "FR", in: { uniqueCodes: inseeCodes } },
  };
  if (project.surface_min) property.areas = { displayed: { gte: project.surface_min } };
  if (project.types.length === 1 && project.types[0] === "studio") property.unit = { rooms: { lte: 1 } };
  return { property, dates: { updatedAt: { from: since } } };
}

/** Empreinte du projet : si elle change, le radar repart d'une recherche complète. */
export function projectFingerprint(p: SearchProject): string {
  return JSON.stringify([p.cities.map((c) => c.toLowerCase()).sort(), p.types.slice().sort(), p.budget_max, p.surface_min]);
}

export type RadarMarket = { medianPriceM2: number | null; comparables: number; rentM2: number | null };
export type RadarReason = { tone: "good" | "bad" | "info"; text: string };
export type RadarScore = {
  score: number;
  label: "Très bonne affaire" | "Bonne affaire" | "Dans le marché" | "Cher";
  reasons: RadarReason[];
  metrics: {
    priceM2: number | null;
    marketGapPct: number | null;
    grossYield: number | null;
    monthlyRent: number | null;
    cheaperElsewhere: { slug: string; url: string; price: number; savings: number } | null;
  };
};

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const pct1 = (n: number) => n.toFixed(1).replace(".", ",");

export function scoreListing(l: RadarListing, market: RadarMarket, project: Pick<SearchProject, "goal" | "yield_target">): RadarScore {
  const reasons: RadarReason[] = [];
  let score = 50;
  const priceM2 = l.price && l.surface ? l.price / l.surface : null;

  // 1. Prix au m² face aux ventes réelles du secteur (DVF), si assez de ventes
  let gap: number | null = null;
  if (priceM2 && market.medianPriceM2 && market.comparables >= 5) {
    gap = (priceM2 - market.medianPriceM2) / market.medianPriceM2;
    const pct = Math.round(Math.abs(gap) * 100);
    if (gap <= -0.15) { score += 25; reasons.push({ tone: "good", text: `${pct} % sous les ventes réelles du secteur` }); }
    else if (gap <= -0.08) { score += 15; reasons.push({ tone: "good", text: `${pct} % sous les ventes réelles du secteur` }); }
    else if (gap <= -0.03) { score += 7; reasons.push({ tone: "good", text: `Un peu sous le marché (−${pct} %)` }); }
    else if (gap >= 0.1) { score -= 15; reasons.push({ tone: "bad", text: `${pct} % au-dessus des ventes réelles` }); }
    else if (gap >= 0.03) { score -= 5; reasons.push({ tone: "info", text: `Légèrement au-dessus du marché (+${pct} %)` }); }
    else reasons.push({ tone: "info", text: "Au prix des ventes réelles du secteur" });
  }

  // 2. Rendement locatif brut estimé (loyer de marché ANIL, charges déduites ~10 %)
  let grossYield: number | null = null;
  let monthlyRent: number | null = null;
  const invest = project.goal !== "home";
  if (market.rentM2 && l.surface && l.price) {
    monthlyRent = market.rentM2 * 0.9 * l.surface;
    grossYield = ((monthlyRent * 12) / l.price) * 100;
    if (invest) {
      const target = project.yield_target ?? 6;
      if (grossYield >= target + 2) { score += 20; reasons.push({ tone: "good", text: `Rendement brut estimé ${pct1(grossYield)} %` }); }
      else if (grossYield >= target) { score += 12; reasons.push({ tone: "good", text: `Rendement brut estimé ${pct1(grossYield)} % (objectif atteint)` }); }
      else if (grossYield >= target - 1) { score += 3; reasons.push({ tone: "info", text: `Rendement brut estimé ${pct1(grossYield)} %, proche de l'objectif` }); }
      else { score -= 10; reasons.push({ tone: "bad", text: `Rendement brut estimé ${pct1(grossYield)} %, sous l'objectif de ${target} %` }); }
    }
  }

  // 3. Baisse de prix récente : vendeur plus ouvert à la négociation
  const recentDrop = l.priceDrops.filter((d) => !d.at || Date.now() - Date.parse(d.at) < 90 * 86400_000).reduce((sum, d) => sum + d.pct, 0);
  if (recentDrop <= -8) { score += 12; reasons.push({ tone: "good", text: `Prix baissé de ${Math.abs(Math.round(recentDrop))} % récemment` }); }
  else if (recentDrop <= -2) { score += 7; reasons.push({ tone: "good", text: `Prix baissé de ${Math.abs(Math.round(recentDrop))} % récemment` }); }

  // 4. Performance énergétique (interdictions de louer)
  if (l.dpe === "G") { score -= invest ? 10 : 4; reasons.push({ tone: "bad", text: "DPE G : interdit à la location sans travaux" }); }
  else if (l.dpe === "F") { score -= invest ? 5 : 2; reasons.push({ tone: "bad", text: "DPE F : interdit à la location dès 2028" }); }
  else if (l.dpe && "ABC".includes(l.dpe)) { score += 3; reasons.push({ tone: "good", text: `DPE ${l.dpe}` }); }
  if (l.condition === "TO_RENOVATE") reasons.push({ tone: "info", text: "Travaux à prévoir : à négocier" });

  // 5. Le même bien moins cher sur un autre site
  let cheaperElsewhere: RadarScore["metrics"]["cheaperElsewhere"] = null;
  const priced = l.sources.filter((s) => s.price);
  if (priced.length >= 2) {
    const sorted = [...priced].sort((a, b) => a.price! - b.price!);
    const savings = sorted[sorted.length - 1].price! - sorted[0].price!;
    if (savings >= 1000) {
      cheaperElsewhere = { slug: sorted[0].slug, url: sorted[0].url, price: sorted[0].price!, savings };
      reasons.push({ tone: "good", text: `${fmt(savings)} € moins cher sur ${sourceName(sorted[0].slug)}` });
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 75 ? "Très bonne affaire" : score >= 60 ? "Bonne affaire" : score >= 45 ? "Dans le marché" : "Cher";
  return { score, label, reasons, metrics: { priceM2, marketGapPct: gap, grossYield, monthlyRent, cheaperElsewhere } };
}

const SOURCE_NAMES: Record<string, string> = {
  leboncoin: "Leboncoin", seloger: "SeLoger", pap: "PAP", bienici: "Bien'ici", "bien-ici": "Bien'ici",
  logicimmo: "Logic-Immo", "logic-immo": "Logic-Immo", figaroimmo: "Figaro Immobilier", orpi: "Orpi",
  century21: "Century 21", laforet: "Laforêt", guyhoquet: "Guy Hoquet", superimmo: "Superimmo", paruvendu: "ParuVendu",
};
export function sourceName(slug: string): string {
  const key = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return SOURCE_NAMES[key] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** Texte « annonce » pour pré-remplir l'analyse (lu par la même mécanique que le bouton Bricky). */
export function listingToImportText(l: RadarListing): string {
  const typeLabel = l.type ? STREAM_TYPE_LABELS[l.type] ?? "" : "";
  return [
    l.title,
    typeLabel ? `Type de bien : ${typeLabel}` : "",
    l.price ? `Prix : ${fmt(l.price)} €` : "",
    l.surface ? `Surface habitable : ${l.surface} m²` : "",
    l.rooms ? `${l.rooms} pièces` : "",
    l.bedrooms ? `${l.bedrooms} chambres` : "",
    l.dpe ? `Classe énergie : ${l.dpe}` : "",
    l.city ? `${l.city}${l.postalCode ? ` ${l.postalCode}` : ""}` : "",
    l.description,
  ].filter(Boolean).join("\n");
}
