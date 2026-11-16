import type { Article } from "../types";

/**
 * The picture a story shows (B-03, Phase B, approved by the owner's senior on 16 Nov 2026): our own
 * image for its category, never a stock photo and never the publisher's photo. One drawing per
 * category in apps/web/public/placeholders (the category's name in English and Hindi, the brand
 * colours, the TimesPrime name). Plain SVG files: next/image serves a src ending in ".svg" as it is,
 * so no image is fetched from anywhere else.
 */
export const PLACEHOLDER_KEYS = [
  "general",
  "india",
  "world",
  "technology",
  "business",
  "sports",
  "entertainment",
  "health",
  "science",
] as const;

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];

// NewsData's category tags and the app's own ids, onto a drawing. "top" and anything unknown are
// the general one.
const BY_CATEGORY: Record<string, PlaceholderKey> = {
  world: "world",
  tech: "technology",
  technology: "technology",
  business: "business",
  sports: "sports",
  entertainment: "entertainment",
  health: "health",
  science: "science",
  india: "india",
};

/** The story's drawing: its first specific category, else India for an Indian story, else general. */
export function placeholderKey(article: Pick<Article, "category" | "country">): PlaceholderKey {
  for (const tag of article.category ?? []) {
    const key = BY_CATEGORY[String(tag).toLowerCase()];
    if (key) return key;
  }
  if ((article.country ?? []).some((c) => /^(in|india)$/i.test(String(c)))) return "india";
  return "general";
}

/** The image path for a story. */
export function placeholderFor(article: Pick<Article, "category" | "country">): string {
  return `/placeholders/${placeholderKey(article)}.svg`;
}

/** The image for each story of a list, keyed by the story, for components that render many. */
export function assignPlaceholders(articles: Article[]): Map<Article, string> {
  return new Map(articles.map((article) => [article, placeholderFor(article)]));
}
