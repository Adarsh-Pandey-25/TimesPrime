/**
 * @jest-environment node
 *
 * F-003: the scraper fetched with axios's defaults, which follow up to 21
 * redirects and never revalidate a hop, so a public URL that redirects to an
 * internal address defeated the SSRF guard that ran just before it.
 *
 * axios is replaced by a small model of the web: each URL answers with a
 * page or a redirect. With axios's default `maxRedirects` the model follows
 * redirects itself, exactly as axios's follow-redirects transport does
 * (without asking the guard); with `maxRedirects: 0` it returns the 3xx
 * response, as axios does. `requested` records every URL actually fetched,
 * so "never requested" means no connection was made to it.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@/backend/lib/cache", () => ({
  cache: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()) },
  CACHE_TTL_SCRAPE_SECONDS: 60,
}));
jest.mock("@/backend/lib/supabase", () => ({ supabase: { from: jest.fn() }, isSupabaseConfigured: jest.fn(() => false) }));
jest.mock("dns/promises", () => {
  const lookup = jest.fn();
  return { __esModule: true, default: { lookup }, lookup };
});
jest.mock("axios", () => {
  const get = jest.fn();
  return { __esModule: true, default: { get, isAxiosError: (e: { isAxiosError?: boolean }) => !!e?.isAxiosError } };
});

import { NextRequest } from "next/server";
import { GET } from "./scrape-article";

const axios = (jest.requireMock("axios") as { default: { get: jest.Mock } }).default;
const { lookup } = jest.requireMock("dns/promises") as { lookup: jest.Mock };

const DNS: Record<string, string> = {
  "publisher.example": "93.184.216.34",
  "www.publisher.example": "93.184.216.35",
  "cdn.publisher.example": "93.184.216.36",
};

const ARTICLE = `<html><head><title>Budget passes</title></head><body><h1>Budget passes</h1>
<p>The annual budget passed the lower house on Tuesday after a long debate about spending priorities and taxes.</p>
<p>Ministers said the measures would take effect at the start of the next financial year, subject to the upper house.</p>
</body></html>`;

type Answer = { status: number; location?: string; body?: string };
let web: Record<string, Answer>;
let requested: string[];
let configs: Array<Record<string, unknown>>;

beforeEach(() => {
  requested = [];
  configs = [];
  web = {};
  lookup.mockReset();
  lookup.mockImplementation(async (host: string) => {
    if (!DNS[host]) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return [{ address: DNS[host], family: 4 }];
  });
  axios.get.mockReset();
  axios.get.mockImplementation(async (url: string, config: Record<string, unknown> = {}) => {
    configs.push(config);
    let current = url;
    for (let hops = 0; ; hops++) {
      requested.push(current);
      const answer = web[current] ?? { status: 404, body: "" };
      if (answer.status >= 300 && answer.status < 400 && answer.location) {
        if (config.maxRedirects === 0) return { status: answer.status, headers: { location: answer.location }, data: "" };
        if (hops >= 21) throw Object.assign(new Error("Maximum number of redirects exceeded"), { isAxiosError: true });
        current = new URL(answer.location, current).href;
        continue;
      }
      if (answer.status >= 400) throw Object.assign(new Error(`Request failed with status code ${answer.status}`), { isAxiosError: true });
      return { status: answer.status, headers: {}, data: answer.body ?? "" };
    }
  });
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// Each request from its own client unless one is given, so the F-011 limit
// never trips a test that is not about it.
let ipCounter = 0;
const scrape = (url: string, ip = `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`) =>
  GET(
    new NextRequest(`http://localhost:3000/api/news/scrape-article?url=${encodeURIComponent(url)}`, {
      headers: { "x-forwarded-for": ip },
    })
  );

describe("GET /api/news/scrape-article — unchanged behaviour", () => {
  test("a public article is fetched and extracted", async () => {
    web["https://publisher.example/story"] = { status: 200, body: ARTICLE };
    const res = await scrape("https://publisher.example/story");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Budget passes");
    expect(body.content.join(" ")).toContain("annual budget passed");
  });

  test("a public redirect is still followed (http -> https, then to www)", async () => {
    web["http://publisher.example/story"] = { status: 301, location: "https://publisher.example/story" };
    web["https://publisher.example/story"] = { status: 302, location: "https://www.publisher.example/story" };
    web["https://www.publisher.example/story"] = { status: 200, body: ARTICLE };
    const res = await scrape("http://publisher.example/story");
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Budget passes");
    expect(requested).toContain("https://www.publisher.example/story");
  });

  test("an internal target URL is refused before any fetch", async () => {
    const res = await scrape("http://127.0.0.1/admin");
    expect(res.status).toBe(400);
    expect(requested).toEqual([]);
  });
});

describe("GET /api/news/scrape-article — redirects are revalidated hop by hop (F-003)", () => {
  test.each([
    ["loopback", "http://127.0.0.1/admin"],
    ["a private range", "http://10.0.0.5/internal"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["a non-http scheme", "ftp://publisher.example/file"],
    ["an IPv4-mapped loopback", "http://[::ffff:7f00:1]/"],
  ])("a redirect to %s is refused, and the target never requested", async (_label, target) => {
    web["https://publisher.example/story"] = { status: 302, location: target };
    const res = await scrape("https://publisher.example/story");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/redirect/i);
    expect(requested).not.toContain(target);
    expect(requested.some((u) => !u.startsWith("https://publisher.example"))).toBe(false);
  });

  test("a redirect loop is cut off after at most 5 hops", async () => {
    web["https://publisher.example/a"] = { status: 302, location: "https://publisher.example/b" };
    web["https://publisher.example/b"] = { status: 302, location: "https://publisher.example/a" };
    const res = await scrape("https://publisher.example/a");
    expect(res.status).toBe(400);
    expect(requested.length).toBeLessThanOrEqual(6);
  });

  test("a chain longer than 5 hops is refused even when it ends at a public page", async () => {
    for (let i = 0; i < 6; i++) web[`https://publisher.example/${i}`] = { status: 302, location: `https://publisher.example/${i + 1}` };
    web["https://publisher.example/6"] = { status: 200, body: ARTICLE };
    const res = await scrape("https://publisher.example/0");
    expect(res.status).toBe(400);
    expect(requested).not.toContain("https://publisher.example/6");
  });

  test("a chain of exactly 5 hops is followed", async () => {
    for (let i = 0; i < 5; i++) web[`https://publisher.example/${i}`] = { status: 302, location: `https://publisher.example/${i + 1}` };
    web["https://publisher.example/5"] = { status: 200, body: ARTICLE };
    const res = await scrape("https://publisher.example/0");
    expect(res.status).toBe(200);
  });

  test("each hop connects to the address that was validated: no second DNS answer, no proxy", async () => {
    web["https://publisher.example/story"] = { status: 302, location: "https://cdn.publisher.example/story" };
    web["https://cdn.publisher.example/story"] = { status: 200, body: ARTICLE };
    await scrape("https://publisher.example/story");
    expect(configs.length).toBeGreaterThan(0);
    for (const config of configs) {
      expect(config.maxRedirects).toBe(0);
      expect(config.proxy).toBe(false);
      expect(typeof config.lookup).toBe("function");
    }
    // F-010: every hop caps the response it will read, and sends no body.
    for (const config of configs) {
      expect(config.maxContentLength).toBe(5 * 1024 * 1024);
      expect(config.maxBodyLength).toBe(0);
    }
    // The second hop's pinned lookup answers with cdn's validated address, whatever name it is asked.
    const pinned = configs[1].lookup as (host: string, opts: object) => Promise<unknown>;
    await expect(pinned("anything.example", { all: true })).resolves.toEqual([[{ address: "93.184.216.36", family: 4 }]]);
  });
});

// F-011: the public scraper had no rate limit, so any client could make
// this server fetch arbitrary URLs as fast as it liked. The limit counts
// only scrapes that reach a publisher; a cached answer costs nothing.
describe("GET /api/news/scrape-article — per-IP rate limit (F-011)", () => {
  const cacheMock = (jest.requireMock("@/backend/lib/cache") as { cache: { get: jest.Mock } }).cache;

  test("30 uncached scrapes a minute are fetched; the 31st is 429 with Retry-After, and not fetched", async () => {
    web["https://publisher.example/story"] = { status: 200, body: ARTICLE };
    for (let i = 0; i < 30; i++) expect((await scrape("https://publisher.example/story", "192.0.2.50")).status).toBe(200);
    const fetchedBefore = requested.length;
    const res = await scrape("https://publisher.example/story", "192.0.2.50");
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect((await res.json()).error).toMatch(/too many/i);
    expect(requested.length).toBe(fetchedBefore);
  });

  test("cached answers are not counted", async () => {
    cacheMock.get.mockResolvedValue({ title: "Cached", content: ["c"], text: "c" });
    for (let i = 0; i < 40; i++) expect((await scrape("https://publisher.example/story", "192.0.2.51")).status).toBe(200);
    cacheMock.get.mockResolvedValue(null);
  });

  test("another client is not affected", async () => {
    web["https://publisher.example/story"] = { status: 200, body: ARTICLE };
    for (let i = 0; i < 31; i++) await scrape("https://publisher.example/story", "192.0.2.52");
    expect((await scrape("https://publisher.example/story", "192.0.2.53")).status).toBe(200);
  });
});
