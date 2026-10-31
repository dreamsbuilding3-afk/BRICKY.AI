import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { classifyPropertyType } from "@/lib/data/propertyTypeClassifier";
import { AI_UNAVAILABLE_MESSAGE, askClaudeWithTool, extractListingWithAi, isAiExtractionEnabled } from "@/lib/ai/listingExtractor";
import { COPRO_INSTRUCTION, COPRO_SYSTEM, COPRO_TOOL, coproFromAi, scanCoproText, type CoproFindings } from "@/lib/copro";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/auth/requireUser";
import { detectDocumentKind, type DocKind } from "@/lib/dossier";

export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function aiJson(result: Awaited<ReturnType<typeof extractListingWithAi>>, sourceUrl: string, sourceDomain: string, documentKind: DocKind) {
  return NextResponse.json({
    document_kind: documentKind,
    source_url: sourceUrl,
    source_domain: sourceDomain,
    extracted: result.extracted,
    extra: result.extra,
    extraction: {
      status: result.missing_critical.length ? "partial" : "complete",
      method: "ai",
      model: result.model,
      fields_found: result.fields_found.length,
      fields: result.fields_found,
      missing_critical: result.missing_critical,
      cost_usd: result.usage.cost_usd,
      note: "Données lues par l'IA dans le fichier. Un champ absent reste vide : Bricky n'invente aucune valeur.",
    },
  });
}

// PV d'AG / relevé de charges : travaux, impayés, procédures. IA si possible, sinon mots-clés.
async function readCopro(kind: DocKind, text: string, bytes: Uint8Array): Promise<CoproFindings | null> {
  if (kind !== "pv_ag" && kind !== "charges" && kind !== "reglement") return null;
  if (isAiExtractionEnabled()) {
    try {
      const res = await askClaudeWithTool({
        system: COPRO_SYSTEM,
        tool: COPRO_TOOL,
        instruction: COPRO_INSTRUCTION,
        ...(text.length >= 200 ? { text } : { pdfBase64: Buffer.from(bytes).toString("base64") }),
      });
      return coproFromAi(res.raw);
    } catch (error) {
      console.error("[extract-file] AI copro reading failed", error);
    }
  }
  return text.length >= 200 ? scanCoproText(text) : null;
}

