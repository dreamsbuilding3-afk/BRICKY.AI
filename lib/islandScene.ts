// Île flottante 3D de Bricky (three.js, low-poly « premium »).
// - Une parcelle par type de bien ; un badge flottant indique le nombre d'analyses.
// - La maison de la mascotte (fantôme orange) occupe le centre.
// - Rendu transparent : le titre de la section reste visible derrière l'île.
// Ce module n'est chargé qu'à la demande (import dynamique) pour ne pas alourdir les pages.
import * as THREE from "three";

export type IslandKind = "appartement" | "immeuble" | "maison" | "villa" | "commerce" | "terrain";
export const ISLAND_KINDS: IslandKind[] = ["appartement", "immeuble", "maison", "villa", "commerce", "terrain"];
export type IslandCounts = Partial<Record<IslandKind, number>>;

export type IslandOptions = {
  counts: IslandCounts;
  /** "demo" : vitrine de l'accueil ; "user" : île réelle de l'utilisateur (parcelles vides visibles). */
  mode: "demo" | "user";
  dark: boolean;
  reducedMotion: boolean;
  compact: boolean;
  /** Types dont le compteur a augmenté depuis la dernière visite : apparition mise en valeur. */
  fresh?: IslandKind[];
  labels: Record<IslandKind, { one: string; many: string }>;
  mascotUrl: string;
};

export type IslandHandle = {
  setDark(dark: boolean): void;
  setActive(active: boolean): void;
  dispose(): void;
};

// ---------- utilitaires ----------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const easeOutBack = (t: number) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function jitter(geo: THREE.BufferGeometry, amount: number, rand: () => number, keepTop?: number) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  // Les sommets partagés (même position) doivent bouger ensemble pour éviter les fissures.
  const moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let d = moved.get(key);
    if (!d) {
      const lockY = keepTop !== undefined && y >= keepTop - 1e-3;
      d = [(rand() - 0.5) * amount, lockY ? 0 : (rand() - 0.5) * amount, (rand() - 0.5) * amount];
      moved.set(key, d);
    }
    pos.setXYZ(i, x + d[0], y + d[1], z + d[2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function colorByHeight(geo: THREE.BufferGeometry, top: THREE.Color, bottom: THREE.Color, yTop: number, yBottom: number) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (yTop - pos.getY(i)) / (yTop - yBottom)));
    c.copy(top).lerp(bottom, Math.pow(t, 0.8));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

