"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type AnalysisResult = { property_id?: string; analysis_id?: string; [key: string]: unknown };
type Payload = { title: string; city: string; address: string; price: string; surface_m2: string; rooms: string; bedrooms: string; dpe_class: string; monthly_rent: string; source_url: string };

export default function AnalyzePage() {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload>({ title: "", city: "", address: "", price: "", surface_m2: "", rooms: "", bedrooms: "", dpe_class: "", monthly_rent: "", source_url: "" });
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [extractNote, setExtractNote] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (!data.session) router.replace("/login"); else setUserEmail(data.session.user.email ?? ""); }); }, [router]);

  async function extractListing() {
    if (!payload.source_url.trim()) return;
    setExtracting(true); setError(""); setExtractNote("");
    try {
      const response = await fetch("/api/properties/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: payload.source_url.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Impossible de lire cette annonce.");
      const e = data.extracted || {};
      setPayload((current) => ({ ...current, title: e.title || current.title, city: e.city || current.city, address: e.address || current.address, price: e.price != null ? String(e.price) : current.price, surface_m2: e.surface_m2 != null ? String(e.surface_m2) : current.surface_m2, rooms: e.rooms != null ? String(e.rooms) : current.rooms, monthly_rent: e.monthly_rent != null ? String(e.monthly_rent) : current.monthly_rent }));
      setExtractNote(`${data.extraction?.fields_found ?? 0} données détectées. Vérifie-les avant de lancer l'analyse.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Extraction impossible."); }
    finally { setExtracting(false); }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession(); const token = sessionData.session?.access_token;
      if (!token) { router.replace("/login"); return; }
      const body = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, ["price", "surface_m2", "rooms", "bedrooms", "monthly_rent"].includes(key) && value !== "" ? Number(value) : value]));
      const response = await fetch("/api/properties/analyze", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data?.details?.message || data?.error || "Analyse impossible."); setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); }
    finally { setLoading(false); }
  }

  const update = (key: keyof Payload, value: string) => setPayload((current) => ({ ...current, [key]: value }));

  return <main className="page">
    <nav className="nav"><div className="brand"><span className="mark">B</span>Bricky</div><div className="navlink">{userEmail || "Analyse"}</div></nav>
    <section className="analysis-shell">
      <div className="analysis-intro"><span className="eyebrow">Bricky · V1</span><h1>Est-ce que ce bien mérite votre attention ?</h1><p className="sub">Collez une annonce ou saisissez les données que vous connaissez. Bricky calcule, vérifie et signale ce qui manque — sans inventer.</p></div>
      <div className="url-import"><label>URL de l'annonce<input value={payload.source_url} onChange={(e) => update("source_url", e.target.value)} placeholder="https://..." /></label><button type="button" className="secondary-button" onClick={extractListing} disabled={extracting || !payload.source_url.trim()}>{extracting ? "Lecture…" : "Extraire les données"}</button></div>
      {extractNote && <div className="extract-note">✓ {extractNote}</div>}
      <form className="property-form" onSubmit={handleSubmit}><div className="form-grid">
        <label>Titre<input value={payload.title} onChange={(e) => update("title", e.target.value)} /></label><label>Ville<input value={payload.city} onChange={(e) => update("city", e.target.value)} placeholder="Fort-de-France" /></label><label>Adresse<input value={payload.address} onChange={(e) => update("address", e.target.value)} placeholder="Adresse du bien" /></label><label>Prix (€)<input required type="number" min="1" value={payload.price} onChange={(e) => update("price", e.target.value)} placeholder="250000" /></label><label>Surface (m²)<input required type="number" min="1" value={payload.surface_m2} onChange={(e) => update("surface_m2", e.target.value)} placeholder="65" /></label><label>Loyer mensuel (€)<input type="number" min="0" value={payload.monthly_rent} onChange={(e) => update("monthly_rent", e.target.value)} placeholder="1200" /></label><label>Pièces<input type="number" min="0" value={payload.rooms} onChange={(e) => update("rooms", e.target.value)} placeholder="3" /></label><label>Chambres<input type="number" min="0" value={payload.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} placeholder="2" /></label><label>DPE<input value={payload.dpe_class} onChange={(e) => update("dpe_class", e.target.value.toUpperCase())} placeholder="D" maxLength={1} /></label>
      </div><button className="primary-button" disabled={loading}>{loading ? "Analyse en cours…" : "Lancer l’analyse Bricky →"}</button>{error && <div className="error-box">{error}</div>}</form>
      {result && <AnalysisDashboard result={result} />}
    </section>
  </main>;
}

function AnalysisDashboard({ result }: { result: AnalysisResult }) {
  const analysis = (result.analysis as Record<string, any>) || result;
  const financialSnapshot = (analysis.financial_snapshot || {}) as Record<string, any>;
  const metrics = (financialSnapshot.metrics || {}) as Record<string, any>;
  const scenarios = (financialSnapshot.scenarios || {}) as Record<string, any>;
  const decisionSnapshot = (analysis.decision_snapshot || {}) as Record<string, any>;
  const decision = (decisionSnapshot.decision || {}) as Record<string, any>;
  const market = (decisionSnapshot.market || {}) as Record<string, any>;
  const risk = (decisionSnapshot.risk || {}) as Record<string, any>;
  const verdict = decision.verdict || analysis.verdict;
  const score = analysis.overall_score ?? decision.score;
  const confidence = analysis.confidence_score ?? decision.confidence_score;
  const actions = Array.isArray(decision.actions) ? decision.actions : [];
  const risks = Array.isArray(risk.risks) ? risk.risks : [];
  const missing = Array.isArray(financialSnapshot.missing_data) ? financialSnapshot.missing_data : [];
  const rows = ["base", "conservative", "optimistic"].filter((k) => scenarios[k]);
  const label = verdict === "interesting" ? "Intéressant" : verdict === "unattractive" ? "Peu intéressant" : "À vérifier & négocier";
  const marketReady = market.status === "ready";
  return <section className="result-panel decision-dashboard"><div className="result-head"><div><span className="eyebrow">Analyse terminée</span><h2>Voici ce que Bricky en pense.</h2></div><span className="status-dot">● Décision</span></div>
    <div className="decision-hero"><div><span className="decision-label">Verdict</span><strong>{label}</strong></div><div className="score-block"><span>Score</span><b>{score ?? "—"}<small>/100</small></b></div><div className="score-block"><span>Confiance</span><b>{confidence ?? "—"}<small>%</small></b></div></div>
    <div className="metric-grid"><Metric label="Loyer mensuel" value={metrics.monthly_rent} suffix=" €" /><Metric label="Revenu annuel net" value={metrics.annual_net_income} suffix=" €" /><Metric label="Rendement brut" value={metrics.gross_yield_pct} suffix=" %" /><Metric label="Rendement net" value={metrics.net_yield_pct} suffix=" %" /></div>
    <div className="dashboard-section market-card"><div className="section-heading"><div><h3>Valeur marché</h3><small>Transactions comparables · données disponibles</small></div><span className="market-badge">{marketReady ? `${market.confidence_score ?? 0}% confiance` : "Données insuffisantes"}</span></div>{marketReady ? <div className="market-grid"><Metric label="Prix du bien" value={market.property_price_m2} suffix=" €/m²" /><Metric label="Marché médian" value={market.market_price_m2_median} suffix=" €/m²" /><Metric label="Valeur estimée" value={market.market_value_estimate} suffix=" €" /><Metric label="Écart au marché" value={market.market_gap_pct} suffix=" %" /></div> : <p className="empty-note">Bricky ne dispose pas encore de suffisamment de transactions comparables pour produire une estimation fiable. Aucune valeur n'est inventée.</p>}</div>
    {rows.length > 0 && <div className="dashboard-section"><h3>Scénarios</h3><div className="scenario-grid">{rows.map((key) => <div className="scenario" key={key}><span>{key === "base" ? "Base" : key === "conservative" ? "Conservateur" : "Optimiste"}</span><b>{scenarios[key].net_yield ?? "—"} %</b><small>rendement net</small></div>)}</div></div>}
    {actions.length > 0 && <div className="dashboard-section"><h3>Ce qu’il faut faire</h3><ul>{actions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></div>}
    {risks.length > 0 && <div className="dashboard-section"><h3>Points de vigilance</h3><div className="risk-list">{risks.map((r: any, i: number) => <div className="risk-item" key={i}><b>{r.title || "Risque"}</b><span>{r.severity || ""}</span><p>{r.explanation || r.impact || ""}</p></div>)}</div></div>}
    {missing.length > 0 && <div className="dashboard-section"><h3>Données manquantes</h3><div className="missing-list">{missing.map((m: any, i: number) => <div key={i}><b>{m.label || m.field_key}</b><p>{m.suggested_question || m.impact || "À vérifier avant décision."}</p></div>)}</div></div>}
  </section>;
}

function Metric({ label, value, suffix }: { label: string; value: unknown; suffix: string }) { return <div className="metric"><span>{label}</span><b>{value == null || value === "" ? "—" : Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{value != null && value !== "" ? suffix : ""}</b></div>; }
