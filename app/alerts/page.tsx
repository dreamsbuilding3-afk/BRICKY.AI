"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";

type AlertCriteria = {
  id: string;
  label: string | null;
  city: string | null;
  max_price: number | null;
  min_surface_m2: number | null;
  min_yield_pct: number | null;
  active: boolean;
  created_at: string;
};

type AlertMatch = {
  alert_id: string;
  alert_label: string | null;
  property_id: string;
  title: string | null;
  city: string | null;
  price: number | null;
  surface_m2: number | null;
  gross_yield_pct: number | null;
  created_at: string;
};

export default function AlertsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [canSetAlerts, setCanSetAlerts] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(true);
  const [alerts, setAlerts] = useState<AlertCriteria[]>([]);
  const [matches, setMatches] = useState<AlertMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ label: "", city: "", max_price: "", min_surface_m2: "", min_yield_pct: "" });

  async function refreshAlerts() {
    const { data } = await supabase.from("alert_criteria").select("*").order("created_at", { ascending: false });
    setAlerts((data as AlertCriteria[]) || []);
  }

  async function refreshMatches() {
    const { data, error: rpcError } = await supabase.rpc("check_alert_matches");
    if (!rpcError) setMatches((data as AlertMatch[]) || []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/login"); return; }
      if (cancelled) return;
      setUserEmail(sessionData.session.user.email ?? "");

      const { data: sub } = await supabase.rpc("get_my_subscription");
      const allowed = Boolean(sub && typeof sub === "object" && "can_set_alerts" in sub && (sub as { can_set_alerts: boolean }).can_set_alerts);
      if (cancelled) return;
      setCanSetAlerts(allowed);
      setCheckingPlan(false);

      if (allowed) {
        await refreshAlerts();
        await refreshMatches();
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("create_alert_criteria", {
        p_label: form.label,
        p_city: form.city,
        p_max_price: form.max_price ? Number(form.max_price) : null,
        p_min_surface_m2: form.min_surface_m2 ? Number(form.min_surface_m2) : null,
        p_min_yield_pct: form.min_yield_pct ? Number(form.min_yield_pct) : null,
      });
      if (rpcError) throw rpcError;
      setForm({ label: "", city: "", max_price: "", min_surface_m2: "", min_yield_pct: "" });
      await refreshAlerts();
      await refreshMatches();
    } catch (err: any) {
      const message = err?.message || "";
      if (message.includes("alerts_not_included_in_plan")) setError("Les alertes sont disponibles à partir du palier Pro.");
      else if (message.includes("alert_limit_reached")) setError("Vous avez atteint la limite de 20 alertes.");
      else setError("Impossible de créer cette alerte.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(alert: AlertCriteria) {
    setAlerts((current) => current.map((a) => (a.id === alert.id ? { ...a, active: !a.active } : a)));
    await supabase.from("alert_criteria").update({ active: !alert.active }).eq("id", alert.id);
  }

  async function removeAlert(id: string) {
    setAlerts((current) => current.filter((a) => a.id !== id));
    await supabase.from("alert_criteria").delete().eq("id", id);
  }

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <main className="page">
      <AppNav email={userEmail} active="alerts" />
      <section className="analysis-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · Alertes</span>
          <h1>Nouvelles annonces à surveiller</h1>
          <p className="sub">Bricky vous prévient dès qu&apos;un bien analysé sur la plateforme correspond à vos critères.</p>
        </div>

        {checkingPlan && <div className="extract-note">Vérification de votre abonnement…</div>}

        {!checkingPlan && !canSetAlerts && (
          <div className="result-panel" style={{ textAlign: "center" }}>
            <span className="eyebrow">Fonctionnalité Pro</span>
            <h2 style={{ margin: "14px 0 8px" }}>Les alertes sont réservées au palier Pro</h2>
            <p className="empty-note" style={{ maxWidth: 480, margin: "0 auto 28px" }}>Passez au palier Pro pour être averti automatiquement des nouveaux biens correspondant à vos critères (ville, budget, surface, rendement).</p>
            <a href="/pricing" className="primary-button" style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 54 }}>Voir les abonnements →</a>
          </div>
        )}

        {!checkingPlan && canSetAlerts && (
          <>
            <form className="property-form" onSubmit={handleCreate}>
              <div className="form-grid">
                <label>Nom de l&apos;alerte<input value={form.label} onChange={(e) => update("label", e.target.value)} placeholder="Ex : T3 Fort-de-France" /></label>
                <label>Ville<input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Fort-de-France" /></label>
                <label>Prix maximum (€)<input type="number" min="0" value={form.max_price} onChange={(e) => update("max_price", e.target.value)} placeholder="250000" /></label>
                <label>Surface minimum (m²)<input type="number" min="0" value={form.min_surface_m2} onChange={(e) => update("min_surface_m2", e.target.value)} placeholder="40" /></label>
                <label>Rendement brut minimum (%)<input type="number" min="0" step="0.1" value={form.min_yield_pct} onChange={(e) => update("min_yield_pct", e.target.value)} placeholder="6" /></label>
              </div>
              <button className="primary-button" disabled={creating}>{creating ? "Création…" : "Créer cette alerte →"}</button>
              {error && <div className="error-box">{error}</div>}
            </form>

            {loading && <div className="extract-note">Chargement de vos alertes…</div>}

            {!loading && alerts.length > 0 && (
              <div className="dashboard-section">
                <h3>Vos alertes ({alerts.length})</h3>
                <div className="checklist-list">
                  {alerts.map((alert) => (
                    <div className="checklist-item" key={alert.id} style={{ cursor: "default" }}>
                      <input type="checkbox" checked={alert.active} onChange={() => toggleActive(alert)} />
                      <div style={{ flex: 1 }}>
                        <b>{alert.label || "Alerte sans nom"}</b>
                        <p>
                          {[alert.city ? `Ville : ${alert.city}` : null, alert.max_price != null ? `≤ ${alert.max_price.toLocaleString("fr-FR")} €` : null, alert.min_surface_m2 != null ? `≥ ${alert.min_surface_m2} m²` : null, alert.min_yield_pct != null ? `rendement ≥ ${alert.min_yield_pct} %` : null].filter(Boolean).join(" · ") || "Tous les biens"}
                        </p>
                      </div>
                      <button type="button" className="secondary-button" onClick={() => removeAlert(alert.id)}>Supprimer</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && alerts.length === 0 && (
              <p className="empty-note" style={{ marginTop: 24 }}>Vous n&apos;avez pas encore d&apos;alerte. Créez-en une ci-dessus pour être prévenu des nouveaux biens correspondants.</p>
            )}

            {!loading && matches.length > 0 && (
              <div className="dashboard-section">
                <h3>Nouveaux biens correspondants ({matches.length})</h3>
                <div className="properties-list">
                  {matches.map((match) => (
                    <a key={match.alert_id + match.property_id} href={"/analyze?property_id=" + match.property_id} className="property-row">
                      <div>
                        <b>{match.title || "Bien sans titre"}</b>
                        <span>Alerte : {match.alert_label || "Sans nom"}{match.city ? ` · ${match.city}` : ""}</span>
                      </div>
                      <div className="property-row-metrics">
                        {match.price != null && <span>{match.price.toLocaleString("fr-FR")} €</span>}
                        {match.surface_m2 != null && <span>{match.surface_m2} m²</span>}
                        {match.gross_yield_pct != null && <span>Rendement {match.gross_yield_pct.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %</span>}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!loading && matches.length === 0 && alerts.length > 0 && (
              <p className="empty-note" style={{ marginTop: 24 }}>Aucun nouveau bien ne correspond à vos critères pour le moment. Bricky vérifie parmi tous les biens analysés récemment sur la plateforme.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
