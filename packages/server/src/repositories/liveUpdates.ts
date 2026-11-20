import "server-only";

import { supabase } from "../lib/supabase";
import { DeskStoreError, type StoryRow } from "./stories";

/**
 * A live blog's updates (Panel 3 design §2, M3), read and written as service_role. Every change goes
 * through one database function (database/migrations/2026-11-20-front-3-live.sql), each one
 * transaction that refuses a story that is not an open live blog. Who may act, and whether an
 * update's text is allowed (packages/editor/src/live.ts), is decided before any of this is called.
 */

export interface LiveUpdateRow {
  id: string;
  story_id: string;
  headline: string | null;
  body: unknown;
  is_key_event: boolean;
  is_pinned: boolean;
  posted_by: string;
  posted_at: string;
  edited_by: string | null;
  edited_at: string | null;
  removed_by: string | null;
  removed_at: string | null;
  removed_reason: string | null;
}

const COLUMNS = "id, story_id, headline, body, is_key_event, is_pinned, posted_by, posted_at, edited_by, edited_at, removed_by, removed_at, removed_reason";

/** The most updates the Desk's panel reads at once, newest first. */
export const LIVE_PANEL_LIMIT = 200;

/**
 * The database's refusals as statuses (design §3): 409 for a story that is not an open live blog or
 * an update already removed; 404 for an unknown story or update; 422 for a value the table refuses.
 * The routes check each of these first, with their own words; these are the backstop.
 */
export function liveError(error: { code?: string; message: string }): DeskStoreError {
  switch (error.code) {
    case "P0002": // no_data_found
      return new DeskStoreError(404, /update/.test(error.message) ? "Update not found." : "Story not found.");
    case "55000": // object_not_in_prerequisite_state
      return new DeskStoreError(409, /removed/.test(error.message) ? "This update was removed." : "The story is not an open live blog: it is not published, or the live blog has ended.");
    case "23514": // check_violation
    case "23502": // not_null_violation
    case "22P02": // invalid_text_representation (a malformed id)
      return new DeskStoreError(422, error.message);
    default:
      return new DeskStoreError(500, error.message);
  }
}

/** A story's updates, newest first, removed ones included (the Desk's panel shows them as removed). */
export async function listLiveUpdates(storyId: string, limit: number = LIVE_PANEL_LIMIT): Promise<LiveUpdateRow[]> {
  const { data, error } = await supabase.from("live_updates").select(COLUMNS).eq("story_id", storyId).order("posted_at", { ascending: false }).limit(limit);
  if (error) throw liveError(error);
  return ((data ?? []) as LiveUpdateRow[]).filter((u) => u.story_id === storyId);
}

export async function getLiveUpdate(id: string): Promise<LiveUpdateRow | null> {
  const { data, error } = await supabase.from("live_updates").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw liveError(error);
  return (data as LiveUpdateRow | null) ?? null;
}

export interface LiveFields {
  headline: string | null;
  body: unknown;
  isKeyEvent: boolean;
  isPinned: boolean;
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw liveError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DeskStoreError(500, `${fn} returned nothing.`);
  return row as T;
}

/** Posts an update (live_post); pinning it unpins the story's other one. */
export function postLiveUpdate(storyId: string, actorId: string, fields: LiveFields): Promise<LiveUpdateRow> {
  return call("live_post", { p_story: storyId, p_actor: actorId, p_headline: fields.headline, p_body: fields.body, p_key_event: fields.isKeyEvent, p_pinned: fields.isPinned });
}

/** Replaces an update's text and flags (live_edit). */
export function editLiveUpdate(updateId: string, actorId: string, fields: LiveFields): Promise<LiveUpdateRow> {
  return call("live_edit", { p_update: updateId, p_actor: actorId, p_headline: fields.headline, p_body: fields.body, p_key_event: fields.isKeyEvent, p_pinned: fields.isPinned });
}

/** Takes an update off the page, with a reason (live_remove). */
export function removeLiveUpdate(updateId: string, actorId: string, reason: string): Promise<LiveUpdateRow> {
  return call("live_remove", { p_update: updateId, p_actor: actorId, p_reason: reason });
}

/** Ends a live blog (live_end): it takes no more updates. */
export function endLiveBlog(storyId: string, actorId: string): Promise<StoryRow> {
  return call("live_end", { p_story: storyId, p_actor: actorId });
}
