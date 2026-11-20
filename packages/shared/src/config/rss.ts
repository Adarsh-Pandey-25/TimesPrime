// The newsroom's RSS feeds (Panel 3 design §5 and §6, M4): the last 50 published Desk stories, per
// language, or per language and section. The aggregator's items are not in them: their pages are
// noindex summaries of other publishers' stories (Phase B). Readers' apps and other sites read
// these; the home and section pages point to them with <link rel="alternate">.

import { isSection, SECTION_IDS, type SectionId } from "./sections";
import { PUBLISHER_NAME } from "./site";
import { TRANSLATIONS } from "./translations";

export const RSS_LANGUAGES = ["en", "hi"] as const;
export type RssLanguage = (typeof RSS_LANGUAGES)[number];

/** The stories a feed holds, newest first. */
export const RSS_ITEMS = 50;
/** How long a feed is kept, in Redis and at the edge (decision: 5 minutes, design §5). */
export const RSS_TTL_SECONDS = 300;

/** A feed: one language's stories, or one section's in that language. */
export interface RssFeedId {
  language: RssLanguage;
  section: SectionId | null;
}

/** A feed's address: /rss/en.xml, /rss/hi.xml, /rss/en/sports.xml, /rss/hi/sports.xml. */
export function rssPath(feed: RssFeedId): string {
  return feed.section === null ? `/rss/${feed.language}.xml` : `/rss/${feed.language}/${feed.section}.xml`;
}

/** The feed a route's segments name, or null: `en.xml`, or `en` and `sports.xml`. */
export function rssFeedFrom(first: string, second?: string): RssFeedId | null {
  if (second === undefined) {
    const match = /^(en|hi)\.xml$/.exec(first);
    return match ? { language: match[1] as RssLanguage, section: null } : null;
  }
  if (first !== "en" && first !== "hi") return null;
  const match = /^([a-z_]+)\.xml$/.exec(second);
  return match && isSection(match[1]) ? { language: first, section: match[1] } : null;
}

/** A feed's name, in its language: "TimesPrime: Sports", "TimesPrime: खेल". */
export function rssTitle(feed: RssFeedId): string {
  const t = TRANSLATIONS[feed.language];
  return feed.section === null ? `${PUBLISHER_NAME} (${feed.language === "hi" ? "हिन्दी" : "English"})` : `${PUBLISHER_NAME}: ${t.categories[feed.section]}`;
}

/** The feeds a page points to: both languages' feeds of its section, or of the whole site. */
export function rssAlternates(section: SectionId | null): Array<{ url: string; title: string }> {
  return RSS_LANGUAGES.map((language) => ({ url: rssPath({ language, section }), title: rssTitle({ language, section }) }));
}

/** Every feed, for the docs and the tests: 2 site feeds and 16 section feeds. */
export const ALL_RSS_FEEDS: RssFeedId[] = RSS_LANGUAGES.flatMap((language) => [{ language, section: null }, ...SECTION_IDS.map((section) => ({ language, section }))]);
