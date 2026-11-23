import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireFeature } from "@/lib/plan/server";
import { computeOffer, type OfferInput } from "@/lib/negotiation";

// « Prix à proposer » : calculé côté serveur, réservé aux plans qui l'incluent
// (Pro, Agence, Essentiel historique). Le calcul n'est plus livré au navigateur.

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.length <= 40 ? v : null);

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "properties.offer", maxRequests: 30, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  const authResponse = await requireUser(request);
  if (authResponse) return authResponse;
  const authorization = request.headers.get("authorization") as string;

  const { denied } = await requireFeature(authorization, "can_suggest_offer");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }

  const input: OfferInput = {
    price: num(body.price) ?? 0,
    marketValue: num(body.marketValue),
    marketConfidence: num(body.marketConfidence),
    trendAnnualPct: num(body.trendAnnualPct),
    dpe: str(body.dpe),
    renovation: num(body.renovation),
    condition: str(body.condition),
    coproWorksVoted: num(body.coproWorksVoted),
  };
  return NextResponse.json({ offer: computeOffer(input) });
}
