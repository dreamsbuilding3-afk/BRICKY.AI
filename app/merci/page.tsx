"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type Plan = {
  plan_code: string;
  name: string;
  monthly_analysis_quota: number | null;
  lifetime_analysis_quota: number | null;
  can_download_pdf: boolean;
  can_use_financing_simulator: boolean;
  can_share_link: boolean;
  can_compare_properties: boolean;
  can_set_alerts: boolean;
};

const PACK: Plan = { plan_code: "pack", name: "Pack 3 analyses", monthly_analysis_quota: null, lifetime_analysis_quota: 3, can_download_pdf: true, can_use_financing_simulator: false, can_share_link: false, can_compare_properties: false, can_set_alerts: false };

// Confettis en forme de briques (couleurs des conteneurs de l'accueil).
const BRICKS = Array.from({ length: 22 }, (_, i) => ({
  x: ((i * 37) % 100) - 50,
  d: (i % 7) * 0.09,
  r: (i * 53) % 360,
  c: ["#ff5a1f", "#2347d6", "#ffc533", "#16a085", "#1d1d1f", "#6cb8ff"][i % 6],
}));


// Icônes au trait (pas d'emoji : rendu net et cohérent sur tous les appareils).
const ICONS: Record<string, string> = {
  search: "M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14zM20 20l-4-4",
  pdf: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  compare: "M12 4v16M5 8l-3 6h6zM19 8l-3 6h6zM5 8h14",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  bank: "M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  share: "M18 8a3 3 0 1 0-3-3M6 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
};
function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function MerciPage() {
  return <Suspense fallback={null}><Merci /></Suspense>;
}

// Page de remerciement après paiement : la mascotte inspecteur, les accès débloqués, la suite.
function Merci() {
  const code = useSearchParams().get("plan") || "pro";
  const [plan, setPlan] = useState<Plan | null>(code === "pack" ? PACK : null);
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      const n = (u?.user_metadata?.full_name || u?.user_metadata?.name || u?.email?.split("@")[0] || "") as string;
      setName(n.split(/[\s._-]/)[0] ?? "");
    });
    if (code === "pack") return;
    supabase
      .from("subscription_plans")
      .select("plan_code, name, monthly_analysis_quota, lifetime_analysis_quota, can_download_pdf, can_use_financing_simulator, can_share_link, can_compare_properties, can_set_alerts")
      .eq("plan_code", code)
      .maybeSingle()
      .then(({ data }) => data && setPlan(data as Plan));
  }, [code]);

  const quota = plan?.monthly_analysis_quota
    ? `${plan.monthly_analysis_quota} analyses par mois`
    : plan?.lifetime_analysis_quota
      ? `${plan.lifetime_analysis_quota} analyses`
      : "Des analyses à volonté";

  const perks = plan
    ? [
        { on: true, icon: "search", title: quota, fun: "De quoi inspecter tout le quartier (et celui d'à côté)." },
        { on: plan.can_download_pdf, icon: "pdf", title: "Dossier PDF complet", fun: "Imprime-le, encadre-le, montre-le à ton banquier." },
        { on: plan.can_compare_properties, icon: "compare", title: "Comparateur de biens", fun: "Fini le duel d'onglets à 2 h du matin." },
        { on: plan.can_set_alerts, icon: "bell", title: "Alertes marché", fun: "Bricky fait le guet pendant que tu dors." },
        { on: plan.can_use_financing_simulator, icon: "bank", title: "Simulateur de financement", fun: "On parle taux, sans le banquier qui baille." },
        { on: plan.can_share_link, icon: "share", title: "Partage d'analyse", fun: "Envoie-la à ton associé. Ou à ta mère, elle sera fière." },
      ].filter((p) => p.on)
    : [];

  return (
    <main className="page ty-page">
      <section className="ty-hero">
        <div className="ty-confetti" aria-hidden="true">
          {BRICKS.map((b, i) => (
            <i key={i} style={{ ["--x" as string]: `${b.x}vw`, ["--d" as string]: `${b.d}s`, ["--r" as string]: `${b.r}deg`, background: b.c }} />
          ))}
        </div>

        <div className="ty-stage" aria-hidden="true">
          <div className="ty-mascot">
            <img src="/mascot-inspector.webp" alt="" width={441} height={560} />
            <span className="ty-lid ty-lid-l" />
            <span className="ty-lid ty-lid-r" />
            <span className="ty-glint" />
          </div>
          <span className="ty-shadow" />
          <span className="ty-bubble">Dossier validé&nbsp;✓</span>
        </div>

        <div className="ty-copy">
          <span className="ty-badge"><span className="ty-check">✓</span>Paiement confirmé</span>
          <h1>
            Bienvenue dans l'équipe{name ? `, ${name}` : ""}.
            <em>Le chapeau d'inspecteur est à toi.</em>
          </h1>
          <p>
            {plan ? <>Ton offre <b>{plan.name}</b> est active.</> : "Ton offre est active."} Ton reçu arrive par e-mail.
            À partir de maintenant, plus aucune annonce n'a de secret pour toi.
          </p>
          <div className="ty-ctas">
            <a className="ty-cta" href="/analyze">Lancer une analyse<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" /></svg></a>
            <a className="ty-ghost" href="/espace">Mon espace</a>
          </div>
        </div>
      </section>

      <section className="ty-perks" aria-labelledby="ty-perks-title">
        <h2 id="ty-perks-title">Ce que tu viens de débloquer</h2>
        <div className="ty-grid">
          {perks.map((p, i) => (
            <article key={p.title} className="ty-perk" style={{ ["--i" as string]: i }}>
              <span className="ty-lock" aria-hidden="true"><span className="ty-shackle" /><span className="ty-body"><Icon name={p.icon} /></span></span>
              <div>
                <b>{p.title}</b>
                <small>{p.fun}</small>
              </div>
            </article>
          ))}
        </div>
        <p className="ty-help">Une question, un souci ? <a href="/contact?sujet=autre">Écris-nous</a>, un humain te répond (la mascotte ne sait pas encore taper).</p>
      </section>
    </main>
  );
}
