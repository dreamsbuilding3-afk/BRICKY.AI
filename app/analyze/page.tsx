"use client";

import { FormEvent, useState } from "react";

type AnalysisResult = {
  property_id?: string;
  analysis_id?: string;
  analysis?: Record<string, unknown>;
  [key: string]: unknown;
};

export default function AnalyzePage() {
  const [payload, setPayload] = useState({
    title: "Appartement à analyser",
    city: "",
    address: "",
    price: "",
    surface_m2: "",
    rooms: "",
    bedrooms: "",
    dpe_class: "",
    monthly_rent: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    const body = Object.fromEntries(
      Object.entries(payload).map(([key, value]) => {
        if (["price", "surface_m2", "rooms", "bedrooms", "monthly_rent"].includes(key) && value !== "") {
          return [key, Number(value)];
        }
        return [key, value];
      }),
    );

    try {
      const response = await fetch("/api/properties/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.details?.message || data?.error || "Analyse impossible.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  const update = (key: keyof typeof payload, value: string) => setPayload((current) => ({ ...current, [key]: value }));

  return (
    <main className="page">
      <nav className="nav"><div className="brand"><span className="mark">B</span>Bricky</div><span className="navlink">Analyse</span></nav>
      <section className="analysis-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · V1</span>
          <h1>Analysez le bien avant de décider.</h1>
          <p className="sub">Entrez uniquement les données que vous connaissez. Bricky calculera le reste sans inventer les informations manquantes.</p>
        </div>

        <form className="property-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>Titre<input value={payload.title} onChange={(e) => update("title", e.target.value)} /></label>
            <label>Ville<input value={payload.city} onChange={(e) => update("city", e.target.value)} placeholder="Fort-de-France" /></label>
            <label>Adresse<input value={payload.address} onChange={(e) => update("address", e.target.value)} placeholder="Adresse du bien" /></label>
            <label>Prix (€)<input required type="number" min="1" value={payload.price} onChange={(e) => update("price", e.target.value)} placeholder="250000" /></label>
            <label>Surface (m²)<input required type="number" min="1" value={payload.surface_m2} onChange={(e) => update("surface_m2", e.target.value)} placeholder="65" /></label>
            <label>Loyer mensuel (€)<input type="number" min="0" value={payload.monthly_rent} onChange={(e) => update("monthly_rent", e.target.value)} placeholder="1200" /></label>
            <label>Pièces<input type="number" min="0" value={payload.rooms} onChange={(e) => update("rooms", e.target.value)} placeholder="3" /></label>
            <label>Chambres<input type="number" min="0" value={payload.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} placeholder="2" /></label>
            <label>DPE<input value={payload.dpe_class} onChange={(e) => update("dpe_class", e.target.value.toUpperCase())} placeholder="D" maxLength={1} /></label>
          </div>
          <button className="primary-button" disabled={loading}>{loading ? "Analyse en cours…" : "Lancer l’analyse Bricky →"}</button>
          {error && <div className="error-box">{error}</div>}
        </form>

        {result && (
          <section className="result-panel">
            <div className="result-head"><div><span className="eyebrow">Analyse terminée</span><h2>Première lecture du dossier</h2></div><span className="status-dot">● Bricky</span></div>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </section>
        )}
      </section>
    </main>
  );
}
