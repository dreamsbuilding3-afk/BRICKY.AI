"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { PROPERTY_TYPE_LABELS } from "../../lib/data/propertyTypeClassifier";

type AnalysisResult = { property_id?: string; analysis_id?: string; [key: string]: unknown };
type Payload = { title: string; city: string; address: string; price: string; surface_m2: string; rooms: string; bedrooms: string; property_type: string; dpe_class: string; ges_class: string; monthly_rent: string; down_payment: string; loan_rate_pct: string; loan_duration_years: string; renovation_budget: string; source_url: string; annual_property_tax: string; annual_insurance: string; annual_maintenance: string; annual_management_fees: string; other_annual_charges: string; vacancy_rate: string };
type CadastralResult = { cadastral?: { commune_code: string; section_prefix: string; section: string; parcel_number: string; parcel_id: string; source: string; source_url: string; plan_url: string; geometry?: unknown; parcel_area_m2?: number }; error?: string };
type UrbanismeResult = { urbanisme?: { zone_type: string | null; zone_label: string | null; zone_label_long: string | null; destination_dominante: string | null; regulation_url: string | null; insee_code: string | null; source: string; metadata?: { typezone_label?: string | null } }; error?: string; note?: string };
type BatimentResult = { batiment?: { hauteur_m: number | null; nature: string | null; usage_1: string | null; usage_2: string | null; nombre_etages: number | null; nombre_logements: number | null; date_construction: string | null; geometry?: unknown; source: string }; error?: string; note?: string };

const DRAFT_KEY = "bricky_analyze_draft_v1";

// Phase B (audit formulaire point 26) : champs complémentaires optionnels, saisis
// dans des blocs repliables séparés plutôt que dans le formulaire principal (même
// principe que le bloc "charges annuelles" de la Phase A — ne pas transformer le
// formulaire en questionnaire interminable). Les clés correspondent exactement à
// celles attendues par app/api/properties/analyze/route.ts (characteristicsFieldKeys
// / financialFieldKeys) ; converties en nombre côté client pour les champs numériques.
type ExtraFieldDef = { key: string; label: string; kind: "text" | "number" | "bool" | "select"; options?: string[]; placeholder?: string };

const NUMERIC_EXTRA_KEYS = new Set(["bathrooms", "toilets", "parking_spaces", "renovation_year", "exterior_surface_m2", "energy_consumption_kwh", "energy_cost_annual_estimate", "immediate_works_budget", "agency_fees", "file_fees", "borrower_insurance_annual", "financing_fees", "deferral_months", "tax_bracket_pct"]);

const BOOL_FIELD: Pick<ExtraFieldDef, "kind" | "options"> = { kind: "bool", options: ["Oui", "Non"] };

const CHARACTERISTICS_FIELDS: ExtraFieldDef[] = [
  { key: "bathrooms", label: "Salles de bain", kind: "number", placeholder: "1" },
  { key: "toilets", label: "WC", kind: "number", placeholder: "1" },
  { key: "parking_spaces", label: "Places de parking", kind: "number", placeholder: "0" },
  { key: "exterior_surface_m2", label: "Surface extérieure (m²)", kind: "number", placeholder: "0" },
  { key: "has_elevator", label: "Ascenseur", ...BOOL_FIELD },
  { key: "has_balcony", label: "Balcon", ...BOOL_FIELD },
  { key: "has_terrace", label: "Terrasse", ...BOOL_FIELD },
  { key: "has_garden", label: "Jardin", ...BOOL_FIELD },
  { key: "has_pool", label: "Piscine", ...BOOL_FIELD },
  { key: "has_garage", label: "Garage", ...BOOL_FIELD },
  { key: "has_cellar", label: "Cave", ...BOOL_FIELD },
  { key: "has_attic", label: "Grenier", ...BOOL_FIELD },
  { key: "is_furnished", label: "Meublé", ...BOOL_FIELD },
  { key: "exposure", label: "Exposition", kind: "select", options: ["Nord", "Sud", "Est", "Ouest", "Nord-Sud", "Est-Ouest", "Sud-Est", "Sud-Ouest"] },
  { key: "overall_condition", label: "État général", kind: "select", options: ["Neuf", "Bon état", "À rafraîchir", "À rénover", "À restructurer"] },
  { key: "view_type", label: "Vue", kind: "text", placeholder: "Mer, montagne, dégagée..." },
  { key: "renovation_year", label: "Année de rénovation", kind: "number", placeholder: "2020" },
  { key: "country", label: "Pays", kind: "text", placeholder: "France" },
  { key: "neighborhood", label: "Quartier", kind: "text", placeholder: "Nom du quartier" },
];

const DIAGNOSTICS_FIELDS: ExtraFieldDef[] = [
  { key: "energy_consumption_kwh", label: "Consommation énergétique (kWh/an)", kind: "number", placeholder: "0" },
  { key: "energy_cost_annual_estimate", label: "Coût énergétique annuel estimé (€)", kind: "number", placeholder: "0" },
  { key: "heating_type", label: "Type de chauffage", kind: "text", placeholder: "Électrique, gaz, PAC..." },
  { key: "heating_mode", label: "Chauffage", kind: "select", options: ["Individuel", "Collectif"] },
  { key: "hot_water_type", label: "Type d'eau chaude", kind: "text", placeholder: "Électrique, gaz, solaire..." },
  { key: "insulation_quality", label: "Isolation", kind: "select", options: ["Bonne", "Moyenne", "Faible", "Inconnue"] },
  { key: "roof_condition", label: "État de la toiture", kind: "select", options: ["Bon état", "À surveiller", "À refaire", "Non concerné"] },
  { key: "electrical_compliance", label: "Électricité conforme", ...BOOL_FIELD },
  { key: "gas_compliance", label: "Gaz conforme", ...BOOL_FIELD },
  { key: "sanitation_type", label: "Assainissement", kind: "select", options: ["Tout-à-l'égout", "Individuel (fosse)", "Inconnu"] },
  { key: "asbestos_status", label: "Amiante", kind: "select", options: ["Absence constatée", "Présence constatée", "Non renseigné"] },
  { key: "lead_status", label: "Plomb", kind: "select", options: ["Absence constatée", "Présence constatée", "Non renseigné"] },
  { key: "termite_status", label: "Termites", kind: "select", options: ["Absence constatée", "Présence constatée", "Non renseigné"] },
];

const FINANCING_EXTRA_FIELDS: ExtraFieldDef[] = [
  { key: "agency_fees", label: "Frais d'agence (€)", kind: "number", placeholder: "0" },
  { key: "file_fees", label: "Frais de dossier (€)", kind: "number", placeholder: "0" },
  { key: "borrower_insurance_annual", label: "Assurance emprunteur (€/an)", kind: "number", placeholder: "0" },
  { key: "financing_fees", label: "Autres frais de financement (€)", kind: "number", placeholder: "0" },
  { key: "deferral_months", label: "Différé de remboursement (mois)", kind: "number", placeholder: "0" },
  { key: "loan_type", label: "Type de prêt", kind: "text", placeholder: "Amortissable, in fine..." },
  { key: "rate_type", label: "Taux", kind: "select", options: ["Fixe", "Variable"] },
  // Phase D (audit formulaire point 26, section 11 - rendement net-net) : tranche
  // marginale d'imposition, utilisée pour estimer l'impôt sur le revenu locatif (en plus
  // des prélèvements sociaux à 17.2%, fixes). Par défaut 30% (tranche médiane française)
  // si non renseignée - l'estimation de rendement net-net reste affichée dans ce cas, avec
  // la mention que la TMI est une hypothèse.
  { key: "tax_bracket_pct", label: "Tranche marginale d'imposition - TMI (%)", kind: "select", options: ["0", "11", "30", "41", "45"] },
];

const RENTAL_WORKS_FIELDS: ExtraFieldDef[] = [
  { key: "rental_regime", label: "Régime locatif", kind: "select", options: ["Location nue", "Location meublée", "Location courte durée"] },
  { key: "seasonality_notes", label: "Saisonnalité", kind: "text", placeholder: "Ex. forte demande en été" },
  { key: "immediate_works_budget", label: "Travaux immédiats (€)", kind: "number", placeholder: "0" },
  { key: "future_works_notes", label: "Travaux futurs identifiés", kind: "text", placeholder: "Ex. ravalement prévu en 2027" },
  { key: "major_works_planned", label: "Gros travaux prévus (copropriété)", kind: "text", placeholder: "Ex. réfection toiture votée" },
];

