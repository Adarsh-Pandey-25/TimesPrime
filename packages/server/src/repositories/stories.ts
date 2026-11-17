import "server-only";

import type { StoryFormat, StoryLanguage, StoryState } from "@timesprime/shared/config/desk";
import { supabase } from "../lib/supabase";

/**
 * The Desk's stories (Panel 2 design §2), read and written as service_role. Every change goes through
 * the database's desk_* functions (database/migrations/2026-11-17-desk-1-stories.sql), each one
 * transaction, which refuse a story that moved since the caller read it. Who may act is decided before
 * any of this is called (requirePermission, and the workflow checks in services/desk).
 */

export interface StoryRow {
  id: string;
  public_id: number;
  language: StoryLanguage;
  section: string;
  format: StoryFormat;
  workflow_state: StoryState;
  translation_group_id: string | null;
  slug: string | null;
  created_by: string;
  assigned_to: string | null;
  last_edited_by: string | null;
  approved_by: string | null;
  approved_revision_id: string | null;
  published_by: string | null;
  current_revision_id: string | null;
  published_revision_id: string | null;
  scheduled_at: string | null;
  embargo_until: string | null;
  legal_hold: boolean;
  legal_review_required: boolean;
  content_label: string | null;
  breaking: boolean;
  post_hoc_review_due: boolean;
  correction_note: string | null;
  first_published_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevisionRow {
  id: string;
  story_id: string;
  body: unknown;
  headline: string;
  dek: string | null;
  seo_title: string | null;
  seo_description: string | null;
  editor_id: string;
  is_substantive: boolean;
  created_at: string;
}

export interface HistoryEntry {
  action: string;
  from_state: StoryState | null;
  to_state: StoryState;
  actor_id: string | null;
  actor_label: string;
  revision_id: string | null;
  reason: string | null;
  at: string;
}

export interface StoryListRow extends StoryRow {
  current: { headline: string } | null;
}

/** A store failure, with the HTTP status the route should answer. */
export class DeskStoreError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 500,
    message: string
  ) {
    super(message);
    this.name = "DeskStoreError";
  }
}

/** Postgres's error codes from the desk_* functions and the tables' constraints, as statuses. */
export function storeError(error: { code?: string; message: string }): DeskStoreError {
  switch (error.code) {
    case "40001": // serialization_failure: the story moved since the caller read it
      return new DeskStoreError(409, "The story changed since you opened it. Reload it and try again.");
    case "P0002": // no_data_found
      return new DeskStoreError(404, "Story not found.");
    case "23514": // check_violation
    case "23503": // foreign_key_violation (an unknown section, staff member or revision)
    case "22P02": // invalid_text_representation (a malformed id)
      return new DeskStoreError(422, error.message);
    default:
      return new DeskStoreError(500, error.message);
  }
}

/** A role assignment's scope; a null field means "all". */
export interface DeskScope {
  language: string | null;
  section: string | null;
}

const LANGUAGE = /^(en|hi)$/;
const SECTION = /^[a-z_]+$/;

/**
 * The PostgREST `or` filter that keeps a list inside the caller's scopes, or null when one scope is
 * unlimited. Only well-formed values are used (they come from role_assignments, whose CHECKs have the
 * same shapes); a malformed scope is dropped, which can only narrow the list.
 */
export function scopeFilter(scopes: readonly DeskScope[]): string | null {
  if (scopes.some((s) => s.language === null && s.section === null)) return null;
  const clauses = scopes.flatMap((s) => {
    const parts: string[] = [];
    if (s.language !== null) {
      if (!LANGUAGE.test(s.language)) return [];
      parts.push(`language.eq.${s.language}`);
    }
    if (s.section !== null) {
      if (!SECTION.test(s.section)) return [];
      parts.push(`section.eq.${s.section}`);
    }
    return [parts.length === 1 ? parts[0] : `and(${parts.join(",")})`];
  });
  // No usable scope: a filter that matches nothing.
  return clauses.length > 0 ? clauses.join(",") : "id.is.null";
}

export interface ListFilters {
  language?: StoryLanguage;
  section?: string;
  state?: StoryState;
  createdBy?: string;
  postHocReviewDue?: boolean;
}

export const STORY_PAGE_SIZE = 50;

export async function listStories(filters: ListFilters, scopes: readonly DeskScope[], page = 1): Promise<{ stories: StoryListRow[]; total: number }> {
  if (scopes.length === 0) return { stories: [], total: 0 };
  let query = supabase
    .from("stories")
    .select("*, current:story_revisions!stories_current_revision_fk(headline)", { count: "exact" })
    .order("updated_at", { ascending: false });
  if (filters.language) query = query.eq("language", filters.language);
  if (filters.section) query = query.eq("section", filters.section);
  if (filters.state) query = query.eq("workflow_state", filters.state);
  if (filters.createdBy) query = query.eq("created_by", filters.createdBy);
  if (filters.postHocReviewDue) query = query.eq("post_hoc_review_due", true);
  const scoped = scopeFilter(scopes);
  if (scoped) query = query.or(scoped);
  const from = (Math.max(1, page) - 1) * STORY_PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + STORY_PAGE_SIZE - 1);
  if (error) throw storeError(error);
  return { stories: (data ?? []) as StoryListRow[], total: count ?? 0 };
}

