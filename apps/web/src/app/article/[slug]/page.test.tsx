/**
 * @jest-environment node
 *
 * The article page (B-05, Phase B; F-005). It shows a stored outside story: the row whose link is
 * exactly the page's `?url=` and is a safe http(s) link. Anyone can put any URL there; anything
 * else is the not-found page. It never fetches the publisher's page (the scraper is gone) and
 * carries noindex. The view is stubbed to capture its props, and `fetch` records every HTTP
 * request the page makes.
 */

jest.mock("@timesprime/server/services/news", () => ({ findKnownArticle: jest.fn() }));
jest.mock("@timesprime/server/services/news/topHeadlines", () => ({
  getTopHeadlines: jest.fn(async () => ({ body: { results: [] }, source: "cache", status: 200 })),
}));
jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/article/ArticleDetailView", () => ({ __esModule: true, default: jest.fn(() => null) }));

import { renderToStaticMarkup } from "react-dom/server";
import type { Article } from "@timesprime/shared/types";
import ArticlePage, { generateMetadata } from "./page";

const { findKnownArticle } = jest.requireMock("@timesprime/server/services/news") as { findKnownArticle: jest.Mock };
const View = (jest.requireMock("@/components/article/ArticleDetailView") as { default: jest.Mock }).default;

const PROBE = "https://evil.example.com/phish";
const KNOWN = "https://publisher.example/2026/11/budget-passes";
const STORY: Article = {
  article_id: "a1",
  title: "Budget passes",
  link: KNOWN,
  description: "The lower house voted.",
  source_name: "Publisher Example",
  pubDate: "2026-11-16 06:00:00",
};
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
let requests: string[];

beforeEach(() => {
  requests = [];
  View.mockClear();
  findKnownArticle.mockReset();
  findKnownArticle.mockImplementation(async (link: string) => (link === KNOWN ? STORY : null));
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

const props = (searchParams: { url?: string }, slug = "budget-passes") => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(searchParams),
});

async function render(searchParams: { url?: string }) {
  renderToStaticMarkup(await ArticlePage(props(searchParams)));
  return View.mock.calls[0][0] as { story: Article };
}

describe("a stored story is shown", () => {
  test("the view gets the stored story, and the page fetches nothing from the publisher", async () => {
    expect((await render({ url: KNOWN })).story).toEqual(STORY);
    expect(requests).toEqual([]);
  });

  test("its metadata: the story's headline and summary, noindex but follow, og:url the page's own", async () => {
    const metadata = await generateMetadata(props({ url: KNOWN }));
    expect(metadata.title).toBe("Budget passes");
    expect(metadata.description).toBe("The lower house voted.");
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph?.url).toBe("https://timesprime247.com/article/budget-passes");
  });

  // F-022: the root layout's title.template adds the suffix, so the page must not.
  test("the title is bare, so the layout adds ' | TimesPrime News' once; openGraph keeps the brand", async () => {
    const metadata = await generateMetadata(props({ url: KNOWN }));
    expect(metadata.title).toBe("Budget passes");
    expect(metadata.openGraph?.title).toBe("Budget passes | TimesPrime News");
  });
});

describe("anything else is the not-found page (F-005)", () => {
  test.each([
    ["a probe URL", PROBE],
    ["a malformed url", "not a url"],
    ["an internal url", "http://127.0.0.1/admin"],
    ["javascript:", "javascript:alert(1)"],
    ["no url at all", undefined],
  ])("%s", async (_label, url) => {
    await expect(ArticlePage(props({ url }))).rejects.toMatchObject(NOT_FOUND);
    expect(View).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  test("its metadata never repeats the query string's URL, and stays noindex", async () => {
    const metadata = await generateMetadata(props({ url: PROBE }));
    expect(JSON.stringify(metadata)).not.toContain("evil.example.com");
    expect(metadata.title).toBe("Story not found");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  // Stored rows can carry `#` as their link (it is why the link index is not UNIQUE), so `#`
  // matches a stored row. It is not an http(s) URL, so the safe-link check refuses it.
  test("a stored '#' link matches a row but is still not shown", async () => {
    findKnownArticle.mockImplementation(async (link: string) => (link === "#" ? { ...STORY, link: "#" } : null));
    await expect(ArticlePage(props({ url: "#" }))).rejects.toMatchObject(NOT_FOUND);
    expect(findKnownArticle).toHaveBeenCalledWith("#");
  });
});

// The owner's condition: match exactly, and normalise nothing unless the app's own links fail to
// match. Every link builder writes `?url=${encodeURIComponent(link)}` with the stored link; Next
// parses the query string as URLSearchParams does.
describe("the app's own links reach the lookup exactly as stored", () => {
  test.each([
    "https://publisher.example/story",
    "https://publisher.example/story/",
    "https://Publisher.example/Story?id=42&utm_source=x&b=1",
    "https://publisher.example/a+b%20c?q=a+b&r=%E2%82%AC",
    "https://publisher.example/हिंदी-समाचार/123",
    "https://publisher.example/story#section",
  ])("%s", async (link) => {
    findKnownArticle.mockImplementation(async (l: string) => (l === link ? { ...STORY, link } : null));
    const href = `/article/slug?url=${encodeURIComponent(link)}`;
    const url = new URLSearchParams(href.split("?")[1]).get("url") ?? undefined;
    await render({ url });
    expect(findKnownArticle).toHaveBeenCalledWith(link);
  });
});
