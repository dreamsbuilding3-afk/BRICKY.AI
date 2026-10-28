import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Vérifie que le jeton Bearer correspond à un vrai utilisateur Supabase.
 * Indispensable sur les routes qui appellent l'API Claude (payante) : un simple
 * test "Bearer ..." laisserait n'importe qui consommer des crédits.
 * Renvoie une réponse 401 à retourner telle quelle, ou null si l'utilisateur est valide.
 */
export async function requireUser(request: Request): Promise<NextResponse | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return NextResponse.json({ error: "Session expirée, reconnecte-toi." }, { status: 401 });
    return null;
  } catch {
    return NextResponse.json({ error: "Vérification de session impossible, réessaie." }, { status: 503 });
  }
}
