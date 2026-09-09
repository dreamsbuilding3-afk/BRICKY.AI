import type { RiskCategory, RiskResult, RiskSummary } from "./types";

const RISKS_URL = "https://georisques.gouv.fr/api/v1/gaspar/risques";

function categoryForLabel(label: string): RiskCategory {
  const value = label.toLowerCase();
  if (/inond|submersion/.test(value)) return "flood";
  if (/séisme|sismique/.test(value)) return "earthquake";
  if (/mouvement|glissement|effondrement/.test(value)) return "ground_movement";
  if (/argile|retrait.?gonflement/.test(value)) return "clay";
  if (/industri|usine|seveso/.test(value)) return "industrial";
  if (/feu|incendie|forêt|foret/.test(value)) return "wildfire";
  if (/radon/.test(value)) return "radon";
  if (/cavité|cavite|souterrain/.test(value)) return "cavity";
  if (/volcan/.test(value)) return "volcanic";
  if (/tsunami/.test(value)) return "tsunami";
  if (/transport/.test(value)) return "transport";
  return "other";
}

// This is a BRICKY signal, not an official legal severity from Géorisques.
function severityForCategory(category: RiskCategory): RiskResult["severity"] {
  if (["flood", "earthquake", "ground_movement", "industrial", "volcanic", "tsunami"].includes(category)) return "high";
  if (["clay", "wildfire", "radon", "cavity", "transport"].includes(category)) return "medium";
  return "unknown";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

  if (!response.ok) throw new Error(`Georisques API returned ${response.status}`);

  const payload = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
  };

  const rows = Array.isArray(payload.data) ? payload.data : [];
  const risks: RiskResult[] = [];

  for (const row of rows) {
    const details = Array.isArray(row.risques_detail) ? row.risques_detail : [];
    const candidates = details.length ? details : [row];

    for (const detail of candidates) {
      if (!detail || typeof detail !== "object") continue;
      const item = detail as Record<string, unknown>;
      const label = stringValue(item.libelle_risque_long ?? item.libelle_risque ?? item.risque) ?? "Risque identifié";
      const category = categoryForLabel(label);

      risks.push({
        source: "GEORISQUES",
        code: stringValue(item.code_risque ?? row.code_risque),
        label,
        category,
        severity: severityForCategory(category),
        explanation: "Signal territorial recensé par Géorisques pour la commune. Le niveau BRICKY est une heuristique et ne remplace pas l'information officielle détaillée.",
        raw: item,
      });
    }
  }

  const unique = new Map<string, RiskResult>();
  for (const risk of risks) unique.set(`${risk.code ?? "unknown"}:${risk.category}:${risk.label}`, risk);
  return [...unique.values()];
}

export function buildRiskSummary(risks: RiskResult[]): RiskSummary {
  const counts = new Map<RiskCategory, number>();
  for (const risk of risks) counts.set(risk.category, (counts.get(risk.category) ?? 0) + 1);

  const categories = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const highSignalCategories = categories
    .filter(({ category }) => ["flood", "earthquake", "ground_movement", "industrial", "volcanic", "tsunami"].includes(category))
    .map(({ category }) => category);

  return {
    source: "GEORISQUES",
    totalRisks: risks.length,
    categories,
    highSignalCategories,
    methodology: "Catégorisation BRICKY des libellés Géorisques par type d'aléa. La présence d'un signal ne constitue pas à elle seule une conclusion juridique ou technique sur le bien.",
  };
}
