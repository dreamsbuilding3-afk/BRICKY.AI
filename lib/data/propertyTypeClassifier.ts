// Classification automatique du type de bien à partir d'un texte libre (titre,
// description, page d'annonce). Purement basé sur des mots-clés du vocabulaire
// immobilier français — aucune donnée n'est inventée, seulement détectée.
export type PropertyTypeCode =
  | "hotel"
  | "chateau"
  | "immeuble"
  | "penthouse"
  | "loft"
  | "duplex"
  | "chalet"
  | "local_commercial"
  | "terrain"
  | "parking"
  | "studio"
  | "maison"
  | "appartement";

export const PROPERTY_TYPE_LABELS: Record<PropertyTypeCode, string> = {
  hotel: "Hôtel",
  chateau: "Château / Manoir",
  immeuble: "Immeuble",
  penthouse: "Penthouse / Attique",
  loft: "Loft",
  duplex: "Duplex / Triplex",
  chalet: "Chalet",
  local_commercial: "Local commercial / Bureau",
  terrain: "Terrain",
  parking: "Parking / Box",
  studio: "Studio",
  maison: "Maison",
  appartement: "Appartement",
};

export type PropertyTypeMatch = {
  type: PropertyTypeCode;
  label: string;
  confidence: "high" | "medium";
  matched: string;
};

// Ordre important : du plus spécifique/rare au plus générique, pour éviter
// qu'un mot générique ("bien", "appartement") n'écrase un signal plus précis.
const RULES: Array<{ type: PropertyTypeCode; pattern: RegExp; confidence: "high" | "medium" }> = [
  { type: "hotel", pattern: /\bh[oô]tel\s+particulier\b|\bh[oô]tel[-\s]restaurant\b|\bfonds\s+de\s+commerce\s+h[oô]telier\b|\b\d{1,3}\s+chambres?\b.*\bh[oô]tel\b|\bh[oô]tel\b/i, confidence: "high" },
  { type: "chateau", pattern: /\bch[aâ]teau\b|\bmanoir\b|\bgentilhommi[eè]re\b/i, confidence: "high" },
  { type: "immeuble", pattern: /\bimmeuble\s+de\s+rapport\b|\bimmeuble\s+entier\b|\bimmeuble\b/i, confidence: "high" },
  { type: "penthouse", pattern: /\bpenthouse\b|\battique\b/i, confidence: "high" },
  { type: "loft", pattern: /\bloft\b/i, confidence: "high" },
  { type: "duplex", pattern: /\bduplex\b|\btriplex\b/i, confidence: "high" },
  { type: "chalet", pattern: /\bchalet\b/i, confidence: "high" },
  { type: "local_commercial", pattern: /\blocal\s+commercial\b|\bfonds\s+de\s+commerce\b|\bboutique\b|\bplateau\s+de\s+bureaux?\b|\bentrep[oô]t\b|\blocal\s+professionnel\b/i, confidence: "high" },
  { type: "terrain", pattern: /\bterrain\s+(à\s+b[aâ]tir|constructible)\b|\bparcelle\s+constructible\b/i, confidence: "high" },
  { type: "parking", pattern: /^\s*(place\s+de\s+)?parking\b|^\s*box\s+(ferm[eé]|garage)\b/i, confidence: "medium" },
  { type: "studio", pattern: /\bstudio\b/i, confidence: "high" },
  { type: "maison", pattern: /\bmaison\s+(individuelle|de\s+ville|de\s+ma[iî]tre|d[’']architecte)?\b|\bvilla\b|\bpavillon\b|\blong[eè]re\b|\bmas\s+provençal\b|\bferme\s+r[eé]nov[eé]e\b|\bbastide\b/i, confidence: "high" },
  { type: "appartement", pattern: /\bappartement\b|\b[TF][1-8]\b\s*(bis)?/i, confidence: "medium" },
];

export function classifyPropertyType(...texts: Array<string | null | undefined>): PropertyTypeMatch | null {
  const text = texts.filter(Boolean).join(" \n ");
  if (!text || !text.trim()) return null;

  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      return {
        type: rule.type,
        label: PROPERTY_TYPE_LABELS[rule.type],
        confidence: rule.confidence,
        matched: match[0].trim(),
      };
    }
  }
  return null;
}
