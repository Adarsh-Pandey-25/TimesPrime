import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@timesprime/shared/lib/sentryScrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend: (event) => scrubSentryEvent(event),
});
