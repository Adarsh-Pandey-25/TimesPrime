import "server-only";

import { after } from "next/server";
import { cache, CACHE_TTL_NEWS_SECONDS } from "@/server/lib/cache";
import { reportSupabaseFallback } from "@/server/services/health/health";
import { Article, NewsDataRawArticle } from "@/types";
import {
  saveArticlesToDB,
  getDBArticles,
  getLatestArticleTimestamp,
  NEWS_FRESHNESS_WINDOW_MS,
} from "@/server/repositories/db";
import {
  mapCategory,
  MOCK_ARTICLES,
  filterArticlesByLanguageScript,
  dedupeArticlesByTitle,
  isHoroscopeOrRitualFiller,
  isFromWireSpamSource,
  isFromNonNewsListingSource,
} from "@/config/newsConfig";

/** Which tier answered; the route sends it as the X-Data-Source header. */
export type TopHeadlinesSource = "cache" | "supabase" | "newsdata" | "mock";

export interface TopHeadlinesResult {
  body: Record<string, unknown> & { results?: Article[] };
  source: TopHeadlinesSource;
  status: number;
}

/**
 * The feed read path: the cache, then Supabase if its newest row is fresh,
 * then NewsData.io, then the built-in mock articles. Called by
 * GET /api/news/top-headlines and directly by server pages (no HTTP hop).
 */
