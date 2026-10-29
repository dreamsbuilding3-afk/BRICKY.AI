"use client";

// 4 tours complets de 0 à 9 : la roulette tourne avant de se poser sur le bon chiffre.
const REEL_DIGITS = Array.from({ length: 40 }, (_, i) => i % 10);

// Rouleau façon machine à sous : chaque chiffre tourne puis s'arrête, l'un après l'autre.
function Reel({ digit, index }: { digit: number; index: number }) {
  return (
    <span className="fig-cell" aria-hidden="true">
      <span
        className="fig-reel"
        style={{ ["--d" as any]: digit, ["--delay" as any]: `${index * 160}ms`, ["--dur" as any]: `${1.6 + index * 0.35}s` }}
      >
        {REEL_DIGITS.map((n, i) => <span key={i}>{n}</span>)}
      </span>
    </span>
  );
}

// « Bricky en chiffres » : bandeau sobre, pleine largeur, aux couleurs de Bricky.
export function AnalysesCounter({ value }: { value: number }) {
  const n = Math.max(0, Math.floor(value));
  const str = n.toLocaleString("fr-FR").replace(/ | /g, " ");
  let digitIndex = 0;
  return (
    <section className="fig-card" key={str}>
      <div className="fig-main">
        <span className="fig-eyebrow">Bricky en chiffres</span>
        <div className="fig-figure" role="img" aria-label={`${n} ${n > 1 ? "analyses réalisées" : "analyse réalisée"} sur la plateforme`}>
          <span className="fig-number">
            {str.split("").map((ch, i) => (/\d/.test(ch) ? <Reel key={i} digit={Number(ch)} index={digitIndex++} /> : <span key={i} className="fig-sep"> </span>))}
          </span>
          <span className="fig-unit">{n > 1 ? "analyses réalisées" : "analyse réalisée"}</span>
        </div>
      </div>
      <p className="fig-note">sur la plateforme, et chaque nouvelle analyse rend Bricky plus précis.</p>
    </section>
  );
}
