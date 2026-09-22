import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { geocodeAddress } from "@/lib/data/geocode";
import {
  assertPropertyOwnership,
  buildCadastralRecord,
  cleanValue,
  findParcelByCoordinates,
  persistCadastralRecord,
  } from "@/lib/data/cadastre";

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
  }

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "cadastre.lookup", maxRequests: 30, windowSeconds: 60 });
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

    const parcel = await findParcelByCoordinates(latitude, longitude);
    if (!parcel) {
      return NextResponse.json({
        error: "Aucune parcelle cadastrale trouvée à ces coordonnées.",
        note: "Le point géocodé peut tomber hors parcelle bâtie connue (DOM-TOM, adresse imprécise, ou zone non cadastrée dans le PCI vecteur). Renseigne la référence manuellement via /api/cadastre/plan.",
        }, { status: 422 });
      }

    const record = buildCadastralRecord(propertyId, userId, parcel, "auto_coordinates");
    const saved = await persistCadastralRecord(record, authorization);

    return NextResponse.json({
      cadastral: record,
      saved,
      geocode: geocodeLabel ? { label: geocodeLabel, latitude, longitude } : { latitude, longitude },
      }, { status: 200 });
    } catch (error) {
    const status = (error as { status?: number })?.status ?? 422;
    return NextResponse.json(
      { error: status === 404 ? "Bien introuvable ou non accessible." : "Impossible de générer le plan cadastral automatiquement.", details: error instanceof Error ? error.message : "Unknown error" },
      { status },
      );
    }
  }
