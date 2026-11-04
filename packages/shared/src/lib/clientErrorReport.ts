/**
 * How the error boundaries (error.tsx, global-error.tsx) report what they catch (R1-07), without
 * importing the Sentry SDK themselves. A boundary catches the error, so Sentry's own handlers never
 * see it; but a static import of @sentry/nextjs in a boundary put a second copy of the SDK into
 * every page's bundle (+12 KB a route, measured; a dynamic import, +20 KB). So each app's
 * instrumentation-client.ts, which already loads the SDK, registers the reporter here, and a
 * boundary calls reportClientError.
 *
 * The reporter is kept on globalThis under one key, not in a module variable: the bundler may give
 * a boundary's chunk its own copy of this module, and every copy must reach the same reporter.
 */
const KEY = "__timesprimeReportClientError";

type Reporter = (error: unknown) => void;

export function registerClientErrorReporter(report: Reporter): void {
  (globalThis as Record<string, unknown>)[KEY] = report;
}

/** Sends the error to the registered reporter; with none (tests, a failed init), to the console. */
export function reportClientError(error: unknown): void {
  const report = (globalThis as Record<string, unknown>)[KEY];
  if (typeof report === "function") (report as Reporter)(error);
  else console.error(error);
}