function ExtraField({ def, value, onChange }: { def: ExtraFieldDef; value: string; onChange: (v: string) => void }) {
  if (def.kind === "bool") {
    return <label>{def.label}<select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Non précisé</option>
      <option value="true">Oui</option>
      <option value="false">Non</option>
    </select></label>;
  }
  if (def.kind === "select") {
    return <label>{def.label}<select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Non précisé</option>
      {(def.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select></label>;
  }
  return <label>{def.label}<input type={def.kind === "number" ? "number" : "text"} min={def.kind === "number" ? "0" : undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} /></label>;
}

function ExtraFieldsSection({ fields, extra, onChange }: { fields: ExtraFieldDef[]; extra: Record<string, string>; onChange: (key: string, value: string) => void }) {
  return <div className="form-grid charges-grid">
    {fields.map((def) => <ExtraField key={def.key} def={def} value={extra[def.key] ?? ""} onChange={(v) => onChange(def.key, v)} />)}
  </div>;
}

export default function AnalyzePage() {
return <Suspense fallback={null}><AnalyzePageInner /></Suspense>;
}

function AnalyzePageInner() {
const router = useRouter();
const searchParams = useSearchParams();
const propertyIdParam = searchParams.get("property_id");
const [payload, setPayload] = useState<Payload>({ title: "", city: "", address: "", price: "", surface_m2: "", rooms: "", bedrooms: "", property_type: "", dpe_class: "", ges_class: "", monthly_rent: "", down_payment: "", loan_rate_pct: "", loan_duration_years: "", renovation_budget: "", source_url: "", annual_property_tax: "", annual_insurance: "", annual_maintenance: "", annual_management_fees: "", other_annual_charges: "", vacancy_rate: "" });
const [showCharges, setShowCharges] = useState(false);
const [extra, setExtra] = useState<Record<string, string>>({});
const [openExtraSection, setOpenExtraSection] = useState<string | null>(null);
const updateExtra = (key: string, value: string) => setExtra((cur) => ({ ...cur, [key]: value }));
const [loading, setLoading] = useState(false);
const [extracting, setExtracting] = useState(false);
const [extractingFile, setExtractingFile] = useState(false);
const [error, setError] = useState("");
const [extractNote, setExtractNote] = useState("");
const [result, setResult] = useState<AnalysisResult | null>(null);
const [userEmail, setUserEmail] = useState("");
const [loadingExisting, setLoadingExisting] = useState(false);
const [loadError, setLoadError] = useState("");
const [draftRestored, setDraftRestored] = useState(false);

useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (!data.session) router.replace("/login"); else setUserEmail(data.session.user.email ?? ""); }); }, [router]);

