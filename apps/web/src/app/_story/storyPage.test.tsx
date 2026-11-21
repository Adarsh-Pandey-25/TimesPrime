/**
 * @jest-environment node
 *
 * A Desk story's page (Panel 2 design §6), in English at /{section}/{slug}-{number} and in Hindi at
 * /hi/{section}/{slug}-{number}: the published story at its own address, a 308 to it from any other
 * address of the same story, and a real 404 for anything not live. The store is mocked; whether a
 * story is live is the store's decision (repositories/stories.test.ts).
 */

jest.mock("@timesprime/server/repositories/stories", () => ({ getPublishedStory: jest.fn() }));
jest.mock("@timesprime/server/repositories/corrections", () => ({ publicCorrections: jest.fn() }));
jest.mock("@timesprime/server/lib/reportFallback", () => ({ reportFallback: jest.fn() }));
// The published revision's images (design §7); none unless a test gives some.
jest.mock("@timesprime/server/services/desk/storyImages", () => ({ publishedImages: jest.fn(async () => ({})), bylinePhotos: jest.fn(async () => ({})) }));
jest.mock("@timesprime/server/services/news/topHeadlines", () => ({
  getTopHeadlines: jest.fn(async () => ({ body: { results: [] }, source: "cache", status: 200 })),
}));
// Panel 3, M3: a live blog's feed; none unless a test gives one. The page's check for new updates is
// browser code (live.test.tsx), drawn here as a marker.
jest.mock("@timesprime/server/services/front/live", () => ({ liveFeed: jest.fn() }));
jest.mock("@/components/live/LiveWatcher", () => ({ __esModule: true, default: () => "[watcher]" }));
jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import type { PublishedStory } from "@timesprime/shared/types";
import EnglishStoryPage, * as english from "../[section]/[story]/page";
import HindiStoryPage, * as hindi from "../hi/[section]/[story]/page";

const { getPublishedStory } = jest.requireMock("@timesprime/server/repositories/stories") as { getPublishedStory: jest.Mock };
const { liveFeed } = jest.requireMock("@timesprime/server/services/front/live") as { liveFeed: jest.Mock };
const { publicCorrections } = jest.requireMock("@timesprime/server/repositories/corrections") as { publicCorrections: jest.Mock };

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

