// Extraction d'annonce immobilière par IA (API Claude).
//
// Principe : on envoie à Claude le texte de l'annonce, une ou plusieurs captures
// d'écran, un PDF, ou un lien (lu par l'outil serveur web_fetch d'Anthropic).
// Claude renvoie les champs du formulaire Bricky via un outil "annonce" dont
// AUCUN champ n'est obligatoire : un champ absent de l'annonce reste vide au lieu
// d'être inventé.
//
// Coût (tarifs Haiku 5.5 : 0,10 $ / M tokens en entrée, 0,50 $ / M en sortie) :
// ~0,05 centime pour un texte collé, ~0,3 centime pour une page web. Sonnet 5.5
// n'est appelé qu'en secours si le prix ou la surface manquent.

import { PROPERTY_TYPE_LABELS, type PropertyTypeCode } from "@/lib/data/propertyTypeClassifier";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const PRIMARY_MODEL = process.env.BRICKY_AI_MODEL || "claude-haiku-5-5";
export const FALLBACK_MODEL = process.env.BRICKY_AI_FALLBACK_MODEL || "claude-sonnet-5-5";
const FALLBACK_ENABLED = process.env.BRICKY_AI_FALLBACK !== "off";

// Limite la taille du contenu envoyé pour rester sous le palier 100k tokens de
// Haiku 5.5 (au-delà, tout le prompt est facturé 5x plus cher).
const MAX_TEXT_CHARS = 60_000;
const WEB_FETCH_MAX_CONTENT_TOKENS = 30_000;

export function isAiExtractionEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const GRADE = { type: "string", enum: ["A", "B", "C", "D", "E", "F", "G"] };
const BOOL = { type: "boolean" };

// Champs principaux du formulaire (Payload dans app/analyze/page.tsx).
const MAIN_PROPERTIES = {
  title: { type: "string", description: "Titre court de l'annonce" },
  city: { type: "string", description: "Commune du bien" },
  postal_code: { type: "string", description: "Code postal à 5 chiffres" },
  address: { type: "string", description: "Adresse ou rue si elle est écrite" },
  property_type: { type: "string", enum: Object.keys(PROPERTY_TYPE_LABELS) },
  price: { type: "number", description: "Prix de vente affiché en euros (frais d'agence inclus si c'est ce qui est affiché)" },
  surface_m2: { type: "number", description: "Surface habitable en m²" },
  rooms: { type: "integer" },
  bedrooms: { type: "integer" },
  dpe_class: GRADE,
  ges_class: GRADE,
  monthly_rent: { type: "number", description: "Loyer mensuel actuel ou annoncé, uniquement s'il est écrit (bien loué, loyer HC)" },
  annual_property_tax: { type: "number", description: "Taxe foncière annuelle en euros" },
  annual_condo_charges: { type: "number", description: "Charges de copropriété ANNUELLES en euros (convertir si mensuelles ou trimestrielles)" },
  condo_procedure: { type: "boolean", description: "true si l'annonce mentionne une procédure en cours dans la copropriété" },
  renovation_budget: { type: "number", description: "Montant de travaux chiffré dans l'annonce" },
};

// Champs complémentaires (blocs repliables "extra" du formulaire).
const EXTRA_PROPERTIES = {
  bathrooms: { type: "integer" },
  toilets: { type: "integer" },
  parking_spaces: { type: "integer" },
  exterior_surface_m2: { type: "number" },
  has_elevator: BOOL,
  has_balcony: BOOL,
  has_terrace: BOOL,
  has_garden: BOOL,
  has_pool: BOOL,
  has_garage: BOOL,
  has_cellar: BOOL,
  is_furnished: BOOL,
  exposure: { type: "string", enum: ["Nord", "Sud", "Est", "Ouest", "Nord-Sud", "Est-Ouest", "Sud-Est", "Sud-Ouest"] },
  overall_condition: { type: "string", enum: ["Neuf", "Bon état", "À rafraîchir", "À rénover", "À restructurer"] },
  view_type: { type: "string" },
  neighborhood: { type: "string" },
  energy_consumption_kwh: { type: "number", description: "Consommation énergétique totale en kWh/an si écrite" },
  energy_cost_annual_estimate: { type: "number", description: "Estimation des coûts annuels d'énergie (milieu de fourchette si une fourchette est donnée)" },
  heating_type: { type: "string" },
  heating_mode: { type: "string", enum: ["Individuel", "Collectif"] },
  agency_fees: { type: "number", description: "Honoraires d'agence à la charge de l'acquéreur, en euros" },
  major_works_planned: { type: "string", description: "Gros travaux votés ou prévus en copropriété" },
};

