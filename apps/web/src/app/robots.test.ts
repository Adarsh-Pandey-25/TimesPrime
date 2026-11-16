/**
 * @jest-environment node
 *
 * robots.txt, the sitemap and the site URL they share (R1-09).
 */

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  jest.resetModules();
});

async function load(vars: Record<string, string | undefined>) {
  jest.resetModules();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const robots = (await import("./robots")).default;
  const sitemap = (await import("./sitemap")).default;
  const site = await import("@timesprime/shared/config/site");
  return { robots, sitemap, site };
}

test("the public site: crawl everything but the API, the back office and bookmarks; the sitemap", async () => {
  const { robots } = await load({ NEXT_PUBLIC_APP_URL: "https://news.example", NEXT_PUBLIC_SITE_NOINDEX: undefined });
  expect(robots()).toEqual({
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/admin-assets/", "/saved"] },
    sitemap: "https://news.example/sitemap.xml",
  });
});

test("a NEXT_PUBLIC_SITE_NOINDEX build (staging) disallows everything and names no sitemap", async () => {
  const { robots } = await load({ NEXT_PUBLIC_APP_URL: "https://staging.example", NEXT_PUBLIC_SITE_NOINDEX: "1" });
  expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
});

test("only \"1\" switches indexing off", async () => {
  for (const value of ["0", "true", "", undefined]) {
    const { site } = await load({ NEXT_PUBLIC_SITE_NOINDEX: value });
    expect(site.siteNoindex()).toBe(false);
  }
});

test("the sitemap lists the site's own pages, on its origin; a trailing slash on the origin is dropped", async () => {
  const { sitemap } = await load({ NEXT_PUBLIC_APP_URL: "https://news.example/" });
  expect(sitemap().map((e) => e.url)).toEqual([
    "https://news.example/",
    "https://news.example/about",
    "https://news.example/contact",
    "https://news.example/privacy",
    "https://news.example/terms",
  ]);
});

test("without NEXT_PUBLIC_APP_URL, the origin the article page always fell back to", async () => {
  const { site } = await load({ NEXT_PUBLIC_APP_URL: undefined });
  expect(site.SITE_URL).toBe("https://timesprimenews.com");
});