useEffect(() => {
if (!propertyIdParam) return;
let cancelled = false;
async function loadExisting() {
setLoadingExisting(true); setLoadError("");
try {
const { data: propertyRow, error: propertyError } = await supabase
.from("properties")
.select("id, title, city, address, price, surface_m2, property_type")
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
property_type: propertyRow.property_type || "",
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

useEffect(() => {
if (propertyIdParam) return;
try {
const saved = window.localStorage.getItem(DRAFT_KEY);
if (saved) {
const parsed = JSON.parse(saved);
if (parsed && typeof parsed === "object") {
setPayload((current) => ({ ...current, ...parsed }));
setDraftRestored(true);
}
}
} catch {
// localStorage indisponible (navigation privee, etc.) : pas grave, on ignore.
}
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
if (propertyIdParam || result) return;
try {
const hasContent = Object.values(payload).some((v) => v && v !== "");
if (hasContent) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
} catch {
// localStorage indisponible : pas grave, on ignore.
}
}, [payload, propertyIdParam, result]);

function clearDraft() {
setDraftRestored(false);
setPayload({ title: "", city: "", address: "", price: "", surface_m2: "", rooms: "", bedrooms: "", property_type: "", dpe_class: "", ges_class: "", monthly_rent: "", down_payment: "", loan_rate_pct: "", loan_duration_years: "", renovation_budget: "", source_url: "", annual_property_tax: "", annual_insurance: "", annual_maintenance: "", annual_management_fees: "", other_annual_charges: "", vacancy_rate: "" });
try { window.localStorage.removeItem(DRAFT_KEY); } catch {}
}

async function refreshAnalysisFromDb(propertyId: string) {
const { data: analysisRow } = await supabase
.from("analyses")
.select("id, property_id, financial_snapshot, decision_snapshot, overall_score, confidence_score, verdict, status, created_at")
.eq("property_id", propertyId)
.order("created_at", { ascending: false })
.limit(1)
.maybeSingle();
if (analysisRow) {
setResult({
property_id: propertyId,
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
}

async function extractListing() {
if (!payload.source_url.trim()) return;
setExtracting(true); setError(""); setExtractNote("");
try {
const { data: previewSession } = await supabase.auth.getSession();
const previewToken = previewSession.session?.access_token;
if (!previewToken) throw new Error("Session expiree, reconnecte-toi.");
const response = await fetch("/api/properties/preview", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${previewToken}` }, body: JSON.stringify({ url: payload.source_url.trim() }) });
const data = await response.json();
if (!response.ok) throw new Error(data?.error || "Impossible de lire cette annonce.");
const e = data.extracted || {};
setPayload((current) => ({ ...current, title: e.title || current.title, city: e.city || current.city, address: e.address || current.address, price: e.price != null ? String(e.price) : current.price, surface_m2: e.surface_m2 != null ? String(e.surface_m2) : current.surface_m2, rooms: e.rooms != null ? String(e.rooms) : current.rooms, bedrooms: e.bedrooms != null ? String(e.bedrooms) : current.bedrooms, property_type: e.property_type || current.property_type, dpe_class: e.dpe_class || current.dpe_class, ges_class: e.ges_class || current.ges_class, monthly_rent: e.monthly_rent != null ? String(e.monthly_rent) : current.monthly_rent }));
const typeNote = e.property_type_label ? ` Type détecté : ${e.property_type_label}.` : "";
setExtractNote(`${data.extraction?.fields_found ?? 0} données détectées.${typeNote} Vérifie-les avant de lancer l'analyse.`);
} catch (err) { setError(err instanceof Error ? err.message : "Extraction impossible."); }
finally { setExtracting(false); }
}

async function extractFromFile(file: File) {
setExtractingFile(true); setError(""); setExtractNote("");
try {
const { data: sessionData } = await supabase.auth.getSession();
const token = sessionData.session?.access_token;
if (!token) { setError("Session expirée."); return; }
const formData = new FormData();
formData.append("file", file);
const response = await fetch("/api/properties/extract-file", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
const data = await response.json();
if (!response.ok) throw new Error(data?.error || "Impossible de lire ce fichier.");
const e = data.extracted || {};
setPayload((current) => ({ ...current, title: e.title || current.title, city: e.city || current.city, price: e.price != null ? String(e.price) : current.price, surface_m2: e.surface_m2 != null ? String(e.surface_m2) : current.surface_m2, rooms: e.rooms != null ? String(e.rooms) : current.rooms, bedrooms: e.bedrooms != null ? String(e.bedrooms) : current.bedrooms, property_type: e.property_type || current.property_type, dpe_class: e.dpe_class || current.dpe_class, ges_class: e.ges_class || current.ges_class, monthly_rent: e.monthly_rent != null ? String(e.monthly_rent) : current.monthly_rent }));
const typeNote = e.property_type_label ? ` Type détecté : ${e.property_type_label}.` : "";
setExtractNote(`${data.extraction?.fields_found ?? 0} données détectées dans le fichier.${typeNote} Vérifie-les avant de lancer l'analyse.`);
} catch (err) { setError(err instanceof Error ? err.message : "Extraction du fichier impossible."); }
finally { setExtractingFile(false); }
}

async function handleSubmit(event: FormEvent) {
event.preventDefault(); setLoading(true); setError(""); setResult(null);
try {
const { data: sessionData } = await supabase.auth.getSession(); const token = sessionData.session?.access_token;
if (!token) { router.replace("/login"); return; }
const body: Record<string, unknown> = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, ["price", "surface_m2", "rooms", "bedrooms", "monthly_rent", "down_payment", "loan_rate_pct", "loan_duration_years", "renovation_budget", "annual_property_tax", "annual_insurance", "annual_maintenance", "annual_management_fees", "other_annual_charges", "vacancy_rate"].includes(key) && value !== "" ? Number(value) : value]));
for (const [key, value] of Object.entries(extra)) {
  if (value === "") continue;
  body[key] = NUMERIC_EXTRA_KEYS.has(key) ? Number(value) : value;
}
const response = await fetch("/api/properties/analyze", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const data = await response.json(); if (!response.ok) throw new Error(data?.details?.message || data?.error || "Analyse impossible."); setResult(data); try { window.localStorage.removeItem(DRAFT_KEY); } catch {}
} catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); }
finally { setLoading(false); }
}

const update = (key: keyof Payload, value: string) => setPayload((current) => ({ ...current, [key]: value }));

return <main className="page">
<AppNav email={userEmail} active="analyze" />
<section className="analysis-shell">
<div className="analysis-intro"><span className="eyebrow">Bricky · V1</span><h1>{propertyIdParam ? "Voici l’analyse de ce bien." : "Est-ce que ce bien mérite votre attention ?"}</h1><p className="sub">{propertyIdParam ? "Analyse enregistrée, telle que calculée par Bricky." : "Collez une annonce ou saisissez les données que vous connaissez. Bricky calcule, vérifie et signale ce qui manque — sans inventer."}</p></div>
{loadingExisting && <div className="extract-note">Chargement du bien…</div>}
{loadError && <div className="error-box">{loadError}</div>}
{draftRestored && !propertyIdParam && <div className="draft-banner"><span>Brouillon restaure automatiquement, votre saisie precedente a ete recuperee.</span><button type="button" className="secondary-button" onClick={clearDraft}>Effacer</button></div>}
{!propertyIdParam && <>
<div className="url-import"><label>URL de l'annonce<input value={payload.source_url} onChange={(e) => update("source_url", e.target.value)} placeholder="https://..." /></label><button type="button" className="secondary-button" onClick={extractListing} disabled={extracting || !payload.source_url.trim()}>{extracting ? "Lecture…" : "Extraire les données"}</button></div><div className="url-import file-import"><label>Ou dépose un fichier (PDF de l'annonce ou du dossier)<input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) extractFromFile(f); e.target.value = ""; }} disabled={extractingFile} /></label>{extractingFile && <span className="extract-note">Lecture du fichier…</span>}</div>
{extractNote && <div className="extract-note">✓ {extractNote}</div>}
<form className="property-form" onSubmit={handleSubmit}><div className="form-grid">
<label>Titre<input value={payload.title} onChange={(e) => update("title", e.target.value)} /></label><label>Ville<input value={payload.city} onChange={(e) => update("city", e.target.value)} placeholder="Fort-de-France" /></label><label>Adresse<input value={payload.address} onChange={(e) => update("address", e.target.value)} placeholder="Adresse du bien" /></label><label className="type-field">Type de bien<PropertyTypeScroller value={payload.property_type} onChange={(v) => update("property_type", v)} /></label><label>Prix (€)<input required type="number" min="1" value={payload.price} onChange={(e) => update("price", e.target.value)} placeholder="250000" /></label><label>Surface (m²)<input required type="number" min="1" value={payload.surface_m2} onChange={(e) => update("surface_m2", e.target.value)} placeholder="65" /></label><label>Loyer mensuel (€)<input type="number" min="0" value={payload.monthly_rent} onChange={(e) => update("monthly_rent", e.target.value)} placeholder="1200" /></label><label>Apport (€)<input type="number" min="0" value={payload.down_payment} onChange={(e) => update("down_payment", e.target.value)} placeholder="40000" /></label><label>Taux du prêt (%)<input type="number" min="0" step="0.1" value={payload.loan_rate_pct} onChange={(e) => update("loan_rate_pct", e.target.value)} placeholder="3.9" /></label><label>Durée du prêt (années)<input type="number" min="1" value={payload.loan_duration_years} onChange={(e) => update("loan_duration_years", e.target.value)} placeholder="20" /></label><label>Budget travaux (€)<input type="number" min="0" value={payload.renovation_budget} onChange={(e) => update("renovation_budget", e.target.value)} placeholder="0" /></label><label>Pièces<input type="number" min="0" value={payload.rooms} onChange={(e) => update("rooms", e.target.value)} placeholder="3" /></label><label>Chambres<input type="number" min="0" value={payload.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} placeholder="2" /></label><label>DPE<input value={payload.dpe_class} onChange={(e) => update("dpe_class", e.target.value.toUpperCase())} placeholder="D" maxLength={1} /></label><label>GES<input value={payload.ges_class} onChange={(e) => update("ges_class", e.target.value.toUpperCase())} placeholder="D" maxLength={1} /></label>
</div>
<div className="charges-toggle-row">
<button type="button" className="secondary-button" onClick={() => setShowCharges((v) => !v)}>
{showCharges ? "− Masquer les charges annuelles" : "+ Ajouter les charges annuelles (recommandé — sinon le rendement net est surestimé)"}
</button>
</div>
{showCharges && <div className="form-grid charges-grid">
<label>Taxe foncière annuelle (€)<input type="number" min="0" value={payload.annual_property_tax} onChange={(e) => update("annual_property_tax", e.target.value)} placeholder="900" /></label>
<label>Charges non récupérables (€/an)<input type="number" min="0" value={payload.other_annual_charges} onChange={(e) => update("other_annual_charges", e.target.value)} placeholder="600" /></label>
<label>Assurance (PNO) annuelle (€)<input type="number" min="0" value={payload.annual_insurance} onChange={(e) => update("annual_insurance", e.target.value)} placeholder="150" /></label>
<label>Entretien / travaux courants (€/an)<input type="number" min="0" value={payload.annual_maintenance} onChange={(e) => update("annual_maintenance", e.target.value)} placeholder="300" /></label>
<label>Frais de gestion locative (€/an)<input type="number" min="0" value={payload.annual_management_fees} onChange={(e) => update("annual_management_fees", e.target.value)} placeholder="0" /></label>
<label>Vacance locative estimée (%)<input type="number" min="0" max="100" step="0.5" value={payload.vacancy_rate} onChange={(e) => update("vacancy_rate", e.target.value)} placeholder="5" /></label>
</div>}
<div className="charges-toggle-row">
{[
  { key: "characteristics", label: "+ Caractéristiques complémentaires", fields: CHARACTERISTICS_FIELDS },
  { key: "diagnostics", label: "+ Diagnostics techniques", fields: DIAGNOSTICS_FIELDS },
  { key: "financing", label: "+ Financement avancé", fields: FINANCING_EXTRA_FIELDS },
  { key: "rental_works", label: "+ Location & travaux par horizon", fields: RENTAL_WORKS_FIELDS },
].map((section) => (
  <button key={section.key} type="button" className="secondary-button" onClick={() => setOpenExtraSection((cur) => (cur === section.key ? null : section.key))}>
    {openExtraSection === section.key ? `− ${section.label.slice(2)}` : section.label}
  </button>
))}
</div>
{openExtraSection === "characteristics" && <ExtraFieldsSection fields={CHARACTERISTICS_FIELDS} extra={extra} onChange={updateExtra} />}
{openExtraSection === "diagnostics" && <ExtraFieldsSection fields={DIAGNOSTICS_FIELDS} extra={extra} onChange={updateExtra} />}
{openExtraSection === "financing" && <ExtraFieldsSection fields={FINANCING_EXTRA_FIELDS} extra={extra} onChange={updateExtra} />}
{openExtraSection === "rental_works" && <ExtraFieldsSection fields={RENTAL_WORKS_FIELDS} extra={extra} onChange={updateExtra} />}
<button className="primary-button" disabled={loading}>{loading ? "Analyse en cours…" : "Lancer l’analyse Bricky →"}</button>{error && <div className="error-box">{error}</div>}</form>
</>}
{result && <AnalysisDashboard result={result} address={payload.address} onResultRefresh={refreshAnalysisFromDb} />}
</section>
</main>;
}

