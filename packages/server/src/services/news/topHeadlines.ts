import "server-only";

import { after } from "next/server";
import { cache, CACHE_TTL_NEWS_SECONDS } from "../../lib/cache";
import { reportSupabaseFallback } from "../health/health";
import { Article } from "@timesprime/shared/types";
import { getDBArticles } from "../../repositories/db";
import { mapCategory, dedupeArticlesByTitle } from "@timesprime/shared/config/newsConfig";

/** Which tier answered; the route sends it as the X-Data-Source header. */
export type TopHeadlinesSource = "cache" | "supabase";

export interface TopHeadlinesResult {
  body: Record<string, unknown> & { results?: Article[] };
  source: TopHeadlinesSource;
  status: number;
}

/**
 * The feed read path (R1-12, approved by the owner's senior on 16 Nov 2026): the cache, then the
 * database. Readers never call NewsData.io and never write the articles table: the worker's
 * refresh-news job does both, for English and Hindi, on its schedule. A search is the database's
 * 7-day search (getDBArticles). However old the newest row is, the database answers: a stale feed
 * beats an empty one, and the worker's alarm, not the reader, is what notices a stopped refresh.
 *
 * Called by GET /api/news/top-headlines, the home page's server render and the article page.
 */
export async function getTopHeadlines(searchParams: URLSearchParams): Promise<TopHeadlinesResult> {
  try {
    const category = mapCategory(searchParams.get("category") || "general");
    const language = searchParams.get("language") || "en";
    const query = (searchParams.get("q") || searchParams.get("query") || "").trim();

    // `refresh=true` means "not the cached payload": the New Stories banner's rows are already in
    // the database, so it reads them there.
    const refresh = searchParams.get("refresh") === "true";
    const cacheKey = `news_${category}_${language}_${query.toLowerCase()}`;
    const cachedData = refresh ? null : await cache.get<Record<string, unknown>>(cacheKey);
    if (cachedData) {
      return { body: { ...cachedData, cached: true }, source: "cache", status: 200 };
    }

    const results = dedupeArticlesByTitle(await getDBArticles(category, query, language));
    const body = {
      status: "success",
      totalResults: results.length,
      results,
      retentionPolicy: "Supabase Realtime: Articles auto-purged after 7 days",
    };

    if (results.length === 0) {
      // An empty answer is not cached, so the feed fills as soon as the worker writes. If it is
      // empty because Supabase is down, say so after the response (owner decision D5;
      // reportSupabaseFallback reports only when the health check finds Supabase down).
      after(() => reportSupabaseFallback({ category, language }));
      return { body, source: "supabase", status: 200 };
    }

    await cache.set(cacheKey, body, CACHE_TTL_NEWS_SECONDS);
    return { body, source: "supabase", status: 200 };
  } catch (error: unknown) {
    console.error("Top headlines API error:", error);
    return {
      body: {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to fetch top headlines",
        results: [],
      },
      source: "supabase",
      status: 500,
    };
  }
}
