import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { geocodeAddress } from "@/lib/data/geocode";

export const maxDuration = 45;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const RADIUS_M = 700;

type CategoryKey = "school" | "transport" | "shop" | "health" | "park" | "other";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  school: "Écoles et établissements scolaires",
  transport: "Transports en commun",
  shop: "Commerces du quotidien",
  health: "Santé",
  park: "Parcs et espaces verts",
  other: "Autres points d'intérêt",
};

type Poi = {
  name: string;
  category: CategoryKey;
  category_label: string;
  distance_m: number;
  latitude: number;
  longitude: number;
};

function cleanValue(value: unknown, max = 64): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function categorize(tags: Record<string, string>): CategoryKey {
  const amenity = tags.amenity || "";
  const shop = tags.shop || "";
  if (["school", "kindergarten", "college", "university"].includes(amenity)) return "school";
  if (tags.highway === "bus_stop" || ["station", "halt", "tram_stop"].includes(tags.railway || "")) return "transport";
  if (["pharmacy", "hospital", "clinic", "doctors"].includes(amenity)) return "health";
  if (["supermarket", "bakery", "convenience", "greengrocer", "butcher"].includes(shop)) return "shop";
  if (tags.leisure === "park") return "park";
  return "other";
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildOverpassQuery(lat: number, lon: number): string {
  const around = `around:${RADIUS_M},${lat},${lon}`;
  return `[out:json][timeout:20];(node(${around})[amenity~"^(school|kindergarten|college|university|pharmacy|hospital|clinic|doctors)$"];node(${around})[shop~"^(supermarket|bakery|convenience|greengrocer|butcher)$"];node(${around})[highway=bus_stop];node(${around})[railway~"^(station|halt|tram_stop)$"];node(${around})[leisure=park];way(${around})[leisure=park];);out center 80;`;
}

async function assertPropertyOwnership(propertyId: string, authorization: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return null;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}&select=id,user_id`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization }, cache: "no-store" },
  );
  const properties = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(properties) || properties.length !== 1 || !properties[0]?.user_id) {
    return null;
  }
  return properties[0].user_id as string;
}

async function readLocationCache(propertyId: string, authorization: string): Promise<{
  latitude: number;
  longitude: number;
  pois: Poi[];
  counts: Record<string, number>;
  source: string | null;
  note: string | null;
} | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !propertyId) return null;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/property_location?property_id=eq.${encodeURIComponent(propertyId)}&select=*`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization }, cache: "no-store" },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<Record<string, unknown>>;
    const row = rows?.[0];
    if (!row || !Array.isArray(row.pois) || (row.pois as unknown[]).length === 0) return null;
    return {
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      pois: row.pois as Poi[],
      counts: (row.counts as Record<string, number>) || {},
      source: (row.source as string) || null,
      note: (row.note as string) || null,
    };
  } catch {
    return null;
  }
}

