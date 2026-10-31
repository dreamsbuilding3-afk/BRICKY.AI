import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/auth/requireUser";
import { isStreamEstateConfigured, lookupByUrl, normalizeProperty, StreamEstateError } from "@/lib/streamEstate";
import { sourceName } from "@/lib/radar";

// « Moins cher ailleurs » : le même bien est-il publié sur d'autres sites, à un autre prix ?
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, { endpoint: "radar.compare", maxRequests: 20, windowSeconds: 3600 });
  if (limited) return limited;
  const unauthorized = await requireUser(request);
  if (unauthorized) return unauthorized;
  if (!isStreamEstateConfigured()) {
    return NextResponse.json({ error: "La comparaison des sites est en cours d'activation.", code: "not_configured" }, { status: 503 });
  }

  try {
    const { url } = (await request.json()) as { url?: unknown };
    if (typeof url !== "string" || !/^https?:\/\//.test(url.trim())) {
      return NextResponse.json({ error: "Lien d'annonce requis." }, { status: 400 });
    }
    const raw = await lookupByUrl(url.trim());
    const listing = raw ? normalizeProperty(raw) : null;
    if (!listing) return NextResponse.json({ found: false, sources: [] });

    const sources = listing.sources
      .filter((s) => s.price)
      .sort((a, b) => a.price! - b.price!)
      .map((s) => ({ name: sourceName(s.slug), url: s.url, price: s.price! }));
    const current = sources.find((s) => sameAd(s.url, url)) ?? null;
    const cheapest = sources[0] ?? null;
    return NextResponse.json({
      found: true,
      sources,
      cheapest,
      current_price: current?.price ?? null,
      savings: cheapest && current && current.price > cheapest.price ? current.price - cheapest.price : 0,
      price_drops: listing.priceDrops,
    });
  } catch (error) {
    console.error("[radar.compare]", error);
    const message = error instanceof StreamEstateError && error.status === 402 ? "Le crédit Stream Estate est épuisé." : "Comparaison impossible pour le moment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function sameAd(a: string, b: string) {
  try {
    const x = new URL(a), y = new URL(b);
    return x.hostname.replace(/^www\./, "") === y.hostname.replace(/^www\./, "") && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}
