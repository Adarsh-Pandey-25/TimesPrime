import { NextRequest, NextResponse } from "next/server";
import { cache, CACHE_TTL_NEWS_SECONDS } from "@/lib/cache";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";
import { Article } from "@/types";
import {
  saveArticlesToDB,
  getDBArticles,
  getLatestArticleTimestamp,
  NEWS_FRESHNESS_WINDOW_MS,
} from "@/lib/db";
import {
  mapCategory,
  MOCK_ARTICLES,
  filterArticlesByLanguageScript,
  dedupeArticlesByTitle,
} from "@/lib/newsConfig";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country") || "us";
    const categoryParam = searchParams.get("category") || "general";
    const language = searchParams.get("language") || "en";
    const query = searchParams.get("q") || searchParams.get("query") || "";
    const page = searchParams.get("page") || "";

    const category = mapCategory(categoryParam);

    const refresh = searchParams.get("refresh") === "true";
    const cacheKey = `news_${country}_${category}_${language}_${query.trim().toLowerCase()}_${page}`;
    const cachedData = refresh ? null : await cache.get<Record<string, unknown>>(cacheKey);

    if (cachedData) {
      // Neither "supabase" nor "newsdata" would be truthful here — this
      // response never touched either on this request.
      return NextResponse.json(
        { ...cachedData, cached: true },
        { headers: { "X-Data-Source": "cache" } }
      );
    }

    // ---- Supabase-first fast path -------------------------------------
    // If the DB already holds recent articles for this category, serve them
    // and skip NewsData.io entirely. Deliberately restricted to plain feed
    // reads: search and pagination still go upstream, because the DB only
    // holds a rolling window and would silently return worse results.
    //
    // `refresh=true` deliberately does NOT skip this path — it means "don't
    // serve me the cached payload", not "call NewsData.io". The New Stories
    // banner relies on that: the rows it is telling the user about are
    // already in Supabase, so re-reading the DB is both correct and free.
    // A genuinely stale DB still falls through to NewsData.io below.
    const canServeFromDB = !query.trim() && !page;

    if (canServeFromDB) {
      const latestTimestamp = await getLatestArticleTimestamp(category, language);
      const ageMs = latestTimestamp
        ? Date.now() - new Date(latestTimestamp).getTime()
        : Number.POSITIVE_INFINITY;

      if (latestTimestamp && ageMs < NEWS_FRESHNESS_WINDOW_MS) {
        const dbArticles = await getDBArticles(category, "", language);

        if (dbArticles.length > 0) {
          const freshData = {
            status: "success",
            totalResults: dbArticles.length,
            results: dedupeArticlesByTitle(dbArticles),
            nextPage: undefined,
            retentionPolicy: "Supabase Realtime: Articles auto-purged after 7 days",
          };
          freshData.totalResults = freshData.results.length;

          await cache.set(cacheKey, freshData, CACHE_TTL_NEWS_SECONDS);
          return NextResponse.json(freshData, {
            headers: { "X-Data-Source": "supabase" },
          });
        }
      }
    }

    // Server-Side Isolated API Key (Never sent to client)
    const apiKey = process.env.NEWSDATA_API_KEY;

    if (!apiKey) {
      console.error(
        "NEWSDATA_API_KEY is not set — falling back to mock articles. Add it to .env.local."
      );
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

      await cache.set(cacheKey, mockResult, CACHE_TTL_NEWS_SECONDS);
      return NextResponse.json(mockResult, {
        headers: { "X-Data-Source": "mock" },
      });
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
    const cleanFetched = filterArticlesByLanguageScript(fetchedArticles, language);

    // 1. Save and Auto-Purge Supabase Database (Keep only 7 days of news)
    await saveArticlesToDB(fetchedArticles);

    // 2. Query accumulated valid articles from Supabase DB. Use the mapped
    // `category` (e.g. "technology"), not the raw `categoryParam` alias
    // (e.g. "tech") — DB rows are stored with NewsData's own category
    // tags, which use the mapped taxonomy, so passing the unmapped alias
    // here would silently match zero rows for any aliased category.
    const dbArticles = await getDBArticles(category, query.trim(), language);

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
    const finalArticles = dedupeArticlesByTitle(rawFinal);

    const formattedData = {
      status: data.status || "success",
      totalResults: finalArticles.length,
      results: finalArticles,
      nextPage: data.nextPage,
      retentionPolicy: "Supabase Realtime: Articles auto-purged after 7 days",
    };

    await cache.set(cacheKey, formattedData, CACHE_TTL_NEWS_SECONDS);
    return NextResponse.json(formattedData, {
      headers: { "X-Data-Source": "newsdata" },
    });
  } catch (error: any) {
    console.error("Top headlines API error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error.message || "Failed to fetch top headlines",
        results: MOCK_ARTICLES,
      },
      { status: 500, headers: { "X-Data-Source": "mock" } }
    );
  }
}
