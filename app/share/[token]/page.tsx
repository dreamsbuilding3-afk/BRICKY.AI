"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";
import { AppNav } from "../../../components/AppNav";

type SharedData = {
  analysis_id?: string;
  status?: string;
  overall_score?: number | null;
  confidence_score?: number | null;
  verdict?: string | null;
  financial_snapshot?: Record<string, any>;
  decision_snapshot?: Record<string, any>;
  created_at?: string;
  property?: Record<string, any>;
};

function Metric({ label, value, suffix }: { label: string; value: unknown; suffix?: string }) {
  const display = value === null || value === undefined || value === "" ? "—" : `${value}${suffix ?? ""}`;
  return (
    <div className="metric">
      <span>{label}</span>
      <b>{display}</b>
    </div>
  );
}

export default function SharedAnalysisPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_shared_analysis", { p_token: params.token });
      if (!active) return;
      if (rpcError) {
        setError("Impossible de charger cette analyse.");
      } else if (!rpcData) {
        setError("Ce lien de partage est invalide ou a expire.");
      } else {
        setData(rpcData as SharedData);
      }
      setLoading(false);
    }
    if (params?.token) load();
    return () => {
      active = false;
    };
  }, [params?.token]);

  const property = data?.property || {};
  const financialSnapshot = data?.financial_snapshot || {};
  const metrics = (financialSnapshot.metrics || {}) as Record<string, any>;
  const acquisition = (financialSnapshot.acquisition || {}) as Record<string, any>;
  const financing = (financialSnapshot.financing || {}) as Record<string, any>;

  return (
    <div className="page">
      <AppNav />
      <div className="share-page">
        <div className="share-banner">Analyse partagee en lecture seule</div>
        {loading ? <p>Chargement...</p> : null}
        {error ? <p className="share-error">{error}</p> : null}
        {!loading && !error && data ? (
          <>
            <h1 style={{ fontSize: 28, marginBottom: 4 }}>{property.title || property.city || "Bien immobilier"}</h1>
            <p className="sub" style={{ margin: "0 0 24px" }}>
              {[property.city, property.postal_code].filter(Boolean).join(" ")}
            </p>

            <div className="dashboard-section decision-hero">
              <div>
                <span className="decision-label">Verdict</span>
                <strong>{data.verdict ?? "—"}</strong>
              </div>
              <div className="score-block">
                <span>Score</span>
                <b>{data.overall_score ?? "—"}<small>/100</small></b>
              </div>
              <div className="score-block">
                <span>Confiance</span>
                <b>{data.confidence_score ?? "—"}<small>%</small></b>
              </div>
            </div>

            <div className="dashboard-section">
              <h3>Bien</h3>
              <div className="metric-grid">
                <Metric label="Prix" value={property.price} suffix=" €" />
                <Metric label="Surface" value={property.surface_m2} suffix=" m²" />
                <Metric label="Pieces" value={property.rooms} />
                <Metric label="Chambres" value={property.bedrooms} />
                <Metric label="DPE" value={property.dpe_class} />
                <Metric label="GES" value={property.ges_class} />
              </div>
            </div>

            <div className="dashboard-section">
              <h3>Rentabilite</h3>
              <div className="metric-grid">
                <Metric label="Loyer mensuel" value={metrics.monthly_rent} suffix=" €" />
                <Metric label="Rendement brut" value={metrics.gross_yield_pct} suffix=" %" />
                <Metric label="Rendement net" value={metrics.net_yield_pct} suffix=" %" />
                <Metric label="Cashflow mensuel" value={metrics.monthly_cashflow ?? financing.monthly_cashflow} suffix=" €" />
              </div>
            </div>

            <div className="dashboard-section">
              <h3>Achat &amp; financement (estimation)</h3>
              <div className="metric-grid">
                <Metric label="Frais de notaire" value={acquisition.notary_fees} suffix=" €" />
                <Metric label="Cout total d'acquisition" value={acquisition.total_acquisition_cost} suffix=" €" />
                <Metric label="Mensualite du pret" value={financing.monthly_loan_payment} suffix=" €" />
              </div>
            </div>

            <p style={{ marginTop: 32, fontSize: 12, color: "#999" }}>
              Analyse generee par Bricky.AI — estimation basee sur les donnees disponibles, ne constitue pas un conseil en investissement.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
