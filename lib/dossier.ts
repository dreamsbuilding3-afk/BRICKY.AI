// Dossier complet : plusieurs fichiers d'un même bien (annonce, captures, DPE,
// taxe foncière, PV d'AG, bail…) fusionnés en une seule fiche, avec la liste des
// pièces encore à demander à l'agence.

export type DocKind = "annonce" | "capture" | "dpe" | "diagnostics" | "taxe_fonciere" | "pv_ag" | "charges" | "reglement" | "bail" | "plan" | "autre";

export const DOC_LABELS: Record<DocKind, string> = {
  annonce: "Annonce",
  capture: "Capture d'écran",
  dpe: "DPE",
  diagnostics: "Diagnostics techniques",
  taxe_fonciere: "Taxe foncière",
  pv_ag: "PV d'assemblée générale",
  charges: "Relevé de charges de copropriété",
  reglement: "Règlement de copropriété",
  bail: "Bail en cours",
  plan: "Plan du logement",
  autre: "Autre document",
};

// Ce qu'on demande à l'agence, formulé comme dans un e-mail.
const REQUEST_LABELS: Partial<Record<DocKind, string>> = {
  dpe: "le diagnostic de performance énergétique (DPE) complet",
  diagnostics: "les diagnostics techniques (amiante, plomb, électricité, gaz, état des risques)",
  taxe_fonciere: "le dernier avis de taxe foncière",
  pv_ag: "les procès-verbaux des 3 dernières assemblées générales de copropriété",
  charges: "le relevé des charges de copropriété de l'année écoulée",
  bail: "le bail en cours et le montant du loyer actuel",
};

