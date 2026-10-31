"use client";

import { FormEvent, KeyboardEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { SpaceTabs } from "../../components/SpaceTabs";
import { EMPTY_PROJECT, GOALS, PROJECT_TYPES, readProject, type SearchProject } from "../../lib/searchProject";
import "./projet.css";

export default function ProjetPage() {
  return <Suspense fallback={null}><Projet /></Suspense>;
}

// « Mon projet » : ce que l'utilisateur cherche. Bricky s'en sert pour repérer
// les bonnes affaires et préparer les alertes. Rien n'est obligatoire.
function Projet() {
  const router = useRouter();
  const fromOnboarding = useSearchParams().get("suite") === "1";
  const [email, setEmail] = useState("");
  const [project, setProject] = useState<SearchProject>(EMPTY_PROJECT);
  const [cityDraft, setCityDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) { router.replace("/login"); return; }
      setEmail(user.email ?? "");
      const existing = readProject(user.user_metadata);
      if (existing) setProject(existing);
    });
  }, [router]);

  const update = (patch: Partial<SearchProject>) => { setProject((p) => ({ ...p, ...patch })); setSaved(false); };

  function addCity(raw = cityDraft) {
    const city = raw.replace(/,/g, " ").trim();
    if (!city) return;
    if (project.cities.length >= 5 || project.cities.some((c) => c.toLowerCase() === city.toLowerCase())) { setCityDraft(""); return; }
    update({ cities: [...project.cities, city.charAt(0).toUpperCase() + city.slice(1)] });
    setCityDraft("");
  }
  function onCityKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addCity(); }
    else if (e.key === "Backspace" && !cityDraft && project.cities.length) update({ cities: project.cities.slice(0, -1) });
  }
  function toggleType(value: string) {
    update({ types: project.types.includes(value) ? project.types.filter((t) => t !== value) : [...project.types, value] });
  }
  const numberOrNull = (v: string) => { const n = Number(v.replace(/\s/g, "").replace(",", ".")); return v.trim() && Number.isFinite(n) && n > 0 ? n : null; };

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const toSave = { ...project, cities: cityDraft.trim() ? [...project.cities, cityDraft.trim()].slice(0, 5) : project.cities, updated_at: new Date().toISOString() };
    const { error: err } = await supabase.auth.updateUser({ data: { search_project: toSave } });
    setSaving(false);
    if (err) { setError("L'enregistrement n'a pas fonctionné. Réessaie dans un instant."); return; }
    setProject(toSave);
    setCityDraft("");
    setSaved(true);
    if (fromOnboarding) router.replace("/properties");
  }

  const invest = project.goal !== "home";

  return (
    <main className="page">
      <AppNav email={email} active="space" />
      <section className="analysis-shell">
        {!fromOnboarding && <SpaceTabs active="project" />}
        <div className="analysis-intro">
          <span className="eyebrow">Mon projet</span>
          <h1>Dis à Bricky <span className="accent">ce que tu cherches.</span></h1>
          <p className="sub">Il s'en sert pour repérer les bonnes affaires qui te correspondent et préparer tes alertes. Rien n'est obligatoire, tu peux le modifier quand tu veux.</p>
        </div>

        <form className="pj-card" onSubmit={save}>
          <div className="pj-field">
            <span className="pj-label">Ton objectif</span>
            <div className="pj-seg" role="radiogroup" aria-label="Ton objectif">
              {GOALS.map((g) => (
                <button key={g.value} type="button" role="radio" aria-checked={project.goal === g.value} className={project.goal === g.value ? "is-on" : ""} onClick={() => update({ goal: g.value })}>{g.label}</button>
              ))}
            </div>
          </div>

          <label className="pj-field">
            <span className="pj-label">Où cherches-tu ? <small>jusqu'à 5 villes</small></span>
            <span className="pj-tags">
              {project.cities.map((c) => (
                <span key={c} className="pj-tag">{c}<button type="button" aria-label={`Retirer ${c}`} onClick={() => update({ cities: project.cities.filter((x) => x !== c) })}>×</button></span>
              ))}
              <input value={cityDraft} onChange={(e) => setCityDraft(e.target.value)} onKeyDown={onCityKey} onBlur={() => addCity()} placeholder={project.cities.length ? "Ajouter une ville" : "Ex. Lille, Creil, Bordeaux"} maxLength={60} disabled={project.cities.length >= 5} />
            </span>
          </label>

          <div className="pj-row">
            <label className="pj-field">
              <span className="pj-label">Budget maximum</span>
              <span className="pj-input"><input inputMode="numeric" value={project.budget_max ? project.budget_max.toLocaleString("fr-FR") : ""} onChange={(e) => update({ budget_max: numberOrNull(e.target.value) })} placeholder="180 000" /><i>€</i></span>
            </label>
            <label className="pj-field">
              <span className="pj-label">Surface minimum <small>facultatif</small></span>
              <span className="pj-input"><input inputMode="numeric" value={project.surface_min ?? ""} onChange={(e) => update({ surface_min: numberOrNull(e.target.value) })} placeholder="30" /><i>m²</i></span>
            </label>
          </div>

          <div className="pj-field">
            <span className="pj-label">Type de bien <small>plusieurs choix possibles</small></span>
            <div className="pj-chips">
              {PROJECT_TYPES.map((t) => (
                <button key={t.value} type="button" aria-pressed={project.types.includes(t.value)} className={"pj-chip" + (project.types.includes(t.value) ? " is-on" : "")} onClick={() => toggleType(t.value)}>{t.label}</button>
              ))}
            </div>
          </div>

          {invest && (
            <label className="pj-field pj-half">
              <span className="pj-label">Rendement brut visé <small>facultatif</small></span>
              <span className="pj-input"><input inputMode="decimal" value={project.yield_target ?? ""} onChange={(e) => update({ yield_target: numberOrNull(e.target.value) })} placeholder="7" /><i>%</i></span>
            </label>
          )}

          {error && <div className="error-box">{error}</div>}
          <div className="pj-actions">
            <button className="pj-save" disabled={saving}>{saving ? "Enregistrement…" : saved ? "Projet enregistré ✓" : "Enregistrer mon projet"}</button>
            {fromOnboarding && <a className="pj-skip" href="/properties">Passer pour l'instant</a>}
            {saved && project.cities.length > 0 && process.env.NEXT_PUBLIC_RADAR_ENABLED === "1" && <a className="pj-skip" href="/radar">Voir mon radar →</a>}
          </div>
        </form>
      </section>
    </main>
  );
}
