import "server-only";

import { isAllowedHref } from "@timesprime/shared/lib/href";
import { liveBodyProblem } from "@timesprime/shared/lib/liveBody";
import { isRenditionRatio, MEDIA_ID, type RenditionRatio } from "@timesprime/shared/config/media";
import { LIVE_CACHE_SECONDS, LIVE_PAGE_UPDATES, type LiveBlock, type LiveFeed, type LiveRun } from "@timesprime/shared/config/liveBlog";
import type { PublishedStory } from "@timesprime/shared/types";
import { cache } from "../../lib/cache";
import { listPublicLiveUpdates } from "../../repositories/liveUpdates";
import { listLiveImages, type ReaderMediaRow } from "../../repositories/media";
import { imageView } from "../desk/storyImages";

/**
 * A live blog's feed for readers (Panel 3 design §5, M3): its newest updates, not removed, shaped
 * for the page (paragraphs of runs, and the image's crop), so the browser needs no editor code. Read
 * through one 5-second cache entry per story (decision 9), which the back office deletes on every
 * change to the blog, so a crowd of readers costs the database one read every few seconds.
 */

export function liveKey(publicId: number): string {
  return `live:v1:${publicId}`;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** "20 Nov 2026, 3:05 pm IST", in the story's language. */
function when(iso: string, language: "en" | "hi"): string {
  const time = new Date(iso).toLocaleString(language === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${time} IST`;
}

/** A paragraph's runs: text with its marks, and line breaks. A link keeps only an allowed address. */
function runs(content: unknown): LiveRun[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((inline): LiveRun[] => {
    if (!isObject(inline)) return [];
    if (inline.type === "hardBreak") return [{ br: true }];
    if (inline.type !== "text" || typeof inline.text !== "string") return [];
    const run: LiveRun = { text: inline.text };
    for (const mark of Array.isArray(inline.marks) ? inline.marks : []) {
      if (!isObject(mark)) continue;
      if (mark.type === "bold") run.bold = true;
      if (mark.type === "italic") run.italic = true;
      const href = isObject(mark.attrs) ? mark.attrs.href : undefined;
      if (mark.type === "link" && typeof href === "string" && isAllowedHref(href)) run.href = href;
    }
    return [run];
  });
}

/**
 * An update's body as the page draws it, or null when it is outside the smaller schema (it was checked
 * when stored; this is the backstop). An image the library cannot show to readers is left out.
 */
export function liveBlocks(body: unknown, language: "en" | "hi", images: ReadonlyMap<string, ReaderMediaRow>): LiveBlock[] | null {
  if (liveBodyProblem(body) !== null) return null;
  const blocks: LiveBlock[] = [];
  for (const block of (body as { content: unknown[] }).content) {
    if (!isObject(block)) continue;
    if (block.type === "paragraph") {
      const content = runs(block.content);
      if (content.length > 0) blocks.push({ kind: "p", runs: content });
      continue;
    }
    if (block.type !== "image" || !isObject(block.attrs)) continue;
    const row = typeof block.attrs.id === "string" ? images.get(block.attrs.id) : undefined;
    if (!row) continue;
    const ratio: RenditionRatio = isRenditionRatio(block.attrs.ratio) ? block.attrs.ratio : "16x9";
    const view = imageView(row, language);
    const crop = view.crops[ratio];
    if (crop) blocks.push({ kind: "image", alt: view.alt, caption: view.caption, credit: view.credit, avif: crop.avif, webp: crop.webp, src: crop.src, width: crop.width, height: crop.height });
  }
  return blocks;
}

/** The library images an update uses (at most one each). */
function imageIds(body: unknown): string[] {
  const content = isObject(body) && Array.isArray(body.content) ? body.content : [];
  return content.flatMap((block) => (isObject(block) && block.type === "image" && isObject(block.attrs) && typeof block.attrs.id === "string" && MEDIA_ID.test(block.attrs.id) ? [block.attrs.id] : []));
}

async function readFeed(story: Pick<PublishedStory, "id" | "language" | "live_ended_at">): Promise<LiveFeed> {
  const rows = await listPublicLiveUpdates(story.id, LIVE_PAGE_UPDATES);
  const ids = [...new Set(rows.flatMap((u) => imageIds(u.body)))];
  const images = new Map((await listLiveImages(ids)).map((row) => [row.id, row]));
  const updates = rows.flatMap((u) => {
    const blocks = liveBlocks(u.body, story.language, images);
    if (blocks === null) return [];
    return [{ id: u.id, headline: u.headline, blocks, keyEvent: u.is_key_event, pinned: u.is_pinned, postedAt: u.posted_at, editedAt: u.edited_at, time: when(u.posted_at, story.language) }];
  });
  return { endedAt: story.live_ended_at ?? null, updates };
}

/**
 * A published live blog's feed, through its cache entry. The caller has checked the story (published,
 * past its embargo, a live blog: getPublishedStory). Throws when the database cannot be read.
 */
export async function liveFeed(story: Pick<PublishedStory, "id" | "public_id" | "language" | "live_ended_at">): Promise<LiveFeed> {
  const key = liveKey(story.public_id);
  const cached = await cache.get<LiveFeed>(key);
  if (cached && Array.isArray(cached.updates)) return cached;
  const feed = await readFeed(story);
  await cache.set(key, feed, LIVE_CACHE_SECONDS);
  return feed;
}

/** The cached feed alone, for the JSON's fast path; null when there is none. */
export async function cachedLiveFeed(publicId: number): Promise<LiveFeed | null> {
  const cached = await cache.get<LiveFeed>(liveKey(publicId));
  return cached && Array.isArray(cached.updates) ? cached : null;
}

/** Forgets a blog's entry: the back office calls it after every post, change, removal and end. */
export async function forgetLive(publicId: number): Promise<void> {
  await cache.del(liveKey(publicId));
}
