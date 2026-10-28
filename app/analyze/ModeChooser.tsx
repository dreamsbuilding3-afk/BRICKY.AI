"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { guessTransactionType, peekPendingImport } from "../../lib/brickyImport";

// Premier écran de « Nouvelle analyse » : on choisit simplement entre acheter et
// louer. Si une annonce arrive du bouton « Envoyer à Bricky », on devine le type
// et on passe directement au bon écran.
export function ModeChooser() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [importReceived, setImportReceived] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setUserEmail(data.session.user.email ?? "");
    });
    const imported = peekPendingImport();
    if (imported) {
      const guess = guessTransactionType(imported.url, imported.text);
      if (guess) router.replace(`/analyze?mode=${guess}`);
      else setImportReceived(true);
    }
  }, [router]);

  return (
    <main className="page">
      <AppNav email={userEmail} active="analyze" />
      <section className="analysis-shell mode-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky</span>
          <h1>Que veux-tu analyser ?</h1>
          <p className="sub">
            {importReceived ? "Annonce bien reçue. Dis-nous juste s'il s'agit d'un achat ou d'une location." : "Choisis, colle ton annonce, Bricky s'occupe du reste."}
          </p>
        </div>
        <div className="mode-grid">
          <a className="mode-card" href="/analyze?mode=achat">
            <span className="mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>
            </span>
            <span className="mode-title">Acheter un bien</span>
            <span className="mode-desc">Est-ce un bon investissement ? Prix du marché, rendement, cash-flow.</span>
            <span className="mode-cta">Analyser un achat →</span>
          </a>
          <a className="mode-card" href="/analyze?mode=location">
            <span className="mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7" /><path d="m16 7 2.5 2.5" /><path d="m14 9 2 2" /></svg>
            </span>
            <span className="mode-title">Louer un logement</span>
            <span className="mode-desc">Le loyer est-il juste ? Prix du secteur, DPE, dépôt, frais d'agence autorisés.</span>
            <span className="mode-cta">Analyser une location →</span>
          </a>
        </div>
      </section>
    </main>
  );
}
