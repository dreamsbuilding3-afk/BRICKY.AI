"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase/client";
import { useLocale } from "./LocaleProvider";
import { FEATURE_LABEL_KEY, PRO_FALLBACK, upgradeDeltaCents, type MySubscription, type PlanFeature } from "../lib/plan/features";
import "./featureLock.css";

// Verrous de fonctions selon le plan. L'interface ne fait qu'afficher : la
// vraie barrière est côté serveur (routes API, RPC, RLS). Voir lib/plan.

type ProPrice = { monthly: number; yearly: number | null; quota: number | null };
type PlanState = { loading: boolean; sub: MySubscription | null; pro: ProPrice };

let cache: Promise<{ sub: MySubscription | null; pro: ProPrice }> | null = null;

function loadPlan() {
  if (!cache) {
    cache = (async () => {
      const [{ data: session }, { data: proRow }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("subscription_plans").select("price_monthly_cents, price_yearly_cents, monthly_analysis_quota").eq("plan_code", "pro").maybeSingle(),
      ]);
      const pro: ProPrice = proRow?.price_monthly_cents
        ? { monthly: proRow.price_monthly_cents, yearly: proRow.price_yearly_cents ?? null, quota: proRow.monthly_analysis_quota ?? null }
        : PRO_FALLBACK;
      if (!session.session) return { sub: null, pro };
      const { data, error } = await supabase.rpc("get_my_subscription");
      const sub = !error && data && typeof data === "object" && "plan_code" in data ? (data as MySubscription) : null;
      return { sub, pro };
    })().catch(() => {
      cache = null;
      return { sub: null, pro: PRO_FALLBACK };
    });
  }
  return cache;
}

/** Plan courant + prix de Pro (une seule lecture par page). */
export function usePlan() {
  const [state, setState] = useState<PlanState>({ loading: true, sub: null, pro: PRO_FALLBACK });
  useEffect(() => {
    let cancelled = false;
    loadPlan().then((r) => { if (!cancelled) setState({ loading: false, ...r }); });
    return () => { cancelled = true; };
  }, []);
  const has = (feature: PlanFeature) => state.sub?.[feature] === true;
  return { ...state, has };
}

/** Réponse d'une route API refusée pour cause de plan (voir lib/plan/server.ts). */
export function isFeatureLocked(body: unknown): body is { error: "feature_locked"; feature: PlanFeature; message: string } {
  return !!body && typeof body === "object" && (body as { error?: string }).error === "feature_locked";
}

function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="fl-lock" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" />
      <path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function useLockCopy(feature: PlanFeature) {
  const { t, locale } = useLocale();
  const { sub, pro } = usePlan();
  const delta = upgradeDeltaCents(sub?.price_monthly_cents, pro.monthly);
  const amount = delta != null
    ? (delta / 100).toLocaleString(locale === "en" ? "en-US" : locale === "zh" ? "zh-CN" : "fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: delta % 100 ? 2 : 0 })
    : null;
  return {
    title: amount ? t("lock.title", { amount }) : t("lock.titleNoDelta"),
    feature: t(FEATURE_LABEL_KEY[feature]),
    desc: t("lock.desc", { quota: pro.quota ?? 25 }),
    cta: t("lock.cta"),
    later: t("lock.later"),
    badge: t("lock.badge"),
    seePricing: t("lock.seePricing"),
  };
}

/** Fenêtre « Disponible avec Pro, pour 5 € de plus » + bouton de passage à Pro. */
export function UpgradeDialog({ feature, onClose }: { feature: PlanFeature; onClose: () => void }) {
  const copy = useLockCopy(feature);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fl-backdrop" onClick={onClose}>
      <div className="fl-dialog" role="dialog" aria-modal="true" aria-labelledby="fl-title" onClick={(e) => e.stopPropagation()}>
        <span className="fl-dialog-icon"><LockIcon size={22} /></span>
        <span className="fl-feature">{copy.feature}</span>
        <h3 id="fl-title" className="fl-title">{copy.title}</h3>
        <p className="fl-desc">{copy.desc}</p>
        <a className="fl-cta" href="/checkout?plan=pro&periode=annuel">{copy.cta}</a>
        <button type="button" className="fl-later" onClick={onClose}>{copy.later}</button>
      </div>
    </div>
  );
}

/** Bouton d'une fonction verrouillée : cadenas visible, le clic ouvre la fenêtre Pro. */
export function LockedButton({ feature, children, className = "secondary-button" }: { feature: PlanFeature; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const { badge } = useLockCopy(feature);
  return (
    <>
      <button type="button" className={`${className} fl-locked-btn`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <LockIcon />
        {children}
        <span className="fl-pro-tag">{badge}</span>
      </button>
      {open && <UpgradeDialog feature={feature} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Encart à la place d'une section verrouillée (ex. « Prix à proposer »). */
export function LockedPanel({ feature, title, teaser }: { feature: PlanFeature; title: string; teaser?: string }) {
  const [open, setOpen] = useState(false);
  const copy = useLockCopy(feature);
  return (
    <div className="dashboard-section fl-panel">
      <button type="button" className="fl-panel-hit" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="fl-panel-head"><LockIcon size={16} /><b>{title}</b><span className="fl-pro-tag">{copy.badge}</span></span>
        {teaser ? <span className="fl-panel-teaser">{teaser}</span> : null}
        <span className="fl-panel-msg">{copy.title}</span>
        <span className="fl-cta fl-cta-inline">{copy.cta}</span>
      </button>
      {open && <UpgradeDialog feature={feature} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Pleine page (comparateur, alertes, mode visite) pour un utilisateur sans le droit. */
export function LockedPage({ feature, title, text }: { feature: PlanFeature; title: string; text: string }) {
  const copy = useLockCopy(feature);
  return (
    <section className="fl-page">
      <span className="fl-dialog-icon"><LockIcon size={22} /></span>
      <span className="fl-feature">{title}</span>
      <h2 className="fl-title">{copy.title}</h2>
      <p className="fl-desc">{text}</p>
      <a className="fl-cta" href="/checkout?plan=pro&periode=annuel">{copy.cta}</a>
      <a className="fl-later" href="/pricing">{copy.seePricing}</a>
    </section>
  );
}