function RingCard({ title, pct, colorFrom, colorTo, gradientId, value, caption, chipText, chipTone, delayMs = 0 }: { title: string; pct: number; colorFrom: string; colorTo: string; gradientId: string; value: string; caption: string; chipText?: string | null; chipTone?: "good" | "warn" | "bad" | "neutral"; delayMs?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const safePct = Math.min(100, Math.max(0, pct));
  const offset = c - (safePct / 100) * c;
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    let raf = 0;
    const startTimer = setTimeout(() => {
      const start = performance.now();
      const duration = 1000;
      function tick(now: number) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayPct(Math.round(eased * safePct));
        if (t < 1) raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => { clearTimeout(startTimer); cancelAnimationFrame(raf); };
  }, [safePct, delayMs]);
  return <div className="ring-card">
    <div className="ring-card-head"><span className="ring-card-title">{title}</span></div>
    <div className="ring-card-ring" style={{ ["--ring-glow" as any]: colorTo }}>
      <svg viewBox="0 0 120 120" width="120" height="120">
        <defs><linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={colorFrom} /><stop offset="100%" stopColor={colorTo} /></linearGradient></defs>
        <circle className="ring-card-track" cx="60" cy="60" r={r} fill="none" strokeWidth="10" />
        <circle className="ring-card-progress" cx="60" cy="60" r={r} fill="none" stroke={`url(#${gradientId})`} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} style={{ ["--ring-c" as any]: c, ["--ring-offset" as any]: offset, animationDelay: `${delayMs}ms` }} transform="rotate(-90 60 60)" />
      </svg>
      <div className="ring-card-center">{displayPct}%</div>
    </div>
    <span className="ring-card-caption">{caption}</span>
    <b className="ring-card-value">{value}</b>
    {chipText ? <span className={`ring-card-chip ring-card-chip-${chipTone || "neutral"}`}>{chipText}</span> : null}
  </div>;
}

function FunnelChart({ steps }: { steps: { label: string; value: string; pct: number; tone?: "good" | "bad" | "accent" }[] }) {
  return <div className="funnel-steps">
    {steps.map((s, i) => <div className="funnel-step" key={s.label}><span>{s.label}</span><div className="funnel-bar"><div className={`funnel-bar-fill funnel-bar-${s.tone || "accent"}`} style={{ ["--w" as any]: `${Math.max(0, Math.min(100, s.pct))}%`, animationDelay: `${i * 100}ms` }} /></div><b>{s.value}</b></div>)}
  </div>;
}

function BarChart({ items }: { items: { key: string; label: string; display: string; pct: number }[] }) {
  return <div className="scenario-bars">
    {items.map((it, i) => <div className="scenario-bar-col" key={it.key}><b>{it.display}</b><div className="scenario-bar-track"><div className="scenario-bar-fill" style={{ ["--h" as any]: `${Math.max(0, Math.min(100, it.pct))}%`, animationDelay: `${i * 90}ms` }} /></div><span>{it.label}</span></div>)}
  </div>;
}

const PROPERTY_TYPE_ICONS: Record<string, string> = { hotel: "🏨", chateau: "🏰", immeuble: "🏢", penthouse: "🏙️", loft: "🧱", duplex: "🏘️", chalet: "🏔️", local_commercial: "🏬", terrain: "🌳", parking: "🅿️", studio: "🚪", maison: "🏡", appartement: "🏠" };

function PropertyTypeScroller({ value, onChange }: { value: string; onChange: (v: string) => void }) {
const options = [{ code: "", label: "Non précisé" }, ...Object.entries(PROPERTY_TYPE_LABELS).map(([code, label]) => ({ code, label }))];
const activeIndex = Math.max(0, options.findIndex((o) => o.code === value));
return <div className="type-scroller"><div className="type-scroller-track">
{options.map((opt, i) => {
const active = i === activeIndex;
const dist = Math.min(Math.abs(i - activeIndex), 4);
const itemStyle = { transform: `translateX(${active ? -10 : dist * 6}px) scale(${active ? 1 : 1 - dist * 0.06})`, opacity: active ? 1 : Math.max(0.35, 1 - dist * 0.18) };
return <button type="button" key={opt.code || "none"} className={`type-scroller-item${active ? " type-scroller-item-active" : ""}`} style={itemStyle} onClick={() => onChange(opt.code)}>
<span className="type-scroller-icon">{opt.code ? (PROPERTY_TYPE_ICONS[opt.code] || "🏠") : "❓"}</span>
<span className="type-scroller-label">{opt.label}</span>
{active ? <span className="type-scroller-handle" /> : null}
</button>;
})}
</div></div>;
}

