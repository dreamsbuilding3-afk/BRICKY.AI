// Illustrations isométriques « 3D » des biens (immeuble, appartement, maison,
// villa, commerce, terrain, parking), dessinées en SVG pur : aucune image à
// charger, nettes à toutes les tailles, et cohérentes avec la charte Bricky.
//
// Géométrie : repère monde (x vers la droite-bas, y vers la gauche-bas, z vers
// le haut) projeté en isométrie 2:1. Les volumes sont des boîtes à 3 faces
// visibles (dessus clair, face gauche moyenne, face droite sombre).

import { classifyPropertyType } from "../data/propertyTypeClassifier";

export type IllustrationKind = "immeuble" | "appartement" | "maison" | "villa" | "commerce" | "terrain" | "parking";

const COS = 0.866;
const S = 10; // taille d'une unité monde, en pixels SVG
const CX = 100; // origine écran
const CY = 58;

type Pt = [number, number, number];

// Emprise de la scène en cours de dessin, pour cadrer le SVG au plus juste.
const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
function track(sx: number, sy: number) {
  bounds.minX = Math.min(bounds.minX, sx);
  bounds.maxX = Math.max(bounds.maxX, sx);
  bounds.minY = Math.min(bounds.minY, sy);
  bounds.maxY = Math.max(bounds.maxY, sy);
}

function p([x, y, z]: Pt): string {
  const sx = CX + (x - y) * COS * S;
  const sy = CY + (x + y) * 0.5 * S - z * S;
  track(sx, sy);
  return `${sx.toFixed(1)},${sy.toFixed(1)}`;
}

function poly(points: Pt[], fill: string, extra = ""): string {
  return `<polygon points="${points.map(p).join(" ")}" fill="${fill}"${extra}/>`;
}

type Shades = { top: string; left: string; right: string };

/** Boîte : coin arrière (x, y, z), dimensions w (axe x), d (axe y), h (hauteur). */
function box(x: number, y: number, z: number, w: number, d: number, h: number, c: Shades, stroke = true): string {
  const line = stroke ? ` stroke="rgba(0,0,0,.06)" stroke-width=".6" stroke-linejoin="round"` : "";
  return [
    poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], c.left, line),
    poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], c.right, line),
    poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], c.top, line),
  ].join("");
}

/** Rectangle sur la face gauche (plan y = yFace), de u à u+du le long de x, de v à v+dv en hauteur. */
function onLeft(x: number, yFace: number, z: number, du: number, dv: number, fill: string): string {
  return poly([[x, yFace, z], [x + du, yFace, z], [x + du, yFace, z + dv], [x, yFace, z + dv]], fill);
}

/** Rectangle sur la face droite (plan x = xFace), de y à y+du, de z à z+dv. */
function onRight(xFace: number, y: number, z: number, du: number, dv: number, fill: string): string {
  return poly([[xFace, y, z], [xFace, y + du, z], [xFace, y + du, z + dv], [xFace, y, z + dv]], fill);
}

/** Rectangle posé à plat (z constant). */
function flat(x: number, y: number, z: number, w: number, d: number, fill: string): string {
  return poly([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], fill);
}

/** Toit à deux pans, faîtage parallèle à x. */
function gableRoof(x: number, y: number, z: number, w: number, d: number, r: number, c: { front: string; back: string; gable: string }, overhang = 0.35): string {
  const x0 = x - overhang;
  const x1 = x + w + overhang;
  const y0 = y - overhang;
  const y1 = y + d + overhang;
  const ym = y + d / 2;
  return [
    poly([[x0, y0, z], [x1, y0, z], [x1, ym, z + r], [x0, ym, z + r]], c.back),
    poly([[x + w, y, z], [x + w, y + d, z], [x + w, ym, z + r]], c.gable),
    poly([[x0, y1, z], [x1, y1, z], [x1, ym, z + r], [x0, ym, z + r]], c.front),
  ].join("");
}

