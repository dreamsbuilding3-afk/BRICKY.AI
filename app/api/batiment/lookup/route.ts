import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { geocodeAddress } from "@/lib/data/geocode";
import { assertPropertyOwnership, cleanValue } from "@/lib/data/cadastre";
import { buildBatimentRecord, findBatiment, persistBatimentRecord } from "@/lib/data/batiment";

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "batiment.lookup", maxRequests: 30, windowSeconds: 60 });
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

    const batiment = await findBatiment(latitude, longitude);
    if (!batiment) {
      return NextResponse.json({
        error: "Aucun bâtiment trouvé à proximité de ces coordonnées.",
        note: "La BD TOPO® peut ne pas être à jour pour une construction très récente, ou le point géocodé tombe en dehors de toute emprise bâtie référencée. Aucune donnée n'est inventée : vérifie directement sur geoservices.ign.fr.",
      }, { status: 422 });
    }

    const record = buildBatimentRecord(propertyId, userId, batiment);
    const saved = await persistBatimentRecord(record, authorization);

    return NextResponse.json({
      batiment: record,
      saved,
      geocode: geocodeLabel ? { label: geocodeLabel, latitude, longitude } : { latitude, longitude },
    }, { status: 200 });
  } catch (error) {
    await logError("batiment.lookup", error);
    const status = (error as { status?: number })?.status ?? 422;
    return NextResponse.json(
      { error: status === 404 ? "Bien introuvable ou non accessible." : "Impossible de déterminer l'empreinte du bâtiment automatiquement.", details: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
