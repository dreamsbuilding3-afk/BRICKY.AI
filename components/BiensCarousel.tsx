"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { illustrationKind, ILLUSTRATION_LABELS, type IllustrationKind } from "../lib/illustrations/propertyIllustrations";
import "./biensCarousel.css";

// « Mes biens » en cartes flottantes qui défilent. Un appui ouvre la fiche du bien :
// la carte s'agrandit jusqu'à la fiche (View Transitions du navigateur, sinon simple
// glissement). Tout en CSS / transform : pas de moteur 3D, rien qui tourne en boucle.

export type BienAnalysis = {
  id: string;
  verdict: string | null;
  overall_score: number | null;
  confidence_score: number | null;
  status: string | null;
  created_at: string;
  gross?: string | null;
  net?: string | null;
  rent?: string | null;
  cashflow?: string | null;
};

export type Bien = {
  id: string;
  title: string | null;
  address: string | null;
  city: string | null;
  price: number | null;
  surface_m2: number | null;
  property_type: string | null;
  created_at: string;
  analyses: BienAnalysis[] | null;
};

type Filter = "all" | "interesting" | "check" | "unattractive" | "none";

function decodeEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&euro;/gi, "€").replace(/&nbsp;/gi, " ").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/gi, "&");
  }
  return out;
}

function latest(b: Bien): BienAnalysis | null {
  const list = b.analyses || [];
  if (!list.length) return null;
  return [...list].sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at))[0];
}

function verdictOf(a: BienAnalysis | null): { label: string; key: Filter } {
  if (!a || !a.verdict) return { label: "Non évalué", key: "none" };
  if (a.verdict === "interesting") return { label: "Intéressant", key: "interesting" };
  if (a.verdict === "unattractive") return { label: "Peu intéressant", key: "unattractive" };
  return { label: "À vérifier", key: "check" };
}

