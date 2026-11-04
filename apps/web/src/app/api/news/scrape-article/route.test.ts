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
// The stored articles, for the public route's check: anything on publisher.example.
jest.mock("@timesprime/server/services/news", () => ({
  findKnownArticle: jest.fn(async (link: string | null | undefined) =>
    link && /^https?:\/\/publisher\.example\//.test(link) ? { title: "Stored", link } : null
  ),
}));
jest.mock("@timesprime/server/lib/cache", () => ({
  cache: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()) },
  CACHE_TTL_SCRAPE_SECONDS: 60,
}));
jest.mock("@timesprime/server/lib/supabase", () => ({ supabase: { from: jest.fn() }, isSupabaseConfigured: jest.fn(() => false) }));
jest.mock("dns/promises", () => {
  const lookup = jest.fn();
  return { __esModule: true, default: { lookup }, lookup };
});
jest.mock("axios", () => {
  const get = jest.fn();
  return { __esModule: true, default: { get, isAxiosError: (e: { isAxiosError?: boolean }) => !!e?.isAxiosError } };
});

import { NextRequest } from "next/server";
import { GET } from "./route";

const axios = (jest.requireMock("axios") as { default: { get: jest.Mock } }).default;
const { lookup } = jest.requireMock("dns/promises") as { lookup: jest.Mock };

const DNS: Record<string, string> = {
  "publisher.example": "93.184.216.34",
  "www.publisher.example": "93.184.216.35",
  "cdn.publisher.example": "93.184.216.36",
  "www.public.example": "93.184.216.40",
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
    expect(res.status).toBe(403); // not a stored article (it was 400 from the guard before that check)
    expect(requested).toEqual([]);
  });
});

// The public route scraped any public URL, so the server could be used as a
// proxy to fetch arbitrary sites. It now scrapes only stored articles, with
// the same lookup as the article page (F-005).
describe("GET /api/news/scrape-article — stored articles only", () => {
  test.each([
    ["the F-005 probe", "https://evil.example.com/phish"],
    ["an arbitrary public site", "https://www.public.example/anything"],
  ])("%s is refused with 403, without any outbound request", async (_label, url) => {
    web[url] = { status: 200, body: ARTICLE };
    const res = await scrape(url);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/stored article/i);
    expect(requested).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });

  test("a stored article still scrapes", async () => {
    web["https://publisher.example/story"] = { status: 200, body: ARTICLE };
    const res = await scrape("https://publisher.example/story");
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Budget passes");
  });
});

// Stored rows can carry `#` as their link, so `#` passes the stored-article
// check. The URL guard still refuses it before the cache, the limiter or any
// fetch: a cached answer for `#` would be some other article's content.
describe("GET /api/news/scrape-article — a '#' link", () => {
  const { findKnownArticle } = jest.requireMock("@timesprime/server/services/news") as { findKnownArticle: jest.Mock };
  const { cache } = jest.requireMock("@timesprime/server/lib/cache") as { cache: { get: jest.Mock } };
  const get = (query: string) => GET(new NextRequest(`http://localhost:3000/api/news/scrape-article${query}`));

  beforeEach(() => {
    findKnownArticle.mockImplementation(async (link: string) =>
      link === "#" || /^https?:\/\/publisher\.example\//.test(link) ? { title: "Stored", link } : null
    );
    cache.get.mockClear();
  });

  test("?url=# carries no url (the fragment never reaches the server): 400, nothing looked up", async () => {
    const res = await get("?url=#");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required query parameter: url" });
    expect(findKnownArticle).not.toHaveBeenCalledWith("#");
  });

  test("?url=%23 matches a stored row, and is still refused with 400: no cache read, no DNS, no fetch", async () => {
    findKnownArticle.mockClear();
    const res = await get("?url=%23");
    expect(findKnownArticle).toHaveBeenCalledWith("#");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^Invalid target URL/);
    expect(cache.get).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
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
  const cacheMock = (jest.requireMock("@timesprime/server/lib/cache") as { cache: { get: jest.Mock } }).cache;

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

// BL-016 characterization: the public route's response shapes. Pinned before
// the scrape logic moves into packages/server/src/services/scrape; they must not change.
describe("GET /api/news/scrape-article — response shapes (characterization, BL-016)", () => {
  const cacheMock = (jest.requireMock("@timesprime/server/lib/cache") as { cache: { get: jest.Mock; set: jest.Mock } }).cache;
  afterEach(() => cacheMock.get.mockResolvedValue(null));

  test("an extracted article", async () => {
    web["https://publisher.example/story"] = { status: 200, body: ARTICLE };
    const body = await (await scrape("https://publisher.example/story")).json();
    expect(Object.keys(body).sort()).toEqual(["content", "isPaywalled", "text", "title", "url"]);
    expect(body).toMatchObject({ url: "https://publisher.example/story", title: "Budget passes", isPaywalled: false });
    expect(body.text).toBe(body.content.join("\n\n"));
  });

  test("a cached answer", async () => {
    cacheMock.get.mockResolvedValue({ title: "Cached", content: ["c"], text: "c", description: "d", image: "i" });
    const res = await scrape("https://publisher.example/story");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://publisher.example/story", title: "Cached", content: ["c"], text: "c",
      isPaywalled: false, description: "d", image: "i", cached: true,
    });
  });

  test("a paywalled page", async () => {
    web["https://publisher.example/locked"] = {
      status: 200,
      body: '<html><head><meta name="access" content="paid"><meta property="og:title" content="Locked story"></head><body></body></html>',
    };
    const res = await scrape("https://publisher.example/locked");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://publisher.example/locked", title: "Locked story", content: [], text: "",
      isPaywalled: true, description: "", image: "",
    });
  });

  // F-017: a failure used to be 200 with placeholder prose, which the UI
  // recognised by its wording. It is now a failure status with an error.
  test("a failed fetch: 502 with an error, and nothing cached", async () => {
    web["https://publisher.example/broken"] = { status: 500 };
    cacheMock.set.mockClear();
    const res = await scrape("https://publisher.example/broken");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "The publisher's page could not be read." });
    expect(cacheMock.set).not.toHaveBeenCalled();
  });

  test("a publisher that times out: 504 with an error", async () => {
    axios.get.mockRejectedValueOnce(Object.assign(new Error("timeout of 2500ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
    const res = await scrape("https://publisher.example/slow");
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "The publisher's page took too long to answer." });
  });

  test("a page with nothing to extract: 200 with empty content, no placeholder, and no database write", async () => {
    const { supabase, isSupabaseConfigured } = jest.requireMock("@timesprime/server/lib/supabase") as {
      supabase: { from: jest.Mock };
      isSupabaseConfigured: jest.Mock;
    };
    isSupabaseConfigured.mockReturnValueOnce(true);
    supabase.from.mockClear();
    web["https://publisher.example/empty"] = { status: 200, body: "<html><head><title>Empty</title></head><body><div>Menu</div></body></html>" };
    const res = await scrape("https://publisher.example/empty");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://publisher.example/empty", title: "Empty", content: [], text: "", isPaywalled: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test("answers are cached under the v2 key, so entries holding the old placeholder are never read", async () => {
    cacheMock.get.mockClear();
    web["https://publisher.example/story"] = { status: 200, body: ARTICLE };
    await scrape("https://publisher.example/story");
    expect(cacheMock.get).toHaveBeenCalledWith("scrape:v2:https://publisher.example/story");
  });

  test("a missing url: 400", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/news/scrape-article"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required query parameter: url" });
  });
});
