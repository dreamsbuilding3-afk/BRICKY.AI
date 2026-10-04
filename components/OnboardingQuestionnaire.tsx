"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase/client";

type Props = {
  onDone: () => void;
};

const PROFILE_OPTIONS = [
  "Primo-investisseur",
  "Investisseur expérimenté",
  "Achat de ma résidence principale",
  "Professionnel de l'immobilier (agent, gestionnaire...)",
];

const GOAL_OPTIONS = [
  "Évaluer rapidement un bien avant d'acheter",
  "Optimiser le rendement locatif",
  "Sécuriser mon investissement, éviter les pièges",
  "Comparer plusieurs biens entre eux",
];

const STAGE_OPTIONS = [
  "Je cherche encore un bien",
  "J'ai une offre ou un compromis en cours",
  "Je viens d'acheter",
  "Je gère déjà un ou plusieurs biens",
];

const DISCOVERY_OPTIONS = [
  "Recherche Google / web",
  "Réseau social",
  "Recommandation d'un proche",
  "Agence ou professionnel de l'immobilier",
  "Autre",
];

const DISCOVERY_NEEDS_DETAIL = new Set(["Réseau social", "Autre"]);

// Questionnaire d'onboarding en 4 questions, affiché une seule fois (tant qu'aucune ligne
// n'existe dans user_onboarding_responses pour l'utilisateur). Capture le profil et le besoin
// de l'utilisateur (segmentation produit) ainsi que le canal de découverte (attribution marketing
// à coût nul) — jamais bloquant : toujours "Passer pour l'instant" visible, jamais de question
// obligatoire pour continuer à utiliser l'app.
export function OnboardingQuestionnaire({ onDone }: Props) {
  const [profileType, setProfileType] = useState<string | null>(null);
  const [mainGoal, setMainGoal] = useState<string | null>(null);
  const [projectStage, setProjectStage] = useState<string | null>(null);
  const [discoveryChannel, setDiscoveryChannel] = useState<string | null>(null);
  const [discoveryDetail, setDiscoveryDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const complete = Boolean(profileType && mainGoal && projectStage && discoveryChannel);

  async function persist(skipped: boolean) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) { onDone(); return; }
      const { error } = await supabase.from("user_onboarding_responses").upsert({
        user_id: userId,
        profile_type: skipped ? null : profileType,
        main_goal: skipped ? null : mainGoal,
        project_stage: skipped ? null : projectStage,
        discovery_channel: skipped ? null : discoveryChannel,
        discovery_channel_detail: skipped ? null : (discoveryDetail.trim() || null),
        skipped,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        setSubmitError("Impossible d'enregistrer vos réponses pour le moment. Réessayez dans un instant.");
        setSubmitting(false);
        return;
      }
      onDone();
    } catch {
      setSubmitError("Impossible d'enregistrer vos réponses pour le moment. Réessayez dans un instant.");
      setSubmitting(false);
    }
  }

  function Choice({ value, selected, onSelect }: { value: string; selected: boolean; onSelect: () => void }) {
    return (
      <button
        type="button"
        className={"onboarding-choice" + (selected ? " onboarding-choice-selected" : "")}
        onClick={onSelect}
        disabled={submitting}
      >
        {value}
      </button>
    );
  }

  return (
    <div className="result-panel onboarding-questionnaire">
      <div className="result-head">
        <div>
          <span className="eyebrow">Bienvenue</span>
          <h2>Aidez Bricky à mieux vous accompagner</h2>
        </div>
      </div>
      <p className="empty-note" style={{ marginTop: 4 }}>
        4 questions rapides pour adapter Bricky à votre profil. Vous pouvez passer si vous préférez.
      </p>

      <div className="onboarding-question">
        <b>Quel est votre profil ?</b>
        <div className="onboarding-choice-group">
          {PROFILE_OPTIONS.map((opt) => (
            <Choice key={opt} value={opt} selected={profileType === opt} onSelect={() => setProfileType(opt)} />
          ))}
        </div>
      </div>

      <div className="onboarding-question">
        <b>Quel est votre objectif principal avec Bricky ?</b>
        <div className="onboarding-choice-group">
          {GOAL_OPTIONS.map((opt) => (
            <Choice key={opt} value={opt} selected={mainGoal === opt} onSelect={() => setMainGoal(opt)} />
          ))}
        </div>
      </div>

      <div className="onboarding-question">
        <b>Où en êtes-vous dans votre projet ?</b>
        <div className="onboarding-choice-group">
          {STAGE_OPTIONS.map((opt) => (
            <Choice key={opt} value={opt} selected={projectStage === opt} onSelect={() => setProjectStage(opt)} />
          ))}
        </div>
      </div>

      <div className="onboarding-question">
        <b>Comment avez-vous découvert Bricky ?</b>
        <div className="onboarding-choice-group">
          {DISCOVERY_OPTIONS.map((opt) => (
            <Choice key={opt} value={opt} selected={discoveryChannel === opt} onSelect={() => setDiscoveryChannel(opt)} />
          ))}
        </div>
        {discoveryChannel && DISCOVERY_NEEDS_DETAIL.has(discoveryChannel) && (
          <input
            className="onboarding-detail-input"
            type="text"
            placeholder={discoveryChannel === "Réseau social" ? "Lequel ? (Instagram, TikTok, LinkedIn...)" : "Précisez..."}
            value={discoveryDetail}
            onChange={(e) => setDiscoveryDetail(e.target.value)}
            disabled={submitting}
          />
        )}
      </div>

      {submitError && <p className="error-box">{submitError}</p>}

      <div className="onboarding-actions">
        <button type="button" className="navlink-logout" onClick={() => persist(true)} disabled={submitting}>
          Passer pour l'instant
        </button>
        <button
          type="button"
          className="primary-button"
          style={{ width: "auto", padding: "0 28px" }}
          disabled={!complete || submitting}
          onClick={() => persist(false)}
        >
          {submitting ? "Enregistrement…" : "Valider"}
        </button>
      </div>
    </div>
  );
}
