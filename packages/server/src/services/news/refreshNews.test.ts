/**
 * @jest-environment node
 *
 * F-015: the 7-day purge left the feed's read and write paths, so the scheduled refresh is
 * now the one place it runs: once per run.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("../../repositories/auditLog", () => ({ recordSystemAudit: jest.fn(() => Promise.resolve()) }));
jest.mock("../../repositories/db", () => ({
  saveArticlesToDB: jest.fn(() => Promise.resolve([])),
  purgeOldArticles: jest.fn(() => Promise.resolve(3)),
}));
jest.mock("./newsdata", () => ({ fetchNewsDataArticles: jest.fn(() => Promise.resolve([])) }));

import { refreshNews, refreshPlan } from "./refreshNews";
import { NEWS_REFRESH_INTERVAL_MINUTES, NEWS_REFRESH_RUNS_PER_DAY, withinNewsDataPlan } from "@timesprime/shared/config/newsRefresh";

const db = jest.requireMock("../../repositories/db") as { saveArticlesToDB: jest.Mock; purgeOldArticles: jest.Mock };
const newsdata = jest.requireMock("./newsdata") as { fetchNewsDataArticles: jest.Mock };
const audit = jest.requireMock("../../repositories/auditLog") as { recordSystemAudit: jest.Mock };

describe("refreshNews", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.NEWSDATA_API_KEY = "newsdata-test-key";
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = env;
  });

  // The NewsData quota math for the one interval value (R1-03): a run's calls, counted from a real
  // run, times the runs a day. A change to the interval or the categories changes this number on
  // purpose; before go-live it is checked against 70% of the plan's daily limit.
  // R12-02: the worker fetches English and Hindi, 7 categories each, so 14 calls a run.
  // The owner, 17 Nov 2026: every 120 minutes while on NewsData's free plan, 200 calls a day. 168
  // calls a day leaves room for four admin syncs (newsRefresh.test.ts). On the Basic plan it goes
  // back to the senior's 60 minutes: 336 a day, 50% of Basic, whose ceiling is 70%.
  test("the scheduled job's NewsData calls a day: 14 a run, every 120 minutes, 168", async () => {
    await refreshNews();
    const callsPerRun = newsdata.fetchNewsDataArticles.mock.calls.length;
    expect(callsPerRun).toBe(14);
    expect(NEWS_REFRESH_INTERVAL_MINUTES).toBe(120);
    expect(NEWS_REFRESH_RUNS_PER_DAY).toBe(12);
    expect(callsPerRun * NEWS_REFRESH_RUNS_PER_DAY).toBe(168);
  });

  test("a run purges once, and refreshes every category in English and in Hindi", async () => {
    const outcome = await refreshNews();
    expect(outcome.ok).toBe(true);
    expect(db.purgeOldArticles).toHaveBeenCalledTimes(1);
    const queries = newsdata.fetchNewsDataArticles.mock.calls.map(([, opts]) => opts);
    expect(queries.filter((q) => q.language === "en")).toHaveLength(7);
    expect(queries.filter((q) => q.language === "hi")).toHaveLength(7);
    expect(outcome.ok && outcome.result.purged).toBe(3);
  });

  test("Hindi rows are tagged India: NewsData's Hindi feed is India's (country=in)", async () => {
    await refreshNews();
    const queries = newsdata.fetchNewsDataArticles.mock.calls.map(([, opts]) => opts);
    expect(queries.filter((q) => q.language === "hi").every((q) => q.country === "in")).toBe(true);
    expect(queries.find((q) => q.language === "en" && q.categoryParam === "india")?.country).toBe("in");
    expect(queries.find((q) => q.language === "en" && q.categoryParam === "world")?.country).toBe("us");
  });

  test("without a NewsData key nothing runs: no purge, no audit", async () => {
    delete process.env.NEWSDATA_API_KEY;
    await expect(refreshNews()).resolves.toEqual({ ok: false, error: expect.stringContaining("NEWSDATA_API_KEY") });
    expect(db.purgeOldArticles).not.toHaveBeenCalled();
    expect(audit.recordSystemAudit).not.toHaveBeenCalled();
  });

  test("one failing category is reported and the rest still run", async () => {
    newsdata.fetchNewsDataArticles.mockRejectedValueOnce(new Error("rate limited"));
    const outcome = await refreshNews();
    expect(outcome.ok && outcome.result.failed).toBe(1);
    expect(outcome.ok && outcome.result.refreshed).toBe(13);
  });

  // D11: the job is not a person and not a staff account; it writes the audit log as system:cron.
  test("each run is one audit_log row by system:cron, with the purge count", async () => {
    await refreshNews();
    expect(audit.recordSystemAudit).toHaveBeenCalledTimes(1);
    expect(audit.recordSystemAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "system",
        actor_id: null,
        actor_label: "system:cron",
        action: "cron.refresh_news",
        outcome: "succeeded",
        after: expect.objectContaining({ purged: 3, refreshed: 14, failed: 0 }),
      })
    );
  });
  // A failed audit write never stops a run: recordSystemAudit reports and carries on
  // (packages/server/src/repositories/auditLog.test.ts).
});

// R12-05: option (c), the batched refresh, behind NEWS_REFRESH_BATCHED (off unless "1").
describe("the batched refresh", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.NEWSDATA_API_KEY = "newsdata-test-key";
    jest.clearAllMocks();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  test("off by default: the 14 single-category calls", () => {
    delete process.env.NEWS_REFRESH_BATCHED;
    expect(refreshPlan()).toHaveLength(14);
  });

  test("on: 4 calls a run, each naming at most 5 categories and asking for 50 articles", async () => {
    process.env.NEWS_REFRESH_BATCHED = "1";
    await refreshNews();
    const queries = newsdata.fetchNewsDataArticles.mock.calls.map(([, opts]) => opts);
    expect(queries).toEqual([
      { categories: ["top", "world", "technology", "business", "sports"], language: "en", country: "us", size: 50 },
      { categories: ["top", "entertainment"], language: "en", country: "in", size: 50 },
      { categories: ["top", "world", "technology", "business", "sports"], language: "hi", country: "in", size: 50 },
      { categories: ["entertainment"], language: "hi", country: "in", size: 50 },
    ]);
  });

  test("every one of the 7 categories, in both languages, is covered by some call", () => {
    const covered = new Set(refreshPlan(true).flatMap((call) => Object.values(call.countsAs).flat().map((c) => call.language + ":" + c)));
    for (const language of ["en", "hi"]) {
      for (const category of ["general", "india", "world", "tech", "business", "sports", "entertainment"]) {
        expect(covered).toContain(language + ":" + category);
      }
    }
  });

  test("every 15 minutes it stays under 70% of the Basic plan; the single-category refresh would not", () => {
    expect(withinNewsDataPlan(15, refreshPlan(true).length)).toBe(true);
    expect(withinNewsDataPlan(15, refreshPlan(false).length)).toBe(false);
  });

  test("a run saves what each call returns and names the call in its detail", async () => {
    process.env.NEWS_REFRESH_BATCHED = "1";
    const outcome = await refreshNews();
    expect(db.saveArticlesToDB).toHaveBeenCalledTimes(4);
    expect(outcome.ok && outcome.result.details.map((d) => d.category)).toEqual([
      "en:top,world,technology,business,sports",
      "en:india,entertainment",
      "hi:top,world,technology,business,sports",
      "hi:entertainment",
    ]);
  });
});
