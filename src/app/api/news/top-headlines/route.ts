import { NextRequest, NextResponse } from "next/server";
import { memoryCache } from "@/lib/cache";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";
import { Article } from "@/types";
import { saveArticlesToDB, getDBArticles } from "@/lib/db";

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in ms

const CATEGORY_MAP: Record<string, string> = {
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

// Fallback articles for smooth demo if API key isn't provided or fails
const MOCK_ARTICLES: Article[] = [
  {
    article_id: "mock-1",
    title: "Next.js 15 & React 19 Released: Revolutionizing Modern Web Applications",
    link: "https://nextjs.org",
    description: "The team behind Next.js announces major upgrades including improved server actions, faster bundler speeds, and enhanced dynamic caching.",
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
    description: "Stock indexes worldwide hit record highs after key quarterly financial reports show unprecedented growth across cloud computing and semiconductor industries.",
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
    description: "Researchers at the international physics laboratory announce a pivotal step toward clean, practically limitless power generation.",
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country") || "us";
    const categoryParam = searchParams.get("category") || "general";
    const language = searchParams.get("language") || "en";
    const query = searchParams.get("q") || searchParams.get("query") || "";
    const page = searchParams.get("page") || "";

    const category = CATEGORY_MAP[categoryParam.toLowerCase()] || categoryParam;

    const refresh = searchParams.get("refresh") === "true";
    const cacheKey = `news_${country}_${category}_${language}_${query.trim().toLowerCase()}_${page}`;
    const cachedData = refresh ? null : memoryCache.get(cacheKey, CACHE_TTL);

    if (cachedData) {
      return NextResponse.json({ ...cachedData, cached: true });
    }

    // Server-Side Isolated API Key (Never sent to client)
    const apiKey =
      process.env.NEWSDATA_API_KEY ||
      "pub_ac92279704bc46d5a24d552edbd6b6fb";

    if (!apiKey) {
      let filteredMocks = MOCK_ARTICLES;
      if (query.trim()) {
        const qLower = query.trim().toLowerCase();
        filteredMocks = MOCK_ARTICLES.filter(
          (art) =>
            art.title.toLowerCase().includes(qLower) ||
            (art.description && art.description.toLowerCase().includes(qLower))
        );
      } else if (category && category !== "top") {
        filteredMocks = MOCK_ARTICLES.filter((art) => art.category?.includes(category));
      }
      const mockResult = {
        status: "success",
        totalResults: filteredMocks.length,
        results: filteredMocks.length > 0 ? filteredMocks : MOCK_ARTICLES,
        nextPage: undefined,
        note: "Using mock data (NEWSDATA_API_KEY not configured)",
      };

      memoryCache.set(cacheKey, mockResult);
      return NextResponse.json(mockResult);
    }

    // Call NewsData.io API
    const targetUrl = new URL("https://newsdata.io/api/1/latest");
    targetUrl.searchParams.set("apikey", apiKey);
    if (language === "hi") {
      targetUrl.searchParams.set("country", "in");
      targetUrl.searchParams.set("language", "hi");
    } else {
      if (country) targetUrl.searchParams.set("country", country);
      targetUrl.searchParams.set("language", "en");
    }

    if (query.trim()) {
      targetUrl.searchParams.set("q", query.trim());
    } else if (categoryParam === "india") {
      targetUrl.searchParams.set("country", "in");
      targetUrl.searchParams.set("category", "top");
    } else if (categoryParam === "world") {
      targetUrl.searchParams.set("category", "world");
    } else if (category) {
      targetUrl.searchParams.set("category", category);
    }
    if (page) targetUrl.searchParams.set("page", page);

    const apiRes = await fetch(targetUrl.toString(), {
      next: { revalidate: 900 }, // 15 mins Next.js revalidation
    });

    if (!apiRes.ok) {
      throw new Error(`NewsData API error: status ${apiRes.status}`);
    }

    const data = await apiRes.json();

    const fetchedArticles: Article[] = (data.results || []).map((art: any) => ({
      article_id: art.article_id || art.link,
      title: paraphraseTitle(art.title || "Untitled Article"),
      link: art.link || "#",
      description: paraphraseText(art.description || ""),
      content: art.content || "",
      pubDate: art.pubDate || new Date().toISOString(),
      image_url: art.image_url || art.source_icon || null,
      source_id: art.source_id || "",
      source_name: art.source_name || art.source_id || "News Source",
      category: art.category || [category],
      country: art.country || [country],
      language: art.language || language,
    }));

    // Script-level filter: ensure fetched articles match the requested language
    const hasHindi = (s?: string) => s && /[\u0900-\u097F]/.test(s);
    const cleanFetched = fetchedArticles.filter((art) => {
      if (language === "hi") return hasHindi(art.title);
      return !hasHindi(art.title);
    });

    // 1. Save and Auto-Purge Supabase Database (Keep only 7 days of news)
    await saveArticlesToDB(fetchedArticles);

    // 2. Query accumulated valid articles from Supabase DB
    const dbArticles = await getDBArticles(categoryParam, query.trim(), language);

    // Use DB articles if available, otherwise use clean fetched articles
    let rawFinal = dbArticles.length > 0 ? dbArticles : (cleanFetched.length > 0 ? cleanFetched : fetchedArticles);

    // If a search query is set, perform smart keyword matching over results
    if (query.trim()) {
      const terms = query.trim().toLowerCase().split(/\s+/);
      const queryMatches = rawFinal.filter((art) => {
        const t = art.title.toLowerCase();
        const d = (art.description || "").toLowerCase();
        const c = (art.content || "").toLowerCase();
        return terms.some((term) => t.includes(term) || d.includes(term) || c.includes(term));
      });
      if (queryMatches.length > 0) {
        rawFinal = queryMatches;
      }
    }

    // Deduplicate articles by title to prevent repeated headlines
    const seenTitles = new Set<string>();
    const finalArticles = rawFinal.filter((art) => {
      const key = art.title.trim().toLowerCase();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });

    const formattedData = {
      status: data.status || "success",
      totalResults: finalArticles.length,
      results: finalArticles,
      nextPage: data.nextPage,
      retentionPolicy: "Supabase Realtime: Articles auto-purged after 7 days",
    };

    memoryCache.set(cacheKey, formattedData);
    return NextResponse.json(formattedData);
  } catch (error: any) {
    console.error("Top headlines API error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error.message || "Failed to fetch top headlines",
        results: MOCK_ARTICLES,
      },
      { status: 500 }
    );
  }
}
