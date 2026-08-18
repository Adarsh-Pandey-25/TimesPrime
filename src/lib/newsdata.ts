import { Article } from "@/types";
import { mapCategory } from "@/lib/newsConfig";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";

/**
 * Shared NewsData.io fetch + normalize.
 *
 * Unlike lib/fetchNews.ts this deliberately does NOT fall back to
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

/** Builds the upstream URL, mirroring the rules used by the news routes. */
export function buildNewsDataUrl(apiKey: string, opts: NewsDataQuery): URL {
  const {
    categoryParam = "general",
    language = "en",
    country = "us",
    query = "",
    page = "",
  } = opts;

  const category = mapCategory(categoryParam);
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
    title: paraphraseTitle(art.title || "Untitled Article"),
    link: art.link || "#",
    description: paraphraseText(art.description || ""),
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

  const targetUrl = buildNewsDataUrl(apiKey, opts);

  // no-store: the cron's whole job is to pull genuinely fresh upstream data,
  // so it must not be served a cached copy of its own previous run.
  const apiRes = await fetch(targetUrl.toString(), { cache: "no-store" });

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