describe("a live blog (Panel 3, M3)", () => {
  const LIVE = story({ public_id: 55, format: "live_blog", slug: "results-live", live_ended_at: null });
  const FEED = {
    endedAt: null,
    updates: [
      { id: "u-2", headline: "Counting begins", blocks: [{ kind: "p", runs: [{ text: "Postal ballots first." }] }], keyEvent: true, pinned: false, postedAt: "2026-11-20T09:00:00Z", editedAt: null, time: "20 Nov, 2:30 pm IST" },
      { id: "u-1", headline: null, blocks: [{ kind: "p", runs: [{ text: "Polls closed." }] }], keyEvent: false, pinned: false, postedAt: "2026-11-20T08:00:00Z", editedAt: null, time: "20 Nov, 1:30 pm IST" },
    ],
  };
  beforeEach(() => {
    liveFeed.mockReset();
    getPublishedStory.mockImplementation(async (n: number) => (n === 55 ? LIVE : null));
  });

  test("the updates under the intro, newest first, with the key events as links, and the page's check for new ones", async () => {
    liveFeed.mockResolvedValue(FEED);
    const html = renderToStaticMarkup(await EnglishStoryPage(props("india", "results-live-55")));
    expect(liveFeed).toHaveBeenCalledWith(expect.objectContaining({ id: "s-1", public_id: 55 }));
    expect(html).toContain("<p>The vote was 300 to 120.</p>");
    expect(html.indexOf("Counting begins")).toBeLessThan(html.indexOf("Polls closed."));
    expect(html.indexOf("The vote was 300 to 120.")).toBeLessThan(html.indexOf("Polls closed."));
    expect(html).toContain('href="#update-u-2"');
    expect(html).toContain('id="update-u-1"');
    expect(html).toContain("[watcher]");
    expect(html).toContain(">Live<");
  });

  test("LiveBlogPosting markup: its coverage, and each update as a BlogPosting with its own address", async () => {
    liveFeed.mockResolvedValue({ ...FEED, endedAt: "2026-11-20T12:00:00Z" });
    const html = renderToStaticMarkup(await EnglishStoryPage(props("india", "results-live-55")));
    const [, json] = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html) ?? [];
    const data = JSON.parse(json);
    expect(data).toMatchObject({
      "@type": "LiveBlogPosting",
      url: "https://timesprime247.com/india/results-live-55",
      coverageStartTime: "2026-11-17T08:00:00Z",
      coverageEndTime: "2026-11-20T12:00:00Z",
      inLanguage: "en-IN",
    });
    expect(data.liveBlogUpdate).toEqual([
      expect.objectContaining({ "@type": "BlogPosting", headline: "Counting begins", articleBody: "Postal ballots first.", url: "https://timesprime247.com/india/results-live-55#update-u-2" }),
      expect.objectContaining({ headline: "Polls closed.", datePublished: "2026-11-20T08:00:00Z" }),
    ]);
    expect(html).toContain(">Ended<");
  });

  test("a feed that cannot be read leaves the intro on the page; another story reads no feed", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    liveFeed.mockRejectedValue(new Error("timeout"));
    const html = renderToStaticMarkup(await EnglishStoryPage(props("india", "results-live-55")));
    expect(html).toContain("<p>The vote was 300 to 120.</p>");
    expect(html).toContain("No updates yet.");
    liveFeed.mockClear();
    getPublishedStory.mockImplementation(async (n: number) => (n === 1024 ? story() : null));
    const plain = renderToStaticMarkup(await EnglishStoryPage(props("india", "budget-passes-1024")));
    expect(liveFeed).not.toHaveBeenCalled();
    expect(plain).not.toContain("LiveBlogPosting");
  });
});

// Panel 7, M2: a story's corrections come from the log, oldest first.
describe("a story's corrections", () => {
  const NOTE = "The vote was on Monday, not Tuesday.";
  const LOG = [
    { id: "c-2", kind: "clarification", text: NOTE, language: "en", published_at: "2026-11-19T06:00:00Z", story_live: true, headline: "Budget passes", section: "india", slug: "budget-passes", public_id: 1024 },
    { id: "c-1", kind: "correction", text: "An earlier version gave the wrong count.", language: "en", published_at: "2026-11-18T06:00:00Z", story_live: true, headline: "Budget passes", section: "india", slug: "budget-passes", public_id: 1024 },
  ];
  beforeEach(() => {
    publicCorrections.mockReset();
    getPublishedStory.mockImplementation(async () => story({ correction_note: NOTE }));
  });

  test("read for a story with a correction note, and shown oldest first", async () => {
    publicCorrections.mockResolvedValue(LOG);
    const html = renderToStaticMarkup(await EnglishStoryPage(props("india", "budget-passes-1024")));
    expect(publicCorrections).toHaveBeenCalledWith({ storyId: "s-1", limit: 100 });
    expect(html).toContain(">Corrections</h2>");
    expect(html.indexOf("wrong count")).toBeLessThan(html.indexOf("not Tuesday"));
  });

  test("not read for a story with no correction note", async () => {
    getPublishedStory.mockImplementation(async () => story());
    renderToStaticMarkup(await EnglishStoryPage(props("india", "budget-passes-1024")));
    expect(publicCorrections).not.toHaveBeenCalled();
  });

  test("before compliance-2, or when the read fails, the one note shows", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    for (const answer of [() => publicCorrections.mockResolvedValue(null), () => publicCorrections.mockRejectedValue(new Error("down"))]) {
      answer();
      const html = renderToStaticMarkup(await EnglishStoryPage(props("india", "budget-passes-1024")));
      expect(html).toContain(">Correction</h2>");
      expect(html).toContain(NOTE);
    }
  });
});
