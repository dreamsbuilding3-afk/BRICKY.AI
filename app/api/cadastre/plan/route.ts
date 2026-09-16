import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function clean(value: unknown, max = 32) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validCode(value: string) {
  return /^[0-9A-Z]{2,5}$/i.test(value);
}

function validPrefix(value: string) {
  return /^\d{3}$/.test(value);
}

function validSection(value: string) {
  return /^[A-Z0-9]{1,2}$/i.test(value);
}

function validParcel(value: string) {
  return /^\d{1,4}$/.test(value);
}

export async function POST(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid");
    body = payload as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const propertyId = clean(body.property_id, 64);
  const commune = clean(body.commune_code, 5).toUpperCase();
  const prefix = clean(body.section_prefix || "000", 3);
  const section = clean(body.section, 2).toUpperCase();
  const parcel = clean(body.parcel_number, 4);

  if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return NextResponse.json({ error: "property_id invalide." }, { status: 400 });
  if (!validCode(commune) || !validPrefix(prefix) || !validSection(section) || !validParcel(parcel)) {
    return NextResponse.json({ error: "Référence cadastrale invalide. Utilise commune, préfixe, section et numéro de parcelle." }, { status: 400 });
  }

  try {
    const propertyResponse = await fetch(`${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}&select=id`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization },
      cache: "no-store",
    });
    const properties = await propertyResponse.json();
    if (!propertyResponse.ok || !Array.isArray(properties) || properties.length !== 1) {
      return NextResponse.json({ error: "Bien introuvable ou non accessible." }, { status: 404 });
    }

    const planUrl = new URL("https://sandbox.geo.api.gouv.fr/scpc/");
    planUrl.searchParams.set("commune", commune);
    planUrl.searchParams.set("prefixe", prefix);
    planUrl.searchParams.set("section", section);
    planUrl.searchParams.set("parcelle", parcel);
    planUrl.searchParams.set("echelle", "1000");
    planUrl.searchParams.set("taille", "A4");
    planUrl.searchParams.set("orientation", "paysage");

    const parcelId = `${commune}${prefix}${section}${parcel}`;
    const record = {
      property_id: propertyId,
      commune_code: commune,
      section_prefix: prefix,
      section,
      parcel_number: parcel,
      parcel_id: parcelId,
      source: "DGFiP / cadastre.gouv.fr via API SCPC Etalab",
      source_url: "https://cadastre.data.gouv.fr/datasets/cadastre-etalab",
      plan_url: planUrl.toString(),
      metadata: { generated_at: new Date().toISOString(), scale: 1000, format: "A4 paysage" },
    };

    const upsertResponse = await fetch(`${SUPABASE_URL}/rest/v1/property_cadastral?on_conflict=property_id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: authorization,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(record),
      cache: "no-store",
    });
    const upsertText = await upsertResponse.text();
    let saved: unknown = null;
    try { saved = upsertText ? JSON.parse(upsertText) : null; } catch { saved = upsertText; }
    if (!upsertResponse.ok) throw new Error(`Cadastre save failed: ${typeof saved === "string" ? saved : JSON.stringify(saved)}`);

    return NextResponse.json({ cadastral: { ...record, plan_url: planUrl.toString() }, saved }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Impossible de générer le plan cadastral.", details: error instanceof Error ? error.message : "Unknown error" }, { status: 422 });
  }
}
