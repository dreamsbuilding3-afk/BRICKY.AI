import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type RateLimitConfig = {
  endpoint: string;
  maxRequests: number;
  windowSeconds: number;
};

// Identité du limiteur : l'adresse IP du visiteur, fournie par Vercel (qui écrase
// x-forwarded-for côté serveur, le client ne peut pas la falsifier). On n'utilise plus
// l'identifiant lu dans le jeton : il n'est pas vérifié à ce stade, un script pouvait
// en inventer un nouveau à chaque requête pour contourner les limites.
function getIdentity(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return "ip:" + ip;
}

/**
 * Enforces a sliding-window rate limit backed by the check_rate_limit
 * Postgres function. Identity is the caller's IP address (see getIdentity).
 *
 * Fails open: if Supabase env vars are missing or the check itself errors
 * out, the request is allowed through rather than breaking the product
 * because of a rate-limiter bug.
 *
 * Returns a NextResponse (429) to short-circuit the route when the limit
 * is exceeded, or null when the caller should proceed normally.
 */
export async function enforceRateLimit(request: Request, config: RateLimitConfig): Promise<NextResponse | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const identity = getIdentity(request);

  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/check_rate_limit", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_identity: identity,
        p_endpoint: config.endpoint,
        p_max_requests: config.maxRequests,
        p_window_seconds: config.windowSeconds,
      }),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const rows = await response.json();
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (result && result.allowed === false) {
      const retryAfter = result.retry_after_seconds ?? 60;
      return NextResponse.json(
        {
          error: "Trop de requetes sur cet endpoint. Merci de reessayer dans quelques instants.",
          retry_after_seconds: retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    return null;
  } catch {
    return null;
  }
}
