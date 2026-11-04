// A reader's flow, read-only: the front page lists stories, each linking to its article page. The
// article page itself is not opened: it scrapes the source site and fetches suggested stories from
// NEXT_PUBLIC_BASE_URL, so its time depends on sites outside the test.

import { expect, test } from "@playwright/test";

test("the front page lists stories, each linking to an article page", async ({ page }) => {
  await page.goto("/");
  const stories = page.locator('a[href^="/article/"]');
  await expect(stories.first()).toBeVisible();
  expect(await stories.count()).toBeGreaterThan(0);
  expect(await stories.first().getAttribute("href")).toMatch(/^\/article\/[^/]+/);
});
