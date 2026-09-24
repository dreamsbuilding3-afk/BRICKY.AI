const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// API Géorisques (BRGM / ministère de la Transition écologique) — service ouvert,
// sans clé. Rapport consolidé couvrant 18 aléas naturels et technologiques pour un
// point donné : https://www.georisques.gouv.fr/doc-api
const GEORISQUES_URL = "https://georisques.gouv.fr/api/v1/resultats_rapport_risque";

export type GeorisquesReport = {
  adresse?: { libelle?: string; longitude?: number; latitude?: number };
  commune?: { libelle?: string; codePostal?: string; codeInsee?: string };
  url?: string;
  risquesNaturels?: Record<string, { present?: boolean; libelle?: string; libelleStatutCommune?: string | null; libelleStatutAdresse?: string | null }>;
  risquesTechnologiques?: Record<string, { present?: boolean; libelle?: string; libelleStatutCommune?: string | null; libelleStatutAdresse?: string | null }>;
};

export async function fetchGeorisquesReport(latitude: number, longitude: number): Promise<GeorisquesReport> {
  const url = new URL(GEORISQUES_URL);
  // L'API attend "longitude,latitude" (ordre inversé par rapport à l'usage courant).
  url.searchParams.set("latlon", `${longitude},${latitude}`);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API Géorisques a retourné ${response.status}`);
  }

  return (await response.json()) as GeorisquesReport;
}

export async function saveEnvironmentalRisks(propertyId: string, report: GeorisquesReport, authorization: string): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_environmental_risks`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_property_id: propertyId, p_report: report }),
    cache: "no-store",
  });
  const text = await response.text();
  let saved: unknown = null;
  try { saved = text ? JSON.parse(text) : null; } catch { saved = text; }
  if (!response.ok) {
    throw new Error(`Environmental risks save failed: ${typeof saved === "string" ? saved : JSON.stringify(saved)}`);
  }
  return saved;
}
