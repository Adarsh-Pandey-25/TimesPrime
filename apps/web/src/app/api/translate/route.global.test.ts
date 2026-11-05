/**
 * @jest-environment node
 *
 * /api/translate's cap for every reader together (STOP R1): TRANSLATE_LIMITS.globalPerDay
 * translations a UTC day, whatever the IPs. Only a valid request about to reach the translator
 * counts. In its own file so the in-memory limiter starts from zero.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@timesprime/server/services/translate/googleTranslate", () => ({
  translateBatch: jest.fn(async (texts: string[]) => texts),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { TRANSLATE_LIMITS } from "@timesprime/shared/config/aiLimits";

const { translateBatch } = jest.requireMock("@timesprime/server/services/translate/googleTranslate") as { translateBatch: jest.Mock };

const send = (ip: string, body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    })
  );

let now: jest.SpyInstance;
beforeAll(() => {
  now = jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-04T18:00:00Z"));
});
afterAll(() => now.mockRestore());

test("the cap is the one config value: 1000 a day", () => {
  expect(TRANSLATE_LIMITS.globalPerDay).toBe(1000);
});

test("invalid requests never spend it; the 1001st valid one of the day is refused, from a new IP", async () => {
  for (let i = 0; i < 5; i++) expect((await send("10.60.0.1", { texts: [], target: "hi" })).status).toBe(400);

  // 1000 valid requests: 100 IPs, 10 each, inside every per-IP limit.
  for (let ip = 0; ip < 100; ip++) {
    for (let i = 0; i < 10; i++) expect((await send(`10.60.${1 + Math.floor(ip / 50)}.${ip % 50}`, { texts: ["a"], target: "hi" })).status).toBe(200);
  }
  expect(translateBatch).toHaveBeenCalledTimes(1000);

  const refused = await send("10.60.9.1", { texts: ["a"], target: "hi" });
  expect(refused.status).toBe(429);
  // The in-memory fallback's day slides: a full day from the first counted request, which here
  // is this instant. With Redis the window is the UTC day (rateLimit.redis.test.ts).
  expect(Number(refused.headers.get("retry-after"))).toBe(24 * 3600);
  expect(translateBatch).toHaveBeenCalledTimes(1000);
});
