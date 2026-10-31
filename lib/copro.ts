// Lecture des documents de copropriété (PV d'assemblée générale, relevés de
// charges) : travaux votés, impayés, procédures. C'est là que se cachent les
// mauvaises surprises après l'achat. Deux modes : l'IA quand elle est disponible,
// sinon une lecture par mots-clés du texte du PDF (sans IA, gratuite).

export type CoproWorkStatus = "voté" | "refusé" | "reporté" | "à l'étude";
export type CoproWork = { label: string; amount: number | null; status: CoproWorkStatus; when: string | null };
export type CoproFindings = {
  works: CoproWork[];
  unpaid: { found: boolean; amount: number | null; detail: string | null };
  procedures: string[];
  works_fund: number | null;
  budget: number | null;
  level: "ok" | "attention" | "alerte";
  method: "ai" | "mots-clés";
};

const WORK_RE = /(ravalement|fa[cç]ade|toiture|couverture|[ée]tanch[ée]it[ée]|ascenseur|chaudi[eè]re|chauffage collectif|canalisations?|colonnes? (?:montantes?|d'eau|de gaz)|isolation|menuiseries|cage d'escalier|mise (?:aux|en) normes?|r[ée]fection|r[ée]novation [ée]nerg[ée]tique|diagnostic technique global|\bDTG\b|plan pluriannuel|\bPPPT\b|interphone|digicode|parties communes|toit[- ]terrasse|charpente|fissures?|d[ée]samiantage)/i;
const UNPAID_RE = /(impay[ée]s?|copropri[ée]taires? d[ée]biteurs?|retards? de paiement|cr[ée]ances? (?:douteuses|irr[ée]couvrables)|recouvrement)/i;
const PROC_RE = /(proc[ée]dure (?:judiciaire|en cours|contentieuse)|contentieux|assignation|tribunal|cour d'appel|mandataire ad hoc|administrateur provisoire|plan de sauvegarde|copropri[ée]t[ée] en difficult[ée]|[ée]tat de carence|arr[êe]t[ée] de p[ée]ril|mise en s[ée]curit[ée]|expertise judiciaire|litige)/i;
const AMOUNT_RE = /(\d{1,3}(?:[ .  ]\d{3})+|\d{3,7})(?:[.,]\d{1,2})?\s*(?:€|euros?|EUR)/i;

function amountIn(text: string): number | null {
  const m = text.match(AMOUNT_RE);
  if (!m) return null;
  const n = Number(m[1].replace(/[ .  ]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function statusOf(text: string): CoproWorkStatus {
  if (/rejet|refus|non adopt|n'est pas adopt|pas approuv/i.test(text)) return "refusé";
  if (/report|ajourn|prochaine assembl/i.test(text)) return "reporté";
  if (/adopt|approuv|vot[ée]e?s?\b|d[ée]cid[ée]|accept/i.test(text)) return "voté";
  return "à l'étude";
}

function clip(s: string, n = 170) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function levelOf(f: Omit<CoproFindings, "level" | "method">): CoproFindings["level"] {
  if (f.procedures.length || (f.unpaid.found && (f.unpaid.amount ?? 0) >= 5000)) return "alerte";
  if (f.unpaid.found || f.works.some((w) => w.status === "voté" || w.status === "à l'étude")) return "attention";
  return "ok";
}

/** Lecture sans IA : repère les passages qui parlent de travaux, d'impayés et de procédures. */
export function scanCoproText(text: string): CoproFindings {
  const chunks = text
    .replace(/\r/g, "")
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 12);
  const works: CoproWork[] = [];
  const procedures: string[] = [];
  let unpaid = { found: false, amount: null as number | null, detail: null as string | null };
  let worksFund: number | null = null;
  let budget: number | null = null;

  const NEW_ITEM = /^(?:r[ée]solution|question|point)\s*(?:n\s*[°o]|\d)/i;
  chunks.forEach((chunk, i) => {
    // contexte : la phrase et les trois suivantes, sans déborder sur la résolution suivante
    const ctx = [chunk];
    for (const next of chunks.slice(i + 1, i + 4)) {
      if (NEW_ITEM.test(next)) break;
      ctx.push(next);
    }
    const around = ctx.join(" ");
    const isProcedure = PROC_RE.test(chunk);
    const workMatch = isProcedure ? null : chunk.match(WORK_RE);
    if (workMatch && works.length < 8) {
      const label = workMatch[1].charAt(0).toUpperCase() + workMatch[1].slice(1).toLowerCase();
      if (!works.some((w) => w.label.toLowerCase() === label.toLowerCase())) {
        works.push({ label, amount: amountIn(chunk) ?? amountIn(around), status: statusOf(around), when: around.match(/\b(?:en|pour|courant|d[ée]but|fin)\s+(20\d{2})\b/i)?.[1] ?? null });
      }
    }
    if (UNPAID_RE.test(chunk) && !unpaid.found) unpaid = { found: true, amount: amountIn(chunk) ?? amountIn(around), detail: clip(chunk) };
    if (isProcedure && procedures.length < 4) procedures.push(clip(chunk));
    if (worksFund === null && /fonds? (?:de|pour) travaux/i.test(chunk)) worksFund = amountIn(around);
    if (budget === null && /budget pr[ée]visionnel/i.test(chunk)) budget = amountIn(around);
  });

  const base = { works, unpaid, procedures, works_fund: worksFund, budget };
  return { ...base, level: levelOf(base), method: "mots-clés" };
}

/** Outil (schéma) que l'IA remplit en lisant un PV d'AG ou un relevé de charges. */
export const COPRO_TOOL = {
  name: "copropriete",
  description: "Points importants d'un document de copropriété pour un acheteur.",
  input_schema: {
    type: "object",
    properties: {
      works: {
        type: "array",
        description: "Travaux mentionnés (votés, refusés, reportés ou à l'étude)",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Nature des travaux, courte (ex. Ravalement de façade)" },
            amount: { type: "number", description: "Montant total pour la copropriété en euros, si écrit" },
            status: { type: "string", enum: ["voté", "refusé", "reporté", "à l'étude"] },
            when: { type: "string", description: "Année ou date prévue, si écrite" },
          },
          required: ["label", "status"],
        },
      },
      unpaid_found: { type: "boolean", description: "true si le document mentionne des impayés de charges importants" },
      unpaid_amount: { type: "number", description: "Montant total des impayés en euros, si écrit" },
      unpaid_detail: { type: "string", description: "Phrase courte qui résume les impayés" },
      procedures: { type: "array", items: { type: "string" }, description: "Procédures, contentieux ou difficultés (une phrase courte chacun)" },
      works_fund: { type: "number", description: "Montant du fonds de travaux en euros, si écrit" },
      budget: { type: "number", description: "Budget prévisionnel annuel de la copropriété en euros, si écrit" },
    },
    required: ["works", "unpaid_found", "procedures"],
  },
};

export const COPRO_SYSTEM =
  "Tu aides un acheteur immobilier à lire les documents de copropriété (procès-verbaux d'assemblée générale, relevés de charges). " +
  "Tu relèves uniquement ce qui est écrit : travaux, impayés, procédures, fonds de travaux, budget. N'invente aucun chiffre ; si une information est absente, laisse le champ vide.";

export const COPRO_INSTRUCTION = "Lis ce document de copropriété et appelle l'outil `copropriete` avec les points importants pour un acheteur.";

/** Normalise la réponse de l'IA. */
export function coproFromAi(raw: Record<string, unknown>): CoproFindings {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const statuses: CoproWorkStatus[] = ["voté", "refusé", "reporté", "à l'étude"];
  const works: CoproWork[] = (Array.isArray(raw.works) ? raw.works : [])
    .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && typeof (w as Record<string, unknown>).label === "string")
    .slice(0, 10)
    .map((w) => ({
      label: clip(String(w.label), 80),
      amount: num(w.amount),
      status: statuses.includes(w.status as CoproWorkStatus) ? (w.status as CoproWorkStatus) : "à l'étude",
      when: typeof w.when === "string" && w.when.trim() ? w.when.trim().slice(0, 20) : null,
    }));
  const procedures = (Array.isArray(raw.procedures) ? raw.procedures : []).filter((p): p is string => typeof p === "string" && p.trim().length > 3).slice(0, 5).map((p) => clip(p));
  const unpaid = { found: raw.unpaid_found === true, amount: num(raw.unpaid_amount), detail: typeof raw.unpaid_detail === "string" ? clip(raw.unpaid_detail) : null };
  const base = { works, unpaid, procedures, works_fund: num(raw.works_fund), budget: num(raw.budget) };
  return { ...base, level: levelOf(base), method: "ai" };
}

/** Regroupe les constats de plusieurs documents (plusieurs PV d'AG par exemple). */
export function mergeCopro(list: CoproFindings[]): CoproFindings | null {
  if (!list.length) return null;
  const works: CoproWork[] = [];
  for (const f of list) for (const w of f.works) if (!works.some((x) => x.label.toLowerCase() === w.label.toLowerCase())) works.push(w);
  const procedures = [...new Set(list.flatMap((f) => f.procedures))].slice(0, 6);
  const unpaidHit = list.find((f) => f.unpaid.found);
  const base = {
    works: works.slice(0, 10),
    unpaid: unpaidHit ? unpaidHit.unpaid : { found: false, amount: null, detail: null },
    procedures,
    works_fund: list.find((f) => f.works_fund !== null)?.works_fund ?? null,
    budget: list.find((f) => f.budget !== null)?.budget ?? null,
  };
  return { ...base, level: levelOf(base), method: list.some((f) => f.method === "ai") ? "ai" : "mots-clés" };
}
