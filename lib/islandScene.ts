// Île flottante 3D de Bricky (three.js, rendu « réaliste »).
// - Une parcelle par type de bien ; un badge flottant indique le nombre d'analyses.
// - La maison de la mascotte (fantôme orange) occupe le centre.
// - Rendu transparent : le titre de la section reste visible derrière l'île.
// - Matériaux physiques (PBR), ciel en reflet sur le verre et l'eau, textures procédurales
//   (aucun fichier à télécharger), herbe en brins, feuillage en cartes, ombres douces.
// La disposition (taille, place des bâtiments, caméra) est identique à la version low-poly :
// le générateur aléatoire « rand » est consommé exactement dans le même ordre qu'avant.
// Ce module n'est chargé qu'à la demande (import dynamique) pour ne pas alourdir les pages.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
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

// --- consommation « à l'identique » du générateur de disposition (voir en-tête) ---
function burnJitter(geo: THREE.BufferGeometry, amount: number, rand: () => number, keepTop?: number) {
  jitter(geo, amount, rand, keepTop);
  geo.dispose();
}
type TreeInfo = { kind: "round" | "pine"; s: number; light: boolean; extra: boolean };
function legacyTree(rand: () => number, kind?: "round" | "pine", s?: number): TreeInfo {
  const k = kind ?? (rand() > 0.45 ? "round" : "pine");
  const sc = s ?? 0.8 + rand() * 0.5;
  let light = false, extra = false;
  if (k === "pine") {
    for (let i = 0; i < 3; i++) rand();
  } else {
    burnJitter(new THREE.IcosahedronGeometry(0.42 * sc, 0), 0.08 * sc, rand);
    light = rand() > 0.5;
    extra = rand() > 0.4;
  }
  return { kind: k, s: sc, light, extra };
}
function legacyRock(rand: () => number, s = 0.2 + rand() * 0.2) {
  burnJitter(new THREE.DodecahedronGeometry(s, 0), s * 0.35, rand);
  return s;
}

// ---------- bruit (valeur 3D, éventuellement périodique pour des textures raccordables) ----------
function hash3(ix: number, iy: number, iz: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1440662683) ^ Math.imul(seed + 1, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const fade = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, z: number, seed = 0, period = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  const w = (a: number) => (period > 0 ? ((a % period) + period) % period : a);
  const x0 = w(ix), x1 = w(ix + 1), y0 = w(iy), y1 = w(iy + 1);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const a = l(l(hash3(x0, y0, iz, seed), hash3(x1, y0, iz, seed), fx), l(hash3(x0, y1, iz, seed), hash3(x1, y1, iz, seed), fx), fy);
  const b = l(l(hash3(x0, y0, iz + 1, seed), hash3(x1, y0, iz + 1, seed), fx), l(hash3(x0, y1, iz + 1, seed), hash3(x1, y1, iz + 1, seed), fx), fy);
  return l(a, b, fz);
}
function fbm(x: number, y: number, z: number, oct = 4, seed = 0, period = 0) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, z * f, seed + o * 17, period > 0 ? period * f : 0);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// ---------- textures procédurales ----------
type Rgba = [number, number, number, number];
function pixelCanvas(w: number, h: number, fn: ((u: number, v: number) => Rgba) | null, draw?: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    if (fn) {
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = fn(x / w, y / h);
          const i = (y * w + x) * 4;
          d[i] = clamp01(c[0]) * 255;
          d[i + 1] = clamp01(c[1]) * 255;
          d[i + 2] = clamp01(c[2]) * 255;
          d[i + 3] = clamp01(c[3]) * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    draw?.(ctx);
  }
  return canvas;
}

