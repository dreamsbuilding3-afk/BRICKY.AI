import type { DpeResult } from "./types";

const DPE_BASE_URL = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines";

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export async function fetchDpe(input: {
  address: string;
  postalCode?: string;
  surfaceM2?: number;
}): Promise<DpeResult | null> {
  const url = new URL(DPE_BASE_URL);
  url.searchParams.set("size", "10");
  url.searchParams.set("q", input.address);
  url.searchParams.set("q_fields", "adresse_ban");
  if (input.postalCode) url.searchParams.set("code_postal_ban_in", input.postalCode);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    throw new Error(`ADEME DPE API returned ${response.status}`);
  }

  const payload = (await response.json()) as { results?: Array<Record<string, unknown>> };
  const rows = payload.results ?? [];
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => {
    const aDate = Date.parse(String(a.date_etablissement_dpe ?? "")) || 0;
    const bDate = Date.parse(String(b.date_etablissement_dpe ?? "")) || 0;
    return bDate - aDate;
  });

  const row = sorted[0];
  const surface = numberValue(row.surface_habitable_logement);
  const score = typeof row._score === "number" ? row._score : undefined;

  return {
    source: "ADEME_DPE",
    dpeId: typeof row.numero_dpe === "string" ? row.numero_dpe : undefined,
    dpeClass: typeof row.etiquette_dpe === "string" ? row.etiquette_dpe : undefined,
    gesClass: typeof row.etiquette_ges === "string" ? row.etiquette_ges : undefined,
    surfaceM2: surface,
    constructionYear: numberValue(row.annee_construction),
    diagnosticDate: typeof row.date_etablissement_dpe === "string" ? row.date_etablissement_dpe : undefined,
    address: typeof row.adresse_ban === "string" ? row.adresse_ban : typeof row.adresse_brut === "string" ? row.adresse_brut : undefined,
    confidence: score !== undefined ? score >= 0.85 ? "high" : score >= 0.6 ? "medium" : "low" : "medium",
    raw: row,
  };
}
