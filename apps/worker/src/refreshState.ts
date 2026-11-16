import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * When the refresh last started (R12-04), kept in one small file so a timer tick that comes before
 * the interval has passed can skip. On the server the folder is a Docker volume
 * (deploy/compose.yml), so it survives the worker container, which each tick starts afresh.
 * WORKER_STATE_DIR overrides the folder (tests). If the file cannot be read, the run is due; if it
 * cannot be written, the run still happens and the failure is logged: a missed skip costs one
 * extra NewsData run, a missed refresh would cost the feed.
 */
const DEFAULT_STATE_DIR = "/var/lib/timesprime";

function stateFile(): string {
  return path.join(process.env.WORKER_STATE_DIR || DEFAULT_STATE_DIR, "refresh-news.json");
}

export function readLastStartedAt(): number | null {
  try {
    const value = JSON.parse(fs.readFileSync(stateFile(), "utf8"))?.lastStartedAt;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

export function recordStart(at: number): void {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ lastStartedAt: at }));
  } catch (err) {
    console.warn("refresh-news: could not record the run's start; the next tick may run again:", err instanceof Error ? err.message : err);
  }
}
