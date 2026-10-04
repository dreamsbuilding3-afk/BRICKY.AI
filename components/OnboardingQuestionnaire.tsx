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

type StepKey = "profile" | "goal" | "stage" | "discovery";

const STEPS: {
  key: StepKey;
  title: string;
  sub: string;
  options: string[];
}[] = [
  {
    key: "profile",
    title: "Quel est votre profil ?",
    sub: "Pour adapter le niveau de détail de vos analyses.",
    options: PROFILE_OPTIONS,
  },
  {
    key: "goal",
    title: "Quel est votre objectif principal avec Bricky ?",
    sub: "Nous mettrons en avant ce qui compte le plus pour vous.",
    options: GOAL_OPTIONS,
  },
  {
    key: "stage",
    title: "Où en êtes-vous dans votre projet ?",
    sub: "Pour vous proposer les bonnes étapes au bon moment.",
    options: STAGE_OPTIONS,
  },
  {
    key: "discovery",
    title: "Comment avez-vous découvert Bricky ?",
    sub: "Cela nous aide à savoir ce qui fonctionne et à nous améliorer.",
    options: DISCOVERY_OPTIONS,
  },
];

// Questionnaire d'onboarding en 4 étapes, en plein écran, affiché une seule fois juste après la
// création d'un compte (voir app/onboarding/page.tsx). Capture le profil et le besoin de
// l'utilisateur (segmentation produit) ainsi que le canal de découverte (attribution marketing à
// coût nul) — jamais bloquant : "Passer" toujours visible, aucune question n'empêche d'utiliser l'app.
export function OnboardingQuestionnaire({ onDone }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<StepKey, string | null>>({
    profile: null,
    goal: null,
    stage: null,
    discovery: null,
  });
  const [discoveryDetail, setDiscoveryDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const currentAnswer = answers[step.key];
  const canContinue = Boolean(currentAnswer);

  function selectOption(key: StepKey, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function goBack() {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }

  function goNext() {
    if (!canContinue) return;
    if (!isLastStep) {
      setStepIndex((i) => i + 1);
      return;
    }
    persist(false);
  }

  async function persist(skipped: boolean) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) { onDone(); return; }
      const { error } = await supabase.from("user_onboarding_responses").upsert({
        user_id: userId,
        profile_type: skipped ? null : answers.profile,
        main_goal: skipped ? null : answers.goal,
        project_stage: skipped ? null : answers.stage,
        discovery_channel: skipped ? null : answers.discovery,
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

  return (
    <div className="onb-screen">
      <div className="onb-topbar">
        <div className="onb-brand"><img src="/mascot-avatar-round.png" alt="" /><span>Bricky</span></div>
        <button type="button" className="onb-skip" onClick={() => persist(true)} disabled={submitting}>
          Passer pour l'instant
        </button>
      </div>

      <div className="onb-progress">
        {STEPS.map((s, i) => (
          <span key={s.key} className={"onb-progress-seg" + (i <= stepIndex ? " onb-progress-seg-done" : "")} />
        ))}
      </div>

      <div className="onb-main">
        <span className="onb-step-label">Étape {stepIndex + 1} sur {STEPS.length}</span>
        <h1 className="onb-title">{step.title}</h1>
        <p className="onb-sub">{step.sub}</p>

        <div className="onb-options">
          {step.options.map((opt) => {
            const selected = currentAnswer === opt;
            return (
              <button
                key={opt}
                type="button"
                className={"onb-option" + (selected ? " onb-option-selected" : "")}
                onClick={() => selectOption(step.key, opt)}
                disabled={submitting}
              >
                <span>{opt}</span>
                <span className="onb-option-check" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        {step.key === "discovery" && currentAnswer && DISCOVERY_NEEDS_DETAIL.has(currentAnswer) && (
          <input
            className="onb-detail-input"
            type="text"
            placeholder={currentAnswer === "Réseau social" ? "Lequel ? (Instagram, TikTok, LinkedIn...)" : "Précisez..."}
            value={discoveryDetail}
            onChange={(e) => setDiscoveryDetail(e.target.value)}
            disabled={submitting}
          />
        )}

        {submitError && <p className="error-box" style={{ marginTop: 20 }}>{submitError}</p>}
      </div>

      <div className="onb-footer">
        <button type="button" className="onb-back" onClick={goBack} style={{ visibility: stepIndex === 0 ? "hidden" : "visible" }}>
          ← Retour
        </button>
        <button
          type="button"
          className="primary-button onb-continue"
          disabled={!canContinue || submitting}
          onClick={goNext}
        >
          {submitting ? "Enregistrement…" : isLastStep ? "Terminer →" : "Continuer →"}
        </button>
      </div>
    </div>
  );
}
