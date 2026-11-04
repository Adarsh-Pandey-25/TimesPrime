"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { THEME_BACKGROUND, THEME_STORAGE_KEY } from "@/backend/shared/config/theme";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  const applyTheme = (targetTheme: Theme) => {
    if (targetTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
      document.documentElement.style.backgroundColor = THEME_BACKGROUND.dark;
      document.body.style.backgroundColor = THEME_BACKGROUND.dark;
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
      document.documentElement.style.backgroundColor = THEME_BACKGROUND.light;
      document.body.style.backgroundColor = THEME_BACKGROUND.light;
    }
  };

  // Necessary hydration guard: localStorage doesn't exist during SSR, so the
  // real theme can only be read after mount. Deferring to an effect (rather
  // than reading synchronously during render) is what avoids a hydration
  // mismatch here — there's no alternative that preserves current behavior.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const savedTheme = (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || "light";
    setTheme(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme: mounted ? theme : "light", toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
