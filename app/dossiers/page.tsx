"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { BiensTabs } from "../../components/BiensTabs";
import { usePlan } from "../../components/FeatureLock";
import "./dossiers.css";

// « Mes dossiers » : chaque analyse terminée devient un dossier Bricky, présenté comme
// une feuille (référence, bien, chiffres clés, score). En haut, les 3 derniers en
// éventail 3D ; dessous, tous les dossiers. Tout en CSS (transform + opacity) :
// pas de moteur 3D, une seule animation d'entrée, inclinaison à la souris sur ordinateur.

type AnalysisRow = {
  id: string;
  verdict: string | null;
  overall_score: number | null;
  confidence_score: number | null;
  created_at: string;
  gross: string | null;
  net: string | null;
  rent: string | null;
  cashflow: string | null;
  total_cost: string | null;
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

type Dossier = PropertyRow & { analysis: AnalysisRow; ref: string };
type Filter = "all" | "interesting" | "check" | "unattractive";

const SELECT =
  "id, title, address, city, price, surface_m2, property_type, created_at, " +
  "analyses(id, verdict, overall_score, confidence_score, created_at, " +
  "gross:financial_snapshot->metrics->>gross_yield_pct, net:financial_snapshot->metrics->>net_yield_pct, " +
  "rent:financial_snapshot->metrics->>monthly_rent, cashflow:financial_snapshot->financing->>monthly_cashflow, " +
  "total_cost:financial_snapshot->acquisition->>total_acquisition_cost)";

function decodeEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&euro;/gi, "€").replace(/&nbsp;/gi, " ").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/gi, "&");
  }
  return out;
}

