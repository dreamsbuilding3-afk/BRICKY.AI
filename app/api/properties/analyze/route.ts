import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DVF_API = "https://api.cquest.org/dvf";

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function rpc(name: string, body: Record<string, unknown>, authorization: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      Authorization: authorization,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`${name}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

async function fetchComparables(latitude: number, longitude: number) {
  const url = new URL(DVF_API);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("dist", "1000");

  const response = await fetch(url, {
    headers: { "User-Agent": "Bricky.AI/1.0" },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`DVF source unavailable (${response.status})`);

  const raw = await response.json();
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return rows.map((row: Record<string, unknown>) => {
    const surface = num(row.surface_reelle_bati ?? row.surface_bati ?? row.surface);
    const price = num(row.valeur_fonciere ?? row.prix);
    return {
      source: "DVF",
      transaction_date: row.date_mutation ?? row.date,
      address: row.adresse_nom_voie ?? row.adresse ?? null,
      city: row.nom_commune ?? row.commune ?? null,
      surface_m2: surface,
      price,
      price_m2: surface && price ? Math.round((price / surface) * 100) / 100 : null,
      distance_m: num(row.distance),
    };
  }).filter((row) => row.surface_m2 && row.price && row.price_m2);
}

export async function POST(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Property payload must be an object." }, { status: 400 });
  }

  try {
    const result = await rpc("ingest_property", { p_payload: payload }, authorization) as { analysis_id?: string; analysis?: unknown };
    const analysisId = result?.analysis_id;
    const body = payload as Record<string, unknown>;
    const latitude = num(body.latitude);
    const longitude = num(body.longitude);

    if (!analysisId || latitude === null || longitude === null) {
      return NextResponse.json({ ...result, market: { status: "insufficient_data", note: "Coordonnées absentes : aucune recherche DVF automatique." } }, { status: 200 });
    }

    let marketIngestion: unknown = null;
    try {
      const comparables = await fetchComparables(latitude, longitude);
      marketIngestion = await rpc("ingest_market_comparables_v1", {
        p_analysis_id: analysisId,
        p_comparables: comparables,
      }, authorization);
      const refreshed = await rpc("refresh_market_from_comparables_v1", { p_analysis_id: analysisId }, authorization);
      return NextResponse.json({ ...result, market: { ingestion: marketIngestion, refreshed } }, { status: 200 });
    } catch (marketError) {
      return NextResponse.json({ ...result, market: { status: "unavailable", note: marketError instanceof Error ? marketError.message : "Market data unavailable" } }, { status: 200 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Property analysis failed.", details: error instanceof Error ? error.message : error }, { status: 422 });
  }
}
