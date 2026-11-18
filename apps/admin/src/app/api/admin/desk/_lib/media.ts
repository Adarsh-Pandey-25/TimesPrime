import "server-only";

import { mediaUrl } from "@timesprime/server/lib/mediaStorage";
import type { MediaFields, MediaRow } from "@timesprime/server/repositories/media";
import { MEDIA_SOURCES, MEDIA_TEXT_MAX, previewRendition, renditionsState, type MediaSource } from "@timesprime/shared/config/media";

// What an image's record may say (Panel 2 design §7), checked before it reaches the database: the
// upload (a form) and an edit (JSON) share it. Credit, source and licence, with rights cleared by a
// holder of media.manage, and alt text and a caption in the story's language, are what publishing
// will ask of every image a story uses.

const TEXTS = [
  ["credit", MEDIA_TEXT_MAX.credit],
  ["licence", MEDIA_TEXT_MAX.licence],
  ["alt_en", MEDIA_TEXT_MAX.alt],
  ["alt_hi", MEDIA_TEXT_MAX.alt],
  ["caption_en", MEDIA_TEXT_MAX.caption],
  ["caption_hi", MEDIA_TEXT_MAX.caption],
] as const;

/** Where staff see an image's original: through the back office only, as it keeps the camera's metadata. */
export const originalUrl = (id: string) => `/api/admin/desk/media/${id}/original`;

/**
 * A record as the Desk shows it: `url`, the tile's picture (its 4:3 WebP rendition once the worker
 * has made it, else the original through the back office), `original_url`, and where its
 * renditions stand.
 */
export function withUrls(row: MediaRow) {
  const preview = row.renditions_at ? previewRendition(row.renditions) : null;
  return { ...row, url: preview ? mediaUrl(preview.key) : originalUrl(row.id), original_url: originalUrl(row.id), renditions_state: renditionsState(row) };
}

/** The fields that say whose an image is and on what terms: changing one voids a rights clearance. */
export const RIGHTS_FIELDS = ["credit", "source", "licence", "licence_expires_at"] as const;

/** A form's text entries as a plain record (files left out). */
export function formRecord(form: FormData): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") record[key] = value;
  return record;
}

/** The fields the input names, or what is wrong. Empty text is null; nothing unnamed is touched. */
export function mediaFields(input: Record<string, unknown>): { ok: true; fields: MediaFields } | { ok: false; error: string } {
  const fields: MediaFields = {};
  for (const [key, max] of TEXTS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value !== null && typeof value !== "string") return { ok: false, error: `${key}: text, at most ${max} characters.` };
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length > max) return { ok: false, error: `${key}: at most ${max} characters.` };
    fields[key] = text || null;
  }
  if ("source" in input) {
    const source = input.source;
    if (source === null || source === "") fields.source = null;
    else if (typeof source === "string" && (MEDIA_SOURCES as readonly string[]).includes(source)) fields.source = source as MediaSource;
    else return { ok: false, error: `source: one of ${MEDIA_SOURCES.join(", ")}.` };
  }
  if ("licence_expires_at" in input) {
    const value = input.licence_expires_at;
    if (value === null || value === "") fields.licence_expires_at = null;
    else if (typeof value === "string" && Number.isFinite(Date.parse(value))) fields.licence_expires_at = new Date(value).toISOString();
    else return { ok: false, error: "licence_expires_at: a date, or empty." };
  }
  return { ok: true, fields };
}
