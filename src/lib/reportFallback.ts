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

/** Returns true when this call produced a report, false when it was suppressed. */
export function reportFallback(kind: string, detail: Detail = {}): boolean {
  const now = Date.now();
  const entry = lastReport.get(kind);
  if (entry && now - entry.at < FALLBACK_REPORT_WINDOW_MS) {
    entry.suppressed += 1;
    return false;
  }

  const extra = { ...detail, suppressedSinceLastReport: entry?.suppressed ?? 0 };
  lastReport.set(kind, { at: now, suppressed: 0 });

  console.warn(`[fallback] ${kind}`, extra);
  Sentry.captureMessage(`Fallback: ${kind}`, { level: "warning", tags: { fallback: kind }, extra });
  return true;
}
