import { defineConfig, devices } from "@playwright/test";

// The browser tests (`npm run test:e2e`): a production build of each app, driven in Chromium. They
// are read-only (owner rule, 2026-11-02): locally the apps use the real database in the root `.env`, so
// no test signs in, submits a form that writes, or creates data. In CI there is no `.env`, and
// the apps run without Supabase. Ports 3100 (reader site) and 3101 (back office), so a `npm run dev`
// on 3000 or 3001 is never touched.
const WEB = 3100;
const ADMIN = 3101;

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
    { cwd: "apps/web", command: `npx next build && npx next start -p ${WEB}`, url: `http://localhost:${WEB}/about` },
    { cwd: "apps/admin", command: `npx next build && npx next start -p ${ADMIN}`, url: `http://localhost:${ADMIN}/admin/login` },
  ].map((server) => ({ ...server, reuseExistingServer: !process.env.CI, timeout: 600_000, stdout: "ignore" as const, stderr: "pipe" as const })),
});
