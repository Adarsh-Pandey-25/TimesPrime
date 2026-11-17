/**
 * @jest-environment node
 *
 * The article page (B-05, Phase B; F-005; R2). It shows a stored outside story with a safe http(s)
 * link, found by the article_id its address ends with (/article/{headline-slug}-{id}). An old
 * address, /article/<anything>?url=<link>, finds it by the exact link and redirects to the new one.
 * Anything else is the not-found page. It never fetches the publisher's page (the scraper is gone)
 * and carries noindex. The view is stubbed to capture its props, and `fetch` records every HTTP
 * request the page makes.
 */

jest.mock("@timesprime/server/services/news", () => ({ findKnownArticle: jest.fn(), findKnownArticleById: jest.fn() }));
jest.mock("@timesprime/server/services/news/topHeadlines", () => ({
  getTopHeadlines: jest.fn(async () => ({ body: { results: [] }, source: "cache", status: 200 })),
}));
jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/article/ArticleDetailView", () => ({ __esModule: true, default: jest.fn(() => null) }));

import { renderToStaticMarkup } from "react-dom/server";
import type { Article } from "@timesprime/shared/types";
import { storyPath } from "@timesprime/shared/lib/storyUrl";
import ArticlePage, { generateMetadata } from "./page";

const { findKnownArticle, findKnownArticleById } = jest.requireMock("@timesprime/server/services/news") as {
  findKnownArticle: jest.Mock;
  findKnownArticleById: jest.Mock;
};
const View = (jest.requireMock("@/components/article/ArticleDetailView") as { default: jest.Mock }).default;

const PROBE = "https://evil.example.com/phish";
const KNOWN = "https://publisher.example/2026/11/budget-passes";
const ID = "3f9a0c21b7d44e0e9a6b5c4d3e2f1a0b";
const STORY: Article = {
  article_id: ID,
  title: "Budget passes",
  link: KNOWN,
  description: "The lower house voted.",
  source_name: "Publisher Example",
  pubDate: "2026-11-16 06:00:00",
};
const HERE = `budget-passes-${ID}`;
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const redirectTo = (path: string) => ({ digest: expect.stringContaining(`;${path};308;`) });
let requests: string[];

beforeEach(() => {
  requests = [];
  View.mockClear();
  findKnownArticle.mockReset();
  findKnownArticle.mockImplementation(async (link: string) => (link === KNOWN ? STORY : null));
  findKnownArticleById.mockReset();
  findKnownArticleById.mockImplementation(async (id: string) => (id === ID ? STORY : null));
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

const props = (slug: string, searchParams: { url?: string } = {}) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(searchParams),
});

async function render(slug: string, searchParams: { url?: string } = {}) {
  renderToStaticMarkup(await ArticlePage(props(slug, searchParams)));
  return View.mock.calls[0][0] as { story: Article };
}

