"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
    } else {
      setMessage("Mot de passe mis a jour. Redirection...");
      setTimeout(() => {
        router.replace("/properties");
      }, 1500);
    }
    setLoading(false);
  }

  return (
    <main className="page">
      <nav className="nav"><div className="brand"><img src="/mascot-avatar-round.png" alt="" className="brand-avatar" /><span>Bricky</span></div><span className="navlink">Decision intelligence</span></nav>
      <section className="analysis-shell login-shell">
        <img src="/mascot-avatar-square.png" alt="" className="login-mascot" />
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · V1</span>
          <h1>Choisissez un nouveau mot de passe.</h1>
          <p className="sub">
            {ready
              ? "Definissez votre nouveau mot de passe ci-dessous."
              : "Ouvrez le lien recu par email pour continuer, ou connectez-vous si vous etes deja identifie."}
          </p>
        </div>
        {ready ? (
          <form className="property-form auth-form" onSubmit={handleSubmit}>
            <label>Nouveau mot de passe<input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
            <label>Confirmer le mot de passe<input required type="password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" /></label>
            <button className="primary-button" disabled={loading}>{loading ? "Enregistrement…" : "Enregistrer le nouveau mot de passe →"}</button>
            {error && <div className="error-box">{error}</div>}
            {message && <div className="result-panel"><p>{message}</p></div>}
          </form>
        ) : (
          <div className="property-form auth-form">
            <a className="primary-button" href="/login" style={{ textDecoration: "none", textAlign: "center" }}>Retour a la connexion</a>
          </div>
        )}
      </section>
    </main>
  );
}
