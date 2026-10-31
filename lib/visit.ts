// Mode visite : checklist pièce par pièce et questions à poser, adaptées au bien.

export type VisitStatus = "ok" | "watch" | "issue";
export type VisitItem = { id: string; label: string; hint?: string };
export type VisitSection = { id: string; title: string; items: VisitItem[] };
export type VisitQuestion = { id: string; text: string; why?: string };

export type VisitData = {
  checks: Record<string, { status?: VisitStatus; note?: string }>;
  answers: Record<string, { asked?: boolean; answer?: string }>;
  notes: string;
  works_estimate: number | null;
  photos: { path: string; section: string }[];
};

export const EMPTY_VISIT: VisitData = { checks: {}, answers: {}, notes: "", works_estimate: null, photos: [] };

const HOUSE_TYPES = new Set(["maison", "chalet", "chateau", "villa"]);
const FLAT_TYPES = new Set(["appartement", "studio", "penthouse", "loft", "duplex"]);

export function visitSections(propertyType?: string | null): VisitSection[] {
  const house = !!propertyType && HOUSE_TYPES.has(propertyType);
  const flat = !propertyType || FLAT_TYPES.has(propertyType);
  const sections: VisitSection[] = [];
  if (flat) {
    sections.push({ id: "immeuble", title: "Immeuble et parties communes", items: [
      { id: "facade", label: "Façade et toiture de l'immeuble", hint: "Fissures, enduit qui s'écaille, gouttières" },
      { id: "communs", label: "Hall et cage d'escalier", hint: "Propreté, entretien : reflet de la gestion de la copro" },
      { id: "ascenseur", label: "Ascenseur", hint: "En service ? Bruit, entretien affiché" },
      { id: "cave", label: "Cave et sous-sol", hint: "Humidité, odeur de moisi" },
    ] });
  }
  if (house) {
    sections.push({ id: "exterieur", title: "Extérieur", items: [
      { id: "toiture", label: "Toiture", hint: "Tuiles déplacées, mousse, gouttières, âge" },
      { id: "facade", label: "Murs et façade", hint: "Fissures en escalier, traces d'humidité au pied des murs" },
      { id: "terrain", label: "Jardin, clôtures, terrain", hint: "Pente, écoulement de l'eau, arbres proches de la maison" },
      { id: "assainissement", label: "Assainissement", hint: "Tout-à-l'égout ou fosse ? Contrôle récent ?" },
    ] });
  }
  sections.push(
    { id: "pieces", title: "Pièces de vie", items: [
      { id: "humidite", label: "Humidité et moisissures", hint: "Plafonds, angles, derrière les meubles, odeur" },
      { id: "murs", label: "Murs, sols et plafonds", hint: "Fissures, sol qui penche, parquet qui grince" },
      { id: "lumiere", label: "Luminosité et exposition", hint: "Lumière naturelle, vis-à-vis" },
      { id: "fenetres", label: "Fenêtres", hint: "Simple ou double vitrage, joints, ouverture facile" },
    ] },
    { id: "eau", title: "Cuisine et salle de bain", items: [
      { id: "pression", label: "Pression et eau chaude", hint: "Ouvrir les robinets, temps pour l'eau chaude" },
      { id: "evacuations", label: "Évacuations", hint: "Éviers et douche qui s'écoulent bien, pas d'odeur" },
      { id: "joints", label: "Joints et faïence", hint: "Joints noircis, traces d'infiltration" },
      { id: "ventilation", label: "Ventilation (VMC)", hint: "Bouches d'aération qui aspirent" },
    ] },
    { id: "technique", title: "Technique", items: [
      { id: "electricite", label: "Tableau électrique", hint: "Disjoncteurs récents, prise de terre, pas de fils apparents" },
      { id: "chauffage", label: "Chauffage", hint: "Type, âge de la chaudière, dernier entretien" },
      { id: "isolation", label: "Isolation", hint: "Murs froids, combles, fenêtres" },
      { id: "compteurs", label: "Compteurs et factures", hint: "Demande les factures d'énergie de l'année" },
    ] },
    { id: "quartier", title: "Quartier", items: [
      { id: "bruit", label: "Bruit", hint: "Rue, voisins, bar, voie ferrée : fenêtres fermées puis ouvertes" },
      { id: "stationnement", label: "Stationnement", hint: "Facile ? Payant ?" },
      { id: "services", label: "Commerces, transports, écoles", hint: "À pied en combien de minutes ?" },
    ] },
  );
  return sections;
}

