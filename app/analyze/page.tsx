"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type AnalysisResult = { property_id?: string; analysis_id?: string; [key: string]: unknown };

export default function AnalyzePage() {
  const router = useRouter();
  const [payload, setPayload] = useState({ title: "Appartement à analyser", city: "", address: "", price: "", surface_m2: "", rooms: "", bedrooms: "", dpe_class: "", monthly_rent: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (!data.session) router.replace("/login"); else setUserEmail(data.session.user.email ?? ""); }); }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { router.replace("/login"); return; }
      const body = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, ["price", "surface_m2", "rooms", "bedrooms", "monthly_rent"].includes(key) && value !== "" ? Number(value) : value]));
      const response = await fetch("/api/properties/analyze", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.details?.message || data?.error || "Analyse impossible.");
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); }
    finally { setLoading(false); }
  }

  const update = (key: keyof typeof payload, value: string) => setPayload((current) => ({ ...current, [key]: value }));

  return <main className="page">
    <nav className="nav"><div className="brand"><span className="mark">B</span>Bricky</div><div className="navlink">{userEmail || "Analyse"}</div></nav>
    <section className="analysis-shell">
      <div className="analysis-intro"><span className="eyebrow">Bricky · V1</span><h1>Est-ce que ce bien mérite votre attention ?</h1><p className="sub">Entrez uniquement les données que vous connaissez. Bricky calcule, vérifie et signale ce qui manque — sans inventer.</p></div>
      <form className="property-form" onSubmit={handleSubmit}><div className="form-grid">
        <label>Titre<input value={payload.title} onChange={(e) => update("title", e.target.value)} /></label><label>Ville<input value={payload.city} onChange={(e) => update("city", e.target.value)} placeholder="Fort-de-France" /></label><label>Adresse<input value={payload.address} onChange={(e) => update("address", e.target.value)} placeholder="Adresse du bien" /></label><label>Prix (€)<input required type="number" min="1" value={payload.price} onChange={(e) => update("price", e.target.value)} placeholder="250000" /></label><label>Surface (m²)<input required type="number" min="1" value={payload.surface_m2} onChange={(e) => update("surface_m2", e.target.value)} placeholder="65" /></label><label>Loyer mensuel (€)<input type="number" min="0" value={payload.monthly_rent} onChange={(e) => update("monthly_rent", e.target.value)} placeholder="1200" /></label><label>Pièces<input type="number" min="0" value={payload.rooms} onChange={(e) => update("rooms", e.target.value)} placeholder="3" /></label><label>Chambres<input type="number" min="0" value={payload.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} placeholder="2" /></label><label>DPE<input value={payload.dpe_class} onChange={(e) => update("dpe_class", e.target.value.toUpperCase())} placeholder="D" maxLength={1} /></label>
      </div><button className="primary-button" disabled={loading}>{loading ? "Analyse en cours…" : "Lancer l’analyse Bricky →"}</button>{error && <div className="error-box">{error}</div>}</form>
      {result && <AnalysisDashboard result={result} />}
    </section>
  </main>;
}

function AnalysisDashboard({ result }: { result: AnalysisResult }) {
  const analysis = (result.analysis as Record<string, any>) || result; const financial = (analysis.financial_snapshot || {}) as Record<string, any>; const decision = (analysis.decision_snapshot || {}) as Record<string, any>; const risk = (analysis.risk || {}) as Record<string, any>;
  const scenarios = (analysis.financial_scenarios || {}) as Record<string, any>; const verdict = decision.verdict || analysis.verdict; const score = decision.score ?? analysis.overall_score; const confidence = decision.confidence_score ?? analysis.confidence_score; const actions = Array.isArray(decision.actions) ? decision.actions : []; const risks = Array.isArray(risk.risks) ? risk.risks : []; const missing = Array.isArray(analysis.missing_information) ? analysis.missing_information : [];
  const rows = ["base", "conservative", "optimistic"].filter((k) => scenarios[k]); const label = verdict === "interesting" ? "Intéressant" : verdict === "unattractive" ? "Peu intéressant" : "À vérifier & négocier";
  return <section className="result-panel decision-dashboard"><div className="result-head"><div><span className="eyebrow">Analyse terminée</span><h2>Voici ce que Bricky en pense.</h2></div><span className="status-dot">● Décision</span></div>
    <div className="decision-hero"><div><span className="decision-label">Verdict</span><strong>{label}</strong></div><div className="score-block"><span>Score</span><b>{score ?? "—"}<small>/100</small></b></div><div className="score-block"><span>Confiance</span><b>{confidence ?? "—"}<small>%</small></b></div></div>
    <div className="metric-grid"><Metric label="Loyer mensuel" value={financial.monthly_rent} suffix=" €" /><Metric label="Revenu annuel" value={financial.annual_net_income ?? financial.annual_gross_income} suffix=" €" /><Metric label="Rendement brut" value={financial.gross_yield} suffix=" %" /><Metric label="Rendement net" value={financial.net_yield} suffix=" %" /></div>
    {rows.length > 0 && <div className="dashboard-section"><h3>Scénarios</h3><div className="scenario-grid">{rows.map((key) => <div className="scenario" key={key}><span>{key === "base" ? "Base" : key === "conservative" ? "Conservateur" : "Optimiste"}</span><b>{scenarios[key].net_yield ?? "—"} %</b><small>rendement net</small></div>)}</div></div>}
    {actions.length > 0 && <div className="dashboard-section"><h3>Ce qu’il faut faire</h3><ul>{actions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></div>}
    {risks.length > 0 && <div className="dashboard-section"><h3>Points de vigilance</h3><div className="risk-list">{risks.map((r: any, i: number) => <div className="risk-item" key={i}><b>{r.title || "Risque"}</b><span>{r.severity || ""}</span><p>{r.explanation || ""}</p></div>)}</div></div>}
    {missing.length > 0 && <div className="dashboard-section"><h3>Données manquantes</h3><div className="missing-list">{missing.map((m: any, i: number) => <div key={i}><b>{m.label || m.field_key}</b><p>{m.suggested_question || m.impact || "À vérifier avant décision."}</p></div>)}</div></div>}
  </section>;
}

function Metric({ label, value, suffix }: { label: string; value: unknown; suffix: string }) { return <div className="metric"><span>{label}</span><b>{value == null || value === "" ? "—" : Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{value != null && value !== "" ? suffix : ""}</b></div>; }
