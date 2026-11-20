/**
 * @jest-environment node
 *
 * The shared cache's Redis path when Redis fails (BL-040). Upstash is never configured locally,
 * so the client is mocked; each load of the module is one app process.
 */

// A module, not a script: its names must not collide with rateLimit.redis.test.ts's.
export {};

jest.mock("@upstash/redis", () => {
  const get = jest.fn();
  const set = jest.fn();
  const ping = jest.fn();
  const del = jest.fn();
  return { Redis: jest.fn(() => ({ get, set, ping, del })), __mock: { get, set, ping, del } };
});

type RedisMock = { get: jest.Mock; set: jest.Mock; ping: jest.Mock; del: jest.Mock };
let redis: RedisMock;
const env = { ...process.env };
const t0 = Date.parse("2026-11-16T10:00:00Z");

async function load(): Promise<typeof import("./cache")> {
  jest.resetModules();
  process.env.UPSTASH_REDIS_REST_URL = "http://redis-proxy.internal";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  const mod = await import("./cache");
  redis = (jest.requireMock("@upstash/redis") as { __mock: RedisMock }).__mock;
  return mod;
}

let error: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers({ now: t0 });
  error = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  process.env = { ...env };
});

test("the client makes one attempt, cut off after a second", async () => {
  await load();
  const { Redis } = jest.requireMock("@upstash/redis") as { Redis: jest.Mock };
  const options = Redis.mock.calls.at(-1)[0];
  expect(options.retry).toEqual({ retries: 0 });
  expect(options.signal()).toBeInstanceOf(AbortSignal);
});

test("after a failure, Redis is skipped for ten seconds: the memory cache answers at once", async () => {
  const { cache } = await load();
  redis.set.mockRejectedValue(new Error("ECONNREFUSED"));
  await cache.set("feed", { n: 1 }, 60); // fails, falls back to memory
  expect(redis.set).toHaveBeenCalledTimes(1);

  redis.get.mockResolvedValue({ n: 2 }); // Redis is back, but the pause holds
  await expect(cache.get("feed")).resolves.toEqual({ n: 1 });
  await cache.set("other", { n: 3 }, 60);
  expect(redis.get).not.toHaveBeenCalled();
  expect(redis.set).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(1);

  jest.setSystemTime(t0 + 10_000);
  await expect(cache.get("feed")).resolves.toEqual({ n: 2 });
  expect(redis.get).toHaveBeenCalledTimes(1);
});

test("the health probe always asks Redis, so /api/health reports the outage", async () => {
  const { cache } = await load();
  redis.get.mockRejectedValue(new Error("ECONNREFUSED"));
  await cache.get("feed");
  redis.ping.mockRejectedValue(new Error("ECONNREFUSED"));
  await expect(cache.ping()).resolves.toBe("error");
  expect(redis.ping).toHaveBeenCalledTimes(1);
});

test("del deletes the key in Redis and in memory; a Redis failure is logged, not thrown (Panel 3)", async () => {
  const { cache } = await load();
  redis.set.mockRejectedValueOnce(new Error("ECONNREFUSED"));
  await cache.set("pins", { n: 1 }, 60); // lands in memory
  jest.setSystemTime(t0 + 10_000); // the pause is over
  redis.del.mockResolvedValueOnce(1);
  await cache.del("pins");
  expect(redis.del).toHaveBeenCalledWith("pins");
  redis.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));
  await expect(cache.get("pins")).resolves.toBeNull(); // memory forgot it too

  jest.setSystemTime(t0 + 30_000);
  redis.del.mockRejectedValueOnce(new Error("ECONNREFUSED"));
  await expect(cache.del("pins")).resolves.toBeUndefined();
  expect(error).toHaveBeenCalledWith(expect.stringContaining("del() failed"), expect.any(Error));
});
