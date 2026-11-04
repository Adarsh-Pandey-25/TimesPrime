import path from "node:path";
import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { withSentryConfig } from "@sentry/nextjs/config";
import { ALLOWED_IMAGE_HOSTNAMES } from "@timesprime/shared/config/imageDomains";

// One set of env files for every app, at the repository root. Next has already loaded this app's
// folder (none there) before it evaluates this file, and @next/env returns that cached result to a
// second call, so the root is loaded with forceReload (the fourth argument). Variables already set
// in the process keep their value. In tests the root .env.test empties every key first.
const repoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", undefined, true);

// No CORS headers: every API route is called same-origin by this app's own
// pages, and the admin API must never be scriptable from another site.
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
  images: {
    // https only, explicit hostnames only — kept in sync with topicImages.ts
    // via the shared ALLOWED_IMAGE_HOSTNAMES list (packages/shared/src/config/imageDomains.ts).
    //
    // The `{,*.}` prefix is what makes that sync real rather than nominal.
    // Sharing the list is not enough on its own: isAllowedImageUrl matches
    // with `hostname === host || hostname.endsWith("." + host)` (subdomains
    // count), while a bare `hostname` pattern here is an exact match. That
    // gap meant topicImages.ts handed https://i.newsdata.io/... to <Image>
    // — "newsdata.io" is on the list — and next/image then threw "hostname
    // is not configured" at runtime, because the pattern "newsdata.io" does
    // not match "i.newsdata.io".
    //
    // hostname is matched with picomatch (next/dist/shared/lib/
    // match-remote-pattern.js), so a glob is the fix. `{,*.}host` expands to
    // "host" OR "*.host" — exactly isAllowedImageUrl's rule, so the two now
    // accept the same set by construction. Verified against the bundled
    // picomatch: matches host, i.host and a.b.host; rejects evilhost and
    // host.evil.com. Do NOT "simplify" this to `**${hostname}` — that form
    // matches evilnewsdata.io, i.e. any attacker domain ending in a listed
    // name.
    //
    // Still one pattern per entry, so the 50-pattern cap documented in
    // imageDomains.ts (enforced by zod .max(50) in next/dist/server/
    // config-schema.js) is unaffected: 49 entries, 49 patterns.
    remotePatterns: ALLOWED_IMAGE_HOSTNAMES.map((hostname) => ({
      protocol: "https" as const,
      hostname: `{,*.}${hostname}`,
    })),
  },
};

// Wraps the config to upload source maps to Sentry at build time and inject
// the release/tunnel config. Gracefully skips source map upload (with a
// warning, not an error) when SENTRY_AUTH_TOKEN/org/project aren't set —
// safe to leave wrapped even before a Sentry project exists.
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

