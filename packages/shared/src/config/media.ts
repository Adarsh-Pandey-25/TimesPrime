/**
 * The Desk's media library (Panel 2 design §7): what an image may be, where it is kept, and what it
 * must carry before a story using it is published. One list both apps and the worker read.
 */

/** The image types the library accepts, by their file signature (never by the name or the header). */
export const MEDIA_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;
export type MediaType = keyof typeof MEDIA_TYPES;

/** The largest upload, in bytes: 15 MB (the back office's Nginx allows 20). */
export const MEDIA_MAX_BYTES = 15 * 1024 * 1024;

/** Where an image comes from (design §2, media_assets.source). */
export const MEDIA_SOURCES = ["staff", "agency", "stock", "handout", "social"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];

/** Text limits, the same as the database's CHECKs. */
export const MEDIA_TEXT_MAX = { credit: 200, licence: 300, alt: 300, caption: 600 } as const;

/** An original's storage key: `originals/<uuid>.<ext>`. Anything else is refused before a path is built. */
export const ORIGINAL_KEY = /^originals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/;

/** A rendition's storage key: `renditions/<uuid>/<ratio>-<width>.<format>` (M4's worker). */
export const RENDITION_KEY = /^renditions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(16x9|4x3|1x1)-\d{2,4}\.(avif|webp)$/;

/** True for a key the library may read or write: an original or a rendition, never a path. */
export function isMediaKey(key: string): boolean {
  return ORIGINAL_KEY.test(key) || RENDITION_KEY.test(key);
}

/**
 * The renditions (design §7): what readers are served. The worker makes them from each original
 * with sharp, every RENDITIONS_TICK_MINUTES: three crops, each at a few widths, in AVIF and WebP,
 * never wider than the picture itself, and without the camera's metadata (EXIF can say where a
 * photo was taken). The originals keep it, so only staff see them, through the back office.
 */
export const RENDITION_RATIOS = { "16x9": [16, 9], "4x3": [4, 3], "1x1": [1, 1] } as const;
export type RenditionRatio = keyof typeof RENDITION_RATIOS;

/** The widths of each crop: the lead picture up to twice a story's column, the square for thumbnails. */
export const RENDITION_WIDTHS: Record<RenditionRatio, readonly number[]> = {
  "16x9": [480, 960, 1440],
  "4x3": [480, 960],
  "1x1": [240, 480],
};

export const RENDITION_FORMATS = ["avif", "webp"] as const;
export type RenditionFormat = (typeof RENDITION_FORMATS)[number];

/** A picture narrower than this, once cropped, gets no rendition: the library cannot use it. */
export const RENDITION_MIN_WIDTH = 32;

/** The worker's timer: every 5 minutes (deploy/systemd/timesprime-renditions.timer; a test keeps them equal). */
export const RENDITIONS_TICK_MINUTES = 5;

/** One rendition, as media_assets.renditions lists it. */
export interface Rendition {
  key: string;
  ratio: RenditionRatio;
  format: RenditionFormat;
  width: number;
  height: number;
  bytes: number;
}

export function renditionKey(id: string, ratio: RenditionRatio, width: number, format: RenditionFormat): string {
  return `renditions/${id}/${ratio}-${width}.${format}`;
}

/**
 * The widths to make of one crop, for a picture `width` by `height` once turned upright: those in
 * RENDITION_WIDTHS the crop can fill, or, when it fills none, one at the crop's own width; none
 * when that is under RENDITION_MIN_WIDTH.
 */
export function renditionWidths(ratio: RenditionRatio, width: number, height: number): number[] {
  const [w, h] = RENDITION_RATIOS[ratio];
  const crop = Math.floor(Math.min(width, (height * w) / h));
  const fits = RENDITION_WIDTHS[ratio].filter((size) => size <= crop);
  if (fits.length > 0) return [...fits];
  return crop >= RENDITION_MIN_WIDTH ? [crop] : [];
}

/** A crop's height at a width. */
export function renditionHeight(ratio: RenditionRatio, width: number): number {
  const [w, h] = RENDITION_RATIOS[ratio];
  return Math.round((width * h) / w);
}

/** Where an image's renditions stand: not made yet, made, or not possible (the file is unusable). */
export type RenditionsState = "waiting" | "ready" | "failed";

export function renditionsState(row: { renditions_at: string | null; renditions: readonly unknown[] }): RenditionsState {
  if (!row.renditions_at) return "waiting";
  return row.renditions.length > 0 ? "ready" : "failed";
}

/** A gallery block (design §5): two to twelve library images, shown together. */
export const GALLERY_MIN = 2;
export const GALLERY_MAX = 12;

/** An image's id as a story body holds it: the library's UUID. */
export const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isRenditionRatio(value: unknown): value is RenditionRatio {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RENDITION_RATIOS, value);
}

/** Every `image` node of a story body, at any depth, in order, with its attributes as stored. */
export function storyImageNodes(body: unknown): Array<{ id: unknown; ratio: unknown }> {
  const nodes: Array<{ id: unknown; ratio: unknown }> = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 32 || typeof node !== "object" || node === null) return;
    const n = node as { type?: unknown; attrs?: { id?: unknown; ratio?: unknown }; content?: unknown };
    if (n.type === "image") nodes.push({ id: n.attrs?.id, ratio: n.attrs?.ratio });
    if (Array.isArray(n.content)) for (const child of n.content) walk(child, depth + 1);
  };
  walk(body, 0);
  return nodes;
}

/** True when every image node names a library image (a UUID) and one of the crops. */
export function storyImagesWellFormed(body: unknown): boolean {
  return storyImageNodes(body).every((n) => typeof n.id === "string" && MEDIA_ID.test(n.id) && (n.ratio === undefined || isRenditionRatio(n.ratio)));
}

/**
 * The library's images a story body uses, in order, each once: what the pre-publish checklist checks
 * and the reader's page loads. A node without a valid id is not an image of the library and is
 * skipped (a save refuses such a body: storyImagesWellFormed).
 */
export function storyImageIds(body: unknown): string[] {
  const ids: string[] = [];
  for (const { id } of storyImageNodes(body)) if (typeof id === "string" && MEDIA_ID.test(id) && !ids.includes(id)) ids.push(id);
  return ids;
}

/** The rendition the library's tile shows: the 4:3 WebP at 480, or the nearest 4:3 WebP there is. */
export function previewRendition(renditions: readonly Rendition[]): Rendition | null {
  const tiles = renditions.filter((r) => r.ratio === "4x3" && r.format === "webp").sort((a, b) => a.width - b.width);
  return tiles.find((r) => r.width >= 480) ?? tiles.at(-1) ?? null;
}

/** The type a file's first bytes show it to be, or null for anything that is not one of the four. */
export function sniffMediaType(head: Uint8Array): MediaType | null {
  const at = (offset: number, bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  // ISO BMFF: "ftyp" at 4, then the brand "avif" (an image) or "avis" (a sequence).
  if (at(4, [0x66, 0x74, 0x79, 0x70]) && (at(8, [0x61, 0x76, 0x69, 0x66]) || at(8, [0x61, 0x76, 0x69, 0x73]))) return "image/avif";
  return null;
}
