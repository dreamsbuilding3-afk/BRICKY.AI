import { NextRequest, NextResponse } from "next/server";
import { classifyPropertyType } from "@/lib/data/propertyTypeClassifier";

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

function jsonLdValues(html: string) {
  const values: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      values.push(...items.filter((item) => item && typeof item === "object"));
    } catch {}
  }
  return values;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "URL requise." }, { status: 400 });
    }

    const parsedUrl = new URL(url.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "URL HTTP/HTTPS invalide." }, { status: 400 });
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrickyBot/1.0; +https://bricky.ai)" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `La page n'est pas accessible (${response.status}).` }, { status: 422 });
    }

    const html = (await response.text()).slice(0, 3_000_000);
    const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const description = cleanText(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "");
    const bodyText = cleanText(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " "));
    const ld = jsonLdValues(html);
    const product = (ld.find((item) => ["Product", "Offer", "RealEstateListing"].includes(String(item["@type"]))) ?? {}) as Record<string, unknown>;
    const offers = (product.offers && typeof product.offers === "object" ? product.offers : {}) as Record<string, unknown>;
    const address = typeof product.address === "object" && product.address ? (product.address as Record<string, unknown>) : {};

    const price = numberFrom(String(offers.price ?? product.price ?? firstMatch(bodyText, PRICE_RE) ?? ""));
    const surface = numberFrom(String(product.floorSize && typeof product.floorSize === "object" ? (product.floorSize as Record<string, unknown>).value : firstMatch(bodyText, SURFACE_RE) ?? ""));
    const rooms = numberFrom(String(product.numberOfRooms ?? firstMatch(bodyText, ROOMS_RE) ?? ""));
    const bedrooms = numberFrom(firstMatch(bodyText, BEDROOMS_RE));
    const monthlyRent = numberFrom(firstMatch(bodyText, RENT_RE));
    const dpe = firstMatch(bodyText, DPE_RE);
    const ges = firstMatch(bodyText, GES_RE);
    const ldCity = String(address.addressLocality ?? "").trim();
    const cityMatch = bodyText.match(CITY_RE);
    const city = ldCity || (cityMatch ? cityMatch[2].trim() : "");
    const resolvedTitle = String(product.name ?? title).trim();
    const propertyType = classifyPropertyType(resolvedTitle, description, bodyText.slice(0, 4000));

    return NextResponse.json({
      source_url: parsedUrl.toString(),
      source_domain: parsedUrl.hostname,
      extracted: {
        title: resolvedTitle,
        description,
        price,
        surface_m2: surface,
        rooms,
        bedrooms,
        dpe_class: dpe ? dpe.toUpperCase() : null,
        ges_class: ges ? ges.toUpperCase() : null,
        city: city || null,
        monthly_rent: monthlyRent,
        property_type: propertyType?.type ?? null,
        property_type_label: propertyType?.label ?? null,
        property_type_confidence: propertyType?.confidence ?? null,
      },
      extraction: {
        status: "partial",
        fields_found: [price, surface, rooms, bedrooms, city, monthlyRent, dpe, ges, propertyType?.type].filter(
          (v) => v !== null && v !== "" && v !== undefined,
        ).length,
        note: "Les données extraites doivent être vérifiées avant analyse. Bricky n'invente aucune valeur.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de lire cette annonce.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
