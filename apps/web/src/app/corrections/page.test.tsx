/**
 * @jest-environment node
 *
 * /corrections (Panel 7 design §4, M2): every public correction, newest first, 30 to a page; a live
 * story's headline links to it; a withdrawn story's headline is not shown; an empty or failed log
 * says so.
 */

jest.mock("@timesprime/server/repositories/corrections", () => ({ publicCorrections: jest.fn() }));
jest.mock("@timesprime/server/lib/reportFallback", () => ({ reportFallback: jest.fn() }));
jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import CorrectionsPage, { dynamic, metadata } from "./page";

const { publicCorrections } = jest.requireMock("@timesprime/server/repositories/corrections") as { publicCorrections: jest.Mock };
const { reportFallback } = jest.requireMock("@timesprime/server/lib/reportFallback") as { reportFallback: jest.Mock };

const LIVE = { id: "c-1", kind: "clarification", text: "The vote was on Monday.", language: "en", published_at: "2026-11-21T06:00:00Z", story_live: true, headline: "Budget passes", section: "india", slug: "budget-passes", public_id: 1024 };
const WITHDRAWN = { id: "c-2", kind: "retraction", text: "हमने यह खबर वापस ले ली है।", language: "hi", published_at: "2026-11-20T06:00:00Z", story_live: false, headline: null, section: null, slug: null, public_id: null };
const page = async (searchParams: Record<string, string> = {}) => renderToStaticMarkup(await CorrectionsPage({ searchParams: Promise.resolve(searchParams) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("read on every request, at its own address", () => {
  expect(dynamic).toBe("force-dynamic");
  expect(metadata.alternates?.canonical).toBe("/corrections");
});

test("each correction: its kind in its language and date, a live story's linked headline, a withdrawn one's without", async () => {
  publicCorrections.mockResolvedValue([LIVE, WITHDRAWN]);
  const html = await page();
  expect(publicCorrections).toHaveBeenCalledWith({ before: null, limit: 30 });
  expect(html).toContain('href="/india/budget-passes-1024"');
  expect(html).toContain(">Budget passes</a>");
  expect(html).toMatch(/Clarification · <time/);
  expect(html).toContain('lang="hi"');
  expect(html).toMatch(/खबर वापस ली गई · <time/);
  expect(html).toContain("एक खबर जो हमने वापस ले ली");
  expect(html).not.toContain("Older corrections");
  expect(html).toContain('href="/grievance"');
});

test("a full page leads to the older ones; ?before= reads from there, and a bad one is the first page", async () => {
  publicCorrections.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ ...LIVE, id: `c-${i}`, published_at: `2026-11-${String(30 - i).padStart(2, "0")}T06:00:00.000Z` })));
  expect(await page()).toContain(`href="/corrections?before=${encodeURIComponent("2026-11-01T06:00:00.000Z")}"`);
  await page({ before: "2026-11-01T06:00:00Z" });
  expect(publicCorrections).toHaveBeenLastCalledWith({ before: "2026-11-01T06:00:00.000Z", limit: 30 });
  await page({ before: "yesterday" });
  expect(publicCorrections).toHaveBeenLastCalledWith({ before: null, limit: 30 });
});

test("none yet (or before compliance-2); a failed read says so and is reported", async () => {
  publicCorrections.mockResolvedValue(null);
  expect(await page()).toContain("No corrections yet.");
  publicCorrections.mockRejectedValue(new Error("down"));
  const html = await page();
  expect(html).toContain("The corrections could not be loaded just now.");
  expect(reportFallback).toHaveBeenCalledWith("corrections_unavailable", { page: "log" });
});
