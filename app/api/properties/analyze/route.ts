import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { geocodeAddress } from "@/lib/data/geocode";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DVF_API = "https://api.cquest.org/dvf";

type Comparable = {
  source: "DVF";
  transaction_date: unknown;
  address: unknown;
  city: unknown;
  surface_m2: number | null;
  price: number | null;
  price_m2: number | null;
  distance_m: number | null;
};

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

async function fetchComparables(latitude: number, longitude: number): Promise<Comparable[]> {
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
  const rows: Record<string, unknown>[] = Array.isArray(raw)
    ? raw.filter((row: unknown): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : Array.isArray(raw?.data)
    ? raw.data.filter((row: unknown): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : [];

  return rows.map((row): Comparable => {
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
  }).filter((row) => row.surface_m2 !== null && row.price !== null && row.price_m2 !== null);
}

async function estimateMonthlyRent(
  inseeCode: string,
  surfaceM2: number,
  propertyType: string | null,
  authorization: string,
): Promise<{ monthly_rent: number; rent_m2: number; property_type_used: "apartment" | "house"; r2: number | null; nbobs: number | null } | null> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rent_indicators?insee_code=eq.${inseeCode}&select=*`,
    { headers: { apikey: SUPABASE_ANON_KEY!, Authorization: authorization }, cache: "no-store" },
  );
  if (!response.ok) return null;
  const rows = await response.json();
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return null;

  const useHouse = propertyType === "house" || propertyType === "maison";
  const rentM2 = useHouse ? num(row.rent_m2_house) : num(row.rent_m2_apartment);
  const r2 = useHouse ? num(row.rent_m2_house_r2) : num(row.rent_m2_apartment_r2);
  const nbobs = useHouse ? num(row.rent_m2_house_nbobs_commune) : num(row.rent_m2_apartment_nbobs_commune);
  if (rentM2 === null || rentM2 <= 0) return null;

  return {
    monthly_rent: Math.round(rentM2 * surfaceM2 * 100) / 100,
    rent_m2: rentM2,
    property_type_used: useHouse ? "house" : "apartment",
    r2,
    nbobs,
  };
}

export async function POST(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "properties.analyze", maxRequests: 20, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Property payload must be an object." }, { status: 400 });
  }

  try {
    const rawBody = payload as Record<string, unknown>;
    const payloadForIngest = { ...rawBody };
    if (rawBody.monthly_rent !== undefined && rawBody.monthly_rent !== null && rawBody.monthly_rent !== "") {
      const existingFinancial = (rawBody.financial as Record<string, unknown> | undefined) || {};
      payloadForIngest.financial = { ...existingFinancial, monthly_rent: rawBody.monthly_rent };
    }
    let result = await rpc("ingest_property", { p_payload: payloadForIngest }, authorization) as { analysis_id?: string; analysis?: unknown };
    const analysisId = result?.analysis_id;
    const body = payloadForIngest as Record<string, unknown>;
    let latitude = num(body.latitude);
    let longitude = num(body.longitude);
    let inseeCode = typeof body.insee_code === "string" && body.insee_code ? body.insee_code : null;
    const financial = (body.financial as Record<string, unknown> | undefined) || {};
    const userProvidedRent = num(financial.monthly_rent) ?? num(rawBody.monthly_rent);

    // Auto-géocodage : si aucune coordonnée n'a été fournie mais qu'on a une
    // adresse, on géolocalise nous-mêmes (même service que les autres panneaux
    // de la page d'analyse) pour pouvoir alimenter DVF et l'estimation de loyer
    // sans dépendre d'une saisie manuelle des coordonnées / du code INSEE.
    if ((latitude === null || longitude === null || !inseeCode) && typeof body.address === "string" && body.address.trim()) {
      const fullAddress = [body.address, typeof body.city === "string" ? body.city : null].filter(Boolean).join(", ");
      try {
        const geo = await geocodeAddress(fullAddress);
        if (geo) {
          if (latitude === null) latitude = geo.latitude;
          if (longitude === null) longitude = geo.longitude;
          if (!inseeCode && geo.inseeCode) inseeCode = geo.inseeCode;
        }
      } catch {
        // Géocodage best-effort : on continue sans DVF/estimation de loyer si indisponible.
      }
    }

    // Step 1: market comparables (DVF), if we have coordinates.
    let market: unknown = { status: "insufficient_data", note: "Coordonnées absentes : aucune recherche DVF automatique." };
    if (analysisId && latitude !== null && longitude !== null) {
      try {
        const comparables = await fetchComparables(latitude, longitude);
        const marketIngestion = await rpc("ingest_market_comparables_v1", {
          p_analysis_id: analysisId,
          p_comparables: comparables,
        }, authorization);
        const refreshed = await rpc("refresh_market_from_comparables_v1", { p_analysis_id: analysisId }, authorization);
        market = { ingestion: marketIngestion, refreshed };
        result = { ...result, analysis: (refreshed as { analysis?: unknown })?.analysis ?? result.analysis };
      } catch (marketError) {
        market = { status: "unavailable", note: marketError instanceof Error ? marketError.message : "Market data unavailable" };
      }
    }

    // Step 2: automatic rent estimate (ANIL "Carte des loyers"), only if the
    // user did not provide a monthly rent themselves. Runs last so its
    // final re-analysis (and its "estimated rent" note) is not wiped out
    // by a later market refresh.
    let rentEstimate: unknown = null;
    if (analysisId && !userProvidedRent && inseeCode) {
      const surface = num(body.surface_m2);
      if (surface && surface > 0) {
        try {
          const estimate = await estimateMonthlyRent(
            inseeCode,
            surface,
            typeof body.property_type === "string" ? body.property_type : null,
            authorization,
          );
          if (estimate) {
            const applied = await rpc("apply_rent_estimate_v1", {
              p_analysis_id: analysisId,
              p_monthly_rent: estimate.monthly_rent,
              p_source: "anil_carte_des_loyers_2025",
            }, authorization);
            rentEstimate = { ...estimate, applied };
            result = { ...result, analysis: (applied as { analysis?: unknown })?.analysis ?? result.analysis };
          }
        } catch (rentError) {
          rentEstimate = { status: "unavailable", note: rentError instanceof Error ? rentError.message : "Rent estimate unavailable" };
        }
      }
    }

    return NextResponse.json({ ...result, market, rent_estimate: rentEstimate }, { status: 200 });
  } catch (error) {
    await logError("properties.analyze", error);
    return NextResponse.json({ error: "Property analysis failed.", details: error instanceof Error ? error.message : error }, { status: 422 });
  }
}
