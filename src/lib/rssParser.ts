/**
 * RSS INTEGRATION — DISABLED FOR COMMERCIAL COMPLIANCE
 *
 * RSS feeds from Indian publishers do not explicitly permit
 * commercial use. This file is kept for reference only.
 *
 * To re-enable: Obtain commercial syndication license from
 * each publisher, then uncomment and update RSS_SOURCES.
 *
 * Publishers to contact for licensing:
 * - NDTV:              syndication@ndtv.com
 * - Times of India:    advertising@timesgroup.com
 * - Hindustan Times:   syndication@hindustantimes.com
 * - The Hindu:         digital@thehindu.co.in
 * - Indian Express:    online@indianexpress.com
 * - Business Standard: assist@bsmail.in
 * - News18:            digital@network18online.com
 * - BBC Hindi:         bbcsyndicationandrss@bbc.co.uk
 *
 * Status: Pending commercial licensing
 * Last reviewed: August 2026
 */

// ═══════════════════════════════════════════════════
// ALL CODE BELOW IS DISABLED — COMMERCIAL COMPLIANCE
//
// NOTE: this file's original JSDoc comments (/** ... */) were converted to
// // line comments before wrapping, since nested /* */ block comments
// aren't valid JS/TS — the first inner */ would have closed this wrapper
// early and left the rest of the file as live, broken code.
// ═══════════════════════════════════════════════════

