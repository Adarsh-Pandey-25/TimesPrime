/**
 * @jest-environment node
 *
 * checkRateLimit's Redis path (owner decision D1, for F-004 and F-011): a
 * fixed-window counter, INCR + EXPIRE on the existing @upstash/redis client,
 * falling back to the in-memory limiter, with the fallback logged, when
 * Redis is unset or fails. Upstash is never configured locally, so the
 * client is mocked here.
 */

jest.mock("@upstash/redis", () => {
  const incr = jest.fn();
  const expire = jest.fn(() => Promise.resolve(1));
  return { Redis: jest.fn(() => ({ incr, expire })), __mock: { incr, expire } };
});

type RedisMock = { incr: jest.Mock; expire: jest.Mock };
// Re-read after every jest.resetModules(): the module under test gets a fresh mock instance.
let redis: RedisMock;
const RULE = { name: "login", limit: 3, windowSeconds: 900 };
const env = { ...process.env };

type Limiter = typeof import("./rateLimit");
const load = async (withRedis: boolean): Promise<Limiter> => {
  jest.resetModules();
  redis = (jest.requireMock("@upstash/redis") as { __mock: RedisMock }).__mock;
  if (withRedis) {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  return import("./rateLimit");
};

let warn: jest.SpyInstance;
let error: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse("2026-11-02T10:05:00Z"));
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  error = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  process.env = { ...env };
});

describe("with Redis", () => {
  test("counts with INCR, sets the window's expiry on the first hit, and limits past the rule", async () => {
    const { checkRateLimit } = await load(true);
    let count = 0;
    redis.incr.mockImplementation(async () => ++count);

    for (let i = 0; i < 3; i++) expect((await checkRateLimit("203.0.113.9", RULE)).limited).toBe(false);
    const fourth = await checkRateLimit("203.0.113.9", RULE);
    expect(fourth.limited).toBe(true);

    // One key per rule, client and fixed window; the expiry is set once, on the first hit.
    const windowId = Math.floor(Date.now() / 900_000);
    expect(redis.incr).toHaveBeenCalledWith(`ratelimit:login:203.0.113.9:${windowId}`);
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith(`ratelimit:login:203.0.113.9:${windowId}`, 900);
    // Retry-After runs to the end of the fixed window: 10:00 + 15 min, from 10:05.
    expect(fourth.retryAfterSeconds).toBe(600);
  });

  test("a Redis failure falls back to the in-memory limiter, and says so", async () => {
    const { checkRateLimit } = await load(true);
    redis.incr.mockRejectedValue(new Error("ECONNRESET"));
    for (let i = 0; i < 3; i++) expect((await checkRateLimit("203.0.113.10", RULE)).limited).toBe(false);
    expect((await checkRateLimit("203.0.113.10", RULE)).limited).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/falling back to the in-memory limiter/), "ECONNRESET");
  });
});

describe("without Redis", () => {
  test("the in-memory limiter decides, and the fallback is logged once", async () => {
    const { checkRateLimit } = await load(false);
    for (let i = 0; i < 3; i++) expect((await checkRateLimit("203.0.113.11", RULE)).limited).toBe(false);
    const fourth = await checkRateLimit("203.0.113.11", RULE);
    expect(fourth.limited).toBe(true);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(900);
    expect(redis.incr).not.toHaveBeenCalled();
    expect(warn.mock.calls.filter(([m]) => /in-memory limiter/.test(String(m)))).toHaveLength(1);
  });

  test("Retry-After is exact: allowed at that second, still limited one second before", async () => {
    const { checkRateLimit } = await load(false);
    const t0 = Date.now();
    // Two clients with the same history: hits at +0, +60 and +120 s, then a fourth at +180 s.
    for (const client of ["203.0.113.12", "203.0.113.13"]) {
      for (const offset of [0, 60, 120]) {
        jest.setSystemTime(t0 + offset * 1000);
        await checkRateLimit(client, RULE);
      }
      jest.setSystemTime(t0 + 180_000);
      // The hit at +60 s leaves the 900 s window at +960 s: 780 s from now.
      expect(await checkRateLimit(client, RULE)).toEqual({ limited: true, retryAfterSeconds: 780 });
    }
    jest.setSystemTime(t0 + 959_000);
    expect((await checkRateLimit("203.0.113.12", RULE)).limited).toBe(true);
    jest.setSystemTime(t0 + 960_000);
    expect((await checkRateLimit("203.0.113.13", RULE)).limited).toBe(false);
  });
});
