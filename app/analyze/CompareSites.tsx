"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import "./compare.css";

type Source = { name: string; url: string; price: number };
type Result = { found: boolean; sources: Source[]; cheapest: Source | null; current_price: number | null; savings: number };

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

// « Moins cher ailleurs » : le même bien est-il publié sur un autre site, à un autre prix ?
export function CompareSites({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "off" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => { setState("idle"); setResult(null); }, [url]);

  if (process.env.NEXT_PUBLIC_RADAR_ENABLED !== "1" || !/^https?:\/\//.test(url.trim()) || state === "off") return null;

  async function compare() {
    setState("loading");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/radar/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 503 && body.code === "not_configured") { setState("off"); return; }
      if (!response.ok) { setMessage(body.error ?? "Comparaison impossible."); setState("error"); return; }
      setResult(body as Result);
      setState("done");
    } catch {
      setMessage("Connexion impossible.");
      setState("error");
    }
  }

  return (
    <div className="compare-sites">
      {state !== "done" && (
        <button type="button" className="compare-sites-btn" onClick={compare} disabled={state === "loading"}>
          {state === "loading" ? "Recherche sur les autres sites…" : "Ce bien est-il moins cher ailleurs ?"}
        </button>
      )}
      {state === "error" && <span className="compare-sites-note">{message}</span>}
      {state === "done" && result && (
        !result.found || result.sources.length < 2 ? (
          <span className="compare-sites-note">Bricky ne trouve pas ce bien sur d'autres sites.</span>
        ) : result.savings > 0 && result.cheapest ? (
          <span className="compare-sites-good">
            Moins cher sur <a href={result.cheapest.url} target="_blank" rel="noopener noreferrer">{result.cheapest.name}</a> : {eur(result.cheapest.price)} ({eur(result.savings)} de moins).
          </span>
        ) : (
          <span className="compare-sites-note">
            Aussi publié sur {result.sources.map((s) => s.name).filter((n, i, a) => a.indexOf(n) === i).join(", ")} : c'est déjà le meilleur prix.
          </span>
        )
      )}
    </div>
  );
}
