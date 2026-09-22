import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

async function fetchOne(table: string, propertyId: string, authorization: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?property_id=eq.${propertyId}&select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: authorization },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function fetchMany(table: string, column: string, id: string, authorization: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${id}&select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: authorization },
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function fmtNum(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + suffix;
}

function fmtStr(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

class Layout {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page!: PDFPage;
  y = 0;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensure(space: number) {
    if (this.y - space < MARGIN) this.addPage();
  }

  wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(attempt, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }

  title(text: string) {
    this.ensure(34);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 21, font: this.bold, color: rgb(0.07, 0.07, 0.07) });
    this.y -= 30;
  }

  h1(text: string) {
    this.ensure(28);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 15, font: this.bold, color: rgb(0.07, 0.07, 0.07) });
    this.y -= 20;
  }

  h2(text: string) {
    this.ensure(20);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 12, font: this.bold, color: rgb(0.2, 0.2, 0.2) });
    this.y -= 16;
  }

  p(text: string, opts: { size?: number; color?: [number, number, number]; bold?: boolean } = {}) {
    const size = opts.size ?? 10.5;
    const font = opts.bold ? this.bold : this.font;
    const color = opts.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0.1, 0.1, 0.1);
    const lines = this.wrap(text, font, size, PAGE_WIDTH - MARGIN * 2);
    for (const line of lines) {
      this.ensure(size + 5);
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color });
      this.y -= size + 5;
    }
  }

  bullet(text: string) {
    const size = 10.5;
    const lines = this.wrap(text, this.font, size, PAGE_WIDTH - MARGIN * 2 - 14);
    lines.forEach((line, i) => {
      this.ensure(size + 5);
      this.page.drawText(i === 0 ? `•  ${line}` : `   ${line}`, { x: MARGIN, y: this.y, size, font: this.font, color: rgb(0.1, 0.1, 0.1) });
      this.y -= size + 5;
    });
  }

  spacer(amount = 10) {
    this.y -= amount;
  }

  divider() {
    this.ensure(14);
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_WIDTH - MARGIN, y: this.y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    this.y -= 14;
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "properties.dossier", maxRequests: 10, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const subRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_subscription`, {
  method: "POST",
  headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: authorization, "Content-Type": "application/json" },
  body: "{}",
  cache: "no-store",
});
if (subRes.ok) {
  const sub = await subRes.json();
  if (sub && sub.can_download_pdf === false) {
    return NextResponse.json(
      { error: "pdf_not_included_in_plan", message: "Le telechargement du dossier PDF necessite un abonnement Essentiel ou superieur." },
      { status: 402 },
    );
  }
}

let propertyId: string | undefined;
  try {
    const body = await request.json();
    propertyId = typeof body?.property_id === "string" ? body.property_id : undefined;
  } catch {
    propertyId = undefined;
  }
  if (!propertyId) {
    return NextResponse.json({ error: "property_id requis." }, { status: 400 });
  }

  const propRes = await fetch(`${SUPABASE_URL}/rest/v1/properties?id=eq.${propertyId}&select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: authorization },
  });
  const propRows = propRes.ok ? await propRes.json() : [];
  const property = Array.isArray(propRows) && propRows[0] ? propRows[0] : null;
  if (!property) {
    return NextResponse.json({ error: "Bien introuvable ou non accessible." }, { status: 404 });
  }

  const analysisRes = await fetch(
    `${SUPABASE_URL}/rest/v1/analyses?property_id=eq.${propertyId}&select=*&order=created_at.desc&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: authorization } },
  );
  const analysisRows = analysisRes.ok ? await analysisRes.json() : [];
  const analysis = Array.isArray(analysisRows) && analysisRows[0] ? analysisRows[0] : null;

  const [cadastral, urbanisme, batiment, location, riskRows, missingRows, propertyFinancials, checklistRows] = await Promise.all([
    fetchOne("property_cadastral", propertyId, authorization),
    fetchOne("property_urbanisme", propertyId, authorization),
    fetchOne("property_batiment", propertyId, authorization),
    fetchOne("property_location", propertyId, authorization),
    analysis ? fetchMany("risks", "analysis_id", String(analysis.id), authorization) : Promise.resolve([] as Record<string, unknown>[]),
    analysis ? fetchMany("missing_information", "analysis_id", String(analysis.id), authorization) : Promise.resolve([] as Record<string, unknown>[]),
    fetchOne("property_financials", propertyId, authorization),
    analysis ? fetchMany("checklist_items", "analysis_id", String(analysis.id), authorization) : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const financial = (analysis?.financial_snapshot as Record<string, unknown>) || {};
  const metrics = (financial.metrics as Record<string, unknown>) || {};
  const scenarios = (financial.scenarios as Record<string, unknown>) || {};
  const decisionSnapshot = (analysis?.decision_snapshot as Record<string, unknown>) || {};
  const decision = (decisionSnapshot.decision as Record<string, unknown>) || {};
  const market = (decisionSnapshot.market as Record<string, unknown>) || {};
  const riskSnapshot = (decisionSnapshot.risk as Record<string, unknown>) || {};
  const snapshotRisks = Array.isArray(riskSnapshot.risks) ? (riskSnapshot.risks as Record<string, unknown>[]) : [];
  const actions = Array.isArray(decision.actions) ? (decision.actions as unknown[]) : [];

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Dossier Bricky - ${String(property.title || "Bien immobilier")}`);
  pdfDoc.setProducer("Bricky.AI");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const layout = new Layout(pdfDoc, font, bold);

  layout.title("Bricky — Dossier d'analyse complet");
  layout.p(String(property.title || "Bien immobilier"), { size: 13, bold: true });
  layout.p(`${fmtStr(property.address)}${property.city ? ", " + String(property.city) : ""}`);
  layout.spacer(4);
  layout.p(`Généré le ${new Date().toLocaleDateString("fr-FR")} par Bricky.AI`, { size: 9, color: [0.5, 0.5, 0.5] });
  layout.spacer(16);
  layout.divider();

  const verdictValue = decision.verdict || analysis?.verdict;
  const verdictLabel = verdictValue === "interesting" ? "Intéressant" : verdictValue === "unattractive" ? "Peu intéressant" : "À vérifier & négocier";

  layout.h1("Synthèse de la décision");
  layout.p(`Verdict : ${verdictLabel}`, { bold: true });
  layout.p(`Score global : ${fmtNum(analysis?.overall_score, " / 100")}`);
  layout.p(`Confiance : ${fmtNum(analysis?.confidence_score, " %")}`);
  layout.spacer(10);

  layout.h1("Le bien");
  layout.p(`Prix affiché : ${fmtNum(property.price, " €")}`);
  layout.p(`Surface : ${fmtNum(property.surface_m2, " m²")}`);
  layout.p(`Pièces : ${fmtStr(property.rooms)}  ·  Chambres : ${fmtStr(property.bedrooms)}`);
  layout.p(`DPE : ${fmtStr(property.dpe_class)}  ·  GES : ${fmtStr(property.ges_class)}`);
  if (property.source_url) layout.p(`Source de l'annonce : ${String(property.source_url)}`, { size: 9, color: [0.5, 0.5, 0.5] });

  layout.addPage();
  layout.h1("Indicateurs financiers");
  layout.p(`Loyer mensuel : ${fmtNum(metrics.monthly_rent, " €")}`);
  if (propertyFinancials?.rent_estimated) {
    layout.p("Loyer estime automatiquement a partir des indicateurs de loyer ANIL (Carte des loyers) pour cette commune, non fourni par vous. A verifier par rapport a des annonces locatives comparables reelles avant toute decision.", { size: 9, color: [0.6, 0.4, 0.1] });
  } else if (metrics.monthly_rent != null) {
    layout.p("Loyer declare par l utilisateur.", { size: 9, color: [0.5, 0.5, 0.5] });
  }
  layout.p(`Revenu annuel net : ${fmtNum(metrics.annual_net_income, " €")}`);
  layout.p(`Rendement brut : ${fmtNum(metrics.gross_yield_pct, " %")}`);
  layout.p(`Rendement net : ${fmtNum(metrics.net_yield_pct, " %")}`);
  layout.spacer(10);

  const scenarioKeys = ["base", "conservative", "optimistic"] as const;
  const scenarioLabels: Record<string, string> = { base: "Base", conservative: "Conservateur", optimistic: "Optimiste" };
  const hasScenarios = scenarioKeys.some((k) => scenarios[k]);
  if (hasScenarios) {
    layout.h2("Scénarios");
    for (const key of scenarioKeys) {
      const s = scenarios[key] as Record<string, unknown> | undefined;
      if (s) layout.p(`${scenarioLabels[key]} : rendement net ${fmtNum(s.net_yield, " %")}`);
    }
    layout.spacer(10);
  }

  layout.h1("Valeur de marché");
  if (market.status === "ready") {
    layout.p(`Prix du bien : ${fmtNum(market.property_price_m2, " €/m²")}`);
    layout.p(`Marché médian : ${fmtNum(market.market_price_m2_median, " €/m²")}`);
    layout.p(`Valeur estimée : ${fmtNum(market.market_value_estimate, " €")}`);
    layout.p(`Écart au marché : ${fmtNum(market.market_gap_pct, " %")}`);
    layout.p(`Confiance : ${fmtNum(market.confidence_score, " %")}`, { size: 9, color: [0.5, 0.5, 0.5] });
  } else {
    layout.p("Bricky ne dispose pas encore de suffisamment de transactions comparables pour produire une estimation fiable. Aucune valeur n'est inventée.", { size: 9, color: [0.5, 0.5, 0.5] });
  }

  layout.addPage();
  layout.h1("Ce qu'il faut faire");
  if (actions.length > 0) {
    actions.forEach((a) => layout.bullet(String(a)));
  } else {
    layout.p("Aucune action spécifique identifiée.", { size: 9, color: [0.5, 0.5, 0.5] });
  }
  layout.spacer(10);

  layout.h1("Points de vigilance");
  const allRisks = snapshotRisks.length > 0 ? snapshotRisks : riskRows;
  if (allRisks.length > 0) {
    for (const r of allRisks) {
      const title = String(r.title || "Risque");
      const severity = String(r.severity || "");
      layout.p(`${title}${severity ? ` (${severity})` : ""}`, { bold: true });
      const detail = String(r.explanation || r.impact || "");
      if (detail && detail !== "undefined") layout.p(detail, { size: 9.5, color: [0.35, 0.35, 0.35] });
      layout.spacer(4);
    }
  } else {
    layout.p("Aucun risque identifié à ce stade.", { size: 9, color: [0.5, 0.5, 0.5] });
  }
  layout.spacer(10);

  if (missingRows.length > 0) {
    layout.h1("Données manquantes à vérifier");
    for (const m of missingRows) {
      layout.bullet(`${String(m.label || m.field_key)} — ${String(m.suggested_question || m.impact || "à vérifier avant décision")}`);
    }
    layout.spacer(10);
  }

  if (checklistRows.length > 0) {
    layout.h1("Checklist de vérification");
    const priorityLabel = (p: unknown) => (p === "critical" ? "Critique" : p === "high" ? "Prioritaire" : "À vérifier");
    for (const item of checklistRows) {
      const done = item.completed ? "[x]" : "[ ]";
      layout.bullet(`${done} ${String(item.title)} (${priorityLabel(item.priority)})`);
    }
  }

  layout.addPage();
  layout.h1("Données foncières et urbanisme");
  layout.h2("Cadastre");
  if (cadastral) {
    layout.p(`Parcelle ${fmtStr(cadastral.section)} ${fmtStr(cadastral.parcel_number)} — commune ${fmtStr(cadastral.commune_code)}`);
    layout.p(`Référence : ${fmtStr(cadastral.parcel_id)}`);
    if (cadastral.parcel_area_m2 != null) layout.p(`Surface parcelle : ${fmtNum(cadastral.parcel_area_m2, " m²")}`);
    layout.p(`Source : ${fmtStr(cadastral.source)}`, { size: 9, color: [0.5, 0.5, 0.5] });
  } else {
    layout.p("Parcelle non identifiée pour ce bien.", { size: 9, color: [0.5, 0.5, 0.5] });
  }
  layout.spacer(10);

  layout.h2("Zonage PLU / PLUi");
  if (urbanisme) {
    layout.p(`${fmtStr(urbanisme.zone_label)}${urbanisme.zone_type ? ` (${String(urbanisme.zone_type)})` : ""}`);
    if (urbanisme.destination_dominante) layout.p(`Destination dominante : ${fmtStr(urbanisme.destination_dominante)}`);
    if (urbanisme.zone_label_long) layout.p(String(urbanisme.zone_label_long), { size: 9.5, color: [0.35, 0.35, 0.35] });
    layout.p(`Source : ${fmtStr(urbanisme.source)}. À vérifier auprès de la mairie avant tout projet.`, { size: 9, color: [0.5, 0.5, 0.5] });
  } else {
    layout.p("Zonage non identifié pour ce bien.", { size: 9, color: [0.5, 0.5, 0.5] });
  }
  layout.spacer(10);

  layout.h2("Bâti (BD TOPO®)");
  if (batiment && (batiment.hauteur_m != null || batiment.nature || batiment.usage_1)) {
    layout.p(`${fmtStr(batiment.nature)}${batiment.usage_1 ? ` · ${String(batiment.usage_1)}` : ""}`);
    if (batiment.hauteur_m != null) layout.p(`Hauteur estimée : ${fmtNum(batiment.hauteur_m, " m")}${batiment.nombre_etages != null ? ` (~${String(batiment.nombre_etages)} niveaux)` : ""}`);
    if (batiment.nombre_logements != null) layout.p(`Logements recensés : ${fmtStr(batiment.nombre_logements)}`);
    if (batiment.date_construction) layout.p(`Construction : ${fmtStr(batiment.date_construction)}`);
    layout.p("Empreinte indicative — à recouper avec le relevé de géomètre avant tout projet.", { size: 9, color: [0.5, 0.5, 0.5] });
  } else {
    layout.p("Bâti non identifié pour ce bien.", { size: 9, color: [0.5, 0.5, 0.5] });
  }

  layout.addPage();
  layout.h1("Localisation et environnement");
  if (location) {
    layout.p(`Position : ${fmtNum(location.latitude)}, ${fmtNum(location.longitude)}`, { size: 9, color: [0.5, 0.5, 0.5] });
    const pois = Array.isArray(location.pois) ? (location.pois as Record<string, unknown>[]) : [];
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const poi of pois) {
      const cat = String(poi.category_label || poi.category || "Autres");
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(poi);
    }
    const categories = Object.keys(grouped);
    if (categories.length > 0) {
      for (const cat of categories) {
        layout.h2(`${cat} (${grouped[cat].length})`);
        for (const poi of grouped[cat].slice(0, 8)) {
          layout.p(`• ${fmtStr(poi.name)} — ${fmtNum(poi.distance_m, " m")}`, { size: 9.5 });
        }
        layout.spacer(6);
      }
    } else {
      layout.p("Aucun point d'intérêt répertorié à proximité.", { size: 9, color: [0.5, 0.5, 0.5] });
    }
  } else {
    layout.p("Localisation non encore calculée pour ce bien.", { size: 9, color: [0.5, 0.5, 0.5] });
  }

  layout.spacer(20);
  layout.divider();
  layout.p("Ce dossier a été généré automatiquement par Bricky.AI à partir des données disponibles au moment de l'analyse. Les informations foncières, d'urbanisme et de marché doivent être vérifiées auprès des sources officielles avant toute décision d'investissement. Bricky n'invente aucune valeur : les champs marqués comme non identifiés reflètent une absence de donnée fiable.", { size: 8.5, color: [0.55, 0.55, 0.55] });

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dossier-bricky-${propertyId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
