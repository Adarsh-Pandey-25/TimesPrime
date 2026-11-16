/**
 * @jest-environment node
 *
 * The feed's read path (R1-12, approved by the owner's senior on 16 Nov 2026): readers read the
 * database only. The worker's refresh-news job is the one thing that calls NewsData and writes
 * the articles table; a reader request never does either, whether it is a plain feed, a search, a
 * stale database or an empty one.
 */

const mockAfter = jest.fn();
jest.mock("next/server", () => ({ after: (fn: () => void) => mockAfter(fn) }));
const mockCache = { get: jest.fn(), set: jest.fn() };
jest.mock("../../lib/cache", () => ({
  cache: { get: (...a: unknown[]) => mockCache.get(...a), set: (...a: unknown[]) => mockCache.set(...a) },
  CACHE_TTL_NEWS_SECONDS: 900,
}));
const mockReport = jest.fn();
jest.mock("../health/health", () => ({ reportSupabaseFallback: (ctx: unknown) => mockReport(ctx) }));
const mockDb = {
  saveArticlesToDB: jest.fn(async () => []),
  getDBArticles: jest.fn(),
  getLatestArticleTimestamp: jest.fn(async () => null),
};
jest.mock("../../repositories/db", () => ({
  saveArticlesToDB: (...a: unknown[]) => mockDb.saveArticlesToDB(...(a as [])),
  getDBArticles: (...a: unknown[]) => mockDb.getDBArticles(...a),
  getLatestArticleTimestamp: (...a: unknown[]) => mockDb.getLatestArticleTimestamp(...(a as [])),
}));

import type { Article } from "@timesprime/shared/types";
import { getTopHeadlines } from "./topHeadlines";

const story = (title: string): Article => ({
  article_id: title,
  title,
  link: `https://publisher.example/${encodeURIComponent(title)}`,
  pubDate: "2026-11-16 06:00:00",
  description: "",
  source_id: "example",
  language: "en",
  category: ["business"],
  country: ["in"],
});

const env = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  mockCache.get.mockResolvedValue(null);
  mockDb.getDBArticles.mockResolvedValue([story("Budget passes")]);
  process.env.NEWSDATA_API_KEY = "pub_r112_test_key";
  global.fetch = jest.fn(async () => {
    throw new Error("a reader request must not reach NewsData");
  }) as unknown as typeof fetch;
});

afterEach(() => {
  process.env = { ...env };
});

test.each([
  ["a plain feed", "category=business&language=en"],
  ["a search", "category=tech&q=election"],
  ["a Hindi feed", "category=general&language=hi"],
  ["a refresh", "category=business&refresh=true"],
])("%s is answered from the database: no NewsData call, no write", async (_case, params) => {
  const result = await getTopHeadlines(new URLSearchParams(params));
  expect(result).toMatchObject({ source: "supabase", status: 200 });
  expect(result.body.results).toEqual([story("Budget passes")]);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(mockDb.saveArticlesToDB).not.toHaveBeenCalled();
});

test("the category alias is mapped, and the search and language reach the database query", async () => {
  await getTopHeadlines(new URLSearchParams("category=tech&language=hi&q=  Election  "));
  expect(mockDb.getDBArticles).toHaveBeenCalledWith("technology", "Election", "hi");
});

test("however old the newest row is, the database answers: stale beats nothing", async () => {
  mockDb.getLatestArticleTimestamp.mockResolvedValue("2026-01-01T00:00:00Z" as never);
  const result = await getTopHeadlines(new URLSearchParams("category=business"));
  expect(result.source).toBe("supabase");
  expect(global.fetch).not.toHaveBeenCalled();
});

test("a cached answer is served as is", async () => {
  mockCache.get.mockResolvedValue({ status: "success", results: [story("Cached")] });
  const result = await getTopHeadlines(new URLSearchParams("category=business"));
  expect(result).toMatchObject({ source: "cache", status: 200, body: { cached: true } });
  expect(mockDb.getDBArticles).not.toHaveBeenCalled();
});

test("duplicate headlines are shown once, and the answer is cached for 15 minutes", async () => {
  mockDb.getDBArticles.mockResolvedValue([story("Budget passes"), { ...story("Budget passes"), article_id: "copy" }]);
  const result = await getTopHeadlines(new URLSearchParams("category=business"));
  expect(result.body.results).toHaveLength(1);
  expect(mockCache.set).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ totalResults: 1 }), 900);
});

test("an empty database is an empty feed (no mock articles), not cached, and checked against Supabase's health", async () => {
  mockDb.getDBArticles.mockResolvedValue([]);
  const result = await getTopHeadlines(new URLSearchParams("category=science&language=en"));
  expect(result).toMatchObject({ source: "supabase", status: 200 });
  expect(result.body.results).toEqual([]);
  expect(mockCache.set).not.toHaveBeenCalled();
  // After the response: reportSupabaseFallback reports only if Supabase is actually down (D5).
  expect(mockAfter).toHaveBeenCalledTimes(1);
  mockAfter.mock.calls[0][0]();
  expect(mockReport).toHaveBeenCalledWith({ category: "science", language: "en" });
});

test("an unexpected error is a 500 with an empty feed", async () => {
  mockDb.getDBArticles.mockRejectedValue(new Error("boom"));
  jest.spyOn(console, "error").mockImplementation(() => {});
  const result = await getTopHeadlines(new URLSearchParams("category=business"));
  expect(result.status).toBe(500);
  expect(result.body.results).toEqual([]);
});
