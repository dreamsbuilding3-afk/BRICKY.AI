import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/auth/requireUser";
import { readProject } from "@/lib/searchProject";
import { buildCriteria, projectFingerprint, scoreListing, type RadarMarket } from "@/lib/radar";
import { isStreamEstateConfigured, normalizeProperty, searchProperties, StreamEstateError, type RadarListing } from "@/lib/streamEstate";
import { buildDvfMarketStats, fetchDvfComparables } from "@/lib/data/dvf";

export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const MIN_INTERVAL_MIN = 30;          // pas plus d'une recherche toutes les 30 min par compte
const FIRST_SCAN_DAYS = 21;           // première recherche : annonces actives des 3 dernières semaines
const MAX_ITEMS = Math.min(100, Number(process.env.RADAR_MAX_ITEMS) || 40); // coût maîtrisé

async function sb(path: string, auth: string, init: { method?: string; body?: unknown; prefer?: string } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: auth,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

type Commune = { code: string; name: string; lat: number | null; lon: number | null };

/** Nom de ville (ou code postal) → commune INSEE, via l'API Découpage administratif de l'État. */
async function resolveCommune(raw: string): Promise<Commune | null> {
  const q = raw.trim();
  const url = new URL("https://geo.api.gouv.fr/communes");
  if (/^\d{5}$/.test(q)) url.searchParams.set("codePostal", q);
  else url.searchParams.set("nom", q);
  url.searchParams.set("fields", "code,nom,centre");
  url.searchParams.set("boost", "population");
  url.searchParams.set("limit", "1");
  try {
    const response = await fetch(url, { next: { revalidate: 604800 }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const [c] = (await response.json()) as { code: string; nom: string; centre?: { coordinates?: [number, number] } }[];
    if (!c?.code) return null;
    return { code: c.code, name: c.nom, lon: c.centre?.coordinates?.[0] ?? null, lat: c.centre?.coordinates?.[1] ?? null };
  } catch {
    return null;
  }
}

/** Prix médian au m² des ventes réelles (DVF) d'une commune, par grande famille de bien. */
async function marketPriceM2(commune: Commune, kind: "maison" | "appartement"): Promise<{ median: number | null; count: number }> {
  if (commune.lat == null || commune.lon == null) return { median: null, count: 0 };
  try {
    const sales = await fetchDvfComparables({ inseeCode: commune.code, latitude: commune.lat, longitude: commune.lon, propertyType: kind, yearsBack: 3 });
    const stats = buildDvfMarketStats(sales);
    return { median: stats.medianPriceM2 ?? null, count: stats.comparableCount };
  } catch {
    return { median: null, count: 0 };
  }
}

async function rentM2(inseeCode: string, house: boolean, auth: string): Promise<number | null> {
  try {
    const rows = await sb(`rent_indicators?insee_code=eq.${encodeURIComponent(inseeCode)}&select=rent_m2_house,rent_m2_apartment`, auth);
    const row = Array.isArray(rows) ? rows[0] : null;
    const v = row ? Number(house && row.rent_m2_house ? row.rent_m2_house : row.rent_m2_apartment) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, { endpoint: "radar.scan", maxRequests: 10, windowSeconds: 3600 });
  if (limited) return limited;
  const unauthorized = await requireUser(request);
  if (unauthorized) return unauthorized;
  const auth = request.headers.get("authorization")!;

  if (!isStreamEstateConfigured()) {
    return NextResponse.json({ error: "Le radar est en cours d'activation.", code: "not_configured" }, { status: 503 });
  }

  try {
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth }, cache: "no-store" });
    const user = (await userResponse.json()) as { id: string; user_metadata?: Record<string, unknown> };
    const project = readProject(user.user_metadata);
    if (!project || !project.cities.length) {
      return NextResponse.json({ error: "Indique au moins une ville dans « Mon projet ».", code: "no_project" }, { status: 400 });
    }

    // Recherche complète si le projet a changé, sinon seulement ce qui a bougé depuis la dernière fois.
    const [state] = ((await sb("radar_state?select=last_scan_at,fingerprint", auth)) ?? []) as { last_scan_at: string | null; fingerprint: string | null }[];
    const fingerprint = projectFingerprint(project);
    const fresh = !state?.last_scan_at || state.fingerprint !== fingerprint;
    if (!fresh && Date.now() - Date.parse(state.last_scan_at!) < MIN_INTERVAL_MIN * 60_000) {
      return NextResponse.json({ skipped: true, last_scan_at: state.last_scan_at, added: 0, updated: 0 });
    }

    const communes = (await Promise.all(project.cities.map(resolveCommune))).filter((c): c is Commune => !!c);
    if (!communes.length) {
      return NextResponse.json({ error: "Bricky ne reconnaît pas les villes de ton projet. Vérifie l'orthographe dans « Mon projet ».", code: "unknown_cities" }, { status: 400 });
    }

    const scanStartedAt = new Date().toISOString();
    const since = fresh
      ? new Date(Date.now() - FIRST_SCAN_DAYS * 86400_000).toISOString()
      : new Date(Date.parse(state.last_scan_at!) - 10 * 60_000).toISOString();
    const raw = await searchProperties(buildCriteria(project, communes.map((c) => c.code), since), MAX_ITEMS);
    const listings = raw.map(normalizeProperty).filter((l): l is RadarListing => !!l && !!l.price);

    // Références de marché : une seule fois par commune et par famille de bien.
    const markets = new Map<string, Promise<RadarMarket>>();
    const marketFor = (l: RadarListing) => {
      const house = l.type === "HOUSE";
      const commune = communes.find((c) => c.code === l.inseeCode) ?? (l.inseeCode ? { code: l.inseeCode, name: l.city ?? "", lat: l.lat, lon: l.lon } : null);
      const key = `${commune?.code}-${house ? "h" : "f"}`;
      if (!markets.has(key)) {
        markets.set(key, (async () => {
          if (!commune) return { medianPriceM2: null, comparables: 0, rentM2: null };
          const [m, r] = await Promise.all([marketPriceM2(commune, house ? "maison" : "appartement"), rentM2(commune.code, house, auth)]);
          return { medianPriceM2: m.median, comparables: m.count, rentM2: r };
        })());
      }
      return markets.get(key)!;
    };

    const rows = await Promise.all(listings.map(async (l) => {
      const s = scoreListing(l, await marketFor(l), project);
      return { user_id: user.id, stream_id: l.id, listing: l, score: s.score, label: s.label, reasons: s.reasons, metrics: s.metrics, updated_at: scanStartedAt };
    }));

    let added = 0;
    if (rows.length) {
      const ids = rows.map((r) => `"${r.stream_id.replace(/"/g, "")}"`).join(",");
      const existing = ((await sb(`radar_matches?select=stream_id&stream_id=in.(${encodeURIComponent(ids)})`, auth)) ?? []) as { stream_id: string }[];
      added = rows.length - existing.length;
      // Les colonnes absentes (statut « gardé » / « masqué ») ne sont pas écrasées.
      await sb("radar_matches?on_conflict=user_id,stream_id", auth, { method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal" });
    }
    await sb("radar_state?on_conflict=user_id", auth, {
      method: "POST",
      body: { user_id: user.id, last_scan_at: scanStartedAt, fingerprint, cities: communes.map((c) => ({ code: c.code, name: c.name })) },
      prefer: "resolution=merge-duplicates,return=minimal",
    });

    return NextResponse.json({ added, updated: rows.length - added, last_scan_at: scanStartedAt, fresh });
  } catch (error) {
    console.error("[radar.scan]", error);
    if (error instanceof StreamEstateError) {
      const message = error.status === 401 || error.status === 403
        ? "La clé Stream Estate est refusée : vérifie-la dans Vercel."
        : error.status === 402
          ? "Le crédit Stream Estate est épuisé."
          : "Le service d'annonces ne répond pas, réessaie dans quelques minutes.";
      return NextResponse.json({ error: message, code: "provider_error" }, { status: 502 });
    }
    const message = error instanceof Error && /radar_(state|matches)/.test(error.message)
      ? "Le radar n'est pas encore installé dans la base de données."
      : "Le radar n'a pas pu se mettre à jour.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
