import { TRANSLATIONS } from "./translations";

/**
 * The reader site's sections, each at its own URL (R2, approved by the owner on 17 Nov 2026):
 * /india, /world, /tech, /business, /sports, /entertainment, /health and /science. The top
 * stories ("general") are the home page, /. The ids are the feed's category ids, so the section
 * page asks the feed for the same category the old /?category= view did, and /?category=<id>
 * answers 308 to the section's URL (apps/web/next.config.ts).
 */
export const SECTION_IDS = ["india", "world", "tech", "business", "sports", "entertainment", "health", "science"] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export function isSection(value: string | undefined | null): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value ?? "");
}

/** The URL of a category's page: "/" for the top stories, "/<id>" for a section; a search is kept. */
export function sectionPath(category: string, search = ""): string {
  const path = isSection(category) ? `/${category}` : "/";
  return search ? `${path}?search=${encodeURIComponent(search)}` : path;
}

/** A section page's title and description, in English like the site's other page metadata. */
export function sectionMetadata(section: SectionId): { title: string; description: string } {
  const name = TRANSLATIONS.en.categories[section];
  return {
    title: `${name} News`,
    description: `The latest ${name.toLowerCase()} headlines on TimesPrime, each with a short summary and a link to the full story at its source.`,
  };
}
