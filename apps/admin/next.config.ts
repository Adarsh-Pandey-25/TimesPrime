import path from "node:path";
import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { withSentryConfig } from "@sentry/nextjs/config";

// One set of env files for every app, at the repository root. Next reads only this
// app's folder by itself; variables already set keep their value.
loadEnvConfig(path.resolve(__dirname, "../.."), process.env.NODE_ENV !== "production");

// The back office. Its pages live under /admin and its API under /api/admin, so the proxy
// matcher and every route rule keep the paths they had in the single app.
const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/", destination: "/admin", permanent: false }];
  },
};

// Same Sentry wiring as the reader site (apps/web/next.config.ts).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: false,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
