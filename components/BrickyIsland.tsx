"use client";

import { useEffect, useRef, useState } from "react";
import type { IslandCounts, IslandHandle, IslandKind } from "../lib/islandScene";
import { useLocale } from "./LocaleProvider";

const KINDS: IslandKind[] = ["appartement", "immeuble", "maison", "villa", "commerce", "terrain"];
const STORAGE_KEY = "bricky_island_counts_v1";

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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    async function start() {
      if (loading || handle) return;
      loading = true;
      try {
        const mod = await import("../lib/islandScene");
        if (disposed || !canvas || !overlay) return;
        handle = mod.createIsland(canvas, overlay, {
          counts,
          mode,
          dark: isDark(),
          reducedMotion: reduced,
          compact: window.innerWidth < 720,
          fresh,
          labels,
          mascotUrl: "/mascot-icon.png",
        });
        setReady(true);
        handle.setActive(visible && !document.hidden);
      } catch {
        setFailed(true);
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) start();
        handle?.setActive(visible && !document.hidden);
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(wrap);

    const onVisibility = () => handle?.setActive(visible && !document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const mo = new MutationObserver(() => handle?.setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      disposed = true;
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      handle?.dispose();
      handle = null;
    };
    // countsKey résume `counts` ; les libellés ne changent qu'avec la langue.
  }, [countsKey, mode, t]);

  return (
    <div ref={wrapRef} className={"island-stage" + (ready ? " is-ready" : "") + (className ? " " + className : "")} role="img" aria-label={ariaLabel}>
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
