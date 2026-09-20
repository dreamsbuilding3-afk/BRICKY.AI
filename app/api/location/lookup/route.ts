import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/data/geocode";

export const maxDuration = 45;

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
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim().slice(0, 256) : "";
  let latitude = typeof body.latitude === "number" ? body.latitude : Number(body.latitude);
  let longitude = typeof body.longitude === "number" ? body.longitude : Number(body.longitude);

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
    } catch (error) {
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
        note: `Points d'intérêt indisponibles (statut ${lastStatus || 0} - ${lastError || 'inconnu'}).`,
      });
    }

    const data = (await response.json()) as { elements?: Array<Record<string, unknown>> };
    const elements = Array.isArray(data.elements) ? data.elements : [];

    const pois = elements
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
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 60);

    const counts: Record<string, number> = {};
    for (const poi of pois) {
      counts[poi.category] = (counts[poi.category] || 0) + 1;
    }

    return NextResponse.json({
      location,
      pois,
      counts,
      source: "OpenStreetMap (Overpass API) - contributeurs OSM",
      note: "Données communautaires OpenStreetMap : peuvent être incomplètes ou dater. A vérifier sur place avant toute décision.",
    });
  } catch (error) {
    return NextResponse.json({
      location,
      pois: [],
      counts: {},
      source: "OpenStreetMap (Overpass API)",
      note: "Points d'intérêt indisponibles pour le moment. La carte reste affichable avec les coordonnées.",
    });
  }
}
