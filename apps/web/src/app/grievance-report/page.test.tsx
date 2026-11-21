/**
 * @jest-environment node
 *
 * The monthly grievance reports on the reader site (Panel 7 design §5, M3): the list, newest month
 * first, each month's latest version and how often it was reissued; one month's page with its
 * earlier versions; 404 for a month with no report or an address that is not a month.
 */

jest.mock("@timesprime/server/repositories/grievanceReports", () => ({ publicReports: jest.fn() }));
jest.mock("@timesprime/server/lib/reportFallback", () => ({ reportFallback: jest.fn() }));
jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import ReportsPage, { dynamic, metadata } from "./page";
import MonthPage, { generateMetadata } from "./[month]/page";

const { publicReports } = jest.requireMock("@timesprime/server/repositories/grievanceReports") as { publicReports: jest.Mock };
const { reportFallback } = jest.requireMock("@timesprime/server/lib/reportFallback") as { reportFallback: jest.Mock };

const figures = (received: number) => ({
  month: "2026-11", as_of: "2026-12-05T06:00:00Z",
  received: { total: received, by_category: { factual_error: received, defamation_privacy: 0, obscene_harmful: 0, copyright: 0, other: 0 }, by_language: { en: received, hi: 0 }, by_channel: { web: received, email: 0, post: 0, other: 0 } },
  decided: { total: 2, by_outcome: { upheld: 2, partly_upheld: 0, not_upheld: 0, outside_scope: 0, withdrawn: 0, duplicate: 0, spam: 0 }, within_15_days: 2, late: 0, median_days: 3 },
  open: { total: received - 2, late: 0 },
  corrections: { total: 0, by_kind: { correction: 0, clarification: 0, update: 0, editors_note: 0, retraction: 0 } },
});
const NOV_2 = { id: "r-2", month: "2026-11-01", version: 2, figures: figures(5), note: "One grievance was counted twice in version 1.", published_at: "2026-12-06T06:00:00Z" };
const NOV_1 = { id: "r-1", month: "2026-11-01", version: 1, figures: figures(6), note: null, published_at: "2026-12-05T06:00:00Z" };
const OCT_1 = { id: "r-0", month: "2026-10-01", version: 1, figures: figures(2), note: null, published_at: "2026-11-05T06:00:00Z" };
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("the list", () => {
  test("read on every request, at its own address", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.alternates?.canonical).toBe("/grievance-report");
  });

  test("each month once, newest first, with its latest version's totals and how often it was reissued", async () => {
    publicReports.mockResolvedValue([NOV_2, NOV_1, OCT_1]);
    const html = renderToStaticMarkup(await ReportsPage());
    expect(html.indexOf("November 2026")).toBeLessThan(html.indexOf("October 2026"));
    expect(html).toContain('href="/grievance-report/2026-11"');
    expect(html).toContain("5 received · 2 decided (2 within 15 days) · 3 open");
    expect(html).toContain("Reissued: 2 versions");
    expect(html.match(/href="\/grievance-report\/2026-11"/g)).toHaveLength(1);
  });

  test("none yet; a failed read says so and is reported", async () => {
    publicReports.mockResolvedValue([]);
    expect(renderToStaticMarkup(await ReportsPage())).toContain("No report has been published yet.");
    publicReports.mockRejectedValue(new Error("down"));
    expect(renderToStaticMarkup(await ReportsPage())).toContain("The reports could not be loaded just now.");
    expect(reportFallback).toHaveBeenCalledWith("grievance_reports_unavailable", { page: "list" });
  });
});

describe("one month", () => {
  const props = (month: string) => ({ params: Promise.resolve({ month }) });

  test("the latest version with its note and figures, and the earlier one below, as published", async () => {
    publicReports.mockResolvedValue([NOV_2, NOV_1]);
    const html = renderToStaticMarkup(await MonthPage(props("2026-11")));
    expect(publicReports).toHaveBeenCalledWith("2026-11");
    expect(html).toContain("Grievance report: November 2026</h1>");
    expect(html).toContain("Version 2, published 6 December 2026.");
    expect(html).toContain("One grievance was counted twice in version 1.");
    expect(html).toContain("Earlier versions");
    expect(html).toContain("Version 1, published 5 December 2026");
    expect((await generateMetadata(props("2026-11"))).alternates?.canonical).toBe("/grievance-report/2026-11");
  });

  test("404 for a month with no report, or an address that is not a month", async () => {
    publicReports.mockResolvedValue([]);
    await expect(MonthPage(props("2026-09"))).rejects.toMatchObject(NOT_FOUND);
    await expect(MonthPage(props("november"))).rejects.toMatchObject(NOT_FOUND);
    expect(publicReports).toHaveBeenCalledTimes(1);
  });
});
