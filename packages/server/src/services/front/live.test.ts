/**
 * @jest-environment node
 *
 * A live blog's feed for readers (Panel 3 design §5, M3): its updates shaped for the page, removed
 * ones never, images only when readers may see them, through a 5-second cache entry the back office
 * deletes on every change.
 */

jest.mock("../../repositories/liveUpdates", () => ({ listPublicLiveUpdates: jest.fn() }));
jest.mock("../../repositories/media", () => ({ listLiveImages: jest.fn(async () => []) }));
jest.mock("../../lib/mediaStorage", () => ({ mediaUrl: (key: string) => `/media/${key}` }));

import { cache } from "../../lib/cache";
import type { ReaderMediaRow } from "../../repositories/media";
import { forgetLive, liveBlocks, liveFeed, liveKey } from "./live";

const { listPublicLiveUpdates } = jest.requireMock("../../repositories/liveUpdates") as { listPublicLiveUpdates: jest.Mock };
const { listLiveImages } = jest.requireMock("../../repositories/media") as { listLiveImages: jest.Mock };

const IMAGE = "c0ffee00-0000-4000-8000-0000000000bb";
const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const doc = (...content: unknown[]) => ({ type: "doc", content });
const update = (id: string, body: unknown, over: Record<string, unknown> = {}) => ({
  id, story_id: "s-1", headline: null, body, is_key_event: false, is_pinned: false, posted_at: "2026-11-20T09:30:00Z", edited_at: null, ...over,
});
const rendition = (format: string, width: number, ratio = "16x9") => ({ ratio, format, width, height: Math.round((width * 9) / 16), key: `renditions/${IMAGE}/${ratio}-${width}.${format}` });
const IMAGE_ROW = {
  id: IMAGE, storage_key: "originals/x.jpg", width: 1600, height: 900, credit: "Staff", alt_en: "Counting", alt_hi: "मतगणना",
  caption_en: "At the centre", caption_hi: "केंद्र पर", active: true, renditions: [rendition("avif", 960), rendition("webp", 960)],
} as unknown as ReaderMediaRow;

let n = 1000;
const story = (over: Record<string, unknown> = {}) => ({ id: "s-1", public_id: ++n, language: "en" as const, live_ended_at: null, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("an update's paragraphs become runs: text, bold, italic, links, line breaks", () => {
  const body = doc(
    { type: "paragraph", content: [text("Turnout "), text("61%", [{ type: "bold" }, { type: "italic" }]), { type: "hardBreak" }, text("Results", [{ type: "link", attrs: { href: "https://eci.gov.in" } }])] },
    { type: "paragraph" }
  );
  expect(liveBlocks(body, "en", new Map())).toEqual([
    { kind: "p", runs: [{ text: "Turnout " }, { text: "61%", bold: true, italic: true }, { br: true }, { text: "Results", href: "https://eci.gov.in" }] },
  ]);
});

test("a body outside the smaller schema is not drawn at all (the backstop)", () => {
  expect(liveBlocks(doc({ type: "heading", content: [text("x")] }), "en", new Map())).toBeNull();
  expect(liveBlocks(doc({ type: "paragraph", content: [text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])] }), "en", new Map())).toBeNull();
});

test("an image: its crop's renditions with alt text, caption and credit in the story's language; one readers may not see is left out", () => {
  const body = doc({ type: "paragraph", content: [text("From the centre.")] }, { type: "image", attrs: { id: IMAGE, ratio: "16x9" } });
  const [, image] = liveBlocks(body, "hi", new Map([[IMAGE, IMAGE_ROW]])) ?? [];
  expect(image).toEqual(expect.objectContaining({ kind: "image", alt: "मतगणना", caption: "केंद्र पर", credit: "Staff", src: `/media/renditions/${IMAGE}/16x9-960.webp`, width: 960 }));
  expect(liveBlocks(body, "hi", new Map())).toEqual([{ kind: "p", runs: [{ text: "From the centre." }] }]);
});

test("the feed: newest first, each with its time in IST; images read once, for the updates that use them", async () => {
  listPublicLiveUpdates.mockResolvedValue([
    update("b", doc({ type: "paragraph", content: [text("Second.")] }), { headline: "Counting", is_key_event: true, is_pinned: true, posted_at: "2026-11-20T10:00:00Z", edited_at: "2026-11-20T10:05:00Z" }),
    update("a", doc({ type: "paragraph", content: [text("First.")] }, { type: "image", attrs: { id: IMAGE } })),
  ]);
  listLiveImages.mockResolvedValue([IMAGE_ROW]);
  const feed = await liveFeed(story());
  expect(listPublicLiveUpdates).toHaveBeenCalledWith("s-1", 50);
  expect(listLiveImages).toHaveBeenCalledWith([IMAGE]);
  expect(feed.endedAt).toBeNull();
  expect(feed.updates.map((u) => [u.id, u.headline, u.keyEvent, u.pinned, u.editedAt])).toEqual([
    ["b", "Counting", true, true, "2026-11-20T10:05:00Z"],
    ["a", null, false, false, null],
  ]);
  expect(feed.updates[0].time).toMatch(/20 Nov, 3:30\s?pm IST/i);
  expect(feed.updates[1].blocks.map((b) => b.kind)).toEqual(["p", "image"]);
});

test("an update outside the schema is left out; an ended blog says when", async () => {
  listPublicLiveUpdates.mockResolvedValue([update("bad", doc({ type: "embed", attrs: {} })), update("ok", doc({ type: "paragraph", content: [text("Fine.")] }))]);
  const feed = await liveFeed(story({ live_ended_at: "2026-11-20T12:00:00Z" }));
  expect(feed.updates.map((u) => u.id)).toEqual(["ok"]);
  expect(feed.endedAt).toBe("2026-11-20T12:00:00Z");
});

test("read once, then from the 5-second cache entry; forgetting it makes the next read go to the database", async () => {
  const set = jest.spyOn(cache, "set");
  listPublicLiveUpdates.mockResolvedValue([]);
  const s = story();
  await liveFeed(s);
  await liveFeed(s);
  expect(listPublicLiveUpdates).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith(liveKey(s.public_id), { endedAt: null, updates: [] }, 5);
  await forgetLive(s.public_id);
  await liveFeed(s);
  expect(listPublicLiveUpdates).toHaveBeenCalledTimes(2);
  expect(liveKey(77)).toBe("live:v1:77");
});
