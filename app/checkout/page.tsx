"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type Plan = { plan_code: string; name: string; price_monthly_cents: number; price_yearly_cents: number | null; monthly_analysis_quota: number | null; lifetime_analysis_quota: number | null };
type Billing = "monthly" | "yearly";

const PACK: Plan = { plan_code: "pack", name: "Pack 3 analyses", price_monthly_cents: 1200, price_yearly_cents: null, monthly_analysis_quota: null, lifetime_analysis_quota: 3 };

const eur = (cents: number) => (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CheckoutPage() {
  return <Suspense fallback={null}><Checkout /></Suspense>;
}

// Page de paiement (aperçu) : carte Bricky animée + récapitulatif + formulaire.
// Les champs carte sont des emplacements : le jour où Stripe est branché, ils
// accueilleront le « Payment Element » de Stripe (Bricky ne voit ni ne stocke la carte).
function Checkout() {
  const params = useSearchParams();
  const code = params.get("plan") || "pro";
  const [plan, setPlan] = useState<Plan | null>(code === "pack" ? PACK : null);
  const [billing, setBilling] = useState<Billing>(params.get("periode") === "annuel" ? "yearly" : "monthly");
  const [email, setEmail] = useState<string | null>(null);
  const [holder, setHolder] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    if (code === "pack") return;
    supabase
      .from("subscription_plans")
      .select("plan_code, name, price_monthly_cents, price_yearly_cents, monthly_analysis_quota, lifetime_analysis_quota")
      .eq("plan_code", code)
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data as Plan).price_monthly_cents > 0) setPlan(data as Plan);
        else setNotFound(true);
      });
  }, [code]);

  // Inclinaison 3D de la carte qui suit la souris.
  function onTilt(e: React.PointerEvent<HTMLDivElement>) {
    const el = tiltRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 14).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
  }
  function resetTilt() {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  const isPack = plan?.plan_code === "pack";
  const yearlyAvailable = !!plan?.price_yearly_cents && !isPack;
  const monthsFree = plan && yearlyAvailable ? Math.round(12 - plan.price_yearly_cents! / plan.price_monthly_cents) : 0;
  const total = plan ? (billing === "yearly" && yearlyAvailable ? plan.price_yearly_cents! : plan.price_monthly_cents) : 0;
  const vat = Math.round(total - total / 1.2);
  const quota = plan
    ? plan.monthly_analysis_quota
      ? `${plan.monthly_analysis_quota} analyses / mois`
      : plan.lifetime_analysis_quota
        ? `${plan.lifetime_analysis_quota} analyses`
        : "Analyses illimitées"
    : "";
  const period = isPack ? "Paiement unique" : billing === "yearly" ? "Abonnement annuel" : "Abonnement mensuel";
  const loggedIn = !!email;

  const fieldProps = (name: string) => ({
    tabIndex: 0,
    onFocus: () => {
      setFocus(name);
      setFlipped(name === "cvc");
    },
    onBlur: () => {
      setFocus(null);
      if (name === "cvc") setFlipped(false);
    },
  });

  return (
    <main className="page pm-page">
      <div className="pm-preview-note">Aperçu : le paiement en ligne ouvre fin décembre.</div>
      <section className="pm-shell">
        <header className="pm-top">
          <a href="/" className="pm-brand"><img src="/mascot-icon.png" alt="" /><b>BRICKY</b><span>Paiement</span></a>
          <ol className="pm-steps" aria-label="Étapes">
            <li className="is-done"><span className="pm-step-dot">✓</span>Offre</li>
            <li className={loggedIn ? "is-done" : ""}><span className="pm-step-dot">{loggedIn ? "✓" : "2"}</span>Compte</li>
            <li className="is-current"><span className="pm-step-dot">3</span>Paiement</li>
          </ol>
        </header>

        <div className="pm-body">
          {/* Carte animée + récapitulatif */}
          <div className="pm-left">
            <div className="pm-card-stage" ref={tiltRef} onPointerMove={onTilt} onPointerLeave={resetTilt}>
              <span className={"pm-card-glow" + (focus ? " is-on" : "")} aria-hidden="true" />
              <div className={"pm-card" + (flipped ? " is-flipped" : "")} aria-hidden="true">
                <div className="pm-face pm-front">
                  <div className="pm-card-row">
                    <span className="pm-chip" />
                    <svg className="pm-nfc" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" /></svg>
                    <span className="pm-card-brand"><b>BRICKY</b><small>{plan ? plan.name.toUpperCase() : "PRO"}</small></span>
                  </div>
                  <div className={"pm-number" + (focus === "number" ? " is-focus" : "")}>•••• •••• •••• ••••</div>
                  <div className="pm-card-row pm-card-bottom">
                    <span className={focus === "holder" ? "is-focus" : ""}><small>TITULAIRE</small>{holder.trim() ? holder.trim().toUpperCase().slice(0, 22) : "PRÉNOM NOM"}</span>
                    <span className={focus === "exp" ? "is-focus" : ""}><small>EXPIRE</small>••/••</span>
                    <img src="/mascot-icon.png" alt="" className="pm-card-logo" />
                  </div>
                </div>
                <div className="pm-face pm-back">
                  <span className="pm-stripe" />
                  <div className="pm-cvc-row"><span className="pm-sign" /><span className="pm-cvc-box">•••</span></div>
                  <small className="pm-back-note">Le cryptogramme reste entre toi et ta banque.</small>
                </div>
              </div>
            </div>

            <div className="pm-order">
              <span className="pm-k">Ta commande</span>
              {plan ? (
                <>
                  <div className="pm-line"><div><b>Bricky {plan.name}</b><small>{period}</small></div><span>{eur(total)} €</span></div>
                  <div className="pm-line"><div><b>{quota}</b><small>PDF, comparateur et alertes selon l'offre</small></div><span className="pm-ok">Inclus</span></div>
                  <div className="pm-line pm-muted"><div>dont TVA (20 %)</div><span>{eur(vat)} €</span></div>
                  <div className="pm-total"><span>Total aujourd'hui</span><b>{eur(total).split(",")[0]}<small>,{eur(total).split(",")[1]} €</small></b></div>
                </>
              ) : notFound ? (
                <p className="pm-muted">Cette offre n'existe pas. <a href="/pricing">Voir les tarifs</a></p>
              ) : (
                <div className="pm-skel" />
              )}
            </div>
          </div>

          {/* Formulaire */}
          <div className="pm-right">
            <h1>Paiement</h1>
            <p className="pm-lead">Paiement sécurisé, en quelques secondes.</p>

            {yearlyAvailable && (
              <div className="pm-billing" role="group" aria-label="Période de facturation">
                <button type="button" className={billing === "monthly" ? "is-active" : ""} onClick={() => setBilling("monthly")}>Mensuel</button>
                <button type="button" className={billing === "yearly" ? "is-active" : ""} onClick={() => setBilling("yearly")}>Annuel {monthsFree > 0 && <em>{monthsFree} mois offerts</em>}</button>
              </div>
            )}

            <label className="pm-field">
              <span className="pm-label">E-mail</span>
              <span className="pm-input pm-input-static">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                {email ?? <a href="/login?mode=signup">Crée ton compte d'abord</a>}
              </span>
            </label>

            <label className="pm-field">
              <span className="pm-label">Titulaire de la carte</span>
              <span className={"pm-input" + (focus === "holder" ? " is-focus" : "")}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /></svg>
                <input value={holder} onChange={(e) => setHolder(e.target.value)} onFocus={() => { setFocus("holder"); setFlipped(false); }} onBlur={() => setFocus(null)} placeholder="Prénom Nom" autoComplete="cc-name" maxLength={40} />
              </span>
            </label>

            <div className="pm-field">
              <span className="pm-label">Numéro de carte</span>
              <div className={"pm-input pm-slot" + (focus === "number" ? " is-focus" : "")} {...fieldProps("number")} aria-label="Numéro de carte (bientôt disponible)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /></svg>
                <span className="pm-ph">1234 1234 1234 1234</span>
                <span className="pm-brands"><i>CB</i><i>VISA</i><i>MC</i></span>
              </div>
            </div>

            <div className="pm-row">
              <div className="pm-field">
                <span className="pm-label">Expiration</span>
                <div className={"pm-input pm-slot" + (focus === "exp" ? " is-focus" : "")} {...fieldProps("exp")} aria-label="Date d'expiration (bientôt disponible)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                  <span className="pm-ph">MM / AA</span>
                </div>
              </div>
              <div className="pm-field">
                <span className="pm-label">CVC <small>au dos de la carte</small></span>
                <div className={"pm-input pm-slot" + (focus === "cvc" ? " is-focus" : "")} {...fieldProps("cvc")} aria-label="Cryptogramme (bientôt disponible)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                  <span className="pm-ph">•••</span>
                </div>
              </div>
            </div>

            <button type="button" className="pm-pay" disabled>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              Payer {plan ? `${eur(total)} €` : ""}
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" /></svg>
            </button>
            <p className="pm-soon">Le paiement en ligne ouvre fin décembre. Besoin de l'offre maintenant ? <a href={`/contact?sujet=${isPack ? "pack" : code}`}>Écris-nous</a></p>

            <div className="pm-trust">
              <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" /></svg>Paiement opéré par Stripe</span>
              <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>Connexion chiffrée</span>
            </div>
            <small className="pm-never">Bricky ne voit ni ne stocke jamais les données de ta carte.</small>
          </div>
        </div>
      </section>
    </main>
  );
}