export async function getStory(id: string): Promise<StoryRow | null> {
  const { data, error } = await supabase.from("stories").select("*").eq("id", id).maybeSingle();
  if (error) throw storeError(error);
  return (data as StoryRow | null) ?? null;
}

export async function getRevision(id: string): Promise<RevisionRow | null> {
  const { data, error } = await supabase.from("story_revisions").select("*").eq("id", id).maybeSingle();
  if (error) throw storeError(error);
  return (data as RevisionRow | null) ?? null;
}

/** A story's revisions, newest first, without their bodies. */
export async function listRevisions(storyId: string): Promise<Omit<RevisionRow, "body">[]> {
  const { data, error } = await supabase
    .from("story_revisions")
    .select("id, story_id, headline, dek, seo_title, seo_description, editor_id, is_substantive, created_at")
    .eq("story_id", storyId)
    .order("created_at", { ascending: false });
  if (error) throw storeError(error);
  return (data ?? []) as Omit<RevisionRow, "body">[];
}

/** A story's history, oldest first: what the four-eyes check reads. */
export async function listHistory(storyId: string): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from("workflow_transitions")
    .select("action, from_state, to_state, actor_id, actor_label, revision_id, reason, at")
    .eq("story_id", storyId)
    .order("id", { ascending: true });
  if (error) throw storeError(error);
  return (data ?? []) as HistoryEntry[];
}

/** Whether the story's other-language version exists (the checklist's translation item). */
export async function hasCounterpart(story: Pick<StoryRow, "id" | "language" | "translation_group_id">): Promise<boolean> {
  if (!story.translation_group_id) return true;
  const { count, error } = await supabase
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("translation_group_id", story.translation_group_id)
    .neq("language", story.language)
    .neq("workflow_state", "killed");
  if (error) throw storeError(error);
  return (count ?? 0) > 0;
}

async function call(fn: string, args: Record<string, unknown>): Promise<StoryRow> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw storeError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DeskStoreError(500, `${fn} returned nothing.`);
  return row as StoryRow;
}

export function createStory(input: {
  actorId: string;
  language: StoryLanguage;
  section: string;
  format: StoryFormat;
  state: "pitch" | "draft";
  headline: string;
  dek: string | null;
  body: unknown;
  translationGroupId: string | null;
}): Promise<StoryRow> {
  return call("desk_create_story", {
    p_actor: input.actorId,
    p_language: input.language,
    p_section: input.section,
    p_format: input.format,
    p_state: input.state,
    p_headline: input.headline,
    p_dek: input.dek,
    p_body: input.body,
    p_translation_group_id: input.translationGroupId,
  });
}

export function saveRevision(input: {
  storyId: string;
  actorId: string;
  expectedRevisionId: string | null;
  headline: string;
  dek: string | null;
  body: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  isSubstantive: boolean;
}): Promise<StoryRow> {
  return call("desk_save_revision", {
    p_story: input.storyId,
    p_actor: input.actorId,
    p_expected_revision: input.expectedRevisionId,
    p_headline: input.headline,
    p_dek: input.dek,
    p_body: input.body,
    p_seo_title: input.seoTitle,
    p_seo_description: input.seoDescription,
    p_is_substantive: input.isSubstantive,
  });
}

/** The fields a move may set (the database refuses any other). */
export interface MoveFields {
  assigned_to?: string | null;
  approved_by?: string | null;
  approved_revision_id?: string | null;
  published_by?: string | null;
  published_revision_id?: string | null;
  scheduled_at?: string | null;
  embargo_until?: string | null;
  published_at?: string | null;
  first_published_at?: string | null;
  breaking?: boolean;
  post_hoc_review_due?: boolean;
  correction_note?: string | null;
  legal_review_required?: boolean;
  slug?: string | null;
}

export function transition(input: {
  storyId: string;
  action: string;
  from: StoryState;
  to: StoryState;
  actorId: string | null;
  actorLabel: string;
  reason: string | null;
  fields: MoveFields;
}): Promise<StoryRow> {
  return call("desk_transition", {
    p_story: input.storyId,
    p_action: input.action,
    p_from: input.from,
    p_to: input.to,
    p_actor: input.actorId,
    p_actor_label: input.actorLabel,
    p_reason: input.reason,
    p_fields: input.fields,
  });
}
