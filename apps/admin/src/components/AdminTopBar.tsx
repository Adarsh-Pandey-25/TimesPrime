"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@timesprime/ui/ThemeContext";

// The back office's own masthead. The reader site's header and ticker fetch the public feed,
// which this app does not serve.
export default function AdminTopBar() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header className="border-b border-slate-200 bg-white dark:border-[#2b2f36] dark:bg-[#202327]">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-4 py-3 sm:px-8 lg:px-10">
        <span className="font-serif text-lg font-extrabold text-slate-900 dark:text-white">
          TimesPrime <span className="text-blue-600 dark:text-blue-400">Admin</span>
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to the light theme" : "Switch to the dark theme"}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#2b2f36]"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
