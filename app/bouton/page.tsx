"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { buildBookmarklet } from "../../lib/brickyImport";

// Page d'installation du bouton « Envoyer à Bricky » (favori / bookmarklet).
export default function BoutonPage() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const bookmarklet = buildBookmarklet(window.location.origin);
    setCode(bookmarklet);
    // React bloque les liens « javascript: » passés en props : on pose l'attribut à la main.
    linkRef.current?.setAttribute("href", bookmarklet);
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user.email ?? null));
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="page">
      <AppNav email={userEmail} active="analyze" />
      <section className="analysis-shell bouton-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · Bouton</span>
          <h1>Une annonce, un clic.</h1>
          <p className="sub">
            Sur Leboncoin, SeLoger, PAP ou n'importe quel site d'annonces, clique sur le bouton : Bricky lit l'annonce depuis ton
            navigateur et remplit l'analyse tout seul.
          </p>
        </div>

        <div className="bouton-card">
          <a
            ref={linkRef}
            className="bouton-bookmarklet"
            onClick={(e) => {
              e.preventDefault();
              alert("Ne clique pas ici : fais glisser ce bouton dans ta barre de favoris.");
            }}
            draggable
          >
            <img src="/mascot-avatar-round.png" alt="" />
            Envoyer à Bricky
          </a>
          <p className="bouton-hint">↑ Fais glisser ce bouton dans ta barre de favoris</p>
        </div>

        <div className="bouton-steps">
          <h2>Sur ordinateur (Chrome, Edge, Firefox, Safari)</h2>
          <ol>
            <li>
              Affiche la barre de favoris : <kbd>Ctrl</kbd> + <kbd>Maj</kbd> + <kbd>B</kbd> (sur Mac : <kbd>⌘</kbd> + <kbd>Maj</kbd> + <kbd>B</kbd>).
            </li>
            <li>Fais glisser le bouton noir ci-dessus dans la barre de favoris.</li>
            <li>Ouvre une annonce, attends qu'elle soit chargée, puis clique sur « Envoyer à Bricky » dans tes favoris.</li>
          </ol>

          <h2>Sur téléphone, ou si le glisser-déposer ne marche pas</h2>
          <ol>
            <li>Copie le code du bouton : <button type="button" className="secondary-button" onClick={copyCode} disabled={!code}>{copied ? "Copié ✓" : "Copier le code"}</button></li>
            <li>Ajoute n'importe quelle page en favori, puis modifie ce favori : nom « Envoyer à Bricky », et colle le code à la place de l'adresse (URL).</li>
            <li>Sur une annonce, tape « Envoyer à Bricky » dans la barre d'adresse et choisis le favori dans la liste.</li>
          </ol>

          <p className="bouton-privacy">
            Le bouton ne lit que la page sur laquelle tu cliques, uniquement quand tu cliques. Le texte de l'annonce est envoyé à Bricky pour
            remplir l'analyse, rien d'autre.
          </p>
        </div>
      </section>
    </main>
  );
}