function AnalysisDashboard({ result, address, onResultRefresh }: { result: AnalysisResult; address?: string; onResultRefresh?: (propertyId: string) => void }) {
const [shareStatus, setShareStatus] = useState<{ loading: boolean; url: string | null; error: string | null }>({ loading: false, url: null, error: null });
async function handleShare() {
if (!result?.analysis_id) return;
setShareStatus({ loading: true, url: null, error: null });
try {
const { data, error } = await supabase.rpc("enable_analysis_share", { p_analysis_id: result.analysis_id });
if (error) throw error;
const token = (data as any)?.share_token;
if (!token) throw new Error("Lien indisponible");
const shareUrl = `${window.location.origin}/share/${token}`;
setShareStatus({ loading: false, url: shareUrl, error: null });
} catch (err: any) {
setShareStatus({ loading: false, url: null, error: err?.message || "Erreur lors de la generation du lien" });
}
}
const analysis = (result.analysis as Record<string, any>) || result;
const financialSnapshot = (analysis.financial_snapshot || analysis.financial || {}) as Record<string, any>;
const metrics = (financialSnapshot.metrics || {}) as Record<string, any>;
const acquisition = (financialSnapshot.acquisition || {}) as Record<string, any>;
const financing = (financialSnapshot.financing || {}) as Record<string, any>;
const [simDownPct, setSimDownPct] = useState<number>(() => {
const total = Number(acquisition.total_acquisition_cost ?? 0);
const dp = Number(financing.down_payment ?? 0);
return total > 0 ? Math.round((dp / total) * 100) : 10;
});
const [simRate, setSimRate] = useState<number>(() => Number(financing.loan_rate_pct ?? 3.9));
const [simDuration, setSimDuration] = useState<number>(() => Number(financing.loan_duration_years ?? 20));
const simTotalCost = Number(acquisition.total_acquisition_cost ?? 0);
const simDownPayment = Math.round((simTotalCost * simDownPct) / 100);
const simLoanAmount = Math.max(simTotalCost - simDownPayment, 0);
const simMonthlyRate = simRate / 100 / 12;
const simNMonths = simDuration * 12;
const simMonthlyPayment = simLoanAmount > 0
? simMonthlyRate > 0
? (simLoanAmount * simMonthlyRate) / (1 - Math.pow(1 + simMonthlyRate, -simNMonths))
: simLoanAmount / simNMonths
: 0;
const simMonthlyRent = Number(metrics.monthly_rent ?? 0);
const simAnnualCharges = Number(metrics.annual_charges ?? 0);
const simCashflow = simMonthlyRent - simAnnualCharges / 12 - simMonthlyPayment;
const scenarios = (financialSnapshot.scenarios || {}) as Record<string, any>;
const decisionSnapshot = (analysis.decision_snapshot || analysis || {}) as Record<string, any>;
const decision = (decisionSnapshot.decision || {}) as Record<string, any>;
const market = (decisionSnapshot.market || {}) as Record<string, any>;
const risk = (decisionSnapshot.risk || {}) as Record<string, any>;
const verdict = decision.verdict || analysis.verdict;
const score = analysis.overall_score ?? analysis.score ?? decision.score;
const confidence = analysis.confidence_score ?? decision.confidence_score;
const actions = Array.isArray(decision.actions) ? decision.actions : [];
const risks = Array.isArray(risk.risks) ? risk.risks : [];
const missing = Array.isArray(financialSnapshot.missing_data) ? financialSnapshot.missing_data : [];
const confidenceLabel = confidence == null ? null : confidence >= 75 ? "Élevée" : confidence >= 50 ? "Moyenne" : "Faible";
const scorePct = score == null ? 0 : Math.min(100, Math.max(0, Number(score)));
const yieldPct = metrics.net_yield_pct == null ? 0 : Math.min(100, Math.max(0, (Number(metrics.net_yield_pct) / 12) * 100));
const cashflowValue = financing.monthly_cashflow == null ? null : Number(financing.monthly_cashflow);
const cashflowPct = cashflowValue == null ? 50 : Math.min(100, Math.max(0, 50 + cashflowValue / 10));
const yieldLabel = metrics.net_yield_pct == null ? null : Number(metrics.net_yield_pct) >= 6 ? "Rendement solide" : Number(metrics.net_yield_pct) >= 3 ? "Rendement modéré" : "Rendement à surveiller";
const yieldTone = metrics.net_yield_pct == null ? "neutral" : Number(metrics.net_yield_pct) >= 6 ? "good" : Number(metrics.net_yield_pct) >= 3 ? "warn" : "bad";
const cashflowLabel = cashflowValue == null ? null : cashflowValue >= 0 ? "Cash-flow positif" : "Cash-flow négatif";
const cashflowTone = cashflowValue == null ? "neutral" : cashflowValue >= 0 ? "good" : "bad";
const confidenceTone = confidenceLabel === "Élevée" ? "good" : confidenceLabel === "Moyenne" ? "warn" : confidenceLabel === "Faible" ? "bad" : "neutral";
const missingCount = missing.length;
const rows = ["base", "conservative", "optimistic"].filter((k) => scenarios[k]);
const label = verdict === "interesting" ? "Intéressant" : verdict === "unattractive" ? "Peu intéressant" : "À vérifier & négocier";
const marketReady = market.status === "ready";
const priceHistory = (market.price_history || {}) as Record<string, any>;
const historyYears = Array.isArray(priceHistory.years) ? priceHistory.years : [];
const historyReady = priceHistory.status === "ready" && historyYears.length >= 2;
const historyMax = historyYears.length ? Math.max(...historyYears.map((y: any) => Number(y.median_price_m2) || 0), 1) : 1;
const historyMin = historyYears.length ? Math.min(...historyYears.map((y: any) => Number(y.median_price_m2) || 0)) : 0;
const historyRange = historyMax - historyMin || historyMax || 1;
const propertyId = typeof result.property_id === "string" ? result.property_id : typeof analysis.property_id === "string" ? analysis.property_id : "";
const [downloadingDossier, setDownloadingDossier] = useState(false);
const [dossierError, setDossierError] = useState<string | null>(null);
async function downloadDossier() {
if (!propertyId) return;
setDownloadingDossier(true);
setDossierError(null);
try {
const { data } = await supabase.auth.getSession();
const token = data.session?.access_token;
if (!token) { setDossierError("Session expirée — reconnectez-vous puis réessayez."); return; }
const response = await fetch("/api/properties/dossier", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ property_id: propertyId }) });
if (!response.ok) {
let message = `Le dossier n'a pas pu être généré (erreur ${response.status}).`;
try { const errBody = await response.json(); if (errBody?.message) message = String(errBody.message); } catch {}
throw new Error(message);
}
const blob = await response.blob();
if (blob.size === 0) throw new Error("Le fichier généré est vide. Réessayez dans un instant.");
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url; a.download = `dossier-bricky-${propertyId}.pdf`; document.body.appendChild(a); a.click(); a.remove();
URL.revokeObjectURL(url);
} catch (err: any) {
console.error("Echec telechargement dossier PDF:", err);
setDossierError(err?.message || "Erreur inattendue lors de la génération du dossier. Réessayez dans un instant.");
} finally {
setDownloadingDossier(false);
}
}
return <section className="result-panel decision-dashboard"><div className="result-head"><div><span className="eyebrow">Analyse terminée</span><h2>Voici ce que Bricky en pense.</h2></div><div className="result-head-actions">{propertyId && <button type="button" className="secondary-button" onClick={downloadDossier} disabled={downloadingDossier}>{downloadingDossier ? "Génération…" : "Télécharger le dossier complet (PDF) →"}</button>}<span className="status-dot">● Décision</span></div></div>
{dossierError ? <p className="share-error" style={{ marginTop: 4 }}>{dossierError}</p> : null}
<div className="decision-hero"><div><span className="decision-label">Verdict</span><strong>{label}</strong></div><div className="score-block"><span>Score</span><b>{score ?? "—"}<small>/100</small></b></div><div className="score-block"><span>Confiance</span><b>{confidence ?? "—"}<small>%</small></b>{confidenceLabel ? <em className="confidence-tag">{confidenceLabel}</em> : null}</div></div>{missingCount > 0 ? <p className="confidence-note">Score basé sur {missingCount} donnée{missingCount > 1 ? "s" : ""} manquante{missingCount > 1 ? "s" : ""} — plus vous complétez le bien, plus l'estimation est fiable.</p> : null}
<div className="insights-band"><div className="ring-cards"><RingCard title="Score Bricky" pct={scorePct} colorFrom="#6366f1" colorTo="#3b82f6" gradientId="ringScore" value={`${score ?? "—"}/100`} caption="Fiabilité du score" chipText={confidenceLabel ? `Confiance ${confidenceLabel}` : null} chipTone={confidenceTone} delayMs={0} /><RingCard title="Rendement net" pct={yieldPct} colorFrom="#16a34a" colorTo="#4ade80" gradientId="ringYield" value={`${metrics.net_yield_pct ?? "—"}%`} caption="Rendement net annuel" chipText={yieldLabel} chipTone={yieldTone} delayMs={120} /><RingCard title="Cash-flow mensuel" pct={cashflowPct} colorFrom={cashflowTone === "bad" ? "#f97316" : "#0ea5e9"} colorTo={cashflowTone === "bad" ? "#fb923c" : "#38bdf8"} gradientId="ringCashflow" value={`${financing.monthly_cashflow ?? "—"} €`} caption="Après charges & prêt" chipText={cashflowLabel} chipTone={cashflowTone} delayMs={240} /></div><div className="funnel-card"><h4>Du loyer au cash-flow</h4><FunnelChart steps={[{ label: "Loyer mensuel", value: `${metrics.monthly_rent ?? "—"} €`, pct: 100, tone: "accent" }, { label: "Revenu annuel net", value: `${metrics.annual_net_income ?? "—"} €`, pct: Math.min(100, Math.round(((metrics.annual_net_income ?? 0) / (((metrics.monthly_rent ?? 1) * 12) || 1)) * 100)), tone: "accent" }, { label: "Mensualité de prêt", value: `${financing.monthly_loan_payment ?? "—"} €`, pct: Math.min(100, Math.round(((financing.monthly_loan_payment ?? 0) / ((metrics.monthly_rent ?? 1) || 1)) * 100)), tone: "accent" }, { label: "Cash-flow mensuel", value: `${financing.monthly_cashflow ?? "—"} €`, pct: Math.min(100, Math.max(4, Math.round(Math.abs((financing.monthly_cashflow ?? 0) / ((metrics.monthly_rent ?? 1) || 1)) * 100))), tone: cashflowTone === "bad" ? "bad" : "good" }]} /></div>{rows.length > 0 && <div className="scenario-chart-card"><h4>Rendement net par scénario</h4><BarChart items={rows.map((key) => { const maxVal = Math.max(...rows.map((k) => scenarios[k].net_yield ?? 0), 1); const val = scenarios[key].net_yield ?? 0; const pct = Math.max(6, Math.round((val / maxVal) * 100)); return { key, label: key === "base" ? "Base" : key === "conservative" ? "Conservateur" : "Optimiste", display: `${val} %`, pct }; })} /></div>}</div>
<div className="share-row"><button type="button" className="share-button" onClick={handleShare} disabled={shareStatus.loading}>{shareStatus.loading ? "Generation du lien..." : shareStatus.url ? "Lien actif" : "Partager cette analyse"}</button>{shareStatus.url ? <div className="share-link"><input type="text" readOnly value={shareStatus.url} onFocus={(e) => e.target.select()} /><button type="button" onClick={() => navigator.clipboard.writeText(shareStatus.url || "")}>Copier</button></div> : null}{shareStatus.error ? <p className="share-error">{shareStatus.error}</p> : null}</div>
<div className="metric-grid"><Metric label="Loyer mensuel" value={metrics.monthly_rent} suffix=" €" /><Metric label="Revenu annuel net" value={metrics.annual_net_income} suffix=" €" /><Metric label="Rendement brut" value={metrics.gross_yield_pct} suffix=" %" /><Metric label="Rendement net" value={metrics.net_yield_pct} suffix=" %" /></div>
{propertyId && <CadastralPanel propertyId={propertyId} address={address} />}
{propertyId && <UrbanismePanel propertyId={propertyId} address={address} />}
{propertyId && <EnvironmentalRiskPanel propertyId={propertyId} address={address} onAnalysisRefreshed={() => onResultRefresh?.(propertyId)} />}
{propertyId && <LocationPanel propertyId={propertyId} address={address} />}
<div className="dashboard-section"><h3>Achat &amp; financement (estimation)</h3><div className="metric-grid"><Metric label="Frais de notaire" value={acquisition.notary_fees} suffix=" €" /><Metric label="Frais de garantie" value={acquisition.guarantee_fees} suffix=" €" /><Metric label="Travaux" value={acquisition.renovation_budget} suffix=" €" /><Metric label="Coût total d'acquisition" value={acquisition.total_acquisition_cost} suffix=" €" /></div><div className="metric-grid" style={{marginTop:12}}><Metric label="Mensualité de prêt" value={financing.monthly_loan_payment} suffix=" €/mois" /><Metric label="Cash-flow mensuel" value={financing.monthly_cashflow} suffix=" €" /><Metric label="Rentabilité brute (coût total)" value={acquisition.gross_yield_on_total_cost_pct} suffix=" %" /><Metric label="Rentabilité nette (coût total)" value={acquisition.net_yield_on_total_cost_pct} suffix=" %" /></div>{financing.is_estimated ? <p className="extract-note">Estimation Bricky (apport ~10%, taux ~3,9% sur 20 ans, garantie ~1,2%) tant que ces données ne sont pas renseignées — à affiner avec votre courtier.</p> : null}</div>
<div className="dashboard-section"><h3>Simulateur de financement</h3><div className="sim-grid"><label>Apport ({simDownPct}%)<input type="range" min={0} max={50} step={1} value={simDownPct} onChange={(e) => setSimDownPct(Number(e.target.value))} /></label><label>Taux ({simRate.toFixed(2)}%)<input type="range" min={0.5} max={7} step={0.1} value={simRate} onChange={(e) => setSimRate(Number(e.target.value))} /></label><label>Duree ({simDuration} ans)<input type="range" min={5} max={30} step={1} value={simDuration} onChange={(e) => setSimDuration(Number(e.target.value))} /></label></div><div className="metric-grid"><Metric label="Apport" value={Math.round(simDownPayment)} suffix=" €" /><Metric label="Montant emprunte" value={Math.round(simLoanAmount)} suffix=" €" /><Metric label="Mensualite" value={Math.round(simMonthlyPayment)} suffix=" €" /><Metric label="Cashflow mensuel" value={Math.round(simCashflow)} suffix=" €" /></div><p className="extract-note">Simulation en direct — ajustez les curseurs pour voir l'impact sur la mensualite et le cashflow.</p>
{metrics.annual_net_income != null && Number(metrics.annual_net_income) > 0 && <><h3 style={{marginTop:24}}>À quel prix ce bien devient une bonne affaire ?</h3><div className="negotiation-grid"><div className="negotiation-card"><span>Négocier sous</span><b>{Math.round(Number(metrics.annual_net_income) / 0.04).toLocaleString("fr-FR")} €</b></div><div className="negotiation-card"><span>Opportunité correcte sous</span><b>{Math.round(Number(metrics.annual_net_income) / 0.06).toLocaleString("fr-FR")} €</b></div><div className="negotiation-card"><span>Opportunité forte sous</span><b>{Math.round(Number(metrics.annual_net_income) / 0.08).toLocaleString("fr-FR")} €</b></div></div><p className="extract-note">Seuils calculés à partir du revenu net annuel actuel ({Math.round(Number(metrics.annual_net_income)).toLocaleString("fr-FR")} €) pour viser respectivement 4%, 6% et 8% de rendement net — à titre indicatif, indépendamment du financement.</p></>}
</div>

<div className="dashboard-section market-card"><div className="section-heading"><div><h3>Valeur marché</h3><small>Transactions comparables · données disponibles</small></div><span className="market-badge">{marketReady ? `${market.confidence_score ?? 0}% confiance` : "Données insuffisantes"}</span></div>{marketReady ? <div className="market-grid"><Metric label="Prix du bien" value={market.property_price_m2} suffix=" €/m²" /><Metric label="Marché médian" value={market.market_price_m2_median} suffix=" €/m²" /><Metric label="Valeur estimée" value={market.market_value_estimate} suffix=" €" /><Metric label="Écart au marché" value={market.market_gap_pct} suffix=" %" /></div> : <p className="empty-note">Bricky ne dispose pas encore de suffisamment de transactions comparables pour produire une estimation fiable. Aucune valeur n'est inventée.</p>}</div><div className="dashboard-section price-history-card"><div className="section-heading"><div><h3>Évolution des prix (DVF)</h3><small>Prix médian au m² par année de transaction · biens comparables dans la commune</small></div>{historyReady && priceHistory.trend_pct_total != null ? <span className="market-badge">{priceHistory.trend_pct_total >= 0 ? "+" : ""}{priceHistory.trend_pct_total}% sur {historyYears.length} ans</span> : null}</div>{historyReady ? <><BarChart items={historyYears.map((y: any) => { const val = Number(y.median_price_m2) || 0; const pct = Math.max(8, Math.round(((val - historyMin) / historyRange) * 100)); return { key: String(y.year), label: String(y.year), display: `${Math.round(val).toLocaleString("fr-FR")} €`, pct }; })} />{priceHistory.trend_pct_annualized != null && <p className="extract-note">Soit environ {priceHistory.trend_pct_annualized >= 0 ? "+" : ""}{priceHistory.trend_pct_annualized}%/an en moyenne entre {priceHistory.first_year} et {priceHistory.last_year}, sur les transactions DVF comparables (même commune, surface proche).</p>}</> : <p className="empty-note">Pas encore assez de transactions DVF réparties sur plusieurs années pour tracer une tendance ici. Cela s'enrichit automatiquement à mesure que la base de comparables grandit.</p>}</div>
{rows.length > 0 && <div className="dashboard-section"><h3>Scénarios</h3><div className="scenario-grid">{rows.map((key) => <div className="scenario" key={key}><span>{key === "base" ? "Base" : key === "conservative" ? "Conservateur" : "Optimiste"}</span><b>{scenarios[key].net_yield ?? "—"} %</b><small>rendement net</small></div>)}</div></div>}
{verdict && <div className="dashboard-section"><h3>Pourquoi ce verdict ?</h3><p className="empty-note" style={{fontSize:14, lineHeight:1.6}}>
Bricky a classé ce bien comme <b>« {label} »</b>{score != null ? <> avec un score de <b>{score}/100</b></> : null}{confidenceLabel ? <> (confiance {confidenceLabel.toLowerCase()})</> : null}.{" "}
{risk.risk_level ? <>Le niveau de risque détecté est <b>{risk.risk_level}</b>{risk.high_signal_count != null && Number(risk.high_signal_count) > 0 ? <> avec {risk.high_signal_count} signal{Number(risk.high_signal_count) > 1 ? "aux" : ""} fort{Number(risk.high_signal_count) > 1 ? "s" : ""}</> : null}. </> : null}
{marketReady ? <>La valeur de marché estimée est de <b>{market.market_value_estimate != null ? Number(market.market_value_estimate).toLocaleString("fr-FR") + " €" : "—"}</b> ({market.confidence_score ?? 0}% de confiance, {market.comparables_count ?? 0} comparable{Number(market.comparables_count) > 1 ? "s" : ""}). </> : <>Bricky n'a pas encore assez de comparables de marché pour valider le prix. </>}
{missingCount > 0 ? <>Ce verdict repose sur {missingCount} donnée{missingCount > 1 ? "s" : ""} manquante{missingCount > 1 ? "s" : ""} — le complétez pour affiner le résultat.</> : <>Toutes les données clés nécessaires à ce calcul sont renseignées.</>}
</p></div>}
{actions.length > 0 && <div className="dashboard-section"><h3>Ce qu’il faut faire</h3><ul>{actions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></div>}
{risks.length > 0 && <div className="dashboard-section"><h3>Points de vigilance</h3><div className="risk-list">{risks.map((r: any, i: number) => <div className="risk-item" key={i}><b>{r.title || "Risque"}</b><span>{r.severity || ""}</span><p>{r.explanation || r.impact || ""}</p></div>)}</div></div>}
{missing.length > 0 && <div className="dashboard-section"><h3>Données manquantes</h3><div className="missing-list">{missing.map((m: any, i: number) => <div key={i}><b>{m.label || m.field_key}</b><p>{m.suggested_question || m.impact || "À vérifier avant décision."}</p></div>)}</div></div>}
{result.analysis_id && <ChecklistPanel analysisId={result.analysis_id} />}
</section>;
}

type ChecklistItem = { id: string; title: string; description: string | null; priority: string; completed: boolean };

function ChecklistPanel({ analysisId }: { analysisId: string }) {
const [items, setItems] = useState<ChecklistItem[] | null>(null);
const [error, setError] = useState("");

useEffect(() => {
let cancelled = false;
async function load() {
const { data, error: queryError } = await supabase
.from("checklist_items")
.select("id, title, description, priority, completed")
.eq("analysis_id", analysisId)
.order("priority", { ascending: true });
if (cancelled) return;
if (queryError) { setError("Impossible de charger la checklist."); return; }
setItems((data as ChecklistItem[]) || []);
}
load();
return () => { cancelled = true; };
}, [analysisId]);

async function toggle(item: ChecklistItem) {
setItems((current) => current ? current.map((i) => (i.id === item.id ? { ...i, completed: !i.completed } : i)) : current);
await supabase.from("checklist_items").update({ completed: !item.completed }).eq("id", item.id);
}

if (error) return <div className="dashboard-section"><h3>Checklist de vérification</h3><div className="error-box">{error}</div></div>;
if (!items || items.length === 0) return null;

const priorityLabel = (p: string) => (p === "critical" ? "Critique" : p === "high" ? "Prioritaire" : "À vérifier");
const done = items.filter((i) => i.completed).length;

return <div className="dashboard-section">
<div className="section-heading"><div><h3>Checklist de vérification</h3><small>{done}/{items.length} points traités avant de vous engager</small></div></div>
<div className="checklist-list">
{items.map((item) => (
<label className={`checklist-item checklist-${item.priority}`} key={item.id}>
<input type="checkbox" checked={item.completed} onChange={() => toggle(item)} />
<div><b>{item.title}</b><span className="checklist-priority">{priorityLabel(item.priority)}</span></div>
</label>
))}
</div>
</div>;
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
if (!token) throw new Error("Session expirée.");
const response = await fetch("/api/cadastre/lookup", {
method: "POST",
headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
body: JSON.stringify({ property_id: propertyId, address }),
});
const body = await response.json();
if (cancelled) return;
if (!response.ok) {
setAutoStatus("failed"); setAutoNote(body?.note || body?.error || "Détection automatique impossible.");
return;
}
setResult(body.cadastral); setAutoStatus("success");
} catch (err) {
if (!cancelled) { setAutoStatus("failed"); setAutoNote(err instanceof Error ? err.message : "Détection automatique impossible."); }
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
if (!token) throw new Error("Session expirée.");
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
if (!token) throw new Error("Session expirée.");
const response = await fetch("/api/cadastre/plan", {
method: "POST",
headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
body: JSON.stringify({ property_id: propertyId, commune_code: communeCode, section_prefix: prefix, section, parcel_number: parcel }),
});
const body = await response.json();
if (!response.ok) throw new Error(body?.error || "Plan cadastral indisponible.");
setResult(body.cadastral);
} catch (err) { setError(err instanceof Error ? err.message : "Impossible de générer le plan."); }
finally { setLoading(false); }
}

const manualVisible = showManual || autoStatus === "failed" || (!address && autoStatus === "idle");

return <div className="dashboard-section cadastral-card">
<div className="section-heading"><div><span className="eyebrow">Donnée foncière</span><h3>Plan cadastral</h3><small>Référence parcellaire + extrait officiel DGFiP</small></div>{result && <span className="market-badge">✓ Référence enregistrée</span>}</div>
<p className="empty-note">Bricky rattache la parcelle au bien et prépare son plan cadastral. On garde la référence exacte et la source pour la traçabilité.</p>
{autoStatus === "loading" && <div className="extract-note">Détection automatique de la parcelle à partir de l'adresse…</div>}
{autoStatus === "failed" && <div className="error-box">{autoNote} Renseigne la référence manuellement ci-dessous.</div>}
{!manualVisible && !result && autoStatus !== "loading" && (
<button type="button" className="secondary-button" onClick={() => setShowManual(true)}>Saisir la parcelle manuellement</button>
)}
{manualVisible && !result && (
<div className="cadastral-form"><label>Commune INSEE<input value={communeCode} onChange={(e) => setCommuneCode(e.target.value.toUpperCase())} placeholder="97209" maxLength={5} /></label><label>Préfixe<input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="000" maxLength={3} /></label><label>Section<input value={section} onChange={(e) => setSection(e.target.value.toUpperCase())} placeholder="AB" maxLength={2} /></label><label>Parcelle<input value={parcel} onChange={(e) => setParcel(e.target.value)} placeholder="123" maxLength={4} /></label><button type="button" className="secondary-button" onClick={generatePlan} disabled={loading || !communeCode || !section || !parcel}>{loading ? "Génération…" : "Générer le plan →"}</button></div>
)}
{error && <div className="error-box">{error}</div>}
{result && <div className="cadastral-result"><div><b>Parcelle {result.section} {result.parcel_number}</b><span>{result.parcel_id} · commune {result.commune_code}</span>{typeof result.parcel_area_m2 === "number" && <span>Surface parcelle : {result.parcel_area_m2.toLocaleString("fr-FR")} m²</span>}</div><a className="primary-button" href={result.plan_url} target="_blank" rel="noreferrer">Ouvrir l’extrait cadastral</a><small>Source : {result.source}{autoStatus === "success" ? " · détectée automatiquement" : ""}</small></div>}
{result?.geometry ? <ParcelSchema geometry={result.geometry} areaM2={result.parcel_area_m2} buildingGeometry={building?.geometry} /> : null}
{building && (building.hauteur_m != null || building.nature || building.usage_1) && (
<div className="cadastral-result building-result">
<div>
<b>Bâti détecté (BD TOPO®)</b>
<span>{building.nature || "Nature non précisée"}{building.usage_1 ? ` · ${building.usage_1}` : ""}</span>
{building.hauteur_m != null && <span>Hauteur estimée : {building.hauteur_m.toLocaleString("fr-FR")} m{building.nombre_etages != null ? ` (~${building.nombre_etages} niveau${building.nombre_etages > 1 ? "x" : ""})` : ""}</span>}
{building.nombre_logements != null && <span>Logements recensés : {building.nombre_logements}</span>}
{building.date_construction && <span>Construction : {building.date_construction}</span>}
</div>
<small>Source : {building.source}. Empreinte indicative — à recouper avec le relevé de géomètre avant tout projet.</small>
</div>
)}
{buildingStatus === "loading" && !building && <div className="extract-note">Recherche de l&apos;empreinte du bâtiment (BD TOPO®)…</div>}
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

// Origine commune (premier point de la parcelle) et projection équirectangulaire
// partagées entre parcelle et bâti, pour que les deux se superposent correctement.
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
<div className="section-heading"><div><span className="eyebrow">Schéma Bricky</span><h3>Parcelle{buildingPaths.length ? " + bâti" : ""}</h3><small>Contour approximatif · à titre indicatif, le plan officiel ci-dessus fait foi</small></div></div>
<svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Schéma simplifié de la parcelle et du bâtiment">
<rect x={0} y={0} width={size} height={size} fill="#fafaf8" rx={16} />
{parcelPaths.map((d, i) => <path key={`p-${i}`} d={d} fill="#111" fillOpacity={0.08} stroke="#111" strokeWidth={1.5} />)}
{buildingPaths.map((d, i) => <path key={`b-${i}`} d={d} fill="#b45309" fillOpacity={0.35} stroke="#b45309" strokeWidth={1.5} />)}
</svg>
<div className="parcel-schema-legend">
<span><i className="legend-swatch legend-parcel" /> Parcelle</span>
{buildingPaths.length > 0 && <span><i className="legend-swatch legend-building" /> Bâti</span>}
</div>
{typeof areaM2 === "number" && <small>Surface cadastrale : {areaM2.toLocaleString("fr-FR")} m²</small>}
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
if (!token) throw new Error("Session expirée.");
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
<div className="section-heading"><div><span className="eyebrow">Analyse urbanistique</span><h3>Zonage PLU / PLUi</h3><small>Document d'urbanisme opposable · Géoportail de l'Urbanisme (GPU)</small></div>{result && <span className="market-badge">✓ Zonage identifié</span>}</div>
{status === "loading" && <div className="extract-note">Recherche du zonage d'urbanisme à partir de l'adresse…</div>}
{status === "failed" && <div className="error-box">{note}</div>}
{result && (
<div className="cadastral-result">
<div>
<b>{result.zone_label || "Zone non nommée"}{result.zone_type ? ` (${result.zone_type})` : ""}</b>
<span>{result.metadata?.typezone_label || "Type de zone non précisé"}{result.insee_code ? ` · commune ${result.insee_code}` : ""}</span>
{result.destination_dominante && <span>Destination dominante : {result.destination_dominante}</span>}
{result.zone_label_long && <span>{result.zone_label_long}</span>}
</div>
{result.regulation_url && <a className="primary-button" href={result.regulation_url} target="_blank" rel="noreferrer">Consulter le règlement →</a>}
<small>Source : {result.source}. À vérifier auprès du service urbanisme de la mairie avant tout projet — le PLU peut avoir évolué depuis la dernière synchronisation du GPU.</small>
</div>
)}
</div>;
}

type EnvironmentalRiskResult = {
flood_risk?: boolean | null;
groundwater_rise_risk?: boolean | null;
seismic_risk?: boolean | null;
seismic_level?: string | null;
ground_movement_risk?: boolean | null;
clay_shrink_swell_risk?: boolean | null;
clay_shrink_swell_level?: string | null;
radon_risk?: boolean | null;
radon_level?: string | null;
icpe_risk?: boolean | null;
soil_pollution_risk?: boolean | null;
mining_risk?: boolean | null;
humidity_building_alert_level?: string | null;
underground_study_recommended?: boolean | null;
risk_count?: number | null;
};

function EnvironmentalRiskPanel({ propertyId, address, onAnalysisRefreshed }: { propertyId: string; address?: string; onAnalysisRefreshed?: () => void }) {
const [result, setResult] = useState<EnvironmentalRiskResult | null>(null);
const [reportUrl, setReportUrl] = useState<string | null>(null);
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
if (!token) throw new Error("Session expirée.");
const response = await fetch("/api/environmental-risks/lookup", {
method: "POST",
headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
body: JSON.stringify({ property_id: propertyId, address }),
});
const body = await response.json();
if (cancelled) return;
if (!response.ok) {
setStatus("failed"); setNote(body?.error || "Étude de terrain indisponible pour cette adresse.");
return;
}
setResult(body.environmental_risks || null);
setReportUrl(body.report_url || null);
setStatus("success");
if (body.analysis_refreshed && onAnalysisRefreshed) onAnalysisRefreshed();
} catch (err) {
if (!cancelled) { setStatus("failed"); setNote(err instanceof Error ? err.message : "Étude de terrain indisponible."); }
}
}
attemptLookup();
return () => { cancelled = true; };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [address, propertyId]);

