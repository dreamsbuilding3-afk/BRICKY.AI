"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase/client";
import { useLocale } from "../../components/LocaleProvider";
import PricingHero from "../../components/PricingHero";
import type { Locale } from "../../lib/i18n/translations";
import "./pricing.css";

type Plan = {
  plan_code: string;
  name: string;
  price_monthly_cents: number;
  price_yearly_cents: number | null;
  lifetime_analysis_quota: number | null;
  monthly_analysis_quota: number | null;
  can_download_pdf: boolean;
  can_download_full_pdf?: boolean;
  can_use_financing_simulator: boolean;
  can_share_link: boolean;
  can_compare_properties: boolean;
  can_set_alerts: boolean;
  can_suggest_offer?: boolean;
  can_read_copro_minutes?: boolean;
  can_upload_multi_documents?: boolean;
  can_use_visit_mode?: boolean;
  white_label: boolean;
  multi_user: boolean;
  api_export: boolean;
  is_public?: boolean;
  sort_order: number;
};
type Billing = "monthly" | "yearly";
type T = (key: string, vars?: Record<string, string | number>) => string;

// Droits ajoutés par la migration 20261123120000 : valeurs de secours si la page
// est servie avant que la migration ne soit appliquée.
const NEW_FLAGS = ["can_download_full_pdf", "can_suggest_offer", "can_read_copro_minutes", "can_upload_multi_documents", "can_use_visit_mode"] as const;
const PAID_FULL = new Set(["pro", "agence"]);

function flag(plan: Plan, key: keyof Plan): boolean {
  const v = plan[key];
  if (typeof v === "boolean") return v;
  if ((NEW_FLAGS as readonly string[]).includes(key as string)) return PAID_FULL.has(plan.plan_code);
  return false;
}

const PLAN_AUDIENCE_KEY: Record<string, string> = {
  essentiel: "pricing.audience.essentiel",
  pro: "pricing.audience.pro",
  agence: "pricing.audience.agence",
};

// Lignes du comparatif. « base » = inclus dans tout plan payant.
type Row = { label: string; get: (p: Plan) => boolean | "quota" };
const BASE = () => true;
const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "pricing.compare.section.analysis",
    rows: [
      { label: "pricing.row.analyses", get: () => "quota" },
      { label: "pricing.row.buyRent", get: BASE },
      { label: "pricing.row.verdict", get: BASE },
      { label: "pricing.row.yield", get: BASE },
      { label: "pricing.row.risks", get: BASE },
      { label: "pricing.row.cadastre", get: BASE },
      { label: "pricing.row.plu", get: BASE },
      { label: "pricing.row.area", get: BASE },
      { label: "pricing.row.financing", get: (p) => flag(p, "can_use_financing_simulator") },
      { label: "pricing.row.pdfSummary", get: (p) => flag(p, "can_download_pdf") },
    ],
  },
  {
    title: "pricing.compare.section.decide",
    rows: [
      { label: "pricing.row.offer", get: (p) => flag(p, "can_suggest_offer") },
      { label: "pricing.row.copro", get: (p) => flag(p, "can_read_copro_minutes") },
      { label: "pricing.row.multiDocs", get: (p) => flag(p, "can_upload_multi_documents") },
      { label: "pricing.row.compare", get: (p) => flag(p, "can_compare_properties") },
      { label: "pricing.row.pdfFull", get: (p) => flag(p, "can_download_full_pdf") },
    ],
  },
  {
    title: "pricing.compare.section.field",
    rows: [
      { label: "pricing.row.alerts", get: (p) => flag(p, "can_set_alerts") },
      { label: "pricing.row.visit", get: (p) => flag(p, "can_use_visit_mode") },
      { label: "pricing.row.share", get: (p) => flag(p, "can_share_link") },
    ],
  },
  {
    title: "pricing.compare.section.agency",
    rows: [
      { label: "pricing.row.whiteLabel", get: (p) => flag(p, "white_label") },
      { label: "pricing.row.multiUser", get: (p) => flag(p, "multi_user") },
      { label: "pricing.row.apiExport", get: (p) => flag(p, "api_export") },
    ],
  },
];
const ALL_ROWS = SECTIONS.flatMap((s) => s.rows);

function numberLocale(locale: Locale) {
  if (locale === "en") return "en-US";
  if (locale === "zh") return "zh-CN";
  return "fr-FR";
}

