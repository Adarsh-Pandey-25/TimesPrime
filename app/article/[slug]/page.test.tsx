/**
 * @jest-environment node
 *
 * The article page's `?url=` (F-005). Anyone can put any URL there, and the
 * page used to trust it: it linked to it under the TimesPrime brand, put it
 * in og:url, and had the scraper fetch it. Now only a URL that names a known
 * article is used; anything else is treated as absent. The view is stubbed to
 * capture its props, `fetch` records every HTTP request the page makes, and
 * the scraper (called directly since BL-016) is mocked.
 */

jest.mock("@/backend/services/news", () => ({ findKnownArticle: jest.fn() }));
jest.mock("@/frontend/features/news", () => ({ Header: () => null, Footer: () => null }));
jest.mock("@/frontend/views/article/ArticleDetailView", () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock("@/backend/services/scrape/scrapeArticle", () => ({ scrapeArticle: jest.fn() }));

import { renderToStaticMarkup } from "react-dom/server";
import ArticlePage, { generateMetadata } from "./page";

const { findKnownArticle } = jest.requireMock("@/backend/services/news") as { findKnownArticle: jest.Mock };
const View = (jest.requireMock("@/frontend/views/article/ArticleDetailView") as { default: jest.Mock }).default;
const { scrapeArticle } = jest.requireMock("@/backend/services/scrape/scrapeArticle") as { scrapeArticle: jest.Mock };

const PROBE = "https://evil.example.com/phish";
const KNOWN = "https://publisher.example/2026/11/budget-passes";
let requests: string[];

beforeEach(() => {
  requests = [];
  View.mockClear();
  scrapeArticle.mockReset();
  scrapeArticle.mockResolvedValue({ status: 200, body: { title: "Scraped", content: ["text"] } });
  findKnownArticle.mockReset();
  findKnownArticle.mockImplementation(async (link: string) => (link === KNOWN ? { title: "Budget passes", link: KNOWN } : null));
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ title: "Scraped", content: ["text"], results: [] }), { status: 200 });
  }) as typeof fetch;
});

const props = (searchParams: { url?: string; image?: string }, slug = "budget-passes") => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(searchParams),
});

async function render(searchParams: { url?: string }) {
  renderToStaticMarkup(await ArticlePage(props(searchParams)));
  return View.mock.calls[0][0] as { targetUrl?: string; scrapedData: { title?: string } };
}

describe("the probe URL is treated as absent (F-005)", () => {
  test("no publisher link reaches the view", async () => {
    expect((await render({ url: PROBE })).targetUrl).toBeUndefined();
  });

  test("the scraper is never asked for it: no outbound request carries it", async () => {
    await render({ url: PROBE });
    expect(scrapeArticle).not.toHaveBeenCalled();
    expect(requests.some((r) => r.includes("scrape-article"))).toBe(false);
    expect(requests.some((r) => r.includes(encodeURIComponent(PROBE)) || r.includes(PROBE))).toBe(false);
  });

  test("its title is not shown: the page falls back to its no-URL overview", async () => {
    expect((await render({ url: PROBE })).scrapedData.title).toBe("Story Overview");
  });

  test("og:url is the page's own URL, never the query string's", async () => {
    const metadata = await generateMetadata(props({ url: PROBE }));
    expect(JSON.stringify(metadata)).not.toContain("evil.example.com");
    expect(metadata.openGraph?.url).toBe("https://timesprimenews.com/article/budget-passes");
  });

  test.each(["javascript:alert(1)", "http://127.0.0.1/admin", "not a url"])("a malformed or internal url (%s) is absent too", async (url) => {
    expect((await render({ url })).targetUrl).toBeUndefined();
  });
});

describe("a known article still works", () => {
  test("its link reaches the view and the scraper", async () => {
    expect((await render({ url: KNOWN })).targetUrl).toBe(KNOWN);
    expect(scrapeArticle).toHaveBeenCalledWith(KNOWN);
    // BL-016: directly, not over this app's own HTTP route.
    expect(requests.some((r) => r.includes("scrape-article"))).toBe(false);
  });
});

// The owner's condition: match exactly, and normalise nothing unless the app's
// own links fail to match. Every link builder writes `?url=${encodeURIComponent(link)}`
// with the stored link; Next parses the query string as URLSearchParams does.
describe("the app's own links reach the lookup exactly as stored", () => {
  test.each([
    "https://publisher.example/story",
    "https://publisher.example/story/",
    "https://Publisher.example/Story?id=42&utm_source=x&b=1",
    "https://publisher.example/a+b%20c?q=a+b&r=%E2%82%AC",
    "https://publisher.example/हिंदी-समाचार/123",
    "https://publisher.example/story#section",
  ])("%s", async (link) => {
    const href = `/article/slug?url=${encodeURIComponent(link)}`;
    const url = new URLSearchParams(href.split("?")[1]).get("url") ?? undefined;
    await render({ url });
    expect(findKnownArticle).toHaveBeenCalledWith(link);
  });
});

// BL-016 characterization: what the view receives for each scraper outcome.
// Written while the page reached the scraper over HTTP (3d8b5ed); the
// expectations are unchanged now that it calls the backend directly. Only the
// way an outcome is staged moved, from fetch to the scrapeArticle mock.
describe("the page's scrape behaviour (characterization, BL-016)", () => {
  const FALLBACK = {
    title: "Full Story Coverage",
    content: ["Full article coverage details for this report are available directly on the official publisher website below."],
  };

  function scraperAnswers(outcome: { status: number; body: object } | Error) {
    if (outcome instanceof Error) scrapeArticle.mockRejectedValue(outcome);
    else scrapeArticle.mockResolvedValue(outcome);
  }

  test("a successful scrape reaches the view exactly as the scraper returned it", async () => {
    const body = { url: KNOWN, title: "Budget passes", content: ["p1", "p2"], text: "p1\n\np2", isPaywalled: false };
    scraperAnswers({ status: 200, body });
    expect((await render({ url: KNOWN })).scrapedData).toEqual(body);
  });

  test("a paywalled answer reaches the view as returned", async () => {
    const body = { url: KNOWN, title: "Locked", content: [], text: "", isPaywalled: true, description: "d", image: "" };
    scraperAnswers({ status: 200, body });
    expect((await render({ url: KNOWN })).scrapedData).toEqual(body);
  });

  test.each([
    ["an error status", { status: 500, body: { error: "boom" } }],
    ["a refusal", { status: 400, body: { error: "Invalid target URL" } }],
    ["a network failure", new Error("ECONNREFUSED")],
  ])("%s gives the view the fallback text", async (_label, outcome) => {
    scraperAnswers(outcome as { status: number; body: object } | Error);
    expect((await render({ url: KNOWN })).scrapedData).toEqual(FALLBACK);
  });

  test("no url gives the overview, and no scrape", async () => {
    scraperAnswers({ status: 200, body: {} });
    const { scrapedData } = await render({});
    expect(scrapedData).toEqual({
      title: "Story Overview",
      content: ["Full coverage details for this article are presented below. Click the external publisher link to read directly on the source website."],
    });
    expect(scrapeArticle).not.toHaveBeenCalled();
  });
});
