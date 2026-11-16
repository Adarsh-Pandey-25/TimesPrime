/**
 * How often the worker's refresh-news job runs (R1-03, R12-04), in minutes. The one value: everything
 * else about the refresh interval derives from it.
 *
 * - The schedule: the server's systemd timer starts the worker every NEWS_REFRESH_TICK_MINUTES
 *   (deploy/), and the job runs only when the interval has passed since the last run started
 *   (`isRefreshDue`); otherwise it exits 0 at once.
 * - The feed's freshness window: NEWS_FRESHNESS_WINDOW_MS in packages/server/src/repositories/db.ts.
 * - The back office's "next sync" estimate (apps/admin/src/components/SyncDashboard.tsx).
 *
 * 60 minutes is the owner's senior's figure (16 Nov 2026). Each run makes one NewsData call per
 * feed category in English and in Hindi, 14 (refreshNews.ts), so the job's calls a day are 14 times
 * NEWS_REFRESH_RUNS_PER_DAY = 336, 50% of the NewsData Basic plan (20,000 a month, about 666 a day);
 * refreshNews.test.ts pins the number. The ceiling is 70% of the plan (owner decision 7 of R0 v2).
 * A shorter interval needs the batched calls (R12-05) first. An admin setting may later override it
 * from the database, never below the timer's tick (design in docs/OPERATIONS.md).
 */
export const NEWS_REFRESH_INTERVAL_MINUTES = 60;

/** How often the server's timer starts the worker: also the shortest interval there can be. */
export const NEWS_REFRESH_TICK_MINUTES = 15;

/** How early a tick may fire and still count as on time: timers drift by seconds, not minutes. */
export const NEWS_REFRESH_GRACE_MINUTES = 2;

/** Scheduled runs a day at this interval. */
export const NEWS_REFRESH_RUNS_PER_DAY = Math.floor((24 * 60) / NEWS_REFRESH_INTERVAL_MINUTES);

/**
 * Whether a tick should start a run: none recorded yet, or the interval, less the grace, has passed
 * since the last run started. A start in the future (the clock went back) or a broken value runs.
 */
export function isRefreshDue(
  lastStartedAt: number | null,
  now: number,
  intervalMinutes: number = NEWS_REFRESH_INTERVAL_MINUTES
): boolean {
  if (lastStartedAt === null || !Number.isFinite(lastStartedAt) || lastStartedAt > now) return true;
  return now - lastStartedAt >= (intervalMinutes - NEWS_REFRESH_GRACE_MINUTES) * 60_000;
}
