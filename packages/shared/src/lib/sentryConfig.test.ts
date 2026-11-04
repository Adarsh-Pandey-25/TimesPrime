/**
 * @jest-environment node
 *
 * Every Sentry.init in both apps (browser, server, edge) scrubs its events and sends no default
 * PII (R1-11): Sentry is a copy for triage outside India, never the system of record.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const FILES = ["instrumentation-client.ts", "sentry.server.config.ts", "sentry.edge.config.ts"].flatMap((f) =>
  ["web", "admin"].map((app) => `apps/${app}/src/${f}`)
);

test.each(FILES)("%s: one Sentry.init, scrubbed, sendDefaultPii false", (file) => {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  expect(source.split("Sentry.init(").length - 1).toBe(1);
  expect(source).toContain("beforeSend: (event) => scrubSentryEvent(event),");
  expect(source).toMatch(/^\s*sendDefaultPii: false,$/m);
});
