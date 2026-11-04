import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Basic in-memory fixed-window rate limiter. Fine for a single-instance dev
 * server; on serverless (multiple instances) it's advisory rather than a
 * hard global cap, same caveat as the in-memory news cache in packages/server/src/lib/cache.ts.
 *
 * Keys are evicted (F-020): once a minute, every key idle for longer than
 * its window is dropped, and the map never holds more than MAX_TRACKED_KEYS
 * (the least recently seen go first). Before, every client ever seen stayed
 * in memory for the life of the process.
 *
 * checkRateLimit adds a shared limit for the routes worth defending across
 * instances, admin login (F-004), the scraper (F-011), and chat and
 * translate with a daily cap per IP (R1-05, checkRateLimits): a fixed-window
 * counter in Upstash Redis (INCR, then EXPIRE on the window's first hit),
 * falling back to the in-memory limiter, with the fallback logged, when
 * Redis is not configured or fails (owner decision D1). The client is built
 * here from the same variables as packages/server/src/lib/cache.ts rather than imported
 * from it: packages/server/src/lib modules import no project module (rule LIB).
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_TRACKED_KEYS = 10_000;

interface Tracked {
  hits: number[];
  windowMs: number;
}

// Insertion order is recency order: a key is re-inserted on every request.
const requestLog = new Map<string, Tracked>();
let lastSweep = 0;

function sweep(now: number): void {
  for (const [key, { hits, windowMs }] of requestLog) {
    if (now - hits[hits.length - 1] >= windowMs) requestLog.delete(key);
  }
  lastSweep = now;
}

/** Records a hit on `key` and returns the hits inside its window, oldest first, this one included. */
function recordHit(key: string, windowMs: number, now: number): number[] {
  if (now - lastSweep >= WINDOW_MS) sweep(now);

  const recent = (requestLog.get(key)?.hits || []).filter((t) => now - t < windowMs);
  recent.push(now);
  requestLog.delete(key);
  requestLog.set(key, { hits: recent, windowMs });
  while (requestLog.size > MAX_TRACKED_KEYS) {
    requestLog.delete(requestLog.keys().next().value as string);
  }
  return recent;
}

/** Returns true if `key` has exceeded MAX_REQUESTS_PER_WINDOW requests in the last minute. */
export function isRateLimited(key: string): boolean {
  return limitDefault(key).limited;
}

/** isRateLimited with the wait. /api/chat and /api/translate used it until R1-05 moved them to checkRateLimits. */
function limitDefault(key: string): RateLimitDecision {
  const now = Date.now();
  return decide(recordHit(key, WINDOW_MS, now), MAX_REQUESTS_PER_WINDOW, WINDOW_MS, now);
}

// Every call counts, the retry included: it is allowed once at most limit - 1
// of these hits remain in the window, i.e. once hits[length - limit] leaves it.
function decide(hits: number[], limit: number, windowMs: number, now: number): RateLimitDecision {
  const limited = hits.length > limit;
  const blocking = hits[hits.length - limit] ?? now;
  return { limited, retryAfterSeconds: limited ? Math.max(1, Math.ceil((blocking + windowMs - now) / 1000)) : 0 };
}

/** How many keys the limiter is holding. For tests. */
export function trackedKeyCount(): number {
  return requestLog.size;
}

export interface RateLimitRule {
  /** Namespaces the counter: "login", "scrape". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  limited: boolean;
  /** Seconds until the request would be allowed: the value for Retry-After. */
  retryAfterSeconds: number;
}

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null;
let warnedNoRedis = false;

function checkInMemory(key: string, rule: RateLimitRule, now: number): RateLimitDecision {
  const windowMs = rule.windowSeconds * 1000;
  return decide(recordHit(`${rule.name}:${key}`, windowMs, now), rule.limit, windowMs, now);
}

export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
  const now = Date.now();
  if (!redis) {
    if (!warnedNoRedis) {
      warnedNoRedis = true;
      console.warn(
        "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured — rate limits for login, the " +
          "scraper, chat and translate use the in-memory limiter, which is per instance."
      );
    }
    return checkInMemory(key, rule, now);
  }

  const windowMs = rule.windowSeconds * 1000;
  const windowId = Math.floor(now / windowMs);
  const counterKey = `ratelimit:${rule.name}:${key}:${windowId}`;
  try {
    const count = await redis.incr(counterKey);
    if (count === 1) await redis.expire(counterKey, rule.windowSeconds);
    const limited = count > rule.limit;
    return { limited, retryAfterSeconds: limited ? Math.max(1, Math.ceil(((windowId + 1) * windowMs - now) / 1000)) : 0 };
  } catch (err) {
    console.error(
      "Upstash Redis rate-limit counter failed, falling back to the in-memory limiter:",
      err instanceof Error ? err.message : String(err)
    );
    return checkInMemory(key, rule, now);
  }
}

/**
 * checkRateLimit for several rules on one key, in order, stopping at the first that limits: a
 * burst limit, then a daily cap (R1-05, for /api/chat and /api/translate). A rule after the one
 * that limits is not counted, so a refused request never spends the day's budget.
 */
export async function checkRateLimits(key: string, rules: readonly RateLimitRule[]): Promise<RateLimitDecision> {
  for (const rule of rules) {
    const decision = await checkRateLimit(key, rule);
    if (decision.limited) return decision;
  }
  return { limited: false, retryAfterSeconds: 0 };
}

/**
 * How many proxies in front of the app append to X-Forwarded-For and are trusted to: 2 on AWS
 * (CloudFront, then the ALB), set by the task definition. Unset, 0 or not a whole number: 0.
 */
function trustedProxyHops(): number {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/**
 * The client's IP (R1-05). Each trusted proxy appends the address it received the request from:
 * on AWS, CloudFront appends the viewer's and the ALB appends CloudFront's, and Next adds the
 * socket's only when the header is missing (next/dist/server/base-server.js, `??=`). So the client
 * is the entry TRUSTED_PROXY_HOPS from the right; everything left of it came from the client and
 * can be forged. It used to take the leftmost entry, which any client could set to anything, to
 * dodge a rate limit or write a false IP into the audit log. The two right entries cannot be
 * forged because the ALB accepts traffic only from CloudFront (owner runbook, docs/OPERATIONS.md).
 *
 * Hops 0 (local, no proxy): the rightmost entry, the socket's. Fewer entries than hops (a request
 * that skipped a hop, such as the ALB's health check): the leftmost, which a trusted hop wrote.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (forwardedFor.length) return forwardedFor[Math.max(0, forwardedFor.length - Math.max(trustedProxyHops(), 1))];
  return request.headers.get("x-real-ip") || "unknown";
}
