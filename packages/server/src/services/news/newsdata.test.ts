/**
 * @jest-environment node
 *
 * R1-02b: the NewsData API key travels in the X-ACCESS-KEY header, never in a URL, so no fetch
 * cache entry (which stores its request URL) can hold it. Every caller is checked: the worker's
 * fetchNewsDataArticles here and the back office's seed route in its own test (readers no longer
 * call NewsData at all, R1-12); and no source file may put it in a URL again.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { buildNewsDataUrl, fetchNewsDataArticles, NEWSDATA_LATEST_URL, newsDataInit } from "./newsdata";

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

/** The one request made: its URL has no key in any form, and the header carries it. */
function expectHeaderAuth(expectedInit: Record<string, unknown>) {
  expect(calls).toHaveLength(1);
  const [url, init] = calls[0];
  expect(url.startsWith(NEWSDATA_LATEST_URL)).toBe(true);
  expect(url).not.toContain("apikey");
  expect(url).not.toContain(KEY);
  expect(init).toEqual({ ...expectedInit, headers: { "X-ACCESS-KEY": KEY } });
}

test("newsDataInit puts the key in the X-ACCESS-KEY header and keeps the other options", () => {
  expect(newsDataInit(KEY, { cache: "no-store" })).toEqual({ cache: "no-store", headers: { "X-ACCESS-KEY": KEY } });
});

test("buildNewsDataUrl never holds the key", () => {
  const url = buildNewsDataUrl({ categoryParam: "tech", language: "en", query: "election" });
  expect(url.toString()).not.toContain("apikey");
  expect(url.searchParams.get("q")).toBe("election");
});

// R12-05: several categories in one call (NewsData's /latest takes up to 5, comma-separated, and
// up to 50 articles a page on paid plans; one call costs one credit: newsdata.io/openapi.json).
describe("several categories in one call", () => {
  test("they go in one category parameter, with the country, language and page size given", () => {
    const url = buildNewsDataUrl({ categories: ["top", "world", "technology"], language: "en", country: "us", size: 50 });
    expect(url.searchParams.get("category")).toBe("top,world,technology");
    expect(url.searchParams.get("country")).toBe("us");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("size")).toBe("50");
    expect(url.toString()).not.toContain("apikey");
  });

  test("a Hindi call stays on India's Hindi feed", () => {
    const url = buildNewsDataUrl({ categories: ["entertainment"], language: "hi", country: "in", size: 50 });
    expect(url.searchParams.get("language")).toBe("hi");
    expect(url.searchParams.get("country")).toBe("in");
    expect(url.searchParams.get("category")).toBe("entertainment");
  });

  test.each([[[]], [["a", "b", "c", "d", "e", "f"]]])("an empty list or more than 5 is refused (%j)", (categories) => {
    expect(() => buildNewsDataUrl({ categories, language: "en" })).toThrow(/1 to 5 categories/);
  });

  test("an article without its own category or country takes the call's first category and its country", async () => {
    (global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ article_id: "a1", title: "T", link: "https://p.example/a" }] }),
    }));
    const [article] = await fetchNewsDataArticles(KEY, { categories: ["entertainment", "top"], language: "en", country: "in", size: 50 });
    expect(article.category).toEqual(["entertainment"]);
    expect(article.country).toEqual(["in"]);
  });

  test("without a size, NewsData's own page size applies (no size parameter)", () => {
    expect(buildNewsDataUrl({ categories: ["top"], language: "en" }).searchParams.has("size")).toBe(false);
  });
});

test("the worker's fetch: no-store, the key in the header", async () => {
  await fetchNewsDataArticles(KEY, { categoryParam: "business", language: "en" });
  expectHeaderAuth({ cache: "no-store" });
});

test("no source file puts the NewsData key in a URL", () => {
  const root = path.resolve(__dirname, "../../../../..");
  const files = execSync("git ls-files apps packages", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.tsx?$/.test(f));
  const offenders = files.filter((f) => /[?&]apikey=|searchParams\.set\(\s*["']apikey["']/.test(fs.readFileSync(path.join(root, f), "utf8")));
  expect(offenders).toEqual([]);
});
