import "server-only";

import { embargoed, type CreditRole, type StoryFormat, type StoryLanguage, type StoryState } from "@timesprime/shared/config/desk";
import type { PublishedStory } from "@timesprime/shared/types";
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
    case "23505": // unique_violation: an open request already exists
      return new DeskStoreError(409, "There is already an open request for this story.");
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

/** How many scheduled stories one run of the publish-scheduled job takes, oldest time first. */
export const DUE_BATCH = 50;

/** Scheduled stories whose time has come (the worker's publish-scheduled job, design §6), oldest first. */
export async function listDueScheduled(now: Date, limit: number = DUE_BATCH): Promise<StoryRow[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("workflow_state", "scheduled")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw storeError(error);
  return (data ?? []) as StoryRow[];
}

/** How far back the Desk's alert list looks (design §8): takedowns of the last 30 days. */
export const ALERT_DAYS = 30;
/** The most takedowns the alert list shows, newest first. */
export const ALERT_LIMIT = 50;
/** The most recent takedowns read before the scope filter: far more than a newsroom makes in a month. */
const TAKEDOWNS_READ = 100;

export interface TakedownAlert {
  /** The move's own id (workflow_transitions). */
  id: number;
  action: "unpublish" | "retract";
  /** "<reason code>: <note>", as the takedown recorded it. */
  reason: string | null;
  at: string;
  /** Who took it down: their display name, or their history label when the name is not known. */
  by: string;
  story: { id: string; language: StoryLanguage; section: string; workflow_state: StoryState; headline: string | null };
}

/** True when one of the scopes covers the desk; a null field means "all". */
export function inScopes(desk: { language: string; section: string }, scopes: readonly DeskScope[]): boolean {
  return scopes.some((s) => (s.language === null || s.language === desk.language) && (s.section === null || s.section === desk.section));
}

/**
 * The Desk's alert list (design §8, owner decision 5): every unpublish and retract of the last
 * ALERT_DAYS days, newest first, for stories inside the caller's scopes. Three plain reads (the
 * moves, their stories, the names of who made them), filtered here, so nothing depends on a join
 * the database has not served before.
 */
