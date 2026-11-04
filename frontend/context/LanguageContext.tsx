"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Language } from "@/backend/shared/config/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  // Necessary hydration guard: localStorage doesn't exist during SSR, so the
  // saved language can only be read after mount, same as ThemeContext.
  useEffect(() => {
    const saved = localStorage.getItem("timesprime_language") as Language;
    if (saved === "en" || saved === "hi") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLanguageState(saved);
    }
  }, []);

  // <html lang> follows the choice: screen readers pick their voice from it, and the Devanagari
  // line heights in globals.css apply under :lang(hi).
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("timesprime_language", lang);
    } catch {
      // Ignore storage error
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "hi" : "en");
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: "en" as Language,
      setLanguage: () => {},
      toggleLanguage: () => {},
    };
  }
  return context;
}
