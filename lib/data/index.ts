import { fetchDpe } from "./dpe";
import { fetchDvfComparables } from "./dvf";
import { geocodeAddress } from "./geocode";
import { fetchGeorisques } from "./georisques";
import type { DataSourceStatus, PropertyDataBundle } from "./types";

function sourceStatus(source: string, startedAt: number, error?: unknown): DataSourceStatus {
  return {
    source,
    ok: !error,
    retrievedAt: new Date(startedAt).toISOString(),
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  };
}

export async function collectPropertyData(input: {
  address: string;
  postalCode?: string;
  surfaceM2?: number;
  propertyType?: string;
}): Promise<PropertyDataBundle> {
  const sources: DataSourceStatus[] = [];
  const bundle: PropertyDataBundle = { comparables: [], risks: [], sources };

  const geocodeStarted = Date.now();
  try {
    bundle.geocode = await geocodeAddress(input.address);
    sources.push(sourceStatus("BAN_GEOPLATEFORME", geocodeStarted));
  } catch (error) {
    sources.push(sourceStatus("BAN_GEOPLATEFORME", geocodeStarted, error));
  }

  const inseeCode = bundle.geocode?.inseeCode;
  if (!inseeCode || !bundle.geocode) return bundle;

  const [dvfResult, dpeResult, risksResult] = await Promise.allSettled([
    fetchDvfComparables({
      inseeCode,
      latitude: bundle.geocode.latitude,
      longitude: bundle.geocode.longitude,
      surfaceM2: input.surfaceM2,
      propertyType: input.propertyType,
    }),
    fetchDpe({
      address: bundle.geocode.label,
      postalCode: bundle.geocode.postalCode ?? input.postalCode,
      surfaceM2: input.surfaceM2,
    }),
    fetchGeorisques(inseeCode),
  ]);

  if (dvfResult.status === "fulfilled") {
    bundle.comparables = dvfResult.value;
    sources.push(sourceStatus("DVF_PLUS", Date.now()));
  } else {
    sources.push(sourceStatus("DVF_PLUS", Date.now(), dvfResult.reason));
  }

  if (dpeResult.status === "fulfilled") {
    bundle.dpe = dpeResult.value ?? undefined;
    sources.push(sourceStatus("ADEME_DPE", Date.now()));
  } else {
    sources.push(sourceStatus("ADEME_DPE", Date.now(), dpeResult.reason));
  }

  if (risksResult.status === "fulfilled") {
    bundle.risks = risksResult.value;
    sources.push(sourceStatus("GEORISQUES", Date.now()));
  } else {
    sources.push(sourceStatus("GEORISQUES", Date.now(), risksResult.reason));
  }

  return bundle;
}

export * from "./types";
export { fetchDpe } from "./dpe";
export { fetchDvfComparables } from "./dvf";
export { geocodeAddress } from "./geocode";
export { fetchGeorisques } from "./georisques";