export async function listTakedowns(scopes: readonly DeskScope[], now: Date): Promise<TakedownAlert[]> {
  if (scopes.length === 0) return [];
  const since = new Date(now.getTime() - ALERT_DAYS * 86_400_000).toISOString();
  const moves = await supabase
    .from("workflow_transitions")
    .select("id, story_id, action, actor_id, actor_label, reason, at")
    .in("action", ["unpublish", "retract"])
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(TAKEDOWNS_READ);
  if (moves.error) throw storeError(moves.error);
  type Move = { id: number; story_id: string; action: "unpublish" | "retract"; actor_id: string | null; actor_label: string; reason: string | null; at: string };
  const rows = (moves.data ?? []) as Move[];
  if (rows.length === 0) return [];

  const storyRead = await supabase
    .from("stories")
    .select("id, language, section, workflow_state, current:story_revisions!stories_current_revision_fk(headline)")
    .in("id", [...new Set(rows.map((r) => r.story_id))]);
  if (storyRead.error) throw storeError(storyRead.error);
  type Story = { id: string; language: StoryLanguage; section: string; workflow_state: StoryState; current: { headline: string } | null };
  const stories = new Map(((storyRead.data ?? []) as unknown as Story[]).map((s) => [s.id, s]));
  const visible = rows.filter((r) => {
    const story = stories.get(r.story_id);
    return story !== undefined && inScopes(story, scopes);
  }).slice(0, ALERT_LIMIT);

  const names = new Map<string, string>();
  const actorIds = [...new Set(visible.map((r) => r.actor_id).filter((id): id is string => id !== null))];
  if (actorIds.length > 0) {
    const people = await supabase.from("staff_profiles").select("user_id, display_name").in("user_id", actorIds);
    if (people.error) throw storeError(people.error);
    for (const p of (people.data ?? []) as Array<{ user_id: string; display_name: string | null }>) {
      if (p.display_name) names.set(p.user_id, p.display_name);
    }
  }

  return visible.map((r) => {
    const story = stories.get(r.story_id) as Story;
    return {
      id: r.id,
      action: r.action,
      reason: r.reason,
      at: r.at,
      by: (r.actor_id && names.get(r.actor_id)) || r.actor_label,
      story: { id: story.id, language: story.language, section: story.section, workflow_state: story.workflow_state, headline: story.current?.headline ?? null },
    };
  });
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

/**
 * A reader's read (design §6): the columns the database grants readers (desk-1 migration), the
 * published revision through its own foreign key, and the bylines. Never `*`, so no staff ids or
 * desk flags leave the store on this path.
 */
const READER_SELECT = [
  "id, public_id, language, section, format, slug, correction_note, first_published_at, published_at,",
  "workflow_state, embargo_until, published_revision_id,",
  "revision:story_revisions!stories_published_revision_fk(id, story_id, headline, dek, seo_title, seo_description, body),",
  "bylines:story_authors(role, position, author:authors(display_name_en, display_name_hi, photo_id, active))",
].join(" ");

interface ReaderRow extends Omit<PublishedStory, "revision" | "bylines"> {
  workflow_state: string;
  embargo_until: string | null;
  published_revision_id: string | null;
  revision: (PublishedStory["revision"] & { id: string; story_id: string }) | null;
  bylines: Array<{ role: PublishedStory["bylines"][number]["role"]; position: number; author: { display_name_en: string; display_name_hi: string | null; photo_id?: string | null; active: boolean } | null }> | null;
}

/**
 * A published story by its number, as a reader may see it, or null: unknown, not published, or
 * still under embargo. The rules of the database's reader policies are applied twice, in the query
 * and again on the row, so a store that ignored a filter would still show only a live story. Only
 * active authors are credited, as the reader policy on `authors` has it.
 */
export async function getPublishedStory(publicId: number, now: Date = new Date()): Promise<PublishedStory | null> {
  if (!Number.isSafeInteger(publicId) || publicId < 1) return null;
  const { data, error } = await supabase
    .from("stories")
    .select(READER_SELECT)
    .eq("public_id", publicId)
    .eq("workflow_state", "published")
    .or(`embargo_until.is.null,embargo_until.lte."${now.toISOString()}"`)
    .limit(1);
  if (error) throw storeError(error);
  // The select is built from parts, so supabase-js cannot type the row from it.
  const row = (data?.[0] ?? null) as unknown as ReaderRow | null;
  if (!row || row.public_id !== publicId || row.workflow_state !== "published" || embargoed(row.embargo_until, now)) return null;
  const revision = row.revision;
  if (!revision || revision.id !== row.published_revision_id || revision.story_id !== row.id) return null;
  const bylines = (row.bylines ?? [])
    .filter((b) => b.author?.active)
    .sort((a, b) => a.position - b.position)
    .map((b) => ({ role: b.role, name: (row.language === "hi" && b.author?.display_name_hi) || (b.author?.display_name_en ?? ""), photoId: b.author?.photo_id ?? null }))
    .filter((b) => b.name.trim().length > 0);
  return {
    id: row.id,
    public_id: row.public_id,
    language: row.language,
    section: row.section,
    format: row.format,
    slug: row.slug,
    correction_note: row.correction_note,
    first_published_at: row.first_published_at,
    published_at: row.published_at,
    revision: { id: revision.id, headline: revision.headline, dek: revision.dek, seo_title: revision.seo_title, seo_description: revision.seo_description, body: revision.body },
    bylines,
  };
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

// ---- soft locks (design §2): one editor at a time; a lock lapses LOCK_TTL_MS after its heartbeat ----

export interface LockRow {
  story_id: string;
  holder_id: string;
  heartbeat_at: string;
}

export async function readLock(storyId: string): Promise<LockRow | null> {
  const { data, error } = await supabase.from("story_locks").select("story_id, holder_id, heartbeat_at").eq("story_id", storyId).maybeSingle();
  if (error) throw storeError(error);
  return (data as LockRow | null) ?? null;
}

/** Takes, renews or takes over the lock. The route decides whether the caller may. */
export async function writeLock(storyId: string, holderId: string, at: Date): Promise<void> {
  const { error } = await supabase
    .from("story_locks")
    .upsert({ story_id: storyId, holder_id: holderId, heartbeat_at: at.toISOString() }, { onConflict: "story_id" });
  if (error) throw storeError(error);
}

/** Releases the caller's own lock; someone else's stays. */
export async function releaseLock(storyId: string, holderId: string): Promise<void> {
  const { error } = await supabase.from("story_locks").delete().eq("story_id", storyId).eq("holder_id", holderId);
  if (error) throw storeError(error);
}

// ---- two-person requests (design §3, the matrix's A): one person asks, a different one decides ----

export interface PendingRow {
  id: string;
  story_id: string;
  action: "restore" | "correction";
  requested_by: string;
  reason: string;
  payload: unknown;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  outcome: "approved" | "declined" | null;
}

/** Asks to restore a taken-down story. A second open request for the story answers 409. */
export async function requestRestore(storyId: string, requestedBy: string, reason: string): Promise<PendingRow> {
  const { data, error } = await supabase
    .from("pending_actions")
    .insert({ story_id: storyId, action: "restore", requested_by: requestedBy, reason })
    .select("*")
    .single();
  if (error) throw storeError(error);
  return data as PendingRow;
}

/**
 * Asks for a public correction note on a live story (the matrix's A: a Sub-editor). The note is the
 * request's payload, and its reason. A second open correction request for the story answers 409.
 */
export async function requestCorrection(storyId: string, requestedBy: string, note: string): Promise<PendingRow> {
  const { data, error } = await supabase
    .from("pending_actions")
    .insert({ story_id: storyId, action: "correction", requested_by: requestedBy, reason: note, payload: { note } })
    .select("*")
    .single();
  if (error) throw storeError(error);
  return data as PendingRow;
}

export async function getPending(id: string): Promise<PendingRow | null> {
  const { data, error } = await supabase.from("pending_actions").select("*").eq("id", id).maybeSingle();
  if (error) throw storeError(error);
  return (data as PendingRow | null) ?? null;
}

/** A story's undecided requests. */
export async function listOpenPending(storyId: string): Promise<PendingRow[]> {
  const { data, error } = await supabase.from("pending_actions").select("*").eq("story_id", storyId).is("decided_at", null);
  if (error) throw storeError(error);
  return (data ?? []) as PendingRow[];
}

/**
 * Decides a restore or correction request in one transaction (desk_decide_pending:
 * database/migrations/2026-11-17-desk-2-restore.sql, and desk-3-corrections.sql for corrections).
 */
export function decidePending(input: { actionId: string; deciderId: string; deciderLabel: string; outcome: "approved" | "declined"; reason: string | null }): Promise<StoryRow> {
  return call("desk_decide_pending", {
    p_action: input.actionId,
    p_decider: input.deciderId,
    p_decider_label: input.deciderLabel,
    p_outcome: input.outcome,
    p_reason: input.reason,
  });
}

/** One of a story's credits, with its author's names, as the Desk shows it. */
export interface CreditRow {
  author_id: string;
  role: CreditRole;
  position: number;
  author: { display_name_en: string; display_name_hi: string | null; photo_id?: string | null; active: boolean } | null;
}

/** A story's credits, in order (design §2, story_authors). */
export async function listCredits(storyId: string): Promise<CreditRow[]> {
  const { data, error } = await supabase
    .from("story_authors")
    .select("author_id, role, position, author:authors(display_name_en, display_name_hi, photo_id, active)")
    .eq("story_id", storyId)
    .order("position", { ascending: true });
  if (error) throw storeError(error);
  return (data ?? []) as unknown as CreditRow[];
}

/**
 * Replaces a story's credits in one transaction with its history (desk_set_credits,
 * database/migrations/2026-11-18-desk-4-credits.sql): before publication only, every author active,
 * and an approved story back to desk review. Refused (409) if the story moved since the caller read it.
 */
export function setCredits(input: { storyId: string; from: StoryState; actorId: string; actorLabel: string; credits: Array<{ author_id: string; role: CreditRole }> }): Promise<StoryRow> {
  return call("desk_set_credits", {
    p_story: input.storyId,
    p_from: input.from,
    p_actor: input.actorId,
    p_actor_label: input.actorLabel,
    p_credits: input.credits,
  });
}