const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const eur = (v: unknown) => { const n = num(v); return n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`; };
const pct = (v: unknown) => { const n = num(v); return n == null ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`; };
// Prix court pour la pastille : 300 k€, 1,25 M€ ; prix au m² arrondi à l'euro.
function shortEur(n: number, compact = true) {
  if (!compact || n < 10_000) return `${Math.round(n).toLocaleString("fr-FR")} €`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€`;
  return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
}
const score = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n); };

const Pin = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
);

function Media({ kind, big = false }: { kind: IllustrationKind; big?: boolean }) {
  return (
    <span className={"bc-media bc-k-" + kind + (big ? " bc-media-big" : "")}>
      <img src={`/img/biens-3d/${kind}.webp`} alt="" width={336} height={264} decoding="async" loading={big ? "eager" : "lazy"} draggable={false} />
    </span>
  );
}

export function BiensCarousel({ rows, canCompare, selected, onToggleCompare }: {
  rows: Bien[];
  canCompare: boolean;
  selected: string[];
  onToggleCompare: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"apercu" | "chiffres">("apercu");
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const items = useMemo(() => rows.map((b) => {
    const a = latest(b);
    return { b, a, v: verdictOf(a), kind: illustrationKind(b.property_type, b.title), title: decodeEntities(b.title || b.address || "Bien sans titre") };
  }), [rows]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, interesting: 0, check: 0, unattractive: 0, none: 0 };
    items.forEach((i) => { c[i.v.key] += 1; });
    return c;
  }, [items]);

  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => (filter === "all" || i.v.key === filter) && (!q || `${i.title} ${i.b.city ?? ""} ${i.b.address ?? ""}`.toLowerCase().includes(q)));
  const open = openId ? items.find((i) => i.b.id === openId) ?? null : null;

  // Ouverture / fermeture : la carte se transforme en fiche (View Transitions si disponible).
  function run(update: () => void) {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !reduce) doc.startViewTransition(() => flushSync(update));
    else update();
  }
  function openCard(id: string) {
    flushSync(() => { setPending(id); setTab("apercu"); });
    run(() => setOpenId(id));
  }
  function closeCard() {
    run(() => setOpenId(null));
  }

  useEffect(() => {
    if (!openId) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeCard(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  function scrollBy(dir: number) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".bc-card");
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 260) + 18), behavior: "smooth" });
  }

  const FILTERS: [Filter, string][] = [["all", "Tous"], ["interesting", "Intéressants"], ["check", "À vérifier"], ["unattractive", "Peu intéressants"], ["none", "Non évalués"]];

  return (
    <section className="bc" aria-label="Vos biens">
      <div className="bc-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un bien, une ville…" aria-label="Rechercher un bien" />
        {query && <button type="button" className="bc-search-clear" onClick={() => setQuery("")} aria-label="Effacer la recherche">×</button>}
      </div>

      <div className="bc-head">
        <h2>Vos biens <span>{counts.all}</span></h2>
        <div className="bc-arrows">
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Biens précédents"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
          <button type="button" onClick={() => scrollBy(1)} aria-label="Biens suivants"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
        </div>
      </div>

      <div className="bc-chips" role="tablist" aria-label="Filtrer par verdict">
        {FILTERS.filter(([k]) => k === "all" || counts[k] > 0).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={"bc-chip" + (filter === k ? " is-on" : "")} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="bc-empty">Aucun bien ne correspond.</p>
      ) : (
        <div className="bc-track" ref={trackRef}>
          {shown.map(({ b, a, v, kind, title }, i) => {
            const named = pending === b.id && openId !== b.id;
            const isSel = selected.includes(b.id);
            const s = score(a?.overall_score);
            return (
              <article key={b.id} className={"bc-card" + (isSel ? " is-selected" : "")} style={{ "--i": Math.min(i, 6) } as CSSProperties}>
                <button type="button" className={"bc-card-hit bc-k-" + kind} onClick={() => openCard(b.id)} aria-label={`Ouvrir ${title}`}>
                  <span className="bc-card-media" style={named ? ({ viewTransitionName: "bien-media" } as CSSProperties) : undefined}>
                    <Media kind={kind} />
                  </span>
                  <span className="bc-kind">{ILLUSTRATION_LABELS[kind]}</span>
                  <span className="bc-info" style={named ? ({ viewTransitionName: "bien-info" } as CSSProperties) : undefined}>
                    <span className="bc-title-row">
                      <b>{title}</b>
                      {b.price != null && <span className="bc-price-pill">{shortEur(b.price)}</span>}
                    </span>
                    <span className="bc-desc">
                      {[b.city || "Ville non renseignée", b.surface_m2 ? `${b.surface_m2} m²` : null].filter(Boolean).join(" · ")}
                      {a ? ` · analysé le ${new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : " · pas encore analysé"}
                    </span>
                    <span className="bc-tags">
                      {s != null && <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></svg>{s}</span>}
                      <span className={"bc-tag-v bc-tag-" + v.key}>{v.label}</span>
                      {b.price != null && b.surface_m2 ? <span>{shortEur(b.price / b.surface_m2, false)}/m²</span> : null}
                    </span>
                    <span className="bc-btn">Voir le bien</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={"bc-compare" + (isSel ? " is-on" : "") + (canCompare ? "" : " is-locked")}
                  onClick={() => onToggleCompare(b.id)}
                  aria-pressed={isSel}
                  aria-label={canCompare ? (isSel ? "Retirer de la comparaison" : "Ajouter à la comparaison") : "Comparateur : disponible avec Pro"}
                  title={canCompare ? "Comparer" : "Comparateur : disponible avec Pro"}
                >
                  {isSel ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
                </button>
              </article>
            );
          })}
          <span className="bc-track-end" aria-hidden="true" />
        </div>
      )}

      {open && (
        <div className="bc-sheet-wrap" onClick={closeCard}>
          <div className="bc-sheet" role="dialog" aria-modal="true" aria-label={open.title} onClick={(e) => e.stopPropagation()}>
            <div className={"bc-sheet-media bc-k-" + open.kind} style={{ viewTransitionName: "bien-media" } as CSSProperties}>
              <Media kind={open.kind} big />
              <button type="button" className="bc-round bc-back" onClick={closeCard} ref={closeRef} aria-label="Fermer">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <a className="bc-round bc-dossier" href="/dossiers" aria-label="Voir dans Mes dossiers" title="Mes dossiers">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg>
              </a>
              <div className="bc-head-info" style={{ viewTransitionName: "bien-info" } as CSSProperties}>
                <div className="bc-head-row">
                  <b>{open.title}</b>
                  <span className="bc-head-price">{open.b.price != null ? shortEur(open.b.price) : "—"}</span>
                </div>
                <span className="bc-city"><Pin />{[open.b.city, open.b.address].filter(Boolean).join(" · ") || "Adresse non renseignée"}</span>
                <div className="bc-head-stats">
                  <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" /></svg>Surface <b>{open.b.surface_m2 ? `${open.b.surface_m2} m²` : "—"}</b></span>
                  <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></svg>Score <b>{score(open.a?.overall_score) ?? "—"}</b></span>
                  <span className={"bc-tag-v bc-tag-" + open.v.key}><b>{open.v.label}</b></span>
                </div>
              </div>
            </div>

            <div className="bc-sheet-body">
              <div className="bc-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "apercu"} className={tab === "apercu" ? "is-on" : ""} onClick={() => setTab("apercu")}>Aperçu</button>
                <button type="button" role="tab" aria-selected={tab === "chiffres"} className={tab === "chiffres" ? "is-on" : ""} onClick={() => setTab("chiffres")}>Chiffres</button>
              </div>


              {tab === "apercu" ? (
                <p className="bc-text">
                  {ILLUSTRATION_LABELS[open.kind]}{open.b.city ? ` à ${open.b.city}` : ""}
                  {open.b.surface_m2 ? `, ${open.b.surface_m2} m²` : ""}.{" "}
                  {!open.a
                    ? "Ce bien n'a pas encore d'analyse : ouvrez-le pour la lancer."
                    : open.v.key === "none"
                      ? `Analyse enregistrée le ${new Date(open.a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}, sans verdict pour l'instant : il manque sans doute des données. Ouvrez l'analyse pour les compléter.`
                      : `Analysé le ${new Date(open.a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : Bricky le classe « ${open.v.label.toLowerCase()} »${score(open.a.overall_score) != null ? ` avec un score de ${score(open.a.overall_score)}/100` : ""}. Ouvrez l'analyse pour voir le rendement, les risques, le cadastre et le prix à proposer.`}
                </p>
              ) : (
                <dl className="bc-figures">
                  <div><dt>Prix demandé</dt><dd>{eur(open.b.price)}</dd></div>
                  <div><dt>Prix au m²</dt><dd>{open.b.price && open.b.surface_m2 ? eur(open.b.price / open.b.surface_m2) : "—"}</dd></div>
                  <div><dt>Loyer estimé</dt><dd>{num(open.a?.rent) == null ? "—" : `${eur(open.a?.rent)}/mois`}</dd></div>
                  <div><dt>Rendement brut</dt><dd>{pct(open.a?.gross)}</dd></div>
                  <div><dt>Rendement net</dt><dd>{pct(open.a?.net)}</dd></div>
                  <div><dt>Cash-flow</dt><dd className={(num(open.a?.cashflow) ?? 0) < 0 ? "bc-neg" : ""}>{num(open.a?.cashflow) == null ? "—" : `${eur(open.a?.cashflow)}/mois`}</dd></div>
                </dl>
              )}

              <a className="bc-cta" href={`/analyze?property_id=${open.b.id}`}>
                Ouvrir l&apos;analyse
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
