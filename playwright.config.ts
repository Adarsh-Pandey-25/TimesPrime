import { defineConfig, devices } from "@playwright/test";

// The browser tests (`npm run test:e2e`): a production build of each app, driven in Chromium. They
// are read-only (owner rule, 2026-11-02): locally the apps use the real database in the root `.env`, so
// no test signs in, submits a form that writes, or creates data. In CI there is no `.env`: the back
// office runs without Supabase, and the reader site, which reads stories only from the database
// since R1-12, reads them from a stand-in that answers with three fixed stories
// (e2e/supabase-stub.mjs). Ports 3100 (reader site), 3101 (back office) and 3199 (the stand-in), so
// a `npm run dev` on 3000 or 3001 is never touched.
const WEB = 3100;
const ADMIN = 3101;
const SUPABASE_STUB = 3199;
const ci = Boolean(process.env.CI);
// NEXT_PUBLIC_ values are fixed at build, so the reader's build and start both get the stand-in.
const readerEnv = ci
  ? { NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${SUPABASE_STUB}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub-anon-key" }
  : {};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "web", testMatch: "reader.spec.ts", use: { baseURL: `http://localhost:${WEB}` } },
    { name: "admin", testMatch: ["admin-access.spec.ts", "accessibility.spec.ts"], use: { baseURL: `http://localhost:${ADMIN}` } },
  ],
  webServer: [
    ...(ci ? [{ command: `node e2e/supabase-stub.mjs ${SUPABASE_STUB}`, url: `http://localhost:${SUPABASE_STUB}/`, env: {} }] : []),
    { cwd: "apps/web", command: `npx next build && npx next start -p ${WEB}`, url: `http://localhost:${WEB}/about`, env: readerEnv },
    { cwd: "apps/admin", command: `npx next build && npx next start -p ${ADMIN}`, url: `http://localhost:${ADMIN}/admin/login` },
  ].map((server) => ({
    ...server,
    env: { ...(process.env as Record<string, string>), ...server.env },
    reuseExistingServer: !ci,
    timeout: 600_000,
    stdout: "ignore" as const,
    stderr: "pipe" as const,
  })),
});
