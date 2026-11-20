/**
 * @jest-environment jsdom
 *
 * The RSS feeds (Panel 3 design §5, M4): RSS 2.0 that parses as XML whatever a headline holds, the
 * last 50 published Desk stories with a stable id each, kept 5 minutes and forgotten when the back
 * office publishes or takes down one of their stories. jsdom's DOMParser checks the XML.
 */

jest.mock("../../repositories/stories", () => ({ listRecentPublished: jest.fn() }));
// The shared cache as a map: under jsdom, Upstash's client would load its browser build.
jest.mock("../../lib/cache", () => {
  const store = new Map<string, unknown>();
  return {
    cache: {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: unknown) => void store.set(key, value)),
      del: jest.fn(async (key: string) => void store.delete(key)),
    },
  };
});

import type { FeedStory } from "../../repositories/stories";
import { forgetStoryFeeds, rssFeed, rssKey, rssXml, xmlText } from "./rss";

const { listRecentPublished } = jest.requireMock("../../repositories/stories") as { listRecentPublished: jest.Mock };
const { cache } = jest.requireMock("../../lib/cache") as { cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock } };

const NOW = new Date("2026-11-20T10:00:00.000Z");
const story = (n: number, over: Partial<FeedStory> = {}): FeedStory => ({
  id: `s-${n}`, public_id: n, language: "en", section: "sports", slug: `story-${n}`, headline: `Story ${n}`, dek: `Dek ${n}`,
  first_published_at: `2026-11-20T0${n}:00:00Z`, published_at: `2026-11-20T0${n}:30:00Z`, ...over,
});
const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
};

beforeEach(() => jest.clearAllMocks());

test("xmlText escapes the five characters and drops what XML forbids", () => {
  expect(xmlText(`A & B <c> "d" 'e'`)).toBe("A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;");
  expect(xmlText("bell\u0007 and tab\tnewline\n")).toBe("bell and tab\tnewline\n");
});

test("an RSS 2.0 channel: its name, page, language and its own address; one item per story, newest first", () => {
  const doc = parse(rssXml({ language: "en", section: "sports" }, [story(5), story(4, { dek: null })], NOW));
  expect(doc.documentElement.getAttribute("version")).toBe("2.0");
  const channel = doc.getElementsByTagName("channel")[0];
  const text = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent;
  expect(text(channel, "title")).toBe("TimesPrime: Sports");
  expect(text(channel, "link")).toBe("https://timesprime247.com/sports");
  expect(text(channel, "language")).toBe("en-in");
  expect(text(channel, "lastBuildDate")).toBe("Fri, 20 Nov 2026 05:30:00 GMT");
  expect(channel.getElementsByTagName("atom:link")[0].getAttribute("href")).toBe("https://timesprime247.com/rss/en/sports.xml");
  const items = [...doc.getElementsByTagName("item")];
  expect(items.map((i) => text(i, "title"))).toEqual(["Story 5", "Story 4"]);
  expect(text(items[0], "link")).toBe("https://timesprime247.com/sports/story-5-5");
  expect(text(items[0], "guid")).toBe("https://timesprime247.com/sports/story-5-5");
  expect(items[0].getElementsByTagName("guid")[0].getAttribute("isPermaLink")).toBe("true");
  expect(text(items[0], "pubDate")).toBe("Fri, 20 Nov 2026 05:00:00 GMT");
  expect(text(items[0], "description")).toBe("Dek 5");
  expect(items[1].getElementsByTagName("description")).toHaveLength(0);
});

test("a Hindi feed: Hindi names and addresses under /hi; a headline with markup stays text", () => {
  const hindi = story(3, { language: "hi", slug: null, headline: `<script>alert("x")</script> & "बजट"`, dek: "लोकसभा" });
  const doc = parse(rssXml({ language: "hi", section: null }, [hindi], NOW));
  expect(doc.getElementsByTagName("title")[0].textContent).toBe("TimesPrime (हिन्दी)");
  expect(doc.getElementsByTagName("language")[0].textContent).toBe("hi-in");
  const item = doc.getElementsByTagName("item")[0];
  expect(item.getElementsByTagName("title")[0].textContent).toBe(`<script>alert("x")</script> & "बजट"`);
  expect(item.getElementsByTagName("script")).toHaveLength(0);
  expect(item.getElementsByTagName("link")[0].textContent).toBe("https://timesprime247.com/hi/sports/3");
});

test("an empty feed is still a valid channel", () => {
  const doc = parse(rssXml({ language: "en", section: null }, [], NOW));
  expect(doc.getElementsByTagName("item")).toHaveLength(0);
  expect(doc.getElementsByTagName("lastBuildDate")[0].textContent).toBe("Fri, 20 Nov 2026 10:00:00 GMT");
});

test("read once for 50 stories, then from the 5-minute entry; forgetting a story's feeds clears its language's and its section's", async () => {
  listRecentPublished.mockResolvedValue([story(1)]);
  const feed = { language: "en" as const, section: "world" as const };
  const first = await rssFeed(feed, NOW);
  expect(await rssFeed(feed, NOW)).toBe(first);
  expect(listRecentPublished).toHaveBeenCalledTimes(1);
  expect(listRecentPublished).toHaveBeenCalledWith("en", "world", 50, NOW);
  expect(cache.set).toHaveBeenCalledWith("rss:v1:en:world", first, 300);
  await forgetStoryFeeds({ language: "en", section: "world" });
  expect(cache.del.mock.calls.map(([key]) => key).sort()).toEqual(["rss:v1:en:all", "rss:v1:en:world"]);
  await rssFeed(feed, NOW);
  expect(listRecentPublished).toHaveBeenCalledTimes(2);
  expect(rssKey({ language: "hi", section: null })).toBe("rss:v1:hi:all");
});
