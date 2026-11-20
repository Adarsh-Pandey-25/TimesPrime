import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { RouteRule } from "@timesprime/server/auth/adminRoutePolicy";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, type Actor, type AuditEntry } from "@timesprime/server/auth/requirePermission";
import { covers, SITE_WIDE, type Scope } from "@timesprime/server/auth/scope";
import { getGrievance, GrievanceStoreError, type GrievanceNoteRow, type GrievanceRow } from "@timesprime/server/repositories/grievances";
import { maskEmail } from "@timesprime/shared/config/grievances";
import { scopesFor } from "../../desk/_lib/desk";

// The grievance routes (Panel 7 design §3 and §4) share these: the gate, what the screen may offer,
// how a grievance is shown to each holder, its audit rows, and the store's failures as answers. HTTP
// answers stay here, in the app; the rules are in packages/.

/**
 * Whether the caller acts on grievances: a live grievance.handle grant at F with no scope (the
 * Grievance Officer, Legal). For the screen only (what to offer); every change is decided again by
 * the gate, against the site-wide target.
 */
export function mayHandle(actor: Actor, now: Date): boolean {
  return scopesFor(actor, "grievance.handle", ["F"], now).some((scope) => covers(scope as Scope, SITE_WIDE));
}

/** A grievance as the screen shows it, with the names of the staff it records. */
export interface GrievanceView extends GrievanceRow {
  /** False when the email is masked: the Managing Editor's read-only view (decision 4). */
  contact_shown: boolean;
  names: Record<string, string>;
}

export function grievanceView(row: GrievanceRow, handler: boolean, names: Map<string, string>): GrievanceView {
  const people = [row.entered_by, row.acknowledged_by, row.assigned_to, row.decided_by].filter((id): id is string => Boolean(id));
  return {
    ...row,
    email: handler ? row.email : maskEmail(row.email),
    contact_shown: handler,
    names: Object.fromEntries(people.filter((id) => names.has(id)).map((id) => [id, names.get(id) as string])),
  };
}

export const noteView = (note: GrievanceNoteRow, names: Map<string, string>) => ({ ...note, author_name: names.get(note.author_id) ?? "a staff member" });

/** People named on the rows: who typed each in, acknowledged it, handles it and decided it. */
export const peopleOn = (rows: readonly GrievanceRow[]) => rows.flatMap((r) => [r.entered_by, r.acknowledged_by, r.assigned_to, r.decided_by]);

/**
 * An audit row for a grievance. Site-wide, with no language or section, so a desk's audit.read does
 * not reach it. It records the ticket and the state, never the complainant's name or email (design §7).
 */
export function grievanceAudit(action: string, g: Pick<GrievanceRow, "id" | "ticket" | "state" | "outcome" | "acknowledged_at" | "assigned_to">, reason: string | null = null): AuditEntry {
  return {
    action,
    entityType: "grievance",
    entityId: g.id,
    target: SITE_WIDE,
    before: { ticket: g.ticket, state: g.state, outcome: g.outcome, acknowledged_at: g.acknowledged_at, assigned_to: g.assigned_to },
    reason,
  };
}

/** A store failure as an answer: its own status for 404, 409, 422 and 429; 500 (and Sentry) otherwise. */
export function complianceFailure(err: unknown, operation: string): NextResponse {
  if (err instanceof GrievanceStoreError && err.status !== 500) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`Compliance ${operation} failed:`, err);
  Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation } });
  return NextResponse.json({ error: "This could not be done. Nothing was changed." }, { status: 500 });
}

export const conflict = (error: string, code: string) => NextResponse.json({ error, code }, { status: 409 });

/**
 * Runs one audited change (owner decision Q2): the attempt row first, refused with 503 if it cannot be
 * written; then the change; then its outcome.
 */
export async function audited<T>(
  actor: Actor,
  row: AuditEntry,
  change: () => Promise<T>,
  after: (value: T) => Record<string, unknown>
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  const attempt = await beginAudit(actor, row);
  if (!attempt) return { ok: false, response: auditUnavailable() };
  try {
    const value = await change();
    await finishAudit(actor, attempt, "succeeded", { ...row, after: after(value) });
    return { ok: true, value };
  } catch (err) {
    await finishAudit(actor, attempt, "failed", { ...row, reason: err instanceof Error ? err.message : String(err) });
    return { ok: false, response: complianceFailure(err, row.action) };
  }
}

type Gated = { ok: true; actor: Actor; grievance: GrievanceRow } | { ok: false; response: NextResponse };

/**
 * The gate for a route on one grievance: the permission first (site-wide for a change, so a caller
 * who may not act learns nothing, not even whether the grievance exists), then the grievance.
 */
export async function gateGrievance(request: NextRequest, rule: RouteRule, id: string | undefined): Promise<Gated> {
  const gate = await requirePermission(request, rule, rule.mode === "act" ? SITE_WIDE : undefined);
  if (!gate.ok) return gate;
  let grievance: GrievanceRow | null;
  try {
    grievance = id ? await getGrievance(id) : null;
  } catch (err) {
    return { ok: false, response: complianceFailure(err, "getGrievance") };
  }
  if (!grievance) return { ok: false, response: NextResponse.json({ error: "Grievance not found." }, { status: 404 }) };
  return { ok: true, actor: gate.actor, grievance };
}
