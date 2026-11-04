import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getClientIp } from "@/server/lib/rateLimit";
import { recordAudit, type AuditRow } from "@/server/repositories/auditLog";
import { loadStaffRecord } from "@/server/repositories/staff";
import type { PermissionKey, RoleKey, ScopeLanguage } from "@/config/permissions";
import type { RouteRule } from "./adminRoutePolicy";
import { ANY_SCOPE, decide, decideLegacy, type Aal, type Decision, type DenyCode, type StaffRecord } from "./decide";
import type { Target } from "./scope";
import { readSession } from "./staffSession";

// The gate every admin route body passes before it reads or changes anything (design §3).
//
// It is the ONLY gate on the app's request path. The app talks to Supabase as service_role, which
// bypasses RLS, so nothing behind this function checks again (design, "Approval"). The proxy's
// check is optimistic, and RLS protects only direct access with a user's own token.
//
// Steps: read the session (401 if none); for a staff session, read the staff record from the
// database (503 if that fails: nothing was changed); decide() each permission the route needs.
// A refusal of a signed-in caller is written to the audit log as 'denied'. If that write fails,
// the refusal stands.

export interface ActorRole {
  role: RoleKey;
  language: ScopeLanguage | null;
  section: string | null;
}

/** Who passed the gate, for the route body and its audit rows. Comes only from the session. */
export interface Actor {
  kind: "staff" | "legacy";
  userId: string | null;
  label: string;
  aal: Aal | null;
  /** The live assignments when the request arrived: a snapshot for the audit log. */
  roles: ActorRole[];
  /** The assignment ids that allowed the last check. */
  via: string[];
  record: StaffRecord | null;
  meta: { ip: string; userAgent: string | null; requestId: string };
}

export type GateResult = { ok: true; actor: Actor } | { ok: false; response: NextResponse };

const LEGACY_LABEL = "legacy:shared-password";

const MESSAGES: Record<DenyCode, string> = {
  not_staff: "This account is not a staff account.",
  suspended: "This staff account is suspended.",
  mfa_required: "This action needs a second factor. Finish signing in with your authenticator code.",
  needs_approval: "This action needs a second approver, and approvals are not available yet. Nothing was changed.",
  forbidden: "You don't have permission for this action.",
};

const unauthorized = () => NextResponse.json({ error: "Unauthorized: please log in." }, { status: 401 });

const lookupFailed = () =>
  NextResponse.json({ error: "Could not check your permissions. Nothing was changed." }, { status: 503 });

function liveRoles(record: StaffRecord | null, now: Date): ActorRole[] {
  if (!record) return [];
  return record.assignments
    .filter((a) => a.revokedAt === null && Date.parse(a.expiresAt) > now.getTime())
    .map((a) => ({ role: a.role, language: a.language, section: a.section }));
}

function scopeOf(target: Target | typeof ANY_SCOPE | undefined): { language: string | null; section: string | null } {
  return target && target !== ANY_SCOPE ? { language: target.language, section: target.section } : { language: null, section: null };
}

/** The audit row's actor columns, filled from the actor. */
function actorColumns(actor: Actor): Pick<AuditRow, "actor_type" | "actor_id" | "actor_label" | "actor_roles" | "aal" | "ip" | "user_agent" | "request_id"> {
  return {
    actor_type: actor.kind,
    actor_id: actor.userId,
    actor_label: actor.label,
    actor_roles: actor.roles,
    aal: actor.aal,
    ip: actor.meta.ip,
    user_agent: actor.meta.userAgent,
    request_id: actor.meta.requestId,
  };
}

async function auditDenial(actor: Actor, permission: PermissionKey | "auth.session", code: DenyCode, target: Target | typeof ANY_SCOPE | undefined): Promise<void> {
  try {
    await recordAudit({ ...actorColumns(actor), action: permission, outcome: "denied", reason: code, ...scopeOf(target) });
  } catch (err) {
    console.error("Audit of a denial failed:", err);
    Sentry.captureMessage("Audit of a denial failed", { level: "warning", extra: { permission, code } });
  }
}

/** Runs decide() for every permission the rule names; the first refusal wins. */
async function check(actor: Actor, rule: RouteRule, target: Target | typeof ANY_SCOPE | undefined, now: Date): Promise<GateResult> {
  for (const permission of rule.permissions) {
    const decision: Decision =
      actor.kind === "legacy"
        ? decideLegacy(permission)
        : decide({ staff: actor.record, aal: actor.aal ?? "aal1", permission, mode: rule.mode, target, now });
    if (!decision.allowed) {
      await auditDenial(actor, permission, decision.code, target);
      return {
        ok: false,
        response: NextResponse.json({ error: MESSAGES[decision.code], code: decision.code, required: permission }, { status: 403 }),
      };
    }
    actor.via = decision.via;
  }
  return { ok: true, actor };
}

/**
 * The gate. `target`: a scope to check against; ANY_SCOPE for the pre-check a route makes before it
 * loads its target (it must then call requireTarget); omitted for a read that lists or totals.
 */
