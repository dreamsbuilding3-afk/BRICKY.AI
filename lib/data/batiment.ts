const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Géoplateforme IGN (service ouvert, sans clé) — couche bâti de la BD TOPO.
const WFS_BATIMENT_URL = "https://data.geopf.fr/wfs/ows";
const BATIMENT_TYPENAME = "BDTOPO_V3:batiment";

// Rayon de recherche autour du point géocodé (en degrés, ~25 m) pour capter le
// bâtiment le plus proche même si le géocodage tombe légèrement à côté de l'emprise.
const SEARCH_RADIUS_DEG = 0.00025;

export type BatimentReference = {
  cleabs: string | null;
  hauteurM: number | null;
  altitudeSolM: number | null;
  nature: string | null;
  usage1: string | null;
  usage2: string | null;
  nombreEtages: number | null;
  nombreLogements: number | null;
  dateConstruction: string | null;
  geometry?: unknown;
};

export type BatimentRecord = {
  property_id: string;
  user_id: string;
  cleabs: string | null;
  hauteur_m: number | null;
  altitude_sol_m: number | null;
  nature: string | null;
  usage_1: string | null;
  usage_2: string | null;
  nombre_etages: number | null;
  nombre_logements: number | null;
  date_construction: string | null;
  geometry?: unknown;
  source: string;
  source_url: string;
  metadata: {
    generated_at: string;
  };
};

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(value: unknown): number | null {
  const n = toNumberOrNull(value);
  return n === null ? null : Math.round(n);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Distance approximative en mètres entre deux points (formule équirectangulaire,
// suffisante à cette échelle pour trier les bâtiments par proximité).
function approxDistanceMeters(lat: number, lon: number, lat2: number, lon2: number): number {
  const meanLat = ((lat + lat2) / 2) * (Math.PI / 180);
  const dx = (lon2 - lon) * Math.cos(meanLat) * 111320;
  const dy = (lat2 - lat) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

function centroidOf(geometry: unknown): [number, number] | null {
  try {
    const geom = geometry as { type?: string; coordinates?: unknown };
    const flatten = (coords: unknown, acc: [number, number][]) => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        acc.push([coords[0] as number, coords[1] as number]);
        return;
      }
      for (const c of coords) flatten(c, acc);
    };
    const points: [number, number][] = [];
    flatten(geom.coordinates, points);
    if (!points.length) return null;
    const sum = points.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return [sum[0] / points.length, sum[1] / points.length];
  } catch {
    return null;
  }
}

export async function findBatiment(latitude: number, longitude: number): Promise<BatimentReference | null> {
  const bbox = [
    longitude - SEARCH_RADIUS_DEG,
    latitude - SEARCH_RADIUS_DEG,
    longitude + SEARCH_RADIUS_DEG,
    latitude + SEARCH_RADIUS_DEG,
  ].join(",");

  const url = new URL(WFS_BATIMENT_URL);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", BATIMENT_TYPENAME);
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("SRSNAME", "EPSG:4326");
  url.searchParams.set("BBOX", `${bbox},EPSG:4326`);
  url.searchParams.set("COUNT", "25");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Géoplateforme IGN (BD TOPO bâtiment) a retourné ${response.status}`);
  }

  const payload = (await response.json()) as {
    features?: Array<{
      geometry?: unknown;
      properties?: {
        cleabs?: string;
        hauteur?: number;
        altitude_minimale_sol?: number;
        nature?: string;
        usage_1?: string;
        usage_2?: string;
        nombre_d_etages?: number;
        nombre_de_logements?: number;
        date_construction?: string;
      };
    }>;
  };

  const features = payload.features ?? [];
  if (!features.length) return null;

  // Choisit le bâtiment dont le centroïde est le plus proche du point géocodé.
  let best = features[0];
  let bestDistance = Infinity;
  for (const feature of features) {
    const centroid = centroidOf(feature.geometry);
    if (!centroid) continue;
    const distance = approxDistanceMeters(latitude, longitude, centroid[1], centroid[0]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = feature;
    }
  }

  const props = best.properties;
  if (!best.geometry || !props) return null;

  return {
    cleabs: toStringOrNull(props.cleabs),
    hauteurM: toNumberOrNull(props.hauteur),
    altitudeSolM: toNumberOrNull(props.altitude_minimale_sol),
    nature: toStringOrNull(props.nature),
    usage1: toStringOrNull(props.usage_1),
    usage2: toStringOrNull(props.usage_2),
    nombreEtages: toIntOrNull(props.nombre_d_etages),
    nombreLogements: toIntOrNull(props.nombre_de_logements),
    dateConstruction: toStringOrNull(props.date_construction),
    geometry: best.geometry,
  };
}

export function buildBatimentRecord(propertyId: string, userId: string, reference: BatimentReference): BatimentRecord {
  return {
    property_id: propertyId,
    user_id: userId,
    cleabs: reference.cleabs,
    hauteur_m: reference.hauteurM,
    altitude_sol_m: reference.altitudeSolM,
    nature: reference.nature,
    usage_1: reference.usage1,
    usage_2: reference.usage2,
    nombre_etages: reference.nombreEtages,
    nombre_logements: reference.nombreLogements,
    date_construction: reference.dateConstruction,
    ...(reference.geometry ? { geometry: reference.geometry } : {}),
    source: "BD TOPO® IGN via Géoplateforme (data.geopf.fr)",
    source_url: "https://geoservices.ign.fr/bdtopo",
    metadata: {
      generated_at: new Date().toISOString(),
    },
  };
}

export async function persistBatimentRecord(record: BatimentRecord, authorization: string): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/property_batiment?on_conflict=property_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      Authorization: authorization,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(record),
    cache: "no-store",
  });
  const text = await response.text();
  let saved: unknown = null;
  try { saved = text ? JSON.parse(text) : null; } catch { saved = text; }
  if (!response.ok) {
    throw new Error(`Batiment save failed: ${typeof saved === "string" ? saved : JSON.stringify(saved)}`);
  }
  return saved;
}
