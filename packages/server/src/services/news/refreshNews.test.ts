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

import { refreshNews } from "./refreshNews";

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

  test("a run purges once, and refreshes every category", async () => {
    const outcome = await refreshNews();
    expect(outcome.ok).toBe(true);
    expect(db.purgeOldArticles).toHaveBeenCalledTimes(1);
    expect(newsdata.fetchNewsDataArticles).toHaveBeenCalledTimes(7);
    expect(outcome.ok && outcome.result.purged).toBe(3);
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
    expect(outcome.ok && outcome.result.refreshed).toBe(6);
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
        after: expect.objectContaining({ purged: 3, refreshed: 7, failed: 0 }),
      })
    );
  });
  // A failed audit write never stops a run: recordSystemAudit reports and carries on
  // (packages/server/src/repositories/auditLog.test.ts).
});
