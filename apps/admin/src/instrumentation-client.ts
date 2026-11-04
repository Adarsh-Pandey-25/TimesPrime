import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@timesprime/shared/lib/sentryScrub";
import { registerClientErrorReporter } from "@timesprime/shared/lib/clientErrorReport";

// DSN is not a secret (Sentry's own docs use it client-side) but must be
// NEXT_PUBLIC_-prefixed to actually reach the browser bundle.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend: (event) => scrubSentryEvent(event),
});

// What the error boundaries catch reaches Sentry through this (R1-07,
// packages/shared/src/lib/clientErrorReport.ts), so they need not import the SDK.
registerClientErrorReporter((error) => Sentry.captureException(error));

// Required by the SDK to instrument App Router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