/*
import { Article } from "@/types";

// Pure regex-based RSS parsing — no XML parser package. This is fine for
// RSS 2.0's flat, well-known tag set, but it does mean malformed/nonstandard
// feeds degrade to "0 items extracted" rather than a parse error.

export interface RSSSource {
  url: string;
  category: string;
  language: string;
  source: string;
}

export const RSS_SOURCES: RSSSource[] = [
  { url: "https://feeds.feedburner.com/ndtvnews-top-stories", category: "general", language: "en", source: "NDTV" },
  { url: "https://feeds.feedburner.com/ndtvnews-india-news", category: "india", language: "en", source: "NDTV" },
  { url: "https://gadgets.ndtv.com/rss/feeds", category: "technology", language: "en", source: "NDTV Gadgets" },
  { url: "https://www.business-standard.com/rss/home_page_top_stories.rss", category: "business", language: "en", source: "Business Standard" },
  { url: "https://feeds.feedburner.com/ndtvnews-sports", category: "sports", language: "en", source: "NDTV" },
  { url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", category: "india", language: "en", source: "Hindustan Times" },
  { url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", category: "general", language: "en", source: "Times of India" },
  { url: "https://timesofindia.indiatimes.com/rssfeeds/66949542.cms", category: "technology", language: "en", source: "Times of India" },
  { url: "https://www.thehindu.com/news/national/feeder/default.rss", category: "india", language: "en", source: "The Hindu" },
  { url: "https://indianexpress.com/feed/", category: "general", language: "en", source: "Indian Express" },
  { url: "https://hindi.news18.com/rss/khabar/nation/1.xml", category: "india", language: "hi", source: "News18 Hindi" },
  { url: "https://feeds.bbci.co.uk/hindi/rss.xml", category: "general", language: "hi", source: "BBC Hindi" },
  { url: "https://www.amarujala.com/rss/breaking-news.xml", category: "general", language: "hi", source: "Amar Ujala" },
  // TODO: Add Aaj Tak and Jagran when real RSS feed URLs are confirmed
  // Aaj Tak does not declare RSS in HTML head — needs direct URL from publisher
  // Jagran returns 404 — needs verified URL
  // Dainik Bhaskar tested 2026-08-19: https://www.bhaskar.com/rss-v1--category-national.xml
  //   returns HTTP 501 "Not implemented" — needs a real feed URL from the publisher
  // Live Hindustan tested 2026-08-19: https://www.livehindustan.com/rss/national.xml
  //   returns HTTP 503 "Service Unavailable - DNS failure" — needs a real feed URL
];

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

// Deterministic short id for an article — same link always hashes the same.
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Strips CDATA wrappers, HTML tags, and decodes the common named entities.
export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => HTML_ENTITIES[entity])
    .trim();
}

// Pulls the first <img src="..."> out of an HTML description, if any.
export function extractImageFromDescription(desc: string): string | null {
  if (!desc) return null;
  const match = desc.match(/<img[^>]*\bsrc=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

const ITEM_REGEX = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

function extractTag(itemXml: string, tag: string): string | null {
  const match = itemXml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : null;
}

function extractAttrUrl(itemXml: string, tag: string): string | null {
  const match = itemXml.match(new RegExp(`<${tag}\\b[^>]*\\burl=["']([^"']+)["']`, "i"));
  return match ? match[1] : null;
}

function extractLink(itemXml: string): string {
  const rawLink = extractTag(itemXml, "link");
  if (rawLink) return stripHtml(rawLink);

  const guidMatch = itemXml.match(/<guid\b[^>]*\bisPermaLink=["']true["'][^>]*>([\s\S]*?)<\/guid>/i);
  return guidMatch ? stripHtml(guidMatch[1]) : "";
}

function parsePubDate(rawPubDate: string | null): string {
  if (rawPubDate) {
    const parsed = new Date(rawPubDate);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

// Fetches and parses one RSS source into Article rows.
//
// Deliberately does NOT swallow fetch/HTTP failures here (network error,
// timeout, non-2xx) — those propagate so fetchAllRSSFeeds's
// Promise.allSettled can tell a genuinely failed source apart from one that
// just has zero matching items. Per-item extraction is plain regex over
// already-fetched text and can't throw, so nothing there needs a try/catch.
async function fetchAndParseRSS(source: RSSSource): Promise<Article[]> {
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TimesPrime/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed for ${source.source} (${source.url}): HTTP ${response.status}`);
  }

  const xml = await response.text();
  const articles: Article[] = [];

  for (const itemMatch of xml.matchAll(ITEM_REGEX)) {
    const itemXml = itemMatch[1];

    const title = stripHtml(extractTag(itemXml, "title") || "").slice(0, 200);
    const link = extractLink(itemXml);
    if (!title || !link) continue;

    const rawDescription = extractTag(itemXml, "description") || "";
    const description = stripHtml(rawDescription).slice(0, 300);

    const imageUrl =
      extractAttrUrl(itemXml, "media:content") ||
      extractAttrUrl(itemXml, "enclosure") ||
      extractImageFromDescription(rawDescription);

    articles.push({
      article_id: simpleHash(link),
      title,
      link,
      description,
      content: "",
      pubDate: parsePubDate(extractTag(itemXml, "pubDate")),
      image_url: imageUrl,
      source_name: source.source,
      source_id: source.source.toLowerCase().replace(/\s+/g, "-"),
      category: [source.category],
      language: source.language,
      country: source.language === "hi" ? ["in"] : ["us", "in"],
    });
  }

  return articles;
}

// Fetches every configured RSS source in parallel, deduplicates the
// combined result by link and by a normalized title prefix (feeds that
// mirror each other's wire copy tend to differ only in a trailing
// "- Source Name" suffix), and reports how many sources actually
// responded successfully.
export async function fetchAllRSSFeeds(): Promise<{
  articles: Article[];
  succeeded: number;
  failed: number;
}> {
  const results = await Promise.allSettled(RSS_SOURCES.map((source) => fetchAndParseRSS(source)));

  let succeeded = 0;
  let failed = 0;
  const collected: Article[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      succeeded += 1;
      collected.push(...result.value);
    } else {
      failed += 1;
      console.warn("RSS source failed:", result.reason instanceof Error ? result.reason.message : result.reason);
    }
  }

  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const articles: Article[] = [];

  for (const article of collected) {
    if (seenLinks.has(article.link)) continue;
    const titleKey = article.title.slice(0, 50).toLowerCase();
    if (seenTitles.has(titleKey)) continue;

    seenLinks.add(article.link);
    seenTitles.add(titleKey);
    articles.push(article);
  }

  return { articles, succeeded, failed };
}
*/
