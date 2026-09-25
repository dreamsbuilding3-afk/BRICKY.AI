import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { classifyPropertyType } from "@/lib/data/propertyTypeClassifier";

export const maxDuration = 30;

const PRICE_RE = /(?:prix|price)[^\d]{0,40}([\d\s.,]+)\s*€?/i;
const SURFACE_RE = /(?:surface|area)[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*m(?:²|2)/i;
const ROOMS_RE = /(?:pi[eè]ces?|rooms?)[^\d]{0,20}(\d+)/i;
const BEDROOMS_RE = /(?:chambres?)[^\d]{0,20}(\d+)/i;
const RENT_RE = /(?:loyer|rent)[^\d]{0,40}([\d\s.,]+)\s*€?/i;
const DPE_RE = /\bDPE\b[^A-G]{0,20}\b([A-G])\b/i;
const GES_RE = /\bGES\b[^A-G]{0,20}\b([A-G])\b/i;
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
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (15 Mo max)." }, { status: 413 });
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF sont acceptés pour le moment. Pour une photo d'annonce, exporte-la en PDF ou colle le texte directement." },
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

    return NextResponse.json({
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
        monthly_rent: monthlyRent,
        property_type: propertyType?.type ?? null,
        property_type_label: propertyType?.label ?? null,
        property_type_confidence: propertyType?.confidence ?? null,
      },
      extraction: {
        status: "partial",
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
