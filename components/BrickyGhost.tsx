// Mascotte fantôme orange de Bricky qui flotte en arrière-plan (version mobile
// uniquement, voir .bricky-ghost dans globals.css). Purement décorative.
export function BrickyGhost() {
  return (
    <div className="bricky-ghost" aria-hidden="true">
      <div className="bricky-ghost-face">
        <img src="/mascot-icon.png" alt="" width={271} height={271} draggable={false} />
      </div>
    </div>
  );
}
