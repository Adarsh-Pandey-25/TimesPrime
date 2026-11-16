import "server-only";

/**
 * BL-040: what Redis may cost a request when it is down. On the single EC2, Redis runs next to
 * the app (behind the serverless-redis-http proxy), so an outage is a stopped container: each
 * call fails fast, but @upstash/redis retried it five times with an exponential backoff, about
 * 4.3 seconds a call, before the cache or the rate limiter fell back. Now:
 * - one attempt, cut off after REDIS_TIMEOUT_MS (`REDIS_CLIENT_OPTIONS`);
 * - after a failure, the caller skips Redis for REDIS_PAUSE_MS and uses its fallback at once
 *   (`createRedisBreaker`), then tries Redis again on the next call after the pause.
 *
 * The reader site's cache handler (apps/web/cache-handler.mjs) keeps its own copy of the same
 * rule: Next loads that file from disk as plain JavaScript, so it cannot import this one.
 */

export const REDIS_TIMEOUT_MS = 1_000;
export const REDIS_PAUSE_MS = 10_000;

/** Options for every app-side Upstash client: one attempt, at most REDIS_TIMEOUT_MS. */
export const REDIS_CLIENT_OPTIONS = {
  retry: { retries: 0 },
  signal: () => AbortSignal.timeout(REDIS_TIMEOUT_MS),
};

export interface RedisBreaker {
  /** True while Redis is being skipped after a failure. */
  isOpen(now?: number): boolean;
  recordFailure(now?: number): void;
  recordSuccess(): void;
}

export function createRedisBreaker(pauseMs: number = REDIS_PAUSE_MS): RedisBreaker {
  let skipUntil = 0;
  return {
    isOpen: (now = Date.now()) => now < skipUntil,
    recordFailure: (now = Date.now()) => {
      skipUntil = now + pauseMs;
    },
    recordSuccess: () => {
      skipUntil = 0;
    },
  };
}
