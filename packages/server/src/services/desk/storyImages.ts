import "server-only";

import type { ChecklistImage } from "@timesprime/shared/config/desk";
import { RENDITION_KEY, RENDITION_RATIOS, storyImageIds, type Rendition, type RenditionRatio } from "@timesprime/shared/config/media";
import type { PublishedStory, StoryImageCrop, StoryImageData } from "@timesprime/shared/types";
import { mediaUrl } from "../../lib/mediaStorage";
import { getMediaByIds, listPublishedImages, type MediaRow, type ReaderMediaRow } from "../../repositories/media";

/**
 * A story's images (Panel 2 design §7): the library's records turned into what a page draws (the
 * renditions of each crop, the alt text, caption and credit in the story's language), and what the
 * pre-publish checklist reads. Readers get only the renditions of a published revision's images;
 * the Desk's preview may show an original, through the back office, while it has none.
 */

/** The crop's WebP the page falls back to: the first at 960 or wider, else the widest. */
const FALLBACK_WIDTH = 960;

function crop(renditions: readonly Rendition[], ratio: RenditionRatio): StoryImageCrop | null {
  const usable = renditions.filter((r) => r && r.ratio === ratio && typeof r.key === "string" && RENDITION_KEY.test(r.key)).sort((a, b) => a.width - b.width);
  const avif = usable.filter((r) => r.format === "avif");
  const webp = usable.filter((r) => r.format === "webp");
  if (avif.length === 0 || webp.length === 0) return null;
  const src = webp.find((r) => r.width >= FALLBACK_WIDTH) ?? webp[webp.length - 1];
  const srcSet = (list: Rendition[]) => list.map((r) => `${mediaUrl(r.key)} ${r.width}w`).join(", ");
  return { avif: srcSet(avif), webp: srcSet(webp), src: mediaUrl(src.key), width: src.width, height: src.height };
}

/** One image as a page draws it, in the story's language; `fallbackUrl` only while it has no renditions. */
export function imageView(row: ReaderMediaRow, language: "en" | "hi", fallbackUrl?: string): StoryImageData {
  const crops: StoryImageData["crops"] = {};
  const renditions = Array.isArray(row.renditions) ? row.renditions : [];
  for (const ratio of Object.keys(RENDITION_RATIOS) as RenditionRatio[]) {
    const made = crop(renditions, ratio);
    if (made) crops[ratio] = made;
  }
  return {
    alt: (language === "hi" ? row.alt_hi : row.alt_en) ?? "",
    caption: (language === "hi" ? row.caption_hi : row.caption_en) ?? null,
    credit: row.credit,
    crops,
    ...(fallbackUrl && Object.keys(crops).length === 0 ? { fallbackUrl } : {}),
  };
}

/** The images of a published story, for the reader's page: only its revision's, with renditions. */
export async function publishedImages(story: Pick<PublishedStory, "language" | "revision">): Promise<Record<string, StoryImageData>> {
  const rows = await listPublishedImages(story.revision.id, storyImageIds(story.revision.body));
  const out: Record<string, StoryImageData> = {};
  for (const row of rows) {
    const view = imageView(row, story.language);
    if (Object.keys(view.crops).length > 0) out[row.id] = view;
  }
  return out;
}

/**
 * The images a revision uses, for the Desk's preview: every one the library has, with renditions
 * once made, else `fallback(id)` (the original through the back office).
 */
export async function previewImages(body: unknown, language: "en" | "hi", fallback: (id: string) => string): Promise<Record<string, StoryImageData>> {
  const rows = await getMediaByIds(storyImageIds(body));
  return Object.fromEntries(rows.map((row) => [row.id, imageView(row, language, fallback(row.id))]));
}

/** The checklist's view of a revision's images, in the body's order: null for one the library lacks. */
export async function checklistImages(body: unknown): Promise<Array<ChecklistImage | null>> {
  const ids = storyImageIds(body);
  const rows = new Map((await getMediaByIds(ids)).map((row): [string, MediaRow] => [row.id, row]));
  return ids.map((id) => rows.get(id) ?? null);
}