// ---------- matériaux partagés ----------
function makeMaterials() {
  const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra });
  return {
    grass: std("#a3cf7d"),
    grassDark: std("#86bb63"),
    soil: std("#c98a5e"),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
    wall: std("#f6f1e8", { roughness: 0.75 }),
    wallWarm: std("#efe2cf", { roughness: 0.8 }),
    wallStone: std("#e4d6bf", { roughness: 0.9 }),
    trim: std("#ffffff", { roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: "#6d93a8", roughness: 0.22, metalness: 0.05, emissive: new THREE.Color("#ffb468"), emissiveIntensity: 0, flatShading: true }),
    roofTerracotta: std("#d4673b"),
    roofZinc: std("#76828c", { roughness: 0.6, metalness: 0.15 }),
    roofDark: std("#3b3f45", { roughness: 0.7 }),
    accent: std("#ff5a1f", { roughness: 0.55 }),
    accentSoft: std("#ffd2bd"),
    wood: std("#a86f45"),
    woodDark: std("#7a5136"),
    concrete: std("#d9d2c6"),
    path: std("#eadfca"),
    water: new THREE.MeshStandardMaterial({ color: "#69c3e2", roughness: 0.15, metalness: 0.1, emissive: new THREE.Color("#2a8fb8"), emissiveIntensity: 0.15, flatShading: true }),
    leaf: std("#6eae53"),
    leafLight: std("#8cc565"),
    leafDark: std("#4f8f43"),
    trunk: std("#7a5136"),
    stone: std("#b9b3a8"),
    flowerA: std("#ff8a4d"),
    flowerB: std("#fff4e6"),
    cloud: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.35, roughness: 1, flatShading: true, transparent: true, opacity: 0.9 }),
    lamp: new THREE.MeshStandardMaterial({ color: "#ffd9a8", emissive: new THREE.Color("#ffb468"), emissiveIntensity: 0.25 }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Toit à deux pans (prisme) posé à la hauteur y. */
function gableRoof(w: number, d: number, h: number, mat: THREE.Material, y: number, overhang = 0.12) {
  const shape = new THREE.Shape();
  const hw = w / 2 + overhang;
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(0, h);
  shape.lineTo(-hw, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(d + overhang * 2) / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Fenêtres sur les quatre façades d'un volume (w × d), par étages. */
function windows(g: THREE.Group, m: Mats, w: number, d: number, y0: number, floors: number, floorH: number, colsW: number, colsD: number, winW = 0.22, winH = 0.3) {
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * floorH + floorH * 0.32;
    for (let c = 0; c < colsW; c++) {
      const x = -w / 2 + (w / colsW) * (c + 0.5);
      g.add(box(winW, winH, 0.04, m.glass, x, y, d / 2 + 0.01));
      g.add(box(winW, winH, 0.04, m.glass, x, y, -d / 2 - 0.01));
    }
    for (let c = 0; c < colsD; c++) {
      const z = -d / 2 + (d / colsD) * (c + 0.5);
      g.add(box(0.04, winH, winW, m.glass, w / 2 + 0.01, y, z));
      g.add(box(0.04, winH, winW, m.glass, -w / 2 - 0.01, y, z));
    }
  }
}

function tree(m: Mats, rand: () => number, kind: "round" | "pine" = rand() > 0.45 ? "round" : "pine", s = 0.8 + rand() * 0.5) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 0.5 * s, 6), m.trunk);
  trunk.position.y = 0.25 * s;
  trunk.castShadow = true;
  g.add(trunk);
  if (kind === "pine") {
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((0.42 - i * 0.1) * s, 0.55 * s, 7), i === 1 ? m.leafDark : m.leaf);
      cone.position.y = (0.55 + i * 0.3) * s;
      cone.rotation.y = rand() * Math.PI;
      cone.castShadow = true;
      g.add(cone);
    }
  } else {
    const geo = new THREE.IcosahedronGeometry(0.42 * s, 0);
    jitter(geo, 0.08 * s, rand);
    const crown = new THREE.Mesh(geo, rand() > 0.5 ? m.leaf : m.leafLight);
    crown.position.y = 0.78 * s;
    crown.castShadow = true;
    g.add(crown);
    if (rand() > 0.4) {
      const g2 = new THREE.IcosahedronGeometry(0.26 * s, 0);
      const c2 = new THREE.Mesh(g2, m.leafDark);
      c2.position.set(0.22 * s, 0.6 * s, 0.1 * s);
      c2.castShadow = true;
      g.add(c2);
    }
  }
  return g;
}

function rock(m: Mats, rand: () => number, s = 0.2 + rand() * 0.2) {
  const geo = new THREE.DodecahedronGeometry(s, 0);
  jitter(geo, s * 0.35, rand);
  const r = new THREE.Mesh(geo, m.stone);
  r.scale.y = 0.6;
  r.position.y = s * 0.3;
  r.castShadow = true;
  r.receiveShadow = true;
  return r;
}

// ---------- bâtiments ----------
function buildPenthouse(m: Mats) {
  const g = new THREE.Group();
  const floors = 5, fh = 0.42, w = 1.15, d = 1.15;
  g.add(box(w + 0.1, 0.14, d + 0.1, m.concrete));
  g.add(box(w, floors * fh, d, m.wall, 0, 0.14));
  windows(g, m, w, d, 0.14, floors, fh, 3, 3, 0.2, 0.24);
  // bandeaux d'étage
  for (let f = 1; f < floors; f++) g.add(box(w + 0.05, 0.04, d + 0.05, m.trim, 0, 0.14 + f * fh));
  const top = 0.14 + floors * fh;
  // penthouse vitré en retrait + terrasse
  g.add(box(w + 0.12, 0.06, d + 0.12, m.trim, 0, top));
  g.add(box(0.78, 0.42, 0.72, m.glass, -0.12, top + 0.06, -0.12));
  g.add(box(0.9, 0.05, 0.84, m.roofDark, -0.12, top + 0.48, -0.12));
  g.add(box(w + 0.12, 0.12, 0.03, m.glass, 0, top + 0.06, d / 2 + 0.05));
  const parasol = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.1, 8), m.accent);
  parasol.position.set(0.36, top + 0.42, 0.36);
  parasol.castShadow = true;
  g.add(parasol);
  g.add(box(0.02, 0.3, 0.02, m.trim, 0.36, top + 0.06, 0.36));
  return g;
}

