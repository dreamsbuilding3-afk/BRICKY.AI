// Droits par plan (colonnes de public.subscription_plans, exposées par la RPC
// get_my_subscription). Source unique : la base. Ce fichier ne fait que nommer.

export type PlanFeature =
  | "can_suggest_offer"
  | "can_read_copro_minutes"
  | "can_upload_multi_documents"
  | "can_compare_properties"
  | "can_set_alerts"
  | "can_use_visit_mode"
  | "can_download_full_pdf"
  | "can_share_link";

export type MySubscription = {
  plan_code: string;
  name?: string;
  price_monthly_cents?: number;
  price_yearly_cents?: number | null;
  is_legacy?: boolean;
  /** « owner » : titulaire d'un compte Agence ; « member » : membre d'une équipe Agence (hérite du plan). */
  team_role?: "owner" | "member" | null;
  monthly_analysis_quota?: number | null;
  lifetime_analysis_quota?: number | null;
  used_period?: number;
  used_lifetime?: number;
  can_download_pdf?: boolean;
  white_label?: boolean;
} & Partial<Record<PlanFeature, boolean>>;

/** Clé de traduction du nom de chaque fonction verrouillable. */
export const FEATURE_LABEL_KEY: Record<PlanFeature, string> = {
  can_suggest_offer: "lock.feature.offer",
  can_read_copro_minutes: "lock.feature.copro",
  can_upload_multi_documents: "lock.feature.multiDocs",
  can_compare_properties: "lock.feature.compare",
  can_set_alerts: "lock.feature.alerts",
  can_use_visit_mode: "lock.feature.visit",
  can_download_full_pdf: "lock.feature.fullPdf",
  can_share_link: "lock.feature.share",
};

/** Prix Pro par défaut (centimes) si la base n'a pas pu être lue. */
export const PRO_FALLBACK = { monthly: 3400, yearly: 34000, quota: 25 };

/** Écart mensuel avec Pro, en centimes (0 si l'utilisateur paie déjà autant). */
export function upgradeDeltaCents(currentMonthlyCents: number | null | undefined, proMonthlyCents = PRO_FALLBACK.monthly) {
  const current = currentMonthlyCents ?? 0;
  if (current <= 0) return null; // Découverte : pas de « de plus » qui ait du sens
  return Math.max(0, proMonthlyCents - current);
}
