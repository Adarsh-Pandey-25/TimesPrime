import "server-only";

import * as Sentry from "@sentry/nextjs";
import { saveArticlesToDB, purgeOldArticles } from "../../repositories/db";
import { recordSystemAudit } from "../../repositories/auditLog";
import { fetchNewsDataArticles, type NewsDataQuery } from "./newsdata";
import { NEWS_REFRESH_BATCH_SIZE } from "@timesprime/shared/config/newsRefresh";

/**
 * Background refresh: pulls every category, in English and in Hindi, from NewsData.io into
 * Supabase. Since R1-12 it is the only writer of the articles table and the only caller of
 * NewsData on the reader's behalf: readers read the database (topHeadlines.ts).
 *
 * Run by the worker (`npm run job -w @timesprime/worker -- refresh-news`), which the server's timer
 * starts every 15 minutes; the job runs once NEWS_REFRESH_INTERVAL_MINUTES has passed
 * (@timesprime/shared/config/newsRefresh, apps/worker/src/jobs.ts). Nothing reaches it over HTTP,
 * so it needs no cron secret.
 */

// The languages the reader site offers. Hindi comes from NewsData's Hindi feed, which is India's.
export const REFRESH_LANGUAGES = ["en", "hi"] as const;

// The 7 categories the UI exposes as primary feeds.
export const REFRESH_CATEGORIES = [
  "general",
  "india",
  "world",
  "tech",
  "business",
  "sports",
  "entertainment",
] as const;

/** One NewsData call of a run. */
export interface RefreshCall {
  /** What the run's detail and the logs call it. */
  label: string;
  language: "en" | "hi";
  query: NewsDataQuery;
  /**
   * Which of the site's categories an article from this call counts for, by its NewsData tag; "*"
   * is every article. Only the dry run reads it: the feed itself files articles by their tags.
   */
  countsAs: Record<string, string[]>;
}

/** Whether the batched refresh (R12-05, option (c)) is on: NEWS_REFRESH_BATCHED is "1". Off by default. */
export function newsRefreshBatched(): boolean {
  return process.env.NEWS_REFRESH_BATCHED === "1";
}

/**
 * The run's NewsData calls.
 *
 * Off (today): one call per category and language, 14 a run. In Hindi, "general" and "india" are
 * the same call (India's top stories), as they always were.
 *
 * On (option (c), R12-05): several categories per call, at most 5 (NewsData's limit), 50 articles a
 * call, 4 a run. Every 15 minutes that is 384 calls a day, 58% of the Basic plan; the single-
 * category refresh would be 1,344. English entertainment then comes from India's English feed
 * (it shares the call with India's top stories) rather than the United States'. Switch it on only
 * after the dry run (refresh-news-dry-run) shows articles per category close to today's.
 */
export function refreshPlan(batched: boolean = newsRefreshBatched()): RefreshCall[] {
  if (!batched) {
    return REFRESH_LANGUAGES.flatMap((language) =>
      REFRESH_CATEGORIES.map((category) => ({
        label: category,
        language,
        query: { categoryParam: category, language, country: language === "hi" || category === "india" ? "in" : "us" },
        countsAs: { "*": [category] },
      }))
    );
  }
  const five = ["top", "world", "technology", "business", "sports"];
  const size = NEWS_REFRESH_BATCH_SIZE;
  const theFive = { world: ["world"], technology: ["tech"], business: ["business"], sports: ["sports"] };
  return [
    {
      label: "en:top,world,technology,business,sports",
      language: "en",
      query: { categories: five, language: "en", country: "us", size },
      countsAs: { top: ["general"], ...theFive },
    },
    {
      label: "en:india,entertainment",
      language: "en",
      query: { categories: ["top", "entertainment"], language: "en", country: "in", size },
      countsAs: { top: ["india"], entertainment: ["entertainment"] },
    },
    {
      label: "hi:top,world,technology,business,sports",
      language: "hi",
      query: { categories: five, language: "hi", country: "in", size },
      countsAs: { top: ["general", "india"], ...theFive },
    },
    {
      label: "hi:entertainment",
      language: "hi",
      query: { categories: ["entertainment"], language: "hi", country: "in", size },
      countsAs: { entertainment: ["entertainment"] },
    },
  ];
}

interface RefreshDetail {
  category: string;
  language: string;
  ok: boolean;
  fetched: number;
  saved: number;
  error?: string;
}

export interface RefreshResult {
  refreshed: number;
  failed: number;
  purged: number;
  timestamp: string;
  details: RefreshDetail[];
}

export type RefreshOutcome = { ok: true; result: RefreshResult } | { ok: false; error: string };

export async function refreshNews(): Promise<RefreshOutcome> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "NEWSDATA_API_KEY is not set — nothing to refresh." };
  }

  // The 7-day purge runs here, once per run, and nowhere on the read path
  // (F-015). It never throws: a failure is logged and counts as 0.
  const purged = await purgeOldArticles();

  const details: RefreshDetail[] = [];
  let refreshed = 0;
  let failed = 0;

  // Sequential on purpose: NewsData.io rate-limits bursts, and parallel requests
  // are the fastest way to get the whole run throttled.
  for (const { label: category, language, query } of refreshPlan()) {
    try {
      const articles = await fetchNewsDataArticles(apiKey, query);

      const saved = await saveArticlesToDB(articles);

      refreshed += 1;
      details.push({ category, language, ok: true, fetched: articles.length, saved: saved.length });
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);

      console.error(`Refresh failed for category "${category}" (${language}):`, message);
      Sentry.captureException(err, {
        tags: { source: "cron" },
        extra: { operation: "refresh-news", category, language },
      });

      // Keep going — one bad call shouldn't abort the whole refresh.
      details.push({ category, language, ok: false, fetched: 0, saved: 0, error: message });
    }
  }

  const articlesSaved = details.reduce((sum, d) => sum + d.saved, 0);

  // The job is not a person and holds no staff account: it writes the audit log as system:cron
  // (owner decision D11). A failed write is reported, never thrown, so it cannot stop a run.
  await recordSystemAudit({
    actor_type: "system",
    actor_id: null,
    actor_label: "system:cron",
    action: "cron.refresh_news",
    outcome: "succeeded",
    entity_type: "articles",
    entity_id: "feed",
    after: { articles_saved: articlesSaved, refreshed, failed, purged },
  });

  return { ok: true, result: { refreshed, failed, purged, timestamp: new Date().toISOString(), details } };
}
