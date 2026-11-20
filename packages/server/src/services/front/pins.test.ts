/**
 * @jest-environment node
 *
 * The reader's pinned row (Panel 3 design §5): the live pins of a page, their published stories as
 * the row draws them, through a 60-second cache entry the back office deletes on every change.
 */

jest.mock("../../repositories/frontPage", () => ({ livePins: jest.fn() }));
jest.mock("../../repositories/stories", () => ({ getPublishedStoriesByIds: jest.fn() }));
jest.mock("../../repositories/media", () => ({ listPublishedImages: jest.fn(async () => []) }));
jest.mock("../../lib/mediaStorage", () => ({ mediaUrl: (key: string) => `/media/${key}` }));

import { cache } from "../../lib/cache";
import { forgetPins, forgetStoryPins, pinnedStories, pinsKey, PINS_TTL_SECONDS } from "./pins";

const { livePins } = jest.requireMock("../../repositories/frontPage") as { livePins: jest.Mock };
const { getPublishedStoriesByIds } = jest.requireMock("../../repositories/stories") as { getPublishedStoriesByIds: jest.Mock };
const { listPublishedImages } = jest.requireMock("../../repositories/media") as { listPublishedImages: jest.Mock };

const NOW = new Date("2026-11-20T10:00:00.000Z");
const IMAGE = "c0ffee00-0000-4000-8000-000000000001";
const story = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  public_id: 42,
  language: "en",
  section: "sports",
  format: "news",
  slug: "the-final",
  correction_note: null,
  first_published_at: "2026-11-20T04:30:00Z",
  published_at: "2026-11-20T05:00:00Z",
  revision: { id: `r-${id}`, headline: `Headline ${id}`, dek: "The dek.", seo_title: null, seo_description: null, body: { type: "doc", content: [] } },
  bylines: [
    { role: "byline", name: "Asha Rao" },
    { role: "translated_by", name: "Meera" },
  ],
  ...over,
});

let n = 0;
beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  // Each test its own page in the shared memory cache.
  n++;
});
afterEach(() => jest.restoreAllMocks());
const page = () => ({ language: "en" as const, section: (["sports", "india", "world", "tech", "business", "health", "science", "entertainment"] as const)[n % 8] });

test("a pin's story as the row draws it: its page, headline, dek, byline names and the time in IST", async () => {
  const p = page();
  livePins.mockResolvedValue([{ slot: 1, story_id: "a", until: "2026-11-21T00:00:00Z" }]);
  getPublishedStoriesByIds.mockResolvedValue([story("a", { section: p.section })]);
  expect(await pinnedStories(p, NOW)).toEqual([
    {
      slot: 1,
      path: `/${p.section}/the-final-42`,
      language: "en",
      headline: "Headline a",
      dek: "The dek.",
      bylines: ["Asha Rao"],
      time: expect.stringMatching(/20 Nov 2026, 10:00\s?am IST/i),
      image: null,
      drawing: p.section === "tech" ? "/placeholders/technology-thumb.svg" : `/placeholders/${p.section}-thumb.svg`,
      until: "2026-11-21T00:00:00Z",
    },
  ]);
});

test("a story that is not live, or not of the page any more, does not show", async () => {
  const p = page();
  livePins.mockResolvedValue([
    { slot: 1, story_id: "gone", until: "2026-11-21T00:00:00Z" },
    { slot: 2, story_id: "moved", until: "2026-11-21T00:00:00Z" },
    { slot: 3, story_id: "ok", until: "2026-11-21T00:00:00Z" },
  ]);
  getPublishedStoriesByIds.mockResolvedValue([story("moved", { section: "other" }), story("ok", { section: p.section, public_id: 7 })]);
  expect((await pinnedStories(p, NOW)).map((s) => s.slot)).toEqual([3]);
});

test("the first image's 4:3 crop, when its renditions exist", async () => {
  const p = page();
  livePins.mockResolvedValue([{ slot: 1, story_id: "a", until: "2026-11-21T00:00:00Z" }]);
  const body = { type: "doc", content: [{ type: "image", attrs: { id: IMAGE, crop: "16x9" } }] };
  getPublishedStoriesByIds.mockResolvedValue([story("a", { section: p.section, revision: { ...story("a").revision, body } })]);
  const rendition = (format: string, width: number) => ({ ratio: "4x3", format, width, height: (width * 3) / 4, key: `renditions/${IMAGE}/4x3-${width}.${format}` });
  listPublishedImages.mockResolvedValue([
    { id: IMAGE, alt_en: "The winning goal", alt_hi: null, caption_en: null, caption_hi: null, credit: "Staff", active: true, renditions: [rendition("avif", 480), rendition("webp", 480), rendition("webp", 960)] },
  ]);
  const [pinned] = await pinnedStories(p, NOW);
  expect(listPublishedImages).toHaveBeenCalledWith("r-a", [IMAGE]);
  expect(pinned.image).toEqual(expect.objectContaining({ alt: "The winning goal", src: `/media/renditions/${IMAGE}/4x3-960.webp`, width: 960, height: 720 }));
});

test("read once, then from the cache for 60 seconds; a pin that ends there leaves at once", async () => {
  const p = page();
  const set = jest.spyOn(cache, "set");
  livePins.mockResolvedValue([
    { slot: 1, story_id: "a", until: "2026-11-20T10:00:30Z" },
    { slot: 2, story_id: "b", until: "2026-11-21T00:00:00Z" },
  ]);
  getPublishedStoriesByIds.mockResolvedValue([story("a", { section: p.section }), story("b", { section: p.section, public_id: 8 })]);
  expect((await pinnedStories(p, NOW)).length).toBe(2);
  expect(set).toHaveBeenCalledWith(pinsKey(p), expect.any(Array), PINS_TTL_SECONDS);
  const later = new Date(NOW.getTime() + 40_000);
  expect((await pinnedStories(p, later)).map((s) => s.slot)).toEqual([2]);
  expect(livePins).toHaveBeenCalledTimes(1);
});

test("forgetting a page makes the next read go to the database", async () => {
  const p = page();
  livePins.mockResolvedValue([]);
  await pinnedStories(p, NOW);
  await forgetPins(p);
  await pinnedStories(p, NOW);
  expect(livePins).toHaveBeenCalledTimes(2);
});

test("an empty page is cached too: no pins, no story read", async () => {
  const p = page();
  livePins.mockResolvedValue([]);
  expect(await pinnedStories(p, NOW)).toEqual([]);
  expect(getPublishedStoriesByIds).not.toHaveBeenCalled();
});

test("each page and language has its own entry; a takedown forgets its language's home page and its section's", async () => {
  expect(pinsKey({ language: "hi", section: null })).toBe("front:pins:v1:hi:home");
  expect(pinsKey({ language: "en", section: "sports" })).toBe("front:pins:v1:en:sports");
  const del = jest.spyOn(cache, "del");
  await forgetStoryPins({ language: "hi", section: "sports" });
  expect(del.mock.calls.map(([key]) => key).sort()).toEqual(["front:pins:v1:hi:home", "front:pins:v1:hi:sports"]);
  del.mockClear();
  await forgetStoryPins({ language: "fr", section: "sports" });
  expect(del).not.toHaveBeenCalled();
});

test("a database failure is thrown, for the caller to show the page without the row", async () => {
  livePins.mockRejectedValue(new Error("timeout"));
  await expect(pinnedStories(page(), NOW)).rejects.toThrow("timeout");
});
