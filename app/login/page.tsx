"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { hasPendingImport } from "@/lib/brickyImport";
import { birthDateError, maxBirthDate, MIN_AGE } from "@/lib/age";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);

  // Après une connexion (e-mail, Google ou Apple) : questionnaire d'accueil si pas encore rempli,
  // sinon l'annonce en attente, sinon « Mes biens ».
  async function goAfterAuth(userId: string | undefined) {
    let destination = "/properties";
    if (userId) {
      const { data: onboardingRow } = await supabase
        .from("user_onboarding_responses")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!onboardingRow) destination = "/onboarding";
    }
    // Annonce envoyée par le bouton « Envoyer à Bricky » avant la connexion : on y retourne.
    if (destination === "/properties" && hasPendingImport()) destination = "/analyze";
    router.replace(destination);
    router.refresh();
  }

  useEffect(() => {
    // Au retour de Google / Apple, la session arrive dans l'URL : getSession la récupère.
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const oauthError = params.get("error_description") || hash.get("error_description");
    if (oauthError) setError("La connexion n'a pas abouti : " + oauthError.replace(/\+/g, " "));
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goAfterAuth(data.session.user.id);
    });
  }, []);

  async function handleOAuth(provider: "google" | "apple") {
    setError("");
    setMessage("");
    setOauthLoading(provider);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (oauthErr) {
      setOauthLoading(null);
      setError(
        /not enabled|unsupported provider/i.test(oauthErr.message)
          ? `La connexion avec ${provider === "google" ? "Google" : "Apple"} n'est pas encore activée. Utilise ton e-mail en attendant.`
          : oauthErr.message,
      );
    }
  }

  function switchMode(next: "login" | "signup") {
    if (mode === next) return;
    setMode(next);
    setError("");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signup") {
      const problem = birthDateError(birthDate);
      if (problem) {
        setError(problem);
        setLoading(false);
        return;
      }
    }

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { birth_date: birthDate, age_confirmed_at: new Date().toISOString() } } });

    if (result.error) {
      setError(result.error.message);
    } else if (mode === "signup" && !result.data.session) {
      setMessage("Compte créé. Vérifie ton e-mail pour confirmer ton compte, puis connecte-toi.");
    } else {
      await goAfterAuth(result.data.session?.user.id);
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Entre ton e-mail ci-dessus, puis clique sur \"Mot de passe oublie ?\".");
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage("Email de reinitialisation envoye a " + email + ". Verifie ta boite de reception.");
    }
    setLoading(false);
  }

  return (
    <main className="page">
      <nav className="nav"><div className="brand"><img src="/mascot-avatar-round.png" alt="" className="brand-avatar" /><span>Bricky</span></div><span className="navlink">Decision intelligence</span></nav>
      <section className="login-split">
        <div className="login-visual">
          <div className="login-visual-bricks" aria-hidden="true" />
          <div className="login-visual-content">
            <span className="eyebrow eyebrow-light">Bricky · V1</span>
            <img src="/mascot-avatar-square.png" alt="" className="login-mascot-big" />
            <h1 className="login-visual-title">Décidez avec les données du bien.</h1>
            <p className="sub login-visual-sub">Connectez-vous pour lancer vos premières analyses immobilières.</p>
          </div>
        </div>
        <div className="login-form-panel">
          <div className="login-form-inner">
            <div className="login-tabs">
              <button type="button" className={mode === "login" ? "login-tab login-tab-active" : "login-tab"} onClick={() => switchMode("login")}>
                Se connecter
              </button>
              <button type="button" className={mode === "signup" ? "login-tab login-tab-active" : "login-tab"} onClick={() => switchMode("signup")}>
                Créer un compte
              </button>
            </div>
            <div className="auth-social">
              <button type="button" className="auth-social-btn" onClick={() => handleOAuth("google")} disabled={oauthLoading !== null}>
                <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
                </svg>
                <span>{oauthLoading === "google" ? "Redirection…" : mode === "signup" ? "S'inscrire avec Google" : "Continuer avec Google"}</span>
              </button>
              <button type="button" className="auth-social-btn" onClick={() => handleOAuth("apple")} disabled={oauthLoading !== null}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                  <path d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z" />
                </svg>
                <span>{oauthLoading === "apple" ? "Redirection…" : mode === "signup" ? "S'inscrire avec Apple" : "Continuer avec Apple"}</span>
              </button>
              <div className="auth-divider"><span>{mode === "signup" ? "ou inscris-toi avec ton e-mail" : "ou avec ton e-mail"}</span></div>
            </div>
            <form className="property-form auth-form" onSubmit={handleSubmit}>
              <label>E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" /></label>
              <label>Mot de passe<input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
              {mode === "signup" && (
                <label>Date de naissance<input required type="date" max={maxBirthDate()} min="1900-01-01" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /><small className="auth-hint">Bricky est réservé aux personnes de {MIN_AGE} ans et plus.</small></label>
              )}
              {mode === "login" && (
                <button type="button" className="auth-switch auth-forgot" onClick={handleForgotPassword} disabled={loading}>
                  Mot de passe oublié ?
                </button>
              )}
              <button className="primary-button" disabled={loading}>{loading ? "Connexion…" : mode === "login" ? "Se connecter →" : "Créer mon compte →"}</button>
              {error && <div className="error-box">{error}</div>}
              {message && <div className="result-panel"><p>{message}</p></div>}
            </form>
            <p className="login-form-footnote">
              {mode === "login" ? (
                <>Pas encore de compte ? <button type="button" className="login-inline-link" onClick={() => switchMode("signup")}>Créer un compte</button></>
              ) : (
                <>Déjà un compte ? <button type="button" className="login-inline-link" onClick={() => switchMode("login")}>Se connecter</button></>
              )}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
