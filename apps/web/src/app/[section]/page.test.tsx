/**
 * @jest-environment node
 *
 * R2: each section's page, at /<section>, with its own title and canonical link. Only the listed
 * sections exist: dynamicParams is off, so any other one-segment path is a 404 before rendering.
 */

jest.mock("../_feed/ArticlesFeed", () => ({ __esModule: true, default: jest.fn(() => null) }));

import { renderToStaticMarkup } from "react-dom/server";
import SectionPage, { dynamicParams, generateMetadata, generateStaticParams } from "./page";

const Feed = (jest.requireMock("../_feed/ArticlesFeed") as { default: jest.Mock }).default;

const props = (section: string, search?: string) => ({
  params: Promise.resolve({ section }),
  searchParams: Promise.resolve(search === undefined ? {} : { search }),
});

beforeEach(() => Feed.mockClear());

test("the eight sections are the only ones, and no other is rendered on demand", () => {
  expect(generateStaticParams().map((p) => p.section)).toEqual(["india", "world", "tech", "business", "sports", "entertainment", "health", "science"]);
  expect(dynamicParams).toBe(false);
});

test("a section's page is the feed for that category, with any search", async () => {
  renderToStaticMarkup(await SectionPage(props("sports", "Cricket")));
  expect(Feed.mock.calls[0][0]).toEqual({ category: "sports", search: "Cricket" });
});

test("its metadata: a title, a description, and a canonical link without the query", async () => {
  const metadata = await generateMetadata(props("tech", "AI"));
  expect(metadata.title).toBe("Technology News");
  expect(metadata.description).toMatch(/technology headlines/);
  expect(metadata.alternates?.canonical).toBe("/tech");
  expect(metadata.openGraph?.url).toBe("/tech");
  // Panel 3, M4: the section's RSS feeds, in both languages.
  expect(metadata.alternates?.types).toEqual({
    "application/rss+xml": [
      { url: "/rss/en/tech.xml", title: "TimesPrime: Technology" },
      { url: "/rss/hi/tech.xml", title: "TimesPrime: तकनीक" },
    ],
  });
});

test("an unknown section is not found", async () => {
  await expect(SectionPage(props("politics"))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  expect(await generateMetadata(props("politics"))).toEqual({});
});
