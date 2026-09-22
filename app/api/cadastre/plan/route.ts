import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  assertPropertyOwnership,
  buildCadastralRecord,
  cleanValue,
  isValidCommune,
  isValidParcel,
  isValidPrefix,
  isValidSection,
  persistCadastralRecord,
} from "@/lib/data/cadastre";

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "cadastre.plan", maxRequests: 20, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

let body: Record<string, unknown>;
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid");
    body = payload as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }

const propertyId = cleanValue(body.property_id, 64);
  const commune = cleanValue(body.commune_code, 5).toUpperCase();
  const prefix = cleanValue(body.section_prefix || "000", 3);
  const section = cleanValue(body.section, 2).toUpperCase();
  const parcel = cleanValue(body.parcel_number, 4);

if (!isValidCommune(commune) || !isValidPrefix(prefix) || !isValidSection(section) || !isValidParcel(parcel)) {
  return NextResponse.json({ error: "Référence cadastrale invalide. Utilise commune, préfixe, section et numéro de parcelle." }, { status: 400 });
}

try {
  const userId = await assertPropertyOwnership(propertyId, authorization);
  const reference = {
    communeCode: commune,
    sectionPrefix: prefix,
    section,
    parcelNumber: parcel,
    parcelId: `${commune}${prefix}${section}${parcel}`,
  };
  const record = buildCadastralRecord(propertyId, userId, reference, "manual");
  const saved = await persistCadastralRecord(record, authorization);
  return NextResponse.json({ cadastral: record, saved }, { status: 200 });
} catch (error) {
  const status = (error as { status?: number })?.status ?? 422;
  return NextResponse.json(
    { error: status === 404 ? "Bien introuvable ou non accessible." : "Impossible de générer le plan cadastral.", details: error instanceof Error ? error.message : "Unknown error" },
    { status },
    );
}
}