function makeTextures(compact: boolean, vr: () => number) {
  const list: THREE.Texture[] = [];
  const S = compact ? 256 : 384;
  const tex = (canvas: HTMLCanvasElement, srgb: boolean, repeat: [number, number] = [1, 1]) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    list.push(t);
    return t;
  };
  const gray = (g: number): Rgba => [g, g, g, 1];

  // Herbe vue du dessus : nuances, touffes, zones plus sèches.
  const grass = tex(
    pixelCanvas(S, S, (u, v) => {
      const n1 = fbm(u * 6, v * 6, 0, 4, 1, 6);
      const n2 = vnoise(u * 96, v * 96, 0, 2, 96);
      const dry = smooth(0.6, 0.75, vnoise(u * 4, v * 4, 3, 3, 4));
      const k = 0.82 + 0.3 * n2;
      const r = (0.27 + 0.22 * n1) * k, g = (0.43 + 0.22 * n1) * k, b = (0.15 + 0.08 * n1) * k;
      return [r + (0.62 - r) * dry * 0.55, g + (0.62 - g) * dry * 0.35, b + (0.3 - b) * dry * 0.4, 1];
    }, (ctx) => {
      for (let i = 0; i < (compact ? 2500 : 9000); i++) {
        const x = vr() * S, y = vr() * S, l = 2 + vr() * 5;
        const g = 90 + vr() * 90;
        ctx.strokeStyle = `rgba(${g * 0.55 | 0},${g | 0},${g * 0.35 | 0},0.55)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (vr() - 0.5) * 2, y - l);
        ctx.stroke();
      }
    }),
    true,
    [7, 7],
  );

  // Bord de l'île : frange d'herbe qui retombe sur la terre.
  const grassSide = tex(
    pixelCanvas(256, 128, (u, v) => {
      const edge = 0.32 + 0.16 * fbm(u * 16, 0, 0, 3, 5, 16) + 0.08 * vnoise(u * 96, 0, 1, 6, 96);
      const n = fbm(u * 24, v * 6, 2, 3, 7, 24);
      if (v < edge) {
        const k = 0.75 + 0.35 * vnoise(u * 128, v * 16, 0, 8, 128);
        return [0.3 * k, 0.48 * k, 0.17 * k, 1];
      }
      const pebble = vnoise(u * 64, v * 32, 0, 9, 64) > 0.82 ? 0.15 : 0;
      const k = 0.7 + 0.35 * n + pebble;
      return [0.45 * k, 0.3 * k, 0.2 * k, 1];
    }),
    true,
    [18, 1],
  );

  // Roche : strates horizontales, fissures (en gris, teintée par les couleurs de sommet).
  const rock = tex(
    pixelCanvas(256, 256, (u, v) => {
      const warp = fbm(u * 4, v * 4, 0, 3, 11, 4) * 0.8;
      const band = smooth(0.35, 0.65, Math.sin((v * 7 + warp) * Math.PI) * 0.5 + 0.5);
      const n = fbm(u * 10, v * 10, 1, 5, 12, 10);
      const blot = fbm(u * 3, v * 3, 2, 3, 16, 3);
      const crack = 1 - smooth(0.0, 0.05, Math.abs(fbm(u * 5, v * 5, 4, 4, 13, 5) - 0.5));
      return gray(0.5 + 0.35 * n + 0.1 * band + 0.15 * (blot - 0.5) - crack * 0.35);
    }),
    false,
    [6, 2],
  );

  const plaster = tex(pixelCanvas(256, 256, (u, v) => gray(0.9 + 0.1 * fbm(u * 16, v * 16, 0, 4, 21, 16))), false);
  const concrete = tex(
    pixelCanvas(256, 256, (u, v) => {
      const n = fbm(u * 12, v * 12, 0, 4, 22, 12);
      const speck = vnoise(u * 180, v * 180, 0, 23, 180) > 0.86 ? -0.08 : 0;
      const joint = Math.abs(v - 0.5) < 0.004 || u < 0.004 ? -0.12 : 0;
      return gray(0.8 + 0.18 * n + speck + joint);
    }),
    false,
  );
  // Pierre de taille (assises + joints).
  const stone = tex(
    pixelCanvas(256, 256, (u, v) => {
      const rows = 4, row = Math.floor(v * rows);
      const off = row % 2 ? 0.25 : 0;
      const cols = 2, cu = (u * cols + off) % 1;
      const fv = (v * rows) % 1;
      const mortar = fv < 0.05 || cu < 0.025 ? 0.8 : 1;
      const block = 0.9 + 0.1 * hash3(Math.floor(u * cols + off), row, 0, 31);
      return gray(mortar * block * (0.9 + 0.1 * fbm(u * 20, v * 20, 0, 3, 32, 20)));
    }),
    false,
  );
  // Bardage bois vertical.
  const planks = tex(
    pixelCanvas(256, 256, (u, v) => {
      const n = 6, p = Math.floor(u * n), fu = (u * n) % 1;
      const gap = fu < 0.05 ? 0.35 : 1;
      const tone = 0.8 + 0.2 * hash3(p, 0, 0, 41);
      const grain = 0.85 + 0.15 * fbm(u * 60, v * 3, p, 3, 42, 0);
      return gray(gap * tone * grain);
    }),
    false,
  );
  // Tuiles (rangées qui se chevauchent).
  const tiles = tex(
    pixelCanvas(256, 256, (u, v) => {
      const rows = 8, row = Math.floor(v * rows), fv = (v * rows) % 1;
      const off = row % 2 ? 0.5 : 0;
      const cols = 8, cu = (u * cols + off) % 1;
      const curve = 0.75 + 0.25 * Math.sin(cu * Math.PI);
      const overlap = 0.55 + 0.45 * smooth(0, 0.85, fv);
      const tone = 0.85 + 0.15 * hash3(Math.floor(u * cols + off), row, 0, 51);
      return gray(curve * overlap * tone);
    }),
    false,
    [3, 3],
  );
  // Zinc à joints debout.
  const zinc = tex(
    pixelCanvas(256, 256, (u, v) => {
      const fu = (u * 8) % 1;
      const seam = fu < 0.04 ? 1.15 : fu < 0.08 ? 0.7 : 1;
      return gray((0.82 + 0.12 * fbm(u * 8, v * 30, 0, 3, 61, 8)) * seam);
    }),
    false,
    [2, 2],
  );
  const bark = tex(
    pixelCanvas(128, 128, (u, v) => {
      const n = fbm(u * 10, v * 2, 0, 4, 71, 10);
      return gray(0.5 + 0.5 * n - (n < 0.38 ? 0.2 : 0));
    }),
    false,
    [2, 1],
  );
  // Carte de feuillage (amas de feuilles, transparente autour).
  const foliage = tex(
    pixelCanvas(256, 256, null, (ctx) => {
      for (let i = 0; i < 150; i++) {
        const a = vr() * Math.PI * 2, r = Math.sqrt(vr()) * 100;
        const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
        const g = 130 + vr() * 125 - (r / 100) * 40;
        ctx.fillStyle = `rgb(${g | 0},${g | 0},${g | 0})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(vr() * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, 9 + vr() * 6, 4 + vr() * 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }),
    false,
  );
  foliage.wrapS = foliage.wrapT = THREE.ClampToEdgeWrapping;
  // Relief du feuillage pour les volumes (bosses irrégulières).
  const leafBump = tex(pixelCanvas(256, 256, (u, v) => gray(fbm(u * 18, v * 18, 0, 4, 81, 18))), false, [2, 2]);

  // Carte de normales de l'eau (vaguelettes raccordables).
  const H = (u: number, v: number) => fbm(u * 8, v * 8, 0, 4, 91, 8);
  const waterNormal = tex(
    pixelCanvas(128, 128, (u, v) => {
      const e = 1 / 128;
      const dx = (H(u + e, v) - H(u - e, v)) * 6;
      const dy = (H(u, v + e) - H(u, v - e)) * 6;
      const l = Math.hypot(dx, dy, 1);
      return [(-dx / l) * 0.5 + 0.5, (-dy / l) * 0.5 + 0.5, (1 / l) * 0.5 + 0.5, 1];
    }),
    false,
    [3, 3],
  );

  // Nuage : bouffées douces superposées.
  const cloud = tex(
    pixelCanvas(256, 256, null, (ctx) => {
      // ombre douce sous le nuage, puis bouffées éclairées par le haut
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 34; i++) {
          const t = i / 34;
          const x = 40 + t * 176 + (vr() - 0.5) * 30;
          const bump = Math.sin(t * Math.PI);
          const rad = (18 + vr() * 26) * (0.6 + bump * 0.7);
          const y = 170 - bump * 50 - vr() * 30 + (pass ? -6 : 6);
          const grd = ctx.createRadialGradient(x - rad * 0.2, y - rad * 0.35, rad * 0.05, x, y, rad);
          if (pass === 0) {
            grd.addColorStop(0, "rgba(196,206,222,0.55)");
            grd.addColorStop(1, "rgba(196,206,222,0)");
          } else {
            grd.addColorStop(0, "rgba(255,255,255,0.95)");
            grd.addColorStop(0.55, "rgba(246,248,252,0.6)");
            grd.addColorStop(1, "rgba(230,236,245,0)");
          }
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }),
    true,
  );
  cloud.wrapS = cloud.wrapT = THREE.ClampToEdgeWrapping;

  const blob = tex(
    pixelCanvas(128, 128, null, (ctx) => {
      const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      grd.addColorStop(0, "rgba(0,0,0,0.65)");
      grd.addColorStop(0.45, "rgba(0,0,0,0.35)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
    }),
    true,
  );
  blob.wrapS = blob.wrapT = THREE.ClampToEdgeWrapping;

  // Palme : nervure centrale + folioles.
  const frond = tex(
    pixelCanvas(256, 64, null, (ctx) => {
      ctx.strokeStyle = "#6f7a3a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 32);
      ctx.lineTo(256, 32);
      ctx.stroke();
      for (let x = 6; x < 250; x += 5) {
        const len = 28 * Math.sin((x / 256) * Math.PI) + 4;
        for (const side of [-1, 1]) {
          const g = 110 + vr() * 50;
          ctx.strokeStyle = `rgb(${g * 0.45 | 0},${g | 0},${g * 0.3 | 0})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(x, 32);
          ctx.lineTo(x + len * 0.55, 32 + side * len);
          ctx.stroke();
        }
      }
    }),
    true,
  );
  frond.wrapS = frond.wrapT = THREE.ClampToEdgeWrapping;

  // Garde-corps en fer forgé (barreaux).
  const rail = tex(
    pixelCanvas(64, 32, null, (ctx) => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 64, 3);
      ctx.fillRect(0, 29, 64, 3);
      for (let x = 2; x < 64; x += 6) ctx.fillRect(x, 0, 2, 32);
    }),
    false,
    [1, 1],
  );

  const fall = tex(
    pixelCanvas(64, 256, null, (ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "rgba(170,225,240,0.95)");
      grad.addColorStop(0.75, "rgba(200,235,245,0.6)");
      grad.addColorStop(1, "rgba(220,240,250,0.0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 256);
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.25 + vr() * 0.55})`;
        ctx.fillRect(Math.floor(vr() * 62), Math.floor(vr() * 256), 1 + vr() * 2, 14 + vr() * 40);
      }
    }),
    true,
  );
  fall.wrapS = THREE.ClampToEdgeWrapping;

  return { list, grass, grassSide, rock, plaster, concrete, stone, planks, tiles, zinc, bark, foliage, leafBump, waterNormal, cloud, blob, frond, rail, fall };
}
type Texs = ReturnType<typeof makeTextures>;

// ---------- matériaux partagés ----------
function makeMaterials(t: Texs) {
  const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}, uv = 1) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
    mat.userData.uv = uv; // répétitions de texture par unité de longueur
    return mat;
  };
  const plaster = (color: string) => std(color, { map: t.plaster, bumpMap: t.plaster, bumpScale: 0.4, roughness: 0.92 }, 1.2);
  const leaf = (color: string) =>
    std(color, { map: t.foliage, alphaTest: 0.45, roughness: 0.8, vertexColors: true });
  const glass = (lit: boolean) =>
    new THREE.MeshPhysicalMaterial({
      color: lit ? "#3d5563" : "#33495a",
      roughness: 0.05,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 2.4,
      emissive: new THREE.Color("#ffb468"),
      emissiveIntensity: 0,
    });
  return {
    grass: std("#ffffff", { map: t.grass, bumpMap: t.grass, bumpScale: 0.8, roughness: 0.95 }),
    grassDark: std("#c9d8b8", { map: t.grass, roughness: 0.95 }, 1.5),
    grassSide: std("#ffffff", { map: t.grassSide, roughness: 1 }),
    soil: std("#b37a52", { map: t.rock, bumpMap: t.rock, bumpScale: 2, roughness: 1 }),
    rock: std("#ffffff", { map: t.rock, bumpMap: t.rock, bumpScale: 3, roughness: 0.95, vertexColors: true }),
    blade: std("#ffffff", { vertexColors: true, roughness: 0.9 }),
    wall: plaster("#f4f0e8"),
    wallWarm: plaster("#ecdfca"),
    wallStone: std("#dccdb1", { map: t.stone, bumpMap: t.stone, bumpScale: 1.2, roughness: 0.9 }, 2.2),
    facade: std("#efe4cf", { map: t.stone, bumpMap: t.stone, bumpScale: 0.5, roughness: 0.88 }, 4.5),
    trim: std("#f6f4ef", { map: t.concrete, roughness: 0.6 }, 2),
    frame: std("#2c2f33", { roughness: 0.45, metalness: 0.6 }),
    frameWhite: std("#f3f1ec", { roughness: 0.5 }),
    glass: glass(false),
    glassLit: glass(true),
    glassClear: new THREE.MeshPhysicalMaterial({ color: "#d6ecf2", roughness: 0.02, metalness: 0, transparent: true, opacity: 0.32, envMapIntensity: 2, depthWrite: false }),
    railing: std("#202326", { alphaMap: t.rail, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.45 }, 8),
    roofTerracotta: std("#b95a36", { map: t.tiles, bumpMap: t.tiles, bumpScale: 1.5, roughness: 0.8 }),
    roofZinc: std("#8a949c", { map: t.zinc, bumpMap: t.zinc, bumpScale: 0.8, roughness: 0.4, metalness: 0.55 }),
    roofDark: std("#3a3d42", { map: t.concrete, roughness: 0.8 }, 2),
    accent: std("#ff5a1f", { roughness: 0.55 }),
    accentTiles: std("#f2622a", { map: t.tiles, bumpMap: t.tiles, bumpScale: 1.5, roughness: 0.7 }),
    accentSoft: std("#ffd2bd"),
    fabric: std("#fbf7f0", { roughness: 0.95 }),
    wood: std("#9b6642", { map: t.planks, bumpMap: t.planks, bumpScale: 0.8, roughness: 0.7 }, 2.2),
    woodDark: std("#5f3f2b", { map: t.planks, roughness: 0.7 }, 3),
    shutter: std("#6d8a91", { map: t.planks, roughness: 0.7 }, 4),
    concrete: std("#cfc8bc", { map: t.concrete, bumpMap: t.concrete, bumpScale: 0.6, roughness: 0.9 }, 1.5),
    path: std("#d8ccb6", { map: t.concrete, bumpMap: t.concrete, bumpScale: 1, roughness: 0.95 }, 3),
    water: new THREE.MeshPhysicalMaterial({ color: "#2c7f9c", roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: t.waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.8, emissive: new THREE.Color("#0e5068"), emissiveIntensity: 0.12 }),
    pool: new THREE.MeshPhysicalMaterial({ color: "#34b9d8", roughness: 0.04, metalness: 0, clearcoat: 1, normalMap: t.waterNormal, normalScale: new THREE.Vector2(0.2, 0.2), envMapIntensity: 1.4, emissive: new THREE.Color("#1a8fb0"), emissiveIntensity: 0.25 }),
    wetSand: std("#7d6a52", { roughness: 0.7 }),
    leaf: leaf("#5f8f3f"),
    leafLight: leaf("#7aa24a"),
    leafDark: leaf("#456f35"),
    core: std("#2f4a26", { bumpMap: t.leafBump, bumpScale: 3, roughness: 0.95, vertexColors: true }),
    pine: std("#3a5f35", { map: t.leafBump, bumpMap: t.leafBump, bumpScale: 4, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide }),
    palm: std("#ffffff", { map: t.frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75 }),
    trunk: std("#6e4c35", { map: t.bark, bumpMap: t.bark, bumpScale: 2, roughness: 0.95 }),
    stone: std("#b1aa9e", { map: t.concrete, bumpMap: t.rock, bumpScale: 2, roughness: 0.92, vertexColors: true }),
    flowerA: std("#ff7a3d", { roughness: 0.6 }),
    flowerB: std("#f4dc6a", { roughness: 0.6 }),
    flowerC: std("#d9476e", { roughness: 0.6 }),
    reed: std("#6f8a3e", { roughness: 0.8 }),
    root: std("#5b4232", { map: t.bark, roughness: 1 }),
    metal: std("#c9ccce", { roughness: 0.35, metalness: 0.8 }),
    cloud: new THREE.SpriteMaterial({ map: t.cloud, color: "#ffffff", transparent: true, depthWrite: false, opacity: 1, toneMapped: false }),
    shadow: new THREE.MeshBasicMaterial({ map: t.blob, transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    fall: new THREE.MeshBasicMaterial({ map: t.fall, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    mist: new THREE.SpriteMaterial({ map: t.cloud, color: "#ffffff", transparent: true, depthWrite: false, opacity: 0.45, toneMapped: false }),
    lamp: new THREE.MeshStandardMaterial({ color: "#ffd9a8", emissive: new THREE.Color("#ffb468"), emissiveIntensity: 0.25 }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;

// ---------- géométrie de base ----------
/** UV « monde » sur une boîte : la texture garde la même échelle quelle que soit la taille. */
function boxUV(geo: THREE.BufferGeometry, den: number, ox: number, oy: number, oz: number) {
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  const n = geo.getAttribute("normal") as THREE.BufferAttribute;
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox, y = p.getY(i) + oy, z = p.getZ(i) + oz;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, z * den, y * den);
    else if (ay >= az) uv.setXY(i, x * den, z * den);
    else uv.setXY(i, x * den, y * den);
  }
  uv.needsUpdate = true;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  boxUV(geo, (mat.userData.uv as number) ?? 1, x, y + h / 2, z);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function shade(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => number) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Fusionne les maillages d'un groupe par matériau (beaucoup moins d'appels de rendu). */
function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  const rel = new THREE.Matrix4();
  root.traverse((o) => {
    if (o === root) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material) && !mesh.userData.keep) {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      rel.multiplyMatrices(inv, mesh.matrixWorld);
      g.applyMatrix4(rel);
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(name)) g.deleteAttribute(name);
      if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
      g.clearGroups();
      const list = buckets.get(mesh.material) ?? [];
      list.push(g);
      buckets.set(mesh.material, list);
      mesh.geometry.dispose();
    } else if (!mesh.isMesh && !(o as THREE.Group).isGroup) {
      keep.push(o);
    } else if (mesh.isMesh) {
      keep.push(o);
    }
  });
  for (const o of keep) root.attach(o);
  for (const c of [...root.children]) if (!keep.includes(c)) root.remove(c);
  for (const [mat, geos] of buckets) {
    const withColor = geos.some((g) => g.getAttribute("color"));
    for (const g of geos) {
      if (withColor && !g.getAttribute("color")) {
        const c = new Float32Array(g.getAttribute("position").count * 3).fill(1);
        g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      } else if (!withColor && g.getAttribute("color")) g.deleteAttribute("color");
    }
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    const transparent = (mat as THREE.Material).transparent;
    mesh.castShadow = !transparent;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

/** Toit à deux pans (prisme) posé à la hauteur y. */
function gableRoof(w: number, d: number, h: number, mat: THREE.Material, y: number, overhang = 0.12) {
  const shape = new THREE.Shape();
  const hw = w / 2 + overhang;
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(0, h);
  shape.lineTo(-hw, 0);
  const depth = d + overhang * 2;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  // Tuiles alignées sur la pente : u le long du faîtage, v dans la pente.
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  const slope = Math.hypot(hw, h);
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 1.2, ((h - p.getY(i)) / h) * slope * 1.2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Fenêtre réaliste : dormant, vitrage réfléchissant, meneau, appui. */
function windowAt(g: THREE.Group, m: Mats, vr: () => number, x: number, y: number, z: number, axis: "x" | "z", sign: number, ww: number, wh: number, frame: THREE.Material = m.frame, sill = true) {
  const lit = vr() < 0.45;
  const glass = lit ? m.glassLit : m.glass;
  const f = 0.028;
  if (axis === "z") {
    g.add(box(ww + f, wh + f, 0.02, frame, x, y - f / 2, z + sign * 0.01));
    g.add(box(ww, wh, 0.006, glass, x, y, z + sign * 0.022));
    g.add(box(0.012, wh, 0.01, frame, x, y, z + sign * 0.026));
    if (sill) g.add(box(ww + 0.05, 0.018, 0.05, m.trim, x, y - f / 2 - 0.018, z + sign * 0.025));
  } else {
    g.add(box(0.02, wh + f, ww + f, frame, x + sign * 0.01, y - f / 2, z));
    g.add(box(0.006, wh, ww, glass, x + sign * 0.022, y, z));
    g.add(box(0.01, wh, 0.012, frame, x + sign * 0.026, y, z));
    if (sill) g.add(box(0.05, 0.018, ww + 0.05, m.trim, x + sign * 0.025, y - f / 2 - 0.018, z));
  }
}

/** Fenêtres sur les quatre façades d'un volume (w × d), par étages. */
function windows(g: THREE.Group, m: Mats, vr: () => number, w: number, d: number, y0: number, floors: number, floorH: number, colsW: number, colsD: number, winW = 0.22, winH = 0.3, frame: THREE.Material = m.frame) {
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * floorH + floorH * 0.28;
    for (let c = 0; c < colsW; c++) {
      const x = -w / 2 + (w / colsW) * (c + 0.5);
      windowAt(g, m, vr, x, y, d / 2, "z", 1, winW, winH, frame);
      windowAt(g, m, vr, x, y, -d / 2, "z", -1, winW, winH, frame);
    }
    for (let c = 0; c < colsD; c++) {
      const z = -d / 2 + (d / colsD) * (c + 0.5);
      windowAt(g, m, vr, w / 2, y, z, "x", 1, winW, winH, frame);
      windowAt(g, m, vr, -w / 2, y, z, "x", -1, winW, winH, frame);
    }
  }
}

/** Volume organique déformé par le bruit (feuillage, rochers). */
function lumpy(radius: number, detail: number, amp: number, seed: number, freq = 2.2) {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo);
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const k = 1 + amp * (fbm(n.x * freq + 10, n.y * freq + 10, n.z * freq + 10, 3, seed) - 0.5) * 2;
    v.copy(n).multiplyScalar(radius * k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  // UV planaires (suffisant pour des motifs de bruit).
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.6) * 1.3;
    uv[i * 2 + 1] = (p.getY(i) + p.getZ(i) * 0.4) * 1.3;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Couronne de feuillage : cœur sombre + cartes de feuilles orientées vers l'extérieur. */
function crown(g: THREE.Group, m: Mats, vr: () => number, cx: number, cy: number, cz: number, r: number, mat: THREE.Material, cards: number) {
  const core = lumpy(r * 0.82, 2, 0.22, Math.floor(vr() * 1000));
  shade(core, (_x, y) => 0.55 + 0.45 * clamp01((y / r + 1) / 2));
  core.translate(cx, cy, cz);
  const cm = new THREE.Mesh(core, m.core);
  cm.castShadow = true;
  cm.receiveShadow = true;
  g.add(cm);
  const geos: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const dir = new THREE.Vector3();
  for (let i = 0; i < cards; i++) {
    // point aléatoire sur la sphère, un peu aplati en bas
    const u = vr() * 2 - 1, a = vr() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    dir.set(s * Math.cos(a), u * 0.9, s * Math.sin(a));
    const rr = r * (0.75 + vr() * 0.3);
    const size = r * (0.55 + vr() * 0.35);
    const pg = new THREE.PlaneGeometry(size, size);
    e.set(vr() * Math.PI, vr() * Math.PI, vr() * Math.PI);
    q.setFromEuler(e);
    pg.applyQuaternion(q);
    pg.translate(dir.x * rr, dir.y * rr, dir.z * rr);
    // normales « sphériques » : éclairage doux et volumique du feuillage
    const p = pg.getAttribute("position") as THREE.BufferAttribute;
    const nrm = pg.getAttribute("normal") as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
      const l = Math.hypot(vx, vy, vz) || 1;
      nrm.setXYZ(k, vx / l, vy / l, vz / l);
      const ao = 0.6 + 0.5 * clamp01((vy / r + 1) / 2);
      col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;
    }
    pg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    // carte visible des deux côtés avec les mêmes normales (pas d'assombrissement au revers)
    const idx = Array.from(pg.getIndex()!.array);
    const rev: number[] = [];
    for (let k = 0; k < idx.length; k += 3) rev.push(idx[k + 2], idx[k + 1], idx[k]);
    pg.setIndex(idx.concat(rev));
    pg.translate(cx, cy, cz);
    geos.push(pg);
  }
  const merged = mergeGeometries(geos);
  geos.forEach((x) => x.dispose());
  if (merged) {
    const lm = new THREE.Mesh(merged, mat);
    lm.castShadow = true;
    lm.receiveShadow = true;
    g.add(lm);
  }
}

function makeTree(m: Mats, vr: () => number, info: TreeInfo, compact: boolean) {
  const g = new THREE.Group();
  const s = info.s;
  if (info.kind === "pine") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.08 * s, 1.1 * s, 8), m.trunk);
    trunk.position.y = 0.55 * s;
    g.add(trunk);
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const r = (0.46 - t * 0.3) * s;
      const h = (0.5 - t * 0.12) * s;
      const geo = new THREE.ConeGeometry(r, h, 18, 3, true);
      // bord inférieur dentelé et tombant (branches)
      const p = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
        const rad = Math.hypot(x, z);
        if (rad < 1e-4) continue;
        const ang = Math.atan2(z, x);
        const jag = 1 + 0.18 * Math.sin(ang * 9 + i) + 0.1 * (vnoise(Math.cos(ang) * 3 + i, Math.sin(ang) * 3, y * 4, 7) - 0.5);
        const low = y < -h / 2 + 1e-3 ? 1 : 0;
        p.setXYZ(k, x * jag, y - low * (jag - 1) * 0.25 * s, z * jag);
      }
      geo.computeVertexNormals();
      shade(geo, (_x, y) => 0.55 + 0.5 * clamp01((y + h / 2) / h) * (0.7 + 0.3 * t));
      const cone = new THREE.Mesh(geo, m.pine);
      cone.position.y = (0.42 + i * 0.22) * s;
      cone.rotation.y = vr() * Math.PI;
      cone.castShadow = true;
      cone.receiveShadow = true;
      g.add(cone);
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.085 * s, 0.62 * s, 8), m.trunk);
    trunk.position.y = 0.31 * s;
    trunk.rotation.z = (vr() - 0.5) * 0.12;
    g.add(trunk);
    for (let i = 0; i < 2; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * s, 0.03 * s, 0.32 * s, 6), m.trunk);
      const a = vr() * Math.PI * 2;
      br.position.set(Math.cos(a) * 0.07 * s, 0.6 * s, Math.sin(a) * 0.07 * s);
      br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      g.add(br);
    }
    const mat = info.light ? m.leafLight : m.leaf;
    const cards = compact ? 40 : 70;
    crown(g, m, vr, 0, 0.8 * s, 0, 0.4 * s, mat, cards);
    crown(g, m, vr, 0.12 * s, 1.02 * s, -0.08 * s, 0.26 * s, mat, cards >> 1);
    if (info.extra) crown(g, m, vr, 0.24 * s, 0.62 * s, 0.1 * s, 0.24 * s, m.leafDark, cards >> 1);
  }
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  bake(g);
  return g;
}