async function persistLocationCache(
  propertyId: string,
  userId: string,
  authorization: string,
  data: { latitude: number; longitude: number; pois: Poi[]; counts: Record<string, number>; source: string; note: string },
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !propertyId || !userId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/property_location?on_conflict=property_id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: authorization,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        property_id: propertyId,
        user_id: userId,
        latitude: data.latitude,
        longitude: data.longitude,
        pois: data.pois,
        counts: data.counts,
        source: data.source,
        note: data.note,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });
  } catch {
    // Cache best-effort : on ne bloque jamais la réponse pour un échec de sauvegarde.
  }
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "location.lookup", maxRequests: 30, windowSeconds: 60 });
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
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const propertyId = cleanValue(body.property_id, 64);
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 256) : "";
  let latitude = typeof body.latitude === "number" ? body.latitude : Number(body.latitude);
  let longitude = typeof body.longitude === "number" ? body.longitude : Number(body.longitude);

  let ownerUserId: string | null = null;
  if (propertyId) {
    ownerUserId = await assertPropertyOwnership(propertyId, authorization);
    if (!ownerUserId) {
      return NextResponse.json({ error: "Bien introuvable ou non accessible." }, { status: 404 });
    }
    const cached = await readLocationCache(propertyId, authorization);
    if (cached) {
      return NextResponse.json({
        location: { latitude: cached.latitude, longitude: cached.longitude },
        pois: cached.pois,
        counts: cached.counts,
        source: cached.source,
        note: cached.note,
        cached: true,
      });
    }
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    if (!address) {
      return NextResponse.json({ error: "Fournis une adresse ou des coordonnées." }, { status: 400 });
    }
    try {
      const geocode = await geocodeAddress(address);
      if (!geocode) {
        return NextResponse.json({ error: "Adresse introuvable : impossible de la geolocaliser." }, { status: 422 });
      }
      latitude = geocode.latitude;
      longitude = geocode.longitude;
    } catch {
      return NextResponse.json({ error: "Géolocalisation impossible pour le moment." }, { status: 502 });
    }
  }

  const location = { latitude, longitude };

  try {
    const query = buildOverpassQuery(latitude, longitude);
    let response: Response | null = null;
    let lastStatus = 0;
    let lastError = "";
    for (const overpassUrl of OVERPASS_URLS) {
      try {
        const attempt = await fetch(overpassUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "BrickyAI-App/1.0 (immo analysis; contact via app)",
            "Accept": "application/json",
          },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(13000),
          cache: "no-store",
        });
        if (attempt.ok) { response = attempt; break; }
        lastStatus = attempt.status;
        try { lastError = (await attempt.text()).slice(0, 200); } catch { lastError = ""; }
      } catch (fetchError) {
        lastError = fetchError instanceof Error ? `${fetchError.name}: ${fetchError.message}` : String(fetchError);
        continue;
      }
    }

    if (!response) {
      return NextResponse.json({
        location,
        pois: [],
        counts: {},
        source: "OpenStreetMap (Overpass API)",
        note: `Points d'intérêt indisponibles (statut ${lastStatus || 0} - ${lastError || "inconnu"}).`,
      });
    }

    const data = (await response.json()) as { elements?: Array<Record<string, unknown>> };
    const elements = Array.isArray(data.elements) ? data.elements : [];

    const pois: Poi[] = elements
      .map((el) => {
        const tags = (el.tags as Record<string, string>) || {};
        const elLat = typeof el.lat === "number" ? el.lat : (el.center as { lat?: number } | undefined)?.lat;
        const elLon = typeof el.lon === "number" ? el.lon : (el.center as { lon?: number } | undefined)?.lon;
        if (elLat == null || elLon == null) return null;
        const category = categorize(tags);
        return {
          name: tags.name || CATEGORY_LABELS[category],
          category,
          category_label: CATEGORY_LABELS[category],
          distance_m: haversineMeters(latitude, longitude, elLat, elLon),
          latitude: elLat,
          longitude: elLon,
        };
      })
      .filter((p): p is Poi => p !== null)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 60);

    const counts: Record<string, number> = {};
    for (const poi of pois) {
      counts[poi.category] = (counts[poi.category] || 0) + 1;
    }

    const source = "OpenStreetMap (Overpass API) - contributeurs OSM";
    const note = "Données communautaires OpenStreetMap : peuvent être incomplètes ou dater. A vérifier sur place avant toute décision.";

    if (propertyId && ownerUserId && pois.length > 0) {
      await persistLocationCache(propertyId, ownerUserId, authorization, { latitude, longitude, pois, counts, source, note });
    }

    return NextResponse.json({ location, pois, counts, source, note, cached: false });
  } catch {
    return NextResponse.json({
      location,
      pois: [],
      counts: {},
      source: "OpenStreetMap (Overpass API)",
      note: "Points d'intérêt indisponibles pour le moment. La carte reste affichable avec les coordonnées.",
    });
  }
}
