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

// R2: each section at its own URL.
test("a section's page answers 200 with its own title and canonical link", async ({ page }) => {
  const response = await page.goto("/sports");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/^Sports News/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/sports$/);
});

test("the old category view redirects (308) to the section's URL", async ({ request }) => {
  const response = await request.get("/?category=world", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toMatch(/^\/world(\?|$)/);
});

test("an unknown section answers 404", async ({ request }) => {
  const response = await request.get("/no-such-section", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

test("the menu links the sections' URLs", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('header a[href="/india"]').first()).toBeAttached();
  expect(await page.locator('a[href^="/?category="]').count()).toBe(0);
});

// Panel 2 (M3): the Desk's own stories, at /{section}/{slug}-{number} in English and under /hi/ in
// Hindi. The stand-in has one of each; the real database's published stories are not known in advance.
test("a Desk story's page answers 200 at its own address, uncached, in its language", async ({ page }) => {
  test.skip(!process.env.CI, "needs the stand-in's published story");
  const response = await page.goto("/india/parliament-debates-the-budget-101");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.locator('article[lang="en"] h1')).toHaveText("Parliament debates the budget");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/india\/parliament-debates-the-budget-101$/);
});

test("a Hindi Desk story is under /hi/, marked as Hindi", async ({ page }) => {
  test.skip(!process.env.CI, "needs the stand-in's published story");
  const response = await page.goto("/hi/india/sansad-mein-bajat-par-bahas-102");
  expect(response?.status()).toBe(200);
  await expect(page.locator('article[lang="hi"] h1')).toHaveText("संसद में बजट पर बहस");
});

test("another address of a Desk story redirects (308) to its own", async ({ request }) => {
  test.skip(!process.env.CI, "needs the stand-in's published story");
  const response = await request.get("/india/an-old-slug-101", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toBe("/india/parliament-debates-the-budget-101");
});

test("an unknown Desk story answers 404, in English and in Hindi", async ({ request }) => {
  expect((await request.get("/india/no-such-story-999999999", { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get("/hi/india/no-such-story-999999999", { maxRedirects: 0 })).status()).toBe(404);
});

// R2: the publisher's structured data on the home page.
test("the home page describes the publisher as a NewsMediaOrganization", async ({ page }) => {
  await page.goto("/");
  const texts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = texts.flatMap((t) => (JSON.parse(t)["@graph"] ?? []).map((n: { "@type": string }) => n["@type"]));
  expect(types).toEqual(expect.arrayContaining(["NewsMediaOrganization", "WebSite"]));
});

// Panel 3, M2: the pinned row's JSON, for a Hindi reader's browser. Read-only: it lists live pins.
test("the pinned row's JSON answers a list in each language, and 400 for an unknown page", async ({ request }) => {
  for (const query of ["?language=hi", "?language=en&section=sports", ""]) {
    const res = await request.get(`/api/news/pins${query}`);
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).pins)).toBe(true);
  }
  expect((await request.get("/api/news/pins?language=hi&section=no-such-section")).status()).toBe(400);
});

// Panel 3, M3: a live blog's feed. Read-only: no live blog, or not a number, is a 404 never cached.
test("the live feed answers 404 for a story that is not a live blog", async ({ request }) => {
  for (const path of ["/api/live/999999999999", "/api/live/abc"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(404);
    expect(res.headers()["cache-control"]).toBe("no-store");
  }
});


// Panel 3, M4: the RSS feeds. Read-only: they list published stories.
test("the RSS feeds are RSS 2.0 XML, and the home page points to them", async ({ page, request }) => {
  for (const path of ["/rss/en.xml", "/rss/hi.xml", "/rss/en/sports.xml"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/rss+xml; charset=utf-8");
    const body = await res.text();
    expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(body).toContain('<rss version="2.0"');
    expect(body.trim().endsWith("</rss>")).toBe(true);
  }
  expect((await request.get("/rss/fr.xml")).status()).toBe(404);
  await page.goto("/");
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveCount(2);
});


// Panel 7, M1: the grievance form and the status page. Read-only: nothing is sent, as sending writes.
test("the grievance page offers the form and the status page; a partial grievance is refused before anything is written", async ({ page, request }) => {
  await page.goto("/grievance");
  const form = page.getByRole("form", { name: "Send a grievance" });
  await expect(form.getByRole("textbox", { name: "Your name" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Send the grievance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "check your grievance's status" })).toHaveAttribute("href", "/grievance/status");

  await page.goto("/grievance/status");
  await expect(page.getByRole("heading", { level: 1, name: "Grievance status" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // An empty body fails the fields' check, which runs before the rate limit and the database.
  const refused = await request.post("/api/grievances", { data: {} });
  expect(refused.status()).toBe(400);
  expect(refused.headers()["cache-control"]).toBe("no-store");
  expect(await refused.json()).toMatchObject({ code: "invalid" });
});
