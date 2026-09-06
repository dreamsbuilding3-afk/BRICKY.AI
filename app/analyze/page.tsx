type SearchParams = Promise<{ url?: string }>;

export default async function AnalyzePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const url = params.url ?? "";

  return (
    <main className="page">
      <nav className="nav"><div className="brand"><span className="mark">B</span>Bricky</div><span className="navlink">Analyse</span></nav>
      <section className="hero" style={{ paddingTop: 80 }}>
        <span className="eyebrow">Analysis workspace</span>
        <h1 style={{ fontSize: "clamp(42px, 6vw, 72px)" }}>Votre enquête commence ici.</h1>
        <p className="sub">La fondation est en place. Le prochain moteur transformera cette URL en dossier de due diligence.</p>
        <div className="analyzer">
          <input value={url} readOnly aria-label="URL analysée" placeholder="URL de l'annonce" />
          <button type="button">Lancer l’analyse</button>
        </div>
        <div className="proof">V1 · ingestion → données → risques → décision → actions</div>
      </section>
    </main>
  );
}
