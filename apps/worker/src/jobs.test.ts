/**
 * @jest-environment node
 *
 * The worker runs one job by name and reports through its exit code: 0 for a clean run,
 * 1 when the job failed, 2 for a name it does not know.
 */

jest.mock("@timesprime/server/services/news/refreshNews", () => ({ refreshNews: jest.fn() }));

import { JOBS, runJob } from "./jobs";

const { refreshNews } = jest.requireMock("@timesprime/server/services/news/refreshNews") as { refreshNews: jest.Mock };
const result = (failed: number) => ({ ok: true, result: { refreshed: 7 - failed, failed, purged: 0, timestamp: "t", details: [] } });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
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

test("the job list is exactly the jobs the scheduler may start", () => {
  expect(Object.keys(JOBS)).toEqual(["refresh-news"]);
});
