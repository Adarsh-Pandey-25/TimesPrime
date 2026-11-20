/**
 * @jest-environment node
 *
 * The RSS routes (Panel 3, M4): /rss/en.xml, /rss/hi.xml and /rss/<language>/<section>.xml, as RSS
 * kept 5 minutes at the edge; anything else is a 404 kept nowhere.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@timesprime/server/services/front/rss", () => ({ rssFeed: jest.fn(async () => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"/>') }));

import { NextRequest } from "next/server";
import { GET as languageFeed } from "./[language]/route";
import { GET as sectionFeed } from "./[language]/[section]/route";

const { rssFeed } = jest.requireMock("@timesprime/server/services/front/rss") as { rssFeed: jest.Mock };
const request = new NextRequest("http://localhost/rss");

beforeEach(() => {
  rssFeed.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("a language's feed and a section's: RSS, kept 5 minutes at the edge and 10 more while it refreshes", async () => {
  const site = await languageFeed(request, { params: Promise.resolve({ language: "hi.xml" }) });
  expect(site.status).toBe(200);
  expect(site.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
  expect(site.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
  expect(await site.text()).toContain('<rss version="2.0"/>');
  expect(rssFeed).toHaveBeenLastCalledWith({ language: "hi", section: null });
  const section = await sectionFeed(request, { params: Promise.resolve({ language: "en", section: "sports.xml" }) });
  expect(section.status).toBe(200);
  expect(rssFeed).toHaveBeenLastCalledWith({ language: "en", section: "sports" });
});

test("no such feed is 404, kept nowhere, and reads nothing", async () => {
  for (const response of [
    await languageFeed(request, { params: Promise.resolve({ language: "fr.xml" }) }),
    await sectionFeed(request, { params: Promise.resolve({ language: "en", section: "politics.xml" }) }),
    await sectionFeed(request, { params: Promise.resolve({ language: "xx", section: "sports.xml" }) }),
  ]) {
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(rssFeed).not.toHaveBeenCalled();
});

test("a failed read is 503, kept nowhere", async () => {
  rssFeed.mockRejectedValueOnce(new Error("timeout"));
  const response = await languageFeed(request, { params: Promise.resolve({ language: "en.xml" }) });
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
