// A reader's flow, read-only: the front page lists the database's stories, each linking to its
// article page (R1-12: readers read the database only). In CI the database is a stand-in with three
// fixed stories (e2e/supabase-stub.mjs); locally it is the real one.

import { expect, test } from "@playwright/test";

// R2: /article/{headline-slug}-{article_id}, with no publisher link in our URLs.
const STORY_PATH = /^\/article\/[a-z0-9-]*[A-Za-z0-9]+$/;

test("the front page lists stories, each linking to an article page", async ({ page }) => {
  await page.goto("/");
  const stories = page.locator('a[href^="/article/"]');
  await expect(stories.first()).toBeVisible();
  expect(await stories.count()).toBeGreaterThan(0);
  expect(await stories.first().getAttribute("href")).toMatch(STORY_PATH);
  if (process.env.CI) await expect(page.getByText("Parliament passes the annual budget").first()).toBeVisible();
});

test("a story's page answers 200 at its own address, its canonical, and stays noindex", async ({ page }) => {
  await page.goto("/");
  const href = (await page.locator('a[href^="/article/"]').first().getAttribute("href"))!;
  const response = await page.goto(href);
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(href);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${href}$`));
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
});

// BL-042: a real 404, not a 200 with noindex.
test("an unknown story answers 404", async ({ request }) => {
  const response = await request.get("/article/no-such-story-00000000000000000000000000000000", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

// The stand-in's stored link; the real database's links are not known in advance.
test("an old ?url= address redirects (308) to the story's address", async ({ request }) => {
  test.skip(!process.env.CI, "needs the stand-in's known story");
  const response = await request.get(`/article/old?url=${encodeURIComponent("https://publisher.example/stub-1")}`, { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toBe("/article/parliament-passes-the-annual-budget-stub0001");
});
