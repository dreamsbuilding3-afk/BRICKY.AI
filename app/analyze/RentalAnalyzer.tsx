"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { clearPendingImport, takePendingImportFromLocation, type PendingImport } from "../../lib/brickyImport";
import type { RentalAssessment } from "../../lib/rental/assess";

type RentalForm = {
  source_url: string;
  city: string;
  postal_code: string;
  address: string;
  property_type: string;
  surface_m2: string;
  rooms: string;
  rent_hc: string;
  monthly_charges: string;
  rent_cc: string;
  is_furnished: string;
  dpe_class: string;
  deposit: string;
  tenant_agency_fees: string;
  reference_rent_m2_majore: string;
  rent_supplement: string;
  energy_cost_annual: string;
  household_income: string;
};

const EMPTY: RentalForm = {
  source_url: "", city: "", postal_code: "", address: "", property_type: "", surface_m2: "", rooms: "", rent_hc: "", monthly_charges: "", rent_cc: "",
  is_furnished: "", dpe_class: "", deposit: "", tenant_agency_fees: "", reference_rent_m2_majore: "", rent_supplement: "", energy_cost_annual: "", household_income: "",
};

const INCOME_KEY = "bricky_household_income_v1";

type RentalResult = { location: { label: string } | null; assessment: RentalAssessment };

const euros = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