export type ExtractedMain = {
  title: string | null;
  city: string | null;
  postal_code: string | null;
  address: string | null;
  property_type: PropertyTypeCode | null;
  property_type_label: string | null;
  price: number | null;
  surface_m2: number | null;
  rooms: number | null;
  bedrooms: number | null;
  dpe_class: string | null;
  ges_class: string | null;
  monthly_rent: number | null;
  annual_property_tax: number | null;
  annual_condo_charges: number | null;
  condo_procedure: boolean | null;
  renovation_budget: number | null;
};

export type AiExtractionResult = {
  extracted: ExtractedMain;
  extra: Record<string, string>;
  fields_found: string[];
  missing_critical: string[];
  model: string;
  usage: { input_tokens: number; output_tokens: number; cost_usd: number };
  fetched_by: "server" | "claude_web_fetch" | "none";
};

export type AiInput =
  | { kind: "text"; text: string; sourceUrl?: string }
  | { kind: "images"; images: { mediaType: string; base64: string }[]; text?: string }
  | { kind: "pdf"; base64: string }
  | { kind: "url"; url: string };

const TOOL = {
  name: "annonce",
  description: "Enregistre les données de l'annonce immobilière. Ne remplis QUE les champs explicitement présents dans l'annonce.",
  input_schema: {
    type: "object",
    properties: { ...MAIN_PROPERTIES, ...EXTRA_PROPERTIES },
  },
};

const SYSTEM_PROMPT = [
  "Tu es l'extracteur d'annonces de Bricky, un outil d'analyse d'investissement locatif en France.",
  "Tu lis une annonce immobilière (texte, capture d'écran, PDF ou page web) et tu appelles l'outil `annonce`.",
  "Règles strictes :",
  "- Remplis uniquement ce qui est écrit ou clairement visible. N'estime, ne déduis et n'invente rien.",
  "- Si une information est absente ou ambiguë, omets le champ.",
  "- Montants en euros, nombres sans espaces ni symboles.",
  "- Convertis les charges de copropriété en montant annuel.",
  "- Ignore les publicités, les annonces similaires et les biens recommandés de la page.",
].join("\n");

const INSTRUCTION = "Extrais les données de cette annonce avec l'outil `annonce`. Laisse vide tout champ absent.";

// Tarifs par million de tokens (USD) — pour le suivi de coût, voir
// https://platform.claude.com/docs/en/about-claude/pricing
const PRICING: Record<string, { input: number; output: number; longInput?: number; longOutput?: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longInput: 0.5, longOutput: 2.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

function costUsd(model: string, inputTokens: number, outputTokens: number) {
  const p = PRICING[model];
  if (!p) return 0;
  const long = inputTokens > 100_000 && p.longInput;
  const inPrice = long ? p.longInput! : p.input;
  const outPrice = long ? p.longOutput! : p.output;
  return (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000;
}

type ContentBlock = Record<string, unknown> & { type: string };

function buildUserContent(input: AiInput): ContentBlock[] {
  switch (input.kind) {
    case "text": {
      const source = input.sourceUrl ? `Source : ${input.sourceUrl}\n\n` : "";
      return [{ type: "text", text: `${INSTRUCTION}\n\n${source}<annonce>\n${input.text.slice(0, MAX_TEXT_CHARS)}\n</annonce>` }];
    }
    case "images":
      return [
        ...input.images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } })),
        { type: "text", text: input.text ? `${INSTRUCTION}\n\nTexte complémentaire :\n${input.text.slice(0, MAX_TEXT_CHARS)}` : INSTRUCTION },
      ];
    case "pdf":
      return [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } },
        { type: "text", text: INSTRUCTION },
      ];
    case "url":
      return [{ type: "text", text: `Lis cette annonce avec l'outil web_fetch, puis appelle l'outil \`annonce\`.\nAnnonce : ${input.url}` }];
  }
}

