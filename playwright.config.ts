import { defineConfig, devices } from "@playwright/test";

// The browser tests (`npm run test:e2e`): a production build of the app, driven in Chromium. They
// are read-only (owner rule, 2026-11-02): locally the app uses the real database in `.env.local`, so
// no test signs in, submits a form that writes, or creates data. In CI there is no `.env.local`, and
// the app runs without Supabase. Port 3100, so a `npm run dev` on 3000 is never touched.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
