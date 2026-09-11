"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/analyze");
    });
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
    } else if (mode === "signup" && !result.data.session) {
      setMessage("Compte créé. Vérifie ton e-mail pour confirmer ton compte, puis connecte-toi.");
    } else {
      router.replace("/analyze");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <main className="page">
      <nav className="nav"><div className="brand"><span className="mark">B</span>Bricky</div><span className="navlink">Decision intelligence</span></nav>
      <section className="analysis-shell login-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · V1</span>
          <h1>Décidez avec les données du bien.</h1>
          <p className="sub">Connectez-vous pour lancer vos premières analyses immobilières.</p>
        </div>
        <form className="property-form auth-form" onSubmit={handleSubmit}>
          <label>E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" /></label>
          <label>Mot de passe<input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
          <button className="primary-button" disabled={loading}>{loading ? "Connexion…" : mode === "login" ? "Se connecter →" : "Créer mon compte →"}</button>
          {error && <div className="error-box">{error}</div>}
          {message && <div className="result-panel"><p>{message}</p></div>}
          <button type="button" className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>
            {mode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}
