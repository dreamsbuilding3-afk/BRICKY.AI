import type { ComparableSale } from "./types";

const DVF_BASE_URL = "https://apidf.cerema.fr/dvf_opendata/geomutations/";

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

function pickCoordinate(row: Record<string, unknown>): [number, number] | null {
  const geometry = row.geometry as { coordinates?: unknown } | undefined;
  const coordinates = geometry?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const lon = numberValue(coordinates[0]);
    const lat = numberValue(coordinates[1]);
    if (lon !== undefined && lat !== undefined) return [lon, lat];
  }

  const lon = numberValue(row.lon ?? row.longitude);
  const lat = numberValue(row.lat ?? row.latitude);
  return lon !== undefined && lat !== undefined ? [lon, lat] : null;
}

function mapRow(row: Record<string, unknown>, lat: number, lon: number): ComparableSale | null {
  const price = numberValue(row.valeurfonc ?? row.valeur_fonciere ?? row.prix);
  const surface = numberValue(row.sbati ?? row.surface_bati ?? row.surface);
  if (!price || !surface || surface <= 0) return null;

  const coordinates = pickCoordinate(row);
  const distance = coordinates
    ? distanceMeters(lat, lon, coordinates[1], coordinates[0])
    : undefined;

  return {
    source: "DVF+",
    transactionDate: typeof row.datemut === "string" ? row.datemut : typeof row.date_mutation === "string" ? row.date_mutation : undefined,
    address: typeof row.adresse === "string" ? row.adresse : undefined,
    city: typeof row.libcom === "string" ? row.libcom : typeof row.nom_commune === "string" ? row.nom_commune : undefined,
    surfaceM2: surface,
    price,
    priceM2: price / surface,
    distanceM: distance,
    rawPayload: row,
  };
}

export async function fetchDvfComparables(input: {
  inseeCode: string;
  latitude: number;
  longitude: number;
  surfaceM2?: number;
  propertyType?: string;
  yearsBack?: number;
}): Promise<ComparableSale[]> {
  const url = new URL(DVF_BASE_URL);
  url.searchParams.set("code_insee", input.inseeCode);
  url.searchParams.set("anneemut_min", String(new Date().getFullYear() - (input.yearsBack ?? 5)));
  url.searchParams.set("page_size", "100");
  url.searchParams.set("ordering", "-datemut");

  if (input.surfaceM2) {
    url.searchParams.set("sbati_min", String(Math.max(10, input.surfaceM2 * 0.65)));
    url.searchParams.set("sbati_max", String(input.surfaceM2 * 1.35));
  }

  const type = (input.propertyType ?? "").toLowerCase();
  if (type.includes("maison") || type.includes("house")) {
    url.searchParams.set("codtypbien", "111");
  } else if (type.includes("appartement") || type.includes("apartment") || type.includes("studio")) {
    url.searchParams.set("codtypbien", "121");
  }

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    throw new Error(`DVF+ API returned ${response.status}`);
  }

  const payload = (await response.json()) as { results?: unknown[] };
  const rows = Array.isArray(payload.results) ? payload.results : [];

  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => mapRow(row, input.latitude, input.longitude))
    .filter((row): row is ComparableSale => row !== null)
    .filter((row) => row.distanceM === undefined || row.distanceM <= 1500)
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    .slice(0, 30);
}
