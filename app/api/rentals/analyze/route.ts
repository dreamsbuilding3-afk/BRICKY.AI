import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/data/geocode";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/auth/requireUser";
import { assessRental, type MarketReference } from "@/lib/rental/assess";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const maxDuration = 30;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown): boolean | null {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

async function fetchMarket(inseeCode: string, isHouse: boolean, authorization: string): Promise<MarketReference | null> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rent_indicators?insee_code=eq.${encodeURIComponent(inseeCode)}&select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY!, Authorization: authorization },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const rows = await response.json();
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return null;
  const prefix = isHouse && num(row.rent_m2_house) ? "rent_m2_house" : "rent_m2_apartment";
  const rentM2 = num(row[prefix]);
  if (!rentM2) return null;
  return {
    commune: typeof row.commune_label === "string" ? row.commune_label : null,
    rent_m2: rentM2,
    rent_m2_low: num(row[`${prefix}_low`]),
    rent_m2_high: num(row[`${prefix}_high`]),
    nb_observations: num(row[`${prefix}_nbobs_commune`]),
    source: "ANIL, carte des loyers",
  };
}

// Analyse d'une annonce de location du point de vue du locataire.
export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "rentals.analyze", maxRequests: 20, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;
  const authResponse = await requireUser(request);
  if (authResponse) return authResponse;
  const authorization = request.headers.get("authorization")!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const surface = num(body.surface_m2);
  const rentHc = num(body.rent_hc);
  const rentCc = num(body.rent_cc);
  const city = str(body.city);
  if (!surface || surface < 5) return NextResponse.json({ error: "Indique la surface du logement." }, { status: 400 });
  if (rentHc === null && rentCc === null) return NextResponse.json({ error: "Indique le loyer demandé." }, { status: 400 });
  if (!city && !str(body.postal_code)) return NextResponse.json({ error: "Indique la ville du logement." }, { status: 400 });

  const isHouse = str(body.property_type) === "maison" || str(body.property_type) === "house";

  // Géolocalisation (code INSEE) puis référence de marché ANIL.
  let market: MarketReference | null = null;
  let location: { label: string; insee_code: string | null; postal_code: string | null } | null = null;
  try {
    const query = [str(body.address), str(body.postal_code), city].filter(Boolean).join(" ");
    const geo = await geocodeAddress(query);
    if (geo) {
      location = { label: geo.label, insee_code: geo.inseeCode ?? null, postal_code: geo.postalCode ?? null };
      if (geo.inseeCode) market = await fetchMarket(geo.inseeCode, isHouse, authorization);
    }
  } catch {
    // Pas de référence de marché : l'analyse reste possible (DPE, dépôt, frais…).
  }

  const assessment = assessRental(
    {
      surface_m2: surface,
      rent_hc: rentHc,
      rent_cc: rentCc,
      monthly_charges: num(body.monthly_charges),
      is_furnished: bool(body.is_furnished),
      is_house: isHouse,
      dpe_class: str(body.dpe_class) || null,
      deposit: num(body.deposit),
      tenant_agency_fees: num(body.tenant_agency_fees),
      reference_rent_m2_majore: num(body.reference_rent_m2_majore),
      rent_supplement: num(body.rent_supplement),
      energy_cost_annual: num(body.energy_cost_annual),
      household_income: num(body.household_income),
    },
    market,
  );

  return NextResponse.json({ location, assessment });
}
