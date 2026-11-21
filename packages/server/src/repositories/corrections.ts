import "server-only";

import type { CorrectionKind, PublicCorrection } from "@timesprime/shared/config/corrections";
import { supabase } from "../lib/supabase";
import { DeskStoreError } from "./stories";

/**
 * The corrections log (Panel 7 design §2, M2), read and written as service_role. A correction is
 * made through one database function (database/migrations/2026-11-21-compliance-2-corrections.sql),
 * desk_correct, or by desk_decide_pending for a Sub-editor's request; each is one transaction with
 * the story's note and its history row. Readers read the log through corrections_log only.
 */

export interface CorrectionRow {
  id: string;
  story_id: string;
  language: "en" | "hi";
  kind: CorrectionKind;
  text: string;
  headline: string | null;
  revision_id: string | null;
  grievance_id: string | null;
  transition_id: number;
  published_by: string;
  requested_by: string | null;
  published_at: string;
}

const COLUMNS = "id, story_id, language, kind, text, headline, revision_id, grievance_id, transition_id, published_by, requested_by, published_at";

/**
 * The database's refusals as statuses: 409 for a story that is not live; 422 for a value the table
 * refuses (an unknown grievance or kind). The routes check each first; these are the backstop.
 */
export function correctionError(error: { code?: string; message: string }): DeskStoreError {
  switch (error.code) {
    case "40001": // serialization_failure: the story is not live
      return new DeskStoreError(409, "A correction goes on a live story: this one is not published any more.");
    case "23514": // check_violation
    case "23503": // foreign_key_violation
    case "22P02": // invalid_text_representation
      return new DeskStoreError(422, error.message);
    default:
      return new DeskStoreError(500, error.message);
  }
}

/** Publishes a correction at once (desk_correct): the story's note, its history row and the log's row. */
export async function publishCorrection(input: {
  storyId: string;
  actorId: string;
  actorLabel: string;
  kind: CorrectionKind;
  text: string;
  grievanceId: string | null;
}): Promise<CorrectionRow> {
  const { data, error } = await supabase.rpc("desk_correct", {
    p_story: input.storyId,
    p_actor: input.actorId,
    p_actor_label: input.actorLabel,
    p_kind: input.kind,
    p_text: input.text,
    p_grievance: input.grievanceId,
  });
  if (error) throw correctionError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DeskStoreError(500, "desk_correct returned nothing.");
  return row as CorrectionRow;
}

/** Codes for "the log is not there yet": compliance-2 not applied (no function, no table). */
const NOT_APPLIED = new Set(["42883", "42P01", "PGRST202", "PGRST205"]);

/**
 * The back office's log, newest first: every column, at most `limit`, before a time for the next
 * page. null when compliance-2 is not applied yet.
 */
export async function listCorrections(limit: number, before: string | null = null): Promise<CorrectionRow[] | null> {
  let query = supabase.from("corrections").select(COLUMNS);
  if (before) query = query.lt("published_at", before);
  const { data, error } = await query.order("published_at", { ascending: false }).limit(limit);
  if (error) {
    if (error.code && NOT_APPLIED.has(error.code)) return null;
    throw correctionError(error);
  }
  return (data ?? []) as CorrectionRow[];
}

/** The corrections a grievance caused, oldest first; none before compliance-2 is applied. */
export async function correctionsForGrievance(grievanceId: string): Promise<CorrectionRow[]> {
  const { data, error } = await supabase.from("corrections").select(COLUMNS).eq("grievance_id", grievanceId).order("published_at", { ascending: true });
  if (error) {
    if (error.code && NOT_APPLIED.has(error.code)) return [];
    throw correctionError(error);
  }
  return ((data ?? []) as CorrectionRow[]).filter((c) => c.grievance_id === grievanceId);
}

/**
 * The readers' log (corrections_log), newest first: all stories', or one story's. null when
 * compliance-2 is not applied yet, so a story page can fall back to its one correction note.
 */
export async function publicCorrections(options: { storyId?: string | null; before?: string | null; limit: number }): Promise<PublicCorrection[] | null> {
  const { data, error } = await supabase.rpc("corrections_log", {
    p_story: options.storyId ?? null,
    p_before: options.before ?? null,
    p_limit: options.limit,
  });
  if (error) {
    if (error.code && NOT_APPLIED.has(error.code)) return null;
    throw correctionError(error);
  }
  return ((data ?? []) as Array<PublicCorrection & { public_id: number | string | null }>).map((c) => ({
    ...c,
    public_id: c.public_id === null ? null : Number(c.public_id),
  }));
}
