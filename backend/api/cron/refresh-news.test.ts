/**
 * @jest-environment node
 *
 * F-015: the 7-day purge left the feed's read and write paths, so the cron
 * route is now the one scheduled place it runs: once per authorised run.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@/backend/repositories/auditLog", () => ({ logAdminAction: jest.fn(() => Promise.resolve()) }));
jest.mock("@/backend/services/news", () => ({
  fetchNewsDataArticles: jest.fn(() => Promise.resolve([])),
  saveArticlesToDB: jest.fn(() => Promise.resolve([])),
  purgeOldArticles: jest.fn(() => Promise.resolve(3)),
}));

import { NextRequest } from "next/server";
import { GET } from "./refresh-news";

const news = jest.requireMock("@/backend/services/news") as {
  fetchNewsDataArticles: jest.Mock;
  saveArticlesToDB: jest.Mock;
  purgeOldArticles: jest.Mock;
};

const request = (secret?: string) =>
  new NextRequest("http://localhost:3000/api/cron/refresh-news", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

describe("GET /api/cron/refresh-news", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = "cron-test-secret";
    process.env.NEWSDATA_API_KEY = "newsdata-test-key";
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = env;
  });

  test("an authorised run purges once, and refreshes every category", async () => {
    const res = await GET(request("cron-test-secret"));
    expect(res.status).toBe(200);
    expect(news.purgeOldArticles).toHaveBeenCalledTimes(1);
    expect(news.fetchNewsDataArticles).toHaveBeenCalledTimes(7);
    const body = await res.json();
    expect(body.purged).toBe(3);
  });

  test("an unauthorised request purges nothing", async () => {
    const res = await GET(request("wrong-secret"));
    expect(res.status).toBe(401);
    expect(news.purgeOldArticles).not.toHaveBeenCalled();
  });
});
