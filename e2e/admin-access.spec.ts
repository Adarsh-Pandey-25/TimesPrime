// The refused-access flow, read-only: nothing here signs in, so nothing is written to the database
// (owner rule, 2026-11-02: e2e tests against the real database are read-only). The staff sign-in,
// MFA and audit flows are verified by the owner with the staff-access runbook (docs/OPERATIONS.md).

import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  test("/admin redirects to the sign-in page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();
  });

  // Panel 2: the Desk's screens and API are behind the same session check.
  test("/admin/desk, a story's screen and its preview redirect to the sign-in page", async ({ page }) => {
    await page.goto("/admin/desk");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/desk/00000000-0000-4000-8000-000000000001");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/desk/00000000-0000-4000-8000-000000000001/preview");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  for (const [method, path] of [
    ["GET", "/api/admin/stats"],
    ["GET", "/api/admin/logs"],
    ["GET", "/api/admin/me"],
    ["POST", "/api/admin/breaking-news"],
    ["POST", "/api/admin/mfa"],
    ["GET", "/api/admin/desk/stories"],
    ["POST", "/api/admin/desk/stories"],
    ["POST", "/api/admin/desk/stories/00000000-0000-4000-8000-000000000001/publish"],
  ]) {
    test(`${method} ${path} answers 401 and changes nothing`, async ({ request }) => {
      const res = await request.fetch(path, { method, data: method === "POST" ? {} : undefined });
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized: please log in." });
    });
  }
});
