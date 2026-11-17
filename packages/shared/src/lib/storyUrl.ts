import type { Article } from "../types";

/**
 * Outside stories' URLs (R2, approved by the owner on 17 Nov 2026): /article/{headline-slug}-{id},
 * where the id is NewsData's article_id, unique in the articles table. The page finds the story by
 * the id alone, so a changed headline still resolves (and redirects to the current slug), and the
 * publisher's link never travels in our URLs.
 *
 * NewsData's ids are 32 hex characters. A stored row whose id is anything else (the refresh falls
 * back to the link when NewsData sends none) keeps the old address, /article/story?url=<link>,
 * which the page still serves.
 */

/** An id this URL scheme can carry: letters and digits, so it never contains the separator. */
const STORY_ID = /^[A-Za-z0-9]{1,64}$/;

/** The headline as a URL slug: lowercase ASCII words joined by hyphens, at most 80 characters. */
export function storySlug(title: string): string {
  const words = (title || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > 80) break;
    slug = next;
  }
  return slug;
}

/** The path of a story's page. */
export function storyPath(article: Pick<Article, "article_id" | "title" | "link">): string {
  if (!STORY_ID.test(article.article_id || "")) {
    return `/article/story?url=${encodeURIComponent(article.link)}`;
  }
  const slug = storySlug(article.title);
  return `/article/${slug ? `${slug}-` : ""}${article.article_id}`;
}

/** The last segment of a story's path: what the page's [slug] holds when it is current. */
export function storySegment(article: Pick<Article, "article_id" | "title" | "link">): string | null {
  const path = storyPath(article);
  return path.includes("?") ? null : path.slice("/article/".length);
}

/** The story id a path segment ends with, or null when it ends with none. */
export function storyIdFrom(segment: string): string | null {
  const match = /(?:^|-)([A-Za-z0-9]{1,64})$/.exec(segment || "");
  return match ? match[1] : null;
}

/**
 * The newsroom's own stories, written on the Desk (Panel 2 design §6, owner decision 1):
 * /{section}/{slug}-{number} in English and /hi/{section}/{slug}-{number} in Hindi. The number is
 * the story's public_id, which the page finds it by. The slug is set before publication and never
 * changes after, and an address with another slug, section or language redirects to this one.
 */
export interface DeskStoryAddress {
  language: "en" | "hi";
  section: string;
  slug: string | null;
  public_id: number;
}

/** The path of a Desk story's page. */
export function deskStoryPath(story: DeskStoryAddress): string {
  const segment = story.slug ? `${story.slug}-${story.public_id}` : String(story.public_id);
  return `${story.language === "hi" ? "/hi" : ""}/${story.section}/${segment}`;
}

/** The story number a Desk story's last path segment ends with, or null: at most 15 digits, no leading zero. */
export function deskStoryIdFrom(segment: string): number | null {
  const match = /(?:^|-)([1-9][0-9]{0,14})$/.exec(segment || "");
  return match ? Number(match[1]) : null;
}
