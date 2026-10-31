"use client";

import { ChangeEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { EMPTY_VISIT, visitQuestions, visitReportText, visitSections, type VisitData, type VisitStatus } from "../../lib/visit";
import "./visite.css";

type Property = { id: string; title: string | null; city: string | null; address: string | null; property_type: string | null; dpe_class: string | null; price: number | null };

const STATUS: { value: VisitStatus; label: string }[] = [
  { value: "ok", label: "OK" },
  { value: "watch", label: "À surveiller" },
  { value: "issue", label: "Problème" },
];

export default function VisitePage() {
  return <Suspense fallback={null}><Visite /></Suspense>;
}

/** Réduit une photo du téléphone (souvent 4–8 Mo) avant l'envoi. */
async function compress(file: File, max = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file; // format non décodable (HEIC sur certains navigateurs) : envoyé tel quel
  }
}

// Mode visite : sur place, téléphone en main. Checklist pièce par pièce, photos,
// questions à poser à l'agent, notes ; tout est enregistré automatiquement.
function Visite() {
  const router = useRouter();
  const propertyId = useSearchParams().get("property_id") ?? "";
  const [userId, setUserId] = useState("");
  const [property, setProperty] = useState<Property | null>(null);
  const [data, setData] = useState<VisitData>(EMPTY_VISIT);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "local">("idle");
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  const draftKey = `bricky_visit_${propertyId}`;

  const sections = useMemo(() => visitSections(property?.property_type), [property?.property_type]);
  const questions = useMemo(() => visitQuestions({ propertyType: property?.property_type, dpe: property?.dpe_class }), [property?.property_type, property?.dpe_class]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { router.replace("/login"); return; }
      if (!propertyId) { setError("Choisis d'abord un bien dans « Mes biens »."); return; }
      setUserId(s.session.user.id);
      const { data: p, error: pErr } = await supabase.from("properties").select("id, title, city, address, property_type, dpe_class, price").eq("id", propertyId).single();
      if (cancelled) return;
      if (pErr || !p) { setError("Bien introuvable."); return; }
      setProperty(p as Property);
      let restored: VisitData | null = null;
      const { data: row } = await supabase.from("visit_reports").select("data").eq("property_id", propertyId).maybeSingle();
      if (row?.data) restored = { ...EMPTY_VISIT, ...(row.data as VisitData) };
      if (!restored) {
        try { const raw = localStorage.getItem(draftKey); if (raw) restored = { ...EMPTY_VISIT, ...JSON.parse(raw) }; } catch { /* pas de brouillon */ }
      }
      if (!cancelled) { if (restored) setData(restored); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [propertyId, router, draftKey]);

  // Liens temporaires pour afficher les photos privées
  useEffect(() => {
    const missing = data.photos.filter((ph) => !photoUrls[ph.path]).map((ph) => ph.path);
    if (!missing.length) return;
    supabase.storage.from("visit-photos").createSignedUrls(missing, 3600).then(({ data: urls }) => {
      if (!urls) return;
      setPhotoUrls((cur) => {
        const next = { ...cur };
        urls.forEach((u: { path: string | null; signedUrl: string | null }) => { if (u.path && u.signedUrl) next[u.path] = u.signedUrl; });
        return next;
      });
    });
  }, [data.photos, photoUrls]);

  // Enregistrement automatique (base de données, sinon brouillon sur le téléphone)
  function persist(next: VisitData) {
    setData(next);
    try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* stockage indisponible */ }
    window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = window.setTimeout(async () => {
      const { error: err } = await supabase.from("visit_reports").upsert(
        { user_id: userId, property_id: propertyId, data: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id,property_id" },
      );
      setSaveState(err ? "local" : "saved");
    }, 900);
  }

  const setCheck = (key: string, patch: { status?: VisitStatus; note?: string }) =>
    persist({ ...data, checks: { ...data.checks, [key]: { ...data.checks[key], ...patch } } });
  const setAnswer = (id: string, patch: { asked?: boolean; answer?: string }) =>
    persist({ ...data, answers: { ...data.answers, [id]: { ...data.answers[id], ...patch } } });

  async function addPhotos(sectionId: string, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !userId) return;
    setUploading(sectionId);
    setPhotoError("");
    const added: { path: string; section: string }[] = [];
    for (const f of files.slice(0, 6)) {
      const blob = await compress(f);
      const path = `${userId}/${propertyId}/${sectionId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error: upErr } = await supabase.storage.from("visit-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) { setPhotoError("Les photos ne peuvent pas encore être enregistrées (stockage pas activé)."); break; }
      added.push({ path, section: sectionId });
    }
    setUploading(null);
    if (added.length) persist({ ...data, photos: [...data.photos, ...added] });
  }

  async function removePhoto(path: string) {
    await supabase.storage.from("visit-photos").remove([path]);
    persist({ ...data, photos: data.photos.filter((p) => p.path !== path) });
  }

  const allKeys = sections.flatMap((s) => s.items.map((it) => `${s.id}.${it.id}`));
  const done = allKeys.filter((k) => data.checks[k]?.status).length;
  const issues = allKeys.filter((k) => data.checks[k]?.status === "issue").length;
  const watch = allKeys.filter((k) => data.checks[k]?.status === "watch").length;
  const title = property?.title || [property?.address, property?.city].filter(Boolean).join(", ") || "Bien";

  async function copyReport() {
    try { await navigator.clipboard.writeText(visitReportText(title, sections, questions, data)); setCopied(true); } catch { setCopied(false); }
  }

  if (error) return <main className="page vs-page"><div className="vs-empty"><p>{error}</p><a href="/properties">Mes biens</a></div></main>;
  if (!loaded || !property) return <main className="page vs-page"><div className="vs-empty"><p>Chargement de la visite…</p></div></main>;

  return (
    <main className="page vs-page">
      <header className="vs-top">
        <a href={`/analyze?property_id=${propertyId}`} className="vs-back" aria-label="Retour à l'analyse">←</a>
        <div className="vs-top-text"><span>Mode visite</span><b>{title}</b></div>
        <span className={`vs-save vs-save-${saveState}`}>{saveState === "saving" ? "…" : saveState === "saved" ? "Enregistré" : saveState === "local" ? "Sur ce téléphone" : ""}</span>
      </header>

      <div className="vs-progress" aria-label={`${done} points vérifiés sur ${allKeys.length}`}>
        <span style={{ width: `${(done / allKeys.length) * 100}%` }} />
      </div>
      <div className="vs-counters">
        <span>{done}/{allKeys.length} vérifiés</span>
        {watch > 0 && <span className="vs-c-watch">{watch} à surveiller</span>}
        {issues > 0 && <span className="vs-c-issue">{issues} problème{issues > 1 ? "s" : ""}</span>}
      </div>

      {sections.map((s) => {
        const photos = data.photos.filter((p) => p.section === s.id);
        return (
          <section key={s.id} className="vs-section">
            <div className="vs-section-head">
              <h2>{s.title}</h2>
              <label className="vs-photo-btn">
                {uploading === s.id ? "Envoi…" : "📷 Photo"}
                <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => addPhotos(s.id, e)} disabled={uploading !== null} />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="vs-photos">
                {photos.map((p) => (
                  <span key={p.path} className="vs-thumb">
                    {photoUrls[p.path] ? <img src={photoUrls[p.path]} alt="" /> : <i />}
                    <button type="button" aria-label="Supprimer la photo" onClick={() => removePhoto(p.path)}>×</button>
                  </span>
                ))}
              </div>
            )}
            {s.items.map((it) => {
              const key = `${s.id}.${it.id}`;
              const c = data.checks[key] ?? {};
              return (
                <div key={key} className={`vs-item${c.status ? ` vs-item-${c.status}` : ""}`}>
                  <div className="vs-item-text">
                    <b>{it.label}</b>
                    {it.hint && <small>{it.hint}</small>}
                  </div>
                  <div className="vs-status" role="radiogroup" aria-label={it.label}>
                    {STATUS.map((st) => (
                      <button key={st.value} type="button" role="radio" aria-checked={c.status === st.value} className={`vs-st vs-st-${st.value}${c.status === st.value ? " is-on" : ""}`} onClick={() => setCheck(key, { status: c.status === st.value ? undefined : st.value })}>{st.label}</button>
                    ))}
                    <button type="button" className={`vs-note-btn${c.note ? " has-note" : ""}`} onClick={() => setOpenNote(openNote === key ? null : key)} aria-label="Ajouter une note">✎</button>
                  </div>
                  {(openNote === key || c.note) && (
                    <textarea className="vs-note" rows={2} value={c.note ?? ""} onChange={(e) => setCheck(key, { note: e.target.value })} placeholder="Ce que tu as vu (ex. tache d'humidité au plafond de la chambre)" />
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
      {photoError && <p className="vs-error">{photoError}</p>}

      <section className="vs-section">
        <div className="vs-section-head"><h2>Questions à poser à l'agent</h2></div>
        {questions.map((q) => {
          const a = data.answers[q.id] ?? {};
          return (
            <div key={q.id} className={`vs-q${a.asked ? " is-asked" : ""}`}>
              <label className="vs-q-head">
                <input type="checkbox" checked={!!a.asked} onChange={(e) => setAnswer(q.id, { asked: e.target.checked })} />
                <span><b>{q.text}</b>{q.why && <small>{q.why}</small>}</span>
              </label>
              <input className="vs-q-answer" value={a.answer ?? ""} onChange={(e) => setAnswer(q.id, { answer: e.target.value, asked: true })} placeholder="Sa réponse" />
            </div>
          );
        })}
      </section>

      <section className="vs-section">
        <div className="vs-section-head"><h2>Notes et bilan</h2></div>
        <textarea className="vs-notes" rows={4} value={data.notes} onChange={(e) => persist({ ...data, notes: e.target.value })} placeholder="Impressions, coup de cœur, points négatifs… (le micro du clavier permet de dicter)" />
        <label className="vs-works">
          <span>Travaux repérés pendant la visite</span>
          <span className="vs-works-input"><input inputMode="numeric" value={data.works_estimate ? data.works_estimate.toLocaleString("fr-FR") : ""} onChange={(e) => { const n = Number(e.target.value.replace(/\s/g, "")); persist({ ...data, works_estimate: Number.isFinite(n) && n > 0 ? n : null }); }} placeholder="0" /><i>€</i></span>
        </label>
        <div className="vs-actions">
          <button type="button" className="vs-copy" onClick={copyReport}>{copied ? "Compte rendu copié ✓" : "Copier le compte rendu"}</button>
          <a className="vs-to-analysis" href={`/analyze?property_id=${propertyId}${data.works_estimate ? `&travaux=${data.works_estimate}` : ""}`}>Revenir à l'analyse</a>
        </div>
        {data.works_estimate ? <p className="vs-tip">Ajoute ces {data.works_estimate.toLocaleString("fr-FR")} € au budget travaux de l'analyse : le prix à proposer sera recalculé.</p> : null}
      </section>
    </main>
  );
}
