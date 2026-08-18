/**
 * Shared constants/utilities for the news-fetching pipeline.
 * Previously duplicated between lib/fetchNews.ts (server-side initial fetch)
 * and app/api/news/top-headlines/route.ts (client-side refetch endpoint).
 */

import { Article } from "@/types";

export const CATEGORY_MAP: Record<string, string> = {
  general: "top",
  tech: "technology",
  technology: "technology",
  business: "business",
  entertainment: "entertainment",
  sports: "sports",
  science: "science",
  health: "health",
  politics: "politics",
  world: "world",
};

/** Maps a friendly category id (e.g. "tech") to NewsData.io's category taxonomy. */
export function mapCategory(category: string): string {
  return CATEGORY_MAP[category.toLowerCase()] || category;
}

/** Fallback articles shown when NEWSDATA_API_KEY isn't configured or the upstream call fails. */
export const MOCK_ARTICLES: Article[] = [
  {
    article_id: "mock-1",
    title: "Next.js 15 & React 19 Released: Revolutionizing Modern Web Applications",
    link: "https://nextjs.org",
    description:
      "The team behind Next.js announces major upgrades including improved server actions, faster bundler speeds, and enhanced dynamic caching.",
    content: "Full article content covering Next.js innovations and how developers can utilize server components effectively.",
    pubDate: new Date().toISOString(),
    image_url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&auto=format&fit=crop",
    source_id: "tech-crunch",
    source_name: "Tech News Daily",
    category: ["technology"],
    country: ["us"],
    language: "english",
  },
  {
    article_id: "mock-2",
    title: "Global Markets Surge Following Tech Sector Earnings Breakthrough",
    link: "https://bloomberg.com",
    description:
      "Stock indexes worldwide hit record highs after key quarterly financial reports show unprecedented growth across cloud computing and semiconductor industries.",
    content: "Detailed market breakdown and economic analysis.",
    pubDate: new Date(Date.now() - 3600000).toISOString(),
    image_url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop",
    source_id: "financial-times",
    source_name: "Global Financial Digest",
    category: ["business"],
    country: ["us"],
    language: "english",
  },
  {
    article_id: "mock-3",
    title: "Breakthrough in Fusion Energy: Scientists Achieve Net Energy Gain Milestone",
    link: "https://nature.com",
    description:
      "Researchers at the international physics laboratory announce a pivotal step toward clean, practically limitless power generation.",
    content: "Deep dive into fusion energy physics and global climate implications.",
    pubDate: new Date(Date.now() - 7200000).toISOString(),
    image_url: "https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=1200&auto=format&fit=crop",
    source_id: "science-mag",
    source_name: "Science Horizon",
    category: ["science"],
    country: ["us"],
    language: "english",
  },
  {
    article_id: "mock-4",
    title: "Championship Finals: Underdog Team Secures Victory in Thrilling Overtime",
    link: "https://espn.com",
    description: "In an unbelievable comeback victory, the home team snatched the trophy with seconds left on the clock.",
    content: "Sports commentary and game highlights.",
    pubDate: new Date(Date.now() - 10800000).toISOString(),
    image_url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&auto=format&fit=crop",
    source_id: "sports-weekly",
    source_name: "Sports Central",
    category: ["sports"],
    country: ["us"],
    language: "english",
  },
  {
    article_id: "mock-5",
    title: "Artificial Intelligence in Healthcare: New Diagnostic Tool Detects Early Onset Conditions",
    link: "https://healthline.com",
    description: "A newly clinical-tested AI model provides doctors with unprecedented accuracy in early disease detection.",
    content: "Medical technological advancements and patient case studies.",
    pubDate: new Date(Date.now() - 14400000).toISOString(),
    image_url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&auto=format&fit=crop",
    source_id: "health-journal",
    source_name: "Health & Care",
    category: ["health"],
    country: ["us"],
    language: "english",
  },
];

/** Detects Devanagari (Hindi) script in text. */
export function containsHindiScript(text?: string | null): boolean {
  return !!text && /[\u0900-\u097F]/.test(text);
}

/** Keeps only articles whose title script matches the requested language ("hi" = Devanagari, else Latin). */
export function filterArticlesByLanguageScript(articles: Article[], language: string): Article[] {
  return articles.filter((art) => {
    const isHindi = containsHindiScript(art.title);
    return language === "hi" ? isHindi : !isHindi;
  });
}

/** Deduplicates articles by normalized (trimmed, lowercased) title. */
export function dedupeArticlesByTitle(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter((art) => {
    const key = art.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
