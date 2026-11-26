import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type RateLimitConfig = {
  endpoint: string;
  maxRequests: number;
  windowSeconds: number;
};

function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(pad);
    const json = typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("utf-8");
    const parsed = JSON.parse(json);
    return typeof parsed.sub === "string" ? parsed.sub : null;
  } catch {
    return null;
  }
}

function getIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Identité « utilisateur » lue dans le jeton. Attention : le jeton n'est PAS vérifié ici,
 * n'importe qui peut fabriquer un faux « sub ». C'est pourquoi un second plafond, par
 * adresse IP, est toujours appliqué en plus (voir enforceRateLimit).
 */
function getUserIdentity(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const sub = decodeJwtSub(authorization.slice(7));
    if (sub) return "user:" + sub;
  }
  return null;
}

type RateLimitResult = { allowed: boolean; retryAfter: number };

async function checkBucket(identity: string, endpoint: string, maxRequests: number, windowSeconds: number): Promise<RateLimitResult> {
  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/check_rate_limit", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY as string,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_identity: identity,
        p_endpoint: endpoint,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { allowed: true, retryAfter: 0 };
    const rows = await response.json();
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (result && result.allowed === false) return { allowed: false, retryAfter: Number(result.retry_after_seconds) || 60 };
    return { allowed: true, retryAfter: 0 };
  } catch {
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * Enforces a sliding-window rate limit backed by the check_rate_limit
 * Postgres function. Identity is the authenticated user id when a bearer
 * token is present, otherwise the caller's IP address.
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

  const userIdentity = getUserIdentity(request);
  const ipIdentity = "ip:" + getIp(request);

  // Plafond par utilisateur (si jeton) + plafond par IP, plus large pour ne pas gêner
  // plusieurs personnes derrière la même connexion (bureau, agence).
  const checks = [
    userIdentity
      ? checkBucket(userIdentity, config.endpoint, config.maxRequests, config.windowSeconds)
      : checkBucket(ipIdentity, config.endpoint, config.maxRequests, config.windowSeconds),
  ];
  if (userIdentity) checks.push(checkBucket(ipIdentity, config.endpoint + ":ip", config.maxRequests * 4, config.windowSeconds));

  const results = await Promise.all(checks);
  const blocked = results.find((r) => !r.allowed);
  if (!blocked) return null;

  return NextResponse.json(
    {
      error: "Trop de requêtes. Merci de réessayer dans quelques instants.",
      retry_after_seconds: blocked.retryAfter,
    },
    { status: 429, headers: { "Retry-After": String(blocked.retryAfter) } },
  );
}
