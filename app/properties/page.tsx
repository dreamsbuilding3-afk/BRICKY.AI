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

const EMPTY_SEEN_KEY = "bricky_empty_seen";

export default function PropertiesPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [canCompare, setCanCompare] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showFirstAnalysisCongrats, setShowFirstAnalysisCongrats] = useState(false);

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

      const { data: sub } = await supabase.rpc("get_my_subscription");
      if (!cancelled && sub && typeof sub === "object" && "can_compare_properties" in sub) {
        setCanCompare(Boolean((sub as { can_compare_properties: boolean }).can_compare_properties));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (loading || error || !rows) return;
    try {
      if (rows.length === 0) {
        window.localStorage.setItem(EMPTY_SEEN_KEY, "1");
      } else if (window.localStorage.getItem(EMPTY_SEEN_KEY) === "1") {
        setShowFirstAnalysisCongrats(true);
        window.localStorage.removeItem(EMPTY_SEEN_KEY);
      }
    } catch {
      // localStorage indisponible (navigation privée, etc.) : pas grave, on ignore.
    }
  }, [loading, error, rows]);

  function toggleSelect(id: string, e: React.MouseEvent | React.ChangeEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!canCompare) {
      router.push("/pricing");
      return;
    }
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  return <main className="page">
    <AppNav email={userEmail} active="properties" />
    <section className="analysis-shell">
      <div className="analysis-intro"><span className="eyebrow">Bricky · Historique</span><h1>Mes biens <span className="accent">analysés</span></h1><p className="sub">Retrouvez ici chaque bien que vous avez soumis à Bricky, avec son verdict et ses métriques clés.{canCompare ? " Sélectionnez jusqu'à 3 biens pour les comparer." : null}</p></div>

      {loading && <div className="extract-note">Chargement de vos biens…</div>}
      {error && <div className="error-box">{error}</div>}

      {!loading && !error && rows && rows.length === 0 && (
        <div className="result-panel" style={{ textAlign: "center" }}>
          <img src="/mascot-avatar-round.png" alt="" className="welcome-mascot" />
          <span className="eyebrow">Bienvenue sur Bricky</span>
          <h2 style={{ margin: "14px 0 8px" }}>Analysez votre premier bien</h2>
          <p className="empty-note" style={{ maxWidth: 480, margin: "0 auto 20px" }}>Collez une annonce ou déposez un PDF : Bricky calcule le rendement, le cash-flow, les risques et tout ce qu'il faut vérifier avant de vous engager.</p>
          <div className="onboarding-checklist">
            <b>Avant de commencer, préparez :</b>
            <ul>
              <li>L'adresse du bien</li>
              <li>Le prix d'achat (ou le lien de l'annonce)</li>
              <li>Le loyer si vous le connaissez déjà — sinon Bricky l'estime automatiquement</li>
            </ul>
          </div>
          <div className="steps-grid" style={{ textAlign: "left", marginBottom: 28 }}>
            <div className="card step-card"><span className="step-number">1</span><b>Collez ou déposez</b><p className="empty-note">Un lien d'annonce ou un PDF (annonce, dossier).</p></div>
            <div className="card step-card"><span className="step-number">2</span><b>Bricky analyse</b><p className="empty-note">Rendement, cash-flow, risques, cadastre et urbanisme.</p></div>
            <div className="card step-card"><span className="step-number">3</span><b>Vous décidez</b><p className="empty-note">Un verdict clair et un dossier PDF à télécharger.</p></div>
          </div>
          <a href="/analyze" className="primary-button" style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 54 }}>Lancer ma première analyse →</a>
        </div>
      )}

      {!loading && !error && rows && rows.length > 0 && (
        <>
          {showFirstAnalysisCongrats && (
            <div className="first-analysis-banner">
              <img src="/mascot-avatar-round.png" alt="" />
              <div>
                <b>Bravo, votre première analyse est prête !</b>
                <p>Consultez le verdict ci-dessous, téléchargez le dossier PDF, ou lancez une nouvelle analyse pour comparer un autre bien.</p>
              </div>
              <button type="button" className="first-analysis-dismiss" aria-label="Fermer" onClick={() => setShowFirstAnalysisCongrats(false)}>×</button>
            </div>
          )}
          <div className="properties-list">
            {rows.map((row) => {
              const analysis = latestAnalysis(row);
              const verdict = verdictLabel(analysis?.verdict);
              const isSelected = selected.includes(row.id);
              return (
                <a key={row.id} href={"/analyze?property_id=" + row.id} className={"property-row" + (isSelected ? " property-row-selected" : "")}>
                  <label
                    className={"property-row-check" + (canCompare ? "" : " property-row-check-locked")}
                    title={canCompare ? "Sélectionner pour comparer" : "Comparaison disponible avec le palier Pro"}
                    onClick={(e) => toggleSelect(row.id, e)}
                  >
                    <input type="checkbox" checked={isSelected} readOnly />
                  </label>
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
                    <span className={"verdict-pill " + verdict.className}>{verdict.label}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}
    </section>

    {selected.length > 0 && (
      <div className="compare-bar">
        <span>{selected.length} bien{selected.length > 1 ? "s" : ""} sélectionné{selected.length > 1 ? "s" : ""}</span>
        <div className="compare-bar-actions">
          <button type="button" className="secondary-button" onClick={() => setSelected([])}>Annuler</button>
          <button
            type="button"
            className="primary-button"
            disabled={selected.length < 2}
            onClick={() => router.push("/compare?ids=" + selected.join(","))}
          >
            Comparer
          </button>
        </div>
      </div>
    )}
  </main>;
}
