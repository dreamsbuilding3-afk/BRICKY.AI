// Section « types de biens » : pile de conteneurs colorés (un par type de bien)
// et un bras-pince blanc qui soulève le type sélectionné. three.js, chargé à la demande.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type ContainerItem = { code: string; label: string };
export type ContainerOptions = {
  items: ContainerItem[];
  active: number;
  reducedMotion: boolean;
  compact: boolean;
  dark: boolean;
  onPick: (index: number) => void;
};
export type ContainerHandle = {
  select(index: number): void;
  setActive(active: boolean): void;
  setDark(dark: boolean): void;
  dispose(): void;
};

// Palette « jouet » : contraste fort sur le fond orange de la section.
const PALETTE: { body: string; text: string }[] = [
  { body: "#2347d6", text: "#cfe0ff" },
  { body: "#f4efe6", text: "#1d1d1f" },
  { body: "#ffc533", text: "#1d1d1f" },
  { body: "#1d1d1f", text: "#ffffff" },
  { body: "#16a085", text: "#e6fff7" },
  { body: "#8f9aa6", text: "#ffffff" },
  { body: "#d93a2b", text: "#fff1ee" },
  { body: "#6cb8ff", text: "#0f2a4d" },
];

const L = 2.6, H = 1.1, D = 1.1; // dimensions d'un conteneur

// Pile tassée en pyramide (5 / 4 / 3) : chaque conteneur repose sur ceux du dessous.
// [x, y, z, rotZ, rotY] — rotY faible pour garder des appuis nets.
const SLOTS: [number, number, number, number, number][] = [
  [-5.42, 0.55, 0.12, 0, 0.07],
  [-2.71, 0.55, -0.1, 0, -0.05],
  [0.0, 0.55, 0.18, 0, 0.04],
  [2.71, 0.55, -0.06, 0, -0.08],
  [5.42, 0.55, 0.1, 0, 0.06],
  [-4.06, 1.65, 0.0, 0, -0.06],
  [-1.35, 1.65, 0.14, 0, 0.05],
  [1.36, 1.65, -0.08, 0, -0.04],
  [4.07, 1.65, 0.08, 0, 0.07],
  [-2.71, 2.75, 0.06, 0, 0.05],
  [0.0, 2.75, -0.1, 0, -0.06],
  [2.71, 2.75, 0.12, 0, 0.04],
];

const HOLD = new THREE.Vector3(0.6, 4.95, 1.0);

function ridgeCanvas(w: number, h: number, body: string, ridges: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, w, h);
  // ondulations verticales
  const step = w / ridges;
  for (let i = 0; i < ridges; i++) {
    const x = i * step;
    const g = ctx.createLinearGradient(x, 0, x + step, 0);
    g.addColorStop(0, "rgba(0,0,0,0.10)");
    g.addColorStop(0.35, "rgba(255,255,255,0.10)");
    g.addColorStop(0.65, "rgba(255,255,255,0.03)");
    g.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, step, h);
  }
  // cadre (longerons et montants)
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  const f = Math.round(h * 0.07);
  ctx.fillRect(0, 0, w, f);
  ctx.fillRect(0, h - f, w, f);
  ctx.fillRect(0, 0, f, h);
  ctx.fillRect(w - f, 0, f, h);
  return c;
}

function bumpCanvas(w: number, h: number, ridges: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const step = w / ridges;
  for (let i = 0; i < ridges; i++) {
    const g = ctx.createLinearGradient(i * step, 0, (i + 1) * step, 0);
    g.addColorStop(0, "#202020");
    g.addColorStop(0.5, "#e0e0e0");
    g.addColorStop(1, "#202020");
    ctx.fillStyle = g;
    ctx.fillRect(i * step, 0, step, h);
  }
  const f = Math.round(h * 0.07);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, f);
  ctx.fillRect(0, h - f, w, f);
  return c;
}