if (!address) return null;

const levelLabel = (level?: string | null) => (level === "eleve" || level === "fort") ? "Élevé" : level === "moyen" ? "Moyen" : (level === "faible" || level === "indetermine") ? "Faible" : "Non connu";
const levelClass = (level?: string | null) => (level === "eleve" || level === "fort") ? "risk-badge-high" : level === "moyen" ? "risk-badge-medium" : "risk-badge-low";

const otherRisks = result ? [
{ label: "Inondation", present: result.flood_risk },
{ label: "Remontée de nappe", present: result.groundwater_rise_risk },
{ label: "Séisme", present: result.seismic_risk, level: result.seismic_level },
{ label: "Radon", present: result.radon_risk, level: result.radon_level },
{ label: "Installations classées (ICPE)", present: result.icpe_risk },
] : [];

return <div className="dashboard-section cadastral-card">
<div className="section-heading"><div><span className="eyebrow">Étude du terrain</span><h3>Risques de sol &amp; environnement</h3><small>Géorisques (BRGM / ministère de la Transition écologique)</small></div>{result && <span className="market-badge">{result.risk_count ?? 0} aléa(s) recensé(s)</span>}</div>
{status === "loading" && <div className="extract-note">Analyse du sol et des risques environnementaux à partir de l&apos;adresse…</div>}
{status === "failed" && <div className="error-box">{note}</div>}
{result && (
<div className="env-risk-grid">
<div className="env-risk-card">
<b>Potentiel humidité vers la bâtisse</b>
<span className={`risk-badge ${levelClass(result.humidity_building_alert_level)}`}>{levelLabel(result.humidity_building_alert_level)}</span>
<p>Basé sur le retrait-gonflement des argiles{result.groundwater_rise_risk ? " et la remontée de nappe" : ""} recensés sur cette zone : le sol peut travailler lors des cycles sécheresse/humidité et fissurer les fondations.</p>
</div>
<div className="env-risk-card">
<b>Étude du sol souterrain</b>
<span className={`risk-badge ${result.underground_study_recommended ? "risk-badge-medium" : "risk-badge-low"}`}>{result.underground_study_recommended ? "Étude recommandée" : "Pas de signal fort"}</span>
<p>{result.mining_risk ? "Cavité souterraine ou risque minier répertorié. " : ""}{result.soil_pollution_risk ? "Site à proximité d'une pollution des sols recensée. " : ""}{result.ground_movement_risk ? "Mouvement de terrain répertorié sur la commune. " : ""}{!result.mining_risk && !result.soil_pollution_risk && !result.ground_movement_risk ? "Aucun signal fort de cavité, pollution ou mouvement de terrain sur cette zone." : ""}</p>
</div>
</div>
)}
{result && otherRisks.length > 0 && (
<div className="env-risk-list">
{otherRisks.map((r) => (
<div className={`env-risk-chip ${r.present ? "env-risk-chip-present" : ""}`} key={r.label}>
<span>{r.label}</span>
<b>{r.present ? (r.level ? levelLabel(r.level) : "Recensé") : "Non recensé"}</b>
</div>
))}
</div>
)}
{result && (
<small>Source : Géorisques (data.gouv.fr / BRGM). Indicatif — ne remplace pas une étude de sol (norme NF P94-500) ou un état des risques (ERP) officiel.{reportUrl ? <> · <a href={reportUrl} target="_blank" rel="noreferrer">Voir le rapport officiel →</a></> : null}</small>
)}
</div>;
}

