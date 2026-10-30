"use client";

import { useLocale } from "./LocaleProvider";

// Noms écrits en texte (pas de logos officiels) : on montre qu'on lit ces annonces,
// sans laisser croire à un partenariat.
const ROW_1 = ["Leboncoin", "SeLoger", "PAP", "Bien'ici", "Logic-Immo", "Figaro Immobilier", "Green-Acres", "Immobilier Notaires"];
const ROW_2 = ["Orpi", "Century 21", "Laforêt", "Guy Hoquet", "Foncia", "Nestenn", "IAD", "sources.pdf", "sources.screenshot"];

function Track({ items, reverse }: { items: string[]; reverse?: boolean }) {
  const { t } = useLocale();
  const label = (s: string) => (s.startsWith("sources.") ? t(s) : s);
  const row = items.map((s, i) => (
    <span key={i} className={"lm-item" + (s.startsWith("sources.") ? " lm-item-file" : "")}>
      {s === "sources.pdf" && (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg>
      )}
      {s === "sources.screenshot" && (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
      )}
      {label(s)}
    </span>
  ));
  return (
    <div className={"lm-track" + (reverse ? " lm-track-reverse" : "")}>
      <div className="lm-group">{row}</div>
      <div className="lm-group" aria-hidden="true">{row}</div>
    </div>
  );
}

export function SourcesMarquee() {
  const { t } = useLocale();
  return (
    <section className="lm-section" aria-label={t("sources.title")}>
      <p className="lm-title">{t("sources.title")}</p>
      <div className="lm-rows">
        <Track items={[...ROW_1, ...ROW_2]} />
      </div>
    </section>
  );
}
