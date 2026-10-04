"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { OnboardingQuestionnaire } from "../../components/OnboardingQuestionnaire";

// Page plein écran affichée une seule fois, immédiatement après la création d'un compte
// (voir app/login/page.tsx), avant d'entrer sur /properties. Si l'utilisateur arrive ici sans
// session (lien direct, retour arrière navigateur) ou a déjà répondu/passé le questionnaire,
// on redirige directement vers /properties plutôt que de le re-proposer.
export default function OnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/login"); return; }
      const { data: onboardingRow } = await supabase
        .from("user_onboarding_responses")
        .select("user_id")
        .eq("user_id", sessionData.session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (onboardingRow) { router.replace("/properties"); return; }
      setReady(true);
    }
    check();
    return () => { cancelled = true; };
  }, [router]);

  if (!ready) return null;

  return <OnboardingQuestionnaire onDone={() => router.replace("/properties")} />;
}
