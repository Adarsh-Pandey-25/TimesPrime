import * as Sentry from "@sentry/nextjs";

/**
 * Rate-limited report that the app served something other than its primary
 * source (owner decision D5). The reader still gets an answer; this only
 * makes sure the substitution is visible, so an outage cannot be silent the
 * way F-002 was.
 *
 * Every occurrence is counted, but each kind produces at most one Sentry
 * event and one log line per FALLBACK_REPORT_WINDOW_MS per instance; the next
 * report carries how many were suppressed in between. Kinds are a small,
 * fixed set of strings chosen by the caller, so the map stays bounded.
 *
 * `detail` values must be short and non-sensitive (codes, category names);
 * the Sentry scrubber (sentryScrub.ts) is a backstop, not the plan.
 */

export const FALLBACK_REPORT_WINDOW_MS = 5 * 60 * 1000;

type Detail = Record<string, string | number | boolean>;

const lastReport = new Map<string, { at: number; suppressed: number }>();

/**
 * The limiter behind reportFallback, for callers that make their own Sentry
 * call (db.ts keeps its own messages and tags, BL-014). Runs `send` at most
 * once per key per FALLBACK_REPORT_WINDOW_MS per instance and passes it how
 * many calls were suppressed since the last report. Keys must come from a
 * small fixed set, so the map stays bounded. Returns whether `send` ran.
 */
export function throttleReport(key: string, send: (suppressedSinceLastReport: number) => void): boolean {
  const now = Date.now();
  const entry = lastReport.get(key);
  if (entry && now - entry.at < FALLBACK_REPORT_WINDOW_MS) {
    entry.suppressed += 1;
    return false;
  }
  lastReport.set(key, { at: now, suppressed: 0 });
  send(entry?.suppressed ?? 0);
  return true;
}

/** Returns true when this call produced a report, false when it was suppressed. */
export function reportFallback(kind: string, detail: Detail = {}): boolean {
  return throttleReport(`fallback:${kind}`, (suppressedSinceLastReport) => {
    const extra = { ...detail, suppressedSinceLastReport };
    console.warn(`[fallback] ${kind}`, extra);
    Sentry.captureMessage(`Fallback: ${kind}`, { level: "warning", tags: { fallback: kind }, extra });
  });
}
