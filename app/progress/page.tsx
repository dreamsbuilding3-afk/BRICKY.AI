"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";

type DashboardData = {
  period_key: string;
  progress: {
    analyses_this_month: number;
    opportunities_this_month: number;
    due_diligence_this_month: number;
    deals_recommended_this_month: number;
    pipeline: { has_analysis: boolean; rent_engine: boolean; financial_engine: boolean; risk_engine: boolean; verdict: boolean };
  };
  level: { tier_code: string; tier_label: string; tier_index: number; depth_points: number; next_tier_label: string | null; progress_to_next_pct: number };
  profile: { code: string; label_fr: string; based_on_n_analyses: number; insufficient_data: boolean };
  score: { insufficient_data: boolean; based_on_n_analyses: number; overall: number | null; sub_scores: Record<string, number | null> };
  impact: { properties_analyzed: number; opportunities_detected: number; high_risk_deals_avoided: number; deals_recommended: number; potential_price_gap_identified_eur: number; potential_price_gap_is_estimate: boolean };
  challenges: Array<{ code: string; title_fr: string; description_fr: string; icon: string; target_count: number; progress_count: number; completed: boolean }>;
};

type LeaderboardData = {
  enabled: boolean;
  min_participants: number;
  participants_count: number;
  my_opted_in: boolean;
  my_rank: number | null;
  entries: Array<{ rank: number; label: string; score: number; is_me: boolean }>;
};

const CHALLENGE_ICONS: Record<string, string> = { search: "🔍", check: "✅", bank: "🏦", chart: "📊", map: "🗺️" };

const SUBSCORE_LABELS: Record<string, string> = {
  analysis_quality: "Qualité d'analyse",
  financial_discipline: "Rigueur financière",
  risk_analysis: "Analyse des risques",
  due_diligence: "Due diligence",
  opportunity_detection: "Détection d'opportunités",
};

