"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Instrument_Serif } from "next/font/google";
import { activeCampaign, promoSeenKey, TEST_CAMPAIGN, type PromoContent } from "../lib/promo";
import "./promoSplash.css";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], display: "swap" });

/**
 * Page promo plein écran, sur téléphone : vraie photo en fond, éléments Bricky
 * qui flottent, grand titre et bouton à glisser.
 * - Sans `content` : affiche la campagne active (lib/promo.ts), une seule fois, sur téléphone.
 * - Avec `content` + `preview` : aperçu permanent (page /promo).
 */
export function PromoSplash({ content, preview = false }: { content?: PromoContent & { id?: string }; preview?: boolean }) {
  const router = useRouter();
  const [promo, setPromo] = useState<(PromoContent & { id?: string }) | null>(preview ? content ?? null : null);
  const [open, setOpen] = useState(preview);
  const [leaving, setLeaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Campagne active : téléphone seulement, une fois par campagne, après un court délai.
  useEffect(() => {
    if (preview) return;
    // Aperçu de test : « Mes biens » ouvert avec ?promo=test (n'importe quel appareil, à chaque fois).
    if (new URLSearchParams(window.location.search).get("promo") === "test") {
      const t = window.setTimeout(() => { setPromo(TEST_CAMPAIGN); setOpen(true); }, 900);
      return () => window.clearTimeout(t);
    }
    const c = content ?? activeCampaign();
    if (!c || !("id" in c) || !c.id) return;
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    try { if (window.localStorage.getItem(promoSeenKey(c.id))) return; } catch { return; }
    const t = window.setTimeout(() => { setPromo(c); setOpen(true); }, 1400);
    return () => window.clearTimeout(t);
  }, [content, preview]);

  const markSeen = useCallback(() => {
    if (preview || !promo?.id || promo.id === TEST_CAMPAIGN.id) return;
    try { window.localStorage.setItem(promoSeenKey(promo.id), new Date().toISOString()); } catch {}
  }, [preview, promo]);

  const close = useCallback(() => {
    markSeen();
    setLeaving(true);
    window.setTimeout(() => { setOpen(false); setLeaving(false); if (preview) router.push("/"); }, 380);
  }, [markSeen, preview, router]);

  const go = useCallback(() => {
    if (!promo) return;
    markSeen();
    setLeaving(true);
    window.setTimeout(() => { if (!preview) setOpen(false); router.push(promo.href); }, 320);
  }, [markSeen, preview, promo, router]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, close]);

  if (!open || !promo) return null;

  return (
    <div className={`ps-root ${preview ? "ps-preview" : ""} ${leaving ? "ps-leaving" : ""}`} role="dialog" aria-modal="true" aria-labelledby="ps-title">
      <div className={`ps-screen ps-${promo.kind}`}>
        <img className="ps-bg" src={`/img/promo/fond-${promo.kind}.webp`} alt="" decoding="async" />
        <div className="ps-shade" aria-hidden="true" />

        <Floaters kind={promo.kind} badge={promo.badge} />

        <div className="ps-top">
          <span className="ps-brand"><img src="/icon-48.png" alt="" width={18} height={18} />Bricky</span>
          <button ref={closeRef} type="button" className="ps-close" onClick={close} aria-label="Fermer">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="ps-copy">
          <span className="ps-eyebrow">{promo.eyebrow}</span>
          <h2 id="ps-title" className={`ps-title ${serif.className}`}>{promo.title}</h2>
          <p className="ps-sub">{promo.subtitle}</p>
          <p className={`ps-text ${serif.className}`}>{promo.text}</p>
          <SwipeButton label={promo.cta} onDone={go} />
          {promo.legal && <a className="ps-legal" href={promo.legal.href}>{promo.legal.label}</a>}
        </div>
      </div>
    </div>
  );
}