// Analyse « Louer un logement » : le futur locataire colle l'annonce, Bricky
// remplit les champs et dit si le loyer est juste et si l'annonce est en règle.
export function RentalAnalyzer() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [form, setForm] = useState<RentalForm>(EMPTY);
  const [autoFields, setAutoFields] = useState<Set<string>>(new Set());
  const [pastedText, setPastedText] = useState("");
  const [busy, setBusy] = useState<"" | "link" | "text" | "file" | "analyze">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [result, setResult] = useState<RentalResult | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else {
        setUserEmail(data.session.user.email ?? "");
        setSessionReady(true);
      }
    });
    try {
      const income = window.localStorage.getItem(INCOME_KEY);
      if (income) setForm((f) => ({ ...f, household_income: income }));
    } catch {}
    const imported = takePendingImportFromLocation();
    if (imported) {
      setForm((f) => ({ ...f, source_url: imported.url }));
      setPastedText(imported.text);
      setPendingImport(imported);
    }
  }, [router]);

  useEffect(() => {
    if (!pendingImport || !sessionReady) return;
    setPendingImport(null);
    clearPendingImport();
    extract({ text: pendingImport.text, url: pendingImport.url }, "text", "l'annonce envoyée par le bouton Bricky");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImport, sessionReady]);

  const update = (key: keyof RentalForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setAutoFields((cur) => {
      if (!cur.has(key)) return cur;
      const next = new Set(cur);
      next.delete(key);
      return next;
    });
    if (key === "household_income") {
      try { window.localStorage.setItem(INCOME_KEY, value); } catch {}
    }
  };
  const af = (key: keyof RentalForm) => (autoFields.has(key) ? "auto-filled" : undefined);

  async function token() {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Session expirée, reconnecte-toi.");
    return t;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyExtraction(data: any, sourceLabel: string) {
    const e = data.extracted || {};
    const x = data.extra || {};
    const filled = new Set<string>();
    const values: Partial<RentalForm> = {
      city: e.city, postal_code: e.postal_code, address: e.address, property_type: e.property_type,
      surface_m2: e.surface_m2, rooms: e.rooms, rent_hc: e.monthly_rent, monthly_charges: e.monthly_charges, rent_cc: e.rent_cc,
      is_furnished: x.is_furnished, dpe_class: e.dpe_class, deposit: e.deposit, tenant_agency_fees: e.tenant_agency_fees,
      reference_rent_m2_majore: e.reference_rent_m2_majore, rent_supplement: e.rent_supplement, energy_cost_annual: x.energy_cost_annual_estimate,
    };
    setForm((f) => {
      const next = { ...f };
      for (const [k, v] of Object.entries(values)) {
        if (v === null || v === undefined || v === "") continue;
        next[k as keyof RentalForm] = String(v);
        filled.add(k);
      }
      return next;
    });
    setAutoFields(filled);
    if (e.reference_rent_m2_majore != null || e.rent_supplement != null || e.deposit != null || e.tenant_agency_fees != null) setShowMore(true);
    const parts = [`${filled.size} données remplies automatiquement depuis ${sourceLabel}.`];
    if (e.transaction_type === "vente") parts.push("⚠ Cette annonce semble être une vente : pour un achat, choisis plutôt « Acheter un bien ».");
    const missing = [e.surface_m2 == null && "surface", e.monthly_rent == null && e.rent_cc == null && "loyer", e.city == null && "ville"].filter(Boolean);
    if (missing.length) parts.push(`À compléter : ${missing.join(", ")}.`);
    setNote(parts.join(" "));
  }

  async function extract(body: { url?: string; text?: string }, kind: "link" | "text", sourceLabel: string) {
    setBusy(kind); setError(""); setNote(""); setResult(null);
    try {
      const response = await fetch("/api/properties/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Impossible de lire cette annonce.");
      applyExtraction(data, sourceLabel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction impossible.");
    } finally {
      setBusy("");
    }
  }

  async function extractFiles(files: File[]) {
    setBusy("file"); setError(""); setNote(""); setResult(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("file", f));
      const response = await fetch("/api/properties/extract-file", { method: "POST", headers: { Authorization: `Bearer ${await token()}` }, body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Impossible de lire ce fichier.");
      applyExtraction(data, "le fichier");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction impossible.");
    } finally {
      setBusy("");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy("analyze"); setError(""); setResult(null);
    try {
      const response = await fetch("/api/rentals/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Analyse impossible.");
      setResult(data);
      setTimeout(() => document.getElementById("rental-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse impossible.");
    } finally {
      setBusy("");
    }
  }

  const a = result?.assessment;

  return (
    <main className="page">
      <AppNav email={userEmail} active="analyze" />
      <section className="analysis-shell">
        <div className="analysis-intro">
          <a className="mode-switch" href="/analyze">← Achat ou location ?</a>
          <span className="eyebrow">Bricky · Location</span>
          <h1>Ce loyer est-il juste ?</h1>
          <p className="sub">Colle l'annonce : Bricky compare le loyer au marché du secteur et vérifie que l'annonce est en règle.</p>
        </div>

        <div className="url-import">
          <label>Lien de l'annonce<input value={form.source_url} onChange={(e) => update("source_url", e.target.value)} placeholder="Colle le lien : Bricky remplit tout" /></label>
          <button type="button" className="primary-extract-button secondary-button" disabled={!!busy || !form.source_url.trim()} onClick={() => extract({ url: form.source_url.trim() }, "link", "l'annonce")}>
            {busy === "link" ? "Bricky lit l'annonce…" : "Remplir automatiquement"}
          </button>
        </div>
        <p className="bookmarklet-tip">Leboncoin, PAP ou SeLoger refusent les liens ? <a href="/bouton">Installe le bouton « Envoyer à Bricky »</a>.</p>
        <div className="url-import text-import">
          <label>Ou colle le texte de l'annonce<textarea value={pastedText} onChange={(e) => setPastedText(e.target.value)} rows={3} placeholder="Ctrl+A sur l'annonce, copie, colle ici." /></label>
          <button type="button" className="secondary-button" disabled={!!busy || pastedText.trim().length < 30} onClick={() => extract({ text: pastedText, url: form.source_url.trim() || undefined }, "text", "le texte collé")}>
            {busy === "text" ? "Lecture…" : "Analyser le texte"}
          </button>
        </div>
        <div className="url-import file-import">
          <label>Ou envoie des captures d'écran de l'annonce<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={(e) => { const list = Array.from(e.target.files ?? []); if (list.length) extractFiles(list); e.target.value = ""; }} /></label>
          {busy === "file" && <span className="extract-note">Bricky lit le fichier…</span>}
        </div>
        {(busy === "text" && !pastedText) && <div className="extract-note">Bricky lit l'annonce…</div>}
        {note && <div className="extract-note">✓ {note}</div>}
        {error && <div className="error-box">{error}</div>}

        <form className="property-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className={af("city")}>Ville<input required value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Lyon" /></label>
            <label className={af("postal_code")}>Code postal<input value={form.postal_code} onChange={(e) => update("postal_code", e.target.value)} placeholder="69003" /></label>
            <label className={af("surface_m2")}>Surface (m²)<input required type="number" min="5" step="0.1" value={form.surface_m2} onChange={(e) => update("surface_m2", e.target.value)} placeholder="45" /></label>
            <label className={af("rooms")}>Pièces<input type="number" min="1" value={form.rooms} onChange={(e) => update("rooms", e.target.value)} placeholder="2" /></label>
            <label className={af("rent_hc")}>Loyer hors charges (€/mois)<input type="number" min="0" value={form.rent_hc} onChange={(e) => update("rent_hc", e.target.value)} placeholder="850" /></label>
            <label className={af("monthly_charges")}>Charges (€/mois)<input type="number" min="0" value={form.monthly_charges} onChange={(e) => update("monthly_charges", e.target.value)} placeholder="60" /></label>
            <label className={af("is_furnished")}>Meublé<select value={form.is_furnished} onChange={(e) => update("is_furnished", e.target.value)}><option value="">Non précisé</option><option value="true">Oui</option><option value="false">Non</option></select></label>
            <label className={af("dpe_class")}>DPE<select value={form.dpe_class} onChange={(e) => update("dpe_class", e.target.value)}><option value="">Inconnu</option>{["A", "B", "C", "D", "E", "F", "G"].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
            <label>Revenus nets du foyer (€/mois, facultatif)<input type="number" min="0" value={form.household_income} onChange={(e) => update("household_income", e.target.value)} placeholder="2800" /></label>
          </div>
          <div className="charges-toggle-row">
            <button type="button" className="secondary-button" onClick={() => setShowMore((v) => !v)}>{showMore ? "− Masquer les détails" : "+ Dépôt, frais d'agence, encadrement"}</button>
          </div>
          {showMore && (
            <div className="form-grid charges-grid">
              <label className={af("rent_cc")}>Loyer charges comprises (€/mois)<input type="number" min="0" value={form.rent_cc} onChange={(e) => update("rent_cc", e.target.value)} placeholder="910" /></label>
              <label className={af("deposit")}>Dépôt de garantie (€)<input type="number" min="0" value={form.deposit} onChange={(e) => update("deposit", e.target.value)} placeholder="850" /></label>
              <label className={af("tenant_agency_fees")}>Frais d'agence locataire (€)<input type="number" min="0" value={form.tenant_agency_fees} onChange={(e) => update("tenant_agency_fees", e.target.value)} placeholder="500" /></label>
              <label className={af("reference_rent_m2_majore")}>Loyer de référence majoré (€/m²)<input type="number" min="0" step="0.1" value={form.reference_rent_m2_majore} onChange={(e) => update("reference_rent_m2_majore", e.target.value)} placeholder="Affiché à Paris, Lyon, Lille…" /></label>
              <label className={af("rent_supplement")}>Complément de loyer (€/mois)<input type="number" min="0" value={form.rent_supplement} onChange={(e) => update("rent_supplement", e.target.value)} placeholder="0" /></label>
              <label className={af("energy_cost_annual")}>Énergie estimée (€/an)<input type="number" min="0" value={form.energy_cost_annual} onChange={(e) => update("energy_cost_annual", e.target.value)} placeholder="900" /></label>
            </div>
          )}
          <button type="submit" className="primary-button rental-submit" disabled={busy === "analyze"}>{busy === "analyze" ? "Analyse…" : "Analyser ce loyer"}</button>
        </form>

        {a && (
          <div id="rental-result" className={`rental-result rental-${a.overall}`}>
            <div className="rental-headline">
              <span className="rental-pill">{a.overall === "good" ? "Bon plan" : a.overall === "fair" ? "Correct" : a.overall === "warning" ? "Cher" : "À vérifier"}</span>
              <h2>{a.headline}</h2>
              {result?.location?.label && <p className="rental-location">{result.location.label}</p>}
            </div>
            <div className="metric-grid rental-metrics">
              <div className="metric"><span>Loyer charges comprises</span><strong>{euros(a.rent_cc)}</strong><small>{a.rent_cc_m2} €/m²{a.rent_cc_is_estimate ? " (charges inconnues)" : ""}</small></div>
              <div className="metric"><span>Loyer habituel du secteur</span><strong>{a.market ? euros(a.market.expected_rent_cc) : "—"}</strong><small>{a.market ? `${a.market.rent_m2.toFixed(1)} €/m² · ${a.market.commune ?? ""}` : "Pas de donnée pour cette commune"}</small></div>
              <div className="metric"><span>Écart au marché</span><strong>{a.diff_pct === null ? "—" : `${a.diff_pct > 0 ? "+" : ""}${a.diff_pct} %`}</strong><small>{a.market?.expected_low && a.market?.expected_high ? `Fourchette : ${euros(a.market.expected_low)} – ${euros(a.market.expected_high)}` : ""}</small></div>
              <div className="metric"><span>Coût mensuel total</span><strong>{euros(a.monthly_total)}</strong><small>{a.energy_monthly ? `dont énergie ≈ ${euros(a.energy_monthly)}` : "Loyer + charges"} · revenus conseillés : {euros(a.income_needed)}</small></div>
            </div>
            <ul className="rental-checks">
              {a.checks.map((c, i) => (
                <li key={i} className={`rental-check rental-check-${c.level}`}>
                  <strong>{c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✕"} {c.title}</strong>
                  <span>{c.detail}</span>
                </li>
              ))}
            </ul>
            {a.market && <p className="rental-source">Référence : {a.market.source} (loyers d'annonce charges comprises, logements vides).</p>}
          </div>
        )}
      </section>
    </main>
  );
}
