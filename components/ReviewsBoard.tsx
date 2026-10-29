"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./LocaleProvider";

const REVIEWS = [
  { n: "01", quoteKey: "mreview.1.quote", roleKey: "mreview.1.role", name: "Thomas" },
  { n: "02", quoteKey: "mreview.2.quote", roleKey: "mreview.2.role", name: "Sarah" },
  { n: "03", quoteKey: "mreview.3.quote", roleKey: "mreview.3.role", name: "Julien" },
  { n: "04", quoteKey: "mreview.4.quote", roleKey: "mreview.4.role", name: "Nicolas" },
];

// Fils rouges : 1→2→3→4, plus une diagonale 1→3 comme sur un tableau d'enquête.
const LINKS: [number, number][] = [[0, 1], [1, 2], [2, 3], [0, 2]];

type Pt = { x: number; y: number };

/**
 * Avis clients façon « tableau d'enquête » : fiches fines épinglées, reliées par
 * des fils rouges, et la loupe de l'inspecteur Bricky qui passe d'une fiche à
 * l'autre (ou suit la souris) en grossissant ce qu'elle survole.
 */
export function ReviewsBoard() {
  const { t } = useLocale();
  const sectionRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const lensInnerRef = useRef<HTMLDivElement>(null);
  const pinRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [pins, setPins] = useState<Pt[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState(false);

  // Position des épingles -> tracé des fils.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const measure = () => {
      const base = layer.getBoundingClientRect();
      setSize({ w: base.width, h: base.height });
      setPins(
        pinRefs.current.map((p) => {
          if (!p) return { x: 0, y: 0 };
          const r = p.getBoundingClientRect();
          return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(layer);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [t]);

  // Loupe : suit la souris, sinon se balade de fiche en fiche.
  useEffect(() => {
    const board = boardRef.current;
    const layer = layerRef.current;
    const lens = lensRef.current;
    const inner = lensInnerRef.current;
    const section = sectionRef.current;
    if (!board || !layer || !lens || !inner || !section) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ZOOM = 1.7;
    let raf = 0;
    let running = false;
    let pointer: Pt | null = null;
    const pos: Pt = { x: 0, y: 0 };
    let started = false;
    let target = 0;
    let dwell = 0;
    let last = performance.now();

    const cardCenter = (i: number): Pt => {
      const c = cardRefs.current[i];
      if (!c) return { x: 0, y: 0 };
      const base = layer.getBoundingClientRect();
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width * 0.5 - base.left, y: r.top + r.height * 0.55 - base.top };
    };

    const apply = () => {
      const R = lens.offsetWidth / 2;
      lens.style.transform = `translate3d(${(pos.x - R).toFixed(1)}px, ${(pos.y - R).toFixed(1)}px, 0)`;
      inner.style.width = `${layer.offsetWidth}px`;
      inner.style.height = `${layer.offsetHeight}px`;
      inner.style.transform = `translate3d(${(-pos.x * ZOOM + R).toFixed(1)}px, ${(-pos.y * ZOOM + R).toFixed(1)}px, 0) scale(${ZOOM})`;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let goal: Pt;
      if (pointer) {
        goal = pointer;
      } else {
        goal = cardCenter(target);
        const d = Math.hypot(goal.x - pos.x, goal.y - pos.y);
        if (d < 6) {
          dwell += dt;
          if (dwell > 1.8) {
            dwell = 0;
            target = (target + 1) % REVIEWS.length;
          }
        }
      }
      if (!started) {
        pos.x = goal.x;
        pos.y = goal.y;
        started = true;
      }
      const k = 1 - Math.pow(pointer ? 0.0005 : 0.06, dt);
      pos.x += (goal.x - pos.x) * k;
      pos.y += (goal.y - pos.y) * k;
      apply();
      // léger parallaxe des feuilles d'arrière-plan
      const back = backRef.current;
      if (back) {
        const cx = layer.offsetWidth / 2, cy = layer.offsetHeight / 2;
        back.style.transform = `translate3d(${((cx - pos.x) * 0.03).toFixed(1)}px, ${((cy - pos.y) * 0.03).toFixed(1)}px, 0)`;
      }
      if (running) raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const base = layer.getBoundingClientRect();
      pointer = { x: e.clientX - base.left, y: e.clientY - base.top };
      if (reduced) {
        pos.x = pointer.x;
        pos.y = pointer.y;
        apply();
      }
    };
    const onLeave = () => {
      pointer = null;
    };
    board.addEventListener("pointermove", onMove);
    board.addEventListener("pointerleave", onLeave);

    const io = new IntersectionObserver(
      (entries) => {
        const on = entries.some((e) => e.isIntersecting);
        if (on) setVisible(true);
        if (reduced) {
          const c = cardCenter(0);
          pos.x = c.x;
          pos.y = c.y;
          apply();
          return;
        }
        if (on) start();
        else stop();
      },
      { threshold: 0.15 },
    );
    io.observe(section);
    return () => {
      stop();
      io.disconnect();
      board.removeEventListener("pointermove", onMove);
      board.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const strings = (
    <svg className="rb-strings" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden="true">
      {pins.length === REVIEWS.length &&
        LINKS.map(([a, b], i) => {
          const p = pins[a], q = pins[b];
          const sag = Math.min(60, Math.hypot(q.x - p.x, q.y - p.y) * 0.12);
          const d = `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${((p.x + q.x) / 2).toFixed(1)},${((p.y + q.y) / 2 + sag).toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
          return <path key={i} d={d} pathLength={1} style={{ transitionDelay: `${0.25 + i * 0.18}s` }} />;
        })}
    </svg>
  );

  const cards = (clone: boolean) =>
    REVIEWS.map((r, i) => (
      <figure
        key={r.n}
        className={`rb-card rb-card-${i + 1}`}
        ref={clone ? undefined : (el) => { cardRefs.current[i] = el; }}
      >
        <span className="rb-pin" ref={clone ? undefined : (el) => { pinRefs.current[i] = el; }} />
        <div className="rb-card-top">
          <span className="rb-file">{t("reviews.file")} n°{r.n}</span>
          <span className="rb-stars" aria-label={clone ? undefined : t("reviews.stars")}>★★★★★</span>
        </div>
        <blockquote>“{t(r.quoteKey)}”</blockquote>
        <figcaption>
          <b>{r.name}</b>
          <span>{t(r.roleKey)}</span>
        </figcaption>
      </figure>
    ));

  return (
    <section ref={sectionRef} className={"rb-section" + (visible ? " is-visible" : "")} aria-labelledby="rb-title">
      <div className="rb-head">
        <span className="eyebrow">{t("testimonials.eyebrow")}</span>
        <h2 id="rb-title">{t("testimonials.title")}</h2>
      </div>
      <div ref={boardRef} className="rb-board">
        <div ref={backRef} className="rb-back" aria-hidden="true">
          <span className="rb-word">{t("reviews.backdrop")}</span>
          <span className="rb-scrap rb-scrap-1" />
          <span className="rb-scrap rb-scrap-2" />
          <span className="rb-scrap rb-scrap-3" />
        </div>
        <div ref={layerRef} className="rb-layer">
          {strings}
          {cards(false)}
          <div ref={lensRef} className="rb-lens" aria-hidden="true">
            <div className="rb-lens-glass">
              <div ref={lensInnerRef} className="rb-lens-inner">
                {strings}
                {cards(true)}
              </div>
            </div>
            <span className="rb-lens-handle" />
          </div>
        </div>
      </div>
    </section>
  );
}
