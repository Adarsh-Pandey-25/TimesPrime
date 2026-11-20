import "server-only";

import { RSS_ITEMS, RSS_TTL_SECONDS, rssPath, rssTitle, type RssFeedId } from "@timesprime/shared/config/rss";
import { SITE_URL } from "@timesprime/shared/config/site";
import { TRANSLATIONS } from "@timesprime/shared/config/translations";
import { deskStoryPath } from "@timesprime/shared/lib/storyUrl";
import { cache } from "../../lib/cache";
import { listRecentPublished, type FeedStory } from "../../repositories/stories";

/**
 * The RSS feeds (Panel 3 design §5, M4): RSS 2.0 of the last 50 published Desk stories of a language,
 * or of a language and section, with each story's title, address, dek, date and a stable id (its
 * address). Kept 5 minutes in Redis; the back office forgets a feed when it publishes or takes down
 * one of its stories, so a takedown leaves the feed at once.
 */

export function rssKey(feed: RssFeedId): string {
  return `rss:v1:${feed.language}:${feed.section ?? "all"}`;
}

// XML 1.0 forbids these characters even escaped; a story's text should never hold them.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** Text for an element or attribute: the five XML escapes, and no character XML forbids. */
export function xmlText(value: string): string {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 time, as RSS 2.0 wants it ("Fri, 20 Nov 2026 09:00:00 GMT"). */
const rfc822 = (iso: string) => new Date(iso).toUTCString();

function item(story: FeedStory): string {
  const url = `${SITE_URL}${deskStoryPath(story)}`;
  const date = story.first_published_at ?? story.published_at;
  return [
    "    <item>",
    `      <title>${xmlText(story.headline)}</title>`,
    `      <link>${xmlText(url)}</link>`,
    `      <guid isPermaLink="true">${xmlText(url)}</guid>`,
    ...(story.dek ? [`      <description>${xmlText(story.dek)}</description>`] : []),
    ...(date ? [`      <pubDate>${rfc822(date)}</pubDate>`] : []),
    "    </item>",
  ].join("\n");
}

/** The feed as RSS 2.0 text. */
export function rssXml(feed: RssFeedId, stories: readonly FeedStory[], now: Date): string {
  const t = TRANSLATIONS[feed.language];
  const page = `${SITE_URL}/${feed.section ?? ""}`;
  const self = `${SITE_URL}${rssPath(feed)}`;
  const description =
    feed.language === "hi"
      ? `${feed.section === null ? "टाइम्सप्राइम" : t.categories[feed.section]} की ताज़ा ख़बरें, हमारे न्यूज़रूम से।`
      : `The latest ${feed.section === null ? "" : `${t.categories[feed.section]} `}stories from the TimesPrime newsroom.`;
  const built = stories[0]?.published_at ?? stories[0]?.first_published_at ?? now.toISOString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xmlText(rssTitle(feed))}</title>`,
    `    <link>${xmlText(page)}</link>`,
    `    <description>${xmlText(description)}</description>`,
    `    <language>${feed.language === "hi" ? "hi-in" : "en-in"}</language>`,
    `    <lastBuildDate>${rfc822(built)}</lastBuildDate>`,
    `    <atom:link href="${xmlText(self)}" rel="self" type="application/rss+xml" />`,
    ...stories.map(item),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** A feed's text, through its 5-minute cache entry. Throws when the database cannot be read. */
export async function rssFeed(feed: RssFeedId, now: Date = new Date()): Promise<string> {
  const key = rssKey(feed);
  const cached = await cache.get<string>(key);
  if (typeof cached === "string" && cached.startsWith("<?xml")) return cached;
  const xml = rssXml(feed, await listRecentPublished(feed.language, feed.section, RSS_ITEMS, now), now);
  await cache.set(key, xml, RSS_TTL_SECONDS);
  return xml;
}

/** After a story is published or taken down: the feeds that hold it, its language's and its section's. */
export async function forgetStoryFeeds(story: { language: string; section: string }): Promise<void> {
  if (story.language !== "en" && story.language !== "hi") return;
  const language = story.language;
  await Promise.all([cache.del(rssKey({ language, section: null })), cache.del(`rss:v1:${language}:${story.section}`)]);
}
