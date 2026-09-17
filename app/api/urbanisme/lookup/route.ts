import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/data/geocode";
import { assertPropertyOwnership, cleanValue } from "@/lib/data/cadastre";
import { buildUrbanismeRecord, findZonage, persistUrbanismeRecord } from "@/lib/data/urbanisme";

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
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
  const address = cleanValue(body.address, 256);
  let latitude = toNumber(body.latitude);
  let longitude = toNumber(body.longitude);

  if ((latitude === null || longitude === null) && !address) {
    return NextResponse.json({ error: "Fournis soit une adresse, soit latitude/longitude." }, { status: 400 });
  }

  try {
    const userId = await assertPropertyOwnership(propertyId, authorization);

    let geocodeLabel: string | undefined;
    if (latitude === null || longitude === null) {
      const geocode = await geocodeAddress(address);
      if (!geocode) {
        return NextResponse.json({ error: "Adresse introuvable : impossible de la géolocaliser." }, { status: 422 });
      }
      latitude = geocode.latitude;
      longitude = geocode.longitude;
      geocodeLabel = geocode.label;
    }

    const zonage = await findZonage(latitude, longitude);
    if (!zonage) {
      return NextResponse.json({
        error: "Aucun zonage PLU/PLUi trouvé à ces coordonnées.",
        note: "La commune peut ne pas avoir de document d'urbanisme numérisé dans le Géoportail de l'Urbanisme (GPU), ou le point tombe hors de tout zonage publié. Aucune donnée n'est inventée : vérifie directement sur geoportail-urbanisme.gouv.fr.",
      }, { status: 422 });
    }

    const record = buildUrbanismeRecord(propertyId, userId, zonage);
    const saved = await persistUrbanismeRecord(record, authorization);

    return NextResponse.json({
      urbanisme: record,
      saved,
      geocode: geocodeLabel ? { label: geocodeLabel, latitude, longitude } : { latitude, longitude },
    }, { status: 200 });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 422;
    return NextResponse.json(
      { error: status === 404 ? "Bien introuvable ou non accessible." : "Impossible de déterminer le zonage d'urbanisme automatiquement.", details: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
