"use client";

import { Sparkles, Newspaper } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface ThemeSpinnerProps {
  message?: string;
  subMessage?: string;
  fullPage?: boolean;
}

export default function ThemeSpinner({
  message = "Fetching live global headlines...",
  subMessage = "Synthesizing verified stories & real-time updates",
  fullPage = false,
}: ThemeSpinnerProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const content = (
    <div className="flex flex-col items-center justify-center space-y-6 text-center py-16 animate-in fade-in zoom-in duration-300">
      {/* Outer Pulse & Dual Ring Radar Spinner */}
      <div className="relative flex items-center justify-center h-20 w-20">
        {/* Glowing Ambient Halo */}
        <div
          className={`absolute inset-0 rounded-full animate-ping opacity-25 ${
            isDark ? "bg-red-600" : "bg-red-500"
          }`}
        />

        {/* Outer Rotating Gradient Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-red-600 border-r-orange-500 animate-spin" />

        {/* Inner Counter-Rotating Ring */}
        <div
          className={`absolute inset-2 rounded-full border-4 border-transparent ${
            isDark
              ? "border-b-red-400 border-l-slate-600"
              : "border-b-red-500 border-l-slate-300"
          } animate-spin [animation-duration:1.5s] [animation-direction:reverse]`}
        />

        {/* Central Logo Core */}
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg ${
            isDark
              ? "bg-slate-900 border border-slate-700 text-red-500"
              : "bg-white border border-slate-200 text-red-600"
          }`}
        >
          <Newspaper className="h-5 w-5 animate-pulse" />
        </div>
      </div>

      {/* Loading Message & Micro-Text */}
      <div className="space-y-1.5 max-w-sm">
        <div className="flex items-center justify-center space-x-2 text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400">
          <Sparkles className="h-3.5 w-3.5 animate-spin" />
          <span>TimesPrime Live Feed</span>
        </div>
        <h3
          className={`font-serif text-base font-bold ${
            isDark ? "text-white" : "text-slate-900"
          }`}
        >
          {message}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {subMessage}
        </p>
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div
        className={`min-h-[70vh] flex items-center justify-center w-full transition-colors duration-200 ${
          isDark ? "bg-[#1a1c1e]" : "bg-slate-50"
        }`}
      >
        {content}
      </div>
    );
  }

  return content;
}
