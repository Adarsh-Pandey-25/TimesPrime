import "server-only";

/**
 * Basic in-memory fixed-window rate limiter. Fine for a single-instance dev
 * server; on serverless (multiple instances) it's advisory rather than a
 * hard global cap, same caveat as the in-memory news cache in backend/lib/cache.ts.
 *
 * Keys are evicted (F-020): once a minute, every key idle for longer than
 * the window is dropped, and the map never holds more than MAX_TRACKED_KEYS
 * (the least recently seen go first). Before, every client ever seen stayed
 * in memory for the life of the process.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_TRACKED_KEYS = 10_000;

// Insertion order is recency order: a key is re-inserted on every request.
const requestLog = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number): void {
  for (const [key, hits] of requestLog) {
    if (now - hits[hits.length - 1] >= WINDOW_MS) requestLog.delete(key);
  }
  lastSweep = now;
}

/** Returns true if `key` has exceeded MAX_REQUESTS_PER_WINDOW requests in the last minute. */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  if (now - lastSweep >= WINDOW_MS) sweep(now);

  const recent = (requestLog.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  requestLog.delete(key);
  requestLog.set(key, recent);
  while (requestLog.size > MAX_TRACKED_KEYS) {
    requestLog.delete(requestLog.keys().next().value as string);
  }
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

/** How many keys the limiter is holding. For tests. */
export function trackedKeyCount(): number {
  return requestLog.size;
}

/** Best-effort client IP extraction from standard proxy headers. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
