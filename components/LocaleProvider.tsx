"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Locale, translate } from "../lib/i18n/translations";

const STORAGE_KEY = "bricky_locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "fr",
  setLocale: () => {},
  t: (key: string) => key,
});

function isValidLocale(value: string | null): value is Locale {
  return value === "fr" || value === "en" || value === "zh";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isValidLocale(stored)) {
        setLocaleState(stored);
        document.documentElement.setAttribute("lang", stored === "zh" ? "zh-CN" : stored);
      }
    } catch {
      // stockage indisponible (navigation privée, etc.) — on reste en français
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // stockage indisponible — le choix ne persistera pas entre les visites
    }
    try {
      document.documentElement.setAttribute("lang", next === "zh" ? "zh-CN" : next);
    } catch {
      // no-op côté serveur
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
