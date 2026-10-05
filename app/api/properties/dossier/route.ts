import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { PDFDocument, PDFFont, PDFPage, PDFImage, StandardFonts, rgb } from "pdf-lib";

export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_TOP = PAGE_HEIGHT - 80;
const CONTENT_BOTTOM = 58;

// Palette mirrored from app/globals.css (--accent, --ink, --bg, --line) so the PDF matches the app's identity.
const ACCENT = rgb(1, 0.3529, 0.1216); // #ff5a1f
const ACCENT_DARK = rgb(0.7804, 0.2471, 0.0627); // #c73f10
const INK = rgb(0.0667, 0.0667, 0.0667); // #111
const INK_SOFT = rgb(0.29, 0.29, 0.29);
const MUTED = rgb(0.5412, 0.5412, 0.5255); // #8a8a86
const LINE = rgb(0.9059, 0.9059, 0.8941); // #e7e7e4
const BG_SOFT = rgb(0.9686, 0.9686, 0.9608); // #f7f7f5
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.1098, 0.4863, 0.298); // #1c7c4c
const GREEN_BG = rgb(0.9176, 0.9647, 0.9373); // #eaf6ef
const ORANGE_BG = rgb(1, 0.949, 0.9137); // #fff2e9
const RED = rgb(0.7529, 0.2235, 0.1686); // #c0392b
const RED_BG = rgb(0.9843, 0.9216, 0.9137); // #fbebe9
const AMBER_TXT = rgb(0.6275, 0.3765, 0.0627); // #a06010

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

// pdf-lib's standard Helvetica font only supports the WinAnsi (CP1252) charset and throws at
// draw time for any character outside it. Free text in this document comes from many places
// (scraped listing titles/addresses, AI-generated risk text, locale-aware number formatting)
// that can contain characters CP1252 doesn't have — most notably U+202F, the narrow no-break
// space that Node's fr-FR Intl number formatting uses as a thousands separator. Routing every
// piece of dynamic text through this sanitizer makes that whole class of crash impossible
// instead of patching one bad character at a time.
function sanitizeText(text: string): string {
  return text
    .replace(/[  -​  　]/g, " ")
    .replace(/[‌‍﻿]/g, "")
    .replace(/[^\x00-\xFF]/g, "?");
}

function fmtNum(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return sanitizeText(n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + suffix);
}

function fmtStr(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return sanitizeText(String(value));
}

async function fetchImage(origin: string, path: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${origin}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function wrapText(font: PDFFont, size: number, maxWidth: number, text: string): string[] {
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

function fitLines(font: PDFFont, size: number, maxWidth: number, text: string, maxLines: number): string[] {
  const lines = wrapText(font, size, maxWidth, text);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 0 && font.widthOfTextAtSize(last + "…", size) > maxWidth) {
    last = last.slice(0, -1).trimEnd();
  }
  kept[maxLines - 1] = last + "…";
  return kept;
}

function fitOneLine(font: PDFFont, size: number, maxWidth: number, text: string): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
    t = t.slice(0, -1).trimEnd();
  }
  return t + "…";
}

// The analysis engine stores severity as a plain English token (low/medium/high/critical/unknown —
// see lib/data/types.ts). The old PDF printed that raw token as-is, mixing English into an otherwise
// all-French document. We translate it for display and color-code defensively by keyword so an
// unrecognized future value still renders (untranslated, neutral color) instead of breaking.
function severityLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  const map: Record<string, string> = { high: "Élevée", medium: "Modérée", low: "Faible", critical: "Critique", unknown: "À vérifier" };
  return map[key] || raw;
}
function severityBg(raw: string): ReturnType<typeof rgb> {
  const key = raw.trim().toLowerCase();
  if (key === "high" || key === "critical") return RED_BG;
  if (key === "medium") return ORANGE_BG;
  if (key === "low") return GREEN_BG;
  return BG_SOFT;
}

type Fonts = { regular: PDFFont; bold: PDFFont };

/**
 * Drives the "detailed" section (page 2 onward): a fixed KV-grid opener followed by a
 * continuous flow of variable-length content. It only starts a new page when content
 * genuinely doesn't fit — never on a fixed page count — and repeats the header/footer
 * band (with "(suite)" on continuation pages) so a reader never lands on a page that
 * looks visually disconnected from the rest of the dossier.
 */
class FlowDoc {
  doc: PDFDocument;
  fonts: Fonts;
  page!: PDFPage;
  y = 0;
  sectionTitle = "Fiche d'analyse détaillée";
  propertyLabel: string;
  brandLogo: PDFImage | null;
  brandNameText: string;

