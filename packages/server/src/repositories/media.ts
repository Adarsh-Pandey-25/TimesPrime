import "server-only";

import type { MediaSource, MediaType, Rendition } from "@timesprime/shared/config/media";
import { supabase } from "../lib/supabase";
import { scopeFilter, storeError, type DeskScope } from "./stories";

/**
 * The media library's records (Panel 2 design §2 and §7; database/migrations/2026-11-18-desk-5-media.sql).
 * Each image belongs to the desk it was uploaded for, which media.manage's S scope reads. The file
 * itself is in the storage (lib/mediaStorage.ts) under storage_key. Never deleted: an image is
 * retired (active false).
 */

export interface MediaRow {
  id: string;
  storage_key: string;
  content_type: MediaType;
  bytes: number;
  width: number | null;
  height: number | null;
  language: "en" | "hi";
  section: string;
  credit: string | null;
  source: MediaSource | null;
  licence: string | null;
  licence_expires_at: string | null;
  rights_cleared_by: string | null;
  rights_cleared_at: string | null;
  alt_en: string | null;
  alt_hi: string | null;
  caption_en: string | null;
  caption_hi: string | null;
  renditions: Rendition[];
  renditions_at: string | null;
  uploaded_by: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** What an upload or an edit may set about an image. */
export interface MediaFields {
  credit?: string | null;
  source?: MediaSource | null;
  licence?: string | null;
  licence_expires_at?: string | null;
  alt_en?: string | null;
  alt_hi?: string | null;
  caption_en?: string | null;
  caption_hi?: string | null;
  rights_cleared_by?: string | null;
  rights_cleared_at?: string | null;
  active?: boolean;
}

export const MEDIA_PAGE_SIZE = 48;

export async function createMedia(row: MediaFields & {
  id: string;
  storage_key: string;
  content_type: MediaType;
  bytes: number;
  language: "en" | "hi";
  section: string;
  uploaded_by: string;
}): Promise<MediaRow> {
  const { data, error } = await supabase.from("media_assets").insert(row).select("*").single();
  if (error) throw storeError(error);
  return data as MediaRow;
}

export async function getMedia(id: string): Promise<MediaRow | null> {
  const { data, error } = await supabase.from("media_assets").select("*").eq("id", id).maybeSingle();
  if (error) throw storeError(error);
  return (data as MediaRow | null) ?? null;
}

/** The library inside the caller's scopes, newest first, a page at a time. */
export async function listMedia(
  filters: { language?: "en" | "hi"; section?: string; includeRetired?: boolean },
  scopes: readonly DeskScope[],
  page = 1
): Promise<{ media: MediaRow[]; total: number }> {
  if (scopes.length === 0) return { media: [], total: 0 };
  let query = supabase.from("media_assets").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (filters.language) query = query.eq("language", filters.language);
  if (filters.section) query = query.eq("section", filters.section);
  if (!filters.includeRetired) query = query.eq("active", true);
  const scoped = scopeFilter(scopes);
  if (scoped) query = query.or(scoped);
  const from = (Math.max(1, page) - 1) * MEDIA_PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + MEDIA_PAGE_SIZE - 1);
  if (error) throw storeError(error);
  return { media: (data ?? []) as MediaRow[], total: count ?? 0 };
}

