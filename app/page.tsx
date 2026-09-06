export default function Home() {
  return (
    <main className="page">
      <nav className="nav">
        <div className="brand"><span className="mark">B</span>Bricky</div>
        <span className="navlink">Property due diligence</span>
      </nav>

      <section className="hero">
        <span className="eyebrow">Built for smarter property decisions</span>
        <h1>Know the deal before you make it.</h1>
        <p className="sub">
          Collez une annonce. Bricky croise les données du bien, le marché, les risques et les informations manquantes pour vous aider à décider quoi vérifier avant de vous engager.
        </p>

        <form className="analyzer" action="/analyze">
          <input name="url" placeholder="Collez l’URL d’une annonce immobilière…" aria-label="URL de l'annonce" />
          <button type="submit">Analyser le bien</button>
        </form>
        <div className="proof">Prix · comparables · rendement · risques · données manquantes · actions</div>
      </section>

      <section className="features">
        <article className="card"><h2>Ce qu’on sait</h2><p>Données de l’annonce et sources publiques structurées, avec leur niveau de confiance.</p></article>
        <article className="card"><h2>Ce qu’on ne sait pas</h2><p>Les informations critiques absentes sont identifiées au lieu d’être remplacées par des suppositions.</p></article>
        <article className="card"><h2>Ce qu’il faut faire</h2><p>Risques, questions à poser, documents à demander et prochaines vérifications avant une offre.</p></article>
      </section>

      <footer className="footer">Bricky · Property intelligence, built for decisions.</footer>
    </main>
  );
}
