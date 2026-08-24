import * as Sentry from "@sentry/nextjs";
import { Article } from "@/types";
import { supabase, isSupabaseConfigured } from "./supabase";
import { containsHindiScript } from "./newsConfig";

export interface DBArticle extends Article {
  fetchedAt?: number;
  created_at?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long DB-backed news is considered fresh enough to serve without
 * calling NewsData.io. Also the interval the background cron refreshes on.
 */
export const NEWS_FRESHNESS_WINDOW_MS = 30 * 60 * 1000;

/**
 * The category/query filter shared by every article read below.
 *
 * Deliberately one implementation rather than three copies: these filters
 * must agree exactly, or the freshness check and the "new stories" count
 * end up describing a different set of rows than the feed actually serves.
 * Structurally typed so it works with any Supabase query builder without
 * an `any`.
 */
interface ArticleQueryFilters<T> {
  or(filters: string): T;
  contains(column: string, value: string[]): T;
}

function applyArticleFilters<T extends ArticleQueryFilters<T>>(
  builder: T,
  category: string,
  query: string
): T {
  if (query.trim()) {
    const q = query.trim();
    return builder.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }
  if (category === "india") {
    return builder.or(`country.cs.{"in"},category.cs.{"india"}`);
  }
  if (category && category !== "general" && category !== "top") {
    return builder.contains("category", [category]);
  }
  return builder;
}

/** Minimal row shape read by the freshness / new-count queries below. */
interface ArticleTimestampRow {
  created_at: string;
  title: string;
}

/** Keeps only rows whose title script matches the requested language. */
function matchesLanguageScript(title: string | undefined, language: string): boolean {
  const titleIsHindi = containsHindiScript(title);
  return language === "hi" ? titleIsHindi : !titleIsHindi;
}

// Publishers whose articles are Hindi-language even when a headline happens
// to be transliterated/English (Devanagari detection alone misses those).
// Matched against the article link's hostname, so subdomains still match
// via endsWith (e.g. "khabar.ndtv.com" matches "ndtv.com" — kept broad
// deliberately since ndtv.com's Hindi section lives on a subdomain, not a
// distinct registrable domain).
const HINDI_SOURCE_DOMAINS = [
  "amarujala.com",
  "timesnowhindi.com",
  "navbharattimes.indiatimes.com",
  "aajtak.in",
  "bhaskar.com",
  "livehindustan.com",
  "jagran.com",
  "hindi.news18.com",
  "zeenews.india.com",
  "hindi.oneindia.com",
  "hindi.webdunia.com",
  "patrika.com",
];

function isFromHindiSource(link: string | undefined): boolean {
  if (!link) return false;
  try {
    const hostname = new URL(link).hostname.toLowerCase();
    return HINDI_SOURCE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

// Sources that gate nearly all article content behind a subscription, so
// storing them just means the reader hits scrape-article's paywall branch
// (see src/app/api/news/scrape-article/route.ts) every time — better to
// not show them in the feed at all.
//
// Deliberately NOT domain-wide for every "premium" publisher: Supabase's
// live data (checked August 2026) also has timesofindia.indiatimes.com
// (68 rows), livemint.com (7), hindi.business-standard.com (7), and
// thehindu.com (12), but those are metered/partial paywalls — most of
// their content is freely readable, and only a labeled subset (e.g. TOI+)
// is locked. Skipping their entire domain here would hide dozens of
// legitimate free articles; per-article precision for those sources comes
// from scrape-article's detectPaywall() at read time instead, not from
// this list. This list is only for sources where practically everything
// is behind the paywall, verified against the same live data.
const HARD_PAYWALL_SOURCE_DOMAINS = ["wsj.com", "bloomberg.com"];

function isFromHardPaywallSource(link: string | undefined): boolean {
  if (!link) return false;
  try {
    const hostname = new URL(link).hostname.toLowerCase();
    return HARD_PAYWALL_SOURCE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/**
 * Automatically purges any article older than 7 days from Supabase.
 */
export async function purgeOldArticles(): Promise<number> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase credentials not configured in .env.local yet.");
    return 0;
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const { data, error } = await supabase
      .from("articles")
      .delete()
      .lt("created_at", sevenDaysAgo)
      .select("id");

    if (error) {
      console.error("Supabase Purge Error:", error.message);
      Sentry.captureMessage(`Supabase purge error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "purgeOldArticles" },
      });
      return 0;
    }

    return data ? data.length : 0;
  } catch (err) {
    console.error("Failed to purge old articles from Supabase:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "purgeOldArticles" } });
    return 0;
  }
}

/**
 * Upserts new articles into Supabase table "articles" in Realtime
 * and triggers 7-day auto-purge.
 */
export async function saveArticlesToDB(incomingArticles: Article[]): Promise<DBArticle[]> {
  if (!incomingArticles || incomingArticles.length === 0) return [];

  // Run 7-day auto-purge first
  await purgeOldArticles();

  if (!isSupabaseConfigured()) {
    return incomingArticles;
  }

  try {
    // Hard-paywall sources never make it into the feed at all — see
    // HARD_PAYWALL_SOURCE_DOMAINS above for why this list stays narrow.
    const storableArticles = incomingArticles.filter((art) => !isFromHardPaywallSource(art.link));
    if (storableArticles.length === 0) return [];

    const rowsToUpsert = storableArticles.map((art) => ({
      article_id: art.article_id || art.link || art.title,
      title: art.title,
      link: art.link || "#",
      description: art.description || "",
      content: art.content || "",
      pub_date: art.pubDate || new Date().toISOString(),
      image_url: art.image_url || null,
      source_id: art.source_id || "",
      source_name: art.source_name || "News Source",
      category: art.category || ["general"],
      country: art.country || ["us"],
      // Devanagari script always wins over whatever language tag the
      // source provided — NewsData.io tags some genuinely-Hindi articles
      // (amarujala, timesnowhindi, etc.) as "en". Filtering already
      // ignores the stored tag in favor of script detection; this just
      // makes the stored value match what the app actually treats it as.
      // Known Hindi source domains are a second signal for the case
      // Devanagari detection alone misses: a Hindi publisher's headline
      // that's transliterated/English with no Devanagari characters at all.
      language: containsHindiScript(art.title) || art.language === "hi" || art.language === "hindi" || isFromHindiSource(art.link)
        ? "hi"
        : "en",
    }));

    const { data, error } = await supabase
      .from("articles")
      .upsert(rowsToUpsert, { onConflict: "article_id" })
      .select("*");

    if (error) {
      console.error("Supabase Upsert Error:", error.message);
      Sentry.captureMessage(`Supabase upsert error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "saveArticlesToDB", rowCount: rowsToUpsert.length },
      });
      return incomingArticles;
    }

    return (data || []).map((row: any) => ({
      article_id: row.article_id,
      title: row.title,
      link: row.link,
      description: row.description,
      content: row.content,
      pubDate: row.pub_date,
      image_url: row.image_url,
      source_id: row.source_id,
      source_name: row.source_name,
      category: row.category,
      country: row.country,
      language: row.language,
      created_at: row.created_at,
    }));
  } catch (err) {
    console.error("Error saving to Supabase:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "saveArticlesToDB" } });
    return incomingArticles;
  }
}

/**
 * Retrieves articles stored in Supabase filtered by category and query.
 */
export async function getDBArticles(
  category: string = "general",
  query: string = "",
  language: string = "en"
): Promise<DBArticle[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  await purgeOldArticles();

  try {
    const queryBuilder = applyArticleFilters(
      supabase.from("articles").select("*").order("created_at", { ascending: false }),
      category,
      query
    );

    const { data, error } = await queryBuilder.limit(80);

    if (error) {
      console.error("Supabase Select Error:", error.message);
      Sentry.captureMessage(`Supabase select error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "getDBArticles", category, language },
      });
      return [];
    }

    const filtered = (data || []).filter((row: any) =>
      matchesLanguageScript(row.title, language)
    );

    return filtered.slice(0, 40).map((row: any) => ({
      article_id: row.article_id,
      title: row.title,
      link: row.link,
      description: row.description,
      content: row.content,
      pubDate: row.pub_date,
      image_url: row.image_url,
      source_id: row.source_id,
      source_name: row.source_name,
      category: row.category,
      country: row.country,
      language: row.language,
      created_at: row.created_at,
    }));
  } catch (err) {
    console.error("Error fetching from Supabase:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "getDBArticles", category, language } });
    return [];
  }
}

/**
 * Returns the `created_at` of the newest stored article matching the given
 * category + language, or null when there is nothing stored (or Supabase
 * isn't configured). Used to decide whether the DB is fresh enough to serve
 * without calling NewsData.io.
 *
 * Rows are script-filtered in JS (same as getDBArticles) rather than SQL,
 * so a stored English article can't make a Hindi feed look "fresh".
 */
export async function getLatestArticleTimestamp(
  category: string = "general",
  language: string = "en"
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const queryBuilder = applyArticleFilters(
      supabase
        .from("articles")
        .select("created_at, title")
        .order("created_at", { ascending: false }),
      category,
      ""
    );

    // Small window: we only need the newest row that passes the script
    // filter, and matching-language rows cluster at the top of the ordering.
    const { data, error } = await queryBuilder.limit(50);

    if (error) {
      console.error("Supabase Freshness Check Error:", error.message);
      Sentry.captureMessage(`Supabase freshness check error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "getLatestArticleTimestamp", category, language },
      });
      return null;
    }

    const rows = (data ?? []) as unknown as ArticleTimestampRow[];
    const match = rows.find((row) => matchesLanguageScript(row.title, language));
    return match?.created_at ?? null;
  } catch (err) {
    console.error("Failed to read latest article timestamp:", err);
    Sentry.captureException(err, {
      tags: { source: "supabase" },
      extra: { operation: "getLatestArticleTimestamp", category, language },
    });
    return null;
  }
}

