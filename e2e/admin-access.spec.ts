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
  test("/admin/desk, a story's screen, its preview and the authors redirect to the sign-in page", async ({ page }) => {
    await page.goto("/admin/desk");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/desk/00000000-0000-4000-8000-000000000001");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/desk/00000000-0000-4000-8000-000000000001/preview");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/desk/authors");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/desk/media");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  // Panel 3: the Front page screen too.
  test("/admin/front-page redirects to the sign-in page", async ({ page }) => {
    await page.goto("/admin/front-page");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  // Panel 1: the people screens and API are behind the same session check.
  test("/admin/people, a person's page and adding a person redirect to the sign-in page", async ({ page }) => {
    await page.goto("/admin/people");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/people/00000000-0000-4000-8000-000000000001");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/people/new");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/people/review");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  // Panel 1 M2: the welcome page is public; without a token it says so and asks the server nothing.
  test("/admin/welcome without a token explains itself, with no call to the server", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/admin/")) asked.push(r.url());
    });
    await page.goto("/admin/welcome");
    await expect(page).toHaveURL(/\/admin\/welcome$/);
    // Next adds its own route announcer with role="alert", so the page's message is found by its text.
    await expect(page.getByRole("alert").filter({ hasText: "This link is not complete" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to sign-in" })).toHaveAttribute("href", "/admin/login");
    expect(asked).toEqual([]);
  });

  for (const [method, path] of [
    ["GET", "/api/admin/stats"],
    ["GET", "/api/admin/logs"],
    ["GET", "/api/admin/me"],
    ["POST", "/api/admin/breaking-news"],
    ["POST", "/api/admin/mfa"],
    ["GET", "/api/admin/desk/stories"],
    ["POST", "/api/admin/desk/stories"],
    ["GET", "/api/admin/desk/authors"],
    ["GET", "/api/admin/desk/media"],
    ["POST", "/api/admin/desk/media"],
    ["GET", "/api/admin/desk/media/00000000-0000-4000-8000-000000000001/original"],
    ["POST", "/api/admin/desk/stories/00000000-0000-4000-8000-000000000001/publish"],
    ["GET", "/api/admin/people"],
    ["POST", "/api/admin/people/00000000-0000-4000-8000-000000000001/roles"],
    ["POST", "/api/admin/people/requests/00000000-0000-4000-8000-000000000001/approve"],
    ["GET", "/api/admin/people/alerts"],
    ["POST", "/api/admin/people/break-glass"],
    ["GET", "/api/admin/front-page/pins?language=hi"],
    ["POST", "/api/admin/front-page/pins"],
    ["POST", "/api/admin/front-page/pins/00000000-0000-4000-8000-000000000001/end"],
    ["GET", "/api/admin/front-page/stories?language=en"],
  ]) {
    test(`${method} ${path} answers 401 and changes nothing`, async ({ request }) => {
      const res = await request.fetch(path, { method, data: method === "POST" ? {} : undefined });
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized: please log in." });
    });
  }
});