type Poi = { name: string; category: string; category_label: string; distance_m: number };
type LocationResult = { location: { latitude: number; longitude: number }; pois: Poi[]; counts: Record<string, number>; source: string; note?: string };

function LocationPanel({ propertyId, address }: { propertyId: string; address?: string }) {
const [result, setResult] = useState<LocationResult | null>(null);
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
if (!token) throw new Error("Session expirée.");
const response = await fetch("/api/location/lookup", {
method: "POST",
headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
body: JSON.stringify({ property_id: propertyId, address }),
});
const body = await response.json();
if (cancelled) return;
if (!response.ok) {
setStatus("failed"); setNote(body?.error || "Localisation indisponible pour cette adresse.");
return;
}
setResult(body); setStatus("success");
} catch (err) {
if (!cancelled) { setStatus("failed"); setNote(err instanceof Error ? err.message : "Localisation indisponible."); }
}
}
attemptLookup();
return () => { cancelled = true; };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [address, propertyId]);

if (!address) return null;

const lat = result?.location?.latitude;
const lon = result?.location?.longitude;
const bbox = lat != null && lon != null ? `${lon - 0.006},${lat - 0.004},${lon + 0.006},${lat + 0.004}` : null;
const mapUrl = bbox ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat},${lon}&layer=mapnik` : null;

const grouped: Record<string, Poi[]> = {};
if (result) {
for (const poi of result.pois) {
if (!grouped[poi.category]) grouped[poi.category] = [];
grouped[poi.category].push(poi);
}
}

return <div className="dashboard-section cadastral-card location-panel">
<div className="section-heading"><div><span className="eyebrow">Environnement</span><h3>Localisation &amp; alentours</h3><small>Carte + points d'intérêt à proximité (OpenStreetMap)</small></div>{result && <span className="market-badge">{result.pois.length} points trouvés</span>}</div>
{status === "loading" && <div className="extract-note">Localisation du bien et recherche des environs…</div>}
{status === "failed" && <div className="error-box">{note}</div>}
{mapUrl && (
<div className="location-map">
<iframe title="Carte de localisation" src={mapUrl} loading="lazy" />
</div>
)}
{result && Object.keys(grouped).length > 0 && (
<div className="poi-groups">
{Object.entries(grouped).map(([category, items]) => (
<div className="poi-group" key={category}>
<div className="poi-group-title">{items[0].category_label} <span>({items.length})</span></div>
<ul>
{items.slice(0, 5).map((poi, i) => (
<li key={i}>{poi.name} <span>{poi.distance_m} m</span></li>
))}
</ul>
</div>
))}
</div>
)}
{result && result.pois.length === 0 && <p className="empty-note">Aucun point d'intérêt répertorié par OpenStreetMap dans un rayon de 700 m autour de ce bien.</p>}
{result?.note && <small>Source : {result.source}. {result.note}</small>}
</div>;
}

function Metric({ label, value, suffix }: { label: string; value: unknown; suffix: string }) { return <div className="metric"><span>{label}</span><b>{value == null || value === "" ? "—" : Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{value != null && value !== "" ? suffix : ""}</b></div>; }
