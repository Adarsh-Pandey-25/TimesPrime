/**
 * @jest-environment node
 *
 * R12-05's dry run: both runs' NewsData calls, counted per category and language, and nothing
 * written: no article, no purge, no audit row.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("../../repositories/auditLog", () => ({ recordSystemAudit: jest.fn() }));
jest.mock("../../repositories/db", () => ({ saveArticlesToDB: jest.fn(), purgeOldArticles: jest.fn() }));
jest.mock("./newsdata", () => ({ fetchNewsDataArticles: jest.fn() }));

import type { Article } from "@timesprime/shared/types";
import { dryRunRefresh } from "./refreshDryRun";

const db = jest.requireMock("../../repositories/db") as { saveArticlesToDB: jest.Mock; purgeOldArticles: jest.Mock };
const audit = jest.requireMock("../../repositories/auditLog") as { recordSystemAudit: jest.Mock };
const newsdata = jest.requireMock("./newsdata") as { fetchNewsDataArticles: jest.Mock };

const story = (id: string, category: string[]): Article => ({ article_id: id, title: id, link: `https://p.example/${id}`, pubDate: "", category });
const env = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEWSDATA_API_KEY = "newsdata-test-key";
  // Single-category calls bring 2 articles each; batched calls bring one article per category named.
  newsdata.fetchNewsDataArticles.mockImplementation(async (_key: string, query: { categories?: string[] }) =>
    query.categories ? query.categories.map((c, i) => story(`${c}-${i}`, [c])) : [story("a", ["top"]), story("b", ["top"])]
  );
});

afterEach(() => {
  process.env = { ...env };
});

test("it makes both runs' calls, 14 and 4, and writes nothing", async () => {
  const outcome = await dryRunRefresh();
  expect(outcome.ok).toBe(true);
  expect(newsdata.fetchNewsDataArticles).toHaveBeenCalledTimes(18);
  expect(outcome.ok && outcome.report.calls).toEqual({ single: 14, batched: 4 });
  expect(db.saveArticlesToDB).not.toHaveBeenCalled();
  expect(db.purgeOldArticles).not.toHaveBeenCalled();
  expect(audit.recordSystemAudit).not.toHaveBeenCalled();
});

test("it counts each category in each language, filing batched articles by their tags", async () => {
  const outcome = await dryRunRefresh();
  if (!outcome.ok) throw new Error(outcome.error);
  const row = (language: string, category: string) => outcome.report.rows.find((r) => r.language === language && r.category === category);
  expect(outcome.report.rows).toHaveLength(14);
  expect(row("en", "tech")).toEqual({ language: "en", category: "tech", single: 2, batched: 1 });
  // English top stories: the United States call's "top" is general, the India call's is india.
  expect(row("en", "general")?.batched).toBe(1);
  expect(row("en", "india")?.batched).toBe(1);
  // Hindi top stories count for both general and india, as the single-category run fetches both.
  expect(row("hi", "general")?.batched).toBe(1);
  expect(row("hi", "india")?.batched).toBe(1);
  expect(row("hi", "entertainment")?.batched).toBe(1);
});

test("a failing call is listed and the rest still run", async () => {
  newsdata.fetchNewsDataArticles.mockRejectedValueOnce(new Error("NewsData API error: status 422"));
  const outcome = await dryRunRefresh();
  expect(outcome.ok && outcome.report.failures).toEqual(["single en:general: NewsData API error: status 422"]);
  expect(newsdata.fetchNewsDataArticles).toHaveBeenCalledTimes(18);
});

test("without a NewsData key it calls nothing", async () => {
  delete process.env.NEWSDATA_API_KEY;
  await expect(dryRunRefresh()).resolves.toEqual({ ok: false, error: expect.stringContaining("NEWSDATA_API_KEY") });
  expect(newsdata.fetchNewsDataArticles).not.toHaveBeenCalled();
});