function tree(x: number, y: number, z: number, size = 1): string {
  const [sx, sy] = p([x, y, z]).split(",").map(Number);
  const r = 9 * size;
  track(sx - r, sy - r * 2.4);
  return [
    `<ellipse cx="${sx}" cy="${sy + 1}" rx="${r * 0.8}" ry="${r * 0.35}" fill="rgba(0,0,0,.10)"/>`,
    `<rect x="${sx - 1.2}" y="${sy - r * 0.9}" width="2.4" height="${r * 0.9}" rx="1" fill="#8a5a3c"/>`,
    `<circle cx="${sx}" cy="${sy - r * 1.35}" r="${r}" fill="#6fb36b"/>`,
    `<circle cx="${sx - r * 0.35}" cy="${sy - r * 1.55}" r="${r * 0.55}" fill="#86c97f"/>`,
  ].join("");
}

function bush(x: number, y: number, z: number): string {
  const [sx, sy] = p([x, y, z]).split(",").map(Number);
  return `<ellipse cx="${sx}" cy="${sy - 2.5}" rx="5" ry="3.6" fill="#6fb36b"/><ellipse cx="${sx - 1.5}" cy="${sy - 3.6}" rx="2.6" ry="1.8" fill="#86c97f"/>`;
}

const WALL: Shades = { top: "#fff8ef", left: "#f6e6d2", right: "#e8cfb2" };
const WHITE: Shades = { top: "#ffffff", left: "#f1f1ee", right: "#dcdcd6" };
const PLATE: Shades = { top: "#ffd9c2", left: "#ffb48a", right: "#f39565" };
const GRASS_PLATE: Shades = { top: "#cfe8c4", left: "#a9d29b", right: "#8fbf80" };
const ROOF = { front: "#ff7a3d", back: "#e8541c", gable: "#f2e1cc" };
const GLASS = "#5b6b7f";
const GLASS_LIGHT = "#8fb3d9";
const DOOR = "#a0623d";

function plate(x: number, y: number, w: number, d: number, c: Shades = PLATE): string {
  return box(x, y, -0.7, w, d, 0.7, c, false);
}

function maison(): string {
  return [
    plate(0, 0, 10, 9),
    
    box(2.2, 2.2, 0, 6, 4.6, 3.2, WALL),
    onLeft(3.0, 6.8, 0, 1.1, 2.0, DOOR),
    onLeft(4.8, 6.8, 1.0, 1.3, 1.2, GLASS_LIGHT),
    onLeft(6.6, 6.8, 1.0, 1.0, 1.2, GLASS_LIGHT),
    onRight(8.2, 3.0, 1.0, 1.2, 1.2, GLASS),
    onRight(8.2, 5.0, 1.0, 1.0, 1.2, GLASS),
    box(6.2, 3.0, 3.2, 0.8, 0.8, 2.6, { top: "#e9e1d8", left: "#d8cabb", right: "#c4b19d" }),
    gableRoof(2.2, 2.2, 3.2, 6, 4.6, 2.2, ROOF),
    tree(9.3, 1.2, 0, 0.95),
    tree(0.9, 7.6, 0, 0.8),
    bush(8.9, 8.2, 0),
  ].join("");
}

function villa(): string {
  return [
    plate(0, 0, 11, 10),
    flat(6.4, 6.6, 0.02, 3.8, 2.6, "#7cc6f2"),
    flat(6.8, 6.9, 0.03, 3.0, 0.5, "#a9dcfa"),
    box(1.4, 2.0, 0, 6.6, 4.2, 2.4, WHITE),
    box(4.2, 2.0, 2.4, 3.8, 3.4, 2.1, WHITE),
    box(1.2, 1.8, 2.4, 3.2, 4.6, 0.25, { top: "#3f3f46", left: "#2f2f35", right: "#27272c" }),
    box(4.0, 1.8, 4.5, 4.2, 3.8, 0.25, { top: "#3f3f46", left: "#2f2f35", right: "#27272c" }),
    onLeft(1.8, 6.2, 0, 2.6, 2.0, GLASS_LIGHT),
    onLeft(5.0, 6.2, 0, 2.6, 2.0, GLASS_LIGHT),
    onLeft(4.7, 5.4, 2.7, 2.9, 1.5, GLASS),
    onRight(8.0, 2.4, 0.4, 3.0, 1.6, GLASS),
    onRight(8.0, 2.6, 2.8, 2.4, 1.4, GLASS_LIGHT),
    tree(10.3, 3.0, 0, 0.8),
    tree(0.9, 8.6, 0, 0.9),
  ].join("");
}

