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

function getIdentity(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const sub = decodeJwtSub(authorization.slice(7));
    if (sub) return "user:" + sub;
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return "ip:" + ip;
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
