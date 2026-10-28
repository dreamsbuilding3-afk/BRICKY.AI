"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase/client";
import { birthDateError, maxBirthDate, MIN_AGE } from "../lib/age";

// Date de naissance obligatoire : demandée à l'inscription, et ici aux comptes
// existants qui ne l'ont pas encore donnée (fenêtre bloquante sur toutes les
// pages connectées, affichée via la barre de navigation).
export function AgeGate() {
  const router = useRouter();
  const [needed, setNeeded] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user && !user.user_metadata?.birth_date) setNeeded(true);
    });
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = birthDateError(birthDate);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ data: { birth_date: birthDate, age_confirmed_at: new Date().toISOString() } });
    setSaving(false);
    if (updateError) setError(updateError.message);
    else setNeeded(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!needed) return null;

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <form className="age-gate-card" onSubmit={handleSubmit}>
        <img src="/mascot-avatar-round.png" alt="" className="age-gate-mascot" />
        <h2 id="age-gate-title">Une dernière info</h2>
        <p>Bricky est réservé aux personnes de {MIN_AGE} ans et plus. Indique ta date de naissance pour continuer.</p>
        <label>
          Date de naissance
          <input required type="date" max={maxBirthDate()} min="1900-01-01" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Continuer →"}</button>
        <button type="button" className="age-gate-logout" onClick={logout}>Se déconnecter</button>
      </form>
    </div>
  );
}
