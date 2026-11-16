import "server-only";

import { refreshNews } from "@timesprime/server/services/news/refreshNews";
import { isRefreshDue, NEWS_REFRESH_INTERVAL_MINUTES } from "@timesprime/shared/config/newsRefresh";
import { readLastStartedAt, recordStart } from "./refreshState";

// The worker's jobs, by name. The server's timer starts one per tick with
// `npm run job -w @timesprime/worker -- <name>`; the exit code tells it whether the run worked.
export type Job = () => Promise<number>;

async function refreshNewsJob(): Promise<number> {
  // The timer fires every 15 minutes; the refresh runs once an interval has passed (R12-04).
  const now = Date.now();
  const lastStartedAt = readLastStartedAt();
  if (!isRefreshDue(lastStartedAt, now)) {
    console.log(
      JSON.stringify({ skipped: true, lastStartedAt: new Date(lastStartedAt as number).toISOString(), intervalMinutes: NEWS_REFRESH_INTERVAL_MINUTES })
    );
    return 0;
  }
  // Recorded before the run, so a run still going at the next tick is not started twice.
  recordStart(now);

  const outcome = await refreshNews();
  if (!outcome.ok) {
    console.error(outcome.error);
    return 1;
  }
  console.log(JSON.stringify(outcome.result));
  // A failed category is reported (and in Sentry) but must also fail the run, so the
  // scheduler's alarm sees it.
  return outcome.result.failed === 0 ? 0 : 1;
}

export const JOBS: Record<string, Job> = {
  "refresh-news": refreshNewsJob,
};

export async function runJob(name: string | undefined, jobs: Record<string, Job> = JOBS): Promise<number> {
  const job = name ? jobs[name] : undefined;
  if (!job) {
    console.error(`Unknown job "${name ?? ""}". Jobs: ${Object.keys(jobs).join(", ")}`);
    return 2;
  }
  return job();
}