function bush(g: THREE.Group, m: Mats, vr: () => number, x: number, y: number, z: number, r: number, mat: THREE.Material = m.leafDark) {
  crown(g, m, vr, x, y + r * 0.7, z, r, mat, 10);
}

function makeRock(m: Mats, vr: () => number, s: number) {
  const geo = lumpy(s, 2, 0.35, Math.floor(vr() * 1000), 1.6);
  geo.scale(1, 0.6, 1);
  shade(geo, (_x, y) => 0.7 + 0.35 * clamp01(y / s + 0.5));
  const r = new THREE.Mesh(geo, m.stone);
  r.position.y = s * 0.25;
  r.castShadow = true;
  r.receiveShadow = true;
  return r;
}

/** Tache d'ombre douce au sol (occlusion de contact). */
function contactShadow(m: Mats, x: number, z: number, sx: number, sz: number, rot = 0, y = 0.006) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), m.shadow);
  p.rotation.set(-Math.PI / 2, 0, rot);
  p.position.set(x, y, z);
  p.renderOrder = 1;
  p.userData.keep = true;
  return p;
}

// ---------- bâtiments ----------
function buildPenthouse(m: Mats, vr: () => number) {
  const g = new THREE.Group();
  const floors = 5, fh = 0.42, w = 1.15, d = 1.15;
  const cw = w - 0.06, cd = d - 0.06;
  g.add(box(w + 0.1, 0.14, d + 0.1, m.concrete));
  g.add(box(cw, floors * fh, cd, m.wall, 0, 0.14));
  windows(g, m, vr, cw, cd, 0.14, floors, fh, 3, 3, 0.24, 0.27);
  // dalles d'étage en saillie + garde-corps vitrés en façade avant
  for (let f = 1; f < floors; f++) {
    const y = 0.14 + f * fh;
    g.add(box(w + 0.06, 0.045, d + 0.06, m.trim, 0, y - 0.02));
    g.add(box(w + 0.06, 0.11, 0.008, m.glassClear, 0, y + 0.025, d / 2 + 0.026));
    g.add(box(w + 0.06, 0.012, 0.016, m.frame, 0, y + 0.135, d / 2 + 0.026));
    if (f % 2 === 1) {
      g.add(box(0.2, 0.06, 0.06, m.concrete, -w / 2 + 0.14, y + 0.025, d / 2 - 0.0));
      bush(g, m, vr, -w / 2 + 0.14, y + 0.07, d / 2 + 0.0, 0.06);
    } else {
      g.add(box(0.2, 0.06, 0.06, m.concrete, w / 2 - 0.14, y + 0.025, d / 2 - 0.0));
      bush(g, m, vr, w / 2 - 0.14, y + 0.07, d / 2 + 0.0, 0.06, m.leaf);
    }
  }
  const top = 0.14 + floors * fh;
  // terrasse + penthouse vitré en retrait
  g.add(box(w + 0.12, 0.06, d + 0.12, m.trim, 0, top));
  g.add(box(0.78, 0.42, 0.72, m.glass, -0.12, top + 0.06, -0.12));
  for (const [x, z] of [[-0.51, 0.24], [0.27, 0.24], [-0.12, 0.24], [0.27, -0.12], [0.27, -0.48], [-0.51, -0.48]]) g.add(box(0.025, 0.42, 0.025, m.frame, x, top + 0.06, z));
  g.add(box(0.9, 0.05, 0.84, m.roofDark, -0.12, top + 0.48, -0.12));
  g.add(box(0.92, 0.015, 0.86, m.frame, -0.12, top + 0.47, -0.12));
  g.add(box(w + 0.12, 0.12, 0.012, m.glassClear, 0, top + 0.06, d / 2 + 0.055));
  g.add(box(w + 0.12, 0.012, 0.02, m.frame, 0, top + 0.18, d / 2 + 0.055));
  g.add(box(0.012, 0.12, d + 0.12, m.glassClear, w / 2 + 0.055, top + 0.06, 0));
  // parasol, transats, jardinières
  const parasol = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.08, 24, 1, true), m.accent);
  parasol.position.set(0.36, top + 0.42, 0.36);
  parasol.castShadow = true;
  g.add(parasol);
  g.add(box(0.015, 0.32, 0.015, m.metal, 0.36, top + 0.06, 0.36));
  g.add(box(0.09, 0.025, 0.2, m.fabric, 0.12, top + 0.08, 0.38));
  g.add(box(0.09, 0.025, 0.2, m.fabric, 0.42, top + 0.08, 0.12));
  g.add(box(0.06, 0.06, 0.4, m.woodDark, -0.5, top + 0.06, 0.3));
  bush(g, m, vr, -0.5, top + 0.1, 0.22, 0.07);
  bush(g, m, vr, -0.5, top + 0.1, 0.4, 0.06, m.leafLight);
  return g;
}

