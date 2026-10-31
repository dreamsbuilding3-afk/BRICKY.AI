// Lecture d'une annonce à partir de son texte, sans IA : utilisée quand le texte
// arrive du bouton « Envoyer à Bricky », de l'extension Chrome ou d'un copier-
// coller, et que l'IA est indisponible. On ne relève que ce qui est écrit
// noir sur blanc ; un champ introuvable reste vide.

import { classifyPropertyType } from "./data/propertyTypeClassifier";
import { guessTransactionType } from "./brickyImport";

const NUM = String.raw`(\d{1,3}(?:[   .]\d{3})+|\d+)(?:[.,]\d{1,2})?`;

function toNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[   .]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function firstNumber(text: string, patterns: RegExp[], min = 0, max = Infinity): number | null {
  for (const re of patterns) {
    const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
    for (const m of text.matchAll(new RegExp(re.source, flags))) {
      const n = toNumber(m[1]);
      if (n !== null && n >= min && n <= max) return n;
    }
  }
  return null;
}

/** Lettre de classe (A à G) juste après un libellé : « Classe énergie D », « DPE : C »… */
function energyClass(text: string, labels: RegExp): string | null {
  const re = new RegExp(labels.source, "gi");
  for (const m of text.matchAll(re)) {
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 24);
    const hit = after.match(/^[^A-Za-z0-9]{0,12}(?:[Cc]lasse\s*)?([A-G])(?![A-Za-zà-üÀ-Ü0-9])/);
    if (hit && !/^\s+(?:venir|vierge|non|en cours)/i.test(after.slice(hit[0].length))) return hit[1];
  }
  return null;
}

// Petits mots qui ne font pas partie du nom d'une ville sur les sites d'annonces.
const CITY_STOP = /^(voir|afficher|carte|plan|france|appartement|maison|studio|vente|location|achat|r[ée]f|annonce|prix|vendu|neuf|dpe|ges)$/i;

function cleanCity(raw: string): string | null {
  const words = raw.trim().split(/\s+/);
  const kept: string[] = [];
  for (const w of words) {
    if (kept.length >= 4 || CITY_STOP.test(w)) break;
    kept.push(w);
  }
  const city = kept.join(" ").replace(/[-' ]+$/, "");
  return city.length >= 2 ? city : null;
}

function cityAndPostcode(text: string, ldText: string): { city: string | null; postal_code: string | null } {
  const ldCity = ldText.match(/"addressLocality"\s*:\s*"([^"]{2,60})"/)?.[1] ?? null;
  const ldCp = ldText.match(/"postalCode"\s*:\s*"?(\d{5})"?/)?.[1] ?? null;
  if (ldCity) return { city: ldCity.trim(), postal_code: ldCp };
  const CITY = String.raw`([A-ZÀ-Ü][A-Za-zà-üÀ-Ü'\-]+(?: (?:[A-ZÀ-Ü][A-Za-zà-üÀ-Ü'\-]+|sur|sous|en|de|du|des|la|le|les|lès|lez|d'[A-Za-zà-ü]+))*)`;
  const patterns: [RegExp, number, number][] = [
    [new RegExp(CITY + String.raw`[ \t]*\((\d{5})\)`), 1, 2],
    [new RegExp(String.raw`\b((?:0[1-9]|[1-8]\d|9[0-8])\d{3})[ \t]+` + CITY), 2, 1],
    [new RegExp(CITY + String.raw`[ \t]+((?:0[1-9]|[1-8]\d|9[0-8])\d{3})\b`), 1, 2],
  ];
  for (const [re, ci, pi] of patterns) {
    for (const m of text.matchAll(new RegExp(re.source, "g"))) {
      const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 4);
      if (/^\s*(?:€|euros?)/i.test(after)) continue;
      const city = cleanCity(m[ci]);
      if (city && !/^(euros?|eur|m²|m2)$/i.test(city)) return { city, postal_code: m[pi] };
    }
  }
  return { city: null, postal_code: ldCp };
}

export type TextExtraction = {
  source_url: string;
  source_domain: string;
  extracted: Record<string, string | number | null>;
  extraction: { status: "partial"; method: "regex"; fields_found: number; note: string };
};

