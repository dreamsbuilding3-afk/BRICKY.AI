import { NextRequest, NextResponse } from "next/server";
import { classifyPropertyType } from "@/lib/data/propertyTypeClassifier";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/auth/requireUser";
import dns from "node:dns/promises";
import net from "node:net";
import { extractFromListingText } from "@/lib/listingText";
import { AI_UNAVAILABLE_MESSAGE, AiServiceError, extractListingWithAi, htmlToListingText, isAiExtractionEnabled, WebFetchFailed } from "@/lib/ai/listingExtractor";

export const maxDuration = 60;

function isPrivateOrLoopbackIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateOrLoopbackIp(lower.slice(7));
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return true;
  const [a, b] = parts;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

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

function regexExtract(html: string, parsedUrl: URL) {
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

    return {
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
        method: "regex",
        note: "Les données extraites doivent être vérifiées avant analyse. Bricky n'invente aucune valeur.",
      },
    };
}

// Signes qu'un site a renvoyé une page anti-robot au lieu de l'annonce.
const BLOCKED_PAGE_RE = /captcha|access denied|acc[eè]s refus[ée]|are you a robot|just a moment|enable javascript|datadome|cf-chl|perimeterx/i;

function aiResponse(result: Awaited<ReturnType<typeof extractListingWithAi>>, sourceUrl: string, sourceDomain: string) {
  return NextResponse.json({
    source_url: sourceUrl,
    source_domain: sourceDomain,
    extracted: result.extracted,
    extra: result.extra,
    extraction: {
      status: result.missing_critical.length ? "partial" : "complete",
      method: "ai",
      model: result.model,
      fetched_by: result.fetched_by,
      fields_found: result.fields_found.length,
      fields: result.fields_found,
      missing_critical: result.missing_critical,
      cost_usd: result.usage.cost_usd,
      note: "Données lues par l'IA dans l'annonce. Un champ absent de l'annonce reste vide : Bricky n'invente aucune valeur.",
    },
  });
}

const UNREADABLE_LINK =
  "Ce site bloque la lecture automatique. Colle le texte de l'annonce ou envoie une capture d'écran : Bricky fera le même travail.";

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "properties.preview", maxRequests: 15, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  const authResponse = await requireUser(request);
  if (authResponse) return authResponse;

  try {
    const { url, text } = await request.json();

    // Cas 1 : texte de l'annonce collé par l'utilisateur.
    if (typeof text === "string" && text.trim()) {
      if (text.trim().length < 30) {
        return NextResponse.json({ error: "Le texte est trop court pour être une annonce." }, { status: 400 });
      }
      const sourceUrl = typeof url === "string" && /^https?:\/\//.test(url.trim()) ? url.trim() : "";
      if (isAiExtractionEnabled()) {
        try {
          const result = await extractListingWithAi({ kind: "text", text: text.trim() }, "none");
          return aiResponse(result, sourceUrl, "texte collé");
        } catch (error) {
          // IA indisponible : on lit le texte nous-mêmes (ci-dessous).
          console.error("[preview] AI text extraction failed", error);
        }
      }
      const fallback = extractFromListingText(text, sourceUrl);
      if (fallback.extraction.fields_found === 0) {
        return NextResponse.json({ error: "Bricky n'a trouvé ni prix, ni surface, ni ville dans ce texte. Vérifie que c'est bien la page de l'annonce." }, { status: 422 });
      }
      return NextResponse.json(fallback);
    }

    if (typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "URL ou texte requis." }, { status: 400 });
    }

    const parsedUrl = new URL(url.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "URL HTTP/HTTPS invalide." }, { status: 400 });
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "0.0.0.0" || hostname.endsWith(".local")) {
      return NextResponse.json({ error: "Cette URL est refusee." }, { status: 400 });
    }
    try {
      const resolved = await dns.lookup(hostname);
      if (isPrivateOrLoopbackIp(resolved.address)) {
        return NextResponse.json({ error: "Cette URL est refusee." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Impossible de resoudre cette adresse." }, { status: 400 });
    }

    // Cas 2 : lien. On lit d'abord la page depuis notre serveur (gratuit et rapide).
    let html: string | null = null;
    let serverStatus = 0;
    try {
      const response = await fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BrickyBot/1.0; +https://bricky.ai)",
          "Accept-Language": "fr-FR,fr;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      serverStatus = response.status;
      if (response.ok) html = (await response.text()).slice(0, 3_000_000);
    } catch {
      html = null;
    }

    if (!isAiExtractionEnabled()) {
      if (!html) return NextResponse.json({ error: `La page n'est pas accessible (${serverStatus || "délai dépassé"}).` }, { status: 422 });
      return NextResponse.json(regexExtract(html, parsedUrl));
    }

    const pageText = html ? htmlToListingText(html) : "";
    const looksBlocked = !html || pageText.length < 800 || BLOCKED_PAGE_RE.test(pageText.slice(0, 3000));

    let aiServiceDown = false;

    if (!looksBlocked) {
      try {
        const result = await extractListingWithAi({ kind: "text", text: pageText, sourceUrl: parsedUrl.toString() }, "server");
        if (result.fields_found.length >= 3) return aiResponse(result, parsedUrl.toString(), parsedUrl.hostname);
      } catch (error) {
        console.error("[preview] AI extraction failed", error);
        if (error instanceof AiServiceError) aiServiceDown = true;
      }
    }

    // Plan B : Claude lit la page lui-même avec l'outil web_fetch (inutile si le service IA est en panne).
    if (!aiServiceDown) {
      try {
        const result = await extractListingWithAi({ kind: "url", url: parsedUrl.toString() });
        if (result.fields_found.length >= 3) return aiResponse(result, parsedUrl.toString(), parsedUrl.hostname);
      } catch (error) {
        // Lien illisible (site bloqué, page en JavaScript…) : on propose le plan B.
        if (!(error instanceof WebFetchFailed)) console.error("[preview] web_fetch error", error);
        if (error instanceof AiServiceError) aiServiceDown = true;
      }
    }

    // Plan C : extraction classique (sans IA) si la page a pu être lue.
    if (html && !looksBlocked) {
      const fallback = regexExtract(html, parsedUrl);
      if (fallback.extraction.fields_found > 0) return NextResponse.json(fallback);
    }

    if (aiServiceDown) {
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE, code: "ai_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: UNREADABLE_LINK, code: "link_unreadable" }, { status: 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de lire cette annonce.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
