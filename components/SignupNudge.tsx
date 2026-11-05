"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import { useLocale } from "./LocaleProvider";
import "./signupNudge.css";

const SEEN_KEY = "bricky_rappel_inscription";

// Rappel d'inscription sur l'accueil : le visiteur découvre d'abord l'interface,
// puis une carte discrète l'invite à créer son compte (à mi-page ou après 30 s).
// Une fois par visite, jamais pour un utilisateur déjà connecté.
export function SignupNudge() {
  const { t } = useLocale();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try { if (window.sessionStorage.getItem(SEEN_KEY)) return; } catch {}
    let cancelled = false;
    let timer = 0;
    const trigger = () => {
      if (cancelled) return;
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) return;
        try { window.sessionStorage.setItem(SEEN_KEY, "1"); } catch {}
        setShow(true);
      });
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max > 0.42) trigger();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    timer = window.setTimeout(trigger, 30000);
    return () => { cancelled = true; window.removeEventListener("scroll", onScroll); window.clearTimeout(timer); };
  }, []);

  function dismiss() {
    setLeaving(true);
    window.setTimeout(() => setShow(false), 300);
  }

  if (!show) return null;
  return (
    <aside className={"sn" + (leaving ? " sn-leaving" : "")} role="dialog" aria-labelledby="sn-title">
      <button type="button" className="sn-x" onClick={dismiss} aria-label={t("nudge.later")}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      <img className="sn-mascot" src="/mascot-icon.png" alt="" width={56} height={56} />
      <div className="sn-body">
        <strong id="sn-title">{t("nudge.title")}</strong>
        <p>{t("nudge.sub")}</p>
        <div className="sn-actions">
          <a className="sn-cta" href="/login?mode=signup">{t("nudge.cta")}</a>
          <a className="sn-login" href="/login">{t("nudge.login")}</a>
        </div>
      </div>
    </aside>
  );
}
