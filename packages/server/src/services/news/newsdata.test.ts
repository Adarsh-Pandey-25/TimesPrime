/**
 * @jest-environment node
 *
 * R1-02b: the NewsData API key travels in the X-ACCESS-KEY header, never in a URL, so no fetch
 * cache entry (which stores its request URL) can hold it. Every caller is checked: the worker's
 * fetchNewsDataArticles and the home page's fetchInitialNews here, the feed in topHeadlines.test.ts,
 * the back office's seed route in its own test; and no source file may put it in a URL again.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { buildNewsDataUrl, fetchNewsDataArticles, NEWSDATA_LATEST_URL, newsDataInit } from "./newsdata";
import { fetchInitialNews } from "./fetchNews";

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

test("the worker's fetch: no-store, the key in the header", async () => {
  await fetchNewsDataArticles(KEY, { categoryParam: "business", language: "en" });
  expectHeaderAuth({ cache: "no-store" });
});

test("the home page's fetch: cached for 15 minutes, the key in the header", async () => {
  await fetchInitialNews("general", "hi", "");
  expectHeaderAuth({ next: { revalidate: 900 } });
});

test("no source file puts the NewsData key in a URL", () => {
  const root = path.resolve(__dirname, "../../../../..");
  const files = execSync("git ls-files apps packages", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.tsx?$/.test(f));
  const offenders = files.filter((f) => /[?&]apikey=|searchParams\.set\(\s*["']apikey["']/.test(fs.readFileSync(path.join(root, f), "utf8")));
  expect(offenders).toEqual([]);
});
