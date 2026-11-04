import "server-only";

import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// ---- audit_log (Panel 0) -------------------------------------------------------------------
// The append-only, hash-chained log (database/migrations/2026-11-02-access-1-foundation.sql). The
// database sets seq, at, prev_hash and row_hash; a caller supplies the rest. Design §6.

/** One audit_log row as written. Columns the database fills (seq, at, hashes) are not here. */
export interface AuditRow {
  actor_type: "staff" | "system" | "legacy" | "bootstrap";
  actor_id: string | null;
  actor_label: string;
  actor_roles?: unknown[];
  aal?: "aal1" | "aal2" | null;
  action: string;
  outcome: "attempted" | "succeeded" | "failed" | "denied";
  attempt_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  language?: string | null;
  section?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
}

export class AuditWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditWriteError";
  }
}

/**
 * Writes one row and returns its id. Throws AuditWriteError on any failure: for a staff action the
 * audit row is a control, not observability, so a change that cannot be recorded does not happen
 * (owner decision Q2, fail closed). Compare recordSystemAudit below, which swallows failures.
 */
export async function recordAudit(row: AuditRow): Promise<string> {
  if (!isSupabaseConfigured()) throw new AuditWriteError("Supabase is not configured");
  let result: { data: unknown; error: { message: string } | null };
  try {
    result = await supabase.from("audit_log").insert(row).select("id").single();
  } catch (err) {
    throw new AuditWriteError(err instanceof Error ? err.message : String(err));
  }
  const id = (result.data as { id?: unknown } | null)?.id;
  if (result.error || typeof id !== "string") {
    throw new AuditWriteError(result.error?.message ?? "audit_log insert returned no id");
  }
  return id;
}

/**
 * For the cron (actor system:cron, D11). A run must not stop because its log line failed, so this
 * reports the failure to Sentry and carries on: the contract the deleted logAdminAction had for
 * admin_logs, which nothing writes any more (frozen by 2026-11-02-access-3-freeze-admin-logs.sql).
 */
export async function recordSystemAudit(row: AuditRow): Promise<void> {
  try {
    await recordAudit(row);
  } catch (err) {
    console.error("System audit insert error:", err);
    Sentry.captureMessage(`System audit insert error: ${err instanceof Error ? err.message : String(err)}`, {
      tags: { source: "supabase" },
      extra: { operation: "recordSystemAudit", action: row.action },
    });
  }
}
