import { Article } from "@/types";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";

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

const MOCK_ARTICLES: Article[] = [
  {
    article_id: "mock-1",
    title: "Next.js 15 & React 19 Released: Revolutionizing Modern Web Applications",
    link: "https://nextjs.org",
    description: "The team behind Next.js announces major upgrades including improved server actions, faster bundler speeds, and enhanced dynamic caching.",
    content: "Full article content covering Next.js innovations.",
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
    description: "Stock indexes worldwide hit record highs after key quarterly financial reports show unprecedented growth.",
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
    description: "Researchers announce a pivotal step toward clean, practically limitless power generation.",
    content: "Deep dive into fusion energy physics.",
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
    description: "In an unbelievable comeback victory, the home team snatched the trophy with seconds left.",
    content: "Sports commentary and highlights.",
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
    description: "A newly clinical-tested AI model provides doctors with unprecedented accuracy.",
    content: "Medical advancements and case studies.",
    pubDate: new Date(Date.now() - 14400000).toISOString(),
    image_url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&auto=format&fit=crop",
    source_id: "health-journal",
    source_name: "Health & Care",
    category: ["health"],
    country: ["us"],
    language: "english",
  },
];

/**
 * Server-side news fetching function.
 * Called directly on the server — no client-side fetch needed.
 * Works reliably via ngrok, Vercel, or any deployment.
 */
export async function fetchInitialNews(
  category: string = "general",
  language: string = "en",
  query: string = ""
): Promise<Article[]> {
  try {
    const apiKey =
      process.env.NEWSDATA_API_KEY ||
      "pub_ac92279704bc46d5a24d552edbd6b6fb";

    const categoryParam = category;
    const mappedCategory = CATEGORY_MAP[categoryParam.toLowerCase()] || categoryParam;

    if (!apiKey) {
      return MOCK_ARTICLES;
    }

    const targetUrl = new URL("https://newsdata.io/api/1/latest");
    targetUrl.searchParams.set("apikey", apiKey);

    if (language === "hi") {
      targetUrl.searchParams.set("country", "in");
      targetUrl.searchParams.set("language", "hi");
    } else {
      targetUrl.searchParams.set("country", "us");
      targetUrl.searchParams.set("language", "en");
    }

    if (query.trim()) {
      targetUrl.searchParams.set("q", query.trim());
    } else if (categoryParam === "india") {
      targetUrl.searchParams.set("country", "in");
      targetUrl.searchParams.set("category", "top");
    } else if (categoryParam === "world") {
      targetUrl.searchParams.set("category", "world");
    } else if (mappedCategory) {
      targetUrl.searchParams.set("category", mappedCategory);
    }

    const apiRes = await fetch(targetUrl.toString(), {
      next: { revalidate: 900 },
    });

    if (!apiRes.ok) {
      console.error(`NewsData API error: status ${apiRes.status}`);
      return MOCK_ARTICLES;
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
      category: art.category || [mappedCategory],
      country: art.country || ["us"],
      language: art.language || language,
    }));

    // Filter by language script
    const hasHindi = (s?: string) => s && /[\u0900-\u097F]/.test(s);
    const filtered = fetchedArticles.filter((art) => {
      if (language === "hi") return hasHindi(art.title);
      return !hasHindi(art.title);
    });

    // Deduplicate
    const seen = new Set<string>();
    const deduped = (filtered.length > 0 ? filtered : fetchedArticles).filter((art) => {
      const key = art.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.length > 0 ? deduped : MOCK_ARTICLES;
  } catch (error) {
    console.error("Server-side news fetch error:", error);
    return MOCK_ARTICLES;
  }
}
