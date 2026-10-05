"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase/client";
import { useLocale } from "../../components/LocaleProvider";
import type { Locale } from "../../lib/i18n/translations";

type Plan = {
  plan_code: string;
  name: string;
  price_monthly_cents: number;
  price_yearly_cents: number | null;
  lifetime_analysis_quota: number | null;
  monthly_analysis_quota: number | null;
  can_download_pdf: boolean;
  can_use_financing_simulator: boolean;
  can_share_link: boolean;
  can_compare_properties: boolean;
  can_set_alerts: boolean;
  white_label: boolean;
  multi_user: boolean;
  api_export: boolean;
  sort_order: number;
};

const PLAN_AUDIENCE_KEY: Record<string, string> = {
  decouverte: "pricing.audience.decouverte",
  essentiel: "pricing.audience.essentiel",
  pro: "pricing.audience.pro",
  agence: "pricing.audience.agence",
};

function numberLocale(locale: Locale) {
  if (locale === "en") return "en-US";
  if (locale === "zh") return "zh-CN";
  return "fr-FR";
}

function formatPrice(cents: number, locale: Locale, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (cents === 0) return t("pricing.free");
  return (cents / 100).toLocaleString(numberLocale(locale), { maximumFractionDigits: 0 }) + " " + t("pricing.perMonth");
}

function analysesLabel(plan: Plan, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (plan.lifetime_analysis_quota != null) {
    return t("pricing.feature.analysesLifetime", { n: plan.lifetime_analysis_quota });
  }
  if (plan.monthly_analysis_quota == null) return t("pricing.feature.analysesUnlimited");
  return t("pricing.feature.analysesMonthly", { n: plan.monthly_analysis_quota });
}

function featureList(plan: Plan, t: (key: string, vars?: Record<string, string | number>) => string): string[] {
  const items: string[] = [analysesLabel(plan, t)];
  items.push(plan.can_download_pdf ? t("pricing.feature.pdfYes") : t("pricing.feature.pdfNo"));
  items.push(plan.can_use_financing_simulator ? t("pricing.feature.financingYes") : t("pricing.feature.financingNo"));
  if (plan.can_share_link) items.push(t("pricing.feature.shareLink"));
  if (plan.can_compare_properties) items.push(t("pricing.feature.compare"));
  if (plan.can_set_alerts) items.push(t("pricing.feature.alerts"));
  if (plan.white_label) items.push(t("pricing.feature.whiteLabel"));
  if (plan.multi_user) items.push(t("pricing.feature.multiUser"));
  if (plan.api_export) items.push(t("pricing.feature.apiExport"));
  return items;
}

function Check({ ok }: { ok: boolean }) {
  return ok ? <span className="pricing-compare-check">✓</span> : <span className="pricing-compare-dash">—</span>;
}

function ctaLabel(plan: Plan, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (plan.plan_code === "decouverte") return t("pricing.cta.ctaShortStart");
  if (plan.plan_code === "agence") return t("pricing.cta.ctaShortContact");
  return t("pricing.cta.ctaShortChoose");
}

function ctaHref(plan: Plan) {
  if (plan.plan_code === "decouverte") return "/analyze";
  if (plan.plan_code === "agence") return "/account";
  return "/account";
}