function immeuble(): string {
  const parts = [plate(0, 0, 10, 9, GRASS_PLATE)];
  parts.push(box(2.6, 2.2, 0, 5, 4.4, 8.6, { top: "#fbe9dc", left: "#f4d5bf", right: "#e2b796" }));
  for (let floor = 0; floor < 5; floor++) {
    const z = 0.9 + floor * 1.55;
    if (floor === 0) parts.push(onLeft(4.5, 6.6, 0, 1.2, 1.6, DOOR));
    else for (let i = 0; i < 3; i++) parts.push(onLeft(3.1 + i * 1.5, 6.6, z, 0.9, 0.95, GLASS_LIGHT));
    for (let i = 0; i < 3; i++) parts.push(onRight(7.6, 2.6 + i * 1.35, z, 0.85, 0.95, GLASS));
  }
  parts.push(box(2.4, 2.0, 8.6, 5.4, 4.8, 0.35, { top: "#ff8a4d", left: "#ff6a2a", right: "#d94c14" }));
  parts.push(tree(9.2, 1.4, 0, 0.85), tree(0.9, 7.6, 0, 0.85), bush(8.6, 7.9, 0));
  return parts.join("");
}

function appartement(): string {
  const parts = [plate(0, 0, 10, 9)];
  parts.push(box(2.2, 2.4, 0, 5.8, 4.2, 6.2, WALL));
  for (let floor = 0; floor < 3; floor++) {
    const z = 0.8 + floor * 1.85;
    parts.push(onLeft(2.8, 6.6, z, 1.4, 1.1, GLASS_LIGHT));
    parts.push(onLeft(5.6, 6.6, z, 1.4, 1.1, GLASS_LIGHT));
    parts.push(onRight(8.0, 3.0, z, 1.0, 1.1, GLASS));
    parts.push(onRight(8.0, 4.9, z, 1.0, 1.1, GLASS));
    if (floor > 0) parts.push(box(2.6, 6.6, z - 0.35, 2.0, 0.7, 0.3, { top: "#ffb48a", left: "#ff7a3d", right: "#e8541c" }, false));
    if (floor > 0) parts.push(box(5.4, 6.6, z - 0.35, 2.0, 0.7, 0.3, { top: "#ffb48a", left: "#ff7a3d", right: "#e8541c" }, false));
  }
  parts.push(box(2.0, 2.2, 6.2, 6.2, 4.6, 0.3, { top: "#f0dcc7", left: "#e3c6a8", right: "#cfac8b" }));
  parts.push(tree(0.9, 7.6, 0, 0.85), tree(9.3, 1.3, 0, 0.75), bush(8.8, 8.1, 0));
  return parts.join("");
}

function commerce(): string {
  const awning: string[] = [];
  for (let i = 0; i < 6; i++) {
    const x = 2.4 + i * 0.95;
    awning.push(poly([[x, 6.4, 2.5], [x + 0.95, 6.4, 2.5], [x + 0.95, 7.4, 2.0], [x, 7.4, 2.0]], i % 2 ? "#ffffff" : "#ff7a3d"));
  }
  return [
    plate(0, 0, 10, 9),
    box(2.4, 2.4, 0, 5.7, 4.0, 3.6, WALL),
    onLeft(2.9, 6.4, 0.3, 2.6, 1.8, GLASS_LIGHT),
    onLeft(6.0, 6.4, 0, 1.3, 2.1, DOOR),
    onRight(8.1, 3.0, 0.6, 2.6, 1.6, GLASS),
    ...awning,
    box(3.4, 6.2, 3.6, 3.6, 0.3, 0.9, { top: "#f6e6d2", left: "#3f3f46", right: "#2f2f35" }, false),
    box(2.2, 2.2, 3.6, 6.1, 4.4, 0.3, { top: "#f0dcc7", left: "#e3c6a8", right: "#cfac8b" }),
    box(8.4, 7.6, 0, 0.9, 0.9, 0.9, { top: "#c98a5e", left: "#a8693f", right: "#8a5532" }),
    bush(8.85, 8.05, 0.9),
    tree(0.9, 7.4, 0, 0.8),
  ].join("");
}

