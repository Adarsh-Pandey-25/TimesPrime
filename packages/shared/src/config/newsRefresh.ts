/**
 * How often the worker's refresh-news job runs (R1-03), in minutes. The one value: everything else
 * about the refresh interval derives from it.
 *
 * - The schedule: EventBridge Scheduler starts the worker with NEWS_REFRESH_SCHEDULE (the owner
 *   runbook in docs/OPERATIONS.md quotes it, and a test keeps the two equal).
 * - The feed's freshness window: NEWS_FRESHNESS_WINDOW_MS in packages/server/src/repositories/db.ts.
 * - The back office's "next sync" estimate (apps/admin/src/components/SyncDashboard.tsx).
 *
 * 30 minutes is the owner's senior's figure (4 Nov 2026). Each run makes one NewsData call per
 * feed category (refreshNews.ts), so the job's calls a day are the categories times
 * NEWS_REFRESH_RUNS_PER_DAY; refreshNews.test.ts pins the number. Before go-live it is checked
 * against 70% of the NewsData plan's daily limit (owner decision 7 of R0 v2).
 */
export const NEWS_REFRESH_INTERVAL_MINUTES = 30;

/** EventBridge Scheduler's rate expression for the interval. */
export const NEWS_REFRESH_SCHEDULE = `rate(${NEWS_REFRESH_INTERVAL_MINUTES} minutes)`;

/** Scheduled runs a day at this interval. */
export const NEWS_REFRESH_RUNS_PER_DAY = Math.floor((24 * 60) / NEWS_REFRESH_INTERVAL_MINUTES);