// Même référence que sur le PDF (app/api/properties/dossier/route.ts).
function dossierRef(p: PropertyRow) {
  return `BRK-${new Date(p.created_at).getFullYear()}-${p.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function verdictInfo(v: string | null | undefined): { label: string; key: Filter } {
  if (v === "interesting") return { label: "Intéressant", key: "interesting" };
  if (v === "unattractive") return { label: "Peu intéressant", key: "unattractive" };
  return { label: "À vérifier", key: "check" };
}

const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const eur = (v: unknown) => { const n = num(v); return n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`; };
const pct = (v: unknown) => { const n = num(v); return n == null ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`; };
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** La feuille « dossier » (miniature de la couverture du PDF). */
function DossierSheet({ d, compact = false }: { d: Dossier; compact?: boolean }) {
  const a = d.analysis;
  const v = verdictInfo(a.verdict);
  const cash = num(a.cashflow);
  return (
    <div className={"dz-sheet" + (compact ? " dz-sheet-compact" : "")}>
      <div className="dz-sheet-top">
        <span className="dz-logo" aria-hidden="true"><i /><i /></span>
        <span className="dz-ref">{d.ref}</span>
      </div>
      <b className="dz-word">DOSSIER</b>
      <div className="dz-meta">
        <div>
          <small>Bien</small>
          <strong>{decodeEntities(d.title || d.address || "Bien sans titre")}</strong>
          <span>{[d.city, d.surface_m2 ? `${d.surface_m2} m²` : null].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div className="dz-meta-right">
          <small>Analysé le</small>
          <strong>{date(a.created_at)}</strong>
          <small>Verdict</small>
          <strong className={"dz-v dz-v-" + v.key}>{v.label}</strong>
        </div>
      </div>
      <div className="dz-table">
        <div className="dz-tr dz-th"><span>Indicateur</span><span>Valeur</span></div>
        <div className="dz-tr"><span>Prix demandé</span><span>{eur(d.price)}</span></div>
        {!compact && <div className="dz-tr"><span>Coût total</span><span>{eur(a.total_cost)}</span></div>}
        <div className="dz-tr"><span>Loyer estimé</span><span>{num(a.rent) == null ? "—" : `${eur(a.rent)}/mois`}</span></div>
        <div className="dz-tr"><span>Rendement brut</span><span>{pct(a.gross)}</span></div>
        {!compact && <div className="dz-tr"><span>Rendement net</span><span>{pct(a.net)}</span></div>}
        <div className="dz-tr"><span>Cash-flow</span><span className={cash != null && cash < 0 ? "dz-neg" : ""}>{cash == null ? "—" : `${cash > 0 ? "+" : ""}${eur(cash)}/mois`}</span></div>
      </div>
      <div className="dz-total"><span>Score Bricky</span><b>{a.overall_score ?? "—"}<small>/100</small></b></div>
      {!compact && <p className="dz-notes">Analyse générée par Bricky : marché (DVF), cadastre, PLU, risques et financement.</p>}
    </div>
  );
}

export default function DossiersPage() {
  const router = useRouter();
  const plan = usePlan();
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [dlError, setDlError] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { router.replace("/login"); return; }
      setEmail(s.session.user.email ?? "");
      const { data, error: err } = await supabase.from("properties").select(SELECT).order("created_at", { ascending: false }).limit(60);
      if (cancelled) return;
      if (err) { setError("Impossible de charger vos dossiers."); return; }
      setRows((data as unknown as PropertyRow[]) || []);
    })();
    return () => { cancelled = true; };
  }, [router]);

  // Un dossier = un bien avec au moins une analyse (on garde la plus récente).
  const dossiers = useMemo<Dossier[]>(() => (rows || []).flatMap((p) => {
    const list = [...(p.analyses || [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return list[0] ? [{ ...p, analysis: list[0], ref: dossierRef(p) }] : [];
  }), [rows]);
  const shown = filter === "all" ? dossiers : dossiers.filter((d) => verdictInfo(d.analysis.verdict).key === filter);
  const hero = dossiers.slice(0, 3);
  const fullPdf = plan.has("can_download_full_pdf");

  // Inclinaison du dossier de devant qui suit la souris (ordinateur seulement, une écriture par image).
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--tx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        el.style.setProperty("--ty", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    };
    const onLeave = () => { el.style.setProperty("--tx", "0"); el.style.setProperty("--ty", "0"); };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(frame); };
  }, [hero.length]);

  async function download(d: Dossier) {
    setBusy(d.id); setDlError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { router.replace("/login"); return; }
      const res = await fetch("/api/properties/dossier", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ property_id: d.id }) });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Le dossier n'a pas pu être généré (erreur ${res.status}).`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `${res.headers.get("X-Bricky-Pdf") === "summary" ? "synthese" : "dossier"}-${d.ref}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : "Téléchargement impossible.");
    } finally {
      setBusy(null);
    }
  }

  const counts = {
    all: dossiers.length,
    interesting: dossiers.filter((d) => verdictInfo(d.analysis.verdict).key === "interesting").length,
    check: dossiers.filter((d) => verdictInfo(d.analysis.verdict).key === "check").length,
    unattractive: dossiers.filter((d) => verdictInfo(d.analysis.verdict).key === "unattractive").length,
  };

  return (
    <main className="page">
      <AppNav email={email} active="properties" />
      <section className="analysis-shell dz-shell">
        <BiensTabs active="dossiers" count={rows ? dossiers.length : null} />

        <div className="dz-hero">
          <span className="dz-grid-lines" aria-hidden="true" />
          <span className="dz-pill">Généré automatiquement après chaque analyse</span>
          <h1 className="dz-title">Vos dossiers, prêts à <span className="dz-hl">envoyer<i /><i /></span></h1>
          <p className="dz-sub">Chaque bien analysé devient un dossier complet : chiffres clés, verdict, risques et financement. À télécharger, à partager ou à modifier.</p>

          {rows && hero.length > 0 ? (
            <div className="dz-stage" ref={stageRef} style={{ "--n": hero.length } as CSSProperties}>
              {hero.map((d, i) => (
                <a key={d.id} href={`/analyze?property_id=${d.id}`} className="dz-fan" data-pos={hero.length === 1 ? "c" : i === 0 ? "c" : i === 1 ? "l" : "r"} aria-label={`Ouvrir le dossier ${d.ref}`}>
                  <DossierSheet d={d} />
                </a>
              ))}
              <span className="dz-fade" aria-hidden="true" />
              <span className="dz-badge"><b>{dossiers.length}</b> dossier{dossiers.length > 1 ? "s" : ""} · {counts.interesting} intéressant{counts.interesting > 1 ? "s" : ""}</span>
            </div>
          ) : null}
        </div>

        {error && <div className="error-box">{error}</div>}
        {!rows && !error && <div className="skeleton-list" role="status" aria-label="Chargement de vos dossiers"><div className="skeleton" /><div className="skeleton" /></div>}

        {rows && dossiers.length === 0 && (
          <div className="result-panel dz-empty">
            <h2>Pas encore de dossier</h2>
            <p className="empty-note">Lancez une analyse : Bricky prépare le dossier du bien automatiquement.</p>
            <a href="/analyze" className="primary-button">Analyser un bien →</a>
          </div>
        )}

        {dossiers.length > 0 && (
          <>
            <div className="dz-filters" role="tablist" aria-label="Filtrer les dossiers">
              {([["all", "Tous"], ["interesting", "Intéressants"], ["check", "À vérifier"], ["unattractive", "Peu intéressants"]] as [Filter, string][]).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={"dz-filter" + (filter === k ? " is-on" : "")} onClick={() => setFilter(k)} disabled={counts[k] === 0 && k !== "all"}>
                  {label}<span>{counts[k]}</span>
                </button>
              ))}
            </div>
            {dlError && <div className="error-box">{dlError}</div>}
            <div className="dz-list">
              {shown.map((d, i) => (
                <article key={d.id} className="dz-card" style={{ "--i": Math.min(i, 8) } as CSSProperties}>
                  <a href={`/analyze?property_id=${d.id}`} className="dz-card-doc" aria-label={`Ouvrir le dossier ${d.ref}`}>
                    <DossierSheet d={d} compact />
                  </a>
                  <div className="dz-actions">
                    <a className="dz-act dz-act-main" href={`/analyze?property_id=${d.id}`}>Ouvrir</a>
                    <button type="button" className="dz-act" onClick={() => download(d)} disabled={busy === d.id || plan.loading} title={fullPdf ? "Télécharger le dossier PDF complet" : "Télécharger la synthèse PDF"}>
                      {busy === d.id ? "…" : "PDF"}
                    </button>
                    <a className="dz-act" href={`/analyze?property_id=${d.id}&modifier=1`} title="Corriger les données puis relancer l'analyse (compte 1 analyse)">Modifier</a>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
