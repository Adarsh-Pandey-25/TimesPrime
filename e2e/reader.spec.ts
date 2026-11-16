// A reader's flow, read-only: the front page lists the database's stories, each linking to its
// article page (R1-12: readers read the database only). In CI the database is a stand-in with three
// fixed stories (e2e/supabase-stub.mjs); locally it is the real one. The article page itself is not
// opened: it scrapes the source site, so its time depends on sites outside the test.

import { expect, test } from "@playwright/test";

test("the front page lists stories, each linking to an article page", async ({ page }) => {
  await page.goto("/");
  const stories = page.locator('a[href^="/article/"]');
  await expect(stories.first()).toBeVisible();
  expect(await stories.count()).toBeGreaterThan(0);
  expect(await stories.first().getAttribute("href")).toMatch(/^\/article\/[^/]+/);
  if (process.env.CI) await expect(page.getByText("Parliament passes the annual budget").first()).toBeVisible();
});
