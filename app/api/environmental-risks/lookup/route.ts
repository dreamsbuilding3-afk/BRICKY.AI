import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { geocodeAddress } from "@/lib/data/geocode";
import { assertPropertyOwnership, cleanValue } from "@/lib/data/cadastre";
import { fetchGeorisquesReport, saveEnvironmentalRisks } from "@/lib/data/environmentalRiskReport";

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "environmental-risks.lookup", maxRequests: 30, windowSeconds: 60 });
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
    await assertPropertyOwnership(propertyId, authorization);

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

    const report = await fetchGeorisquesReport(latitude, longitude);
    const saved = await saveEnvironmentalRisks(propertyId, report, authorization);

    return NextResponse.json({
      environmental_risks: (saved as { saved?: unknown })?.saved ?? null,
      analysis_refreshed: Boolean((saved as { analysis_refreshed?: boolean })?.analysis_refreshed),
      report_url: report.url ?? null,
      geocode: geocodeLabel ? { label: geocodeLabel, latitude, longitude } : { latitude, longitude },
    }, { status: 200 });
  } catch (error) {
    await logError("environmental-risks.lookup", error);
    const status = (error as { status?: number })?.status ?? 422;
    return NextResponse.json(
      { error: status === 404 ? "Bien introuvable ou non accessible." : "Impossible de récupérer l'étude de terrain automatiquement.", details: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