const RULES: [DocKind, RegExp][] = [
  ["pv_ag", /proc[eè]s[- ]verbal|assembl[ée]e g[ée]n[ée]rale|\bPV\b.{0,20}\bAG\b/i],
  ["reglement", /r[eè]glement de copropri[ée]t[ée]|[ée]tat descriptif de division/i],
  ["charges", /appel de fonds|relev[ée] (?:g[ée]n[ée]ral )?des charges|r[ée]partition des charges|budget pr[ée]visionnel/i],
  ["taxe_fonciere", /taxe fonci[eè]re|avis d['’]imp[oô]t.{0,40}fonci/i],
  ["dpe", /diagnostic de performance [ée]nerg[ée]tique|\bDPE\b.{0,80}(?:kWh|classe|[ée]tiquette)/i],
  ["diagnostics", /amiante|constat de risque d['’]exposition au plomb|installation int[ée]rieure d['’][ée]lectricit[ée]|[ée]tat des risques|\bERP\b|termites|dossier de diagnostic technique/i],
  ["bail", /contrat de (?:location|bail)|\bbail\b.{0,60}(?:locataire|loyer)|le bailleur/i],
  ["plan", /\bplan\b.{0,30}(?:logement|appartement|maison|niveau|[ée]tage)|[ée]chelle\s*1\s*[:/]/i],
  ["annonce", /[àa] vendre|prix de vente|honoraires|mandat|r[ée]f[ée]rence de l['’]annonce|agence immobili[eè]re|pi[eè]ces?\b.{0,40}m²/i],
];

/** Type de pièce, d'après le nom du fichier puis son contenu. */
export function detectDocumentKind(fileName: string, text = ""): DocKind {
  const name = fileName.toLowerCase();
  if (/\bdpe\b/.test(name)) return "dpe";
  if (/taxe|fonci/.test(name)) return "taxe_fonciere";
  if (/\bpv\b|\bag\b|assembl/.test(name)) return "pv_ag";
  if (/bail|location/.test(name)) return "bail";
  if (/diag|amiante|plomb|erp/.test(name)) return "diagnostics";
  if (/charge|appel.?de.?fonds/.test(name)) return "charges";
  if (/r[eè]glement|copro/.test(name)) return "reglement";
  if (/plan/.test(name)) return "plan";
  const sample = text.slice(0, 6000);
  for (const [kind, re] of RULES) if (re.test(sample)) return kind;
  return "autre";
}

const COPRO_TYPES = new Set(["appartement", "studio", "penthouse", "loft", "duplex"]);

/** Pièces utiles qui manquent encore au dossier. */
export function missingDocuments(present: DocKind[], ctx: { propertyType?: string | null; rented?: boolean }): DocKind[] {
  const have = new Set(present);
  const needed: DocKind[] = ["dpe", "diagnostics", "taxe_fonciere"];
  if (ctx.propertyType && COPRO_TYPES.has(ctx.propertyType)) needed.push("pv_ag", "charges");
  if (ctx.rented) needed.push("bail");
  return needed.filter((k) => !have.has(k));
}

/** Texte prêt à envoyer à l'agence pour réclamer les pièces manquantes. */
export function agencyRequestText(missing: DocKind[], propertyTitle?: string): string {
  const items = missing.map((k) => REQUEST_LABELS[k]).filter(Boolean) as string[];
  const bien = propertyTitle?.trim() ? ` (${propertyTitle.trim().slice(0, 80)})` : "";
  return [
    "Bonjour,",
    "",
    `Je suis intéressé(e) par le bien${bien} et j'étudie le dossier avant de faire une offre.`,
    "Pourriez-vous me transmettre :",
    ...items.map((i) => `- ${i}`),
    "",
    "Merci d'avance, je reviens vers vous rapidement.",
    "Bien cordialement,",
  ].join("\n");
}

type Extraction = { extracted?: Record<string, unknown>; extra?: Record<string, string> };
export type DossierPiece = { name: string; kind: DocKind; data: Extraction; fields: number };

// Pour chaque champ, la pièce la plus fiable passe en premier.
const PREFERRED: Record<string, DocKind[]> = {
  dpe_class: ["dpe", "diagnostics", "annonce", "capture"],
  ges_class: ["dpe", "diagnostics", "annonce", "capture"],
  annual_property_tax: ["taxe_fonciere", "annonce", "capture"],
  annual_condo_charges: ["charges", "pv_ag", "annonce", "capture"],
  monthly_rent: ["bail", "annonce", "capture"],
  surface_m2: ["annonce", "capture", "dpe", "diagnostics", "plan"],
};
const LISTING_FIRST: DocKind[] = ["annonce", "capture"];
// Champs qui n'ont de sens que dans une annonce (un PV d'AG ou un DPE contiennent
// d'autres montants qu'il ne faut pas prendre pour un prix de vente).
const LISTING_ONLY = new Set(["price", "title", "description", "rooms", "bedrooms", "agency_fees"]);
const LISTING_KINDS = new Set<DocKind>(["annonce", "capture", "autre"]);

const filled = (v: unknown) => v !== null && v !== undefined && v !== "";

/** Fusionne les extractions de chaque pièce : une seule fiche, sans écraser une valeur fiable. */
export function mergeDossier(pieces: DossierPiece[]): Extraction & { sources: Record<string, string> } {
  const extracted: Record<string, unknown> = {};
  const extra: Record<string, string> = {};
  const sources: Record<string, string> = {};
  const keys = new Set<string>();
  pieces.forEach((p) => Object.keys(p.data.extracted ?? {}).forEach((k) => keys.add(k)));
  for (const key of keys) {
    const pref = PREFERRED[key] ?? LISTING_FIRST;
    const ordered = [...pieces].sort((a, b) => rank(pref, a.kind) - rank(pref, b.kind));
    const hit = ordered.find((p) => filled(p.data.extracted?.[key]) && (!LISTING_ONLY.has(key) || LISTING_KINDS.has(p.kind)));
    if (hit) {
      extracted[key] = hit.data.extracted![key];
      sources[key] = hit.name;
    }
  }
  for (const p of pieces) {
    for (const [k, v] of Object.entries(p.data.extra ?? {})) {
      if (filled(v) && !filled(extra[k])) extra[k] = v;
    }
  }
  return { extracted, extra, sources };
}

function rank(pref: DocKind[], kind: DocKind) {
  const i = pref.indexOf(kind);
  return i === -1 ? pref.length : i;
}
