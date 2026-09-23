"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [whiteLabel, setWhiteLabel] = useState(false);
  const [branding, setBranding] = useState({ agency_name: "", agency_tagline: "", contact_email: "" });
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? null);
      setCreatedAt(data.session.user.created_at ?? null);

      const { data: sub } = await supabase.rpc("get_my_subscription");
      const allowed = Boolean(sub && typeof sub === "object" && "white_label" in sub && (sub as { white_label: boolean }).white_label);
      setWhiteLabel(allowed);

      if (allowed) {
        const { data: brandRow } = await supabase.from("agency_branding").select("*").maybeSingle();
        if (brandRow) {
          setBranding({
            agency_name: brandRow.agency_name || "",
            agency_tagline: brandRow.agency_tagline || "",
            contact_email: brandRow.contact_email || "",
          });
        }
      }

      setLoading(false);
    });
  }, [router]);

  async function handleResetPassword() {
    if (!email) return;
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setMessage("Erreur : " + error.message);
    } else {
      setMessage("Email de réinitialisation envoyé à " + email + ".");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleSaveBranding(event: FormEvent) {
    event.preventDefault();
    setSavingBranding(true);
    setBrandingMessage("");
    try {
      const { error } = await supabase.rpc("save_agency_branding", {
        p_agency_name: branding.agency_name,
        p_agency_tagline: branding.agency_tagline,
        p_contact_email: branding.contact_email,
      });
      if (error) throw error;
      setBrandingMessage("Marque blanche enregistrée. Vos prochains dossiers PDF utiliseront cette identité.");
    } catch {
      setBrandingMessage("Impossible d'enregistrer la marque blanche.");
    } finally {
      setSavingBranding(false);
    }
  }

  const updateBranding = (key: keyof typeof branding, value: string) => setBranding((current) => ({ ...current, [key]: value }));

  if (loading) {
    return null;
  }

  return (
    <main>
      <AppNav email={email} active="account" />
      <div className="account-page">
        <div className="account-card">
          <h1>Mon compte</h1>
          <div className="account-row">
            <span className="account-label">Email</span>
            <span className="account-value">{email}</span>
          </div>
          {createdAt && (
            <div className="account-row">
              <span className="account-label">Membre depuis</span>
              <span className="account-value">
                {new Date(createdAt).toLocaleDateString("fr-FR")}
              </span>
            </div>
          )}
          <div className="account-actions">
            <button type="button" className="secondary-button" onClick={handleResetPassword}>
              Réinitialiser le mot de passe
            </button>
            <a href="/pricing" className="secondary-button" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Gérer mon abonnement
            </a>
            <button type="button" className="secondary-button account-logout" onClick={handleLogout}>
              Se déconnecter
            </button>
          </div>
          {message ? <p className="account-message">{message}</p> : null}
        </div>

        {whiteLabel && (
          <div className="account-card" style={{ marginTop: 20 }}>
            <h1>Marque blanche (Agence)</h1>
            <p className="empty-note" style={{ marginBottom: 20 }}>Personnalisez l&apos;identité affichée sur les dossiers PDF envoyés à vos clients.</p>
            <form onSubmit={handleSaveBranding} className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <label>Nom de l&apos;agence<input value={branding.agency_name} onChange={(e) => updateBranding("agency_name", e.target.value)} placeholder="Immobilier Martinique Invest" /></label>
              <label>Accroche (optionnel)<input value={branding.agency_tagline} onChange={(e) => updateBranding("agency_tagline", e.target.value)} placeholder="Votre partenaire investissement locatif" /></label>
              <label>Email de contact<input type="email" value={branding.contact_email} onChange={(e) => updateBranding("contact_email", e.target.value)} placeholder="contact@monagence.fr" /></label>
              <button className="primary-button" style={{ marginTop: 12 }} disabled={savingBranding}>{savingBranding ? "Enregistrement…" : "Enregistrer la marque blanche →"}</button>
              {brandingMessage && <p className="account-message">{brandingMessage}</p>}
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
