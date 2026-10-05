"use client";

import { useEffect, useState } from "react";

const SPLASH_SESSION_KEY = "bricky_splash_shown_v1";
const BRICK_ROWS = 6;

export default function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [cols, setCols] = useState(9);

  useEffect(() => {
    setMounted(true);

    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
    } catch {
      alreadyShown = false;
    }
    if (alreadyShown) return;

    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }

    setCols(window.innerWidth < 480 ? 6 : window.innerWidth < 900 ? 8 : 10);
    setVisible(true);

    let reduceMotion = false;
    try {
      reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduceMotion = false;
    }

    const holdMs = reduceMotion ? 350 : 1700;
    const fadeMs = reduceMotion ? 120 : 420;

    const leaveTimer = setTimeout(() => setLeaving(true), holdMs);
    const hideTimer = setTimeout(() => setVisible(false), holdMs + fadeMs);

    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!mounted || !visible) return null;

  const bricks = Array.from({ length: BRICK_ROWS * cols });

  return (
    <div
      className={`splash-overlay${leaving ? " splash-leaving" : ""}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="splash-bricks" style={{ ["--splash-cols" as string]: cols }}>
        {bricks.map((_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const delay = (row * cols + col) * 16;
          return (
            <span
              key={i}
              className={`splash-brick${row % 2 === 1 ? " splash-brick-offset" : ""}`}
              style={{ animationDelay: `${delay}ms` }}
            />
          );
        })}
      </div>
      <div className="splash-logo-plate">
        <img src="/bricky-logo.png" alt="Bricky" className="splash-logo" />
      </div>
    </div>
  );
}