export async function getTopHeadlines(searchParams: URLSearchParams): Promise<TopHeadlinesResult> {
  try {
    const country = searchParams.get("country") || "us";
    const categoryParam = searchParams.get("category") || "general";
    const language = searchParams.get("language") || "en";
    const query = searchParams.get("q") || searchParams.get("query") || "";
    const page = searchParams.get("page") || "";

    const category = mapCategory(categoryParam);

    // The upstream NewsData.io request's country gets overridden to "in"
    // below whenever language is Hindi or the category is India — but the
    // raw `country` param (default "us") never reflected that override, so
    // any India article NewsData.io returns without its own `country`
    // field fell back to "us" and silently vanished from every India-scoped
    // query (getDBArticles' `country.cs.{"in"}` check never matched it).
    // This mirrors the same country resolution used to build targetUrl below.
    const effectiveCountry = language === "hi" || categoryParam === "india" ? "in" : country;

    const refresh = searchParams.get("refresh") === "true";
    const cacheKey = `news_${country}_${category}_${language}_${query.trim().toLowerCase()}_${page}`;
    const cachedData = refresh ? null : await cache.get<Record<string, unknown>>(cacheKey);

    if (cachedData) {
      // Neither "supabase" nor "newsdata" would be truthful here — this
      // response never touched either on this request.
      return { body: { ...cachedData, cached: true }, source: "cache", status: 200 };
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
          return { body: freshData, source: "supabase", status: 200 };
        }
      }
    }

    // Past this point the answer comes from NewsData.io or the mock set, not
    // the cache or Supabase. If that is because Supabase is down, report it
    // (rate-limited) after the response is sent, so the reader waits for
    // nothing (owner decision D5).
    after(() => reportSupabaseFallback({ category, language }));

    // Server-Side Isolated API Key (Never sent to client)
    const apiKey = process.env.NEWSDATA_API_KEY;

    if (!apiKey) {
      console.error(
        "NEWSDATA_API_KEY is not set — falling back to mock articles. Add it to .env.local."
      );
      // Same additive category+query combination as applyArticleFilters in
      // db.ts — not an if/else, so a category-scoped search still stays
      // scoped even on this no-API-key mock fallback path.
      let filteredMocks = MOCK_ARTICLES;
      if (category && category !== "top") {
        filteredMocks = filteredMocks.filter((art) => art.category?.includes(category));
      }
      if (query.trim()) {
        const qLower = query.trim().toLowerCase();
        filteredMocks = filteredMocks.filter(
          (art) =>
            art.title.toLowerCase().includes(qLower) ||
            (art.description && art.description.toLowerCase().includes(qLower))
        );
      }
      const mockResult = {
        status: "success",
        totalResults: filteredMocks.length,
        results: filteredMocks.length > 0 ? filteredMocks : MOCK_ARTICLES,
        nextPage: undefined,
        note: "Using mock data (NEWSDATA_API_KEY not configured)",
      };

      await cache.set(cacheKey, mockResult, CACHE_TTL_NEWS_SECONDS);
      return { body: mockResult, source: "mock", status: 200 };
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

    // Category/country and the search query are independent NewsData.io
    // params, not alternatives — verified against their docs that q,
    // category, and country all combine in one request (the only
    // documented mutual exclusivity is category/excludecategory, unrelated
    // here). The old if/else chain treated a present query as replacing
    // category scoping entirely, so a category-scoped search silently
    // became a global one.
    if (categoryParam === "india") {
      targetUrl.searchParams.set("country", "in");
      targetUrl.searchParams.set("category", "top");
    } else if (categoryParam === "world") {
      targetUrl.searchParams.set("category", "world");
    } else if (category) {
      targetUrl.searchParams.set("category", category);
    }
    if (query.trim()) {
      targetUrl.searchParams.set("q", query.trim());
    }
    if (page) targetUrl.searchParams.set("page", page);

    const apiRes = await fetch(targetUrl.toString(), {
      next: { revalidate: 900 }, // 15 mins Next.js revalidation
    });

    if (!apiRes.ok) {
      throw new Error(`NewsData API error: status ${apiRes.status}`);
    }

    const data = await apiRes.json();

    const fetchedArticles: Article[] = (data.results || []).map((art: NewsDataRawArticle) => ({
      article_id: art.article_id || art.link,
      title: art.title || "Untitled Article",
      link: art.link || "#",
      description: art.description || "",
      content: art.content || "",
      pubDate: art.pubDate || new Date().toISOString(),
      image_url: art.image_url || art.source_icon || null,
      source_id: art.source_id || "",
      source_name: art.source_name || art.source_id || "News Source",
      category: art.category || [category],
      country: art.country || [effectiveCountry],
      language: art.language || language,
    }));

    // Script-level filter: ensure fetched articles match the requested language
    const scriptFiltered = filterArticlesByLanguageScript(fetchedArticles, language);
    // Horoscope/tarot filler isn't real news, but NewsData.io tags it under
    // real categories (business, world, technology, etc. — verified, not
    // just one) rather than keeping it separate. Confirmed wire-spam
    // accounts get the same treatment — see isFromWireSpamSource.
    const cleanFetched = scriptFiltered.filter(
      (art) =>
        !isHoroscopeOrRitualFiller(art) &&
        !isFromWireSpamSource(art.source_id) &&
        !isFromNonNewsListingSource(art.source_id)
    );

    // 1. Save to Supabase. The 7-day purge runs in the cron route, not here (F-015).
    await saveArticlesToDB(fetchedArticles);

    // 2. Query accumulated valid articles from Supabase DB. Use the mapped
    // `category` (e.g. "technology"), not the raw `categoryParam` alias
    // (e.g. "tech") — DB rows are stored with NewsData's own category
    // tags, which use the mapped taxonomy, so passing the unmapped alias
    // here would silently match zero rows for any aliased category.
    const dbArticles = await getDBArticles(category, query.trim(), language);

    // Use DB articles if available, otherwise the freshly-fetched articles
    // that already passed the language-script filter above. Deliberately
    // does NOT fall back to the raw unfiltered `fetchedArticles` when both
    // are empty — that fallback used to silently reintroduce wrong-language
    // titles (e.g. a Hindi-scripted headline under an English request)
    // whenever NewsData.io's own language tagging was wrong and the script
    // filter correctly zeroed out the result. Showing no results is correct
    // here; showing wrong-language results is not.
    let rawFinal = dbArticles.length > 0 ? dbArticles : cleanFetched;

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
    return { body: formattedData, source: "newsdata", status: 200 };
  } catch (error: unknown) {
    console.error("Top headlines API error:", error);
    return {
      body: {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to fetch top headlines",
        results: MOCK_ARTICLES,
      },
      source: "mock",
      status: 500,
    };
  }
}
