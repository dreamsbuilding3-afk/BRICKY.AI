"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES } from "../lib/i18n/translations";
import { useLocale } from "./LocaleProvider";

export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="lang-toggle-wrap" ref={wrapRef}>
      <button
        type="button"
        className="lang-toggle lang-toggle-floating"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("lang.selectAria")}
        title={t("lang.selectAria")}
      >
        <svg className="lang-toggle-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.4 2.6 3.6 5.7 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.7-3.6-9s1.2-6.4 3.6-9z" />
        </svg>
        <span className="lang-toggle-code">{locale.toUpperCase()}</span>
        <svg className="lang-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="lang-toggle-menu" role="listbox">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === locale}
              className={"lang-toggle-option" + (l.code === locale ? " lang-toggle-option-active" : "")}
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
            >
              {l.nativeLabel}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