function terrain(): string {
  const posts: string[] = [];
  for (let i = 0; i <= 4; i++) posts.push(box(0.6 + i * 2.2, 8.2, 0, 0.3, 0.3, 1.0, { top: "#e9d3bb", left: "#c9a37f", right: "#a9825f" }, false));
  return [
    plate(0, 0, 10, 9, GRASS_PLATE),
    flat(1.5, 1.5, 0.02, 7, 6, "#bfe0b2"),
    tree(2.2, 2.0, 0, 1),
    tree(7.8, 2.4, 0, 0.8),
    ...posts,
    box(5.2, 5.0, 0, 0.25, 0.25, 2.6, { top: "#d9c2a8", left: "#a8825f", right: "#8a6a4b" }, false),
    box(4.4, 5.0, 2.0, 1.9, 0.15, 1.3, { top: "#ffffff", left: "#ff7a3d", right: "#e8541c" }, false),
  ].join("");
}

function parking(): string {
  return [
    plate(0, 0, 10, 9),
    box(2.4, 2.4, 0, 5.6, 4.2, 2.8, WALL),
    onLeft(3.0, 6.6, 0, 4.4, 2.2, "#d8d8d2"),
    ...[0.45, 0.9, 1.35, 1.8].map((z) => onLeft(3.0, 6.6, z, 4.4, 0.08, "#bdbdb6")),
    onRight(8.0, 3.2, 1.0, 1.6, 0.9, GLASS),
    box(2.2, 2.2, 2.8, 6.0, 4.6, 0.3, { top: "#ff8a4d", left: "#ff6a2a", right: "#d94c14" }),
    tree(9.3, 1.3, 0, 0.8),
    bush(8.9, 8.1, 0),
  ].join("");
}

const SCENES: Record<IllustrationKind, () => string> = { immeuble, appartement, maison, villa, commerce, terrain, parking };

export const ILLUSTRATION_LABELS: Record<IllustrationKind, string> = {
  immeuble: "Immeuble",
  appartement: "Appartement",
  maison: "Maison",
  villa: "Villa",
  commerce: "Local commercial",
  terrain: "Terrain",
  parking: "Parking",
};

/** Choisit l'illustration à partir du type enregistré, sinon du titre de l'annonce. */
export function illustrationKind(propertyType: string | null | undefined, title?: string | null): IllustrationKind {
  const text = `${title ?? ""}`.toLowerCase();
  if (/\bvilla\b|piscine|propri[ée]t[ée] de prestige/.test(text)) return "villa";
  let type = (propertyType ?? "").toLowerCase();
  if (!type && title) type = classifyPropertyType(title)?.type ?? "";
  switch (type) {
    case "immeuble":
    case "hotel":
      return "immeuble";
    case "maison":
    case "chalet":
    case "house":
      return "maison";
    case "chateau":
      return "villa";
    case "local_commercial":
      return "commerce";
    case "terrain":
      return "terrain";
    case "parking":
      return "parking";
    default:
      return "appartement";
  }
}

const cache = new Map<IllustrationKind, string>();

/** Code SVG complet de l'illustration (statique, sans donnée utilisateur). */
export function illustrationSvg(kind: IllustrationKind): string {
  const hit = cache.get(kind);
  if (hit) return hit;
  bounds.minX = Infinity; bounds.minY = Infinity; bounds.maxX = -Infinity; bounds.maxY = -Infinity;
  const body = SCENES[kind]();
  const pad = 8;
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2 + 6;
  const shadow = `<ellipse cx="${((bounds.minX + bounds.maxX) / 2).toFixed(1)}" cy="${(bounds.maxY + 3).toFixed(1)}" rx="${((bounds.maxX - bounds.minX) * 0.46).toFixed(1)}" ry="6" fill="rgba(0,0,0,.08)"/>`;
  const svg = `<svg viewBox="${(bounds.minX - pad).toFixed(1)} ${(bounds.minY - pad).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ILLUSTRATION_LABELS[kind]}">${shadow}${body}</svg>`;
  cache.set(kind, svg);
  return svg;
}
