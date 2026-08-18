/**
 * Basic in-memory fixed-window rate limiter. Fine for a single-instance dev
 * server; on serverless (multiple instances) it's advisory rather than a
 * hard global cap, same caveat as the in-memory news cache in lib/cache.ts.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

const requestLog = new Map<string, number[]>();

/** Returns true if `key` has exceeded MAX_REQUESTS_PER_WINDOW requests in the last minute. */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

/** Best-effort client IP extraction from standard proxy headers. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