describe("a stored story is shown at its address", () => {
  test("the view gets the stored story, found by its id; the page fetches nothing from the publisher", async () => {
    expect((await render(HERE)).story).toEqual(STORY);
    expect(findKnownArticleById).toHaveBeenCalledWith(ID);
    expect(findKnownArticle).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  test("its metadata: headline and summary, noindex but follow, canonical and og:url its own address", async () => {
    const metadata = await generateMetadata(props(HERE));
    expect(metadata.title).toBe("Budget passes");
    expect(metadata.description).toBe("The lower house voted.");
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe(`/article/${HERE}`);
    expect(metadata.openGraph?.url).toBe(`https://timesprime247.com/article/${HERE}`);
  });

  // F-022: the root layout's title.template adds the suffix, so the page must not.
  test("the title is bare, so the layout adds ' | TimesPrime News' once; openGraph keeps the brand", async () => {
    const metadata = await generateMetadata(props(HERE));
    expect(metadata.title).toBe("Budget passes");
    expect(metadata.openGraph?.title).toBe("Budget passes | TimesPrime News");
  });
});

describe("other addresses of a stored story redirect (308) to its address", () => {
  test("an out-of-date headline slug", async () => {
    await expect(ArticlePage(props(`an-old-headline-${ID}`))).rejects.toMatchObject(redirectTo(`/article/${HERE}`));
  });

  test("the bare id", async () => {
    await expect(ArticlePage(props(ID))).rejects.toMatchObject(redirectTo(`/article/${HERE}`));
  });

  test("an old ?url= address, found by its exact link", async () => {
    await expect(ArticlePage(props("anything", { url: KNOWN }))).rejects.toMatchObject(redirectTo(`/article/${HERE}`));
    expect(findKnownArticle).toHaveBeenCalledWith(KNOWN);
    expect(View).not.toHaveBeenCalled();
  });
});

test("a story whose id the new address cannot carry is shown at its old address", async () => {
  const odd = { ...STORY, article_id: KNOWN };
  findKnownArticle.mockImplementation(async (link: string) => (link === KNOWN ? odd : null));
  expect(storyPath(odd)).toBe(`/article/story?url=${encodeURIComponent(KNOWN)}`);
  expect((await render("story", { url: KNOWN })).story).toEqual(odd);
  const metadata = await generateMetadata(props("story", { url: KNOWN }));
  expect(metadata.alternates?.canonical).toBe(storyPath(odd));
});

describe("anything else is the not-found page (F-005, BL-042)", () => {
  test.each([
    ["an unknown id", "budget-passes-0000000000000000"],
    ["no id at all", "budget-passes"],
    ["an empty segment", ""],
  ])("%s", async (_label, slug) => {
    await expect(ArticlePage(props(slug))).rejects.toMatchObject(NOT_FOUND);
    expect(View).not.toHaveBeenCalled();
  });

  test.each([
    ["a probe URL", PROBE],
    ["a malformed url", "not a url"],
    ["an internal url", "http://127.0.0.1/admin"],
    ["javascript:", "javascript:alert(1)"],
  ])("an old address with %s", async (_label, url) => {
    await expect(ArticlePage(props("anything", { url }))).rejects.toMatchObject(NOT_FOUND);
    expect(View).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  test("its metadata never repeats the query string's URL, and stays noindex", async () => {
    const metadata = await generateMetadata(props("anything", { url: PROBE }));
    expect(JSON.stringify(metadata)).not.toContain("evil.example.com");
    expect(metadata.title).toBe("Story not found");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  // Stored rows can carry `#` as their link (it is why the link index is not UNIQUE), so `#`
  // matches a stored row. It is not an http(s) URL, so the safe-link check refuses it.
  test("a stored '#' link matches a row but is still not shown", async () => {
    findKnownArticle.mockImplementation(async (link: string) => (link === "#" ? { ...STORY, link: "#" } : null));
    await expect(ArticlePage(props("anything", { url: "#" }))).rejects.toMatchObject(NOT_FOUND);
    expect(findKnownArticle).toHaveBeenCalledWith("#");
  });
});

// The owner's condition: match exactly, and normalise nothing. A story the new address cannot
// carry is linked as ?url=<the stored link>; Next parses the query string as URLSearchParams does.
describe("an old-style link reaches the lookup exactly as stored", () => {
  test.each([
    "https://publisher.example/story",
    "https://publisher.example/story/",
    "https://Publisher.example/Story?id=42&utm_source=x&b=1",
    "https://publisher.example/a+b%20c?q=a+b&r=%E2%82%AC",
    "https://publisher.example/हिंदी-समाचार/123",
    "https://publisher.example/story#section",
  ])("%s", async (link) => {
    const odd = { ...STORY, article_id: link, link };
    findKnownArticle.mockImplementation(async (l: string) => (l === link ? odd : null));
    const href = storyPath(odd);
    const url = new URLSearchParams(href.split("?")[1]).get("url") ?? undefined;
    await render("story", { url });
    expect(findKnownArticle).toHaveBeenCalledWith(link);
  });
});
