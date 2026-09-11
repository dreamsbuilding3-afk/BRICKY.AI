import { NextRequest, NextResponse } from "next/server";

const PRICE_RE = /(?:prix|price)[^\d]{0,40}([\d\s.,]+)\s*€?/i;
const SURFACE_RE = /(?:surface|area)[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*m(?:²|2)/i;
const ROOMS_RE = /(?:pi[eè]ces?|rooms?)[^\d]{0,20}(\d+)/i;
const RENT_RE = /(?:loyer|rent)[^\d]{0,40}([\d\s.,]+)\s*€?/i;

function cleanText(value: string) {
  return value.replace(/\\s+/g, " ").replace(/&nbsp;/gi, " ").trim();
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
    const product = ld.find((item) => ["Product", "Offer", "RealEstateListing"].includes(String(item["@type"]))) ?? {};
    const offers = (product.offers && typeof product.offers === "object" ? product.offers : {}) as Record<string, unknown>;
    const address = typeof product.address === "object" && product.address ? (product.address as Record<string, unknown>) : {};

    const price = numberFrom(String(offers.price ?? product.price ?? firstMatch(bodyText, PRICE_RE) ?? ""));
    const surface = numberFrom(String(product.floorSize && typeof product.floorSize === "object" ? (product.floorSize as Record<string, unknown>).value : firstMatch(bodyText, SURFACE_RE) ?? ""));
    const rooms = numberFrom(String(product.numberOfRooms ?? firstMatch(bodyText, ROOMS_RE) ?? ""));
    const monthlyRent = numberFrom(firstMatch(bodyText, RENT_RE));
    const city = String(address.addressLocality ?? "").trim();

    return NextResponse.json({
      source_url: parsedUrl.toString(),
      source_domain: parsedUrl.hostname,
      extracted: {
        title: String(product.name ?? title).trim(),
        description,
        price,
        surface_m2: surface,
        rooms,
        city: city || null,
        monthly_rent: monthlyRent,
      },
      extraction: {
        status: "partial",
        fields_found: [price, surface, rooms, city, monthlyRent].filter((v) => v !== null && v !== "").length,
        note: "Les données extraites doivent être vérifiées avant analyse. Bricky n'invente aucune valeur.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de lire cette annonce.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
