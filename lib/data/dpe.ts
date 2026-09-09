import type { Confidence, DpeResult } from "./types";

const DPE_BASE_URL = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines";

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

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !["rue", "avenue", "av", "boulevard", "bd", "chemin", "route", "de", "du", "des", "la", "le", "les"].includes(token));
}

function addressMatchScore(target: string, candidate: string, targetPostal?: string, candidatePostal?: string): number {
  const targetTokens = addressTokens(target);
  const candidateTokens = new Set(addressTokens(candidate));
  if (targetTokens.length === 0) return targetPostal && candidatePostal && targetPostal === candidatePostal ? 0.6 : 0.3;

  const overlap = targetTokens.filter((token) => candidateTokens.has(token)).length / targetTokens.length;
  const postalBoost = targetPostal && candidatePostal && targetPostal === candidatePostal ? 0.15 : 0;
  return Math.min(1, overlap * 0.85 + postalBoost);
}

function confidenceFromScore(score: number): Confidence {
  if (score >= 0.9) return "high";
  if (score >= 0.7) return "medium";
  if (score >= 0.5) return "low";
  return "none";
}

function dataQuality(row: Record<string, unknown>): "complete" | "partial" | "limited" {
  const fields = [
    row.etiquette_dpe,
    row.etiquette_ges,
    row.surface_habitable_logement,
    row.annee_construction,
    row.date_etablissement_dpe,
  ];
  const present = fields.filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length;
  if (present >= 5) return "complete";
  if (present >= 3) return "partial";
  return "limited";
}

export async function fetchDpe(input: {
  address: string;
  postalCode?: string;
  surfaceM2?: number;
}): Promise<DpeResult | null> {
  const url = new URL(DPE_BASE_URL);
  url.searchParams.set("size", "20");
  url.searchParams.set("q", input.address);
  url.searchParams.set("q_fields", "adresse_ban");
  if (input.postalCode) url.searchParams.set("code_postal_ban_in", input.postalCode);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 21600 },
  });

  if (!response.ok) throw new Error(`ADEME DPE API returned ${response.status}`);

  const payload = (await response.json()) as { results?: Array<Record<string, unknown>> };
  const rows = Array.isArray(payload.results) ? payload.results : [];
  if (!rows.length) return null;

  const ranked = rows
    .map((row) => {
      const address = stringValue(row.adresse_ban ?? row.adresse_brut) ?? "";
      const postal = stringValue(row.code_postal_ban_in ?? row.code_postal_ban);
      const surface = numberValue(row.surface_habitable_logement);
      const addressScore = addressMatchScore(input.address, address, input.postalCode, postal);
      const surfaceScore = input.surfaceM2 && surface
        ? Math.max(0, 1 - Math.abs(surface - input.surfaceM2) / Math.max(input.surfaceM2, surface))
        : 0.5;
      const dateScore = row.date_etablissement_dpe ? 0.1 : 0;
      const score = Math.min(1, addressScore * 0.75 + surfaceScore * 0.15 + dateScore);
      return { row, score, surface };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aDate = Date.parse(String(a.row.date_etablissement_dpe ?? "")) || 0;
      const bDate = Date.parse(String(b.row.date_etablissement_dpe ?? "")) || 0;
      return bDate - aDate;
    });

  const best = ranked[0];
  const row = best.row;
  const score = best.score;
  const matchQuality = score >= 0.9 ? "exact" : score >= 0.7 ? "strong" : "approximate";

  return {
    source: "ADEME_DPE",
    dpeId: stringValue(row.numero_dpe),
    dpeClass: stringValue(row.etiquette_dpe),
    gesClass: stringValue(row.etiquette_ges),
    surfaceM2: best.surface,
    constructionYear: numberValue(row.annee_construction),
    diagnosticDate: stringValue(row.date_etablissement_dpe),
    address: stringValue(row.adresse_ban ?? row.adresse_brut),
    confidence: confidenceFromScore(score),
    matchScore: Number(score.toFixed(3)),
    matchQuality,
    dataQuality: dataQuality(row),
    raw: row,
  };
}
