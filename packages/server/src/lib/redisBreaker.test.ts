/**
 * @jest-environment node
 *
 * BL-040: after a Redis failure, callers skip Redis for a pause, then try it again.
 */

import { createRedisBreaker, REDIS_CLIENT_OPTIONS, REDIS_PAUSE_MS, REDIS_TIMEOUT_MS } from "./redisBreaker";

const t0 = Date.parse("2026-11-16T10:00:00Z");

test("closed until a failure; open for the pause; closed again once it has passed", () => {
  const breaker = createRedisBreaker();
  expect(breaker.isOpen(t0)).toBe(false);
  breaker.recordFailure(t0);
  expect(breaker.isOpen(t0 + REDIS_PAUSE_MS - 1)).toBe(true);
  expect(breaker.isOpen(t0 + REDIS_PAUSE_MS)).toBe(false);
});

test("a success closes it at once", () => {
  const breaker = createRedisBreaker();
  breaker.recordFailure(t0);
  breaker.recordSuccess();
  expect(breaker.isOpen(t0 + 1)).toBe(false);
});

test("each breaker is its own: the cache's failure does not pause the rate limiter", () => {
  const cache = createRedisBreaker();
  const limiter = createRedisBreaker();
  cache.recordFailure(t0);
  expect(limiter.isOpen(t0 + 1)).toBe(false);
});

test("the client makes one attempt, cut off after a second", () => {
  expect(REDIS_CLIENT_OPTIONS.retry).toEqual({ retries: 0 });
  expect(REDIS_TIMEOUT_MS).toBe(1_000);
  const signal = REDIS_CLIENT_OPTIONS.signal();
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(signal.aborted).toBe(false);
});
