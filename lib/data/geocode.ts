import type { GeoResult } from "./types";

const GEOCODING_URL = "https://data.geopf.fr/geocodage/search/";

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("q", address);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    throw new Error(`Geocoding API returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: {
        label?: string;
        city?: string;
        postcode?: string;
        citycode?: string;
        id?: string;
        score?: number;
      };
    }>;
  };

  const feature = payload.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!feature || !coordinates) return null;

  const [longitude, latitude] = coordinates;
  const score = feature.properties?.score;
  const confidence = score !== undefined
    ? score >= 0.85 ? "high" : score >= 0.6 ? "medium" : "low"
    : "medium";

  return {
    label: feature.properties?.label ?? address,
    latitude,
    longitude,
    city: feature.properties?.city,
    postalCode: feature.properties?.postcode,
    inseeCode: feature.properties?.citycode,
    banId: feature.properties?.id,
    score,
    confidence,
    raw: feature,
  };
}
