/**
 * @jest-environment node
 *
 * The worker runs one job by name and reports through its exit code: 0 for a clean run,
 * 1 when the job failed, 2 for a name it does not know.
 */

jest.mock("@timesprime/server/services/news/refreshNews", () => ({ refreshNews: jest.fn() }));
jest.mock("@timesprime/server/services/news/refreshDryRun", () => ({ dryRunRefresh: jest.fn() }));

import fs from "fs";
import os from "os";
import path from "path";
import { JOBS, runJob } from "./jobs";

const { refreshNews } = jest.requireMock("@timesprime/server/services/news/refreshNews") as { refreshNews: jest.Mock };
const { dryRunRefresh } = jest.requireMock("@timesprime/server/services/news/refreshDryRun") as { dryRunRefresh: jest.Mock };
const result = (failed: number) => ({ ok: true, result: { refreshed: 7 - failed, failed, purged: 0, timestamp: "t", details: [] } });

const env = { ...process.env };
let stateDir: string;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  // Each test is a fresh server: no run recorded yet.
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-state-"));
  process.env.WORKER_STATE_DIR = stateDir;
});

afterEach(() => {
  jest.useRealTimers();
  process.env = { ...env };
});

test("an unknown job name exits 2 and runs nothing", async () => {
  await expect(runJob("nope")).resolves.toBe(2);
  await expect(runJob(undefined)).resolves.toBe(2);
  expect(refreshNews).not.toHaveBeenCalled();
});

test("refresh-news: a clean run exits 0", async () => {
  refreshNews.mockResolvedValue(result(0));
  await expect(runJob("refresh-news")).resolves.toBe(0);
});

test("refresh-news: a failed category exits 1, so the scheduler's alarm sees it", async () => {
  refreshNews.mockResolvedValue(result(1));
  await expect(runJob("refresh-news")).resolves.toBe(1);
});

test("refresh-news: no NewsData key exits 1", async () => {
  refreshNews.mockResolvedValue({ ok: false, error: "NEWSDATA_API_KEY is not set" });
  await expect(runJob("refresh-news")).resolves.toBe(1);
});

// R12-04: the server's timer fires every 15 minutes; the job runs once an interval has passed.
describe("refresh-news on the 15-minute timer", () => {
  const t0 = Date.parse("2026-11-16T10:00:00Z");

  test("a tick before the interval has passed exits 0 and calls nothing", async () => {
    jest.useFakeTimers({ now: t0 });
    refreshNews.mockResolvedValue(result(0));
    await expect(runJob("refresh-news")).resolves.toBe(0);
    jest.setSystemTime(t0 + 15 * 60_000);
    await expect(runJob("refresh-news")).resolves.toBe(0);
    expect(refreshNews).toHaveBeenCalledTimes(1);
  });

  test("the tick an hour later runs again", async () => {
    jest.useFakeTimers({ now: t0 });
    refreshNews.mockResolvedValue(result(0));
    await runJob("refresh-news");
    jest.setSystemTime(t0 + 60 * 60_000);
    await runJob("refresh-news");
    expect(refreshNews).toHaveBeenCalledTimes(2);
  });

  test("the start is recorded before the run, so a run that overlaps the next tick is not doubled", async () => {
    jest.useFakeTimers({ now: t0 });
    let recordedDuringRun: unknown;
    refreshNews.mockImplementation(async () => {
      recordedDuringRun = JSON.parse(fs.readFileSync(path.join(stateDir, "refresh-news.json"), "utf8"));
      return result(0);
    });
    await runJob("refresh-news");
    expect(recordedDuringRun).toEqual({ lastStartedAt: t0 });
  });

  test("a state folder it cannot write does not stop the refresh: it runs, and says so", async () => {
    const file = path.join(stateDir, "not-a-folder");
    fs.writeFileSync(file, "");
    process.env.WORKER_STATE_DIR = file;
    refreshNews.mockResolvedValue(result(0));
    await expect(runJob("refresh-news")).resolves.toBe(0);
    expect(refreshNews).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/could not record/), expect.anything());
  });
});

// R12-05: the dry run, by hand, once the NewsData plan is bought. It never refreshes.
describe("refresh-news-dry-run", () => {
  const report = (failures: string[] = []) => ({
    ok: true,
    report: { calls: { single: 14, batched: 4 }, failures, rows: [{ language: "en", category: "tech", single: 10, batched: 9 }] },
  });

  test("prints each category's counts side by side and exits 0, refreshing nothing", async () => {
    dryRunRefresh.mockResolvedValue(report());
    await expect(runJob("refresh-news-dry-run")).resolves.toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("14 today, 4 batched"));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^en\s+tech\s+10\s+9$/));
    expect(refreshNews).not.toHaveBeenCalled();
  });

  test("a failed call exits 1 and is printed", async () => {
    dryRunRefresh.mockResolvedValue(report(["batched en:india,entertainment: NewsData API error: status 422"]));
    await expect(runJob("refresh-news-dry-run")).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("status 422"));
  });

  test("no NewsData key exits 1", async () => {
    dryRunRefresh.mockResolvedValue({ ok: false, error: "NEWSDATA_API_KEY is not set" });
    await expect(runJob("refresh-news-dry-run")).resolves.toBe(1);
  });
});

test("the job list is exactly the jobs the worker may start", () => {
  expect(Object.keys(JOBS)).toEqual(["refresh-news", "refresh-news-dry-run"]);
});