function euros(cents: number, locale: Locale) {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString(numberLocale(locale), { style: "currency", currency: "EUR", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}

function analysesText(plan: Plan, t: T) {
  if (plan.lifetime_analysis_quota != null) return t("pricing.feature.analysesLifetime", { n: plan.lifetime_analysis_quota });
  if (plan.monthly_analysis_quota == null) return t("pricing.feature.analysesUnlimited");
  return t("pricing.feature.analysesMonthly", { n: plan.monthly_analysis_quota });
}

function yearlyCents(plan: Plan) {
  return plan.price_yearly_cents ?? plan.price_monthly_cents * 12;
}

/** Prix par analyse, en mensuel et en annuel (Essentiel 5,80 € / 4,83 € ; Pro 1,36 € / 1,13 €). */
function perAnalysis(plan: Plan) {
  const q = plan.monthly_analysis_quota;
  if (!q || !plan.price_monthly_cents) return null;
  return { monthly: Math.round(plan.price_monthly_cents / q), yearly: Math.round(yearlyCents(plan) / 12 / q) };
}

function Mark({ ok, t }: { ok: boolean; t: T }) {
  return ok ? (
    <span className="tl-yes" role="img" aria-label={t("pricing.compare.yes")}>✓</span>
  ) : (
    <span className="tl-no" role="img" aria-label={t("pricing.compare.no")}>✗</span>
  );
}

function CtaArrow() {
  return (
    <span className="tl-cta-arrow" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 9 9 3M4.5 3H9v4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

function checkoutHref(plan: Plan, billing: Billing) {
  if (plan.plan_code === "agence") return "/contact?sujet=agence";
  return `/checkout?plan=${plan.plan_code}&periode=${billing === "yearly" ? "annuel" : "mensuel"}`;
}

const FAQ_COUNT = 8;

export default function PricingPage() {
  const { locale, t } = useLocale();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [decouverte, setDecouverte] = useState<Plan | null>(null);
  const [current, setCurrent] = useState<{ code: string; monthly: number } | null>(null);
  const [billing, setBilling] = useState<Billing>("yearly");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: planRows, error } = await supabase.from("subscription_plans").select("*").order("sort_order", { ascending: true });
      if (error || !planRows || planRows.length === 0) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      const rows = planRows as Plan[];
      setDecouverte(rows.find((p) => p.plan_code === "decouverte") ?? null);
      setPlans(rows.filter((p) => p.is_public !== false && p.price_monthly_cents > 0));

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        const { data: sub } = await supabase.rpc("get_my_subscription");
        if (sub && typeof sub === "object" && "plan_code" in sub) {
          const s = sub as { plan_code: string; price_monthly_cents?: number };
          setCurrent({ code: s.plan_code, monthly: s.price_monthly_cents ?? 0 });
        }
      }
      setLoading(false);
    })();
  }, []);

  // Un abonné historique (19 €) est rattaché visuellement à la carte Essentiel.
  const currentCard = current?.code === "essentiel_legacy" ? "essentiel" : current?.code;

  return (
    <main className="page tl-page">
      <nav className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="mark">B</span>Bricky
        </Link>
        <div className="nav-links">
          <Link className="navlink" href="/login">{t("nav.login")}</Link>
          <Link className="nav-cta" href="/analyze">{t("nav.cta")}</Link>
        </div>
      </nav>

      <PricingHero />

      <section className="pricing-intro">
        <span className="eyebrow">{t("pricing.intro.eyebrow")}</span>
        <h1>{t("pricing.intro.title")}</h1>
        <p className="trial-note" style={{ textAlign: "center", margin: "14px auto 0" }}>{t("pricing.intro.note")}</p>
      </section>

      <div className="tl-billing" role="radiogroup" aria-label={t("pricing.billing.label")}>
        <button type="button" role="radio" aria-checked={billing === "monthly"} className={billing === "monthly" ? "is-on" : ""} onClick={() => setBilling("monthly")}>
          {t("pricing.billing.monthly")}
        </button>
        <button type="button" role="radio" aria-checked={billing === "yearly"} className={billing === "yearly" ? "is-on" : ""} onClick={() => setBilling("yearly")}>
          {t("pricing.billing.yearly")} <em>{t("pricing.billing.save")}</em>
        </button>
      </div>

      {loading ? null : loadError ? (
        <section className="pricing-intro"><div className="error-box" style={{ maxWidth: 520, margin: "0 auto" }}>{t("pricing.loadError")}</div></section>
      ) : (
        <>
          <section className="tl-grid" aria-label={t("pricing.intro.eyebrow")}>
            {plans.map((plan, index) => {
              const featured = plan.plan_code === "pro";
              const isCurrent = currentCard === plan.plan_code;
              const prev = index > 0 ? plans[index - 1] : null;
              const next = plans[index + 1] ?? null;
              const per = perAnalysis(plan);
              const yearly = yearlyCents(plan);
              // Carte : le premier plan liste ses inclusions et, barré, ce qui manque par rapport au suivant ;
              // les autres listent ce qu'ils ajoutent au précédent.
              const featureRows = ALL_ROWS.filter((r) => r.label !== "pricing.row.analyses");
              const included = prev
                ? featureRows.filter((r) => r.get(plan) === true && r.get(prev) !== true)
                : featureRows.filter((r) => r.get(plan) === true);
              const missing = !prev && next ? featureRows.filter((r) => r.get(plan) !== true && r.get(next) === true) : [];
              return (
                <article key={plan.plan_code} className={"tl-card" + (featured ? " tl-card-featured" : "") + (isCurrent ? " tl-card-current" : "")}>
                  {featured ? <span className="tl-badge">{t("pricing.popular")}</span> : null}
                  <h2>{plan.name}</h2>
                  {PLAN_AUDIENCE_KEY[plan.plan_code] ? <p className="tl-audience">{t(PLAN_AUDIENCE_KEY[plan.plan_code])}</p> : null}

                  <div className="tl-price">
                    <b>{euros(billing === "yearly" ? yearly : plan.price_monthly_cents, locale)}</b>
                    <span>{billing === "yearly" ? t("pricing.price.perYear") : t("pricing.price.perMonth")}</span>
                  </div>
                  <p className="tl-billed">
                    {billing === "yearly" ? t("pricing.price.billedYearly", { amount: euros(Math.round(yearly / 12), locale) }) : t("pricing.price.billedMonthly")}
                  </p>

                  {per ? (
                    <div className="tl-per">
                      <span className={billing === "monthly" ? "is-on" : ""}>{t("pricing.perAnalysis.monthly", { amount: euros(per.monthly, locale) })}</span>
                      <span className={billing === "yearly" ? "is-on" : ""}>{t("pricing.perAnalysis.yearly", { amount: euros(per.yearly, locale) })}</span>
                    </div>
                  ) : null}

                  {isCurrent ? (
                    <p className="tl-current">
                      {current?.code === "essentiel_legacy" ? t("pricing.legacyBadge", { amount: euros(current.monthly, locale) }) : t("pricing.currentBadge")}
                    </p>
                  ) : null}

                  <ul className="tl-features">
                    <li className="tl-quota"><Mark ok t={t} />{analysesText(plan, t)}</li>
                    {prev ? <li className="tl-everything">{t("pricing.everythingIn", { plan: prev.name })}</li> : null}
                    {included.map((r) => <li key={r.label}><Mark ok t={t} />{t(r.label)}</li>)}
                    {missing.map((r) => <li key={r.label} className="tl-missing"><Mark ok={false} t={t} />{t(r.label)}</li>)}
                  </ul>

                  {plan.plan_code === "agence" ? (
                    <div className="pricing-network">
                      <span className="pricing-network-badge">{t("pricing.network.badge")}</span>
                      <p className="pricing-network-text">{t("pricing.network.text")}</p>
                    </div>
                  ) : null}

                  <Link className={"tl-cta" + (featured ? " tl-cta-primary" : "")} href={checkoutHref(plan, billing)}>
                    {plan.plan_code === "agence" ? t("pricing.cta.contact") : t("pricing.cta.choose", { plan: plan.name })}
                    <CtaArrow />
                  </Link>
                </article>
              );
            })}
          </section>

          {decouverte ? (
            <section className="tl-free">
              <div>
                <b>{t("pricing.decouverte.title")}</b>
                <span>{t("pricing.decouverte.text")}</span>
              </div>
              <Link className="tl-free-cta" href="/analyze">{t("pricing.decouverte.cta")}</Link>
            </section>
          ) : null}

          <section className="pricing-pack" aria-labelledby="pricing-pack-title">
            <div className="pricing-pack-text">
              <span className="pricing-pack-eyebrow">{t("pricing.pack.eyebrow")}</span>
              <h2 id="pricing-pack-title">{t("pricing.pack.title")}</h2>
              <p>{t("pricing.pack.desc")}</p>
            </div>
            <div className="pricing-pack-offer">
              <div className="pricing-pack-price">{t("pricing.pack.price")}</div>
              <div className="pricing-pack-unit">{t("pricing.pack.unit")}</div>
              <Link className="primary-button pricing-pack-cta" href="/checkout?plan=pack">{t("pricing.pack.cta")}</Link>
              <span className="pricing-pack-note">{t("pricing.pack.note")}</span>
            </div>
          </section>

          <section className="tl-compare" aria-labelledby="tl-compare-title">
            <div className="pricing-compare-intro">
              <span className="eyebrow">{t("pricing.compare.eyebrow")}</span>
              <h2 id="tl-compare-title">{t("pricing.compare.title")}</h2>
            </div>
            <div className="tl-table-wrap">
              <table className="tl-table">
                <thead>
                  <tr>
                    <th scope="col"><span className="tl-sr">{t("pricing.compare.eyebrow")}</span></th>
                    {plans.map((plan) => (
                      <th key={plan.plan_code} scope="col" className={plan.plan_code === "pro" ? "tl-col-pro" : ""}>
                        {plan.plan_code === "pro" ? <span className="tl-th-badge">{t("pricing.popular")}</span> : null}
                        <span className="tl-th-name">{plan.name}</span>
                        <span className="tl-th-price">
                          {euros(billing === "yearly" ? yearlyCents(plan) : plan.price_monthly_cents, locale)}
                          {billing === "yearly" ? t("pricing.price.perYear") : t("pricing.price.perMonth")}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map((section) => (
                    <SectionRows key={section.title} title={section.title} rows={section.rows} plans={plans} t={t} />
                  ))}
                  <tr className="tl-row-per">
                    <th scope="row">{t("pricing.row.perAnalysis")}</th>
                    {plans.map((plan) => {
                      const per = perAnalysis(plan);
                      return <td key={plan.plan_code} className={plan.plan_code === "pro" ? "tl-col-pro" : ""}>{per ? euros(billing === "yearly" ? per.yearly : per.monthly, locale) : "—"}</td>;
                    })}
                  </tr>
                  <tr className="tl-row-cta">
                    <td></td>
                    {plans.map((plan) => (
                      <td key={plan.plan_code} className={plan.plan_code === "pro" ? "tl-col-pro" : ""}>
                        <Link className={"tl-cta tl-cta-sm" + (plan.plan_code === "pro" ? " tl-cta-primary" : "")} href={checkoutHref(plan, billing)}>
                          {plan.plan_code === "agence" ? t("pricing.cta.ctaShortContact") : t("pricing.cta.ctaShortChoose")}
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="tl-faq" aria-labelledby="tl-faq-title">
        <div className="pricing-compare-intro">
          <span className="eyebrow">{t("pricing.faq.eyebrow")}</span>
          <h2 id="tl-faq-title">{t("pricing.faq.title")}</h2>
        </div>
        <div className="tl-faq-list">
          {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map((n) => (
            <details key={n} className="tl-faq-item" open={n === 1}>
              <summary>{t(`pricing.faq.q${n}`)}</summary>
              <p>{t(`pricing.faq.a${n}`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="pricing-note">
        <p>{t("pricing.note")}</p>
      </section>

      <footer className="footer">
        <span>{t("footer.tagline")}</span>
        <span className="footer-links">
          <a href="/legal/mentions-legales">{t("footer.mentions")}</a>
          <a href="/legal/cgu">{t("footer.cgu")}</a>
          <a href="/legal/confidentialite">{t("footer.confidentialite")}</a>
        </span>
      </footer>
    </main>
  );
}

function SectionRows({ title, rows, plans, t }: { title: string; rows: Row[]; plans: Plan[]; t: T }) {
  return (
    <>
      <tr className="tl-row-section">
        <th scope="rowgroup" colSpan={plans.length + 1}>{t(title)}</th>
      </tr>
      {rows.map((row) => (
        <tr key={row.label}>
          <th scope="row">{t(row.label)}</th>
          {plans.map((plan) => {
            const value = row.get(plan);
            const pro = plan.plan_code === "pro" ? " tl-col-pro" : "";
            if (value === "quota") return <td key={plan.plan_code} className={"tl-quota-cell" + pro}>{plan.monthly_analysis_quota ?? "∞"}</td>;
            return <td key={plan.plan_code} className={(value ? "" : "tl-cell-no") + pro}><Mark ok={value} t={t} /></td>;
          })}
        </tr>
      ))}
    </>
  );
}
