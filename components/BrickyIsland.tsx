"use client";

import { useEffect, useRef, useState } from "react";
import type { IslandCounts, IslandHandle, IslandKind } from "../lib/islandScene";
import { useLocale } from "./LocaleProvider";

const KINDS: IslandKind[] = ["appartement", "immeuble", "maison", "villa", "commerce", "terrain"];
const STORAGE_KEY = "bricky_island_counts_v1";
// Sur téléphone, la 3D en continu faisait ramer le défilement. La vitrine de l'accueil
// (biens d'exemple, toujours les mêmes) est alors une image fixe capturée depuis la scène
// elle-même ; l'île d'un utilisateur reste en 3D mais sans animation (une seule image calculée).
const STATIC_QUERY = "(max-width: 720px)";
// Position des badges sur l'image fixe (en % du cadre 400×430), relevée lors de la capture.
const STILL_BADGES: Partial<Record<IslandKind, { x: number; y: number }>> = {
  appartement: { x: 32.6, y: 21.0 },
  immeuble: { x: 75.1, y: 21.6 },
  villa: { x: 60.7, y: 39.7 },
};

type Props = {
  counts: IslandCounts;
  mode: "demo" | "user";
  /** Libellés propres à la vitrine (ex. « Penthouses » au lieu d'« Appartements »). */
  labelOverrides?: Partial<Record<IslandKind, { one: string; many: string }>>;
  className?: string;
  ariaLabel: string;
};

function readSaved(): IslandCounts | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as IslandCounts) : null;
  } catch {
    return null;
  }
}

function save(counts: IslandCounts) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // stockage indisponible : l'île s'affiche quand même, sans mise en avant des nouveautés
  }
}

// Île flottante 3D : chargée seulement à l'approche de l'écran, mise en pause hors
// écran, image fixe si l'utilisateur préfère réduire les animations.
export function BrickyIsland({ counts, mode, labelOverrides, className, ariaLabel }: Props) {
  const { t } = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const countsKey = KINDS.map((k) => counts[k] ?? 0).join(",");

  useEffect(() => {
    const lite = window.matchMedia(STATIC_QUERY).matches;
    if (lite && mode === "demo") return; // image fixe, rien à charger
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!wrap || !canvas || !overlay) return;
    let handle: IslandHandle | null = null;
    let disposed = false;
    let visible = false;
    let loading = false;

    const labels = Object.fromEntries(
      KINDS.map((k) => [k, labelOverrides?.[k] ?? { one: t(`island.kind.${k}.one`), many: t(`island.kind.${k}.many`) }]),
    ) as Record<IslandKind, { one: string; many: string }>;

    let fresh: IslandKind[] = [];
    if (mode === "user") {
      const prev = readSaved();
      if (prev) fresh = KINDS.filter((k) => (counts[k] ?? 0) > (prev[k] ?? 0));
      save(counts);
    }

    const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
    const reduced = lite || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    async function start() {
      if (loading || handle) return;
      loading = true;
      try {
        const mod = await import("../lib/islandScene");
        if (disposed || !canvas || !overlay) return;
        const h = await mod.createIsland(canvas, overlay, {
          counts,
          mode,
          dark: isDark(),
          reducedMotion: reduced,
          compact: lite || window.innerWidth < 720,
          fresh,
          labels,
          mascotUrl: "/mascot-icon.png",
        });
        if (disposed) {
          h.dispose();
          return;
        }
        handle = h;
        setReady(true);
        handle.setActive(visible && !document.hidden);
      } catch {
        setFailed(true);
      }
    }

    // L'île se prépare à l'avance, par petites tâches, dès que la page est au repos :
    // quand on arrive dessus elle est déjà prête et s'affiche immédiatement.
    const hasIdle = "requestIdleCallback" in window; // absent de Safari
    const idleId = hasIdle ? window.requestIdleCallback(() => start(), { timeout: 1500 }) : window.setTimeout(start, 600);
    // Filet de sécurité : si l'on défile très vite, on démarre bien avant que l'île soit à l'écran.
    const early = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) start();
    }, { rootMargin: "1500px 0px" });
    early.observe(wrap);
    // L'animation (et le calcul image par image) ne tourne que lorsque l'île est réellement visible.
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) start();
      handle?.setActive(visible && !document.hidden);
    });
    io.observe(wrap);

    const onVisibility = () => handle?.setActive(visible && !document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const mo = new MutationObserver(() => handle?.setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      disposed = true;
      if (hasIdle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      early.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      handle?.dispose();
      handle = null;
    };
    // countsKey résume `counts` ; les libellés ne changent qu'avec la langue.
  }, [countsKey, mode, t]);

  return (
    <div ref={wrapRef} className={"island-stage island-stage-" + mode + (ready ? " is-ready" : "") + (className ? " " + className : "")} role="img" aria-label={ariaLabel}>
      {mode === "demo" && (
        <div className="island-still" aria-hidden="true">
          {(["light", "dark"] as const).map((th) => (
            <img
              key={th}
              className={"island-still-img island-still-" + th}
              src={`/img/ile/ile-${th}-800.webp`}
              srcSet={`/img/ile/ile-${th}-800.webp 800w, /img/ile/ile-${th}-1200.webp 1200w`}
              sizes="400px"
              width={400}
              height={430}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ))}
          {KINDS.filter((k) => (counts[k] ?? 0) > 0 && STILL_BADGES[k]).map((k) => (
            <span key={k} className="island-badge" style={{ left: `${STILL_BADGES[k]!.x}%`, top: `${STILL_BADGES[k]!.y}%` }}>
              <b>×{counts[k]}</b>
              <span>{(counts[k] ?? 0) > 1 ? (labelOverrides?.[k]?.many ?? t(`island.kind.${k}.many`)) : (labelOverrides?.[k]?.one ?? t(`island.kind.${k}.one`))}</span>
            </span>
          ))}
        </div>
      )}
      {failed ? (
        <div className="island-fallback">
          {KINDS.filter((k) => (counts[k] ?? 0) > 0).map((k) => (
            <span key={k} className="island-badge">
              <b>×{counts[k]}</b>
              <span>{(labelOverrides?.[k] ?? { many: t(`island.kind.${k}.many`) }).many}</span>
            </span>
          ))}
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} className="island-canvas" />
          <div ref={overlayRef} className="island-overlay" aria-hidden="true" />
          <span className="island-hint" aria-hidden="true">{t("island.hint")}</span>
        </>
      )}
    </div>
  );
}
