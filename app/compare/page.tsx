"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";

type AnalysisRow = {
  id: string;
  verdict: string | null;
  overall_score: number | null;
  confidence_score: number | null;
  financial_snapshot: Record<string, unknown> | null;
  created_at: string;
};

type PropertyRow = {
  id: string;
  title: string | null;
  address: string | null;
  city: string | null;
  price: number | null;
  surface_m2: number | null;
  analyses: AnalysisRow[] | null;
};

function latestAnalysis(row: PropertyRow): AnalysisRow | null {
  const list = row.analyses || [];
  if (!list.length) return null;
  return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

function verdictLabel(verdict: string | null | undefined): { label: string; className: string } {
  if (verdict === "interesting") return { label: "Intéressant", className: "verdict-interesting" };
  if (verdict === "unattractive") return { label: "Peu intéressant", className: "verdict-unattractive" };
  if (verdict) return { label: "À vérifier", className: "verdict-pending" };
  return { label: "Non évalué", className: "verdict-pending" };
}

function fmt(value: unknown, suffix: string): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + suffix;
}

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <ComparePageInner />
    </Suspense>
  );
}

function ComparePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") || "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const [userEmail, setUserEmail] = useState("");
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/login"); return; }
      if (cancelled) return;
      setUserEmail(sessionData.session.user.email ?? "");

      if (ids.length < 2) {
        setError("Sélectionnez au moins deux biens depuis la page Mes biens pour lancer une comparaison.");
        setLoading(false);
        return;
      }

      const { data: sub } = await supabase.rpc("get_my_subscription");
      const canCompare = Boolean(sub && typeof sub === "object" && "can_compare_properties" in sub && (sub as { can_compare_properties: boolean }).can_compare_properties);
      if (!canCompare) { router.replace("/pricing"); return; }
      if (cancelled) return;

      const { data, error: queryError } = await supabase
        .from("properties")
        .select("id, title, address, city, price, surface_m2, analyses(id, verdict, overall_score, confidence_score, financial_snapshot, created_at)")
        .in("id", ids.slice(0, 3));
      if (cancelled) return;
      if (queryError) { setError("Impossible de charger ces biens."); setLoading(false); return; }
      const ordered = ids.map((id) => (data as unknown as PropertyRow[] || []).find((r) => r.id === id)).filter(Boolean) as PropertyRow[];
      setRows(ordered);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam, router]);

  const items = (rows || []).map((row) => {
    const analysis = latestAnalysis(row);
    const fs = (analysis?.financial_snapshot || {}) as Record<string, any>;
    const metrics = (fs.metrics || {}) as Record<string, any>;
    const acquisition = (fs.acquisition || {}) as Record<string, any>;
    const financing = (fs.financing || {}) as Record<string, any>;
    const pricePerM2 = row.price != null && row.surface_m2 ? row.price / row.surface_m2 : null;
    return { row, analysis, metrics, acquisition, financing, pricePerM2, verdict: verdictLabel(analysis?.verdict) };
  });

  const bestGrossYield = Math.max(...items.map((i) => Number(i.metrics.gross_yield_pct ?? -Infinity)));
  const bestNetYield = Math.max(...items.map((i) => Number(i.metrics.net_yield_pct ?? -Infinity)));
  const bestScore = Math.max(...items.map((i) => Number(i.analysis?.overall_score ?? -Infinity)));
  const bestCashflow = Math.max(...items.map((i) => Number(i.financing.monthly_cashflow ?? -Infinity)));
  const lowestPriceM2 = Math.min(...items.filter((i) => i.pricePerM2 != null).map((i) => i.pricePerM2 as number));

  return (
    <main className="page">
      <AppNav email={userEmail} active="properties" />
      <section className="compare-page">
        <span className="eyebrow">Bricky · Comparaison</span>
        <h1>Comparer vos biens</h1>
        <p className="sub" style={{ margin: "10px 0 0" }}>Comparez côte à côte les biens sélectionnés pour prendre la meilleure décision.</p>

        {loading && <div className="extract-note">Chargement de la comparaison…</div>}
        {error && <div className="error-box">{error}</div>}

        {!loading && !error && items.length > 0 && (
          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Bien</th>
                  {items.map((item) => (
                    <th key={item.row.id}>{item.row.title || item.row.address || "Bien sans titre"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Adresse</td>
                  {items.map((item) => (
                    <td key={item.row.id}>{[item.row.address, item.row.city].filter(Boolean).join(", ") || "—"}</td>
                  ))}
                </tr>
                <tr>
                  <td>Prix</td>
                  {items.map((item) => (
                    <td key={item.row.id}>{fmt(item.row.price, " €")}</td>
                  ))}
                </tr>
                <tr>
                  <td>Surface</td>
                  {items.map((item) => (
                    <td key={item.row.id}>{fmt(item.row.surface_m2, " m²")}</td>
                  ))}
                </tr>
                <tr>
                  <td>Prix / m²</td>
                  {items.map((item) => (
                    <td key={item.row.id} className={item.pricePerM2 != null && item.pricePerM2 === lowestPriceM2 ? "compare-highlight" : ""}>{fmt(item.pricePerM2, " €/m²")}</td>
                  ))}
                </tr>
                <tr>
                  <td>Verdict</td>
                  {items.map((item) => (
                    <td key={item.row.id}><span className={"verdict-pill " + item.verdict.className}>{item.verdict.label}</span></td>
                  ))}
                </tr>
                <tr>
                  <td>Score global</td>
                  {items.map((item) => (
                    <td key={item.row.id} className={Number(item.analysis?.overall_score) === bestScore && bestScore > -Infinity ? "compare-highlight" : ""}>{item.analysis?.overall_score != null ? item.analysis.overall_score + "/100" : "—"}</td>
                  ))}
                </tr>
                <tr>
                  <td>Confiance</td>
                  {items.map((item) => (
                    <td key={item.row.id}>{fmt(item.analysis?.confidence_score, " %")}</td>
                  ))}
                </tr>
                <tr>
                  <td>Loyer mensuel</td>
                  {items.map((item) => (
                    <td key={item.row.id}>{fmt(item.metrics.monthly_rent, " €")}</td>
                  ))}
                </tr>
                <tr>
                  <td>Rendement brut</td>
                  {items.map((item) => (
                    <td key={item.row.id} className={Number(item.metrics.gross_yield_pct) === bestGrossYield && bestGrossYield > -Infinity ? "compare-highlight" : ""}>{fmt(item.metrics.gross_yield_pct, " %")}</td>
                  ))}
                </tr>
                <tr>
                  <td>Rendement net</td>
                  {items.map((item) => (
                    <td key={item.row.id} className={Number(item.metrics.net_yield_pct) === bestNetYield && bestNetYield > -Infinity ? "compare-highlight" : ""}>{fmt(item.metrics.net_yield_pct, " %")}</td>
                  ))}
                </tr>
                <tr>
                  <td>Cash-flow mensuel</td>
                  {items.map((item) => (
                    <td key={item.row.id} className={Number(item.financing.monthly_cashflow) === bestCashflow && bestCashflow > -Infinity ? "compare-highlight" : ""}>{fmt(item.financing.monthly_cashflow, " €")}</td>
                  ))}
                </tr>
                <tr>
                  <td>Coût total d&apos;acquisition</td>
                  {items.map((item) => (
                    <td key={item.row.id}>{fmt(item.acquisition.total_acquisition_cost, " €")}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          <a href="/properties" className="secondary-button" style={{ display: "inline-flex", textDecoration: "none", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>← Retour à mes biens</a>
        </div>
      </section>
    </main>
  );
}