function buildImmeuble(m: Mats, vr: () => number) {
  const g = new THREE.Group();
  const floors = 4, fh = 0.4, w = 1.9, d = 1.05;
  g.add(box(w, 0.42, d, m.wallStone)); // rez-de-chaussée en pierre
  for (let i = 0; i < 4; i++) {
    const x = -0.72 + i * 0.48;
    if (i === 1) {
      g.add(box(0.22, 0.32, 0.03, m.woodDark, x, 0.0, d / 2 + 0.005));
      g.add(box(0.26, 0.03, 0.04, m.trim, x, 0.32, d / 2 + 0.01));
    } else {
      g.add(box(0.34, 0.34, 0.02, m.frame, x, 0.01, d / 2 + 0.008));
      g.add(box(0.3, 0.3, 0.006, vr() < 0.6 ? m.glassLit : m.glass, x, 0.03, d / 2 + 0.02));
    }
  }
  g.add(box(w + 0.04, 0.04, d + 0.04, m.trim, 0, 0.42));
  g.add(box(w, (floors - 1) * fh, d, m.facade, 0, 0.42));
  windows(g, m, vr, w, d, 0.42, floors - 1, fh, 5, 2, 0.17, 0.27, m.frameWhite);
  // balcons filants en fer forgé
  for (let f = 0; f < floors - 1; f++) {
    const y = 0.42 + f * fh + 0.08;
    g.add(box(w + 0.06, 0.03, 0.16, m.trim, 0, y, d / 2 + 0.08));
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, 0.11), m.railing);
    const ruv = rail.geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < ruv.count; i++) ruv.setX(i, ruv.getX(i) * (w + 0.06) * 8);
    rail.position.set(0, y + 0.03 + 0.055, d / 2 + 0.16);
    g.add(rail);
  }
  // corniche + toit mansardé en zinc
  const roofY = 0.42 + (floors - 1) * fh;
  g.add(box(w + 0.1, 0.05, d + 0.1, m.trim, 0, roofY - 0.02));
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.04, 0);
  shape.lineTo(w / 2 + 0.04, 0);
  shape.lineTo(w / 2 - 0.22, 0.42);
  shape.lineTo(-w / 2 + 0.22, 0.42);
  shape.lineTo(-w / 2 - 0.04, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.08, bevelEnabled: false });
  geo.translate(0, 0, -(d + 0.08) / 2);
  const roof = new THREE.Mesh(geo, m.roofZinc);
  roof.position.y = roofY + 0.03;
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);
  for (let i = 0; i < 3; i++) {
    const x = -0.55 + i * 0.55;
    g.add(box(0.2, 0.2, 0.16, m.frameWhite, x, roofY + 0.1, d / 2 - 0.08));
    g.add(box(0.12, 0.13, 0.006, m.glass, x, roofY + 0.13, d / 2 + 0.003));
    const cap = gableRoof(0.2, 0.18, 0.09, m.roofZinc, roofY + 0.3, 0.02);
    cap.position.set(x, roofY + 0.3, d / 2 - 0.08);
    g.add(cap);
  }
  for (const cx of [0.6, -0.65]) {
    g.add(box(0.14, 0.3, 0.14, m.wallStone, cx, roofY + 0.32, -0.15));
    g.add(box(0.16, 0.02, 0.16, m.trim, cx, roofY + 0.62, -0.15));
    for (const dx of [-0.035, 0.035]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.06, 10), m.roofTerracotta);
      pot.position.set(cx + dx, roofY + 0.67, -0.15);
      g.add(pot);
    }
  }
  return g;
}

