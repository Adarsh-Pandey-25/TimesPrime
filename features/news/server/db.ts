import * as Sentry from "@sentry/nextjs";
import { Article } from "@/types";
import { supabase, isSupabaseConfigured } from "@/server/supabase";
import {
  containsHindiScript,
  containsNonLatinIndicScript,
  isHoroscopeOrRitualFiller,
  isFromWireSpamSource,
  isFromNonNewsListingSource,
} from "../newsConfig";
import { classifyCategoryRelevance } from "./categoryClassifier";
import { throttleReport } from "@/lib/reportFallback";

/**
 * Sends a failed Supabase operation to Sentry at most once per operation per
 * window (BL-014). During an outage every feed request fails several
 * operations, and unthrottled that was five events a request. Uses the same
 * limiter as the D5 fallback report; `send` receives the number suppressed
 * since the last report, to add to its extras. The console.error lines stay
 * per call.
 */
function reportSupabaseFailure(operation: string, send: (suppressed: { suppressedSinceLastReport: number }) => void): void {
  throttleReport(`supabase:${operation}`, (suppressedSinceLastReport) => send({ suppressedSinceLastReport }));
}

export interface DBArticle extends Article {
  fetchedAt?: number;
  created_at?: string;
}

/**
 * A row of public.articles exactly as db/schema.sql declares it — nullability
 * included. Only `id`, `article_id`, `title` and `created_at` are NOT NULL
 * there; everything else is nullable, and this type says so rather than
 * flattering the mapping code below.
 */
interface ArticleRow {
  id: string;
  article_id: string;
  title: string;
  link: string | null;
  description: string | null;
  content: string | null;
  pub_date: string | null;
  image_url: string | null;
  source_id: string | null;
  source_name: string | null;
  category: string[] | null;
  country: string[] | null;
  language: string | null;
  created_at: string;
  category_mismatches: string[] | null;
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
  // Category and search are independent, additive conditions — NOT a
  // query-vs-category branch. Both used to funnel through separate `if`s
  // where a query short-circuited the function before category was ever
  // applied, silently turning a category-scoped search into a global one
  // (e.g. /?category=india&search=Politics matched politics articles from
  // anywhere, not just India). postgrest-js's .or()/.contains() both use
  // searchParams.append (verified in node_modules), so calling .or() once
  // for category and again for the search terms produces two independent
  // `or=(...)` query params — PostgREST ANDs all top-level params
  // together, so this reads as (category-condition) AND (search-condition),
  // not one flattened OR that would defeat the category scoping.
  let b = builder;

  if (category === "india") {
    // country.cs.{"in"} alone was the dominant cause of the "India page is
    // nearly empty" bug — verified against live data: only 6 rows in the
    // whole table have country containing the 2-letter code "in", while
    // 1357 have it containing the full word "india" (matches the same
    // storage-format discovery already documented in
    // COUNTRY_CODE_TO_STORED_NAME in articles/route.ts, which this
    // pre-existing filter had never been updated to match). Checking both
    // forms goes from 6 matching rows to 1363.
    b = b.or(`country.cs.{"in"},country.cs.{"india"},category.cs.{"india"}`);
  } else if (category === "general" || category === "top") {
    // Previously no-op here: General/Top Stories got zero filtering, so it
    // just showed the most-recently-inserted rows table-wide — whatever
    // category a cron run or freshness fetch happened to touch last (e.g.
    // Science) ended up looking identical to General. NewsData.io's own
    // "top" category tag is a genuine cross-topic signal, not a narrow one:
    // verified against live data before relying on it — "top" is present on
    // ~66% of all stored rows and co-occurs across all 14 other categories
    // (business, politics, technology, health, sports, crime,
    // entertainment, science, lifestyle, environment, education, tourism,
    // food, breaking) in a genuinely spread distribution, not concentrated
    // in one or two. Filtering on it gives General an actual diverse
    // cross-section instead of "whatever's newest."
    b = b.contains("category", ["top"]);
  } else if (category) {
    b = b.contains("category", [category]);
  }

