import "server-only";

import type { Article } from "@timesprime/shared/types";
import { fetchNewsDataArticles } from "./newsdata";
import { REFRESH_CATEGORIES, REFRESH_LANGUAGES, refreshPlan, type RefreshCall } from "./refreshNews";

/**
 * The dry run for the batched refresh (R12-05). It makes both runs' NewsData calls, the 14
 * single-category ones and the 4 batched ones (18 credits), and counts the articles each brings for
 * every category and language. It writes nothing: no article, no purge, no audit row. Run it once,
 * by hand, after the NewsData Basic plan is bought (the batched calls ask for 50 articles, which
 * the free plan refuses); switch NEWS_REFRESH_BATCHED on only if the counts are close.
 *
 *   docker compose --env-file /opt/timesprime/release.env --profile jobs run --rm worker refresh-news-dry-run
 */

export interface DryRunRow {
  language: string;
  category: string;
  /** Articles today's single-category call brings for this category. */
  single: number;
  /** Articles the batched calls bring that are tagged for it. */
  batched: number;
}

export interface DryRunReport {
  calls: { single: number; batched: number };
  failures: string[];
  rows: DryRunRow[];
}

export type DryRunOutcome = { ok: true; report: DryRunReport } | { ok: false; error: string };

/** Adds one call's articles to the counts, by the site categories its countsAs gives them. */
function count(call: RefreshCall, articles: Article[], counts: Map<string, number>): void {
  for (const article of articles) {
    const categories = call.countsAs["*"] ?? [
      ...new Set((article.category ?? []).flatMap((tag) => call.countsAs[String(tag).toLowerCase()] ?? [])),
    ];
    for (const category of categories) {
      const key = `${call.language}:${category}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
}

export async function dryRunRefresh(): Promise<DryRunOutcome> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) return { ok: false, error: "NEWSDATA_API_KEY is not set — nothing to compare." };

  const single = new Map<string, number>();
  const batched = new Map<string, number>();
  const failures: string[] = [];
  const runs: Array<[string, RefreshCall[], Map<string, number>]> = [
    ["single", refreshPlan(false), single],
    ["batched", refreshPlan(true), batched],
  ];

  // Sequential, as the refresh is: NewsData throttles bursts.
  for (const [name, plan, counts] of runs) {
    for (const call of plan) {
      try {
        count(call, await fetchNewsDataArticles(apiKey, call.query), counts);
      } catch (err) {
        failures.push(`${name} ${call.language}:${call.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const rows = REFRESH_LANGUAGES.flatMap((language) =>
    REFRESH_CATEGORIES.map((category) => ({
      language,
      category,
      single: single.get(`${language}:${category}`) ?? 0,
      batched: batched.get(`${language}:${category}`) ?? 0,
    }))
  );
  return { ok: true, report: { calls: { single: runs[0][1].length, batched: runs[1][1].length }, failures, rows } };
}