export async function requirePermission(
  request: NextRequest,
  rule: RouteRule,
  target?: Target | typeof ANY_SCOPE
): Promise<GateResult> {
  const now = new Date();
  const session = await readSession(request);
  if (!session) return { ok: false, response: unauthorized() };

  const meta = {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
    requestId: request.headers.get("x-vercel-id") || crypto.randomUUID(),
  };

  if (session.kind === "legacy") {
    const actor: Actor = { kind: "legacy", userId: null, label: LEGACY_LABEL, aal: null, roles: [], via: [], record: null, meta };
    return check(actor, rule, target, now);
  }

  let record: StaffRecord | null;
  try {
    record = await loadStaffRecord(session.userId, now);
  } catch (err) {
    console.error("Staff record lookup failed:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "loadStaffRecord" } });
    return { ok: false, response: lookupFailed() };
  }

  const actor: Actor = {
    kind: "staff",
    userId: session.userId,
    label: record?.displayName ?? session.userId,
    aal: session.aal,
    roles: liveRoles(record, now),
    via: [],
    record,
    meta,
  };
  return check(actor, rule, target, now);
}

/**
 * For the session-only routes (SESSION_ONLY_ADMIN_ROUTES: /me, /mfa): a session and, for staff, an
 * active staff profile, but no permission. An aal1 session passes, because /mfa is how it becomes
 * aal2. A signed-in user who is not staff, or is suspended, is refused and the refusal audited.
 */
export async function requireSession(request: NextRequest): Promise<GateResult> {
  const now = new Date();
  const session = await readSession(request);
  if (!session) return { ok: false, response: unauthorized() };
  const meta = {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
    requestId: request.headers.get("x-vercel-id") || crypto.randomUUID(),
  };
  if (session.kind === "legacy") {
    return { ok: true, actor: { kind: "legacy", userId: null, label: LEGACY_LABEL, aal: null, roles: [], via: [], record: null, meta } };
  }
  let record: StaffRecord | null;
  try {
    record = await loadStaffRecord(session.userId, now);
  } catch (err) {
    console.error("Staff record lookup failed:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "loadStaffRecord" } });
    return { ok: false, response: lookupFailed() };
  }
  const actor: Actor = {
    kind: "staff",
    userId: session.userId,
    label: record?.displayName ?? session.userId,
    aal: session.aal,
    roles: liveRoles(record, now),
    via: [],
    record,
    meta,
  };
  const code: DenyCode | null = !record ? "not_staff" : record.status !== "active" ? "suspended" : null;
  if (code) {
    await auditDenial(actor, "auth.session", code, undefined);
    return { ok: false, response: NextResponse.json({ error: MESSAGES[code], code }, { status: 403 }) };
  }
  return { ok: true, actor };
}

/**
 * A single event row (a sign-in, an MFA step), not a change: written best-effort, because refusing
 * a sign-in over a log line would lock people out. Failures go to Sentry.
 */
export async function auditEvent(
  actor: Actor,
  action: string,
  outcome: "succeeded" | "failed",
  extra: { reason?: string | null; after?: Record<string, unknown> | null } = {}
): Promise<void> {
  try {
    await recordAudit({ ...actorColumns(actor), action, outcome, entity_type: "staff", entity_id: actor.userId, reason: extra.reason ?? null, after: extra.after ?? null });
  } catch (err) {
    console.error("Audit event write failed:", err);
    Sentry.captureMessage("Audit event write failed", { level: "warning", extra: { action, outcome } });
  }
}

/** The second check, once the route has loaded its target. Uses the record already read. */
export async function requireTarget(actor: Actor, rule: RouteRule, target: Target): Promise<GateResult> {
  return check(actor, rule, target, new Date());
}

// ---- Audited changes (owner decision Q2: attempted, then outcome; fail closed) ---------------

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  target?: Target;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/** 503 for a change that could not be recorded, and so was not made. */
export const auditUnavailable = () =>
  NextResponse.json({ error: "The audit log could not be written, so nothing was changed." }, { status: 503 });

/**
 * Writes the 'attempted' row before a change. Returns its id, or null if it could not be written:
 * the caller must then return auditUnavailable() and not make the change.
 */
export async function beginAudit(actor: Actor, entry: AuditEntry): Promise<string | null> {
  try {
    return await recordAudit({
      ...actorColumns(actor),
      action: entry.action,
      outcome: "attempted",
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      ...scopeOf(entry.target),
      before: entry.before ?? null,
      reason: entry.reason ?? null,
    });
  } catch (err) {
    console.error("Audit 'attempted' write failed; the change is refused:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "beginAudit", action: entry.action } });
    return null;
  }
}

/**
 * Writes the outcome, linked to its attempt. Never throws: if it cannot be written, the attempt
 * stays without an outcome, which the audit viewer shows as its own state (Q2).
 */
export async function finishAudit(actor: Actor, attemptId: string, outcome: "succeeded" | "failed", entry: AuditEntry): Promise<void> {
  try {
    await recordAudit({
      ...actorColumns(actor),
      action: entry.action,
      outcome,
      attempt_id: attemptId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      ...scopeOf(entry.target),
      after: entry.after ?? null,
      reason: entry.reason ?? null,
    });
  } catch (err) {
    console.error("Audit outcome write failed; the attempt stays without an outcome:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "finishAudit", action: entry.action, attemptId } });
  }
}
