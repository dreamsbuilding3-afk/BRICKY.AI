import type { ComparableSale, Confidence, DvfMarketStats } from "./types";

const DVF_BASE_URL = "https://apidf.cerema.fr/dvf_opendata/geomutations/";
const MAX_PAGES = 3;
const MAX_RESULTS = 60;
const MAX_DISTANCE_M = 1500;

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
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

function normalizePropertyType(row: Record<string, unknown>): string | undefined {
  const code = stringValue(row.codtypbien ?? row.type_local ?? row.type_bien);
  if (code === "111") return "maison";
  if (code === "121") return "appartement";
  return stringValue(row.libtypbien ?? row.type_local_label);
}

function mapRow(row: Record<string, unknown>, lat: number, lon: number): ComparableSale | null {
  const price = numberValue(row.valeurfonc ?? row.valeur_fonciere ?? row.prix);
  const surface = numberValue(row.sbati ?? row.surface_bati ?? row.surface);
  if (!price || !surface || price <= 0 || surface <= 0) return null;

  const coordinates = pickCoordinate(row);
  const distance = coordinates
    ? distanceMeters(lat, lon, coordinates[1], coordinates[0])
    : undefined;

  return {
    source: "DVF+",
    transactionDate: stringValue(row.datemut ?? row.date_mutation),
    address: stringValue(row.adresse ?? row.adresse_nom_voie),
    city: stringValue(row.libcom ?? row.nom_commune),
    surfaceM2: surface,
    price,
    priceM2: price / surface,
    distanceM: distance,
    propertyType: normalizePropertyType(row),
    rawPayload: row,
  };
}

function dedupeSales(rows: ComparableSale[]): ComparableSale[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [
      row.transactionDate ?? "",
      row.price ?? "",
      row.surfaceM2 ?? "",
      row.address ?? "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchDvfComparables(input: {
  inseeCode: string;
  latitude: number;
  longitude: number;
  surfaceM2?: number;
  propertyType?: string;
  yearsBack?: number;
}): Promise<ComparableSale[]> {
  let nextUrl: string | null = null;
  let currentUrl: URL | null = null;
  const collected: ComparableSale[] = [];

  currentUrl = new URL(DVF_BASE_URL);
  currentUrl.searchParams.set("code_insee", input.inseeCode);
  currentUrl.searchParams.set("anneemut_min", String(new Date().getFullYear() - (input.yearsBack ?? 5)));
  currentUrl.searchParams.set("page_size", "100");
  currentUrl.searchParams.set("ordering", "-datemut");

  if (input.surfaceM2) {
    currentUrl.searchParams.set("sbati_min", String(Math.max(10, input.surfaceM2 * 0.65)));
    currentUrl.searchParams.set("sbati_max", String(input.surfaceM2 * 1.35));
  }

  const type = (input.propertyType ?? "").toLowerCase();
  if (type.includes("maison") || type.includes("house")) {
    currentUrl.searchParams.set("codtypbien", "111");
  } else if (type.includes("appartement") || type.includes("apartment") || type.includes("studio")) {
    currentUrl.searchParams.set("codtypbien", "121");
  }

  for (let page = 0; page < MAX_PAGES && currentUrl; page += 1) {
    const response = await fetch(currentUrl, {
      headers: { accept: "application/json" },
      next: { revalidate: 21600 },
    });

    if (!response.ok) throw new Error(`DVF+ API returned ${response.status}`);

    const payload = (await response.json()) as { results?: unknown[]; next?: unknown };
    const rows = Array.isArray(payload.results) ? payload.results : [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const sale = mapRow(row as Record<string, unknown>, input.latitude, input.longitude);
      if (!sale) continue;
      if (sale.distanceM !== undefined && sale.distanceM > MAX_DISTANCE_M) continue;
      collected.push(sale);
    }

    nextUrl = typeof payload.next === "string" && payload.next.length > 0 ? payload.next : null;
    currentUrl = nextUrl ? new URL(nextUrl, currentUrl) : null;
    if (collected.length >= MAX_RESULTS) break;
  }

  return dedupeSales(collected)
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    .slice(0, MAX_RESULTS);
}

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function buildDvfMarketStats(
  comparables: ComparableSale[],
  targetSurfaceM2?: number,
): DvfMarketStats {
  const prices = comparables
    .map((sale) => sale.priceM2)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const average = prices.length > 0
    ? prices.reduce((sum, value) => sum + value, 0) / prices.length
    : undefined;
  const median = percentile(prices, 0.5);
  const p25 = percentile(prices, 0.25);
  const p75 = percentile(prices, 0.75);

  const confidence: Confidence = prices.length >= 15
    ? "high"
    : prices.length >= 7
      ? "medium"
      : prices.length >= 3
        ? "low"
        : "none";

  const estimatedMarketValue = median !== undefined && targetSurfaceM2
    ? median * targetSurfaceM2
    : undefined;
  const valueLow = p25 !== undefined && targetSurfaceM2 ? p25 * targetSurfaceM2 : undefined;
  const valueHigh = p75 !== undefined && targetSurfaceM2 ? p75 * targetSurfaceM2 : undefined;

  return {
    source: "DVF+",
    comparableCount: prices.length,
    medianPriceM2: median,
    averagePriceM2: average,
    minPriceM2: prices[0],
    maxPriceM2: prices[prices.length - 1],
    p25PriceM2: p25,
    p75PriceM2: p75,
    estimatedMarketValue,
    valueLow,
    valueHigh,
    methodology: "Médiane des prix/m² des transactions DVF+ comparables sur les 5 dernières années, filtrées par commune, surface et type de bien, puis limitées à 1,5 km autour du bien.",
    confidence,
  };
}
