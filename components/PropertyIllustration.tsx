import { illustrationKind, illustrationSvg, ILLUSTRATION_LABELS } from "../lib/illustrations/propertyIllustrations";

// Vignette 3D isométrique du bien (immeuble, maison, villa…), choisie selon le
// type enregistré ou, à défaut, le titre de l'annonce.
export function PropertyIllustration({ propertyType, title, className = "" }: { propertyType?: string | null; title?: string | null; className?: string }) {
  const kind = illustrationKind(propertyType, title);
  return (
    <div
      className={`property-thumb property-thumb-${kind} ${className}`.trim()}
      title={ILLUSTRATION_LABELS[kind]}
      // SVG statique généré par Bricky (aucune donnée utilisateur dedans).
      dangerouslySetInnerHTML={{ __html: illustrationSvg(kind) }}
    />
  );
}
