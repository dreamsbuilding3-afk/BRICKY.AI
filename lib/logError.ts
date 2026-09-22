const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Lightweight, dependency-free error logging: writes one row to the
 * error_logs table (insert-only from the client's perspective, see the
 * add_error_logging migration) so failures in production are visible in
 * the Supabase dashboard instead of disappearing into Vercel's logs alone.
 *
 * Never throws: a logging failure must never break the request that
 * triggered it. Call this from a catch block alongside the existing
 * NextResponse.json(..., { status }) error response.
 */
export async function logError(endpoint: string, error: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const message = error instanceof Error ? error.message : String(error);

  try {
    await fetch(SUPABASE_URL + "/rest/v1/error_logs", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        endpoint,
        message: message.slice(0, 2000),
        context: context ? JSON.parse(JSON.stringify(context, (_key, value) => (value instanceof Error ? value.message : value))) : null,
      }),
      cache: "no-store",
    });
  } catch {
    // Swallow: logging must never mask or replace the original error.
  }
}
