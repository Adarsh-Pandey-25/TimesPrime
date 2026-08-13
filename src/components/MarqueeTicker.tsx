"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Article } from "@/types";
import { Zap } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";

interface MarqueeTickerProps {
  articles: Article[];
}

export default function MarqueeTicker({ articles }: MarqueeTickerProps) {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const isDark = theme === "dark";

  const [tickerNews, setTickerNews] = useState<Article[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchTickerNews = async () => {
      try {
        const [indiaRes, worldRes] = await Promise.all([
          fetch(`/api/news/top-headlines?category=india&language=${language}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
          }),
          fetch(`/api/news/top-headlines?category=world&language=${language}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
          }),
        ]);

        let indiaArticles: Article[] = [];
        let worldArticles: Article[] = [];

        if (indiaRes.ok) {
          const indiaData = await indiaRes.json();
          indiaArticles = indiaData.results || [];
        }

        if (worldRes.ok) {
          const worldData = await worldRes.json();
          worldArticles = worldData.results || [];
        }

        // Interleave India and World news for combined stream
        const combined: Article[] = [];
        const maxLen = Math.max(indiaArticles.length, worldArticles.length);
        const seen = new Set<string>();

        for (let i = 0; i < maxLen; i++) {
          if (i < indiaArticles.length) {
            const art = indiaArticles[i];
            const key = art.title.trim().toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              combined.push(art);
            }
          }
          if (i < worldArticles.length) {
            const art = worldArticles[i];
            const key = art.title.trim().toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              combined.push(art);
            }
          }
          if (combined.length >= 10) break;
        }

        if (isMounted && combined.length > 0) {
          setTickerNews(combined);
        }
      } catch {
        // Fallback
      }
    };

    fetchTickerNews();

    return () => {
      isMounted = false;
    };
  }, [language]);

  // Fallback to incoming articles prop if tickerNews is empty
  const displayArticles: Article[] = tickerNews.length > 0 ? tickerNews : articles;

  if (!displayArticles || displayArticles.length === 0) return null;

  // Deduplicate articles by title
  const seen = new Set<string>();
  const uniqueArticles: Article[] = [];
  for (const art of displayArticles) {
    const key = art.title.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueArticles.push(art);
    }
  }

  if (uniqueArticles.length < 2) return null;

  // Duplicate for seamless infinite horizontal scroll
  const marqueeItems = [...uniqueArticles, ...uniqueArticles];

  return (
    <div
      className={`relative h-8 flex items-center overflow-hidden border-y shadow-2xs transition-colors duration-200 ${
        isDark
          ? "border-[#2b2f36] bg-[#141619] text-slate-100"
          : "border-[#1e2329] bg-[#0f1115] text-slate-100"
      }`}
    >
      {/* Fixed Breaking News Red Label with Curved Border Radius & Glow */}
      <div className="z-10 flex shrink-0 h-full items-center space-x-1.5 sm:space-x-2 bg-gradient-to-r from-red-600 to-rose-700 rounded-r-xl px-2.5 sm:px-4 text-xs font-black uppercase tracking-wider sm:tracking-widest text-white shadow-md shadow-red-600/25 border-r border-red-500/40">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
        </span>
        <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300 shrink-0" />
        <span className="whitespace-nowrap">
          {language === "hi" ? "ब्रेकिंग न्यूज़" : "BREAKING NEWS"}
        </span>
      </div>

      {/* Marquee Ticker Track */}
      <div className="flex flex-1 overflow-hidden">
        <div className="animate-marquee space-x-12 flex items-center [transform:translateZ(0)] will-change-transform">
          {marqueeItems.map((article, idx) => {
            const slug = encodeURIComponent(article.article_id || article.title.slice(0, 30));
            const itemImg = article.image_url || "";

            return (
              <Link
                key={`${article.article_id}-${idx}`}
                href={`/article/${slug}?url=${encodeURIComponent(article.link)}${itemImg ? `&image=${encodeURIComponent(itemImg)}` : ""}`}
                className="inline-flex items-center space-x-3 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap text-slate-200 hover:text-red-400"
              >
                <span className="h-2 w-2 rounded-full bg-red-600 shrink-0" />
                <span>{article.title}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
