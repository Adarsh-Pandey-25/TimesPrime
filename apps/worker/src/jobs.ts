import "server-only";

import { makePendingRenditions } from "@timesprime/server/services/desk/renditions";
import { publishDueStories } from "@timesprime/server/services/desk/scheduler";
import { refreshNews } from "@timesprime/server/services/news/refreshNews";
import { dryRunRefresh } from "@timesprime/server/services/news/refreshDryRun";
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

/**
 * R12-05: the batched refresh against today's, side by side, writing nothing. Run by hand, once,
 * after the NewsData plan is bought; never by the timer. Exits 1 if a call failed.
 */
async function refreshNewsDryRunJob(): Promise<number> {
  const outcome = await dryRunRefresh();
  if (!outcome.ok) {
    console.error(outcome.error);
    return 1;
  }
  const { calls, rows, failures } = outcome.report;
  console.log(`NewsData calls a run: ${calls.single} today, ${calls.batched} batched. Articles per category:`);
  console.log("language  category       today  batched");
  for (const r of rows) {
    console.log(`${r.language.padEnd(9)} ${r.category.padEnd(14)} ${String(r.single).padStart(5)}  ${String(r.batched).padStart(7)}`);
  }
  for (const failure of failures) console.error(`failed: ${failure}`);
  console.log(JSON.stringify(outcome.report));
  return failures.length === 0 ? 0 : 1;
}

/**
 * Panel 2 (design §6): publishes the Desk's scheduled stories whose time has come
 * (packages/server/src/services/desk/scheduler.ts). The server's timer starts it every
 * PUBLISH_TICK_MINUTES (deploy/systemd/timesprime-publish.timer). Exits 1 when a story failed, or
 * when the due stories could not be read, so the journal and the worker's log group see it.
 */
async function publishScheduledJob(): Promise<number> {
  const run = await publishDueStories();
  console.log(JSON.stringify(run));
  for (const failure of run.failed) console.error(`failed: ${failure.id}: ${failure.error}`);
  return run.failed.length === 0 ? 0 : 1;
}

/**
 * Panel 2 (design §7): makes the renditions of the library's images that have none yet
 * (packages/server/src/services/desk/renditions.ts). The server's timer starts it every
 * RENDITIONS_TICK_MINUTES (deploy/systemd/timesprime-renditions.timer). An image whose file is
 * unusable is recorded as failed (the library shows it) and the run still exits 0; it exits 1 when
 * an image was left waiting by a storage or database failure, or the waiting images could not be
 * read, so the journal and the worker's log group see it.
 */
async function makeRenditionsJob(): Promise<number> {
  try {
    const run = await makePendingRenditions();
    console.log(JSON.stringify({ made: run.made.length, unusable: run.unusable.length, failed: run.failed.length, more: run.more }));
    for (const image of run.unusable) console.warn(`unusable: ${image.id}: ${image.error}`);
    for (const image of run.failed) console.error(`failed: ${image.id}: ${image.error}`);
    return run.failed.length === 0 ? 0 : 1;
  } catch (err) {
    console.error(`make-renditions: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

export const JOBS: Record<string, Job> = {
  "refresh-news": refreshNewsJob,
  "refresh-news-dry-run": refreshNewsDryRunJob,
  "publish-scheduled": publishScheduledJob,
  "make-renditions": makeRenditionsJob,
};

export async function runJob(name: string | undefined, jobs: Record<string, Job> = JOBS): Promise<number> {
  const job = name ? jobs[name] : undefined;
  if (!job) {
    console.error(`Unknown job "${name ?? ""}". Jobs: ${Object.keys(jobs).join(", ")}`);
    return 2;
  }
  return job();
}