function buildMaison(m: Mats, vr: () => number) {
  const g = new THREE.Group();
  const w = 1.2, d = 0.95, h = 0.75;
  g.add(box(w + 0.04, 0.06, d + 0.04, m.wallStone));
  g.add(box(w, h - 0.06, d, m.wall, 0, 0.06));
  g.add(gableRoof(w, d, 0.5, m.roofTerracotta, h));
  // porte + encadrement
  g.add(box(0.3, 0.48, 0.02, m.frameWhite, 0, 0.06, d / 2 + 0.005));
  g.add(box(0.24, 0.44, 0.03, m.woodDark, 0, 0.06, d / 2 + 0.01));
  g.add(box(0.012, 0.012, 0.03, m.metal, 0.08, 0.3, d / 2 + 0.03));
  for (const x of [-0.38, 0.38]) {
    windowAt(g, m, vr, x, 0.32, d / 2, "z", 1, 0.24, 0.24, m.frameWhite);
    g.add(box(0.11, 0.27, 0.02, m.shutter, x - 0.19, 0.305, d / 2 + 0.012));
    g.add(box(0.11, 0.27, 0.02, m.shutter, x + 0.19, 0.305, d / 2 + 0.012));
  }
  windowAt(g, m, vr, w / 2, 0.32, 0, "x", 1, 0.24, 0.24, m.frameWhite);
  windowAt(g, m, vr, -w / 2, 0.32, 0, "x", -1, 0.24, 0.24, m.frameWhite);
  g.add(box(0.14, 0.42, 0.14, m.wallStone, 0.32, h + 0.12, -0.18));
  g.add(box(0.17, 0.03, 0.17, m.trim, 0.32, h + 0.54, -0.18));
  // jardinet + clôture blanche
  for (let i = 0; i < 7; i++) g.add(box(0.035, 0.17, 0.025, m.frameWhite, -0.66 + i * 0.22, 0, d / 2 + 0.42));
  g.add(box(1.36, 0.025, 0.02, m.frameWhite, 0, 0.12, d / 2 + 0.42));
  g.add(box(1.36, 0.025, 0.02, m.frameWhite, 0, 0.04, d / 2 + 0.42));
  bush(g, m, vr, -0.45, 0, d / 2 + 0.18, 0.1);
  bush(g, m, vr, 0.45, 0, d / 2 + 0.2, 0.09, m.leafLight);
  for (let i = 0; i < 6; i++) {
    const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 1), i % 2 ? m.flowerC : m.flowerA);
    fl.position.set(-0.25 + (i % 3) * 0.06 + (i > 2 ? 0.5 : 0), 0.05, d / 2 + 0.3 + (vr() - 0.5) * 0.06);
    g.add(fl);
  }
  return g;
}

function palmTree(m: Mats, vr: () => number) {
  const g = new THREE.Group();
  const segs = 9;
  let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    const r0 = 0.05 - i * 0.002, r1 = r0 - 0.002;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0 + 0.006, 0.1, 10), m.trunk);
    const lean = 0.012 * i;
    seg.position.set(x + lean / 2, y + 0.05, 0);
    seg.rotation.z = -0.1 - i * 0.012;
    g.add(seg);
    x += lean * 0.12 + 0.011;
    y += 0.1;
  }
  const top = new THREE.Vector3(x, y, 0);
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const len = 0.5 + vr() * 0.12;
    const geo = new THREE.PlaneGeometry(len, 0.16, 10, 1);
    // arc retombant
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const t = (p.getX(k) + len / 2) / len;
      p.setXYZ(k, t * len, -t * t * 0.28, p.getY(k) * (1 - t * 0.5));
    }
    geo.computeVertexNormals();
    const f = new THREE.Mesh(geo, m.palm);
    f.position.copy(top);
    f.rotation.set(0.25 * (vr() - 0.5), (i / fronds) * Math.PI * 2 + vr() * 0.3, 0.35 + vr() * 0.25);
    g.add(f);
  }
  for (let i = 0; i < 4; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), m.woodDark);
    nut.position.set(top.x + Math.cos(i * 1.6) * 0.04, top.y - 0.03, Math.sin(i * 1.6) * 0.04);
    g.add(nut);
  }
  return g;
}

function buildVilla(m: Mats, vr: () => number) {
  const g = new THREE.Group();
  g.add(box(1.9, 0.08, 1.5, m.concrete, 0, 0, -0.1)); // dalle
  g.add(box(1.5, 0.5, 0.9, m.wall, -0.15, 0.08, -0.25));
  g.add(box(1.15, 0.42, 0.8, m.wall, 0.2, 0.58, -0.32));
  g.add(box(1.3, 0.05, 1.0, m.roofDark, 0.2, 1.0, -0.3));
  g.add(box(1.32, 0.012, 1.02, m.frame, 0.2, 0.995, -0.3));
  g.add(box(1.7, 0.05, 1.08, m.trim, -0.15, 0.58, -0.22));
  // grandes baies vitrées à montants fins
  g.add(box(1.1, 0.38, 0.03, m.glass, -0.2, 0.1, 0.21));
  for (let i = 0; i <= 4; i++) g.add(box(0.014, 0.4, 0.04, m.frame, -0.75 + i * 0.275, 0.09, 0.215));
  g.add(box(1.12, 0.014, 0.04, m.frame, -0.2, 0.48, 0.215));
  g.add(box(0.85, 0.3, 0.03, m.glassLit, 0.25, 0.64, 0.09));
  for (let i = 0; i <= 3; i++) g.add(box(0.014, 0.32, 0.04, m.frame, -0.175 + i * 0.283, 0.63, 0.095));
  g.add(box(0.03, 0.3, 0.5, m.glass, 0.78, 0.64, -0.32));
  g.add(box(1.7, 0.1, 0.012, m.glassClear, -0.15, 0.63, 0.32));
  // bardage bois
  g.add(box(0.36, 0.5, 0.92, m.wood, 0.62, 0.08, -0.25));
  // piscine : margelle, eau, deck, transats
  g.add(box(1.25, 0.06, 0.5, m.trim, -0.2, 0.06, 0.48));
  const pool = box(1.1, 0.03, 0.38, m.pool, -0.2, 0.1, 0.48);
  pool.receiveShadow = true;
  g.add(pool);
  g.add(box(0.36, 0.04, 0.5, m.wood, 0.62, 0.06, 0.48));
  for (const z of [0.38, 0.6]) {
    g.add(box(0.26, 0.025, 0.09, m.fabric, 0.62, 0.11, z));
    const back = box(0.08, 0.02, 0.09, m.fabric, 0.52, 0.12, z);
    back.rotation.z = 0.6;
    g.add(back);
  }
  bush(g, m, vr, 0.62, 0.08, -0.82, 0.09);
  bush(g, m, vr, -0.85, 0.08, -0.6, 0.1, m.leafLight);
  // palmier
  const palm = palmTree(m, vr);
  palm.position.set(-0.98, 0, 0.42);
  palm.rotation.y = 2.6;
  g.add(palm);
  return g;
}

function buildCommerce(m: Mats, vr: () => number) {
  const g = new THREE.Group();
  const w = 1.3, d = 0.9;
  g.add(box(w, 0.9, d, m.wallWarm));
  g.add(box(1.06, 0.5, 0.02, m.frame, 0, 0.04, d / 2 + 0.008));
  g.add(box(1.02, 0.46, 0.006, m.glassLit, 0, 0.06, d / 2 + 0.02));
  for (let i = 1; i < 4; i++) g.add(box(0.014, 0.46, 0.02, m.frame, -0.51 + i * 0.255, 0.06, d / 2 + 0.024));
  // store rayé orange / blanc
  for (let i = 0; i < 6; i++) {
    const s = box(w / 6, 0.02, 0.34, i % 2 ? m.fabric : m.accent, -w / 2 + (w / 6) * (i + 0.5), 0.56, d / 2 + 0.15);
    s.rotation.x = 0.35;
    g.add(s);
  }
  g.add(box(0.7, 0.16, 0.04, m.accent, 0, 0.68, d / 2 + 0.02)); // enseigne
  g.add(box(0.6, 0.04, 0.045, m.fabric, 0, 0.74, d / 2 + 0.025));
  g.add(box(w + 0.08, 0.06, d + 0.08, m.trim, 0, 0.9));
  g.add(box(0.3, 0.14, 0.3, m.metal, -0.3, 0.96, -0.15)); // clim
  g.add(box(0.22, 0.01, 0.22, m.frame, -0.3, 1.1, -0.15));
  bush(g, m, vr, 0.58, 0, d / 2 + 0.12, 0.08);
  bush(g, m, vr, -0.58, 0, d / 2 + 0.12, 0.08);
  return g;
}

