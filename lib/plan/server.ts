import { NextResponse } from "next/server";
import { PRO_FALLBACK, upgradeDeltaCents, type MySubscription, type PlanFeature } from "./features";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Lit le plan de l'utilisateur via la RPC get_my_subscription (avec SON jeton :
 * la base décide, pas le navigateur). Renvoie null si la lecture échoue.
 */
export async function getMySubscription(authorization: string): Promise<MySubscription | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_subscription`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === "object" && "plan_code" in data ? (data as MySubscription) : null;
  } catch {
    return null;
  }
}

/** Réponse 403 standard d'une fonction réservée à Pro (lue par components/FeatureLock). */
export function featureLockedResponse(feature: PlanFeature, sub: MySubscription | null) {
  const delta = upgradeDeltaCents(sub?.price_monthly_cents, PRO_FALLBACK.monthly);
  return NextResponse.json(
    {
      error: "feature_locked",
      feature,
      required_plan: "pro",
      upgrade_delta_cents: delta,
      upgrade_url: "/checkout?plan=pro&periode=annuel",
      message: delta ? `Disponible avec Pro, pour ${Math.round(delta / 100)} € de plus.` : "Disponible avec Pro.",
    },
    { status: 403 },
  );
}

/**
 * Vérifie un droit côté serveur. Renvoie une réponse à retourner telle quelle si
 * l'accès est refusé (ou si le plan n'a pas pu être lu : on refuse par défaut).
 */
export async function requireFeature(authorization: string, feature: PlanFeature): Promise<{ denied: NextResponse | null; sub: MySubscription | null }> {
  const sub = await getMySubscription(authorization);
  if (!sub) {
    return { denied: NextResponse.json({ error: "plan_unavailable", message: "Impossible de vérifier ton abonnement, réessaie." }, { status: 503 }), sub };
  }
  if (sub[feature] !== true) return { denied: featureLockedResponse(feature, sub), sub };
  return { denied: null, sub };
}
