/**
 * @jest-environment node
 *
 * /api/chat's cap for every reader together (STOP R1): CHAT_LIMITS.globalPerDay model calls a
 * UTC day, whatever the IPs, because mobile carriers in India put many readers behind one address.
 * Only a valid request about to reach the model counts. In its own file so the in-memory limiter
 * (no Redis in tests; the Redis path is rateLimit.redis.test.ts) starts from zero.
 */

jest.mock("@anthropic-ai/sdk", () => {
  async function* generator() {
    yield { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } };
  }
  const stream = jest.fn(() => ({ [Symbol.asyncIterator]: generator }));
  class MockAnthropic {
    messages = { stream };
    static AuthenticationError = class extends Error {};
    static RateLimitError = class extends Error {};
    static APIConnectionError = class extends Error {};
    static APIError = class extends Error {};
  }
  return { __esModule: true, default: MockAnthropic, __stream: stream };
});

import { NextRequest } from "next/server";
import { POST } from "./route";
import { CHAT_LIMITS } from "@timesprime/shared/config/aiLimits";

const { __stream: stream } = jest.requireMock("@anthropic-ai/sdk") as { __stream: jest.Mock };

const send = (ip: string, body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    })
  );

const env = process.env.ANTHROPIC_API_KEY;
let now: jest.SpyInstance;
beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  // Every request at one instant of one UTC day.
  now = jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-04T18:00:00Z"));
});
afterAll(() => {
  now.mockRestore();
  if (env === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = env;
});

test("the cap is the one config value: 500 a day", () => {
  expect(CHAT_LIMITS.globalPerDay).toBe(500);
});

test("invalid requests never spend it; the 501st valid one of the day is refused, from a new IP", async () => {
  // Five requests without a message, from one IP: 400s, which must not count.
  for (let i = 0; i < 5; i++) expect((await send("10.50.0.1", {})).status).toBe(400);

  // 500 valid requests: 50 IPs, 10 each, inside every per-IP limit.
  for (let ip = 0; ip < 50; ip++) {
    for (let i = 0; i < 10; i++) expect((await send(`10.50.1.${ip}`, { message: "Hello" })).status).toBe(200);
  }
  expect(stream).toHaveBeenCalledTimes(500);

  const refused = await send("10.50.2.1", { message: "Hello" });
  expect(refused.status).toBe(429);
  expect(await refused.json()).toEqual({ error: "The AI assistant has reached its limit for today. Please try again tomorrow." });
  // The in-memory fallback's day slides: a full day from the first counted request, which here
  // is this instant. With Redis the window is the UTC day (rateLimit.redis.test.ts).
  expect(Number(refused.headers.get("retry-after"))).toBe(24 * 3600);
  expect(stream).toHaveBeenCalledTimes(500);
});