const PRICE_RE = /(?:prix|price)[^\d]{0,40}([\d\s.,]+)\s*€?/i;
const SURFACE_RE = /(?:surface|area)[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*m(?:²|2)/i;
const ROOMS_RE = /(?:pi[eè]ces?|rooms?)[^\d]{0,20}(\d+)/i;
const BEDROOMS_RE = /(?:chambres?)[^\d]{0,20}(\d+)/i;
const RENT_RE = /(?:loyer|rent)[^\d]{0,40}([\d\s.,]+)\s*€?/i;
const DPE_RE = /\bDPE\b[^A-G]{0,20}\b([A-G])\b/i;
const GES_RE = /\bGES\b[^A-G]{0,20}\b([A-G])\b/i;
const TAX_RE = /(?:montant (?:de (?:votre|la) )?(?:imp[oô]t|cotisation)|total (?:des )?cotisations|montant (?:net )?[àa] payer)[^\d]{0,40}([\d\s.,]+)\s*€?/i;
const CITY_RE = /\b(\d{5})\s+([A-ZÀ-Ü][A-Za-zà-üÀ-Ü' -]{2,40})\b/;

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").replace(/&nbsp;/gi, " ").trim();
}

function numberFrom(value?: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const n = Number(normalized.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstMatch(text: string, regex: RegExp) {
  return text.match(regex)?.[1] ?? null;
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "properties.extract_file", maxRequests: 30, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  const authResponse = await requireUser(request);
  if (authResponse) return authResponse;

  try {
    const formData = await request.formData();
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    const file = files[0];
    if (!file) {
      return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (15 Mo max)." }, { status: 413 });
    }

    // Captures d'écran : lues directement par l'IA (vision).
    const images = files.filter((f) => IMAGE_TYPES.includes(f.type));
    if (images.length > 0) {
      if (!isAiExtractionEnabled()) {
        return NextResponse.json({ error: "La lecture des captures d'écran n'est pas encore activée sur ce serveur." }, { status: 503 });
      }
      if (images.length > MAX_IMAGES) {
        return NextResponse.json({ error: `${MAX_IMAGES} captures maximum par analyse.` }, { status: 400 });
      }
      if (images.some((img) => img.size > MAX_IMAGE_BYTES)) {
        return NextResponse.json({ error: "Chaque capture doit faire moins de 5 Mo." }, { status: 413 });
      }
      const encoded = await Promise.all(
        images.map(async (img) => ({ mediaType: img.type, base64: Buffer.from(await img.arrayBuffer()).toString("base64") })),
      );
      try {
        const result = await extractListingWithAi({ kind: "images", images: encoded }, "none");
        return aiJson(result, images.map((i) => i.name).join(", "), images.length > 1 ? `${images.length} captures d'écran` : "capture d'écran", "capture");
      } catch (error) {
        console.error("[extract-file] AI image extraction failed", error);
        return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE, code: "ai_unavailable" }, { status: 503 });
      }
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        { error: "Formats acceptés : PDF, ou captures d'écran (JPG, PNG, WebP). Tu peux aussi coller le texte de l'annonce." },
        { status: 415 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    let rawText = "";
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = Array.isArray(text) ? text.join(" ") : text;
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : "lecture impossible";
      return NextResponse.json(
        { error: `Impossible de lire ce PDF (${message}). Essaie de le ré-exporter en PDF standard.` },
        { status: 422 },
      );
    }

    const bodyText = cleanText(rawText || "");
    const documentKind = detectDocumentKind(file.name, bodyText);

    if (isAiExtractionEnabled()) {
      // PDF avec du texte : on envoie le texte (moins cher). PDF scanné : on
      // envoie le document lui-même, que l'IA lit comme des images.
      try {
        const result =
          bodyText.length >= 200
            ? await extractListingWithAi({ kind: "text", text: bodyText }, "none")
            : await extractListingWithAi({ kind: "pdf", base64: Buffer.from(bytes).toString("base64") }, "none");
        const copro = await readCopro(documentKind, bodyText, bytes);
        const res = aiJson(result, file.name, "fichier PDF", documentKind);
        if (!copro) return res;
        const body = await res.json();
        return NextResponse.json({ ...body, copro, extracted: { ...body.extracted, condo_procedure: copro.procedures.length > 0 || body.extracted?.condo_procedure } });
      } catch (error) {
        // IA indisponible : on continue avec la lecture classique du texte du PDF.
        console.error("[extract-file] AI PDF extraction failed", error);
        if (bodyText.length < 20) {
          return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE, code: "ai_unavailable" }, { status: 503 });
        }
      }
    }

    if (!bodyText || bodyText.length < 20) {
      return NextResponse.json(
        { error: "Impossible d'extraire du texte de ce PDF (probablement un scan/image sans texte sélectionnable)." },
        { status: 422 },
      );
    }

    const price = numberFrom(firstMatch(bodyText, PRICE_RE));
    const surface = numberFrom(firstMatch(bodyText, SURFACE_RE));
    const rooms = numberFrom(firstMatch(bodyText, ROOMS_RE));
    const bedrooms = numberFrom(firstMatch(bodyText, BEDROOMS_RE));
    const monthlyRent = numberFrom(firstMatch(bodyText, RENT_RE));
    const dpe = firstMatch(bodyText, DPE_RE);
    const ges = firstMatch(bodyText, GES_RE);
    const cityMatch = bodyText.match(CITY_RE);
    const city = cityMatch ? cityMatch[2].trim() : null;
    const titleGuess = cleanText(bodyText.slice(0, 120));
    const propertyType = classifyPropertyType(titleGuess, bodyText.slice(0, 4000));

    const copro = await readCopro(documentKind, bodyText, bytes);
    return NextResponse.json({
      document_kind: documentKind,
      copro,
      source_url: file.name,
      source_domain: "fichier PDF",
      extracted: {
        title: titleGuess,
        description: bodyText.slice(0, 600),
        price,
        surface_m2: surface,
        rooms,
        bedrooms,
        dpe_class: dpe ? dpe.toUpperCase() : null,
        ges_class: ges ? ges.toUpperCase() : null,
        city,
        monthly_rent: ["bail", "annonce", "autre"].includes(documentKind) ? monthlyRent : null,
        annual_property_tax: documentKind === "taxe_fonciere" ? numberFrom(firstMatch(bodyText, TAX_RE)) : null,
        property_type: propertyType?.type ?? null,
        property_type_label: propertyType?.label ?? null,
        property_type_confidence: propertyType?.confidence ?? null,
        condo_procedure: copro ? copro.procedures.length > 0 : null,
      },
      extraction: {
        status: "partial",
        method: "regex",
        fields_found: [price, surface, rooms, bedrooms, monthlyRent, dpe, ges, city, propertyType?.type].filter(
          (v) => v !== null && v !== "" && v !== undefined,
        ).length,
        note: "Données extraites du PDF fourni (lecture directe du texte, sans IA). Bricky n'invente aucune valeur : vérifie chaque champ avant analyse.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de lire ce fichier.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