function buildImmeuble(m: Mats) {
  const g = new THREE.Group();
  const floors = 4, fh = 0.4, w = 1.9, d = 1.05;
  g.add(box(w, 0.42, d, m.wallStone)); // rez-de-chaussée en pierre
  for (let i = 0; i < 4; i++) g.add(box(0.3, 0.3, 0.04, m.glass, -0.72 + i * 0.48, 0.02, d / 2 + 0.01));
  g.add(box(w, (floors - 1) * fh, d, m.wallWarm, 0, 0.42));
  windows(g, m, w, d, 0.42, floors - 1, fh, 5, 2, 0.18, 0.26);
  // balcons filants
  for (let f = 0; f < floors - 1; f++) g.add(box(w + 0.06, 0.035, 0.16, m.roofDark, 0, 0.42 + f * fh + 0.08, d / 2 + 0.08));
  // toit mansardé en zinc
  const roofY = 0.42 + (floors - 1) * fh;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.04, 0);
  shape.lineTo(w / 2 + 0.04, 0);
  shape.lineTo(w / 2 - 0.22, 0.42);
  shape.lineTo(-w / 2 + 0.22, 0.42);
  shape.lineTo(-w / 2 - 0.04, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.08, bevelEnabled: false });
  geo.translate(0, 0, -(d + 0.08) / 2);
  const roof = new THREE.Mesh(geo, m.roofZinc);
  roof.position.y = roofY;
  roof.castShadow = true;
  g.add(roof);
  for (let i = 0; i < 3; i++) {
    const dorm = box(0.18, 0.2, 0.12, m.trim, -0.55 + i * 0.55, roofY + 0.08, d / 2 - 0.05);
    g.add(dorm);
  }
  g.add(box(0.12, 0.28, 0.12, m.wallStone, 0.6, roofY + 0.3, -0.15));
  return g;
}

function buildMaison(m: Mats) {
  const g = new THREE.Group();
  const w = 1.2, d = 0.95, h = 0.75;
  g.add(box(w, h, d, m.wall));
  g.add(gableRoof(w, d, 0.5, m.roofTerracotta, h));
  g.add(box(0.24, 0.42, 0.04, m.wood, 0, 0, d / 2 + 0.01));
  g.add(box(0.26, 0.24, 0.04, m.glass, -0.38, 0.28, d / 2 + 0.01));
  g.add(box(0.26, 0.24, 0.04, m.glass, 0.38, 0.28, d / 2 + 0.01));
  g.add(box(0.04, 0.24, 0.26, m.glass, w / 2 + 0.01, 0.28, 0));
  g.add(box(0.04, 0.24, 0.26, m.glass, -w / 2 - 0.01, 0.28, 0));
  g.add(box(0.14, 0.4, 0.14, m.wallStone, 0.32, h + 0.12, -0.18));
  // jardinet + clôture
  for (let i = 0; i < 7; i++) g.add(box(0.035, 0.16, 0.035, m.trim, -0.66 + i * 0.22, 0, d / 2 + 0.42));
  g.add(box(1.36, 0.03, 0.03, m.trim, 0, 0.12, d / 2 + 0.42));
  return g;
}

function buildVilla(m: Mats) {
  const g = new THREE.Group();
  g.add(box(1.9, 0.08, 1.5, m.concrete, 0, 0, -0.1)); // dalle
  g.add(box(1.5, 0.5, 0.9, m.wall, -0.15, 0.08, -0.25));
  g.add(box(1.15, 0.42, 0.8, m.wall, 0.2, 0.58, -0.32));
  g.add(box(1.3, 0.05, 1.0, m.roofDark, 0.2, 1.0, -0.3));
  g.add(box(1.7, 0.05, 1.08, m.trim, -0.15, 0.58, -0.22));
  // grandes baies vitrées
  g.add(box(1.1, 0.38, 0.04, m.glass, -0.2, 0.12, 0.21));
  g.add(box(0.85, 0.3, 0.04, m.glass, 0.25, 0.64, 0.09));
  g.add(box(0.04, 0.3, 0.5, m.glass, 0.78, 0.64, -0.32));
  // bardage bois
  g.add(box(0.36, 0.5, 0.92, m.wood, 0.62, 0.08, -0.25));
  // piscine
  g.add(box(1.25, 0.06, 0.5, m.trim, -0.2, 0.06, 0.48));
  const pool = box(1.1, 0.03, 0.38, m.water, -0.2, 0.1, 0.48);
  g.add(pool);
  g.add(box(0.16, 0.04, 0.36, m.wood, 0.62, 0.08, 0.48)); // transat
  // palmier stylisé
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.9, 6), m.trunk);
  trunk.position.set(-0.98, 0.45, 0.42);
  trunk.rotation.z = 0.12;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 4), m.leaf);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(-0.92 + Math.cos(a) * 0.2, 0.9, 0.42 + Math.sin(a) * 0.2);
    leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

