"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? null);
      setCreatedAt(data.session.user.created_at ?? null);
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
            <button type="button" className="secondary-button account-logout" onClick={handleLogout}>
              Se déconnecter
            </button>
          </div>
          {message ? <p className="account-message">{message}</p> : null}
        </div>
      </div>
    </main>
  );
}
