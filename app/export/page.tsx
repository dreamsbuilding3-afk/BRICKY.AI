"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";

type ApiKeyRow = {
  id: string;
  label: string | null;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => escape(row[c])).join(","));
  return lines.join("\n");
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [canExport, setCanExport] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(true);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  async function refreshKeys() {
    const { data } = await supabase
      .from("api_keys")
      .select("id, label, key_prefix, created_at, last_used_at, revoked")
      .order("created_at", { ascending: false });
    setKeys((data as ApiKeyRow[]) || []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }
      if (cancelled) return;
      setUserEmail(sessionData.session.user.email ?? "");

      const { data: sub } = await supabase.rpc("get_my_subscription");
      const allowed = Boolean(
        sub && typeof sub === "object" && "api_export" in sub && (sub as { api_export: boolean }).api_export,
      );
      if (cancelled) return;
      setCanExport(allowed);
      setCheckingPlan(false);

      if (allowed) await refreshKeys();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleCreateKey(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setNewKey(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("create_api_key", { p_label: label });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      setNewKey(row?.raw_key || null);
      setLabel("");
      await refreshKeys();
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("api_export_not_included_in_plan")) setError("L'export API est réservé à l'offre Agence.");
      else if (msg.includes("api_key_limit_reached")) setError("Vous avez atteint la limite de 10 clés API.");
      else setError("Impossible de créer cette clé API.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setKeys((current) => current.map((k) => (k.id === id ? { ...k, revoked: true } : k)));
    await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
  }

  async function handleDelete(id: string) {
    setKeys((current) => current.filter((k) => k.id !== id));
    await supabase.from("api_keys").delete().eq("id", id);
  }

  async function handleExport(resource: "properties" | "analyses", format: "csv" | "json") {
    setExporting(`${resource}-${format}`);
    try {
      if (resource === "properties") {
        const { data } = await supabase
          .from("properties")
          .select("id, title, address, postal_code, city, property_type, price, surface_m2, rooms, bedrooms, created_at")
          .order("created_at", { ascending: false });
        const rows = data || [];
        if (format === "csv") download("bricky-properties.csv", toCsv(rows), "text/csv;charset=utf-8");
        else download("bricky-properties.json", JSON.stringify(rows, null, 2), "application/json");
      } else {
        const { data } = await supabase
          .from("analyses")
          .select("id, property_id, status, verdict, overall_score, confidence_score, financial_snapshot, created_at, completed_at")
          .order("created_at", { ascending: false });
        const rows = data || [];
        if (format === "csv") download("bricky-analyses.csv", toCsv(rows), "text/csv;charset=utf-8");
        else download("bricky-analyses.json", JSON.stringify(rows, null, 2), "application/json");
      }
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="page">
      <AppNav email={userEmail} active="export" />
      <section className="analysis-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · Export</span>
          <h1>Export API &amp; CSV</h1>
          <p className="sub">Exportez votre portefeuille et vos analyses, ou connectez Bricky à vos propres outils via l&apos;API.</p>
        </div>

        {checkingPlan && <div className="extract-note">Vérification de votre abonnement…</div>}

        {!checkingPlan && !canExport && (
          <div className="result-panel" style={{ textAlign: "center" }}>
            <span className="eyebrow">Fonctionnalité Agence</span>
            <h2 style={{ margin: "14px 0 8px" }}>L&apos;export API/CSV est réservé au palier Agence</h2>
            <p className="empty-note" style={{ maxWidth: 480, margin: "0 auto 28px" }}>
              Passez au palier Agence pour exporter vos données et connecter Bricky à vos propres outils.
            </p>
            <a
              href="/pricing"
              className="primary-button"
              style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 54 }}
            >
              Voir les abonnements →
            </a>
          </div>
        )}

        {!checkingPlan && canExport && (
          <>
            <div className="dashboard-section">
              <h3>Export rapide</h3>
              <p className="empty-note" style={{ marginBottom: 16 }}>Téléchargez immédiatement vos biens ou vos analyses depuis votre compte.</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button type="button" className="secondary-button" disabled={exporting !== null} onClick={() => handleExport("properties", "csv")}>
                  {exporting === "properties-csv" ? "Export…" : "Biens → CSV"}
                </button>
                <button type="button" className="secondary-button" disabled={exporting !== null} onClick={() => handleExport("properties", "json")}>
                  {exporting === "properties-json" ? "Export…" : "Biens → JSON"}
                </button>
                <button type="button" className="secondary-button" disabled={exporting !== null} onClick={() => handleExport("analyses", "csv")}>
                  {exporting === "analyses-csv" ? "Export…" : "Analyses → CSV"}
                </button>
                <button type="button" className="secondary-button" disabled={exporting !== null} onClick={() => handleExport("analyses", "json")}>
                  {exporting === "analyses-json" ? "Export…" : "Analyses → JSON"}
                </button>
              </div>
            </div>

            <div className="dashboard-section">
              <h3>Clés API</h3>
              <p className="empty-note" style={{ marginBottom: 16 }}>
                Utilisez une clé API pour récupérer vos données depuis vos propres scripts :{" "}
                <code>GET https://bricky-ai-three.vercel.app/api/v1/export?resource=properties&amp;format=csv</code> avec l&apos;en-tête{" "}
                <code>Authorization: Bearer &lt;clé&gt;</code>.
              </p>

              <form className="property-form" onSubmit={handleCreateKey}>
                <div className="form-grid">
                  <label>
                    Nom de la clé (optionnel)
                    <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex : Intégration comptabilité" />
                  </label>
                </div>
                <button className="primary-button" disabled={creating}>
                  {creating ? "Création…" : "Générer une clé API →"}
                </button>
                {error && <div className="error-box">{error}</div>}
              </form>

              {newKey && (
                <div className="result-panel" style={{ marginTop: 16 }}>
                  <p style={{ fontWeight: 600, marginBottom: 8 }}>Votre nouvelle clé API (copiez-la, elle ne sera plus affichée) :</p>
                  <code style={{ display: "block", wordBreak: "break-all", padding: 12, background: "rgba(0,0,0,0.06)", borderRadius: 8 }}>{newKey}</code>
                </div>
              )}

              {loading && <div className="extract-note">Chargement de vos clés…</div>}

              {!loading && keys.length > 0 && (
                <div className="checklist-list" style={{ marginTop: 16 }}>
                  {keys.map((k) => (
                    <div className="checklist-item" key={k.id} style={{ cursor: "default" }}>
                      <div style={{ flex: 1 }}>
                        <b>{k.label || "Clé sans nom"}</b>
                        <p>
                          {k.key_prefix}… ·{" "}
                          {k.revoked ? "Révoquée" : k.last_used_at ? `Utilisée le ${new Date(k.last_used_at).toLocaleDateString("fr-FR")}` : "Jamais utilisée"}
                        </p>
                      </div>
                      {!k.revoked && (
                        <button type="button" className="secondary-button" onClick={() => handleRevoke(k.id)}>
                          Révoquer
                        </button>
                      )}
                      <button type="button" className="secondary-button" onClick={() => handleDelete(k.id)}>
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!loading && keys.length === 0 && (
                <p className="empty-note" style={{ marginTop: 24 }}>Aucune clé API pour le moment.</p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
