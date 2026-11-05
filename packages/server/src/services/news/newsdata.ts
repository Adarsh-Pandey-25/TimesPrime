import "server-only";

import { Article } from "@timesprime/shared/types";
import { mapCategory } from "@timesprime/shared/config/newsConfig";

/**
 * Shared NewsData.io fetch + normalize.
 *
 * Unlike packages/server/src/services/news/fetchNews.ts this deliberately does NOT fall back to
 * MOCK_ARTICLES on failure — it throws instead. The background cron writes
 * whatever it gets straight into Supabase, so a silent mock fallback would
 * poison the database with fake articles on every upstream outage.
 */

export interface NewsDataQuery {
  categoryParam?: string;
  language?: string;
  country?: string;
  query?: string;
  page?: string;
}

/** NewsData.io's latest-articles endpoint, which every caller in this repository uses. */
export const NEWSDATA_LATEST_URL = "https://newsdata.io/api/1/latest";

/**
 * The fetch options for a NewsData.io request: `init` plus the API key, in the X-ACCESS-KEY header
 * (R1-02b). NewsData's docs call the header "the recommended secure method"
 * (newsdata.io/documentation/api-authentication). The key used to travel as the `apikey` query
 * parameter, and a URL
 * is kept where a header is not: Next's fetch cache stores the request URL in each entry
 * (`data.url`, next/dist/server/lib/patch-fetch.js), and the reader site's cache handler writes
 * entries to Upstash. Next hashes request headers into the cache key, so the key is not stored even
 * as part of a key. `init` must not carry headers of its own.
 */
export function newsDataInit(apiKey: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { "X-ACCESS-KEY": apiKey } };
}

/** Builds the upstream URL, mirroring the rules used by the news routes. It never holds the key. */
export function buildNewsDataUrl(opts: NewsDataQuery): URL {
  const {
    categoryParam = "general",
    language = "en",
    country = "us",
    query = "",
    page = "",
  } = opts;

  const category = mapCategory(categoryParam);
  const targetUrl = new URL(NEWSDATA_LATEST_URL);

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

  return targetUrl;
}

/** Maps a raw NewsData.io result row onto the app's Article shape. */
export function mapNewsDataArticle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  art: any,
  fallbackCategory: string,
  fallbackCountry: string,
  language: string
): Article {
  return {
    article_id: art.article_id || art.link,
    title: art.title || "Untitled Article",
    link: art.link || "#",
    description: art.description || "",
    content: art.content || "",
    pubDate: art.pubDate || new Date().toISOString(),
    image_url: art.image_url || art.source_icon || null,
    source_id: art.source_id || "",
    source_name: art.source_name || art.source_id || "News Source",
    category: art.category || [fallbackCategory],
    country: art.country || [fallbackCountry],
    language: art.language || language,
  };
}

/**
 * Fetches and normalizes one page of NewsData.io results.
 * Throws on a non-OK upstream response — callers decide how to degrade.
 */
export async function fetchNewsDataArticles(
  apiKey: string,
  opts: NewsDataQuery
): Promise<Article[]> {
  const {
    categoryParam = "general",
    language = "en",
    country = "us",
  } = opts;

  const targetUrl = buildNewsDataUrl(opts);

  // no-store: the cron's whole job is to pull genuinely fresh upstream data,
  // so it must not be served a cached copy of its own previous run.
  const apiRes = await fetch(targetUrl.toString(), newsDataInit(apiKey, { cache: "no-store" }));

  if (!apiRes.ok) {
    throw new Error(`NewsData API error: status ${apiRes.status}`);
  }

  const data = await apiRes.json();
  const category = mapCategory(categoryParam);

  return (data.results || []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (art: any) => mapNewsDataArticle(art, category, country, language)
  );
}