/** Éléments Bricky qui flottent devant la photo, comme des objets en apesanteur. */
function Floaters({ kind, badge }: { kind: PromoContent["kind"]; badge?: string }) {
  if (kind === "concours") {
    return (
      <div className="ps-floaters" aria-hidden="true">
        <img className="ps-f ps-mascot ps-mascot-main" src="/mascot-inspector.webp" alt="" />
        <GoldKey className="ps-f ps-key" />
        <GoldKey className="ps-f ps-key ps-key-far" />
        <div className="ps-confetti">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
      </div>
    );
  }
  if (kind === "reduction") {
    return (
      <div className="ps-floaters" aria-hidden="true">
        <img className="ps-f ps-ct ps-ct-1" src="/img/promo/conteneur-studio.webp" alt="" />
        <img className="ps-f ps-ct ps-ct-2" src="/img/promo/conteneur-terrain.webp" alt="" />
        <img className="ps-f ps-ct ps-ct-3" src="/img/promo/conteneur-appartement.webp" alt="" />
        <img className="ps-f ps-ct ps-ct-4" src="/img/promo/conteneur-maison.webp" alt="" />
        {badge && <span className="ps-f ps-badge">{badge}</span>}
      </div>
    );
  }
  return (
    <div className="ps-floaters" aria-hidden="true">
      <img className="ps-f ps-mascot ps-mascot-hello" src="/mascot-inspector.webp" alt="" />
      <img className="ps-f ps-ct ps-ct-far" src="/img/promo/conteneur-maison.webp" alt="" />
    </div>
  );
}

function GoldKey({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 48" aria-hidden="true">
      <defs>
        <linearGradient id="ps-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset=".35" stopColor="#f2c14e" />
          <stop offset=".7" stopColor="#c8891f" />
          <stop offset="1" stopColor="#8a5a12" />
        </linearGradient>
      </defs>
      {/* anneau en forme de maison */}
      <path d="M24 4 L44 20 V44 H4 V20 Z" fill="url(#ps-gold)" stroke="#7a4d0c" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M24 16 L34 24 V36 H14 V24 Z" fill="#000" fillOpacity=".55" />
      {/* tige et dents */}
      <rect x="43" y="22" width="70" height="8" rx="3" fill="url(#ps-gold)" stroke="#7a4d0c" strokeWidth="1.2" />
      <path d="M92 30 h7 v10 h-7z M104 30 h6 v7 h-6z" fill="url(#ps-gold)" stroke="#7a4d0c" strokeWidth="1.2" />
    </svg>
  );
}

/** Bouton « glisser pour… » : on fait glisser la pastille jusqu'au bout (un appui suffit aussi). */
function SwipeButton({ label, onDone }: { label: string; onDone: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; max: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);

  function onDown(e: ReactPointerEvent<HTMLButtonElement>) {
    const track = trackRef.current;
    if (!track || done) return;
    const knob = e.currentTarget.getBoundingClientRect();
    start.current = { x: e.clientX, max: track.clientWidth - knob.width - 12 };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    setDx(Math.max(0, Math.min(start.current.max, e.clientX - start.current.x)));
  }
  function onUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s) return;
    const moved = Math.abs(e.clientX - s.x);
    if (dx > s.max * 0.72 || moved < 6) { setDx(s.max); setDone(true); onDone(); }
    else setDx(0);
  }

  const progress = trackRef.current ? dx / Math.max(1, trackRef.current.clientWidth - 70) : 0;
  return (
    <div className={"ps-swipe" + (done ? " is-done" : "")} ref={trackRef}>
      <span className="ps-swipe-label" style={{ opacity: Math.max(0, 1 - progress * 1.4) }}>
        {label}
        <svg viewBox="0 0 24 12" width="22" height="11" aria-hidden="true"><path d="M2 1l5 5-5 5M10 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <button
        type="button"
        className="ps-knob"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform .35s cubic-bezier(.2,.8,.2,1)" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { start.current = null; setDragging(false); setDx(0); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDone(true); onDone(); } }}
        aria-label={label}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}
