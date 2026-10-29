"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { AnalysesCounter } from "../../components/AnalysesCounter";
import { PropertyIllustration } from "../../components/PropertyIllustration";
import { BrickyIsland } from "../../components/BrickyIsland";
import { illustrationKind } from "../../lib/illustrations/propertyIllustrations";
import type { IslandCounts, IslandKind } from "../../lib/islandScene";
import { useLocale } from "../../components/LocaleProvider";

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
  property_type: string | null;
  created_at: string;
  analyses: AnalysisRow[] | null;
};

// Les titres récupérés sur certaines annonces contiennent des entités HTML (« 80 000 &amp;euro; »).
function decodeEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&euro;/gi, "€")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&amp;/gi, "&");
  }
  return out;
}

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

const CAPABILITY_ROW_1 = [
  { label: "Rendement net & cash-flow réel", color: "accent" },
  { label: "Données cadastrales & urbanisme", color: "blue" },
  { label: "300+ points de risques environnementaux", color: "green" },
  { label: "Comparables du marché local", color: "accent" },
  { label: "Analyse via URL ou PDF d'annonce", color: "blue" },
];

const CAPABILITY_ROW_2 = [
  { label: "Dossier PDF complet", color: "green" },
  { label: "Estimation de loyer fiable", color: "accent" },
  { label: "Scénarios conservateur / optimiste", color: "blue" },
  { label: "Checklist avant achat", color: "amber" },
  { label: "Comparateur de biens", color: "green" },
];

function CapabilityMarquee() {
  return (
    <section className="capability-marquee" aria-hidden="true">
      <div className="capability-marquee-rows">
        <div className="capability-marquee-track">
          {[...CAPABILITY_ROW_1, ...CAPABILITY_ROW_1].map((c, i) => (
            <span className="capability-pill" key={"r1-" + i}>
              <span className={"capability-dot capability-dot-" + c.color} />
              {c.label}
            </span>
          ))}
        </div>
        <div className="capability-marquee-track reverse">
          {[...CAPABILITY_ROW_2, ...CAPABILITY_ROW_2].map((c, i) => (
            <span className="capability-pill" key={"r2-" + i}>
              <span className={"capability-dot capability-dot-" + c.color} />
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// Nombre de biens par parcelle de l'île (les parkings rejoignent les terrains).
function islandCounts(rows: PropertyRow[]): IslandCounts {
  const out: IslandCounts = {};
  for (const row of rows) {
    const kind = illustrationKind(row.property_type, row.title);
    const k: IslandKind = kind === "parking" ? "terrain" : (kind as IslandKind);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function MyIsland({ rows }: { rows: PropertyRow[] }) {
  const { t } = useLocale();
  const n = rows.length;
  return (
    <section className="island-mine" aria-labelledby="my-island-title">
      <div className="island-mine-head">
        <span className="eyebrow">{t("island.my.eyebrow")}</span>
        <h2 id="my-island-title" className="island-title island-title-sm">
          {n === 0 ? t("island.my.eyebrow") : t(n > 1 ? "island.my.title.many" : "island.my.title", { n })}
        </h2>
        <p className="sub">{n === 0 ? t("island.my.empty") : t("island.my.sub")}</p>
      </div>
      <BrickyIsland mode="user" counts={islandCounts(rows)} ariaLabel={t("island.aria")} className="island-stage-mine" />
    </section>
  );
}

export default function PropertiesPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [canCompare, setCanCompare] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showFirstAnalysisCongrats, setShowFirstAnalysisCongrats] = useState(false);
  const [totalAnalyses, setTotalAnalyses] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/login"); return; }
      if (cancelled) return;
      setUserEmail(sessionData.session.user.email ?? "");
      const { data, error: queryError } = await supabase
        .from("properties")
        .select("id, title, address, city, price, surface_m2, property_type, created_at, analyses(id, verdict, overall_score, confidence_score, status, created_at)")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (queryError) { setError("Impossible de charger vos biens."); setLoading(false); return; }
      setRows((data as unknown as PropertyRow[]) || []);
      setLoading(false);

      const { data: sub } = await supabase.rpc("get_my_subscription");
      if (!cancelled && sub && typeof sub === "object" && "can_compare_properties" in sub) {
        setCanCompare(Boolean((sub as { can_compare_properties: boolean }).can_compare_properties));
      }

      const { data: totalData } = await supabase.rpc("get_total_analyses_count_v1");
      if (!cancelled && typeof totalData === "number") setTotalAnalyses(totalData);
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
    <CapabilityMarquee />
    <section className="analysis-shell">
      {rows && !error && <MyIsland rows={rows} />}
      <div className="analysis-intro"><span className="eyebrow">Bricky · Historique</span><h1>Mes biens <span className="accent">analysés</span></h1><p className="sub">Retrouvez ici chaque bien que vous avez soumis à Bricky, avec son verdict et ses métriques clés.{canCompare ? " Sélectionnez jusqu'à 3 biens pour les comparer." : null}</p></div>

      {totalAnalyses !== null && <AnalysesCounter value={totalAnalyses} />}

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
          {!showFirstAnalysisCongrats && (
            <a href={"/analyze?property_id=" + rows[0].id} className="resume-banner">
              <div>
                <b>Reprendre : {decodeEntities(rows[0].title || rows[0].address || "votre dernier bien")}</b>
                <p>Continuez où vous en étiez, ou lancez une nouvelle analyse ci-dessous.</p>
              </div>
              <span className="primary-button resume-cta">Reprendre →</span>
            </a>
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
                  <PropertyIllustration propertyType={row.property_type} title={row.title} />
                  <div className="property-row-info">
                    <b>{decodeEntities(row.title || row.address || "Bien sans titre")}</b>
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
      <div className="compare-brick" role="region" aria-label="Comparaison de biens">
        <div className="compare-brick-stack" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={"compare-brick-slot compare-brick-slot-" + i + (i < selected.length ? " is-filled" : "")} />
          ))}
        </div>
        <div className="compare-brick-text">
          <b>{selected.length}/3 bien{selected.length > 1 ? "s" : ""}</b>
          <span>{selected.length < 2 ? "Ajoute encore 1 bien" : selected.length < 3 ? "Prêt · 1 place libre" : "Prêt à comparer"}</span>
        </div>
        <button type="button" className="compare-brick-clear" aria-label="Annuler la sélection" title="Annuler" onClick={() => setSelected([])}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <button
          type="button"
          className="compare-brick-go"
          disabled={selected.length < 2}
          onClick={() => router.push("/compare?ids=" + selected.join(","))}
        >
          Comparer
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    )}
  </main>;
}