/** Changes an image's record; null when there is no such image. */
export async function updateMedia(id: string, fields: MediaFields, now: Date = new Date()): Promise<MediaRow | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .update({ ...fields, updated_at: now.toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw storeError(error);
  return (data as MediaRow | null) ?? null;
}

/** The images the worker has not made renditions of yet, oldest first (the partial index's rows). */
export async function listPendingRenditions(limit: number): Promise<Array<Pick<MediaRow, "id" | "storage_key">>> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_key")
    .is("renditions_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw storeError(error);
  return (data ?? []) as Array<Pick<MediaRow, "id" | "storage_key">>;
}

/**
 * The worker's result for one image: its renditions (none when the file is unusable), and its size
 * once turned upright when known. Written only while the image has none yet, so two runs cannot both
 * record one; false when another run did, or the image is gone. The record's own updated_at stays:
 * nobody edited it.
 */
export async function recordRenditions(
  id: string,
  result: { renditions: Rendition[]; width?: number; height?: number },
  now: Date = new Date()
): Promise<boolean> {
  const fields: Record<string, unknown> = { renditions: result.renditions, renditions_at: now.toISOString() };
  if (result.width && result.height) Object.assign(fields, { width: result.width, height: result.height });
  const { data, error } = await supabase.from("media_assets").update(fields).eq("id", id).is("renditions_at", null).select("id").maybeSingle();
  if (error) throw storeError(error);
  return data !== null;
}

/** Images by id, whole records, for the Desk (the pre-publish checklist, the preview). */
export async function getMediaByIds(ids: readonly string[]): Promise<MediaRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("media_assets").select("*").in("id", [...ids]);
  if (error) throw storeError(error);
  return (data ?? []) as MediaRow[];
}

/** What a reader may read of an image (the columns desk-5 grants anon and authenticated). */
export type ReaderMediaRow = Pick<MediaRow, "id" | "storage_key" | "width" | "height" | "credit" | "alt_en" | "alt_hi" | "caption_en" | "caption_hi" | "renditions" | "active">;
const READER_MEDIA_COLUMNS = "id, storage_key, width, height, credit, alt_en, alt_hi, caption_en, caption_hi, renditions, active";

/**
 * The images a published revision uses, as readers may see them. Applies desk-5's reader policy in
 * the query too, as getPublishedStory does: only images this revision's usages name, only active
 * ones, only the readers' columns. The caller passes the published revision's id and its body's ids.
 */
export async function listPublishedImages(revisionId: string, ids: readonly string[]): Promise<ReaderMediaRow[]> {
  if (ids.length === 0) return [];
  const usages = await supabase.from("asset_usages").select("asset_id").eq("revision_id", revisionId).in("asset_id", [...ids]);
  if (usages.error) throw storeError(usages.error);
  const used = [...new Set((usages.data ?? []).map((u) => (u as { asset_id: string }).asset_id))];
  if (used.length === 0) return [];
  const { data, error } = await supabase.from("media_assets").select(READER_MEDIA_COLUMNS).in("id", used).eq("active", true);
  if (error) throw storeError(error);
  return ((data ?? []) as ReaderMediaRow[]).filter((row) => used.includes(row.id) && row.active);
}

/**
 * The images of a live blog's updates, as readers may see them (Panel 3, M3): an update is live the
 * moment it is posted, so its image was checked then like a story's before publication. Read again
 * here: only an active image with cleared rights, and only the readers' columns.
 */
export async function listLiveImages(ids: readonly string[]): Promise<ReaderMediaRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("media_assets").select(`${READER_MEDIA_COLUMNS}, rights_cleared_at`).in("id", [...ids]).eq("active", true);
  if (error) throw storeError(error);
  return ((data ?? []) as Array<ReaderMediaRow & { rights_cleared_at: string | null }>).filter((row) => ids.includes(row.id) && row.active && row.rights_cleared_at);
}

/**
 * Authors' photos, as readers may see them (migration desk-8): only an active author's photo, only an
 * active image, only the readers' columns. Applies the policy in the query too, as
 * listPublishedImages does.
 */
export async function listAuthorPhotos(ids: readonly string[]): Promise<ReaderMediaRow[]> {
  if (ids.length === 0) return [];
  const authors = await supabase.from("authors").select("photo_id").in("photo_id", [...ids]).eq("active", true);
  if (authors.error) throw storeError(authors.error);
  const allowed = [...new Set((authors.data ?? []).map((a) => (a as { photo_id: string | null }).photo_id).filter((id): id is string => typeof id === "string"))];
  if (allowed.length === 0) return [];
  const { data, error } = await supabase.from("media_assets").select(READER_MEDIA_COLUMNS).in("id", allowed).eq("active", true);
  if (error) throw storeError(error);
  return ((data ?? []) as ReaderMediaRow[]).filter((row) => allowed.includes(row.id) && row.active);
}
