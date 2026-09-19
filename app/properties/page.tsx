"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";

type AnalysisRow = {
  id: string;
  verdict: string | null;
  overall_score: number | null;
  confidence_score: number | null;
  status: string | null;
  created_at: string;
};

type PropertyRow = {
  id: string;
  title: string | null;
  address: string | null;
  city: string | null;
  price: number | null;
  surface_m2: number | null;
  created_at: string;
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

export default function PropertiesPage() {
  const router = useRouter();
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
      const { data, error: queryError } = await supabase
        .from("properties")
        .select("id, title, address, city, price, surface_m2, created_at, analyses(id, verdict, overall_score, confidence_score, status, created_at)")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (queryError) { setError("Impossible de charger vos biens."); setLoading(false); return; }
      setRows((data as unknown as PropertyRow[]) || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [router]);

  return <main className="page">
    <AppNav email={userEmail} active="properties" />
    <section className="analysis-shell">
      <div className="analysis-intro"><span className="eyebrow">Bricky · Historique</span><h1>Mes biens <span className="accent">analysés</span></h1><p className="sub">Retrouvez ici chaque bien que vous avez soumis à Bricky, avec son verdict et ses métriques clés.</p></div>

      {loading && <div className="extract-note">Chargement de vos biens…</div>}
      {error && <div className="error-box">{error}</div>}

      {!loading && !error && rows && rows.length === 0 && (
        <div className="result-panel">
          <p className="empty-note">Vous n'avez pas encore analysé de bien. <a href="/analyze">Lancez votre première analyse →</a></p>
        </div>
      )}

      {!loading && !error && rows && rows.length > 0 && (
        <div className="properties-list">
          {rows.map((row) => {
            const analysis = latestAnalysis(row);
            const verdict = verdictLabel(analysis?.verdict);
            return (
              <a key={row.id} href={`/analyze?property_id=${row.id}`} className="property-row">
                <div>
                  <b>{row.title || row.address || "Bien sans titre"}</b>
                  <span>{[row.address, row.city].filter(Boolean).join(", ") || "Adresse non renseignée"}</span>
                </div>
                <div className="property-row-metrics">
                  {row.price != null && <span>{row.price.toLocaleString("fr-FR")} €</span>}
                  {row.surface_m2 != null && <span>{row.surface_m2} m²</span>}
                  {analysis?.overall_score != null && <span>Score {analysis.overall_score}/100</span>}
                </div>
                <div className="property-row-verdict">
                  <span className={`verdict-pill ${verdict.className}`}>{verdict.label}</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  </main>;
}
