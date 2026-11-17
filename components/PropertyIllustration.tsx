import { illustrationKind, ILLUSTRATION_LABELS } from "../lib/illustrations/propertyIllustrations";

// Vignette 3D réaliste du bien (immeuble, maison, villa…), choisie selon le
// type enregistré ou, à défaut, le titre de l'annonce. Images pré-rendues
// (moteur de l'île 3D : matériaux réalistes, herbe, arbres, ombres douces).
export function PropertyIllustration({ propertyType, title, className = "" }: { propertyType?: string | null; title?: string | null; className?: string }) {
  const kind = illustrationKind(propertyType, title);
  return (
    <div className={`property-thumb property-thumb-${kind} ${className}`.trim()} title={ILLUSTRATION_LABELS[kind]}>
      <img src={`/img/biens-3d/${kind}.webp`} alt={ILLUSTRATION_LABELS[kind]} width={336} height={264} loading="lazy" decoding="async" />
    </div>
  );
}
