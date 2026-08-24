"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";

interface BreakingNewsItem {
  id: string;
  text: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface BreakingNewsListResponse {
  items: BreakingNewsItem[];
}

const AUTO_REFRESH_MS = 60 * 1000;

/**
 * Public homepage banner for active breaking news. Renders nothing when
 * nothing is active. Fetches on mount and polls every 60s so a newly-set
 * or newly-expired item shows up without a page reload.
 */
export default function BreakingNewsBanner() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [items, setItems] = useState<BreakingNewsItem[]>([]);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/breaking-news", {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as BreakingNewsListResponse;
      setItems(data.items ?? []);
    } catch {
      // Silently keep whatever was last successfully fetched (or nothing) —
      // a failed poll shouldn't flash the banner in and out.
    }
  }, []);

  // Necessary setState-in-effect: breaking news can only come from an
  // async fetch, which can't run synchronously during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchItems();
    const interval = setInterval(fetchItems, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchItems]);

  if (items.length === 0) return null;

  // .animate-marquee (globals.css) moves its track from 0% to -50%, so the
  // content has to be duplicated exactly once for the loop to be seamless
  // — same technique MarqueeTicker.tsx already uses.
  const combinedText = items.map((item) => item.text).join("   •   ");

  return (
    <div
      className={`relative flex h-9 w-full items-center overflow-hidden shadow-md transition-colors duration-200 ${
        isDark ? "bg-red-700" : "bg-red-600"
      }`}
    >
      <div className="z-10 flex h-full shrink-0 animate-pulse items-center gap-1.5 rounded-r-lg bg-black/15 px-3 text-xs font-black uppercase tracking-wider text-white sm:px-4">
        <span className="whitespace-nowrap">🔴 BREAKING</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="animate-marquee flex items-center gap-12 whitespace-nowrap text-xs font-semibold text-white sm:text-sm [transform:translateZ(0)] will-change-transform">
          <span>{combinedText}</span>
          <span aria-hidden="true">{combinedText}</span>
        </div>
      </div>
    </div>
  );
}
