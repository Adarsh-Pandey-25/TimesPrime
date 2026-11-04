import path from "node:path";
import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { withSentryConfig } from "@sentry/nextjs/config";
import { ADMIN_ASSET_PREFIX } from "@timesprime/shared/config/adminAssets";

// One set of env files for every app, at the repository root. Next has already loaded this app's
// folder (none there) before it evaluates this file, and @next/env returns that cached result to a
// second call, so the root is loaded with forceReload (the fourth argument). Variables already set
// in the process keep their value. In tests the root .env.test empties every key first.
const repoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", undefined, true);

// The back office. Its pages live under /admin and its API under /api/admin, so the proxy
// matcher and every route rule keep the paths they had in the single app.
const nextConfig: NextConfig = {
  // This folder is the Next root, but the app imports packages/ from the repository root, where
  // the one package.json and lockfile are too. Turbopack resolves no file outside its root, and
  // output tracing includes none outside its own (bundled docs: next-config-js/turbopack.md "Root
  // directory", output.md), so both are the repository root. Turbopack would infer it from the
  // lockfile; stating it keeps a build machine that copies only part of the repo honest.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // next dev writes a managed block into AGENTS.md when it detects an AI agent (agentRules.md).
  // The repository keeps its Markdown in docs/ and CLAUDE.md, which carries the same instruction
  // (read the bundled Next docs); scripts/check-docs.mjs fails on any other Markdown file.
  agentRules: false,
  // The Docker image runs .next/standalone/apps/admin/server.js, as the reader site does
  // (apps/web/next.config.ts). Tailwind reads every word in this folder as a possible class name,
  // so a comment here that names a utility class adds it to the admin's CSS.
  output: "standalone",
  // Every chunk, CSS and font URL under /admin-assets, so the shared CloudFront distribution can
  // send them to this service and never to the reader site's (R1-04,
  // packages/shared/src/config/adminAssets.ts).
  assetPrefix: ADMIN_ASSET_PREFIX,
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
