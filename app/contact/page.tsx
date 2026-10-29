"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

const TOPICS: { value: string; label: string }[] = [
  { value: "agence", label: "Offre Agence (marque blanche, multi-utilisateurs)" },
  { value: "pack", label: "Pack 3 analyses (12 €)" },
  { value: "essentiel", label: "Abonnement Essentiel" },
  { value: "pro", label: "Abonnement Pro" },
  { value: "reseau", label: "Réseau privé Bricky" },
  { value: "autre", label: "Autre question" },
];

const PLACEHOLDERS: Record<string, string> = {
  agence: "Nombre d'agents, volume d'analyses par mois, besoin de marque blanche…",
  pack: "Le bien que vous étudiez, vos questions éventuelles…",
  reseau: "Votre projet et le secteur recherché…",
};

export default function ContactPage() {
  return <Suspense fallback={null}><ContactForm /></Suspense>;
}

// Formulaire de contact commercial : les demandes sont enregistrées dans la
// table Supabase `contact_requests` (lecture réservée à l'équipe Bricky).
function ContactForm() {
  const params = useSearchParams();
  const initialTopic = TOPICS.some((t) => t.value === params.get("sujet")) ? (params.get("sujet") as string) : "agence";
  const [topic, setTopic] = useState(initialTopic);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // piège à robots, invisible
  const [userId, setUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        setUserId(user.id);
        if (user.email) setEmail((e) => e || user.email!);
      }
    });
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (website) {
      setSent(true);
      return;
    }
    setSending(true);
    setError("");
    const { error: insertError } = await supabase.from("contact_requests").insert({
      topic,
      name: name.trim(),
      email: email.trim(),
      company: company.trim() || null,
      phone: phone.trim() || null,
      message: message.trim() || null,
      user_id: userId,
    });
    setSending(false);
    if (insertError) setError("L'envoi n'a pas fonctionné. Vérifie ton e-mail et réessaie.");
    else setSent(true);
  }

  return (
    <main className="page">
      <div className="legal-page">
        <div className="legal-card contact-card">
          <a className="legal-back" href="/pricing">← Retour aux tarifs</a>
          <h1>Parlons de votre besoin</h1>
          <p className="contact-sub">Une question sur une offre, un devis pour votre agence ? Laissez-nous un message, nous vous répondons par e-mail.</p>

          {sent ? (
            <div className="contact-success">
              <b>Merci, votre demande est bien envoyée.</b>
              <span>Nous revenons vers vous à l'adresse {email || "indiquée"}.</span>
              <a className="primary-button" href="/pricing">Retour aux tarifs</a>
            </div>
          ) : (
            <form className="contact-form" onSubmit={handleSubmit}>
              <label>Sujet
                <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                  {TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <div className="contact-row">
                <label>Nom<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" /></label>
                <label>E-mail<input required type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" /></label>
              </div>
              <div className="contact-row">
                <label>Société <small>(facultatif)</small><input maxLength={160} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Nom de l'agence" /></label>
                <label>Téléphone <small>(facultatif)</small><input type="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" /></label>
              </div>
              <label>Message<textarea rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={PLACEHOLDERS[topic] ?? "Votre message…"} /></label>
              <input className="contact-hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />
              {error && <div className="error-box">{error}</div>}
              <button className="primary-button" disabled={sending}>{sending ? "Envoi…" : "Envoyer la demande →"}</button>
              <p className="contact-legal">Vos coordonnées servent uniquement à répondre à votre demande.</p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