export function visitQuestions(ctx: { propertyType?: string | null; dpe?: string | null; rented?: boolean }): VisitQuestion[] {
  const q: VisitQuestion[] = [
    { id: "pourquoi", text: "Pourquoi le vendeur vend-il ?", why: "Un vendeur pressé négocie plus." },
    { id: "depuis", text: "Depuis quand est-il en vente ? Y a-t-il déjà eu des offres ?", why: "Plus c'est long, plus la marge est grande." },
    { id: "taxe", text: "Montant exact de la taxe foncière et des charges ?" },
  ];
  const type = ctx.propertyType ?? "";
  if (!type || FLAT_TYPES.has(type)) {
    q.push(
      { id: "travaux_copro", text: "Des travaux sont-ils votés ou prévus en copropriété ? Qui les paie ?", why: "Les travaux votés avant la vente sont en principe à la charge du vendeur." },
      { id: "procedure", text: "Y a-t-il une procédure ou des impayés dans la copropriété ?" },
    );
  }
  if (HOUSE_TYPES.has(type)) {
    q.push(
      { id: "toiture_age", text: "De quand datent la toiture et la chaudière ?" },
      { id: "assainissement_q", text: "Tout-à-l'égout ou fosse septique ? Le contrôle est-il conforme ?" },
    );
  }
  const dpe = (ctx.dpe ?? "").toUpperCase();
  if (["E", "F", "G"].includes(dpe)) {
    q.push({ id: "dpe_travaux", text: `Le DPE est ${dpe} : des travaux d'isolation ou de chauffage ont-ils été chiffrés ?`, why: dpe === "E" ? "Interdiction de louer en 2034." : dpe === "F" ? "Interdiction de louer en 2028." : "Interdit à la location depuis 2025." });
  }
  if (ctx.rented) q.push({ id: "locataire", text: "Le locataire paie-t-il bien ? Depuis quand est-il là ?" });
  q.push({ id: "dispo", text: "Le prix est-il négociable ? Quelle date de disponibilité ?" });
  return q;
}

/** Compte rendu texte, prêt à copier ou partager. */
export function visitReportText(title: string, sections: VisitSection[], questions: VisitQuestion[], data: VisitData): string {
  const lines: string[] = [`Compte rendu de visite : ${title}`, ""];
  const issues: string[] = [];
  const watch: string[] = [];
  for (const s of sections) {
    for (const it of s.items) {
      const c = data.checks[`${s.id}.${it.id}`];
      if (!c?.status || c.status === "ok") continue;
      const line = `- ${s.title} › ${it.label}${c.note ? ` : ${c.note}` : ""}`;
      (c.status === "issue" ? issues : watch).push(line);
    }
  }
  if (issues.length) lines.push("Problèmes :", ...issues, "");
  if (watch.length) lines.push("À surveiller :", ...watch, "");
  const answered = questions.filter((q) => data.answers[q.id]?.answer?.trim());
  if (answered.length) lines.push("Réponses de l'agent :", ...answered.map((q) => `- ${q.text} → ${data.answers[q.id]!.answer!.trim()}`), "");
  if (data.works_estimate) lines.push(`Travaux estimés après visite : ${data.works_estimate.toLocaleString("fr-FR")} €`, "");
  if (data.notes.trim()) lines.push("Notes :", data.notes.trim());
  return lines.join("\n").trim();
}