export default function ProgressPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [optinSaving, setOptinSaving] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");

  async function loadAll() {
    const [{ data: dash, error: dashError }, { data: lb }] = await Promise.all([
      supabase.rpc("get_investor_dashboard_v1"),
      supabase.rpc("get_investor_leaderboard_v1"),
    ]);
    if (dashError) { setError("Impossible de charger votre progression pour le moment."); setLoading(false); return; }
    setData(dash as unknown as DashboardData);
    setLeaderboard((lb as unknown as LeaderboardData) || null);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      if (!sessionData.session) { router.replace("/login"); return; }
      if (cancelled) return;
      setUserEmail(sessionData.session.user.email ?? "");
      await loadAll();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleOptinToggle(nextOptedIn: boolean) {
    setOptinSaving(true);
    try {
      await supabase.rpc("set_investor_leaderboard_optin", { p_opted_in: nextOptedIn, p_display_name: displayNameInput || null });
      const { data: lb } = await supabase.rpc("get_investor_leaderboard_v1");
      setLeaderboard((lb as unknown as LeaderboardData) || null);
    } finally {
      setOptinSaving(false);
    }
  }

  if (loading) return null;

  return (
    <main className="page">
      <AppNav email={userEmail} active="progress" />
      <section className="analysis-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · Investor Progress</span>
          <h1>Votre progression <span className="accent">investisseur</span></h1>
          <p className="sub">Tout ce qui suit est calculé à partir de vos analyses réelles — rien n'est inventé. Les sections qui demandent plus de données s'affichent clairement comme telles.</p>
        </div>

        {error && <div className="error-box">{error}</div>}

        {data && (
          <>
            {/* Progress du mois + pipeline */}
            <div className="result-panel">
              <div className="section-heading"><div><h3>Ce mois-ci</h3><small>Période {data.period_key}</small></div></div>
              <div className="stat-cards">
                <div className="stat-card"><b>{data.progress.analyses_this_month}</b><span>Analyses</span></div>
                <div className="stat-card stat-card-green"><b>{data.progress.opportunities_this_month}</b><span>Opportunités</span></div>
                <div className="stat-card stat-card-blue"><b>{data.progress.due_diligence_this_month}</b><span>Due diligence</span></div>
                <div className="stat-card stat-card-amber"><b>{data.progress.deals_recommended_this_month}</b><span>Deals recommandés</span></div>
              </div>
              <div className="dashboard-section">
                <h3>Pipeline de votre dernière analyse</h3>
                {data.progress.pipeline.has_analysis ? (
                  <div className="funnel-steps">
                    <div className="funnel-step"><span>Analyse créée</span><div className="funnel-bar"><div className="funnel-bar-fill" style={{ width: "100%" }} /></div><b>✓</b></div>
                    <div className="funnel-step"><span>Rent Engine</span><div className="funnel-bar"><div className="funnel-bar-fill" style={{ width: data.progress.pipeline.rent_engine ? "100%" : "6%" }} /></div><b>{data.progress.pipeline.rent_engine ? "✓" : "—"}</b></div>
                    <div className="funnel-step"><span>Financial Engine</span><div className="funnel-bar"><div className="funnel-bar-fill" style={{ width: data.progress.pipeline.financial_engine ? "100%" : "6%" }} /></div><b>{data.progress.pipeline.financial_engine ? "✓" : "—"}</b></div>
                    <div className="funnel-step"><span>Risk Engine</span><div className="funnel-bar"><div className="funnel-bar-fill" style={{ width: data.progress.pipeline.risk_engine ? "100%" : "6%" }} /></div><b>{data.progress.pipeline.risk_engine ? "✓" : "—"}</b></div>
                    <div className="funnel-step"><span>Verdict</span><div className="funnel-bar"><div className="funnel-bar-fill funnel-bar-final" style={{ width: data.progress.pipeline.verdict ? "100%" : "6%" }} /></div><b>{data.progress.pipeline.verdict ? "✓" : "—"}</b></div>
                  </div>
                ) : (
                  <p className="empty-note">Aucune analyse pour l'instant. <a href="/analyze">Lancez votre première analyse →</a></p>
                )}
              </div>
            </div>

            {/* Niveau */}
            <div className="result-panel">
              <div className="section-heading"><div><h3>Niveau investisseur</h3><small>Basé sur la profondeur d'usage, pas seulement le volume</small></div></div>
              <span className={`level-pill level-pill-index-${data.level.tier_index}`}>🧱 {data.level.tier_label}</span>
              {data.level.next_tier_label && (
                <div className="level-progress-row">
                  <span>Progression vers {data.level.next_tier_label} — {data.level.progress_to_next_pct}%</span>
                  <div className="funnel-bar" style={{ marginTop: 6 }}><div className="funnel-bar-fill" style={{ width: `${data.level.progress_to_next_pct}%` }} /></div>
                </div>
              )}
            </div>

            {/* Profil */}
            <div className="result-panel">
              <div className="section-heading"><div><h3>Profil investisseur</h3><small>Classification comportementale, basée sur vos analyses terminées</small></div></div>
              {data.profile.insufficient_data ? (
                <p className="empty-note">Pas encore assez d'analyses terminées ({data.profile.based_on_n_analyses}/3 minimum) pour dégager un profil fiable. Terminez d'autres analyses pour le débloquer.</p>
              ) : (
                <span className="profile-pill">{data.profile.label_fr}</span>
              )}
            </div>

            {/* Score */}
            <div className="result-panel">
              <div className="section-heading"><div><h3>Score investisseur</h3><small>Qualité, pas volume</small></div></div>
              {data.score.insufficient_data ? (
                <p className="empty-note">Pas encore assez d'analyses terminées ({data.score.based_on_n_analyses}/2 minimum) pour calculer un score fiable.</p>
              ) : (
                <div className="ring-cards">
                  <RingMini title="Score global" value={data.score.overall ?? 0} />
                  {Object.entries(SUBSCORE_LABELS).map(([key, label]) => (
                    <RingMini key={key} title={label} value={data.score.sub_scores[key] ?? 0} />
                  ))}
                </div>
              )}
            </div>

            {/* Impact Bricky */}
            <div className="result-panel">
              <div className="section-heading"><div><h3>Impact Bricky</h3><small>Cumul depuis votre inscription</small></div></div>
              <div className="stat-cards">
                <div className="stat-card"><b>{data.impact.properties_analyzed}</b><span>Biens analysés</span></div>
                <div className="stat-card stat-card-green"><b>{data.impact.opportunities_detected}</b><span>Opportunités détectées</span></div>
                <div className="stat-card stat-card-blue"><b>{data.impact.high_risk_deals_avoided}</b><span>Deals à risque évités</span></div>
                <div className="stat-card stat-card-amber"><b>{data.impact.deals_recommended}</b><span>Deals recommandés</span></div>
              </div>
              <p className="extract-note" style={{ marginTop: 14 }}>
                Écart de prix potentiel identifié : <b>{data.impact.potential_price_gap_identified_eur.toLocaleString("fr-FR")} €</b> — estimation potentielle basée sur les valeurs de marché calculées, pas une économie réalisée ou garantie.
              </p>
            </div>

            {/* Défis du mois */}
            <div className="result-panel">
              <div className="section-heading"><div><h3>Défis du mois</h3><small>Basés sur vos actions réelles dans Bricky</small></div></div>
              <div className="challenge-list">
                {data.challenges.map((c) => (
                  <div className={"challenge-item" + (c.completed ? " challenge-done" : "")} key={c.code}>
                    <div className="challenge-item-head"><b>{CHALLENGE_ICONS[c.icon] || "🎯"} {c.title_fr}</b><span>{c.progress_count}/{c.target_count}{c.completed ? " · Terminé" : ""}</span></div>
                    <p>{c.description_fr}</p>
                    <div className="funnel-bar"><div className="funnel-bar-fill funnel-bar-final" style={{ width: `${Math.min(100, Math.round((c.progress_count / c.target_count) * 100))}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="result-panel">
              <div className="section-heading"><div><h3>Classement</h3><small>Anonymisé, 100% optionnel</small></div></div>
              <div className="leaderboard-optin-row">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={leaderboard?.my_opted_in || false} disabled={optinSaving} onChange={(e) => handleOptinToggle(e.target.checked)} />
                  Participer au classement anonymisé
                </label>
                {leaderboard?.my_opted_in && (
                  <input type="text" placeholder="Pseudo affiché (optionnel)" value={displayNameInput} onChange={(e) => setDisplayNameInput(e.target.value)} onBlur={() => handleOptinToggle(true)} maxLength={40} />
                )}
              </div>
              {leaderboard && leaderboard.enabled ? (
                <div className="leaderboard-list">
                  {leaderboard.entries.map((e) => (
                    <div className={"leaderboard-row" + (e.is_me ? " leaderboard-row-me" : "")} key={e.rank}>
                      <span className="leaderboard-rank">#{e.rank}</span>
                      <b>{e.label}{e.is_me ? " (vous)" : ""}</b>
                      <span>{e.score}/100</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note" style={{ marginTop: 14 }}>
                  Le classement est encore masqué : il ne s'active qu'à partir de {leaderboard?.min_participants ?? 5} participants avec un score calculable
                  {leaderboard ? ` (actuellement ${leaderboard.participants_count})` : ""}. Aucun classement partiel ou fictif n'est affiché.
                </p>
              )}
            </div>

            {/* Opportunity Radar — architecture seule */}
            <div className="result-panel">
              <div className="section-heading"><div><h3>Opportunity Radar</h3><small>Prochaine étape</small></div></div>
              <div className="radar-placeholder">
                <b>🛰️ Bientôt disponible</b>
                Bricky pourra bientôt repérer automatiquement des opportunités correspondant à votre profil investisseur dans de nouvelles annonces. Aucune donnée fictive n'est affichée ici tant que cette brique n'est pas connectée à de vraies sources d'annonces.
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function RingMini({ title, value }: { title: string; value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const safePct = Math.min(100, Math.max(0, value));
  const offset = c - (safePct / 100) * c;
  const tone = safePct >= 70 ? ["#16a34a", "#4ade80"] : safePct >= 40 ? ["#d97706", "#fbbf24"] : ["#dc2626", "#f87171"];
  return (
    <div className="ring-card">
      <div className="ring-card-head"><span className="ring-card-title">{title}</span></div>
      <div className="ring-card-ring">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <defs>
            <linearGradient id={`ringMini-${title}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={tone[0]} />
              <stop offset="100%" stopColor={tone[1]} />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={r} fill="none" stroke="#ece9e4" strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={`url(#ringMini-${title})`} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 60 60)" />
        </svg>
        <div className="ring-card-center">{Math.round(safePct)}</div>
      </div>
      <span className="ring-card-caption">sur 100</span>
    </div>
  );
}