function buildCommerce(m: Mats) {
  const g = new THREE.Group();
  const w = 1.3, d = 0.9;
  g.add(box(w, 0.9, d, m.wallWarm));
  g.add(box(1.02, 0.46, 0.04, m.glass, 0, 0.06, d / 2 + 0.01));
  // store rayé orange / blanc
  for (let i = 0; i < 6; i++) {
    const s = box(w / 6, 0.04, 0.32, i % 2 ? m.trim : m.accent, -w / 2 + (w / 6) * (i + 0.5), 0.56, d / 2 + 0.15);
    s.rotation.x = 0.35;
    g.add(s);
  }
  g.add(box(0.7, 0.16, 0.05, m.accent, 0, 0.7, d / 2 + 0.02)); // enseigne
  g.add(box(w + 0.08, 0.06, d + 0.08, m.trim, 0, 0.9));
  g.add(box(0.3, 0.12, 0.3, m.concrete, -0.3, 0.96, -0.15)); // clim
  return g;
}

function buildTerrain(m: Mats, rand: () => number) {
  const g = new THREE.Group();
  const slab = box(1.5, 0.03, 1.2, m.grassDark);
  g.add(slab);
  for (let i = 0; i < 4; i++) {
    const x = i % 2 ? 0.72 : -0.72, z = i < 2 ? 0.57 : -0.57;
    g.add(box(0.05, 0.22, 0.05, m.wood, x, 0, z));
  }
  g.add(box(1.46, 0.025, 0.025, m.trim, 0, 0.17, 0.57));
  g.add(box(1.46, 0.025, 0.025, m.trim, 0, 0.17, -0.57));
  g.add(box(0.025, 0.025, 1.14, m.trim, 0.72, 0.17, 0));
  g.add(box(0.025, 0.025, 1.14, m.trim, -0.72, 0.17, 0));
  // panneau « à vendre »
  g.add(box(0.04, 0.5, 0.04, m.woodDark, 0.45, 0, 0.3));
  g.add(box(0.36, 0.22, 0.04, m.accent, 0.45, 0.36, 0.32));
  const t = tree(m, rand, "round", 0.55);
  t.position.set(-0.35, 0, -0.2);
  g.add(t);
  return g;
}

/** Fondations vides (mode utilisateur, type pas encore analysé). */
function buildEmpty(m: Mats) {
  const g = new THREE.Group();
  g.add(box(1.1, 0.06, 0.9, m.concrete));
  for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) {
    g.add(box(0.05, 0.28, 0.05, m.accentSoft, x, 0.06, z));
  }
  return g;
}

function buildMascotHome(m: Mats) {
  const g = new THREE.Group();
  g.add(box(0.95, 0.62, 0.8, m.wallWarm));
  g.add(gableRoof(0.95, 0.8, 0.45, m.accent, 0.62, 0.1));
  g.add(box(0.22, 0.38, 0.04, m.woodDark, 0, 0, 0.41));
  g.add(box(0.2, 0.18, 0.04, m.glass, 0.3, 0.3, 0.41));
  g.add(box(0.12, 0.3, 0.12, m.wallStone, -0.26, 0.85, -0.12));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.lamp);
  lamp.position.set(-0.2, 0.42, 0.46);
  g.add(lamp);
  return g;
}

function cloud(m: Mats, rand: () => number) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const geo = new THREE.IcosahedronGeometry(0.35 + rand() * 0.35, 1);
    const p = new THREE.Mesh(geo, m.cloud);
    p.position.set(i * 0.45 - n * 0.22, rand() * 0.18, (rand() - 0.5) * 0.3);
    p.scale.y = 0.7;
    g.add(p);
  }
  return g;
}

/** Texture de la mascotte avec le bas fondu (effet fantôme). */
function mascotTexture(url: string, onReady: () => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 256, 256);
    ctx.globalCompositeOperation = "destination-out";
    const grad = ctx.createLinearGradient(0, 150, 0, 230);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 150, 256, 106);
    tex.needsUpdate = true;
    onReady();
  };
  img.src = url;
  return tex;
}

// ---------- scène ----------
const SLOT_LAYOUT: Record<IslandKind, { angle: number; r: number; rot: number }> = {
  appartement: { angle: -0.35, r: 3.15, rot: -0.2 },
  villa: { angle: 0.75, r: 3.25, rot: 0.6 },
  immeuble: { angle: 1.85, r: 3.2, rot: 1.75 },
  commerce: { angle: 2.95, r: 3.1, rot: 2.9 },
  maison: { angle: 4.05, r: 3.15, rot: 4.0 },
  terrain: { angle: 5.1, r: 3.2, rot: 5.1 },
};