  if (query.trim()) {
    const q = query.trim();
    b = b.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }

  return b;
}

/** Minimal row shape read by the freshness / new-count queries below. */
interface ArticleTimestampRow {
  created_at: string;
  title: string;
}

// Keeps only rows whose title script matches the requested language: "hi" =
// genuine Devanagari only; "en" = no Indic script at all (Devanagari or
// otherwise) — an Odia/Tamil/Bengali/etc. title belongs in neither feed, not
// "English" by default. See containsNonLatinIndicScript in newsConfig.ts.
function matchesLanguageScript(title: string | undefined, language: string): boolean {
  if (language === "hi") return containsHindiScript(title);
  return !containsNonLatinIndicScript(title);
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
// (see app/api/news/scrape-article/route.ts) every time — better to
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
      reportSupabaseFailure("purgeOldArticles", (suppressed) =>
        Sentry.captureMessage(`Supabase purge error: ${error.message}`, {
          tags: { source: "supabase" },
          extra: { operation: "purgeOldArticles", ...suppressed },
        })
      );
      return 0;
    }

    return data ? data.length : 0;
  } catch (err) {
    console.error("Failed to purge old articles from Supabase:", err);
    reportSupabaseFailure("purgeOldArticles", (suppressed) =>
      Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "purgeOldArticles", ...suppressed } })
    );
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
    // Horoscope/tarot filler gets the same treatment — see
    // isHoroscopeOrRitualFiller in newsConfig.ts for what's actually
    // excluded and why the pattern stays narrow (verified against live
    // data, not guessed). Confirmed wire-spam accounts (WIRE_SPAM_SOURCE_IDS
    // above) and non-news listing sources (isFromNonNewsListingSource,
    // e.g. car-auction listings mistagged as technology) get the same
    // "never let it in" treatment.
    const storableArticles = incomingArticles.filter(
      (art) =>
        !isFromHardPaywallSource(art.link) &&
        !isHoroscopeOrRitualFiller(art) &&
        !isFromWireSpamSource(art.source_id) &&
        !isFromNonNewsListingSource(art.source_id)
    );
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
      reportSupabaseFailure("saveArticlesToDB", (suppressed) =>
        Sentry.captureMessage(`Supabase upsert error: ${error.message}`, {
          tags: { source: "supabase" },
          extra: { operation: "saveArticlesToDB", rowCount: rowsToUpsert.length, ...suppressed },
        })
      );
      return incomingArticles;
    }

    // Fire-and-forget: classify category relevance for rows that haven't
    // been classified yet (never re-classifies a row that already has a
    // stored result). Deliberately not awaited — Haiku's latency shouldn't
    // delay the save/serve path; the classification catches up a few
    // seconds later and applies from the next read onward. See
    // categoryClassifier.ts for the fail-open behavior.
    const toClassify = (data || []).filter((row: ArticleRow) => row.category_mismatches == null);
    if (toClassify.length > 0) {
      classifyCategoryRelevance(
        toClassify.map((row: ArticleRow) => ({
          article_id: row.article_id,
          title: row.title,
          description: row.description,
          category: row.category,
        }))
      ).catch((err) => console.error("Background category classification error:", err));
    }

    // Typing this row as ArticleRow (above) is correct per db/schema.sql but
    // does not compile: link and pub_date are nullable in Postgres while
    // Article.link and Article.pubDate are required strings, so this mapping
    // silently relies on `any` to paper over unhandled nulls. Fixing it needs
    // a logic change (null coalescing, or a narrower Article), which is out of
    // scope for a lint-only commit. See docs/BACKLOG.md (BL-001).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    reportSupabaseFailure("saveArticlesToDB", (suppressed) =>
      Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "saveArticlesToDB", ...suppressed } })
    );
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
      reportSupabaseFailure("getDBArticles", (suppressed) =>
        Sentry.captureMessage(`Supabase select error: ${error.message}`, {
          tags: { source: "supabase" },
          extra: { operation: "getDBArticles", category, language, ...suppressed },
        })
      );
      return [];
    }

    // Language-script filter, plus horoscope/tarot filler, wire-spam, and
    // non-news-listing rows saved before those exclusions existed —
    // saveArticlesToDB now keeps new rows like this out entirely, but rows
    // already stored from before those fixes still need filtering out here
    // so they don't linger for up to 7 days until they naturally purge.
    //
    // category_mismatches is per-row, per-category (not a blanket
    // exclusion): an article tagged both "business" and "technology" can be
    // genuinely on-topic for one and not the other (e.g. a local
    // connectivity story is real business news but not real tech news), so
    // it's only excluded from the specific category(ies) Haiku flagged as a
    // mismatch, not from every category it's tagged with. Null (not yet
    // classified, or classification failed) reads as "no mismatches" — see
    // categoryClassifier.ts for why that's the deliberate fail-open default.
    const filtered = (data || []).filter(
      (row: ArticleRow) =>
        matchesLanguageScript(row.title, language) &&
        !isHoroscopeOrRitualFiller(row) &&
        !isFromWireSpamSource(row.source_id) &&
        !isFromNonNewsListingSource(row.source_id) &&
        !(row.category_mismatches || []).includes(category)
    );

    // Same nullable-column vs required-Article-field mismatch as the mapping
    // in saveArticlesToDB above. See docs/BACKLOG.md (BL-001).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    reportSupabaseFailure("getDBArticles", (suppressed) =>
      Sentry.captureException(err, {
        tags: { source: "supabase" },
        extra: { operation: "getDBArticles", category, language, ...suppressed },
      })
    );
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
      reportSupabaseFailure("getLatestArticleTimestamp", (suppressed) =>
        Sentry.captureMessage(`Supabase freshness check error: ${error.message}`, {
          tags: { source: "supabase" },
          extra: { operation: "getLatestArticleTimestamp", category, language, ...suppressed },
        })
      );
      return null;
    }

    const rows = (data ?? []) as unknown as ArticleTimestampRow[];
    const match = rows.find((row) => matchesLanguageScript(row.title, language));
    return match?.created_at ?? null;
  } catch (err) {
    console.error("Failed to read latest article timestamp:", err);
    reportSupabaseFailure("getLatestArticleTimestamp", (suppressed) =>
      Sentry.captureException(err, {
        tags: { source: "supabase" },
        extra: { operation: "getLatestArticleTimestamp", category, language, ...suppressed },
      })
    );
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
      reportSupabaseFailure("countArticlesSince", (suppressed) =>
        Sentry.captureMessage(`Supabase new-count error: ${error.message}`, {
          tags: { source: "supabase" },
          extra: { operation: "countArticlesSince", category, language, ...suppressed },
        })
      );
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
    reportSupabaseFailure("countArticlesSince", (suppressed) =>
      Sentry.captureException(err, {
        tags: { source: "supabase" },
        extra: { operation: "countArticlesSince", category, language, ...suppressed },
      })
    );
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
      reportSupabaseFailure("getDBStats", (suppressed) =>
        Sentry.captureMessage(`Supabase stats error: ${error.message}`, {
          tags: { source: "supabase" },
          extra: { operation: "getDBStats", ...suppressed },
        })
      );
    }

    return {
      configured: true,
      totalStoredArticles: count || 0,
      retentionDays: 7,
      databaseType: "Supabase Realtime PostgreSQL",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    };
  } catch (err) {
    reportSupabaseFailure("getDBStats", (suppressed) =>
      Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "getDBStats", ...suppressed } })
    );
    return {
      configured: true,
      totalStoredArticles: 0,
      retentionDays: 7,
      databaseType: "Supabase Realtime PostgreSQL",
    };
  }
}
