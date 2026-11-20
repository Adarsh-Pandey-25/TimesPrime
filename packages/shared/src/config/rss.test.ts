/**
 * @jest-environment node
 *
 * The RSS feeds' addresses and names (Panel 3, M4): two site feeds and one per section, in English
 * and Hindi, and nothing else.
 */

import { ALL_RSS_FEEDS, rssAlternates, rssFeedFrom, rssPath, rssTitle } from "./rss";

test("each feed's address, and the route's segments read back to the same feed", () => {
  expect(ALL_RSS_FEEDS).toHaveLength(18);
  for (const feed of ALL_RSS_FEEDS) {
    const [, , first, second] = rssPath(feed).split("/");
    expect(rssFeedFrom(first, second)).toEqual(feed);
  }
  expect(rssPath({ language: "en", section: null })).toBe("/rss/en.xml");
  expect(rssPath({ language: "hi", section: "sports" })).toBe("/rss/hi/sports.xml");
});

test.each([
  ["fr.xml", undefined],
  ["en", undefined],
  ["en.json", undefined],
  ["en", "politics.xml"],
  ["en", "sports"],
  ["xx", "sports.xml"],
  ["en.xml", "sports.xml"],
])("%s / %s is no feed", (first, second) => {
  expect(rssFeedFrom(first, second)).toBeNull();
});

test("names in the feed's language; a page points to both languages' feeds", () => {
  expect(rssTitle({ language: "en", section: null })).toBe("TimesPrime (English)");
  expect(rssTitle({ language: "hi", section: "sports" })).toBe("TimesPrime: खेल");
  expect(rssAlternates("tech")).toEqual([
    { url: "/rss/en/tech.xml", title: "TimesPrime: Technology" },
    { url: "/rss/hi/tech.xml", title: "TimesPrime: तकनीक" },
  ]);
});
