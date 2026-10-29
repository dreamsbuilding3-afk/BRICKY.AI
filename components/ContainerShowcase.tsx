"use client";

import { useEffect, useRef, useState } from "react";
import type { ContainerHandle } from "../lib/containerScene";
import { useLocale } from "./LocaleProvider";

const CODES = ["hotel", "chateau", "immeuble", "penthouse", "loft", "duplex", "chalet", "local_commercial", "terrain", "parking", "studio", "maison", "appartement"];
const START = CODES.indexOf("penthouse");

// Section « tous les types de biens » : pile de conteneurs 3D, la pince soulève le type choisi.
export function ContainerShowcase() {
  const { t } = useLocale();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ContainerHandle | null>(null);
  const userPicked = useRef(false);
  const activeRef = useRef(START);
  const [active, setActive] = useState(START);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  function pick(i: number, fromUser: boolean) {
    if (fromUser) userPicked.current = true;
    activeRef.current = i;
    setActive(i);
    handleRef.current?.select(i);
  }

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    let disposed = false;
    let visible = false;
    let loading = false;
    let timer = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
    const items = CODES.map((code) => ({ code, label: t(`ptype.short.${code}`) }));

    async function start() {
      if (loading || handleRef.current) return;
      loading = true;
      try {
        const mod = await import("../lib/containerScene");
        if (disposed || !canvas) return;
        const h = await mod.createContainers(canvas, {
          items,
          active: START,
          reducedMotion: reduced,
          compact: window.innerWidth < 720,
          dark: isDark(),
          onPick: (i) => pick(i, true),
        });
        if (disposed) {
          h.dispose();
          return;
        }
        handleRef.current = h;
        activeRef.current = START;
        setActive(START);
        setReady(true);
        h.setActive(visible && !document.hidden);
      } catch {
        setFailed(true);
      }
    }

    // Défilement automatique tant que le visiteur n'a rien choisi lui-même.
    const auto = () => {
      if (!reduced && visible && !userPicked.current && handleRef.current) {
        let next = Math.floor(Math.random() * CODES.length);
        if (next === activeRef.current) next = (next + 1) % CODES.length;
        pick(next, false);
      }
    };
    timer = window.setInterval(auto, 4800);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) start();
        handleRef.current?.setActive(visible && !document.hidden);
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(stage);
    const onVis = () => handleRef.current?.setActive(visible && !document.hidden);
    document.addEventListener("visibilitychange", onVis);
    const mo = new MutationObserver(() => handleRef.current?.setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [t]);

  const code = CODES[active];
  return (
    <section className="ct-section" aria-labelledby="ct-title">
      <div className="ct-head">
        <span className="eyebrow">{t("categories.eyebrow")}</span>
        <h2 id="ct-title">
          <span>{t("categories.title1")}</span> <em>{t("categories.title2")}</em>
        </h2>
        <p className="sub">{t("categories.sub")}</p>
      </div>

      <div ref={stageRef} className={"ct-stage" + (ready ? " is-ready" : "")}>
        <span className="ct-word" aria-hidden="true">{t("ct.backdrop")}</span>
        {!failed && <canvas ref={canvasRef} className="ct-canvas" aria-label={t("ct.aria")} role="img" />}
        <div className="ct-caption" aria-live="polite">
          <span className="ct-caption-k">{t("ct.selected")}</span>
          <b key={code}>{t(`ptype.${code}`)}</b>
        </div>
      </div>

      <div className="ct-chips" role="group" aria-label={t("ct.choose")}>
        {CODES.map((c, i) => (
          <button key={c} type="button" className={"ct-chip" + (i === active ? " is-active" : "")} aria-pressed={i === active} onClick={() => pick(i, true)}>
            <span className={`ct-chip-dot ct-chip-dot-${i % 8}`} />
            {t(`ptype.${c}`)}
          </button>
        ))}
      </div>
    </section>
  );
}