export function createIsland(canvas: HTMLCanvasElement, overlay: HTMLElement, opts: IslandOptions): IslandHandle {
  const rand = rng(20261029);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.compact ? 1.6 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  const m = makeMaterials();

  // Lumières
  const hemi = new THREE.HemisphereLight("#dff1ff", "#c99b77", 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
  sun.position.set(7, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.compact ? 1024 : 2048, opts.compact ? 1024 : 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#ffd0b3", 0.6);
  rim.position.set(-8, 3, -6);
  scene.add(rim);
  // lumière douce par en dessous pour ne pas boucher la roche sous l'île
  const under = new THREE.DirectionalLight("#ffd6bd", 0.55);
  under.position.set(2, -8, 6);
  scene.add(under);
  const homeLight = new THREE.PointLight("#ffb468", 0, 4, 2);
  homeLight.position.set(0, 0.9, 0.9);

  // Groupe qui flotte et tourne
  const floater = new THREE.Group();
  const island = new THREE.Group();
  floater.add(island);
  scene.add(floater);

  // Plateau d'herbe (dessus plat pour poser les bâtiments)
  const topGeo = new THREE.CylinderGeometry(5.9, 5.7, 0.45, 22, 1);
  jitter(topGeo, 0.25, rand, 0.225);
  const top = new THREE.Mesh(topGeo, m.grass);
  top.position.y = -0.225;
  top.receiveShadow = true;
  island.add(top);
  const soilGeo = new THREE.CylinderGeometry(5.75, 5.0, 0.7, 20, 1);
  jitter(soilGeo, 0.3, rand);
  const soil = new THREE.Mesh(soilGeo, m.soil);
  soil.position.y = -0.8;
  soil.receiveShadow = true;
  island.add(soil);
  // Roche en dessous (cône irrégulier, dégradé terre cuite -> ardoise)
  const rockGeo = new THREE.ConeGeometry(5.1, 5.4, 16, 5);
  rockGeo.rotateX(Math.PI);
  jitter(rockGeo, 0.75, rand);
  colorByHeight(rockGeo, new THREE.Color("#d08a5c"), new THREE.Color("#8a6f73"), 2.7, -2.7);
  const rockMesh = new THREE.Mesh(rockGeo, m.rock);
  rockMesh.position.y = -3.8;
  island.add(rockMesh);
  // quelques blocs suspendus sous l'île
  for (let i = 0; i < 3; i++) {
    const s = 0.35 + rand() * 0.4;
    const geo = new THREE.DodecahedronGeometry(s, 0);
    jitter(geo, s * 0.4, rand);
    colorByHeight(geo, new THREE.Color("#c4845a"), new THREE.Color("#8a6f73"), s, -s);
    const b = new THREE.Mesh(geo, m.rock);
    const a = rand() * Math.PI * 2;
    b.position.set(Math.cos(a) * (2.5 + rand() * 1.5), -2.2 - rand() * 2.5, Math.sin(a) * (2.5 + rand() * 1.5));
    island.add(b);
  }

  // Étang + ruisseau + cascade
  const pondAngle = 5.65;
  const pondPos = new THREE.Vector3(Math.sin(pondAngle) * 4.3, 0.012, Math.cos(pondAngle) * 4.3);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(0.75, 10), m.water);
  pond.rotation.x = -Math.PI / 2;
  pond.position.copy(pondPos);
  pond.receiveShadow = true;
  island.add(pond);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = rock(m, rand, 0.12 + rand() * 0.06);
    r.position.set(pondPos.x + Math.cos(a) * 0.82, 0, pondPos.z + Math.sin(a) * 0.82);
    island.add(r);
  }
  const fallCanvas = document.createElement("canvas");
  fallCanvas.width = 32;
  fallCanvas.height = 128;
  const fctx = fallCanvas.getContext("2d");
  if (fctx) {
    const grad = fctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(160,225,245,0.95)");
    grad.addColorStop(1, "rgba(160,225,245,0.0)");
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, 32, 128);
    fctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 26; i++) fctx.fillRect(Math.floor(rand() * 30), Math.floor(rand() * 128), 2, 10 + rand() * 20);
  }
  const fallTex = new THREE.CanvasTexture(fallCanvas);
  fallTex.wrapT = THREE.RepeatWrapping;
  fallTex.colorSpace = THREE.SRGBColorSpace;
  const fall = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 2.0),
    new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  const edgeR = 5.82;
  fall.position.set(Math.sin(pondAngle) * edgeR, -0.95, Math.cos(pondAngle) * edgeR);
  fall.rotation.y = pondAngle;
  island.add(fall);
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.3), m.water);
  stream.rotation.x = -Math.PI / 2;
  stream.rotation.z = -pondAngle;
  stream.position.set(Math.sin(pondAngle) * 5.2, 0.014, Math.cos(pondAngle) * 5.2);
  island.add(stream);

  // Maison de la mascotte au centre + chemins
  const home = buildMascotHome(m);
  home.rotation.y = -0.25;
  home.scale.setScalar(1.35);
  island.add(home);
  home.add(homeLight);

  let mascot: THREE.Sprite | null = null;
  const mascotTex = mascotTexture(opts.mascotUrl, () => {
    if (mascot) mascot.visible = true;
  });
  mascot = new THREE.Sprite(new THREE.SpriteMaterial({ map: mascotTex, transparent: true, depthWrite: false }));
  mascot.scale.set(2.3, 2.3, 1);
  mascot.position.set(0.2, 2.2, 0.4);
  mascot.visible = false;
  island.add(mascot);

  // Parcelles
  type Slot = { kind: IslandKind; group: THREE.Group; count: number; anchor: THREE.Object3D; badge: HTMLElement | null; delay: number; fresh: boolean; base: THREE.Vector3 };
  const slots: Slot[] = [];
  const freshSet = new Set(opts.fresh ?? []);
  let order = 0;
  for (const kind of ISLAND_KINDS) {
    const count = Math.max(0, Math.floor(opts.counts[kind] ?? 0));
    const lay = SLOT_LAYOUT[kind];
    const pos = new THREE.Vector3(Math.sin(lay.angle) * lay.r, 0, Math.cos(lay.angle) * lay.r);
    // chemin de pierres jusqu'à la maison
    for (let s = 0; s < 3; s++) {
      const t = 0.38 + s * 0.14;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.04, 7), m.path);
      st.position.set(pos.x * t + (rand() - 0.5) * 0.12, 0.01, pos.z * t + (rand() - 0.5) * 0.12);
      st.receiveShadow = true;
      island.add(st);
    }
    if (count === 0 && opts.mode === "demo") {
      // vitrine : pas de fondation vide, un bosquet à la place
      for (let k = 0; k < 1; k++) {
        const tr = tree(m, rand);
        tr.position.set(pos.x + (rand() - 0.5) * 1.1, 0, pos.z + (rand() - 0.5) * 1.1);
        island.add(tr);
      }
      continue;
    }
    let g: THREE.Group;
    if (count === 0) g = buildEmpty(m);
    else if (kind === "appartement") g = buildPenthouse(m);
    else if (kind === "immeuble") g = buildImmeuble(m);
    else if (kind === "maison") g = buildMaison(m);
    else if (kind === "villa") g = buildVilla(m);
    else if (kind === "commerce") g = buildCommerce(m);
    else g = buildTerrain(m, rand);
    g.position.copy(pos);
    g.rotation.y = lay.rot;
    g.userData.s = count === 0 ? 1 : 1.32;
    g.scale.set(1, 0.001, 1);
    island.add(g);
    const anchor = new THREE.Object3D();
    anchor.position.set(pos.x, 0.6, pos.z);
    island.add(anchor);
    let badge: HTMLElement | null = null;
    if (count > 0) {
      badge = document.createElement("div");
      badge.className = "island-badge" + (freshSet.has(kind) ? " island-badge-fresh" : "");
      badge.style.opacity = "0";
      const b = document.createElement("b");
      b.textContent = `×${count}`;
      const span = document.createElement("span");
      span.textContent = count > 1 ? opts.labels[kind].many : opts.labels[kind].one;
      badge.append(b, span);
      overlay.appendChild(badge);
    }
    slots.push({ kind, group: g, count, anchor, badge, delay: order * 0.14 + (freshSet.has(kind) ? 0.5 : 0), fresh: freshSet.has(kind), base: pos });
    order++;
  }
  // Mesure des hauteurs une fois l'échelle « réelle » appliquée (le scale.y=0.001 fausse la boîte).
  for (const s of slots) {
    const sc = (s.group.userData.s as number) ?? 1;
    s.group.scale.set(sc, sc, sc);
    const bb = new THREE.Box3().setFromObject(s.group);
    s.anchor.position.y = s.count === 0 ? 0.55 : bb.max.y + 0.3;
    s.group.scale.set(sc, 0.001, sc);
  }

  // Végétation autour du bord + détails
  const occupied = slots.map((s) => s.base).concat([new THREE.Vector3(0, 0, 0), pondPos]);
  const free = (x: number, z: number, minD: number) => occupied.every((p) => Math.hypot(p.x - x, p.z - z) > minD);
  let placed = 0;
  for (let i = 0; i < 160 && placed < 13; i++) {
    const a = rand() * Math.PI * 2;
    const r = 4.4 + rand() * 1.0;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!free(x, z, 1.6)) continue;
    const t = tree(m, rand);
    t.position.set(x, 0, z);
    t.rotation.y = rand() * Math.PI;
    island.add(t);
    occupied.push(new THREE.Vector3(x, 0, z));
    placed++;
  }
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.2 + rand() * 4.4;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!free(x, z, 0.9)) continue;
    const roll = rand();
    if (roll < 0.18) {
      const rk = rock(m, rand);
      rk.position.set(x, 0, z);
      island.add(rk);
    } else {
      const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), roll < 0.6 ? m.flowerA : m.flowerB);
      fl.position.set(x, 0.05, z);
      island.add(fl);
    }
  }

  // Nuages + îlots satellites (hors rotation de l'île)
  const sky = new THREE.Group();
  scene.add(sky);
  // Nuages derrière l'île uniquement (jamais entre la caméra et les bâtiments).
  const clouds: { g: THREE.Group; speed: number; x: number; range: number; z: number; y: number; phase: number }[] = [];
  const cloudSpots = [
    { x: -7.2, z: -3.5, y: 0.6 },
    { x: 7.4, z: -2.5, y: 1.2 },
    { x: 2.5, z: -7.5, y: -0.6 },
  ];
  for (const spot of cloudSpots) {
    const g = cloud(m, rand);
    g.scale.setScalar(1 + rand() * 0.4);
    sky.add(g);
    clouds.push({ g, speed: 0.12 + rand() * 0.1, x: spot.x, range: 0.9 + rand() * 0.6, z: spot.z, y: spot.y, phase: rand() * 6 });
  }
  const islets: { g: THREE.Group; phase: number; y: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const s = 0.55 + rand() * 0.25;
    const tg = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.9, 0.18, 8), m.grass);
    g.add(tg);
    const rg = new THREE.ConeGeometry(s * 0.9, s * 2, 8, 2);
    rg.rotateX(Math.PI);
    jitter(rg, s * 0.2, rand);
    colorByHeight(rg, new THREE.Color("#d08a5c"), new THREE.Color("#8a6f73"), s, -s);
    const rm = new THREE.Mesh(rg, m.rock);
    rm.position.y = -s - 0.09;
    g.add(rm);
    const t = tree(m, rand, "pine", 0.6);
    t.position.y = 0.09;
    g.add(t);
    const a = i === 0 ? 2.3 : -2.1;
    g.position.set(Math.sin(a) * 8.3, -1.2 - i * 1.2, Math.cos(a) * 8.3 - 2);
    sky.add(g);
    islets.push({ g, phase: rand() * 6, y: g.position.y });
  }

  // ---------- thème ----------
  function setDark(dark: boolean) {
    hemi.color.set(dark ? "#5b6f9c" : "#dff1ff");
    hemi.groundColor.set(dark ? "#2a2230" : "#c99b77");
    hemi.intensity = dark ? 0.9 : 1.35;
    sun.color.set(dark ? "#9fb6ff" : "#fff1dc");
    sun.intensity = dark ? 0.9 : 2.4;
    rim.color.set(dark ? "#ff9a5c" : "#ffd0b3");
    rim.intensity = dark ? 0.9 : 0.6;
    under.color.set(dark ? "#c0704a" : "#ffd6bd");
    under.intensity = dark ? 0.22 : 0.55;
    m.glass.emissiveIntensity = dark ? 1.1 : 0;
    m.lamp.emissiveIntensity = dark ? 2.2 : 0.25;
    homeLight.intensity = dark ? 2.2 : 0;
    m.cloud.color.set(dark ? "#7d86a3" : "#ffffff");
    m.cloud.emissiveIntensity = dark ? 0.05 : 0.35;
    m.cloud.opacity = dark ? 0.55 : 0.92;
    m.water.emissiveIntensity = dark ? 0.35 : 0.15;
    renderer.toneMappingExposure = dark ? 1.15 : 1.05;
    if (!running) renderOnce();
  }

  // ---------- taille / caméra ----------
  const size = new THREE.Vector2();
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    size.set(w, h);
    camera.aspect = w / h;
    // recule la caméra pour que l'île (≈ 15 unités de large avec les nuages) tienne dans le cadre
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distW = (camera.aspect < 1.1 ? 6.3 : 7.0) / Math.tan(hFov / 2);
    const distH = 5.7 / Math.tan(vFov / 2);
    const dist = Math.max(distW, distH);
    camera.position.set(0, dist * 0.36, dist);
    camera.lookAt(0, -0.9, 0);
    camera.updateProjectionMatrix();
    if (!running) renderOnce();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ---------- interaction (glisser pour tourner) ----------
  let rotY = -0.35;
  let vel = 0;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  const autoSpeed = opts.reducedMotion ? 0 : 0.11;
  function onDown(e: PointerEvent) {
    dragging = true;
    lastX = e.clientX;
    lastT = performance.now();
    vel = 0;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.classList.add("is-dragging");
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    const dt = Math.max(1, now - lastT);
    rotY += dx * 0.008;
    vel = ((dx * 0.008) / dt) * 1000;
    lastX = e.clientX;
    lastT = now;
    if (!running) renderOnce();
  }
  function onUp(e: PointerEvent) {
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
    canvas.classList.remove("is-dragging");
  }
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  // ---------- boucle ----------
  let running = false;
  let raf = 0;
  let elapsed = 0;
  let buildStart = -1;
  let last = performance.now();
  const tmp = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  function updateBuild() {
    if (buildStart < 0) return;
    const t = performance.now() / 1000 - buildStart;
    for (const s of slots) {
      const k = opts.reducedMotion ? 1 : Math.min(1, Math.max(0, (t - s.delay) / 0.75));
      const y = k <= 0 ? 0.001 : k >= 1 ? 1 : Math.max(0.001, easeOutBack(k));
      const sc = (s.group.userData.s as number) ?? 1;
      s.group.scale.set(sc, sc * y, sc);
      if (s.badge) s.badge.style.opacity = k >= 1 ? "" : "0";
    }
  }

  function updateBadges() {
    camera.getWorldDirection(camDir);
    for (const s of slots) {
      if (!s.badge) continue;
      s.anchor.getWorldPosition(tmp);
      // la parcelle est-elle face à la caméra ou de l'autre côté de l'île ?
      const facing = tmp.x * -camDir.x + tmp.z * -camDir.z;
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * size.x;
      const y = (-tmp.y * 0.5 + 0.5) * size.y;
      const behind = facing < -0.5;
      s.badge.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${behind ? 0.86 : 1})`;
      s.badge.classList.toggle("is-behind", behind);
    }
  }

  function step(dt: number) {
    elapsed += dt;
    if (!dragging) {
      rotY += (autoSpeed + vel) * dt;
      vel *= Math.pow(0.04, dt); // inertie qui s'éteint
    }
    island.rotation.y = rotY;
    const bob = opts.reducedMotion ? 0 : Math.sin(elapsed * 0.8) * 0.12;
    floater.position.y = bob;
    floater.rotation.z = opts.reducedMotion ? 0 : Math.sin(elapsed * 0.5) * 0.012;
    if (mascot) {
      mascot.position.y = 2.2 + (opts.reducedMotion ? 0 : Math.sin(elapsed * 1.9) * 0.14);
      mascot.position.x = 0.2 + (opts.reducedMotion ? 0 : Math.sin(elapsed * 0.7) * 0.18);
    }
    fallTex.offset.y = (fallTex.offset.y + dt * 0.9) % 1;
    for (const c of clouds) {
      c.g.position.set(c.x + Math.sin(elapsed * c.speed + c.phase) * c.range, c.y + Math.sin(elapsed * 0.4 + c.phase) * 0.1, c.z);
    }
    for (const it of islets) it.g.position.y = it.y + Math.sin(elapsed * 0.9 + it.phase) * 0.18;
    updateBuild();
  }

  function renderOnce() {
    updateBuild();
    island.rotation.y = rotY;
    renderer.render(scene, camera);
    updateBadges();
  }

  function loop(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    renderer.render(scene, camera);
    updateBadges();
    raf = requestAnimationFrame(loop);
  }

  function setActive(active: boolean) {
    if (active && buildStart < 0) buildStart = performance.now() / 1000 + 0.25;
    if (active && !running && !opts.reducedMotion) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (!active && running) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (opts.reducedMotion) {
      renderOnce();
    }
  }

  setDark(opts.dark);
  resize();

  return {
    setDark,
    setActive,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      for (const s of slots) s.badge?.remove();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      Object.values(m).forEach((mat) => mat.dispose());
      fallTex.dispose();
      mascotTex.dispose();
      renderer.dispose();
    },
  };
}
