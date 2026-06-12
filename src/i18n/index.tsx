import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ru } from "./ru";
import { en } from "./en";

export type Lang = "ru" | "en";

const DICTS: Record<Lang, Record<string, string>> = { ru, en };

const STORAGE_KEY = "abuze.lang";

function detectInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "ru" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  // Default per product decision: Russian.
  return "ru";
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a dotted key. Supports `{name}` style placeholders. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const dict = DICTS[lang];
    let str = dict[key];
    if (str === undefined) {
      // Fall back to the other language, then to the key itself.
      str = DICTS[lang === "ru" ? "en" : "ru"][key] ?? key;
    }
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
