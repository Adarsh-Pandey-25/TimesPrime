import "server-only";

import type { EnteredChannel, GrievanceFields, GrievanceOutcome } from "@timesprime/shared/config/grievances";
import { supabase } from "../lib/supabase";

/**
 * Grievances (Panel 7 design §2, M1), read and written as service_role. Every change goes through one
 * database function (database/migrations/2026-11-20-compliance-1-grievances.sql), each one
 * transaction that locks the grievance and refuses one in the wrong state. Who may act
 * (grievance.handle) and whether the fields are allowed (packages/shared/src/config/grievances.ts)
 * are decided before any of this is called.
 */

export interface GrievanceRow {
  id: string;
  ticket: string;
  channel: "web" | EnteredChannel;
  language: "en" | "hi";
  name: string;
  email: string;
  about_url: string | null;
  story_id: string | null;
  category: GrievanceFields["category"];
  body: string;
  received_at: string;
  entered_by: string | null;
  entered_at: string;
  ack_due_at: string;
  decide_due_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  assigned_to: string | null;
  state: "open" | "decided";
  outcome: GrievanceOutcome | null;
  reply: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface GrievanceNoteRow {
  id: string;
  grievance_id: string;
  body: string;
  author_id: string;
  created_at: string;
}

const COLUMNS =
  "id, ticket, channel, language, name, email, about_url, story_id, category, body, received_at, entered_by, entered_at, ack_due_at, decide_due_at, acknowledged_at, acknowledged_by, assigned_to, state, outcome, reply, decided_by, decided_at";
const NOTE_COLUMNS = "id, grievance_id, body, author_id, created_at";

/** A refusal or failure of the grievance store, with the status the routes answer. */
export class GrievanceStoreError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 429 | 500,
    message: string
  ) {
    super(message);
    this.name = "GrievanceStoreError";
  }
}

/**
 * The database's refusals as statuses: 404 for an unknown grievance; 409 for one in the wrong state;
 * 422 for a value the table refuses; 429 when the form's daily limit is reached. The routes check
 * each of these first, with their own words; these are the backstop.
 */
export function grievanceError(error: { code?: string; message: string }): GrievanceStoreError {
  switch (error.code) {
    case "P0002": // no_data_found
      return new GrievanceStoreError(404, "Grievance not found.");
    case "55000": // object_not_in_prerequisite_state
      return new GrievanceStoreError(409, /acknowledged/.test(error.message) ? "This grievance was already acknowledged." : "This grievance is decided: a decision is final.");
    case "54000": // program_limit_exceeded: grievance_submit's 500 a day
      return new GrievanceStoreError(429, "The form takes no more grievances today.");
    case "23514": // check_violation
    case "23502": // not_null_violation
    case "23503": // foreign_key_violation (an unknown story or staff member)
    case "22P02": // invalid_text_representation (a malformed id)
      return new GrievanceStoreError(422, error.message);
    default:
      return new GrievanceStoreError(500, error.message);
  }
}

/** The most grievances the queue reads at once. */
export const QUEUE_LIMIT = 200;

export type QueueFilter = "open" | "decided" | "all";

/**
 * The queue: open grievances, the decision due soonest first; decided ones, the newest decision
 * first; or all, the newest first. With a ticket, that grievance alone.
 */
export async function listGrievances(filter: QueueFilter, ticket: string | null = null): Promise<GrievanceRow[]> {
  let query = supabase.from("grievances").select(COLUMNS);
  if (ticket) query = query.eq("ticket", ticket);
  if (filter === "open") query = query.eq("state", "open").order("decide_due_at", { ascending: true });
  else if (filter === "decided") query = query.eq("state", "decided").order("decided_at", { ascending: false });
  else query = query.order("received_at", { ascending: false });
  const { data, error } = await query.limit(QUEUE_LIMIT);
  if (error) throw grievanceError(error);
  return (data ?? []) as GrievanceRow[];
}

/** How many grievances are open, and of those how many are late: their decision, or (typed in) their acknowledgement. */
export async function countOpenGrievances(now: Date): Promise<{ open: number; late: number; ackLate: number }> {
  const at = now.toISOString();
  const head = () => supabase.from("grievances").select("id", { count: "exact", head: true }).eq("state", "open");
  const [open, late, ackLate] = await Promise.all([
    head(),
    head().lte("decide_due_at", at),
    head().is("acknowledged_at", null).lte("ack_due_at", at),
  ]);
  for (const r of [open, late, ackLate]) if (r.error) throw grievanceError(r.error);
  return { open: open.count ?? 0, late: late.count ?? 0, ackLate: ackLate.count ?? 0 };
}

export async function getGrievance(id: string): Promise<GrievanceRow | null> {
  const { data, error } = await supabase.from("grievances").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw grievanceError(error);
  return (data as GrievanceRow | null) ?? null;
}

/** A grievance's notes, oldest first. */
export async function listGrievanceNotes(id: string): Promise<GrievanceNoteRow[]> {
  const { data, error } = await supabase.from("grievance_notes").select(NOTE_COLUMNS).eq("grievance_id", id).order("created_at", { ascending: true });
  if (error) throw grievanceError(error);
  return ((data ?? []) as GrievanceNoteRow[]).filter((n) => n.grievance_id === id);
}

