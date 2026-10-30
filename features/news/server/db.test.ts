/**
 * @jest-environment node
 *
 * BL-014: during a Supabase outage every failed operation reached Sentry —
 * five events per feed request. These tests simulate a failing database and
 * pin the reporting to at most one event per operation per window.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("./categoryClassifier", () => ({ classifyCategoryRelevance: jest.fn(() => Promise.resolve()) }));
jest.mock("@/server/supabase", () => ({ supabase: { from: jest.fn() }, isSupabaseConfigured: jest.fn(() => true) }));

import { getDBArticles, getLatestArticleTimestamp, saveArticlesToDB } from "./db";
import { FALLBACK_REPORT_WINDOW_MS } from "@/lib/reportFallback";
import type { Article } from "@/types";

const sentry = jest.requireMock("@sentry/nextjs") as { captureMessage: jest.Mock; captureException: jest.Mock };
const { supabase } = jest.requireMock("@/server/supabase") as { supabase: { from: jest.Mock } };

// A query builder that accepts any chain of calls and resolves to `result`,
// the way supabase-js reports a network failure: no throw, an error object.
function failingQuery(result: object): object {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: (value: object) => void) => resolve(result);
        return () => proxy;
      },
    }
  );
  return proxy;
}

const OUTAGE = { data: null, count: null, error: { message: "TypeError: fetch failed", code: "" } };

const article: Article = {
  article_id: "bl014-test-article",
  title: "Parliament passes the annual budget",
  link: "https://example.com/news/budget",
  pubDate: "2026-10-30 06:00:00",
  description: "A routine story used to reach the upsert.",
  source_id: "example",
  language: "en",
  category: ["top"],
  country: ["india"],
};

/** The Supabase calls one top-headlines request makes when it falls through to NewsData.io. */
async function feedRequest() {
  await getLatestArticleTimestamp("top", "en");
  await saveArticlesToDB([article]);
  await getDBArticles("top", "", "en");
}

const events = () => sentry.captureMessage.mock.calls.length + sentry.captureException.mock.calls.length;

let clock = Date.parse("2026-10-30T00:00:00Z");
let silence: jest.SpyInstance[];

beforeEach(() => {
  jest.useFakeTimers();
  // A fresh window per test: the limiter keeps state across calls by design.
  clock += 10 * FALLBACK_REPORT_WINDOW_MS;
  jest.setSystemTime(clock);
  sentry.captureMessage.mockClear();
  sentry.captureException.mockClear();
  supabase.from.mockReset();
  supabase.from.mockImplementation(() => failingQuery(OUTAGE));
  silence = [jest.spyOn(console, "error").mockImplementation(() => {}), jest.spyOn(console, "warn").mockImplementation(() => {})];
});

afterEach(() => {
  for (const spy of silence) spy.mockRestore();
  jest.useRealTimers();
});

describe("db.ts during a Supabase outage (BL-014)", () => {
  test("a run of failing feed requests reports each operation at most once per window", async () => {
    await feedRequest();
    await feedRequest();
    await feedRequest();

    // Four distinct operations fail: freshness check, purge (twice per
    // request), upsert, select. Unthrottled this was 15 events.
    expect(events()).toBeLessThanOrEqual(4);
    const operations = sentry.captureMessage.mock.calls.map(([, options]) => options.extra.operation).sort();
    expect(operations).toEqual(["getDBArticles", "getLatestArticleTimestamp", "purgeOldArticles", "saveArticlesToDB"]);
  });

  test("reports again after the window, carrying how many were suppressed", async () => {
    await feedRequest();
    await feedRequest();
    await feedRequest();
    sentry.captureMessage.mockClear();

    jest.setSystemTime(clock + FALLBACK_REPORT_WINDOW_MS);
    await feedRequest();

    const purge = sentry.captureMessage.mock.calls.find(([, options]) => options.extra.operation === "purgeOldArticles");
    // Six purges ran in the first window (two per request); one was reported.
    expect(purge?.[1].extra.suppressedSinceLastReport).toBe(5);
    expect(events()).toBeLessThanOrEqual(4);
  });

  test("thrown failures are throttled the same way", async () => {
    supabase.from.mockImplementation(() => {
      throw new TypeError("fetch failed");
    });
    for (let i = 0; i < 5; i++) await getDBArticles("top", "", "en");
    // getDBArticles's purge and select both throw; one report each.
    expect(sentry.captureException).toHaveBeenCalledTimes(2);
  });

  test("what readers get is unchanged: empty results, not errors", async () => {
    await expect(getLatestArticleTimestamp("top", "en")).resolves.toBeNull();
    await expect(getDBArticles("top", "", "en")).resolves.toEqual([]);
    await expect(saveArticlesToDB([article])).resolves.toEqual([article]);
  });
});