/**
 * Counts stored articles newer than `since` for the "new stories" banner.
 * Never calls NewsData.io and never throws — a failure just reports zero
 * new stories, which degrades to "no banner" rather than a broken feed.
 */
export async function countArticlesSince(
  since: string,
  category: string = "general",
  language: string = "en"
): Promise<{ newCount: number; latestTimestamp: string | null }> {
  if (!isSupabaseConfigured()) return { newCount: 0, latestTimestamp: null };

  try {
    const queryBuilder = applyArticleFilters(
      supabase
        .from("articles")
        .select("created_at, title")
        .gt("created_at", since)
        .order("created_at", { ascending: false }),
      category,
      ""
    );

    const { data, error } = await queryBuilder.limit(100);

    if (error) {
      console.error("Supabase New-Count Error:", error.message);
      Sentry.captureMessage(`Supabase new-count error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "countArticlesSince", category, language },
      });
      return { newCount: 0, latestTimestamp: null };
    }

    const rows = (data ?? []) as unknown as ArticleTimestampRow[];
    const matching = rows.filter((row) => matchesLanguageScript(row.title, language));

    return {
      newCount: matching.length,
      latestTimestamp: matching[0]?.created_at ?? null,
    };
  } catch (err) {
    console.error("Failed to count new articles:", err);
    Sentry.captureException(err, {
      tags: { source: "supabase" },
      extra: { operation: "countArticlesSince", category, language },
    });
    return { newCount: 0, latestTimestamp: null };
  }
}

/**
 * Returns Supabase database metrics for admin dashboard.
 */
export async function getDBStats() {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return {
      configured: false,
      totalStoredArticles: 0,
      retentionDays: 7,
      databaseType: "Supabase PostgreSQL (Awaiting Credentials)",
      note: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
    };
  }

  try {
    const { count, error } = await supabase
      .from("articles")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("Supabase Stats Error:", error.message);
      Sentry.captureMessage(`Supabase stats error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "getDBStats" },
      });
    }

    return {
      configured: true,
      totalStoredArticles: count || 0,
      retentionDays: 7,
      databaseType: "Supabase Realtime PostgreSQL",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    };
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "getDBStats" } });
    return {
      configured: true,
      totalStoredArticles: 0,
      retentionDays: 7,
      databaseType: "Supabase Realtime PostgreSQL",
    };
  }
}
