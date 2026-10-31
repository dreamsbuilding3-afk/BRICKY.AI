"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { projectSummary, readProject, type SearchProject } from "../../lib/searchProject";
import { listingToImportText, sourceName, STREAM_TYPE_LABELS, type RadarReason, type RadarScore } from "../../lib/radar";
import type { RadarListing } from "../../lib/streamEstate";
import { IMPORT_STORAGE_KEY } from "../../lib/brickyImport";
import "./radar.css";

type Match = {
  id: string;
  stream_id: string;
  listing: RadarListing;
  score: number;
  label: RadarScore["label"];
  reasons: RadarReason[];
  metrics: RadarScore["metrics"];
  status: "new" | "seen" | "saved" | "hidden";
  first_seen_at: string;
};

type Filter = "all" | "good" | "saved";
type Problem = { code: string; message: string } | null;

const RADAR_ENABLED = process.env.NEXT_PUBLIC_RADAR_ENABLED === "1";
const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

function ago(iso: string | null) {
  if (!iso) return "";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export default function RadarPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [project, setProject] = useState<SearchProject | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const freshIds = useRef<Set<string>>(new Set());

  const loadMatches = useCallback(async () => {
    const { data, error } = await supabase
      .from("radar_matches")
      .select("id, stream_id, listing, score, label, reasons, metrics, status, first_seen_at")
      .neq("status", "hidden")
      .order("score", { ascending: false })
      .order("first_seen_at", { ascending: false })
      .limit(80);
    if (error) {
      if (/radar_matches/.test(error.message)) setProblem({ code: "no_table", message: "Le radar n'est pas encore installé dans la base de données." });
      return [];
    }
    const rows = (data ?? []) as Match[];
    rows.filter((m) => m.status === "new").forEach((m) => freshIds.current.add(m.id));
    setMatches(rows);
    const { data: state } = await supabase.from("radar_state").select("last_scan_at").maybeSingle();
    setLastScan((state as { last_scan_at: string | null } | null)?.last_scan_at ?? null);
    return rows;
  }, []);

  const scan = useCallback(async (manual: boolean) => {
    setScanning(true);
    if (manual) setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { router.replace("/login"); return; }
      const response = await fetch("/api/radar/scan", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProblem({ code: body.code ?? "error", message: body.error ?? "Le radar n'a pas pu se mettre à jour." });
        return;
      }
      setProblem(null);
      if (body.skipped) {
        if (manual) setNotice("Déjà à jour : le radar se rafraîchit au maximum toutes les 30 minutes.");
      } else {
        setNotice(body.added > 0 ? `${body.added} nouvelle${body.added > 1 ? "s" : ""} annonce${body.added > 1 ? "s" : ""} repérée${body.added > 1 ? "s" : ""}.` : manual ? "Rien de nouveau depuis la dernière recherche." : "");
        await loadMatches();
      }
    } catch {
      setProblem({ code: "error", message: "Connexion impossible, réessaie dans un instant." });
    } finally {
      setScanning(false);
    }
  }, [loadMatches, router]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user) { router.replace("/login"); return; }
      setEmail(user.email ?? "");
      const p = readProject(user.user_metadata);
      setProject(p);
      if (!RADAR_ENABLED) { setProblem({ code: "not_configured", message: "" }); setLoaded(true); return; }
      await loadMatches();
      setLoaded(true);
      if (p?.cities.length) scan(false);
    });
  }, [router, loadMatches, scan]);

  // Les nouveautés affichées passent en « vues » (le badge reste visible jusqu'au prochain passage).
  useEffect(() => {
    const ids = matches.filter((m) => m.status === "new").map((m) => m.id);
    if (!ids.length) return;
    const t = setTimeout(() => { supabase.from("radar_matches").update({ status: "seen" }).in("id", ids).then(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, [matches]);

  async function setStatus(m: Match, status: Match["status"]) {
    setMatches((cur) => (status === "hidden" ? cur.filter((x) => x.id !== m.id) : cur.map((x) => (x.id === m.id ? { ...x, status } : x))));
    await supabase.from("radar_matches").update({ status }).eq("id", m.id);
  }

  function analyze(m: Match) {
    try {
      window.sessionStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify({ u: m.listing.url ?? "", t: listingToImportText(m.listing) }));
    } catch {}
    router.push("/analyze?mode=achat");
  }

  const shown = useMemo(() => matches.filter((m) => (filter === "good" ? m.score >= 60 : filter === "saved" ? m.status === "saved" : true)), [matches, filter]);
  const goodCount = matches.filter((m) => m.score >= 60).length;
  const savedCount = matches.filter((m) => m.status === "saved").length;
  const noProject = loaded && (!project || !project.cities.length);

  return (
    <main className="page">
      <AppNav email={email} active="radar" />
      <section className="rd-shell">
        <header className="rd-head">
          <div>
            <span className="eyebrow">Bricky · Radar</span>
            <h1>Tes bonnes affaires</h1>
            {project && project.cities.length > 0 && (
              <p className="rd-project">
                {projectSummary(project)}
                {project.goal !== "home" && project.yield_target ? ` · objectif ${project.yield_target} % brut` : ""}
                <Link href="/projet">Modifier</Link>
              </p>
            )}
          </div>
          {!noProject && (
            <div className="rd-refresh">
              <button type="button" onClick={() => scan(true)} disabled={scanning || problem?.code === "not_configured"}>
                <span className={"rd-dot" + (scanning ? " rd-dot-live" : "")} />
                {scanning ? "Recherche…" : "Actualiser"}
              </button>
              <span>{lastScan ? `Mis à jour ${ago(lastScan)}` : "Jamais mis à jour"}</span>
            </div>
          )}
        </header>

        {noProject && (
          <div className="rd-empty">
            <h2>Dis à Bricky ce que tu cherches</h2>
            <p>Villes, budget, type de bien : le radar surveille les nouvelles annonces de plus de 1 500 sites et te montre les meilleures.</p>
            <Link className="rd-cta" href="/projet">Remplir mon projet</Link>
          </div>
        )}

        {problem && (
          <div className={"rd-problem" + (problem.code === "not_configured" ? " rd-problem-soft" : "")}>
            <strong>{problem.code === "not_configured" ? "Radar bientôt actif" : "Petit souci"}</strong>
            <span>{problem.code === "not_configured" ? "La connexion aux annonces est en cours d'activation. Ton projet est enregistré : le radar démarrera tout seul." : problem.message}</span>
            {problem.code === "no_project" || problem.code === "unknown_cities" ? <Link href="/projet">Ouvrir mon projet</Link> : null}
          </div>
        )}

        {notice && <p className="rd-notice">{notice}</p>}

        {matches.length > 0 && (
          <nav className="rd-filters" aria-label="Filtrer">
            {([["all", `Toutes · ${matches.length}`], ["good", `Bonnes affaires · ${goodCount}`], ["saved", `Gardées · ${savedCount}`]] as [Filter, string][]).map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? "rd-filter-on" : ""} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </nav>
        )}

        {loaded && !noProject && matches.length === 0 && !problem && (
          <div className="rd-empty rd-empty-quiet">
            <p>{scanning ? "Bricky parcourt les annonces de tes villes…" : "Aucune annonce ne correspond encore à ton projet. Élargis le budget ou ajoute une ville pour voir plus d'annonces."}</p>
          </div>
        )}

        <div className="rd-grid">
          {shown.map((m) => <RadarCard key={m.id} m={m} fresh={freshIds.current.has(m.id)} onAnalyze={() => analyze(m)} onSave={() => setStatus(m, m.status === "saved" ? "seen" : "saved")} onHide={() => setStatus(m, "hidden")} />)}
        </div>

        {matches.length > 0 && (
          <p className="rd-foot">
            Note sur 100 : prix comparé aux ventes réelles du secteur (DVF), rendement estimé avec la carte des loyers (ANIL), baisses de prix et DPE.
            Une estimation pour trier, pas une garantie : lance l'analyse complète avant toute offre.
          </p>
        )}
      </section>
    </main>
  );
}

function RadarCard({ m, fresh, onAnalyze, onSave, onHide }: { m: Match; fresh: boolean; onAnalyze: () => void; onSave: () => void; onHide: () => void }) {
  const l = m.listing;
  const tone = m.score >= 75 ? "top" : m.score >= 60 ? "good" : m.score >= 45 ? "mid" : "low";
  const facts = [l.type ? STREAM_TYPE_LABELS[l.type] : null, l.surface ? `${l.surface} m²` : null, l.rooms ? `${l.rooms} p.` : null, l.dpe ? `DPE ${l.dpe}` : null].filter(Boolean);
  const sites = [...new Set(l.sources.map((s) => sourceName(s.slug)))];
  return (
    <article className={`rd-card rd-${tone}`}>
      <div className="rd-media">
        {l.picture ? <img src={l.picture} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="rd-noimg" aria-hidden />}
        {fresh && <span className="rd-new">Nouveau</span>}
        <div className="rd-score" style={{ ["--p" as string]: m.score }} title={`${m.label} · ${m.score}/100`}>
          <b>{m.score}</b>
        </div>
      </div>
      <div className="rd-body">
        <span className="rd-label">{m.label}</span>
        <h3 title={l.title}>{l.title}</h3>
        <p className="rd-place">{[l.city, l.postalCode].filter(Boolean).join(" ")}</p>
        <div className="rd-price">
          {l.price ? <strong>{eur(l.price)}</strong> : <strong>Prix non communiqué</strong>}
          {m.metrics.priceM2 ? <span>{eur(m.metrics.priceM2)}/m²</span> : null}
        </div>
        {facts.length > 0 && <p className="rd-facts">{facts.join(" · ")}</p>}
        {m.reasons.length > 0 && (
          <ul className="rd-reasons">
            {m.reasons.slice(0, 4).map((r, i) => <li key={i} className={`rd-r-${r.tone}`}>{r.text}</li>)}
          </ul>
        )}
        {m.metrics.cheaperElsewhere && (
          <a className="rd-cheaper" href={m.metrics.cheaperElsewhere.url} target="_blank" rel="noopener noreferrer">
            Moins cher sur {sourceName(m.metrics.cheaperElsewhere.slug)} : {eur(m.metrics.cheaperElsewhere.price)}
          </a>
        )}
        {sites.length > 0 && <p className="rd-sites">Vu sur {sites.slice(0, 3).join(", ")}{sites.length > 3 ? ` +${sites.length - 3}` : ""}</p>}
        <div className="rd-actions">
          <button type="button" className="rd-primary" onClick={onAnalyze}>Analyser</button>
          {l.url && <a className="rd-ghost" href={l.url} target="_blank" rel="noopener noreferrer">Annonce</a>}
          <button type="button" className={"rd-icon" + (m.status === "saved" ? " rd-icon-on" : "")} onClick={onSave} aria-label={m.status === "saved" ? "Ne plus garder" : "Garder"} title={m.status === "saved" ? "Gardée" : "Garder"}>★</button>
          <button type="button" className="rd-icon" onClick={onHide} aria-label="Masquer" title="Masquer">✕</button>
        </div>
      </div>
    </article>
  );
}
