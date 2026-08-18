import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { ALLOWED_IMAGE_HOSTNAMES } from "./src/lib/imageDomains";

// Static (build-time) origin selection: dev always allows localhost, a
// production build always allows the configured deployed origin. next.config
// headers() can't inspect the incoming request's Origin per-call, so this is
// resolved once per environment rather than per-request.
const allowedOrigin =
  process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_APP_URL || "https://timesprimenews.com"
    : "http://localhost:3000";

const corsHeaders = [
  { key: "Access-Control-Allow-Origin", value: allowedOrigin },
  { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "*" },
  { key: "ngrok-skip-browser-warning", value: "true" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "grinch-failing-purebred.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok.io",
  ],
  images: {
    // https only, explicit hostnames only — kept in sync with topicImages.ts
    // via the shared ALLOWED_IMAGE_HOSTNAMES list (src/lib/imageDomains.ts).
    remotePatterns: ALLOWED_IMAGE_HOSTNAMES.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "ngrok-skip-browser-warning", value: "true" },
        ],
      },
      {
        // Public-facing API routes only — not admin, and not pages
        // (pages are never called cross-origin, so they don't need CORS).
        source: "/api/news/:path*",
        headers: corsHeaders,
      },
      {
        source: "/api/chat",
        headers: corsHeaders,
      },
      {
        // Admin API: no CORS headers at all. This surface is meant only for
        // same-origin calls from the /admin page and direct server-to-server
        // calls carrying an Authorization header — neither needs CORS, and a
        // wildcard here would have let any website script your admin panel
        // from a logged-in admin's browser.
        source: "/api/admin/:path*",
        headers: [{ key: "ngrok-skip-browser-warning", value: "true" }],
      },
    ];
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