function labelLines(label: string): string[] {
  const words = label.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 9 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function sideTexture(label: string, idx: number, pal: { body: string; text: string }, displayFont: string) {
  const c = ridgeCanvas(1024, 432, pal.body, 30);
  const ctx = c.getContext("2d");
  if (ctx) {
    const lines = labelLines(label);
    let size = lines.length > 2 ? 100 : lines.length > 1 ? 128 : 170;
    ctx.fillStyle = pal.text;
    ctx.font = `800 ${size}px ${displayFont}`;
    const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
    while (size > 48 && widest() > 860) {
      size -= 6;
      ctx.font = `800 ${size}px ${displayFont}`;
    }
    ctx.textBaseline = "alphabetic";
    let y = (432 - lines.length * size * 0.9) / 2 + size * 0.78;
    for (const line of lines) {
      ctx.fillText(line, 70, y);
      y += size * 0.92;
    }
    ctx.font = `700 26px ${displayFont}`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(`BRK ${String(idx + 1).padStart(4, "0")}`, 860, 92);
    ctx.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function endTexture(pal: { body: string; text: string }) {
  const c = ridgeCanvas(432, 432, pal.body, 8);
  const ctx = c.getContext("2d");
  if (ctx) {
    // portes : séparation + barres de verrouillage
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(213, 30, 6, 372);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (const x of [90, 160, 272, 342]) ctx.fillRect(x, 40, 8, 352);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createContainers(canvas: HTMLCanvasElement, opts: ContainerOptions): Promise<ContainerHandle> {
  const displayFont = `"Bricolage Grotesque", "Arial Black", Arial, sans-serif`;
  try {
    await document.fonts?.load(`800 96px "Bricolage Grotesque"`);
  } catch {
    // police indisponible : repli sur Arial Black
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.compact ? 1.6 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const hemi = new THREE.HemisphereLight("#fff6ee", "#ff9a66", 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffffff", 2.2);
  sun.position.set(-5, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.compact ? 1024 : 2048, opts.compact ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -8, near: 1, far: 60 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun);

  // Toute la scène est tournée de trois quarts pour montrer les bouts des conteneurs.
  const rig = new THREE.Group();
  rig.rotation.y = -0.42;
  scene.add(rig);

  // Sol invisible qui ne garde que les ombres (la pile « pose » sur la page blanche).
  const floorMat = new THREE.ShadowMaterial({ color: "#3a2a20", opacity: 0.16 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  rig.add(floor);

  // ---------- conteneurs ----------
  const geo = new THREE.BoxGeometry(L, H, D);
  const bumpSide = new THREE.CanvasTexture(bumpCanvas(512, 216, 30));
  const bumpEnd = new THREE.CanvasTexture(bumpCanvas(216, 216, 8));
  type Box = { mesh: THREE.Mesh; mats: THREE.Material[]; textures: THREE.Texture[] };
  const boxes: Box[] = [];
  opts.items.forEach((item, i) => {
    const pal = PALETTE[i % PALETTE.length];
    const side = sideTexture(item.label, i, pal, displayFont);
    const end = endTexture(pal);
    const plainColor = new THREE.Color(pal.body);
    const common = { roughness: 0.42, metalness: 0.05 } as const;
    const sideMat = new THREE.MeshStandardMaterial({ ...common, map: side, bumpMap: bumpSide, bumpScale: 1.4 });
    const endMat = new THREE.MeshStandardMaterial({ ...common, map: end, bumpMap: bumpEnd, bumpScale: 1.2 });
    const capMat = new THREE.MeshStandardMaterial({ ...common, color: plainColor.clone().multiplyScalar(0.92) });
    // ordre BoxGeometry : +x, -x, +y, -y, +z, -z
    const mats = [endMat, endMat, capMat, capMat, sideMat, sideMat];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.index = i;
    rig.add(mesh);
    boxes.push({ mesh, mats: [sideMat, endMat, capMat], textures: [side, end] });
  });

  // ---------- bras-pince ----------
  const white = new THREE.MeshPhysicalMaterial({ color: "#f7f7f5", roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#d9dde2", metalness: 1, roughness: 0.22 });
  const darkPart = new THREE.MeshStandardMaterial({ color: "#3b3f45", metalness: 0.4, roughness: 0.5 });
  const claw = new THREE.Group();
  rig.add(claw);
  const add = (g: THREE.Object3D, parent: THREE.Object3D = claw) => {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    parent.add(g);
    return g;
  };
  const round = (w: number, h: number, d: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), mat);
    return m;
  };
  // bras qui arrive du haut à droite
  const armAngle = 0.78;
  const arm = round(10, 0.62, 0.62, white);
  arm.position.set(Math.cos(armAngle) * 5, 3.1 + Math.sin(armAngle) * 5, 0);
  arm.rotation.z = armAngle;
  add(arm);
  arm.castShadow = false;
  const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 24), white);
  joint.rotation.x = Math.PI / 2;
  joint.position.set(0, 3.1, 0);
  add(joint);
  const jointCap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.95, 20), darkPart);
  jointCap.rotation.x = Math.PI / 2;
  jointCap.position.copy(joint.position);
  add(jointCap);
  const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 20), chrome);
  piston.position.set(0, 2.05, 0);
  add(piston);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.55, 28), white);
  hub.position.set(0, 1.25, 0);
  add(hub);
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 2.7, 6, 18), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.85, 0);
  add(bar);
  const fingers: THREE.Group[] = [];
  for (const sgn of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sgn * 1.6, 0.85, 0);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), white);
    pivot.add(knuckle);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.85, 6, 16), white);
    upper.position.set(sgn * 0.2, -0.5, 0);
    upper.rotation.z = sgn * 0.38;
    upper.scale.z = 1.35;
    pivot.add(upper);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), white);
    elbow.position.set(sgn * 0.37, -0.98, 0);
    elbow.scale.z = 1.3;
    pivot.add(elbow);
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 6, 16), white);
    lower.position.set(sgn * 0.22, -1.42, 0);
    lower.rotation.z = -sgn * 0.42;
    lower.scale.z = 1.3;
    pivot.add(lower);
    const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 10), darkPart);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(sgn * 0.02, -1.82, 0);
    pivot.add(pad);
    add(pivot);
    fingers.push(pivot);
  }
  const clawRest = new THREE.Vector3(HOLD.x, HOLD.y + 1.95, HOLD.z);
  claw.position.copy(clawRest);

  // ---------- animation de sélection ----------
  // Le conteneur tenu n'a pas d'emplacement ; quand on en choisit un autre, la pince
  // dépose le premier devant la pile, attrape le nouveau, et l'ancien glisse dans la place libérée.
  const slotPos = SLOTS.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
  const slotRot = SLOTS.map((v) => new THREE.Euler(0, v[4], v[3]));
  let held = Math.max(0, Math.min(opts.active, boxes.length - 1));
  const slotOf: number[] = [];
  {
    let k = 0;
    boxes.forEach((b, i) => {
      if (i === held) {
        slotOf[i] = -1;
        return;
      }
      slotOf[i] = k % SLOTS.length;
      b.mesh.position.copy(slotPos[slotOf[i]]);
      b.mesh.rotation.copy(slotRot[slotOf[i]]);
      k++;
    });
  }
  let grip = 1; // 1 = fermée, 0 = ouverte
  type Phase = { dur: number; kind: "drop" | "reach" | "close" | "lift" };
  let queue: Phase[] = [];
  let target = held;
  let freed = -1; // emplacement libéré par le conteneur attrapé
  let phaseStart = 0;
  let reachFrom = new THREE.Vector3();
  let dropFrom = new THREE.Vector3();
  let liftFrom = new THREE.Vector3();
  const frontOf = (slot: number) => new THREE.Vector3(slotPos[slot].x, 0.55, slotPos[slot].z + 2.2);
  const heldRot = new THREE.Euler(0, 0, 0);

  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  function placeHeld(b: Box) {
    b.mesh.position.set(claw.position.x, claw.position.y - 1.95, claw.position.z);
    b.mesh.rotation.copy(heldRot);
  }
  placeHeld(boxes[held]);

  let clock = 0;
  let dropping = -1; // conteneur déposé devant la pile, en attente d'être rangé
  let pending = -1;
  function select(index: number) {
    if (index < 0 || index >= boxes.length) return;
    if (queue.length) {
      pending = index; // on termine le geste en cours, puis on enchaîne
      return;
    }
    if (index === held) return;
    target = index;
    freed = slotOf[target];
    if (opts.reducedMotion) {
      const old = boxes[held];
      old.mesh.position.copy(slotPos[freed]);
      old.mesh.rotation.copy(slotRot[freed]);
      slotOf[held] = freed;
      slotOf[target] = -1;
      held = target;
      placeHeld(boxes[held]);
      if (!running) renderOnce();
      return;
    }
    dropping = held;
    queue = [
      { dur: 0.75, kind: "drop" },
      { dur: 0.7, kind: "reach" },
      { dur: 0.25, kind: "close" },
      { dur: 0.95, kind: "lift" },
    ];
    phaseStart = clock;
    dropFrom = boxes[held].mesh.position.clone();
  }

  function stepAnim() {
    const p = queue[0];
    if (!p) return;
    const k = Math.min(1, (clock - phaseStart) / p.dur);
    const e = ease(k);
    if (p.kind === "drop") {
      // la pince s'ouvre et pose l'ancien conteneur au sol, devant la place à libérer
      const b = boxes[dropping];
      b.mesh.position.lerpVectors(dropFrom, frontOf(freed), e);
      b.mesh.position.y += Math.sin(e * Math.PI) * 0.5;
      b.mesh.rotation.set(0, slotRot[freed].y * e, 0);
      grip = 1 - Math.min(1, e * 1.6);
    } else if (p.kind === "reach") {
      const goal = new THREE.Vector3(slotPos[freed].x, slotPos[freed].y + 1.95, slotPos[freed].z);
      claw.position.lerpVectors(reachFrom, goal, e);
      claw.position.z += Math.sin(e * Math.PI) * 1.4; // passe devant la pile
      claw.rotation.z = Math.sin(e * Math.PI) * 0.05;
    } else if (p.kind === "close") {
      grip = e;
      boxes[target].mesh.rotation.set(0, slotRot[freed].y * (1 - e), 0);
    } else if (p.kind === "lift") {
      // on sort le conteneur vers l'avant puis on remonte
      const out = Math.min(1, e * 2.2);
      const up = Math.max(0, (e - 0.25) / 0.75);
      claw.position.set(
        liftFrom.x + (clawRest.x - liftFrom.x) * up,
        liftFrom.y + (clawRest.y - liftFrom.y) * up,
        liftFrom.z + 1.6 * Math.sin(out * Math.PI * 0.5) * (1 - up) + (clawRest.z - liftFrom.z) * up,
      );
      placeHeld(boxes[target]);
      claw.rotation.z = Math.sin(e * Math.PI) * -0.04;
      // l'ancien conteneur glisse à la place libérée (élevé s'il le faut)
      const b = boxes[dropping];
      const slide = ease(Math.min(1, Math.max(0, (e - 0.35) / 0.65)));
      const from = frontOf(freed);
      b.mesh.position.set(
        from.x,
        from.y + (slotPos[freed].y - from.y) * slide + Math.sin(slide * Math.PI) * 0.35,
        from.z + (slotPos[freed].z - from.z) * slide,
      );
      b.mesh.rotation.copy(slotRot[freed]);
    }
    if (k >= 1) {
      queue.shift();
      phaseStart = clock;
      if (p.kind === "drop") reachFrom = claw.position.clone();
      if (p.kind === "close") liftFrom = claw.position.clone();
      if (p.kind === "lift") {
        const b = boxes[dropping];
        b.mesh.position.copy(slotPos[freed]);
        b.mesh.rotation.copy(slotRot[freed]);
        slotOf[dropping] = freed;
        slotOf[target] = -1;
        held = target;
        dropping = -1;
        claw.rotation.z = 0;
        if (pending >= 0) {
          const next = pending;
          pending = -1;
          select(next);
        }
      }
    }
  }

  // ---------- caméra / taille ----------
  const size = new THREE.Vector2();
  let offsetX = 0;
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    size.set(w, h);
    camera.aspect = w / h;
    const wide = camera.aspect > 1.35;
    offsetX = wide ? 1.4 : 0.6;
    const halfW = wide ? 8.4 : 4.6; // demi-largeur de pile visible souhaitée
    const halfH = wide ? 5.0 : 5.4;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(halfW / Math.tan(hFov / 2), halfH / Math.tan(vFov / 2));
    camera.position.set(offsetX, 9.5, dist);
    camera.lookAt(offsetX, wide ? 3.85 : 3.6, 0);
    camera.updateProjectionMatrix();
    if (!running) renderOnce();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ---------- clic sur un conteneur ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const meshes = boxes.map((b) => b.mesh);
  function hit(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const found = ray.intersectObjects(meshes, false)[0];
    return found ? (found.object.userData.index as number) : -1;
  }
  function onClick(e: PointerEvent) {
    const i = hit(e);
    if (i >= 0) opts.onPick(i);
  }
  function onHover(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    canvas.style.cursor = hit(e) >= 0 ? "pointer" : "";
  }
  canvas.addEventListener("pointerup", onClick);
  canvas.addEventListener("pointermove", onHover);

  // ---------- boucle ----------
  let running = false;
  let raf = 0;
  let last = performance.now();
  function frame(dt: number) {
    clock += dt;
    stepAnim();
    // doigts
    fingers.forEach((f, i) => {
      const sgn = i === 0 ? -1 : 1;
      f.rotation.z = sgn * (0.42 * (1 - grip) - 0.02);
    });
    if (!queue.length && !opts.reducedMotion) {
      // léger balancement de la charge
      const sway = Math.sin(clock * 1.1) * 0.025;
      claw.rotation.z = sway;
      claw.position.y = clawRest.y + Math.sin(clock * 0.9) * 0.08;
      const b = boxes[held];
      placeHeld(b);
      b.mesh.rotation.z = sway * 1.4;
    }
  }
  function renderOnce() {
    renderer.render(scene, camera);
  }
  function loop(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  function setActive(active: boolean) {
    if (active && !running && !opts.reducedMotion) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (!active && running) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (opts.reducedMotion) {
      frame(0);
      renderOnce();
    }
  }
  function setDark(dark: boolean) {
    hemi.intensity = dark ? 0.6 : 0.9;
    sun.intensity = dark ? 1.6 : 2.2;
    scene.environmentIntensity = dark ? 0.4 : 0.55;
    floorMat.opacity = dark ? 0.35 : 0.16;
    if (!running) renderOnce();
  }

  setDark(opts.dark);
  frame(0);
  resize();

  return {
    select,
    setActive,
    setDark,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerup", onClick);
      canvas.removeEventListener("pointermove", onHover);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      boxes.forEach((b) => {
        b.mats.forEach((m) => m.dispose());
        b.textures.forEach((t) => t.dispose());
      });
      [white, chrome, darkPart, floorMat].forEach((m) => m.dispose());
      bumpSide.dispose();
      bumpEnd.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