export function extractFromListingText(rawText: string, url = ""): TextExtraction {
  const text = rawText.replace(/\r/g, "").replace(/[ \t  ]+\n/g, "\n").slice(0, 60_000);
  // Données structurées (JSON-LD) recopiées par le bouton : plus fiables que le texte.
  const ldText = text.slice(0, 12_000);
  const kind = guessTransactionType(url, text);

  const ldPrice = toNumber(ldText.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/)?.[1]?.split(".")[0]);
  const ldRooms = toNumber(ldText.match(/"numberOfRooms"\s*:\s*"?(\d{1,2})"?/)?.[1]);
  const ldSurface = toNumber(ldText.match(/"floorSize"[^}]{0,80}"value"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/)?.[1]);

  // Prix de vente : libellé « Prix » d'abord, sinon le premier montant crédible
  // (hors honoraires, frais, charges, taxe, prix au m²).
  let price: number | null = null;
  if (kind !== "location") {
    price = ldPrice && ldPrice >= 10_000 ? ldPrice : firstNumber(text, [new RegExp(String.raw`prix(?: de vente)?(?: FAI| net vendeur| honoraires inclus)?\s*[:\-]?\s*` + NUM + String.raw`\s*(?:€|euros?)`, "i")], 10_000, 50_000_000);
    if (price === null) {
      for (const m of text.matchAll(new RegExp(NUM + String.raw`\s*(?:€|euros?)(?!\s*(?:\/|par)\s*(?:mois|m²|m2|an))`, "gi"))) {
        const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0).toLowerCase();
        if (/honoraires|notaire|frais|charges?|taxe|loyer|d[ée]p[ôo]t|mensualit|estimation|[ée]conomis/.test(before)) continue;
        const n = toNumber(m[1]);
        if (n !== null && n >= 10_000 && n <= 50_000_000) { price = n; break; }
      }
    }
  }

  const surface = ldSurface ?? (() => {
    const labelled = firstNumber(text, [new RegExp(String.raw`surface(?: habitable| loi carrez| totale)?(?: \(m²\))?\s*[:\-]?\s*` + NUM + String.raw`\s*m(?:²|2)(?![A-Za-z0-9])`, "i")], 8, 5000);
    if (labelled) return labelled;
    for (const m of text.matchAll(new RegExp(NUM + String.raw`\s*m(?:²|2)(?![A-Za-z0-9])`, "gi"))) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0).toLowerCase();
      if (/terrain|jardin|parcelle|balcon|terrasse|cave|€/.test(before)) continue;
      const n = toNumber(m[1]);
      if (n !== null && n >= 8 && n <= 5000) return n;
    }
    return null;
  })();

  const rooms = ldRooms ?? firstNumber(text, [/(\d{1,2})\s*pi[eè]ces?\b/i, /(?:nombre de )?pi[eè]ces?\s*[:\-]?\s*(\d{1,2})\b/i, /\b[TF](\d{1,2})\b/], 1, 30);
  const bedrooms = firstNumber(text, [/(\d{1,2})\s*chambres?\b/i, /chambres?\s*[:\-]?\s*(\d{1,2})\b/i], 0, 20);

  const dpe = energyClass(text, /classe [ée]nerg[ée]tique|classe [ée]nergie|consommation [ée]nerg[ée]tique|performance [ée]nerg[ée]tique|\bDPE\b/);
  const ges = energyClass(text, /classe climat|[ée]missions? de gaz(?: à effet de serre)?|\bindice GES\b|\bGES\b/);

  const rentLabelled = firstNumber(text, [new RegExp(String.raw`loyer(?: mensuel| actuel| hors charges| charges comprises| HC| CC)?\s*[:\-]?\s*` + NUM + String.raw`\s*(?:€|euros?)`, "i")], 100, 20_000);
  const rentPerMonth = kind === "location" ? firstNumber(text, [new RegExp(NUM + String.raw`\s*(?:€|euros?)\s*(?:\/\s*mois|par mois|CC|C\.C\.|charges comprises|HC|hors charges)`, "i")], 100, 20_000) : null;
  const monthlyRent = rentLabelled ?? rentPerMonth;

  const propertyTax = firstNumber(text, [new RegExp(String.raw`taxe fonci[eè]re(?: annuelle)?\s*[:\-]?\s*` + NUM + String.raw`\s*(?:€|euros?)`, "i")], 50, 50_000);

  let condoCharges: number | null = null;
  const chargesMatch = text.match(new RegExp(String.raw`charges (?:de copropri[ée]t[ée]|annuelles|courantes|de copro)[^\d€]{0,30}` + NUM + String.raw`\s*(?:€|euros?)\s*(\/\s*(?:an|mois)|par (?:an|mois))?`, "i"));
  if (chargesMatch) {
    const n = toNumber(chargesMatch[1]);
    if (n !== null) condoCharges = /mois/i.test(chargesMatch[2] ?? "") ? n * 12 : n;
  }

  const { city, postal_code } = cityAndPostcode(text, ldText);

  const ldName = ldText.match(/"name"\s*:\s*"([^"]{10,140})"/)?.[1] ?? null;
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length >= 10 && l.length <= 160 && !l.startsWith("{")) ?? "";
  const title = (ldName ?? firstLine).replace(/\s*[|–-]\s*(leboncoin|seloger|pap|bien'ici|logic-immo|figaro immobilier).*$/i, "").trim();
  // Le titre d'abord : « immeuble bien entretenu » dans la description ne fait pas d'un appartement un immeuble.
  const propertyType = classifyPropertyType(title) ?? classifyPropertyType(title, text.slice(0, 4000));

  const values = [price, surface, rooms, bedrooms, dpe, ges, city, monthlyRent, propertyTax, condoCharges, propertyType?.type];
  let domain = "texte collé";
  try { if (url) domain = new URL(url).hostname; } catch {}

  return {
    source_url: url,
    source_domain: domain,
    extracted: {
      title: title || null,
      description: text.replace(/\s+/g, " ").slice(0, 600),
      price,
      surface_m2: surface,
      rooms,
      bedrooms,
      dpe_class: dpe,
      ges_class: ges,
      city,
      postal_code,
      monthly_rent: monthlyRent,
      annual_property_tax: propertyTax,
      annual_condo_charges: condoCharges,
      property_type: propertyType?.type ?? null,
      property_type_label: propertyType?.label ?? null,
      property_type_confidence: propertyType?.confidence ?? null,
    },
    extraction: {
      status: "partial",
      method: "regex",
      fields_found: values.filter((v) => v !== null && v !== undefined && v !== "").length,
      note: "Lecture directe du texte de l'annonce (sans IA). Bricky n'invente aucune valeur : vérifie chaque champ avant analyse.",
    },
  };
}
