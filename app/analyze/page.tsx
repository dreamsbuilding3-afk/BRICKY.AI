"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type AnalysisResult = { property_id?: string; analysis_id?: string; [key: string]: unknown };
type Payload = { title: string; city: string; address: string; price: string; surface_m2: string; rooms: string; bedrooms: string; dpe_class: string; monthly_rent: string; source_url: string };
type CadastralResult = { cadastral?: { commune_code: string; section_prefix: string; section: string; parcel_number: string; parcel_id: string; source: string; source_url: string; plan_url: string; geometry?: unknown; parcel_area_m2?: number }; error?: string };
type UrbanismeResult = { urbanisme?: { zone_type: string | null; zone_label: string | null; zone_label_long: string | null; destination_dominante: string | null; regulation_url: string | null; insee_code: string | null; source: string; metadata?: { typezone_label?: string | null } }; error?: string; note?: string };
type BatimentResult = { batiment?: { hauteur_m: number | null; nature: string | null; usage_1: string | null; usage_2: string | null; nombre_etages: number | null; nombre_logements: number | null; date_construction: string | null; geometry?: unknown; source: string }; error?: string; note?: string };

export default function AnalyzePage() {
  return <Suspense fallback={null}><AnalyzePageInner /></Suspense>;
}

function AnalyzePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdParam = searchParams.get("property_id");
  const [payload, setPayload] = useState<Payload>({ title: "", city: "", address: "", price: "", surface_m2: "", rooms: "", bedrooms: "", dpe_class: "", monthly_rent: "", source_url: "" });
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [extractNote, setExtractNote] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (!data.session) router.replace("/login"); else setUserEmail(data.session.user.email ?? ""); }); }, [router]);

  useEffect(() => {
    if (!propertyIdParam) return;
    let cancelled = false;
    async function loadExisting() {
      setLoadingExisting(true); setLoadError("");
      try {
        const { data: propertyRow, error: propertyError } = await supabase
          .from("properties")
          .select("id, title, city, address, price, surface_m2")
          .eq("id", propertyIdParam)
          .single();
        if (propertyError || !propertyRow) throw new Error("Bien introuvable ou non accessible.");
        const { data: analysisRow, error: analysisError } = await supabase
          .from("analyses")
          .select("id, property_id, financial_snapshot, decision_snapshot, overall_score, confidence_score, verdict, status, created_at")
          .eq("property_id", propertyIdParam)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (analysisError) throw new Error("Analyse introuvable pour ce bien.");
        if (cancelled) return;
        setPayload((current) => ({
          ...current,
          title: propertyRow.title || "",
          city: propertyRow.city || "",
          address: propertyRow.address || "",
          price: propertyRow.price != null ? String(propertyRow.price) : "",
          surface_m2: propertyRow.surface_m2 != null ? String(propertyRow.surface_m2) : "",
        }));
        if (analysisRow) {
          setResult({
            property_id: propertyIdParam ?? undefined,
            analysis_id: analysisRow.id,
            analysis: {
              financial_snapshot: analysisRow.financial_snapshot,
              decision_snapshot: analysisRow.decision_snapshot,
              overall_score: analysisRow.overall_score,
              confidence_score: analysisRow.confidence_score,
              verdict: analysisRow.verdict,
            },
          });
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Impossible de charger ce bien.");
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    }
    loadExisting();
    return () => { cancelled = true; };
  }, [propertyIdParam]);

  async function extractListing() {
    if (!payload.source_url.trim()) return;
    setExtracting(true); setError(""); setExtractNote("");
    try {
      const response = await fetch("/api/properties/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: payload.source_url.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Impossible de lire cette annonce.");
      const e = data.extracted || {};
      setPayload((current) => ({ ...current, title: e.title || current.title, city: e.city || current.city, address: e.address || current.address, price: e.price != null ? String(e.price) : current.price, surface_m2: e.surface_m2 != null ? String(e.surface_m2) : current.surface_m2, rooms: e.rooms != null ? String(e.rooms) : current.rooms, monthly_rent: e.monthly_rent != null ? String(e.monthly_rent) : current.monthly_rent }));
      setExtractNote(`${data.extraction?.fields_found ?? 0} donnÃ©es dÃ©tectÃ©es. VÃ©rifie-les avant de lancer l'analyse.`);
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
    <nav className="nav"><div className="brand"><span className="mark">B</span>Bricky</div><div className="nav-links"><a className="navlink" href="/properties">Mes biens</a><span className="navlink">{userEmail || "Analyse"}</span></div></nav>
    <section className="analysis-shell">
      <div className="analysis-intro"><span className="eyebrow">Bricky Â· V1</span><h1>{propertyIdParam ? "Voici lâanalyse de ce bien." : "Est-ce que ce bien mÃ©rite votre attention ?"}</h1><p className="sub">{propertyIdParam ? "Analyse enregistrÃ©e, telle que calculÃ©e par Bricky." : "Collez une annonce ou saisissez les donnÃ©es que vous connaissez. Bricky calcule, vÃ©rifie et signale ce qui manque â sans inventer."}</p></div>
      {loadingExisting && <div className="extract-note">Chargement du bienâ¦</div>}
      {loadError && <div className="error-box">{loadError}</div>}
      {!propertyIdParam && <>
        <div className="url-import"><label>URL de l'annonce<input value={payload.source_url} onChange={(e) => update("source_url", e.target.value)} placeholder="https://..." /></label><button type="button" className="secondary-button" onClick={extractListing} disabled={extracting || !payload.source_url.trim()}>{extracting ? "Lectureâ¦" : "Extraire les donnÃ©es"}</button></div>
        {extractNote && <div className="extract-note">â {extractNote}</div>}
        <form className="property-form" onSubmit={handleSubmit}><div className="form-grid">
          <label>Titre<input value={payload.title} onChange={(e) => update("title", e.target.value)} /></label><label>Ville<input value={payload.city} onChange={(e) => update("city", e.target.value)} placeholder="Fort-de-France" /></label><label>Adresse<input value={payload.address} onChange={(e) => update("address", e.target.value)} placeholder="Adresse du bien" /></label><label>Prix (â¬)<input required type="number" min="1" value={payload.price} onChange={(e) => update("price", e.target.value)} placeholder="250000" /></label><label>Surface (mÂ²)<input required type="number" min="1" value={payload.surface_m2} onChange={(e) => update("surface_m2", e.target.value)} placeholder="65" /></label><label>Loyer mensuel (â¬)<input type="number" min="0" value={payload.monthly_rent} onChange={(e) => update("monthly_rent", e.target.value)} placeholder="1200" /></label><label>PiÃ¨ces<input type="number" min="0" value={payload.rooms} onChange={(e) => update("rooms", e.target.value)} placeholder="3" /></label><label>Chambres<input type="number" min="0" value={payload.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} placeholder="2" /></label><label>DPE<input value={payload.dpe_class} onChange={(e) => update("dpe_class", e.target.value.toUpperCase())} placeholder="D" maxLength={1} /></label>
        </div><button className="primary-button" disabled={loading}>{loading ? "Analyse en coursâ¦" : "Lancer lâanalyse Bricky â"}</button>{error && <div className="error-box">{error}</div>}</form>
      </>}
      {result && <AnalysisDashboard result={result} address={payload.address} />}
    </section>
  </main>;
}

function AnalysisDashboard({ result, address }: { result: AnalysisResult; address?: string }) {
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
  const label = verdict === "interesting" ? "IntÃ©ressant" : verdict === "unattractive" ? "Peu intÃ©ressant" : "Ã vÃ©rifier & nÃ©gocier";
  const marketReady = market.status === "ready";
  const propertyId = typeof result.property_id === "string" ? result.property_id : typeof analysis.property_id === "string" ? analysis.property_id : "";
  return <section className="result-panel decision-dashboard"><div className="result-head"><div><span className="eyebrow">Analyse terminÃ©e</span><h2>Voici ce que Bricky en pense.</h2></div><span className="status-dot">â DÃ©cision</span></div>
    <div className="decision-hero"><div><span className="decision-label">Verdict</span><strong>{label}</strong></div><div className="score-block"><span>Score</span><b>{score ?? "â"}<small>/100</small></b></div><div className="score-block"><span>Confiance</span><b>{confidence ?? "â"}<small>%</small></b></div></div>
    <div className="metric-grid"><Metric label="Loyer mensuel" value={metrics.monthly_rent} suffix=" â¬" /><Metric label="Revenu annuel net" value={metrics.annual_net_income} suffix=" â¬" /><Metric label="Rendement brut" value={metrics.gross_yield_pct} suffix=" %" /><Metric label="Rendement net" value={metrics.net_yield_pct} suffix=" %" /></div>
    {propertyId && <CadastralPanel propertyId={propertyId} address={address} />}
    {propertyId && <UrbanismePanel propertyId={propertyId} address={address} />}
    <div className="dashboard-section market-card"><div className="section-heading"><div><h3>Valeur marchÃ©</h3><small>Transactions comparables Â· donnÃ©es disponibles</small></div><span className="market-badge">{marketReady ? `${market.confidence_score ?? 0}% confiance` : "DonnÃ©es insuffisantes"}</span></div>{marketReady ? <div className="market-grid"><Metric label="Prix du bien" value={market.property_price_m2} suffix=" â¬/mÂ²" /><Metric label="MarchÃ© mÃ©dian" value={market.market_price_m2_median} suffix=" â¬/mÂ²" /><Metric label="Valeur estimÃ©e" value={market.market_value_estimate} suffix=" â¬" /><Metric label="Ãcart au marchÃ©" value={market.market_gap_pct} suffix=" %" /></div> : <p className="empty-note">Bricky ne dispose pas encore de suffisamment de transactions comparables pour produire une estimation fiable. Aucune valeur n'est inventÃ©e.</p>}</div>
    {rows.length > 0 && <div className="dashboard-section"><h3>ScÃ©narios</h3><div className="scenario-grid">{rows.map((key) => <div className="scenario" key={key}><span>{key === "base" ? "Base" : key === "conservative" ? "Conservateur" : "Optimiste"}</span><b>{scenarios[key].net_yield ?? "â"} %</b><small>rendement net</small></div>)}</div></div>}
    {actions.length > 0 && <div className="dashboard-section"><h3>Ce quâil faut faire</h3><ul>{actions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></div>}
    {risks.length > 0 && <div className="dashboard-section"><h3>Points de vigilance</h3><div className="risk-list">{risks.map((r: any, i: number) => <div className="risk-item" key={i}><b>{r.title || "Risque"}</b><span>{r.severity || ""}</span><p>{r.explanation || r.impact || ""}</p></div>)}</div></div>}
    {missing.length > 0 && <div className="dashboard-section"><h3>DonnÃ©es manquantes</h3><div className="missing-list">{missing.map((m: any, i: number) => <div key={i}><b>{m.label || m.field_key}</b><p>{m.suggested_question || m.impact || "Ã vÃ©rifier avant dÃ©cision."}</p></div>)}</div></div>}
  </section>;
}

function CadastralPanel({ propertyId, address }: { propertyId: string; address?: string }) {
  const [communeCode, setCommuneCode] = useState("");
  const [prefix, setPrefix] = useState("000");
  const [section, setSection] = useState("");
  const [parcel, setParcel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CadastralResult["cadastral"] | null>(null);
  const [autoStatus, setAutoStatus] = useState<"idle" | "loading" | "failed" | "success">("idle");
  const [autoNote, setAutoNote] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [building, setBuilding] = useState<BatimentResult["batiment"] | null>(null);
  const [buildingStatus, setBuildingStatus] = useState<"idle" | "loading" | "failed" | "success">("idle");

  useEffect(() => {
    if (!address || !address.trim() || result) return;
    let cancelled = false;
    async function attemptAutoLookup() {
      setAutoStatus("loading");
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Session expirÃ©e.");
        const response = await fetch("/api/cadastre/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ property_id: propertyId, address }),
        });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setAutoStatus("failed"); setAutoNote(body?.note || body?.error || "DÃ©tection automatique impossible.");
          return;
        }
        setResult(body.cadastral); setAutoStatus("success");
      } catch (err) {
        if (!cancelled) { setAutoStatus("failed"); setAutoNote(err instanceof Error ? err.message : "DÃ©tection automatique impossible."); }
      }
    }
    attemptAutoLookup();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, propertyId]);

  useEffect(() => {
    if (!address || !address.trim() || building) return;
    let cancelled = false;
    async function attemptBuildingLookup() {
      setBuildingStatus("loading");
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Session expirÃ©e.");
        const response = await fetch("/api/batiment/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ property_id: propertyId, address }),
        });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) { setBuildingStatus("failed"); return; }
        setBuilding(body.batiment); setBuildingStatus("success");
      } catch {
        if (!cancelled) setBuildingStatus("failed");
      }
    }
    attemptBuildingLookup();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, propertyId]);

  async function generatePlan() {
    setLoading(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expirÃ©e.");
      const response = await fetch("/api/cadastre/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ property_id: propertyId, commune_code: communeCode, section_prefix: prefix, section, parcel_number: parcel }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Plan cadastral indisponible.");
      setResult(body.cadastral);
    } catch (err) { setError(err instanceof Error ? err.message : "Impossible de gÃ©nÃ©rer le plan."); }
    finally { setLoading(false); }
  }

  const manualVisible = showManual || autoStatus === "failed" || (!address && autoStatus === "idle");

  return <div className="dashboard-section cadastral-card">
    <div className="section-heading"><div><span className="eyebrow">DonnÃ©e fonciÃ¨re</span><h3>Plan cadastral</h3><small>RÃ©fÃ©rence parcellaire + extrait officiel DGFiP</small></div>{result && <span className="market-badge">â RÃ©fÃ©rence enregistrÃ©e</span>}</div>
    <p className="empty-note">Bricky rattache la parcelle au bien et prÃ©pare son plan cadastral. On garde la rÃ©fÃ©rence exacte et la source pour la traÃ§abilitÃ©.</p>
    {autoStatus === "loading" && <div className="extract-note">DÃ©tection automatique de la parcelle Ã  partir de l'adresseâ¦</div>}
    {autoStatus === "failed" && <div className="error-box">{autoNote} Renseigne la rÃ©fÃ©rence manuellement ci-dessous.</div>}
    {!manualVisible && !result && autoStatus !== "loading" && (
      <button type="button" className="secondary-button" onClick={() => setShowManual(true)}>Saisir la parcelle manuellement</button>
    )}
    {manualVisible && !result && (
      <div className="cadastral-form"><label>Commune INSEE<input value={communeCode} onChange={(e) => setCommuneCode(e.target.value.toUpperCase())} placeholder="97209" maxLength={5} /></label><label>PrÃ©fixe<input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="000" maxLength={3} /></label><label>Section<input value={section} onChange={(e) => setSection(e.target.value.toUpperCase())} placeholder="AB" maxLength={2} /></label><label>Parcelle<input value={parcel} onChange={(e) => setParcel(e.target.value)} placeholder="123" maxLength={4} /></label><button type="button" className="secondary-button" onClick={generatePlan} disabled={loading || !communeCode || !section || !parcel}>{loading ? "GÃ©nÃ©rationâ¦" : "GÃ©nÃ©rer le plan â"}</button></div>
    )}
    {error && <div className="error-box">{error}</div>}
    {result && <div className="cadastral-result"><div><b>Parcelle {result.section} {result.parcel_number}</b><span>{result.parcel_id} Â· commune {result.commune_code}</span>{typeof result.parcel_area_m2 === "number" && <span>Surface parcelle : {result.parcel_area_m2.toLocaleString("fr-FR")} mÂ²</span>}</div><a className="primary-button" href={result.plan_url} target="_blank" rel="noreferrer">Ouvrir lâextrait cadastral</a><small>Source : {result.source}{autoStatus === "success" ? " Â· dÃ©tectÃ©e automatiquement" : ""}</small></div>}
    {result?.geometry ? <ParcelSchema geometry={result.geometry} areaM2={result.parcel_area_m2} buildingGeometry={building?.geometry} /> : null}
    {building && (building.hauteur_m != null || building.nature || building.usage_1) && (
      <div className="cadastral-result building-result">
        <div>
          <b>BÃ¢ti dÃ©tectÃ© (BD TOPOÂ®)</b>
          <span>{building.nature || "Nature non prÃ©cisÃ©e"}{building.usage_1 ? ` Â· ${building.usage_1}` : ""}</span>
          {building.hauteur_m != null && <span>Hauteur estimÃ©e : {building.hauteur_m.toLocaleString("fr-FR")} m{building.nombre_etages != null ? ` (~${building.nombre_etages} niveau${building.nombre_etages > 1 ? "x" : ""})` : ""}</span>}
          {building.nombre_logements != null && <span>Logements recensÃ©s : {building.nombre_logements}</span>}
          {building.date_construction && <span>Construction : {building.date_construction}</span>}
        </div>
        <small>Source : {building.source}. Empreinte indicative â Ã  recouper avec le relevÃ© de gÃ©omÃ¨tre avant tout projet.</small>
      </div>
    )}
    {buildingStatus === "loading" && !building && <div className="extract-note">Recherche de l&apos;empreinte du bÃ¢timent (BD TOPOÂ®)â¦</div>}
  </div>;
}

type RingPoint = [number, number];

function extractRings(geometry: unknown): RingPoint[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as { type?: string; coordinates?: unknown };
  try {
    if (g.type === "Polygon") return (g.coordinates as RingPoint[][]) || [];
    if (g.type === "MultiPolygon") return ((g.coordinates as RingPoint[][][]) || []).flat();
  } catch { /* malformed geometry, ignore */ }
  return [];
}

function ParcelSchema({ geometry, areaM2, buildingGeometry }: { geometry: unknown; areaM2?: number; buildingGeometry?: unknown }) {
  const rings = extractRings(geometry);
  if (rings.length === 0 || !rings[0]?.length) return null;
  const buildingRings = buildingGeometry ? extractRings(buildingGeometry) : [];

  // Origine commune (premier point de la parcelle) et projection Ã©quirectangulaire
  // partagÃ©es entre parcelle et bÃ¢ti, pour que les deux se superposent correctement.
  const allPoints = [...rings.flat(), ...buildingRings.flat()];
  const lats = allPoints.map((p) => p[1]);
  const lons = allPoints.map((p) => p[0]);
  const latMid = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cosLat = Math.cos((latMid * Math.PI) / 180);
  const originLon = rings[0][0][0];
  const originLat = rings[0][0][1];

  const project = (ringSet: RingPoint[][]) => ringSet.map((ring) => ring.map(([lon, lat]) => [(lon - originLon) * cosLat, -(lat - originLat)] as RingPoint));

  const projectedParcel = project(rings);
  const projectedBuilding = project(buildingRings);
  const flatXY = [...projectedParcel.flat(), ...projectedBuilding.flat()];
  const xs = flatXY.map((p) => p[0]);
  const ys = flatXY.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const size = 220;
  const padding = 24;
  const scale = (size - padding * 2) / Math.max(spanX, spanY);

  const toSvg = ([x, y]: RingPoint) => [
    padding + (x - minX) * scale + (size - padding * 2 - spanX * scale) / 2,
    padding + (y - minY) * scale + (size - padding * 2 - spanY * scale) / 2,
  ];

  const toPath = (ringSet: RingPoint[][]) => ringSet.map((ring) => ring.map((point, i) => `${i === 0 ? "M" : "L"}${toSvg(point).map((n) => n.toFixed(1)).join(",")}`).join(" ") + " Z");

  const parcelPaths = toPath(projectedParcel);
  const buildingPaths = toPath(projectedBuilding);

  return (
    <div className="parcel-schema">
      <div className="section-heading"><div><span className="eyebrow">SchÃ©ma Bricky</span><h3>Parcelle{buildingPaths.length ? " + bÃ¢ti" : ""}</h3><small>Contour approximatif Â· Ã  titre indicatif, le plan officiel ci-dessus fait foi</small></div></div>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="SchÃ©ma simplifiÃ© de la parcelle et du bÃ¢timent">
        <rect x={0} y={0} width={size} height={size} fill="#fafaf8" rx={16} />
        {parcelPaths.map((d, i) => <path key={`p-${i}`} d={d} fill="#111" fillOpacity={0.08} stroke="#111" strokeWidth={1.5} />)}
        {buildingPaths.map((d, i) => <path key={`b-${i}`} d={d} fill="#b45309" fillOpacity={0.35} stroke="#b45309" strokeWidth={1.5} />)}
      </svg>
      <div className="parcel-schema-legend">
        <span><i className="legend-swatch legend-parcel" /> Parcelle</span>
        {buildingPaths.length > 0 && <span><i className="legend-swatch legend-building" /> BÃ¢ti</span>}
      </div>
      {typeof areaM2 === "number" && <small>Surface cadastrale : {areaM2.toLocaleString("fr-FR")} mÂ²</small>}
    </div>
  );
}

function UrbanismePanel({ propertyId, address }: { propertyId: string; address?: string }) {
  const [result, setResult] = useState<UrbanismeResult["urbanisme"] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "failed" | "success">("idle");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!address || !address.trim() || result) return;
    let cancelled = false;
    async function attemptLookup() {
      setStatus("loading");
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Session expirÃ©e.");
        const response = await fetch("/api/urbanisme/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ property_id: propertyId, address }),
        });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setStatus("failed"); setNote(body?.note || body?.error || "Zonage indisponible pour cette adresse.");
          return;
        }
        setResult(body.urbanisme); setStatus("success");
      } catch (err) {
        if (!cancelled) { setStatus("failed"); setNote(err instanceof Error ? err.message : "Zonage indisponible pour cette adresse."); }
      }
    }
    attemptLookup();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, propertyId]);

  if (!address) return null;

  return <div className="dashboard-section cadastral-card">
    <div className="section-heading"><div><span className="eyebrow">Analyse urbanistique</span><h3>Zonage PLU / PLUi</h3><small>Document d'urbanisme opposable Â· GÃ©oportail de l'Urbanisme (GPU)</small></div>{result && <span className="market-badge">â Zonage identifiÃ©</span>}</div>
    {status === "loading" && <div className="extract-note">Recherche du zonage d'urbanisme Ã  partir de l'adresseâ¦</div>}
    {status === "failed" && <div className="error-box">{note}</div>}
    {result && (
      <div className="cadastral-result">
        <div>
          <b>{result.zone_label || "Zone non nommÃ©e"}{result.zone_type ? ` (${result.zone_type})` : ""}</b>
          <span>{result.metadata?.typezone_label || "Type de zone non prÃ©cisÃ©"}{result.insee_code ? ` Â· commune ${result.insee_code}` : ""}</span>
          {result.destination_dominante && <span>Destination dominante : {result.destination_dominante}</span>}
          {result.zone_label_long && <span>{result.zone_label_long}</span>}
        </div>
        {result.regulation_url && <a className="primary-button" href={result.regulation_url} target="_blank" rel="noreferrer">Consulter le rÃ¨glement â</a>}
        <small>Source : {result.source}. Ã vÃ©rifier auprÃ¨s du service urbanisme de la mairie avant tout projet â le PLU peut avoir Ã©voluÃ© depuis la derniÃ¨re synchronisation du GPU.</small>
      </div>
    )}
  </div>;
}

function Metric({ label, value, suffix }: { label: string; value: unknown; suffix: string }) { return <div className="metric"><span>{label}</span><b>{value == null || value === "" ? "â" : Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{value != null && value !== "" ? suffix : ""}</b></div>; }
