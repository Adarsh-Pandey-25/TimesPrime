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