function buildTerrain(m: Mats, rand: () => number, vr: () => number, compact: boolean) {
  const g = new THREE.Group();
  g.add(box(1.5, 0.03, 1.2, m.grassDark));
  for (let i = 0; i < 4; i++) {
    const x = i % 2 ? 0.72 : -0.72, z = i < 2 ? 0.57 : -0.57;
    g.add(box(0.045, 0.22, 0.045, m.wood, x, 0, z));
  }
  g.add(box(1.46, 0.012, 0.012, m.fabric, 0, 0.17, 0.57));
  g.add(box(1.46, 0.012, 0.012, m.fabric, 0, 0.17, -0.57));
  g.add(box(0.012, 0.012, 1.14, m.fabric, 0.72, 0.17, 0));
  g.add(box(0.012, 0.012, 1.14, m.fabric, -0.72, 0.17, 0));
  // panneau « à vendre »
  g.add(box(0.035, 0.5, 0.035, m.woodDark, 0.45, 0, 0.3));
  g.add(box(0.36, 0.22, 0.025, m.accent, 0.45, 0.36, 0.32));
  g.add(box(0.28, 0.04, 0.03, m.fabric, 0.45, 0.45, 0.33));
  const t = makeTree(m, vr, legacyTree(rand, "round", 0.55), compact);
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

function buildMascotHome(m: Mats, vr: () => number) {
  const g = new THREE.Group();
  g.add(box(0.99, 0.05, 0.84, m.wallStone));
  g.add(box(0.95, 0.57, 0.8, m.wallWarm, 0, 0.05));
  g.add(gableRoof(0.95, 0.8, 0.45, m.accentTiles, 0.62, 0.1));
  g.add(box(0.26, 0.42, 0.02, m.frameWhite, 0, 0.05, 0.405));
  g.add(box(0.22, 0.38, 0.03, m.woodDark, 0, 0.05, 0.41));
  windowAt(g, m, vr, 0.3, 0.3, 0.4, "z", 1, 0.2, 0.18, m.frameWhite);
  windowAt(g, m, vr, -0.475, 0.3, 0, "x", -1, 0.2, 0.18, m.frameWhite);
  windowAt(g, m, vr, 0.475, 0.3, 0, "x", 1, 0.2, 0.18, m.frameWhite);
  g.add(box(0.12, 0.3, 0.12, m.wallStone, -0.26, 0.85, -0.12));
  g.add(box(0.15, 0.025, 0.15, m.trim, -0.26, 1.15, -0.12));
  g.add(box(0.3, 0.03, 0.14, m.wallStone, 0, 0, 0.5));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), m.lamp);
  lamp.position.set(-0.2, 0.42, 0.46);
  g.add(lamp);
  g.add(box(0.015, 0.06, 0.04, m.frame, -0.2, 0.44, 0.42));
  bush(g, m, vr, 0.36, 0, 0.5, 0.08);
  bush(g, m, vr, -0.38, 0, 0.5, 0.07, m.leafLight);
  return g;
}

function makeCloud(mat: THREE.SpriteMaterial, rand: () => number, aspect: number) {
  // Mêmes tirages que la version low-poly (nombre, taille et place des bouffées) : la disposition ne bouge pas.
  const g = new THREE.Group();
  const n = 3 + Math.floor(rand() * 3);
  let size = 0;
  for (let i = 0; i < n; i++) {
    size += 0.35 + rand() * 0.35;
    rand();
    rand();
  }
  // Un seul nuage « photo » (cumulus volumétrique pré-rendu), à l'échelle de l'ancien amas.
  const sp = new THREE.Sprite(mat);
  const w = Math.max(2.6, n * 0.45 + size * 0.9);
  sp.scale.set(w, w * aspect, 1);
  sp.position.set(0, w * aspect * 0.18, 0);
  g.add(sp);
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

/** Ciel en dégradé (+ soleil) converti en carte d'environnement : reflets du verre et de l'eau. */
function skyEnvironment(renderer: THREE.WebGLRenderer, night: boolean) {
  const pm = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(night ? "#0b1430" : "#5d97d1") },
      hor: { value: new THREE.Color(night ? "#2a3150" : "#eef3f5") },
      bot: { value: new THREE.Color(night ? "#120f16" : "#8a7a62") },
      sunCol: { value: new THREE.Color(night ? "#9fb6ff" : "#fff1dc") },
      sunDir: { value: new THREE.Vector3(7, 12, 8).normalize() },
      sunPow: { value: night ? 3 : 40 },
    },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunCol; uniform vec3 sunDir; uniform float sunPow; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = d.y > 0.0 ? mix(hor, top, pow(d.y, 0.55)) : mix(hor, bot, pow(-d.y, 0.35));
        float bands = smoothstep(0.55, 0.9, sin(d.x * 9.0 + d.z * 5.0) * 0.5 + 0.5) * smoothstep(0.05, 0.35, d.y) * (1.0 - smoothstep(0.5, 0.9, d.y));
        c = mix(c, hor * 1.15, bands * 0.5);
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * sunPow + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
  const rt = pm.fromScene(scene, 0, 0.1, 100);
  pm.dispose();
  geo.dispose();
  mat.dispose();
  return rt;
}

