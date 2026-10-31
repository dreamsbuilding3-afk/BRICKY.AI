// Client Stream Estate (API v2) : annonces immobilières de 1 500+ sites, dédoublonnées
// par bien. Côté serveur uniquement (la clé STREAM_ESTATE_API_KEY ne quitte jamais Vercel).
// Doc : https://next.docs.stream.estate
//
// Les champs sont lus de façon défensive : l'API est récente (v2) et un champ
// absent ne doit jamais faire planter le radar.

const API_BASE = "https://api-v2.stream.estate";

export class StreamEstateNotConfigured extends Error {}
export class StreamEstateError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function isStreamEstateConfigured() {
  return Boolean(process.env.STREAM_ESTATE_API_KEY);
}

async function call(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  const key = process.env.STREAM_ESTATE_API_KEY;
  if (!key) throw new StreamEstateNotConfigured("STREAM_ESTATE_API_KEY manquante");
  const response = await fetch(API_BASE + path, {
    method: init.method ?? "GET",
    headers: {
      "X-API-KEY": key,
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const detail = data && typeof data === "object" ? String((data as Record<string, unknown>).detail ?? (data as Record<string, unknown>).title ?? "") : "";
    throw new StreamEstateError(`Stream Estate ${response.status}${detail ? ` : ${detail}` : ""}`, response.status);
  }
  return data;
}

/** Liste de biens, quel que soit le format de réponse (tableau nu, { items }, JSON:API { data }). */
function itemsOf(data: unknown): Record<string, unknown>[] {
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((data as Record<string, unknown>).items ?? (data as Record<string, unknown>).data ?? [])
      : [];
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => (x.attributes && typeof x.attributes === "object" ? { id: x.id, ...(x.attributes as Record<string, unknown>) } : x));
}

export async function searchProperties(criteria: unknown, size = 30): Promise<Record<string, unknown>[]> {
  return itemsOf(await call("/properties", { method: "POST", body: { criteria, size, page: 1 } }));
}

/** Le même bien publié ailleurs (« moins cher ailleurs ») à partir du lien d'une annonce. */
export async function lookupByUrl(url: string): Promise<Record<string, unknown> | null> {
  try {
    const data = (await call("/properties/lookup-by-url", { method: "POST", body: { url } })) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return null;
    const inner = (data.property && typeof data.property === "object" && "property" in (data.property as object)) ? data.property : data;
    return { id: data.id, ...(inner as Record<string, unknown>) };
  } catch (error) {
    if (error instanceof StreamEstateError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

// ———————————————————————————————————————— Normalisation

export type RadarSource = { slug: string; url: string; price: number | null };

export type RadarListing = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  surface: number | null;
  rooms: number | null;
  bedrooms: number | null;
  type: string | null;          // FLAT, HOUSE…
  city: string | null;
  postalCode: string | null;
  inseeCode: string | null;
  lat: number | null;
  lon: number | null;
  dpe: string | null;
  condition: string | null;     // GOOD, TO_RENOVATE…
  picture: string | null;
  url: string | null;           // annonce à ouvrir (la moins chère si plusieurs)
  sources: RadarSource[];
  priceDrops: { pct: number; at: string; from: number | null; to: number | null }[];
  condoCharges: number | null;
  publishedAt: string | null;
  updatedAt: string | null;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function normalizeProperty(raw: Record<string, unknown>): RadarListing | null {
  const id = str(raw.id) ?? str(raw.uuid);
  const p = obj(raw.property);
  if (!id || !Object.keys(p).length) return null;
  const pricing = obj(p.pricing);
  const area = obj(p.area);
  const unit = obj(p.unit);
  const location = obj(p.location);
  const city = obj(location.city);
  const body = obj(p.body);
  const coords = Array.isArray(obj(location.geometry).coordinates) ? (obj(location.geometry).coordinates as unknown[]) : [];
  const scores = obj(obj(unit.diagnostic).scores);
  const dpe = str(obj(scores.ENERGY_CONSUMPTION).rating);
  const pictures = Array.isArray(p.pictures) ? p.pictures : [];

  const listings = (Array.isArray(raw.listings) ? raw.listings : []).map(obj);
  const sources: RadarSource[] = listings
    .filter((l) => !str(l.expiredAt) && str(l.url))
    .map((l) => ({ slug: str(obj(l.source).slug) ?? "site", url: str(l.url)!, price: num(l.displayedPrice) }));
  const price = num(pricing.displayed) ?? sources.find((s) => s.price)?.price ?? null;
  const cheapest = [...sources].filter((s) => s.price).sort((a, b) => (a.price! - b.price!))[0] ?? sources[0];
  const firstListing = listings[0] ?? {};

  const changes = (Array.isArray(p.changes) ? p.changes : []).map(obj);
  const priceDrops = changes
    .filter((c) => c.attribute === "DISPLAYED_PRICE" && (num(c.variationPercent) ?? 0) < 0)
    .map((c) => ({ pct: num(c.variationPercent)!, at: str(c.occurredAt) ?? "", from: num(c.numericOld), to: num(c.numericNew) }))
    .slice(-5);

  const condo = obj(obj(obj(pricing.sale).fees).condominium);
  const postalCodes = Array.isArray(city.postalCodes) ? city.postalCodes : [];

  return {
    id,
    title: str(body.title) ?? str(firstListing.title) ?? "Annonce sans titre",
    description: (str(body.description) ?? str(firstListing.description) ?? "").slice(0, 1200),
    price,
    surface: num(area.displayed),
    rooms: num(unit.rooms),
    bedrooms: num(unit.bedrooms),
    type: str(p.propertyType) ?? str(obj(p.type).value),
    city: str(city.name),
    postalCode: str(postalCodes[0]),
    inseeCode: str(city.uniqueCode),
    lon: num(coords[0]),
    lat: num(coords[1]),
    dpe: dpe && /^[A-G]$/.test(dpe) ? dpe : null,
    condition: str(unit.condition),
    picture: str(obj(pictures[0]).url),
    url: cheapest?.url ?? null,
    sources,
    priceDrops,
    condoCharges: num(condo.total),
    publishedAt: str(firstListing.publishedAt) ?? str(p.createdAt),
    updatedAt: str(p.updatedAt),
  };
}
