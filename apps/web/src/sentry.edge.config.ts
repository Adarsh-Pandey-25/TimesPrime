import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@timesprime/shared/lib/sentryScrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend: (event) => scrubSentryEvent(event),
  // No IP addresses, cookies or request bodies (R1-11): Sentry keeps data in the US or the EU,
  // so it is a scrubbed copy for triage; the logs of record stay in ap-south-1. The SDK's
  // default, said here so an upgrade or an edit cannot turn it on unnoticed.
  sendDefaultPii: false,
});