/** Brins d'herbe instanciés sur le plateau (évite bâtiments, étang et chemins). */
function grassField(m: Mats, vr: () => number, count: number, maxR: number, exclude: { x: number; z: number; r: number }[]) {
  const blade = new THREE.BufferGeometry();
  const w = 0.012, h = 0.11;
  const verts = [-w, 0, 0, w, 0, 0, -w * 0.6, h * 0.5, 0.01, w * 0.6, h * 0.5, 0.01, 0, h, 0.03];
  blade.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  // deux sens d'enroulement : même éclairage des deux côtés (normales vers le ciel)
  blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 2, 1, 0, 3, 1, 2, 4, 3, 2]);
  blade.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0.2, 0, 1, 0.2, 0, 1, 0.3, 0, 1, 0.3, 0, 1, 0.4], 3));
  blade.setAttribute("color", new THREE.Float32BufferAttribute([0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1.1, 1.1, 1.1], 3));
  const mesh = new THREE.InstancedMesh(blade, m.blade, count);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const palette = [new THREE.Color("#4f7a2c"), new THREE.Color("#6b9a3a"), new THREE.Color("#86ad4a"), new THREE.Color("#a3b85c")];
  let n = 0;
  for (let tries = 0; tries < count * 3 && n < count; tries++) {
    const r = maxR * Math.sqrt(vr());
    const a = vr() * Math.PI * 2;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (exclude.some((e) => (e.x - x) ** 2 + (e.z - z) ** 2 < e.r * e.r)) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.set((vr() - 0.5) * 0.5, vr() * Math.PI * 2, (vr() - 0.5) * 0.5);
    const s = 0.6 + vr() * 0.9;
    dummy.scale.set(1, s, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    const patch = fbm(x * 0.6 + 50, z * 0.6 + 50, 0, 3, 99);
    const idx = Math.min(3, Math.floor(clamp01(patch * 1.3 - 0.1 + (vr() - 0.5) * 0.4) * 4));
    col.copy(palette[idx]);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.keep = true;
  return mesh;
}

/** Déformation radiale douce par le bruit, raccordée autour de l'axe (pas de couture). */
function radialNoise(geo: THREE.BufferGeometry, amp: (y: number) => number, freq: number, yFreq: number, seed: number, yAmp = 0) {
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const cx = x / r, cz = z / r;
    const n = fbm(cx * freq + 20, y * yFreq + 20, cz * freq + 20, 4, seed) - 0.5;
    const k = 1 + amp(y) * n * 2;
    const dy = yAmp ? (fbm(cx * freq * 1.7 + 40, y * yFreq + 40, cz * freq * 1.7 + 40, 3, seed + 3) - 0.5) * yAmp : 0;
    p.setXYZ(i, x * k, y + dy, z * k);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
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
/** Emprise approximative (rayon, après mise à l'échelle) pour l'herbe et l'ombre de contact. */
const FOOTPRINT: Record<IslandKind, [number, number]> = {
  appartement: [1.75, 1.75],
  villa: [2.7, 2.2],
  immeuble: [2.9, 1.7],
  commerce: [2.0, 1.5],
  maison: [1.9, 1.9],
  terrain: [2.1, 1.7],
};

export function createIsland(canvas: HTMLCanvasElement, overlay: HTMLElement, opts: IslandOptions): IslandHandle {
  const rand = rng(20261029); // disposition (inchangée)
  const vr = rng(77031); // détails visuels
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.compact ? 1.6 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  const T = makeTextures(opts.compact, vr);
  const m = makeMaterials(T);
  const envDay = skyEnvironment(renderer, false);
  const envNight = skyEnvironment(renderer, true);
  scene.environment = envDay.texture;

  // Lumières
  const hemi = new THREE.HemisphereLight("#dff1ff", "#b08a66", 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d8", 3.0);
  sun.position.set(7, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.compact ? 1024 : 2048, opts.compact ? 1024 : 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#ffd0b3", 0.5);
  rim.position.set(-8, 3, -6);
  scene.add(rim);
  // lumière douce par en dessous pour ne pas boucher la roche sous l'île
  const under = new THREE.DirectionalLight("#ffd6bd", 0.45);
  under.position.set(2, -8, 6);
  scene.add(under);
  const homeLight = new THREE.PointLight("#ffb468", 0, 4, 2);
  homeLight.position.set(0, 0.9, 0.9);

  // Groupe qui flotte et tourne
  const floater = new THREE.Group();
  const island = new THREE.Group();
  floater.add(island);
  scene.add(floater);

  // Plateau d'herbe (dessus plat pour poser les bâtiments) — tirages identiques à l'ancienne version
  burnJitter(new THREE.CylinderGeometry(5.9, 5.7, 0.45, 22, 1), 0.25, rand, 0.225);
  const topGeo = new THREE.CylinderGeometry(5.9, 5.7, 0.45, 160, 3);
  radialNoise(topGeo, () => 0.028, 2.6, 0, 3);
  const top = new THREE.Mesh(topGeo, [m.grassSide, m.grass, m.soil]);
  top.position.y = -0.225;
  top.receiveShadow = true;
  top.castShadow = true;
  island.add(top);
  burnJitter(new THREE.CylinderGeometry(5.75, 5.0, 0.7, 20, 1), 0.3, rand);
  const soilGeo = new THREE.CylinderGeometry(5.72, 5.0, 0.7, 160, 6);
  radialNoise(soilGeo, () => 0.04, 3, 1.2, 4, 0.08);
  const soil = new THREE.Mesh(soilGeo, m.soil);
  soil.position.y = -0.8;
  soil.receiveShadow = true;
  island.add(soil);
  // Roche en dessous : colonnes et strates, dégradé terre cuite -> brun sombre
  {
    const legacy = new THREE.ConeGeometry(5.1, 5.4, 16, 5);
    legacy.rotateX(Math.PI);
    burnJitter(legacy, 0.75, rand);
  }
  const rockGeo = new THREE.ConeGeometry(5.1, 5.4, opts.compact ? 120 : 180, 40);
  rockGeo.rotateX(Math.PI);
  {
    // falaise : grandes masses + arêtes verticales + strates, de plus en plus marquées vers la pointe
    const p = rockGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-5) continue;
      const cx = x / r, cz = z / r;
      const A = 0.06 + 0.42 * smooth(2.6, -1.4, y);
      const big = fbm(cx * 1.8 + 20, y * 0.3 + 20, cz * 1.8 + 20, 3, 5) - 0.5;
      const ridge = 1 - Math.abs(fbm(cx * 9 + 7, y * 0.8 + 7, cz * 9 + 7, 3, 15) * 2 - 1);
      const strata = Math.sin(y * 7 + big * 4) * 0.5 + 0.5;
      const k = 1 + A * (big * 1.6 + (ridge - 0.5) * 0.7) + 0.025 * (strata - 0.5) * smooth(2.7, 1.5, y);
      p.setXYZ(i, x * k, y + (big * 0.5 + (ridge - 0.5) * 0.25) * smooth(1.0, -2.2, y), z * k);
    }
    rockGeo.computeVertexNormals();
  }
  shade(rockGeo, () => 1);
  {
    const p = rockGeo.getAttribute("position") as THREE.BufferAttribute;
    const c = rockGeo.getAttribute("color") as THREE.BufferAttribute;
    const hi = new THREE.Color("#c27a4c"), mid = new THREE.Color("#94603f"), lo = new THREE.Color("#5c463d");
    const tmpC = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = clamp01((2.7 - y) / 5.4);
      const nx = fbm(p.getX(i) * 0.8, y * 2.5, p.getZ(i) * 0.8, 3, 6);
      const tt = clamp01(t + (nx - 0.5) * 0.35);
      tmpC.copy(hi).lerp(mid, smooth(0, 0.45, tt)).lerp(lo, smooth(0.45, 1, tt));
      const k = 0.85 + 0.3 * nx;
      c.setXYZ(i, tmpC.r * k, tmpC.g * k, tmpC.b * k);
    }
  }
  const rockMesh = new THREE.Mesh(rockGeo, m.rock);
  rockMesh.position.y = -3.8;
  rockMesh.receiveShadow = true;
  island.add(rockMesh);
  // stalactites rocheuses sous l'île (silhouette d'île flottante)
  {
    const geos: THREE.BufferGeometry[] = [];
    // [angle, distance à l'axe, rayon, longueur] : accrochées à la paroi du cône
    const spikes = [
      [0.3, 2.6, 0.9, 1.9], [1.5, 3.2, 0.8, 1.5], [2.6, 2.2, 0.8, 1.7], [3.7, 3.0, 0.9, 1.6], [4.7, 2.4, 1.0, 2.0], [5.7, 3.4, 0.7, 1.3], [0.9, 1.3, 0.8, 1.5],
    ];
    for (const [a, rr, rad, len] of spikes) {
      const geo = new THREE.CylinderGeometry(rad, rad * 0.12, len, 40, 10);
      radialNoise(geo, () => 0.3, 2.2, 1.0, 50 + Math.round(a * 10), 0.12);
      const top = (rr / 5.1) * 5.4 - 6.5 + 0.35;
      geo.translate(Math.sin(a) * rr, top - len / 2, Math.cos(a) * rr);
      geos.push(geo);
    }
    const merged = mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    if (merged) {
      const p = merged.getAttribute("position") as THREE.BufferAttribute;
      const c = new Float32Array(p.count * 3);
      const hi = new THREE.Color("#9a5f3e"), lo = new THREE.Color("#4e3d36"), tc = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const t = clamp01((-1.2 - p.getY(i)) / 4);
        const n = 0.8 + 0.4 * fbm(p.getX(i), p.getY(i) * 2, p.getZ(i), 3, 60);
        tc.copy(hi).lerp(lo, t);
        c[i * 3] = tc.r * n;
        c[i * 3 + 1] = tc.g * n;
        c[i * 3 + 2] = tc.b * n;
      }
      merged.setAttribute("color", new THREE.BufferAttribute(c, 3));
      const sm = new THREE.Mesh(merged, m.rock);
      sm.receiveShadow = true;
      island.add(sm);
    }
  }
  // racines qui pendent sous le bord
  {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < (opts.compact ? 30 : 60); i++) {
      const a = vr() * Math.PI * 2;
      const len = 0.12 + vr() * 0.3;
      const geo = new THREE.CylinderGeometry(0.003, 0.012, len, 5);
      geo.translate(0, -len / 2, 0);
      geo.rotateZ((vr() - 0.5) * 0.5);
      geo.rotateX((vr() - 0.5) * 0.5);
      const rr = 5.0 + vr() * 0.1;
      geo.translate(Math.sin(a) * rr, -1.08, Math.cos(a) * rr);
      geos.push(geo);
    }
    const merged = mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    if (merged) island.add(new THREE.Mesh(merged, m.root));
  }
  // quelques blocs suspendus sous l'île
  for (let i = 0; i < 3; i++) {
    const s = 0.35 + rand() * 0.4;
    burnJitter(new THREE.DodecahedronGeometry(s, 0), s * 0.4, rand);
    const geo = lumpy(s, 3, 0.3, 200 + i, 1.4);
    geo.scale(1, 1.25, 1);
    shade(geo, (_x, y) => 0.55 + 0.5 * clamp01(y / (s * 1.25) * 0.5 + 0.5));
    const col = geo.getAttribute("color") as THREE.BufferAttribute;
    const rc = new THREE.Color("#8a5a3e");
    for (let k = 0; k < col.count; k++) col.setXYZ(k, col.getX(k) * rc.r, col.getY(k) * rc.g, col.getZ(k) * rc.b);
    const b = new THREE.Mesh(geo, m.rock);
    const a = rand() * Math.PI * 2;
    b.position.set(Math.cos(a) * (2.5 + rand() * 1.5), -2.2 - rand() * 2.5, Math.sin(a) * (2.5 + rand() * 1.5));
    b.receiveShadow = true;
    island.add(b);
  }

  // Étang + ruisseau + cascade
  const pondAngle = 5.65;
  const pondPos = new THREE.Vector3(Math.sin(pondAngle) * 4.3, 0.012, Math.cos(pondAngle) * 4.3);
  const pondGeo = new THREE.CircleGeometry(0.75, 64);
  radialNoise(pondGeo.rotateX(-Math.PI / 2), () => 0.12, 1.8, 0, 8);
  const shore = new THREE.Mesh(pondGeo.clone().scale(1.14, 1, 1.14), m.wetSand);
  shore.position.set(pondPos.x, 0.006, pondPos.z);
  shore.receiveShadow = true;
  island.add(shore);
  const pond = new THREE.Mesh(pondGeo, m.water);
  pond.position.copy(pondPos);
  pond.receiveShadow = true;
  island.add(pond);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = legacyRock(rand, 0.12 + rand() * 0.06);
    const r = makeRock(m, vr, s);
    r.position.set(pondPos.x + Math.cos(a) * 0.82, r.position.y, pondPos.z + Math.sin(a) * 0.82);
    r.rotation.y = vr() * Math.PI;
    island.add(r);
  }
  // roseaux
  for (let i = 0; i < 14; i++) {
    const a = 0.6 + vr() * 1.6;
    const h = 0.18 + vr() * 0.16;
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, h, 4), m.reed);
    reed.position.set(pondPos.x + Math.cos(a) * (0.66 + vr() * 0.1), h / 2, pondPos.z + Math.sin(a) * (0.66 + vr() * 0.1));
    reed.rotation.set((vr() - 0.5) * 0.3, 0, (vr() - 0.5) * 0.3);
    island.add(reed);
  }
  for (let i = 0; i < 78; i++) rand(); // stries de l'ancienne texture de cascade
  const edgeR = 5.82;
  const fallGroup = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(k ? 0.55 : 0.7, 2.0), m.fall);
    fall.position.set(0, 0, k * 0.04);
    fallGroup.add(fall);
  }
  fallGroup.position.set(Math.sin(pondAngle) * edgeR, -0.95, Math.cos(pondAngle) * edgeR);
  fallGroup.rotation.y = pondAngle;
  island.add(fallGroup);
  const mist = new THREE.Sprite(m.mist);
  mist.scale.set(1.1, 0.7, 1);
  mist.position.set(Math.sin(pondAngle) * (edgeR + 0.15), -1.95, Math.cos(pondAngle) * (edgeR + 0.15));
  island.add(mist);
  const streamGeo = new THREE.PlaneGeometry(0.4, 1.3, 4, 8);
  const stream = new THREE.Mesh(streamGeo, m.water);
  stream.rotation.x = -Math.PI / 2;
  stream.rotation.z = -pondAngle;
  stream.position.set(Math.sin(pondAngle) * 5.2, 0.014, Math.cos(pondAngle) * 5.2);
  stream.receiveShadow = true;
  island.add(stream);

  // Maison de la mascotte au centre + chemins
  const home = buildMascotHome(m, vr);
  bake(home);
  home.rotation.y = -0.25;
  home.scale.setScalar(1.35);
  island.add(home);
  home.add(homeLight);
  island.add(contactShadow(m, 0, 0, 2.0, 1.8, -0.25));

  let mascot: THREE.Sprite | null = null;
  const mascotTex = mascotTexture(opts.mascotUrl, () => {
    if (mascot) mascot.visible = true;
  });
  mascot = new THREE.Sprite(new THREE.SpriteMaterial({ map: mascotTex, transparent: true, depthWrite: false }));
  mascot.scale.set(2.3, 2.3, 1);
  mascot.position.set(0.2, 2.2, 0.4);
  mascot.visible = false;
  island.add(mascot);

  // Zones sans herbe
  const noGrass: { x: number; z: number; r: number }[] = [
    { x: 0, z: 0, r: 0.95 },
    { x: pondPos.x, z: pondPos.z, r: 0.9 },
  ];
  for (let k = 0; k <= 6; k++) {
    const rr = 4.6 + k * 0.2;
    noGrass.push({ x: Math.sin(pondAngle) * rr, z: Math.cos(pondAngle) * rr, r: 0.24 });
  }

  // Parcelles
  type Slot = { kind: IslandKind; group: THREE.Group; count: number; anchor: THREE.Object3D; badge: HTMLElement | null; delay: number; fresh: boolean; base: THREE.Vector3; shadow: THREE.Mesh | null };
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
      const geo = new THREE.CylinderGeometry(0.14, 0.15, 0.04, 14);
      geo.scale(0.9 + vr() * 0.25, 1, 0.8 + vr() * 0.25);
      const st = new THREE.Mesh(geo, m.path);
      st.position.set(pos.x * t + (rand() - 0.5) * 0.12, 0.01, pos.z * t + (rand() - 0.5) * 0.12);
      st.rotation.y = vr() * Math.PI;
      st.receiveShadow = true;
      island.add(st);
      noGrass.push({ x: st.position.x, z: st.position.z, r: 0.15 });
    }
    if (count === 0 && opts.mode === "demo") {
      // vitrine : pas de fondation vide, un bosquet à la place
      for (let k = 0; k < 1; k++) {
        const info = legacyTree(rand);
        const tr = makeTree(m, vr, info, opts.compact);
        tr.position.set(pos.x + (rand() - 0.5) * 1.1, 0, pos.z + (rand() - 0.5) * 1.1);
        island.add(tr);
        island.add(contactShadow(m, tr.position.x, tr.position.z, 1.1 * info.s, 1.1 * info.s));
      }
      continue;
    }
    let g: THREE.Group;
    if (count === 0) g = buildEmpty(m);
    else if (kind === "appartement") g = buildPenthouse(m, vr);
    else if (kind === "immeuble") g = buildImmeuble(m, vr);
    else if (kind === "maison") g = buildMaison(m, vr);
    else if (kind === "villa") g = buildVilla(m, vr);
    else if (kind === "commerce") g = buildCommerce(m, vr);
    else g = buildTerrain(m, rand, vr, opts.compact);
    bake(g);
    g.position.copy(pos);
    g.rotation.y = lay.rot;
    g.userData.s = count === 0 ? 1 : 1.32;
    g.scale.set(1, 0.001, 1);
    island.add(g);
    const [fx, fz] = count === 0 ? [1.4, 1.2] : FOOTPRINT[kind];
    const shadow = contactShadow(m, pos.x, pos.z, fx * 1.25, fz * 1.25, lay.rot);
    shadow.visible = false;
    island.add(shadow);
    noGrass.push({ x: pos.x, z: pos.z, r: Math.max(fx, fz) * 0.5 });
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
    slots.push({ kind, group: g, count, anchor, badge, delay: order * 0.14 + (freshSet.has(kind) ? 0.5 : 0), fresh: freshSet.has(kind), base: pos, shadow });
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
    const info = legacyTree(rand);
    const t = makeTree(m, vr, info, opts.compact);
    t.position.set(x, 0, z);
    t.rotation.y = rand() * Math.PI;
    island.add(t);
    island.add(contactShadow(m, x, z, (info.kind === "pine" ? 1.0 : 1.2) * info.s, (info.kind === "pine" ? 1.0 : 1.2) * info.s));
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
      const rk = makeRock(m, vr, legacyRock(rand));
      rk.position.set(x, rk.position.y, z);
      rk.rotation.y = vr() * Math.PI;
      island.add(rk);
    } else {
      // petit massif fleuri
      const fg = new THREE.Group();
      const n = 4 + Math.floor(vr() * 4);
      const mat = roll < 0.45 ? m.flowerA : roll < 0.7 ? m.flowerB : m.flowerC;
      for (let k = 0; k < n; k++) {
        const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.028 + vr() * 0.015, 1), mat);
        fl.position.set((vr() - 0.5) * 0.18, 0.06 + vr() * 0.04, (vr() - 0.5) * 0.18);
        fg.add(fl);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 3), m.reed);
        stem.position.set(fl.position.x, 0.035, fl.position.z);
        fg.add(stem);
      }
      if (vr() < 0.5) bush(fg, m, vr, 0.05, 0, -0.05, 0.07);
      bake(fg);
      fg.position.set(x, 0, z);
      island.add(fg);
    }
  }

  // Herbe
  island.add(grassField(m, vr, opts.compact ? 7000 : 18000, 5.72, noGrass));

  // Nuages + îlots satellites (hors rotation de l'île)
  const sky = new THREE.Group();
  scene.add(sky);
  // Nuages derrière l'île uniquement (jamais entre la caméra et les bâtiments).
  const clouds: { g: THREE.Group; speed: number; x: number; range: number; z: number; y: number; phase: number }[] = [];
  // Nuages photoréalistes (textures pré-rendues dans /img/nuages, chargées à la demande)
  const CLOUD_ASPECT = [262 / 548, 249 / 550, 241 / 560];
  const cloudLoader = new THREE.TextureLoader();
  const cloudMats = [1, 2, 3].map((i) => {
    const tex = cloudLoader.load(`/img/nuages/nuage-${i}.webp`, () => {
      if (!running) renderOnce();
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    T.list.push(tex);
    return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  });
  const cloudSpots = [
    { x: -7.2, z: -3.5, y: 0.6 },
    { x: 7.4, z: -2.5, y: 1.2 },
    { x: 2.5, z: -7.5, y: -0.6 },
  ];
  for (const spot of cloudSpots) {
    const k = clouds.length;
    const g = makeCloud(cloudMats[k % cloudMats.length], rand, CLOUD_ASPECT[k % CLOUD_ASPECT.length]);
    g.scale.setScalar(1 + rand() * 0.4);
    sky.add(g);
    clouds.push({ g, speed: 0.12 + rand() * 0.1, x: spot.x, range: 0.9 + rand() * 0.6, z: spot.z, y: spot.y, phase: rand() * 6 });
    g.position.set(spot.x, spot.y, spot.z); // place initiale (aussi en mouvement réduit)
  }
  const islets: { g: THREE.Group; phase: number; y: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const s = 0.55 + rand() * 0.25;
    const tGeo = new THREE.CylinderGeometry(s, s * 0.9, 0.18, 48, 1);
    radialNoise(tGeo, () => 0.05, 2, 0, 30 + i);
    const tg = new THREE.Mesh(tGeo, [m.grassSide, m.grass, m.soil]);
    tg.receiveShadow = true;
    g.add(tg);
    {
      const legacy = new THREE.ConeGeometry(s * 0.9, s * 2, 8, 2);
      legacy.rotateX(Math.PI);
      burnJitter(legacy, s * 0.2, rand);
    }
    const rg = new THREE.ConeGeometry(s * 0.9, s * 2, 48, 12);
    rg.rotateX(Math.PI);
    radialNoise(rg, (y) => 0.08 + 0.25 * smooth(s, -s, y), 3, 1, 40 + i, 0.06);
    shade(rg, (_x, y) => 0.55 + 0.45 * clamp01((y + s) / (2 * s)));
    const col = rg.getAttribute("color") as THREE.BufferAttribute;
    const rc = new THREE.Color("#a0653f");
    for (let k = 0; k < col.count; k++) col.setXYZ(k, col.getX(k) * rc.r, col.getY(k) * rc.g, col.getZ(k) * rc.b);
    const rm = new THREE.Mesh(rg, m.rock);
    rm.position.y = -s - 0.09;
    g.add(rm);
    const t = makeTree(m, vr, legacyTree(rand, "pine", 0.6), opts.compact);
    t.position.y = 0.09;
    g.add(t);
    const a = i === 0 ? 2.3 : -2.1;
    g.position.set(Math.sin(a) * 8.3, -1.2 - i * 1.2, Math.cos(a) * 8.3 - 2);
    sky.add(g);
    islets.push({ g, phase: rand() * 6, y: g.position.y });
  }

  // ---------- thème ----------
  function setDark(dark: boolean) {
    scene.environment = dark ? envNight.texture : envDay.texture;
    scene.environmentIntensity = dark ? 0.35 : 0.9;
    hemi.color.set(dark ? "#5b6f9c" : "#dff1ff");
    hemi.groundColor.set(dark ? "#2a2230" : "#b08a66");
    hemi.intensity = dark ? 0.7 : 0.55;
    sun.color.set(dark ? "#9fb6ff" : "#fff0d8");
    sun.intensity = dark ? 0.9 : 3.0;
    rim.color.set(dark ? "#ff9a5c" : "#ffd0b3");
    rim.intensity = dark ? 0.9 : 0.5;
    under.color.set(dark ? "#c0704a" : "#ffd6bd");
    under.intensity = dark ? 0.22 : 0.45;
    m.glass.emissiveIntensity = dark ? 0.06 : 0;
    m.glassLit.emissiveIntensity = dark ? 1.6 : 0;
    m.lamp.emissiveIntensity = dark ? 2.2 : 0.25;
    homeLight.intensity = dark ? 2.2 : 0;
    m.cloud.color.set(dark ? "#6f7896" : "#ffffff");
    m.cloud.opacity = dark ? 0.55 : 0.95;
    for (const cm of cloudMats) {
      cm.color.set(dark ? "#7d86a3" : "#ffffff");
      cm.opacity = dark ? 0.5 : 0.82;
    }
    m.mist.opacity = dark ? 0.2 : 0.45;
    m.fall.color.set(dark ? "#7f93a8" : "#ffffff");
    m.water.emissiveIntensity = dark ? 0.3 : 0.12;
    m.pool.emissiveIntensity = dark ? 0.9 : 0.25;
    m.shadow.opacity = dark ? 0.5 : 0.8;
    renderer.toneMappingExposure = dark ? 1.15 : 1.0;
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
      if (s.shadow) {
        s.shadow.visible = k > 0;
        s.shadow.scale.setScalar(Math.min(1, 0.4 + k * 0.6));
      }
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
    T.fall.offset.y = (T.fall.offset.y + dt * 0.9) % 1;
    T.waterNormal.offset.set((T.waterNormal.offset.x + dt * 0.015) % 1, (T.waterNormal.offset.y + dt * 0.01) % 1);
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
      const mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((x) => mats.add(x));
      });
      Object.values(m).forEach((mat) => mats.add(mat));
      cloudMats.forEach((mat) => mats.add(mat));
      mats.forEach((mat) => mat.dispose());
      T.list.forEach((t) => t.dispose());
      envDay.dispose();
      envNight.dispose();
      mascotTex.dispose();
      renderer.dispose();
    },
  };
}
