/**
 * L'inspecteur Bricky qui jette un œil par-dessus une barre de saisie.
 * À placer comme enfant direct d'un conteneur en `position: relative`
 * (.analyzer, .url-import.has-mascot) : il se pose sur son bord haut.
 */
export function MascotPeek() {
  return (
    <img
      className="mascot-peek"
      src="/mascotte/inspecteur-peek.webp"
      alt=""
      aria-hidden="true"
      width={96}
      height={64}
      decoding="async"
      draggable={false}
    />
  );
}
