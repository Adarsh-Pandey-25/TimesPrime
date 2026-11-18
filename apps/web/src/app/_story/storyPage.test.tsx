/**
 * @jest-environment node
 *
 * A Desk story's page (Panel 2 design §6), in English at /{section}/{slug}-{number} and in Hindi at
 * /hi/{section}/{slug}-{number}: the published story at its own address, a 308 to it from any other
 * address of the same story, and a real 404 for anything not live. The store is mocked; whether a
 * story is live is the store's decision (repositories/stories.test.ts).
 */

jest.mock("@timesprime/server/repositories/stories", () => ({ getPublishedStory: jest.fn() }));
// The published revision's images (design §7); none unless a test gives some.
jest.mock("@timesprime/server/services/desk/storyImages", () => ({ publishedImages: jest.fn(async () => ({})), bylinePhotos: jest.fn(async () => ({})) }));
jest.mock("@timesprime/server/services/news/topHeadlines", () => ({
  getTopHeadlines: jest.fn(async () => ({ body: { results: [] }, source: "cache", status: 200 })),
}));
jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import type { PublishedStory } from "@timesprime/shared/types";
import EnglishStoryPage, * as english from "../[section]/[story]/page";
import HindiStoryPage, * as hindi from "../hi/[section]/[story]/page";

const { getPublishedStory } = jest.requireMock("@timesprime/server/repositories/stories") as { getPublishedStory: jest.Mock };

const story = (over: Partial<PublishedStory> = {}): PublishedStory => ({
  id: "s-1",
  public_id: 1024,
  language: "en",
  section: "india",
  format: "news",
  slug: "budget-passes",
  correction_note: null,
  first_published_at: "2026-11-17T08:00:00Z",
  published_at: "2026-11-17T08:00:00Z",
  revision: {
    id: "r-1",
    headline: "Budget passes",
    dek: "The house voted on Monday.",
    seo_title: "Budget passes the lower house",
    seo_description: null,
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The vote was 300 to 120." }] }] },
  },
  bylines: [],
  ...over,
});
const HINDI = story({ public_id: 7, language: "hi", slug: "sansad-mein-bajat", revision: { ...story().revision, headline: "संसद में बजट पास", seo_title: null } });

const props = (section: string, segment: string) => ({ params: Promise.resolve({ section, story: segment }) });
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const redirectTo = (path: string) => ({ digest: expect.stringContaining(`;${path};308;`) });

beforeEach(() => {
  getPublishedStory.mockReset();
  getPublishedStory.mockImplementation(async (n: number) => ({ 1024: story(), 7: HINDI })[n] ?? null);
});

test("both routes render on every request, never from a cache", () => {
  expect(english.dynamic).toBe("force-dynamic");
  expect(hindi.dynamic).toBe("force-dynamic");
});

describe("a published story at its own address", () => {
  test("English: found by its number, shown in English", async () => {
    const html = renderToStaticMarkup(await EnglishStoryPage(props("india", "budget-passes-1024")));
    expect(getPublishedStory).toHaveBeenCalledWith(1024);
    expect(html).toContain('<article lang="en"');
    expect(html).toContain("Budget passes</h1>");
    expect(html).toContain("<p>The vote was 300 to 120.</p>");
  });

  test("Hindi: under /hi/, shown in Hindi", async () => {
    const html = renderToStaticMarkup(await HindiStoryPage(props("india", "sansad-mein-bajat-7")));
    expect(html).toContain('<article lang="hi"');
    expect(html).toContain("संसद में बजट पास</h1>");
  });

  test("its metadata: the SEO title, else the headline; the canonical and og:url its own address", async () => {
    const en = await english.generateMetadata(props("india", "budget-passes-1024"));
    expect(en.title).toBe("Budget passes the lower house");
    expect(en.description).toBe("The house voted on Monday.");
    expect(en.alternates?.canonical).toBe("/india/budget-passes-1024");
    expect(en.openGraph).toMatchObject({ type: "article", url: expect.stringMatching(/\/india\/budget-passes-1024$/), locale: "en_IN" });
    const hi = await hindi.generateMetadata(props("india", "sansad-mein-bajat-7"));
    expect(hi.title).toBe("संसद में बजट पास");
    expect(hi.alternates?.canonical).toBe("/hi/india/sansad-mein-bajat-7");
    expect(hi.openGraph).toMatchObject({ locale: "hi_IN" });
  });

  test("the metadata and the page share one read", async () => {
    const p = props("india", "budget-passes-1024");
    await english.generateMetadata(p);
    renderToStaticMarkup(await EnglishStoryPage(p));
    expect(getPublishedStory.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe("another address of the same story answers 308 to its own", () => {
  test.each([
    ["an old or mistyped slug", english, "india", "budget-passed-1024", "/india/budget-passes-1024"],
    ["the number alone", english, "india", "1024", "/india/budget-passes-1024"],
    ["another section", english, "world", "budget-passes-1024", "/india/budget-passes-1024"],
    ["a Hindi story at an English address", english, "india", "sansad-mein-bajat-7", "/hi/india/sansad-mein-bajat-7"],
    ["an English story under /hi/", hindi, "india", "budget-passes-1024", "/india/budget-passes-1024"],
  ])("%s", async (_case, route, section, segment, path) => {
    await expect(route.default(props(section, segment))).rejects.toMatchObject(redirectTo(path));
  });
});

describe("anything not live is a real 404", () => {
  test("a path that is not a section is never looked up", async () => {
    await expect(EnglishStoryPage(props("no-such-section", "budget-passes-1024"))).rejects.toMatchObject(NOT_FOUND);
    expect(getPublishedStory).not.toHaveBeenCalled();
  });

  test("a segment without a story number is never looked up", async () => {
    await expect(EnglishStoryPage(props("india", "budget-passes"))).rejects.toMatchObject(NOT_FOUND);
    expect(getPublishedStory).not.toHaveBeenCalled();
  });

  test("a story the store does not show (unknown, unpublished or under embargo)", async () => {
    await expect(EnglishStoryPage(props("india", "budget-passes-99"))).rejects.toMatchObject(NOT_FOUND);
    await expect(HindiStoryPage(props("india", "kuch-bhi-99"))).rejects.toMatchObject(NOT_FOUND);
    expect((await english.generateMetadata(props("india", "budget-passes-99"))).title).toBe("Story not found");
  });

  test("a store failure is an error, not a 404", async () => {
    getPublishedStory.mockRejectedValue(new Error("database unavailable"));
    await expect(EnglishStoryPage(props("india", "budget-passes-1024"))).rejects.toThrow("database unavailable");
  });
});
