import "server-only";

import { refreshNews } from "@timesprime/server/services/news/refreshNews";

// The worker's jobs, by name. A scheduler (EventBridge on AWS) starts one per run with
// `npm run job -w @timesprime/worker -- <name>`; the exit code tells it whether the run worked.
export type Job = () => Promise<number>;

async function refreshNewsJob(): Promise<number> {
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
