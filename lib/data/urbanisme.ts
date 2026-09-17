const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const GPU_ZONE_URBA_URL = "https://apicarto.ign.fr/api/gpu/zone-urba";

// Nomenclature simplifiée du document d'urbanisme (PLU/PLUi) :
// U = zone urbaine, AU = zone à urbaniser, A = zone agricole, N = zone naturelle/forestière.
const TYPEZONE_LABELS: Record<string, string> = {
  U: "Zone urbaine",
  AU: "Zone à urbaniser",
  A: "Zone agricole",
  N: "Zone naturelle et forestière",
};

export type ZonageReference = {
  zoneType: string | null;
  zoneLabel: string | null;
  zoneLabelLong: string | null;
  destinationDominante: string | null;
  documentPartition: string | null;
  approvalDate: string | null;
  regulationUrl: string | null;
  inseeCode: string | null;
  geometry?: unknown;
};

export type UrbanismeRecord = {
  property_id: string;
  user_id: string;
  insee_code: string | null;
  zone_type: string | null;
  zone_label: string | null;
  zone_label_long: string | null;
  destination_dominante: string | null;
  document_partition: string | null;
  approval_date: string | null;
  regulation_url: string | null;
  geometry?: unknown;
  source: string;
  source_url: string;
  metadata: {
    generated_at: string;
    typezone_label: string | null;
  };
};

export function typezoneLabel(typezone: string | null): string | null {
  if (!typezone) return null;
  const key = typezone.trim().toUpperCase();
  return TYPEZONE_LABELS[key] ?? typezone;
}

export async function findZonage(latitude: number, longitude: number): Promise<ZonageReference | null> {
  const geom = JSON.stringify({ type: "Point", coordinates: [longitude, latitude] });
  const url = new URL(GPU_ZONE_URBA_URL);
  url.searchParams.set("geom", geom);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API Carto (GPU zone-urba) a retourné ${response.status}`);
  }

  const payload = (await response.json()) as {
    features?: Array<{
      geometry?: unknown;
      properties?: {
        typezone?: string;
        libelle?: string;
        libelong?: string;
        destdomi?: string;
        partition?: string;
        datappro?: string;
        urlfic?: string;
        insee?: string;
      };
    }>;
  };

  const feature = payload.features?.[0];
  const props = feature?.properties;
  if (!feature || !props) return null;

  return {
    zoneType: props.typezone ?? null,
    zoneLabel: props.libelle ?? null,
    zoneLabelLong: props.libelong ?? null,
    destinationDominante: props.destdomi ?? null,
    documentPartition: props.partition ?? null,
    approvalDate: props.datappro ?? null,
    regulationUrl: props.urlfic ?? null,
    inseeCode: props.insee ?? null,
    geometry: feature.geometry,
  };
}

export function buildUrbanismeRecord(propertyId: string, userId: string, reference: ZonageReference): UrbanismeRecord {
  return {
    property_id: propertyId,
    user_id: userId,
    insee_code: reference.inseeCode,
    zone_type: reference.zoneType,
    zone_label: reference.zoneLabel,
    zone_label_long: reference.zoneLabelLong,
    destination_dominante: reference.destinationDominante,
    document_partition: reference.documentPartition,
    approval_date: reference.approvalDate,
    regulation_url: reference.regulationUrl,
    ...(reference.geometry ? { geometry: reference.geometry } : {}),
    source: "Géoportail de l'Urbanisme (GPU) via API Carto IGN",
    source_url: "https://www.geoportail-urbanisme.gouv.fr/",
    metadata: {
      generated_at: new Date().toISOString(),
      typezone_label: typezoneLabel(reference.zoneType),
    },
  };
}

export async function persistUrbanismeRecord(record: UrbanismeRecord, authorization: string): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/property_urbanisme?on_conflict=property_id`, {
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
    throw new Error(`Urbanisme save failed: ${typeof saved === "string" ? saved : JSON.stringify(saved)}`);
  }
  return saved;
}