  constructor(doc: PDFDocument, fonts: Fonts, propertyLabel: string, brandLogo: PDFImage | null, brandNameText: string) {
    this.doc = doc;
    this.fonts = fonts;
    this.propertyLabel = propertyLabel;
    this.brandLogo = brandLogo;
    this.brandNameText = brandNameText;
    this.newPage(false);
  }

  newPage(continuation: boolean) {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const title = this.sectionTitle + (continuation ? " (suite)" : "");
    if (this.brandLogo) {
      const w = 46;
      const h = (this.brandLogo.height / this.brandLogo.width) * w;
      this.page.drawImage(this.brandLogo, { x: MARGIN, y: PAGE_HEIGHT - 46, width: w, height: h });
    } else {
      this.page.drawText(fitOneLine(this.fonts.bold, 12, 140, this.brandNameText), { x: MARGIN, y: PAGE_HEIGHT - 38, size: 12, font: this.fonts.bold, color: INK });
    }
    this.page.drawText(title, { x: MARGIN + 58, y: PAGE_HEIGHT - 38, size: 12, font: this.fonts.bold, color: INK });
    const label = fitOneLine(this.fonts.regular, 8, 220, this.propertyLabel);
    const labelWidth = this.fonts.regular.widthOfTextAtSize(label, 8);
    this.page.drawText(label, { x: PAGE_WIDTH - MARGIN - labelWidth, y: PAGE_HEIGHT - 38, size: 8, font: this.fonts.regular, color: MUTED });
    this.page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 58 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 58 }, thickness: 0.75, color: LINE });
    this.page.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 }, thickness: 0.75, color: LINE });
    this.y = CONTENT_TOP;
  }

  ensure(space: number) {
    if (this.y - space < CONTENT_BOTTOM) this.newPage(true);
  }

  sectionAt(x: number, y: number, text: string): number {
    this.page.drawText(text, { x, y, size: 11.5, font: this.fonts.bold, color: INK });
    const tw = this.fonts.bold.widthOfTextAtSize(text, 11.5);
    this.page.drawLine({ start: { x, y: y - 5 }, end: { x: x + tw, y: y - 5 }, thickness: 2, color: ACCENT });
    return y - 22;
  }

  section(text: string) {
    this.ensure(30);
    this.y = this.sectionAt(MARGIN, this.y, text);
  }

  kvRowAt(x: number, y: number, w: number, label: string, value: string, zebra: boolean, size = 9.3): number {
    if (zebra) this.page.drawRectangle({ x, y: y - 4, width: w, height: 17, color: BG_SOFT });
    this.page.drawText(label, { x: x + 8, y, size, font: this.fonts.regular, color: INK_SOFT });
    const vw = this.fonts.bold.widthOfTextAtSize(value, size);
    this.page.drawText(value, { x: x + w - 8 - vw, y, size, font: this.fonts.bold, color: INK });
    return y - 17;
  }

  bullet(text: string, size = 9.2) {
    const w = PAGE_WIDTH - 2 * MARGIN - 14;
    const lines = wrapText(this.fonts.regular, size, w, text);
    this.ensure(lines.length * (size + 4) + 2);
    this.page.drawText("•", { x: MARGIN, y: this.y, size, font: this.fonts.bold, color: ACCENT_DARK });
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + 12, y: this.y, size, font: this.fonts.regular, color: INK_SOFT });
      this.y -= size + 4;
    }
  }

  emptyNote(text: string) {
    this.ensure(16);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 9, font: this.fonts.regular, color: MUTED });
    this.y -= 16;
  }

  checklistItem(title: string, priorityLabel: string, completed: boolean) {
    const size = 8.8;
    const w = PAGE_WIDTH - 2 * MARGIN - 14;
    const lines = wrapText(this.fonts.regular, size, w, `${title} (${priorityLabel})`);
    this.ensure(lines.length * (size + 3.5) + 4);
    const boxS = 8.5;
    const boxY = this.y - 1;
    if (completed) {
      this.page.drawRectangle({ x: MARGIN, y: boxY, width: boxS, height: boxS, color: GREEN });
      this.page.drawLine({ start: { x: MARGIN + 1.6, y: boxY + 4.2 }, end: { x: MARGIN + 3.4, y: boxY + 2.2 }, thickness: 1.1, color: WHITE });
      this.page.drawLine({ start: { x: MARGIN + 3.4, y: boxY + 2.2 }, end: { x: MARGIN + 7, y: boxY + 6.6 }, thickness: 1.1, color: WHITE });
    } else {
      this.page.drawRectangle({ x: MARGIN, y: boxY, width: boxS, height: boxS, borderColor: INK_SOFT, borderWidth: 1 });
    }
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + 14, y: this.y, size, font: this.fonts.regular, color: INK_SOFT });
      this.y -= size + 3.5;
    }
  }

  riskBox(title: string, severity: string, explanation: string, bg: ReturnType<typeof rgb>) {
    const w = PAGE_WIDTH - 2 * MARGIN;
    const lines = explanation ? wrapText(this.fonts.regular, 8.6, w - 24, explanation) : [];
    const boxH = 20 + lines.length * 11.5;
    this.ensure(boxH + 8);
    this.page.drawRectangle({ x: MARGIN, y: this.y - boxH + 12, width: w, height: boxH, color: bg });
    this.page.drawText(severity ? `${title}  —  ${severity}` : title, { x: MARGIN + 10, y: this.y, size: 9.2, font: this.fonts.bold, color: INK });
    let ty = this.y - 13;
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + 10, y: ty, size: 8.6, font: this.fonts.regular, color: INK_SOFT });
      ty -= 11.5;
    }
    this.y = ty - 6;
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "properties.dossier", maxRequests: 10, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {

  const subRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_subscription`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: authorization, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  let whiteLabel = false;
  if (subRes.ok) {
    const sub = await subRes.json();
    if (sub && sub.can_download_pdf === false) {
      return NextResponse.json(
        { error: "pdf_not_included_in_plan", message: "Le telechargement du dossier PDF necessite un abonnement Essentiel ou superieur." },
        { status: 402 },
      );
    }
    whiteLabel = Boolean(sub && sub.white_label === true);
  }

  let brandName = "Bricky.AI";
  let brandTagline = "";
  if (whiteLabel) {
    try {
      const brandRes = await fetch(`${SUPABASE_URL}/rest/v1/agency_branding?select=agency_name,agency_tagline`, {
        headers: { apikey: SUPABASE_ANON_KEY as string, Authorization: authorization },
      });
      if (brandRes.ok) {
        const brandRows = await brandRes.json();
        const brand = Array.isArray(brandRows) && brandRows[0] ? brandRows[0] : null;
        if (brand?.agency_name) brandName = sanitizeText(String(brand.agency_name));
        if (brand?.agency_tagline) brandTagline = sanitizeText(String(brand.agency_tagline));
      }
    } catch {
      // fall back to default branding
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

  const origin = request.nextUrl.origin;
  const [cadastral, urbanisme, batiment, location, riskRows, missingRows, propertyFinancials, checklistRows, logoBytes, sealBytes] = await Promise.all([
    fetchOne("property_cadastral", propertyId, authorization),
    fetchOne("property_urbanisme", propertyId, authorization),
    fetchOne("property_batiment", propertyId, authorization),
    fetchOne("property_location", propertyId, authorization),
    analysis ? fetchMany("risks", "analysis_id", String(analysis.id), authorization) : Promise.resolve([] as Record<string, unknown>[]),
    analysis ? fetchMany("missing_information", "analysis_id", String(analysis.id), authorization) : Promise.resolve([] as Record<string, unknown>[]),
    fetchOne("property_financials", propertyId, authorization),
    analysis ? fetchMany("checklist_items", "analysis_id", String(analysis.id), authorization) : Promise.resolve([] as Record<string, unknown>[]),
    whiteLabel ? Promise.resolve(null) : fetchImage(origin, "/bricky-logo.png"),
    whiteLabel ? Promise.resolve(null) : fetchImage(origin, "/mascot-avatar-round.png"),
  ]);

  const financial = (analysis?.financial_snapshot as Record<string, unknown>) || {};
  const metrics = (financial.metrics as Record<string, unknown>) || {};
  const scenarios = (financial.scenarios as Record<string, unknown>) || {};
  const decisionSnapshot = (analysis?.decision_snapshot as Record<string, unknown>) || {};
  const decision = (decisionSnapshot.decision as Record<string, unknown>) || {};
  const market = (decisionSnapshot.market as Record<string, unknown>) || {};
  const riskSnapshot = (decisionSnapshot.risk as Record<string, unknown>) || {};
  const snapshotRisks = Array.isArray(riskSnapshot.risks) ? (riskSnapshot.risks as Record<string, unknown>[]) : [];
  const allRisks = snapshotRisks.length > 0 ? snapshotRisks : riskRows;
  const actions = Array.isArray(decision.actions) ? (decision.actions as unknown[]).map(String) : [];
  const rentEstimated = Boolean(propertyFinancials?.rent_estimated);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Dossier ${brandName} - ${String(property.title || "Bien immobilier")}`);
  pdfDoc.setProducer(brandName);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular: font, bold };

  let brandLogo: PDFImage | null = null;
  let sealImage: PDFImage | null = null;
  try {
    if (logoBytes) brandLogo = await pdfDoc.embedPng(logoBytes);
    if (sealBytes) sealImage = await pdfDoc.embedPng(sealBytes);
  } catch {
    brandLogo = null;
    sealImage = null;
  }

  const propertyTitle = sanitizeText(String(property.title || "Bien immobilier"));
  const propertyAddress = fmtStr(property.address) + (property.city ? ", " + sanitizeText(String(property.city)) : "");
  const dossierRef = `BRK-${new Date(property.created_at ? String(property.created_at) : Date.now()).getFullYear()}-${String(propertyId).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const generatedDate = new Date().toLocaleDateString("fr-FR");

  // ======================================================= PAGE 1 — cover (fixed, always exactly one page)
  const cover = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cover.drawRectangle({ x: 18, y: 18, width: PAGE_WIDTH - 36, height: PAGE_HEIGHT - 36, borderColor: LINE, borderWidth: 1.2 });
  cover.drawRectangle({ x: 24, y: 24, width: PAGE_WIDTH - 48, height: PAGE_HEIGHT - 48, borderColor: ACCENT, borderWidth: 2.2 });

  let y = PAGE_HEIGHT - 62;
  if (brandLogo) {
    const w = 104;
    const h = (brandLogo.height / brandLogo.width) * w;
    cover.drawImage(brandLogo, { x: MARGIN, y: y - 8, width: w, height: h });
  } else {
    cover.drawText(fitOneLine(bold, 20, 280, brandName), { x: MARGIN, y, size: 20, font: bold, color: INK });
    if (brandTagline) cover.drawText(fitOneLine(font, 9, 280, brandTagline), { x: MARGIN, y: y - 16, size: 9, font, color: MUTED });
  }
  const refLabel = `RÉF. DOSSIER ${dossierRef}`;
  cover.drawText(refLabel, { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(refLabel, 8.5), y: y + 16, size: 8.5, font: bold, color: MUTED });
  const dateLabel = `Édité le ${generatedDate}`;
  cover.drawText(dateLabel, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(dateLabel, 8.5), y: y + 4, size: 8.5, font, color: MUTED });

  y -= 66;
  cover.drawText("DOSSIER D'ANALYSE D'INVESTISSEMENT LOCATIF", { x: MARGIN, y, size: 9.5, font: bold, color: ACCENT_DARK });
  y -= 4;
  cover.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: LINE });
  y -= 34;

  const titleLines = fitLines(bold, 22, PAGE_WIDTH - 2 * MARGIN, propertyTitle, 2);
  for (const line of titleLines) {
    cover.drawText(line, { x: MARGIN, y, size: 22, font: bold, color: INK });
    y -= 27;
  }
  y -= 2;
  cover.drawText(fitOneLine(font, 12.5, PAGE_WIDTH - 2 * MARGIN, propertyAddress), { x: MARGIN, y, size: 12.5, font, color: INK_SOFT });
  y -= 40;

  const verdictValue = decision.verdict || analysis?.verdict;
  const verdictMap: Record<string, [string, ReturnType<typeof rgb>, ReturnType<typeof rgb>]> = {
    interesting: ["INTÉRESSANT", GREEN, GREEN_BG],
    unattractive: ["PEU INTÉRESSANT", RED, RED_BG],
    review: ["À VÉRIFIER & NÉGOCIER", ACCENT_DARK, ORANGE_BG],
  };
  const [verdictLabel, verdictColor, verdictBg] = verdictMap[String(verdictValue)] || verdictMap.review;

  const boxH = 78;
  cover.drawRectangle({ x: MARGIN, y: y - boxH, width: PAGE_WIDTH - 2 * MARGIN, height: boxH, color: verdictBg, borderColor: verdictColor, borderWidth: 1.4 });
  const cx = MARGIN + 46;
  const cyCenter = y - boxH / 2;
  cover.drawEllipse({ x: cx, y: cyCenter, xScale: 30, yScale: 30, color: WHITE, borderColor: verdictColor, borderWidth: 3 });
  const scoreText = fmtStr(analysis?.overall_score);
  const scoreWidth = bold.widthOfTextAtSize(scoreText, 18);
  cover.drawText(scoreText, { x: cx - scoreWidth / 2, y: cyCenter - 6, size: 18, font: bold, color: verdictColor });
  const scoreSuffixWidth = font.widthOfTextAtSize("/ 100", 6.5);
  cover.drawText("/ 100", { x: cx - scoreSuffixWidth / 2, y: cyCenter - 16, size: 6.5, font, color: MUTED });
  const tx = MARGIN + 92;
  cover.drawText(verdictLabel, { x: tx, y: cyCenter + 8, size: 15, font: bold, color: verdictColor });
  cover.drawText(`Indice de confiance de l'analyse : ${fmtNum(analysis?.confidence_score, " %")}`, { x: tx, y: cyCenter - 8, size: 9, font, color: INK_SOFT });

  y -= boxH + 30;
  const metricsGrid: [string, string][] = [
    ["PRIX AFFICHÉ", fmtNum(property.price, " €")],
    ["SURFACE", fmtNum(property.surface_m2, " m²")],
    ["PIÈCES / CHAMBRES", `${fmtStr(property.rooms)} / ${fmtStr(property.bedrooms)}`],
    ["LOYER MENSUEL ESTIMÉ", fmtNum(metrics.monthly_rent, " €")],
    ["RENDEMENT BRUT", fmtNum(metrics.gross_yield_pct, " %")],
    ["RENDEMENT NET", fmtNum(metrics.net_yield_pct, " %")],
  ];
  const colW = (PAGE_WIDTH - 2 * MARGIN) / 3;
  const rowH = 56;
  metricsGrid.forEach(([label, value], i) => {
    const colI = i % 3;
    const rowI = Math.floor(i / 3);
    const bx = MARGIN + colI * colW;
    const by = y - rowH - rowI * rowH;
    cover.drawRectangle({ x: bx, y: by, width: colW - 8, height: rowH - 8, color: BG_SOFT });
    cover.drawText(label, { x: bx + 10, y: by + rowH - 8 - 16, size: 8, font, color: MUTED });
    cover.drawText(value, { x: bx + 10, y: by + 10, size: 15, font: bold, color: INK });
  });
  y -= 2 * rowH + 22;

  cover.drawText(`DPE ${fmtStr(property.dpe_class)}   ·   GES ${fmtStr(property.ges_class)}`, { x: MARGIN, y, size: 8.5, font, color: MUTED });
  y -= 26;

  const badges: string[] = [];
  if (cadastral) badges.push("Cadastre officiel (DGFiP)");
  if (urbanisme) badges.push("Zonage PLU / PLUi");
  if (market.status === "ready") badges.push("Valeurs DVF du marché");
  if (location) badges.push("Risques & environnement");
  if (badges.length > 0) {
    cover.drawText("SOURCES CROISÉES POUR CETTE ANALYSE", { x: MARGIN, y, size: 8, font: bold, color: MUTED });
    y -= 16;
    let bx = MARGIN;
    for (const b of badges) {
      const bw = font.widthOfTextAtSize(b, 8.2) + 26;
      cover.drawRectangle({ x: bx, y: y - 4, width: bw, height: 19, color: BG_SOFT });
      // vector checkmark — "✓" (U+2713) isn't in the WinAnsi charset the standard Helvetica
      // font supports, and pdf-lib throws at draw time for any character outside it.
      cover.drawLine({ start: { x: bx + 9, y: y + 5.5 }, end: { x: bx + 11, y: y + 3 }, thickness: 1.2, color: GREEN });
      cover.drawLine({ start: { x: bx + 11, y: y + 3 }, end: { x: bx + 15, y: y + 9 }, thickness: 1.2, color: GREEN });
      cover.drawText(b, { x: bx + 18, y: y + 1, size: 8.2, font, color: INK_SOFT });
      bx += bw + 8;
    }
    y -= 34;
  } else {
    y -= 8;
  }
  cover.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: LINE });

  y -= 46;
  const sealSize = 64;
  if (sealImage) {
    cover.drawImage(sealImage, { x: PAGE_WIDTH - MARGIN - sealSize, y: y - sealSize + 14, width: sealSize, height: sealSize });
  }
  const certifyText = whiteLabel ? "Dossier généré et vérifié automatiquement" : "Analyse générée et certifiée par l'algorithme Bricky.AI";
  cover.drawText(certifyText, { x: MARGIN, y, size: 9.5, font: bold, color: INK });
  y -= 15;
  const footNoteWidth = PAGE_WIDTH - 2 * MARGIN - (sealImage ? sealSize + 20 : 0);
  const footLines = wrapText(font, 8.3, footNoteWidth, "Ce document synthétise une analyse automatisée croisée avec les bases officielles (cadastre, PLU, DVF). Il peut être présenté à votre établissement bancaire dans le cadre d'une demande de financement.");
  for (const line of footLines) {
    cover.drawText(line, { x: MARGIN, y, size: 8.3, font, color: MUTED });
    y -= 11.5;
  }

  // ======================================================= PAGE 2+ — continuous detail flow
  const flow = new FlowDoc(pdfDoc, fonts, propertyTitle, brandLogo, brandName);

  const colGap = 18;
  const colW2 = (PAGE_WIDTH - 2 * MARGIN - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW2 + colGap;

  let ly = flow.sectionAt(leftX, flow.y, "Le bien");
  const bienRows: [string, string][] = [
    ["Adresse", propertyAddress],
    ["Surface", fmtNum(property.surface_m2, " m²")],
    ["Pièces / Chambres", `${fmtStr(property.rooms)} / ${fmtStr(property.bedrooms)}`],
    ["DPE / GES", `${fmtStr(property.dpe_class)} / ${fmtStr(property.ges_class)}`],
    ["Prix affiché", fmtNum(property.price, " €")],
  ];
  if (property.source_url) bienRows.push(["Source de l'annonce", fitOneLine(font, 9.3, colW2 - 140, sanitizeText(String(property.source_url)))]);
  bienRows.forEach(([l, v], i) => { ly = flow.kvRowAt(leftX, ly, colW2, l, v, i % 2 === 0); });
  ly -= 18;

  ly = flow.sectionAt(leftX, ly, "Valeur de marché");
  if (market.status === "ready") {
    const marketRows: [string, string][] = [
      ["Prix du bien", fmtNum(market.property_price_m2, " €/m²")],
      ["Marché médian", fmtNum(market.market_price_m2_median, " €/m²")],
      ["Valeur estimée", fmtNum(market.market_value_estimate, " €")],
      ["Écart au marché", fmtNum(market.market_gap_pct, " %")],
    ];
    marketRows.forEach(([l, v], i) => { ly = flow.kvRowAt(leftX, ly, colW2, l, v, i % 2 === 0); });
    ly -= 4;
    flow.page.drawText(`Indice de confiance : ${fmtNum(market.confidence_score, " %")}`, { x: leftX + 8, y: ly, size: 7.5, font, color: MUTED });
    ly -= 14;
  } else {
    const lines = wrapText(font, 8.5, colW2 - 16, "Bricky ne dispose pas encore de suffisamment de transactions comparables pour produire une estimation fiable. Aucune valeur n'est inventée.");
    for (const line of lines) { flow.page.drawText(line, { x: leftX + 8, y: ly, size: 8.5, font, color: MUTED }); ly -= 12; }
  }

  let ry = flow.sectionAt(rightX, flow.y, "Indicateurs financiers");
  const finRows: [string, string][] = [
    ["Loyer mensuel", fmtNum(metrics.monthly_rent, " €")],
    ["Revenu net annuel", fmtNum(metrics.annual_net_income, " €")],
    ["Rendement brut", fmtNum(metrics.gross_yield_pct, " %")],
    ["Rendement net", fmtNum(metrics.net_yield_pct, " %")],
  ];
  finRows.forEach(([l, v], i) => { ry = flow.kvRowAt(rightX, ry, colW2, l, v, i % 2 === 0); });
  ry -= 4;
  if (metrics.monthly_rent != null) {
    const note = rentEstimated ? "Loyer estimé (ANIL) — à vérifier" : "Loyer déclaré par l'utilisateur";
    const noteColor = rentEstimated ? AMBER_TXT : MUTED;
    for (const line of wrapText(font, 7.5, colW2 - 16, note)) { flow.page.drawText(line, { x: rightX + 8, y: ry, size: 7.5, font, color: noteColor }); ry -= 10; }
  }
  ry -= 8;

  const scenarioKeys = ["conservative", "base", "optimistic"] as const;
  const scenarioLabels: Record<string, string> = { base: "Base", conservative: "Conservateur", optimistic: "Optimiste" };
  const hasScenarios = scenarioKeys.some((k) => scenarios[k]);
  if (hasScenarios) {
    ry = flow.sectionAt(rightX, ry, "Scénarios de rendement net");
    scenarioKeys.forEach((k, i) => {
      const s = scenarios[k] as Record<string, unknown> | undefined;
      if (s) ry = flow.kvRowAt(rightX, ry, colW2, scenarioLabels[k], fmtNum(s.net_yield, " %"), i % 2 === 0);
    });
  }

  flow.y = Math.min(ly, ry) - 22;

  flow.section("Ce qu'il faut faire");
  if (actions.length > 0) actions.forEach((a) => flow.bullet(sanitizeText(a)));
  else flow.emptyNote("Aucune action spécifique identifiée.");
  flow.y -= 10;

  flow.section("Points de vigilance");
  if (allRisks.length > 0) {
    for (const r of allRisks) {
      const title = sanitizeText(String(r.title || "Risque"));
      const severityRaw = sanitizeText(String(r.severity || ""));
      const detail = sanitizeText(String(r.explanation || r.impact || ""));
      flow.riskBox(title, severityRaw ? severityLabel(severityRaw) : "", detail && detail !== "undefined" ? detail : "", severityBg(severityRaw));
    }
  } else {
    flow.emptyNote("Aucun risque identifié à ce stade.");
  }
  flow.y -= 6;

  if (missingRows.length > 0) {
    flow.section("Données manquantes à vérifier");
    for (const m of missingRows) flow.bullet(sanitizeText(`${String(m.label || m.field_key)} — ${String(m.suggested_question || m.impact || "à vérifier avant décision")}`));
    flow.y -= 10;
  }

  if (checklistRows.length > 0) {
    flow.section("Checklist de vérification");
    const priorityLabel = (p: unknown) => (p === "critical" ? "Critique" : p === "high" ? "Prioritaire" : "À vérifier");
    for (const item of checklistRows) flow.checklistItem(sanitizeText(String(item.title)), priorityLabel(item.priority), Boolean(item.completed));
    flow.y -= 10;
  }

  flow.section("Données foncières et urbanisme");
  flow.ensure(50);
  const foncierColW = (PAGE_WIDTH - 2 * MARGIN - 14) / 2;
  const fx0 = MARGIN;
  const fx1 = MARGIN + foncierColW + 14;
  flow.page.drawText("Cadastre", { x: fx0, y: flow.y, size: 9, font: bold, color: INK });
  flow.page.drawText("Zonage PLU / PLUi", { x: fx1, y: flow.y, size: 9, font: bold, color: INK });
  let yy0 = flow.y - 14;
  let yy1 = flow.y - 14;
  if (cadastral) {
    const lines = [
      `Parcelle ${fmtStr(cadastral.section)} ${fmtStr(cadastral.parcel_number)} — commune ${fmtStr(cadastral.commune_code)}`,
      cadastral.parcel_area_m2 != null ? `Surface parcelle : ${fmtNum(cadastral.parcel_area_m2, " m²")}` : `Référence : ${fmtStr(cadastral.parcel_id)}`,
      `Source : ${fmtStr(cadastral.source)}`,
    ];
    for (const line of lines) { for (const wrapped of wrapText(font, 8.6, foncierColW, line)) { flow.page.drawText(wrapped, { x: fx0, y: yy0, size: 8.6, font, color: INK_SOFT }); yy0 -= 11; } }
  } else {
    flow.page.drawText("Parcelle non identifiée pour ce bien.", { x: fx0, y: yy0, size: 8.6, font, color: MUTED }); yy0 -= 11;
  }
  if (urbanisme) {
    const label = urbanisme.zone_type ? `${fmtStr(urbanisme.zone_label)} (${sanitizeText(String(urbanisme.zone_type))})` : fmtStr(urbanisme.zone_label);
    for (const line of wrapText(font, 8.6, foncierColW, label)) { flow.page.drawText(line, { x: fx1, y: yy1, size: 8.6, font, color: INK_SOFT }); yy1 -= 11; }
    if (urbanisme.destination_dominante) { for (const line of wrapText(font, 8.6, foncierColW, `Destination : ${fmtStr(urbanisme.destination_dominante)}`)) { flow.page.drawText(line, { x: fx1, y: yy1, size: 8.6, font, color: INK_SOFT }); yy1 -= 11; } }
    for (const line of wrapText(font, 8.6, foncierColW, `Source : ${fmtStr(urbanisme.source)}. À vérifier en mairie.`)) { flow.page.drawText(line, { x: fx1, y: yy1, size: 8.6, font, color: MUTED }); yy1 -= 11; }
  } else {
    flow.page.drawText("Zonage non identifié pour ce bien.", { x: fx1, y: yy1, size: 8.6, font, color: MUTED }); yy1 -= 11;
  }
  if (batiment && (batiment.hauteur_m != null || batiment.nature || batiment.usage_1)) {
    flow.y = Math.min(yy0, yy1) - 6;
    flow.ensure(40);
    flow.page.drawText("Bâti (BD TOPO®)", { x: fx0, y: flow.y, size: 9, font: bold, color: INK });
    let byy = flow.y - 14;
    const batLines = [
      `${fmtStr(batiment.nature)}${batiment.usage_1 ? ` · ${sanitizeText(String(batiment.usage_1))}` : ""}`,
      batiment.hauteur_m != null ? `Hauteur estimée : ${fmtNum(batiment.hauteur_m, " m")}${batiment.nombre_etages != null ? ` (~${sanitizeText(String(batiment.nombre_etages))} niveaux)` : ""}` : "",
      batiment.nombre_logements != null ? `Logements recensés : ${fmtStr(batiment.nombre_logements)}` : "",
    ].filter(Boolean);
    for (const line of batLines) { for (const wrapped of wrapText(font, 8.6, PAGE_WIDTH - 2 * MARGIN, line)) { flow.page.drawText(wrapped, { x: fx0, y: byy, size: 8.6, font, color: INK_SOFT }); byy -= 11; } }
    flow.y = byy - 16;
  } else {
    flow.y = Math.min(yy0, yy1) - 16;
  }

  flow.section("Localisation et environnement");
  const pois = location && Array.isArray(location.pois) ? (location.pois as Record<string, unknown>[]) : [];
  if (pois.length > 0) {
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const poi of pois) {
      const cat = sanitizeText(String(poi.category_label || poi.category || "Autres"));
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(poi);
    }
    const cats = Object.keys(grouped);
    const gColW = (PAGE_WIDTH - 2 * MARGIN - 14 * 2) / 3;
    for (let i = 0; i < cats.length; i += 3) {
      const rowCats = cats.slice(i, i + 3);
      flow.ensure(60);
      const rowTop = flow.y;
      let rowBottom = rowTop;
      rowCats.forEach((cat, j) => {
        const gx = MARGIN + j * (gColW + 14);
        flow.page.drawText(`${cat} (${grouped[cat].length})`, { x: gx, y: rowTop, size: 8.8, font: bold, color: INK });
        let gy = rowTop - 13;
        for (const poi of grouped[cat].slice(0, 5)) {
          for (const line of wrapText(font, 8.2, gColW, `• ${fmtStr(poi.name)} — ${fmtNum(poi.distance_m, " m")}`)) {
            flow.page.drawText(line, { x: gx, y: gy, size: 8.2, font, color: INK_SOFT });
            gy -= 10.5;
          }
        }
        rowBottom = Math.min(rowBottom, gy);
      });
      flow.y = rowBottom - 8;
    }
  } else {
    flow.emptyNote(location ? "Aucun point d'intérêt répertorié à proximité." : "Localisation non encore calculée pour ce bien.");
  }

  flow.ensure(40);
  flow.page.drawLine({ start: { x: MARGIN, y: flow.y }, end: { x: PAGE_WIDTH - MARGIN, y: flow.y }, thickness: 0.75, color: LINE });
  flow.y -= 14;
  const disclaimer = `Ce dossier a été généré automatiquement par ${brandName} à partir des données disponibles au moment de l'analyse. Les informations foncières, d'urbanisme et de marché doivent être vérifiées auprès des sources officielles avant toute décision d'investissement. Aucune valeur n'est inventée : les champs marqués comme non identifiés reflètent une absence de donnée fiable.`;
  for (const line of wrapText(font, 7.3, PAGE_WIDTH - 2 * MARGIN, disclaimer)) {
    flow.ensure(10);
    flow.page.drawText(line, { x: MARGIN, y: flow.y, size: 7.3, font, color: MUTED });
    flow.y -= 9.5;
  }

  // ======================================================= final pass — stamp "page X / Y" on every page
  const pages = pdfDoc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const label = `${brandName} — Document confidentiel · ${i + 1}/${total}`;
    const w = font.widthOfTextAtSize(label, 7.5);
    page.drawText(label, { x: (PAGE_WIDTH - w) / 2, y: 34, size: 7.5, font, color: MUTED });
  });

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dossier-bricky-${propertyId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
  } catch (err) {
    console.error("dossier generation failed", err);
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return NextResponse.json(
      { error: "dossier_generation_failed", message: `Erreur interne lors de la generation du dossier (${detail}). L'equipe technique a ete alertee.` },
      { status: 500 },
    );
  }
}
