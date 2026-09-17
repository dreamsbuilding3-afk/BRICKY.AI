const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const APICARTO_PARCELLE_URL = "https://apicarto.ign.fr/api/cadastre/parcelle";

export type CadastralReference = {
  communeCode: string;
  sectionPrefix: string;
  section: string;
  parcelNumber: string;
  parcelId: string;
  contenanceM2?: number;
  geometry?: unknown;
};

export type CadastralRecord = {
  property_id: string;
  user_id: string;
  commune_code: string;
  section_prefix: string;
  section: string;
  parcel_number: string;
  parcel_id: string;
  source: string;
  source_url: string;
  plan_url: string;
  metadata: {
  generated_at: string;
  scale: number;
  format: string;
  lookup_method: "manual" | "auto_coordinates";
  contenance_m2?: number;
  };
};

export function cleanValue(value: unknown, max = 32): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isValidCommune(value: string): boolean {
  return /^[0-9A-Z]{2,5}$/i.test(value);
}
export function isValidPrefix(value: string): boolean {
  return /^\d{3}$/.test(value);
}
export function isValidSection(value: string): boolean {
  return /^[A-Z0-9]{1,2}$/i.test(value);
}
export function isValidParcel(value: string): boolean {
  return /^\d{1,4}$/.test(value);
}

export async function findParcelByCoordinates(
  latitude: number,
  longitude: number,
  ): Promise<CadastralReference | null> {
  const geom = JSON.stringify({ type: "Point", coordinates: [longitude, latitude] });
  const url = new URL(APICARTO_PARCELLE_URL);
  url.searchParams.set("geom", geom);
  url.searchParams.set("_limit", "1");

const response = await fetch(url, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(8000),
  cache: "no-store",
});

if (!response.ok) {
  throw new Error(`API Carto (cadastre) a retourné ${response.status}`);
}

const payload = (await response.json()) as {
  features?: Array<{
    geometry?: unknown;
    properties?: {
    commune?: string;
    prefixe?: string;
    section?: string;
    numero?: string;
    contenance?: number;
    };
  }>;
};

const feature = payload.features?.[0];
  const props = feature?.properties;
  if (!feature || !props?.commune || !props?.section || !props?.numero) return null;

const communeCode = cleanValue(props.commune, 5).toUpperCase();
  const sectionPrefix = cleanValue(props.prefixe || "000", 3).padStart(3, "0");
  const section = cleanValue(props.section, 2).toUpperCase();
  const parcelNumber = cleanValue(props.numero, 4);

if (!isValidCommune(communeCode) || !isValidPrefix(sectionPrefix) || !isValidSection(section) || !isValidParcel(parcelNumber)) {
  return null;
}

return {
                                                        communeCode,
  sectionPrefix,
  section,
  parcelNumber,
  parcelId: `${communeCode}${sectionPrefix}${section}${parcelNumber}`,
  contenanceM2: typeof props.contenance === "number" ? props.contenance : undefined,
  geometry: feature.geometry,
};
}

export function buildPlanUrl(reference: Pick<CadastralReference, "communeCode" | "sectionPrefix" | "section" | "parcelNumber">): string {
  const planUrl = new URL("https://sandbox.geo.api.gouv.fr/scpc/");
  planUrl.searchParams.set("commune", reference.communeCode);
  planUrl.searchParams.set("prefixe", reference.sectionPrefix);
  planUrl.searchParams.set("section", reference.section);
  planUrl.searchParams.set("parcelle", reference.parcelNumber);
  planUrl.searchParams.set("echelle", "1000");
  planUrl.searchParams.set("taille", "A4");
  planUrl.searchParams.set("orientation", "paysage");
  return planUrl.toString();
}

export async function assertPropertyOwnership(propertyId: string, authorization: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw Object.assign(new Error("Supabase environment variables are not configured."), { status: 500 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(propertyId)) {
    throw Object.assign(new Error("property_id invalide."), { status: 400 });
  }

const response = await fetch(
  `${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}&select=id,user_id`,
  { headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization }, cache: "no-store" },
  );
  const properties = await response.json();
  if (!response.ok || !Array.isArray(properties) || properties.length !== 1 || !properties[0]?.user_id) {
    throw Object.assign(new Error("Bien introuvable ou non accessible."), { status: 404 });
  }
  return properties[0].user_id as string;
}

export function buildCadastralRecord(
  propertyId: string,
  userId: string,
  reference: CadastralReference,
  lookupMethod: "manual" | "auto_coordinates",
  ): CadastralRecord {
  return {
    property_id: propertyId,
    user_id: userId,
    commune_code: reference.communeCode,
    section_prefix: reference.sectionPrefix,
    section: reference.section,
    parcel_number: reference.parcelNumber,
    parcel_id: reference.parcelId,
    source: "DGFiP / cadastre.gouv.fr via API SCPC Etalab",
    source_url: "https://cadastre.data.gouv.fr/datasets/cadastre-etalab",
    plan_url: buildPlanUrl(reference),
    metadata: {
      generated_at: new Date().toISOString(),
      scale: 1000,
      format: "A4 paysage",
      lookup_method: lookupMethod,
      ...(reference.contenanceM2 ? { contenance_m2: reference.contenanceM2 } : {}),
    },
  };
}

export async function persistCadastralRecord(record: CadastralRecord, authorization: string): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/property_cadastral?on_conflict=property_id`, {
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
    throw new Error(`Cadastre save failed: ${typeof saved === "string" ? saved : JSON.stringify(saved)}`);
  }
  return saved;
}
