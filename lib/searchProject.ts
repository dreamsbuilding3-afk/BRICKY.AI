// « Mon projet » : ce que l'utilisateur cherche (villes, budget, type de bien…).
// Enregistré dans les métadonnées du compte Supabase ; servira au radar des
// bonnes affaires et à pré-remplir les alertes.

export type ProjectGoal = "invest" | "home" | "both";

export type SearchProject = {
  goal: ProjectGoal;
  cities: string[];
  budget_max: number | null;
  types: string[];
  surface_min: number | null;
  yield_target: number | null;
  updated_at?: string;
};

export const EMPTY_PROJECT: SearchProject = { goal: "invest", cities: [], budget_max: null, types: [], surface_min: null, yield_target: null };

export const GOALS: { value: ProjectGoal; label: string }[] = [
  { value: "invest", label: "Investir pour louer" },
  { value: "home", label: "Ma résidence principale" },
  { value: "both", label: "Les deux" },
];

export const PROJECT_TYPES: { value: string; label: string }[] = [
  { value: "appartement", label: "Appartement" },
  { value: "studio", label: "Studio" },
  { value: "maison", label: "Maison" },
  { value: "immeuble", label: "Immeuble" },
  { value: "local_commercial", label: "Local commercial" },
  { value: "parking", label: "Parking / box" },
  { value: "terrain", label: "Terrain" },
];

/** Lit le projet depuis les métadonnées du compte (tolère des données partielles). */
export function readProject(metadata: Record<string, unknown> | undefined | null): SearchProject | null {
  const raw = metadata?.search_project as Partial<SearchProject> | undefined;
  if (!raw || typeof raw !== "object") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  return {
    goal: raw.goal === "home" || raw.goal === "both" ? raw.goal : "invest",
    cities: Array.isArray(raw.cities) ? raw.cities.filter((c) => typeof c === "string").slice(0, 5) : [],
    budget_max: num(raw.budget_max),
    types: Array.isArray(raw.types) ? raw.types.filter((t) => typeof t === "string") : [],
    surface_min: num(raw.surface_min),
    yield_target: num(raw.yield_target),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
  };
}

/** Résumé en une ligne : « Appartement à Creil ou Lille, jusqu'à 180 000 € ». */
export function projectSummary(p: SearchProject): string {
  const types = p.types.map((t) => PROJECT_TYPES.find((x) => x.value === t)?.label ?? t);
  const what = types.length ? types.join(", ") : "Bien";
  const where = p.cities.length ? ` à ${p.cities.join(" ou ")}` : "";
  const budget = p.budget_max ? `, jusqu'à ${p.budget_max.toLocaleString("fr-FR")} €` : "";
  return `${what}${where}${budget}`;
}
