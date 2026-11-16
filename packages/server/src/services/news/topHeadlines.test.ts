/**
 * @jest-environment node
 *
 * R1-02b for the feed (GET /api/news/top-headlines): when it goes to NewsData (a search, or a
 * database older than the window), the key travels in the X-ACCESS-KEY header, and the URL that
 * the fetch cache entry stores holds no key.
 */

jest.mock("next/server", () => ({ after: jest.fn() }));
jest.mock("../../lib/cache", () => ({ cache: { get: jest.fn(async () => null), set: jest.fn() }, CACHE_TTL_NEWS_SECONDS: 900 }));
jest.mock("../health/health", () => ({ reportSupabaseFallback: jest.fn() }));
jest.mock("../../repositories/db", () => ({
  saveArticlesToDB: jest.fn(async () => []),
  getDBArticles: jest.fn(async () => []),
  getLatestArticleTimestamp: jest.fn(async () => null),
  NEWS_FRESHNESS_WINDOW_MS: 30 * 60 * 1000,
}));

import { getTopHeadlines } from "./topHeadlines";

const KEY = "pub_r102b_test_key";
const env = { ...process.env };
let calls: [string, RequestInit][];

beforeEach(() => {
  process.env.NEWSDATA_API_KEY = KEY;
  calls = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push([String(url), init ?? {}]);
    return { ok: true, status: 200, json: async () => ({ status: "success", results: [] }) };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  process.env = { ...env };
});

test.each([
  ["a search", "category=tech&q=election"],
  ["a stale database", "category=business&language=en"],
])("%s: one NewsData request, cached for 15 minutes, the key in the header and not the URL", async (_case, params) => {
  const result = await getTopHeadlines(new URLSearchParams(params));
  expect(result.source).toBe("newsdata");
  expect(calls).toHaveLength(1);
  const [url, init] = calls[0];
  expect(url).toMatch(/^https:\/\/newsdata\.io\/api\/1\/latest\?/);
  expect(url).not.toContain("apikey");
  expect(url).not.toContain(KEY);
  expect(init).toEqual({ next: { revalidate: 900 }, headers: { "X-ACCESS-KEY": KEY } });
});
