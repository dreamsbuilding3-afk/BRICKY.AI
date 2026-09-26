import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog — Bricky",
  description: "Guides clairs et sans jargon pour analyser un investissement locatif : rendement, cash-flow, risques, fiscalité, avant de signer.",
};

const posts = [
  {
    slug: "calcul-rentabilite-locative",
    title: "Comment calculer la rentabilité d'un investissement locatif",
    excerpt: "Rendement brut, rendement net, et pourquoi ces deux chiffres seuls ne suffisent pas à savoir si un bien est un bon investissement.",
  },
  {
    slug: "cash-flow-immobilier-negatif-positif",
    title: "Cash-flow immobilier : pourquoi c'est plus important que le rendement",
    excerpt: "Un bien peut afficher un excellent rendement et vous coûter de l'argent chaque mois. Voici comment calculer votre vrai cash-flow avant d'acheter.",
  },
];

export default function BlogIndexPage() {
  return (
    <main className="page">
      <nav className="nav">
        <Link href="/" className="brand">
          <img src="/mascot-avatar-round.png" alt="" className="brand-avatar" />
          <span>Bricky</span>
        </Link>
        <Link href="/analyze" className="nav-cta">Analyser un bien →</Link>
      </nav>
      <section className="analysis-shell blog-index">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · Guides</span>
          <h1>Le <span className="accent">blog</span> Bricky</h1>
          <p className="sub">Des guides clairs pour comprendre ce qui fait vraiment la qualité d'un investissement locatif, avant de signer.</p>
        </div>
        <div className="blog-list">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="card blog-list-item">
              <h2>{post.title}</h2>
              <p>{post.excerpt}</p>
              <span className="blog-read-more">Lire l'article →</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
