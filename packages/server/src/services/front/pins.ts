import "server-only";

import { thumbnailFor } from "@timesprime/shared/config/categoryPlaceholders";
import type { FrontPage, PinnedStory } from "@timesprime/shared/config/frontPage";
import { storyImageIds } from "@timesprime/shared/config/media";
import { isSection } from "@timesprime/shared/config/sections";
import { deskStoryPath } from "@timesprime/shared/lib/storyUrl";
import type { PublishedStory } from "@timesprime/shared/types";
import { cache } from "../../lib/cache";
import { livePins } from "../../repositories/frontPage";
import { listPublishedImages } from "../../repositories/media";
import { getPublishedStoriesByIds } from "../../repositories/stories";
import { imageView } from "../desk/storyImages";

/**
 * The reader's pinned row (Panel 3 design §5): the stories pinned on a page now, as the row draws
 * them. Read through one 60-second cache entry per page and language, which the back office deletes
 * on every pin change (both apps share Redis, lib/cache.ts), so a change shows at once and a pin
 * that ends leaves within a minute. Readers get only live, published stories and their published
 * images' renditions.
 */

export const PINS_TTL_SECONDS = 60;

/** The cache entry of a page's pins. */
export function pinsKey(page: FrontPage): string {
  return `front:pins:v1:${page.language}:${page.section ?? "home"}`;
}

/** "20 Nov 2026, 3:05 pm IST", in the story's language. */
function when(iso: string, language: "en" | "hi"): string {
  const time = new Date(iso).toLocaleString(language === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${time} IST`;
}

/**
 * The story's first image as its 4:3 crop, or null: only a published revision's, with renditions
 * (their addresses are built from checked keys: storyImages.ts).
 */
async function firstImage(story: PublishedStory): Promise<PinnedStory["image"]> {
  const [id] = storyImageIds(story.revision.body);
  if (!id) return null;
  const [row] = await listPublishedImages(story.revision.id, [id]);
  if (!row) return null;
  const view = imageView(row, story.language);
  const crop = view.crops["4x3"];
  if (!crop) return null;
  return { alt: view.alt, avif: crop.avif, webp: crop.webp, src: crop.src, width: crop.width, height: crop.height };
}

/** The page's pinned stories, read from the database. */
async function readPinned(page: FrontPage, now: Date): Promise<PinnedStory[]> {
  const pins = await livePins(page, now);
  if (pins.length === 0) return [];
  const stories = new Map((await getPublishedStoriesByIds(pins.map((p) => p.story_id), now)).map((s) => [s.id, s]));
  const out: PinnedStory[] = [];
  for (const pin of pins) {
    const story = stories.get(pin.story_id);
    // The database checked this when the pin was made; a story moved since does not show.
    if (!story || story.language !== page.language || (page.section !== null && story.section !== page.section)) continue;
    if (out.some((p) => p.path === deskStoryPath(story))) continue;
    const published = story.first_published_at ?? story.published_at;
    out.push({
      slot: pin.slot,
      path: deskStoryPath(story),
      language: story.language,
      headline: story.revision.headline,
      dek: story.revision.dek,
      bylines: story.bylines.filter((b) => b.role === "byline").map((b) => b.name),
      time: published ? when(published, story.language) : null,
      image: await firstImage(story),
      drawing: thumbnailFor({ category: [story.section], country: [] }),
      until: pin.until,
    });
  }
  return out;
}

/** The stories pinned on a page now, in slot order. Throws when the database cannot be read. */
export async function pinnedStories(page: FrontPage, now: Date = new Date()): Promise<PinnedStory[]> {
  const key = pinsKey(page);
  let list = await cache.get<PinnedStory[]>(key);
  if (!Array.isArray(list)) {
    list = await readPinned(page, now);
    await cache.set(key, list, PINS_TTL_SECONDS);
  }
  return list.filter((p) => Date.parse(p.until) > now.getTime());
}

/** Forgets a page's entry: the back office calls it after every pin change. */
export async function forgetPins(page: FrontPage): Promise<void> {
  await cache.del(pinsKey(page));
}

/** After a takedown: the pages that may show the story, its language's home page and its section's. */
export async function forgetStoryPins(story: { language: string; section: string }): Promise<void> {
  if (story.language !== "en" && story.language !== "hi") return;
  const language = story.language;
  await Promise.all([forgetPins({ language, section: null }), isSection(story.section) ? forgetPins({ language, section: story.section }) : Promise.resolve()]);
}