export default function PricingPage() {
  const { locale, t } = useLocale();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadError("");
      const { data: planRows, error: plansError } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("sort_order", { ascending: true });
      if (plansError || !planRows || planRows.length === 0) {
        setLoadError("load_error");
        setLoading(false);
        return;
      }
      setPlans(planRows as Plan[]);

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        const { data: sub } = await supabase.rpc("get_my_subscription");
        if (sub && typeof sub === "object" && "plan_code" in sub) {
          setCurrentPlan((sub as { plan_code: string }).plan_code);
        }
      }
      setLoading(false);
    })();
  }, []);

  return (
    <main className="page">
      <nav className="nav">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="mark">B</span>Bricky
        </Link>
        <div className="nav-links">
          <Link className="navlink" href="/login">{t("nav.login")}</Link>
          <Link className="nav-cta" href="/analyze">{t("nav.cta")}</Link>
        </div>
      </nav>

      <section className="pricing-intro">
        <span className="eyebrow">{t("pricing.intro.eyebrow")}</span>
        <h1>{t("pricing.intro.title")}</h1>
        <p className="sub">
          {t("pricing.intro.sub")}
        </p>
        <p className="trial-note" style={{ textAlign: "center", margin: "14px auto 0" }}>{t("pricing.intro.note")}</p>
      </section>

      {loading ? null : loadError ? (
        <section className="pricing-intro"><div className="error-box" style={{ maxWidth: 520, margin: "0 auto" }}>{t("pricing.loadError")}</div></section>
      ) : (
        <section className="pricing-grid">
          {plans.map((plan) => (
            <div
              key={plan.plan_code}
              className={"pricing-card" + (currentPlan === plan.plan_code ? " pricing-card-current" : "")}
            >
              {currentPlan === plan.plan_code ? <span className="pricing-current-badge">{t("pricing.currentBadge")}</span> : null}
              <h2>{plan.name}</h2>
              {PLAN_AUDIENCE_KEY[plan.plan_code] ? (
                <div className="pricing-audience">{t(PLAN_AUDIENCE_KEY[plan.plan_code])}</div>
              ) : null}
              <div className="pricing-price">{formatPrice(plan.price_monthly_cents, locale, t)}</div>
              {plan.price_yearly_cents ? (
                <div className="pricing-yearly">
                  {t("pricing.or")} {(plan.price_yearly_cents / 100).toLocaleString(numberLocale(locale))} {t("pricing.perYear")}
                </div>
              ) : null}
              <ul className="pricing-features">
                {featureList(plan, t).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {plan.plan_code === "agence" ? (
                <div className="pricing-network">
                  <span className="pricing-network-badge">{t("pricing.network.badge")}</span>
                  <p className="pricing-network-text">{t("pricing.network.text")}</p>
                  <a className="secondary-button pricing-compare-cta pricing-network-cta" href="#">{t("pricing.network.cta")}</a>
                </div>
              ) : null}
              {plan.plan_code === "decouverte" ? (
                <Link className="secondary-button pricing-cta" href="/analyze">
                  {t("pricing.cta.start")}
                </Link>
              ) : plan.plan_code === "agence" ? (
                <Link className="secondary-button pricing-cta" href="/account">
                  {t("pricing.cta.contact")}
                </Link>
              ) : (
                <div className="pricing-cta-wrap">
                <Link className="primary-button pricing-cta" href="/account">
                  {t("pricing.cta.trial")}
                </Link>
                <span className="pricing-cta-note">{t("pricing.cta.trialNote")}</span>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {!loading && plans.length > 0 && (
        <section className="pricing-compare">
          <div className="pricing-compare-intro">
            <span className="eyebrow">{t("pricing.compare.eyebrow")}</span>
            <h2>{t("pricing.compare.title")}</h2>
            <p>{t("pricing.compare.sub")}</p>
          </div>
          <div className="pricing-compare-scroll">
            <table className="pricing-compare-table">
              <thead>
                <tr>
                  <th></th>
                  {plans.map((plan) => (
                    <th key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      {plan.name}
                      {plan.plan_code === "pro" ? <span className="pricing-compare-popular">{t("pricing.popular")}</span> : null}
                      {PLAN_AUDIENCE_KEY[plan.plan_code] ? (
                        <span className="pricing-compare-audience">{t(PLAN_AUDIENCE_KEY[plan.plan_code])}</span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="pricing-compare-section">
                  <td colSpan={plans.length + 1}>{t("pricing.compare.section.analyses")}</td>
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.analyses")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      {analysesLabel(plan, t)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.pdf")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_download_pdf} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.financing")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_use_financing_simulator} />
                    </td>
                  ))}
                </tr>
                <tr className="pricing-compare-section">
                  <td colSpan={plans.length + 1}>{t("pricing.compare.section.sharing")}</td>
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.share")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_share_link} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.compare")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_compare_properties} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.alerts")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.can_set_alerts} />
                    </td>
                  ))}
                </tr>
                <tr className="pricing-compare-section">
                  <td colSpan={plans.length + 1}>{t("pricing.compare.section.agency")}</td>
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.whiteLabel")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.white_label} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.multiUser")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.multi_user} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{t("pricing.compare.row.apiExport")}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Check ok={plan.api_export} />
                    </td>
                  ))}
                </tr>
                <tr className="pricing-compare-cta-row">
                  <td></td>
                  {plans.map((plan) => (
                    <td key={plan.plan_code} className={plan.plan_code === "pro" ? "pricing-compare-highlight" : ""}>
                      <Link
                        className={(plan.plan_code === "decouverte" || plan.plan_code === "agence" ? "secondary-button" : "primary-button") + " pricing-compare-cta"}
                        href={ctaHref(plan)}
                      >
                        {ctaLabel(plan, t)}
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="pricing-note">
        <p>
          {t("pricing.note")}
        </p>
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
