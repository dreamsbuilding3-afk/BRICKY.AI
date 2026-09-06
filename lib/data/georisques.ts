import type { RiskResult } from "./types";

const RISKS_URL = "https://georisques.gouv.fr/api/v1/gaspar/risques";

function severityForLabel(label: string): RiskResult["severity"] {
  const value = label.toLowerCase();
  if (/(inond|submersion|séisme|sismique|mouvement|industri|nucléaire|volcan|tsunami)/.test(value)) return "high";
  if (/(argile|feu|incendie|radon|cavité|transport)/.test(value)) return "medium";
  return "unknown";
}

export async function fetchGeorisques(inseeCode: string): Promise<RiskResult[]> {
  const url = new URL(RISKS_URL);
  url.searchParams.set("code_insee", inseeCode);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "100");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    throw new Error(`Georisques API returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
    results?: number;
  };

  const rows = payload.data ?? [];
  const risks: RiskResult[] = [];

  for (const row of rows) {
    const details = Array.isArray(row.risques_detail) ? row.risques_detail : [];
    if (details.length) {
      for (const detail of details) {
        if (!detail || typeof detail !== "object") continue;
        const item = detail as Record<string, unknown>;
        const label = String(item.libelle_risque_long ?? item.libelle_risque ?? "Risque identifié");
        risks.push({
          source: "GEORISQUES",
          code: typeof item.code_risque === "string" ? item.code_risque : undefined,
          label,
          severity: severityForLabel(label),
          explanation: "Risque recensé par Géorisques pour la commune.",
          raw: item,
        });
      }
    } else {
      const label = String(row.libelle_risque_long ?? row.libelle_risque ?? row.risque ?? "Risque identifié");
      risks.push({
        source: "GEORISQUES",
        code: typeof row.code_risque === "string" ? row.code_risque : undefined,
        label,
        severity: severityForLabel(label),
        explanation: "Risque recensé par Géorisques pour la commune.",
        raw: row,
      });
    }
  }

  const unique = new Map<string, RiskResult>();
  for (const risk of risks) unique.set(`${risk.code ?? "unknown"}:${risk.label}`, risk);
  return [...unique.values()];
}