/** Staff members' display names, by user id. Someone without one is left out. */
export async function staffNames(ids: ReadonlyArray<string | null>): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (wanted.length === 0) return names;
  const { data, error } = await supabase.from("staff_profiles").select("user_id, display_name").in("user_id", wanted);
  if (error) throw grievanceError(error);
  for (const p of (data ?? []) as Array<{ user_id: string; display_name: string | null }>) {
    if (p.display_name) names.set(p.user_id, p.display_name);
  }
  return names;
}

/** The Desk story a grievance is about: its state and, while it has one, its live headline. */
export interface GrievanceStory {
  id: string;
  workflow_state: string;
  headline: string | null;
}

export async function grievanceStory(storyId: string): Promise<GrievanceStory | null> {
  const { data, error } = await supabase
    .from("stories")
    .select("id, workflow_state, revision:story_revisions!stories_published_revision_fk(headline)")
    .eq("id", storyId)
    .maybeSingle();
  if (error) throw grievanceError(error);
  if (!data) return null;
  const row = data as unknown as { id: string; workflow_state: string; revision: { headline: string } | null };
  return { id: row.id, workflow_state: row.workflow_state, headline: row.revision?.headline ?? null };
}

/** The Desk story with this public number, if any (published only, for the form). */
export async function storyIdByNumber(publicId: number, publishedOnly: boolean): Promise<string | null> {
  let query = supabase.from("stories").select("id").eq("public_id", publicId);
  if (publishedOnly) query = query.eq("workflow_state", "published");
  const { data, error } = await query.maybeSingle();
  if (error) throw grievanceError(error);
  return (data as { id: string } | null)?.id ?? null;
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw grievanceError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new GrievanceStoreError(500, `${fn} returned nothing.`);
  return row as T;
}

// ---- the readers' two functions (decision 1): the only grievance calls the reader site makes ----

/** What the form's sender is told: the ticket, when it arrived, and when the decision is due. */
export interface SubmittedGrievance {
  ticket: string;
  received_at: string;
  decide_due_at: string;
}

/**
 * A grievance from the form (grievance_submit), acknowledged on the spot. The story is kept only if
 * it is published. The one write the reader site makes (apps/web/src/readerWrites.test.ts).
 */
export function submitGrievance(fields: GrievanceFields, storyId: string | null): Promise<SubmittedGrievance> {
  return call("grievance_submit", {
    p_language: fields.language,
    p_name: fields.name,
    p_email: fields.email,
    p_about_url: fields.aboutUrl,
    p_story: storyId,
    p_category: fields.category,
    p_body: fields.body,
  });
}

/** A grievance as its sender sees it on the status page: no notes, no staff. */
export interface GrievanceStatus {
  ticket: string;
  state: "open" | "decided";
  received_at: string;
  acknowledged_at: string | null;
  decide_due_at: string;
  outcome: GrievanceOutcome | null;
  reply: string | null;
  decided_at: string | null;
}

/** The grievance with this ticket and email (grievance_status), or null for any other pair. */
export async function grievanceStatus(ticket: string, email: string): Promise<GrievanceStatus | null> {
  const { data, error } = await supabase.rpc("grievance_status", { p_ticket: ticket, p_email: email });
  if (error) throw grievanceError(error);
  return (data as GrievanceStatus | null) ?? null;
}

/** A grievance received by email, post or another way, typed in by an officer (grievance_enter). */
export function enterGrievance(input: {
  actorId: string;
  channel: EnteredChannel;
  fields: GrievanceFields;
  storyId: string | null;
  receivedAt: string | null;
  acknowledged: boolean;
}): Promise<GrievanceRow> {
  const f = input.fields;
  return call("grievance_enter", {
    p_actor: input.actorId,
    p_channel: input.channel,
    p_language: f.language,
    p_name: f.name,
    p_email: f.email,
    p_about_url: f.aboutUrl,
    p_story: input.storyId,
    p_category: f.category,
    p_body: f.body,
    p_received_at: input.receivedAt,
    p_acknowledged: input.acknowledged,
  });
}

/** The officer has acknowledged it (grievance_acknowledge). */
export function acknowledgeGrievance(id: string, actorId: string): Promise<GrievanceRow> {
  return call("grievance_acknowledge", { p_grievance: id, p_actor: actorId });
}

/** Who handles it (grievance_assign). */
export function assignGrievance(id: string, actorId: string, assigneeId: string): Promise<GrievanceRow> {
  return call("grievance_assign", { p_grievance: id, p_actor: actorId, p_assignee: assigneeId });
}

/** An internal note (grievance_note). */
export function addGrievanceNote(id: string, actorId: string, body: string): Promise<GrievanceNoteRow> {
  return call("grievance_note", { p_grievance: id, p_actor: actorId, p_body: body });
}

/** The decision: its outcome and the reply told to the complainant (grievance_decide). Final. */
export function decideGrievance(id: string, actorId: string, outcome: GrievanceOutcome, reply: string): Promise<GrievanceRow> {
  return call("grievance_decide", { p_grievance: id, p_actor: actorId, p_outcome: outcome, p_reply: reply });
}
