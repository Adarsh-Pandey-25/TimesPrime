/**
 * @jest-environment node
 *
 * A live blog's feed as JSON (Panel 3 design §5, M3): public, one address per blog so the edge can
 * share one copy (10 seconds, 20 more stale), the 5-second cache entry first, and the story's own
 * checks (published, past its embargo, a live blog) when there is none.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@timesprime/server/repositories/stories", () => ({ getPublishedStory: jest.fn() }));
jest.mock("@timesprime/server/services/front/live", () => ({ cachedLiveFeed: jest.fn(), liveFeed: jest.fn() }));

import { NextRequest } from "next/server";
import { GET } from "./route";

const { getPublishedStory } = jest.requireMock("@timesprime/server/repositories/stories") as { getPublishedStory: jest.Mock };
const { cachedLiveFeed, liveFeed } = jest.requireMock("@timesprime/server/services/front/live") as { cachedLiveFeed: jest.Mock; liveFeed: jest.Mock };

const get = (segment: string) => GET(new NextRequest(`http://localhost/api/live/${segment}`), { params: Promise.resolve({ publicId: segment }) });
const FEED = { endedAt: null, updates: [{ id: "u-1" }] };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("a live blog's feed, cached at the edge for 10 seconds and served stale for 20 more", async () => {
  cachedLiveFeed.mockResolvedValue(null);
  getPublishedStory.mockResolvedValue({ id: "s-1", public_id: 55, format: "live_blog", language: "en" });
  liveFeed.mockResolvedValue(FEED);
  const res = await get("55");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("public, s-maxage=10, stale-while-revalidate=20");
  await expect(res.json()).resolves.toEqual(FEED);
  expect(getPublishedStory).toHaveBeenCalledWith(55);
});

test("the cache entry answers first, with no read of the story", async () => {
  cachedLiveFeed.mockResolvedValue(FEED);
  const res = await get("55");
  expect(res.status).toBe(200);
  expect(getPublishedStory).not.toHaveBeenCalled();
});

test("not a live blog, not live, or not a number: 404, never cached at the edge", async () => {
  cachedLiveFeed.mockResolvedValue(null);
  getPublishedStory.mockResolvedValueOnce({ id: "s-2", public_id: 56, format: "news" }).mockResolvedValueOnce(null);
  for (const segment of ["56", "57", "abc", "0", "1e3"]) {
    const res = await get(segment);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  }
  expect(liveFeed).not.toHaveBeenCalled();
});

test("a failed read is 503, never cached", async () => {
  cachedLiveFeed.mockRejectedValue(new Error("timeout"));
  const res = await get("55");
  expect(res.status).toBe(503);
  expect(res.headers.get("cache-control")).toBe("no-store");
});