type ClaudeResponse = {
  content: ContentBlock[];
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
};

async function callClaude(body: Record<string, unknown>): Promise<ClaudeResponse> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Erreur API Claude (${response.status})`;
    throw new AiServiceError(message, response.status);
  }
  return data as ClaudeResponse;
}

class WebFetchFailed extends Error {}

/**
 * Erreur côté service IA (crédit épuisé, clé invalide, surcharge…) : ce n'est
 * pas la faute de l'annonce. Les routes repassent alors sur l'extraction
 * classique au lieu de bloquer l'utilisateur.
 */
export class AiServiceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const AI_UNAVAILABLE_MESSAGE =
  "Le remplissage automatique est momentanément indisponible. Complète les champs à la main, ou réessaie dans quelques minutes.";

async function runExtraction(model: string, input: AiInput) {
  const isUrl = input.kind === "url";
  const tools: Record<string, unknown>[] = [TOOL];
  if (isUrl) {
    tools.unshift({
      type: "web_fetch_20260318",
      name: "web_fetch",
      max_uses: 2,
      max_content_tokens: WEB_FETCH_MAX_CONTENT_TOKENS,
    });
  }

  const messages: { role: string; content: ContentBlock[] }[] = [{ role: "user", content: buildUserContent(input) }];
  let inputTokens = 0;
  let outputTokens = 0;
  let fetchError: string | null = null;

  // Boucle courte : un appel suffit en général ; avec web_fetch, l'API peut
  // rendre la main (pause_turn) avant que Claude n'ait appelé l'outil annonce.
  for (let turn = 0; turn < 3; turn++) {
    const res = await callClaude({
      model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools,
      tool_choice: isUrl ? { type: "any" } : { type: "tool", name: "annonce" },
      messages,
    });
    inputTokens += (res.usage?.input_tokens ?? 0) + (res.usage?.cache_read_input_tokens ?? 0) + (res.usage?.cache_creation_input_tokens ?? 0);
    outputTokens += res.usage?.output_tokens ?? 0;

    for (const block of res.content) {
      if (block.type === "web_fetch_tool_result") {
        const content = block.content as { type?: string; error_code?: string } | undefined;
        if (content?.type === "web_fetch_tool_result_error") fetchError = content.error_code ?? "url_not_accessible";
      }
    }

    const toolUse = res.content.find((b) => b.type === "tool_use" && b.name === "annonce");
    if (toolUse) {
      return { raw: (toolUse.input ?? {}) as Record<string, unknown>, inputTokens, outputTokens };
    }
    if (fetchError) throw new WebFetchFailed(fetchError);
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }

  if (isUrl) throw new WebFetchFailed(fetchError ?? "no_result");
  throw new Error("L'IA n'a pas renvoyé de données exploitables.");
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function grade(v: unknown): string | null {
  const s = str(v)?.toUpperCase();
  return s && /^[A-G]$/.test(s) ? s : null;
}

function normalize(raw: Record<string, unknown>) {
  const type = str(raw.property_type) as PropertyTypeCode | null;
  const validType = type && type in PROPERTY_TYPE_LABELS ? type : null;
  const extracted: ExtractedMain = {
    title: str(raw.title),
    city: str(raw.city),
    postal_code: str(raw.postal_code),
    address: str(raw.address),
    property_type: validType,
    property_type_label: validType ? PROPERTY_TYPE_LABELS[validType] : null,
    price: num(raw.price),
    surface_m2: num(raw.surface_m2),
    rooms: num(raw.rooms),
    bedrooms: num(raw.bedrooms),
    dpe_class: grade(raw.dpe_class),
    ges_class: grade(raw.ges_class),
    monthly_rent: num(raw.monthly_rent),
    annual_property_tax: num(raw.annual_property_tax),
    annual_condo_charges: num(raw.annual_condo_charges),
    condo_procedure: typeof raw.condo_procedure === "boolean" ? raw.condo_procedure : null,
    renovation_budget: num(raw.renovation_budget),
  };

  // Les champs "extra" du formulaire sont stockés en chaînes ("true"/"false" pour
  // les booléens, valeur exacte de l'option pour les listes).
  const extra: Record<string, string> = {};
  for (const [key, schema] of Object.entries(EXTRA_PROPERTIES)) {
    const value = raw[key];
    if (value === undefined || value === null || value === "") continue;
    const s = schema as { type: string; enum?: string[] };
    if (s.type === "boolean" && typeof value === "boolean") extra[key] = String(value);
    else if ((s.type === "number" || s.type === "integer") && num(value) !== null) extra[key] = String(num(value));
    else if (s.type === "string" && typeof value === "string" && value.trim()) {
      if (!s.enum || s.enum.includes(value.trim())) extra[key] = value.trim();
    }
  }

  const fields_found = [
    ...Object.entries(extracted).filter(([k, v]) => k !== "property_type_label" && v !== null).map(([k]) => k),
    ...Object.keys(extra),
  ];
  const missing_critical = (["price", "surface_m2", "city"] as const).filter((k) => extracted[k] === null);
  return { extracted, extra, fields_found, missing_critical };
}

/**
 * Extrait les données d'une annonce. Essaie d'abord le modèle économique
 * (Haiku), puis le modèle de secours (Sonnet) si le prix ou la surface manquent.
 * Lève WebFetchFailed si le lien n'a pas pu être lu par Claude.
 */
export async function extractListingWithAi(input: AiInput, fetchedBy: AiExtractionResult["fetched_by"] = "none"): Promise<AiExtractionResult> {
  const first = await runExtraction(PRIMARY_MODEL, input);
  let best = { ...normalize(first.raw), model: PRIMARY_MODEL };
  let inputTokens = first.inputTokens;
  let outputTokens = first.outputTokens;
  let cost = costUsd(PRIMARY_MODEL, first.inputTokens, first.outputTokens);

  const needsFallback = best.extracted.price === null || best.extracted.surface_m2 === null;
  if (needsFallback && FALLBACK_ENABLED && FALLBACK_MODEL !== PRIMARY_MODEL) {
    try {
      const second = await runExtraction(FALLBACK_MODEL, input);
      const candidate = normalize(second.raw);
      inputTokens += second.inputTokens;
      outputTokens += second.outputTokens;
      cost += costUsd(FALLBACK_MODEL, second.inputTokens, second.outputTokens);
      if (candidate.fields_found.length > best.fields_found.length) best = { ...candidate, model: FALLBACK_MODEL };
    } catch {
      // On garde le résultat du premier modèle.
    }
  }

  return {
    ...best,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: Math.round(cost * 100000) / 100000 },
    fetched_by: input.kind === "url" ? "claude_web_fetch" : fetchedBy,
  };
}

export { WebFetchFailed };

/** Transforme une page HTML en texte lisible pour l'IA (JSON-LD conservé). */
export function htmlToListingText(html: string): string {
  const jsonLd = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim())
    .join("\n")
    .slice(0, 15_000);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return [`Titre : ${title}`, description && `Description : ${description}`, jsonLd && `Données structurées :\n${jsonLd}`, `Contenu :\n${body}`]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_TEXT_CHARS);
}
