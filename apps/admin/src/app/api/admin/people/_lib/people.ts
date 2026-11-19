import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { RouteRule } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, type Actor, type AuditEntry } from "@timesprime/server/auth/requirePermission";
import type { Target } from "@timesprime/server/auth/scope";
import type { ScopeLanguage } from "@timesprime/shared/config/permissions";
import {
  anotherActiveSuperAdmin,
  createRequest,
  getProfile,
  listAssignments,
  PeopleStoreError,
  type AssignmentRow,
  type ProfileRow,
  type RequestRow,
} from "@timesprime/server/repositories/people";
import { canSee, liveRows } from "@timesprime/server/services/people/reach";
import type { RequestKind } from "@timesprime/shared/config/people";

// Panel 1's routes (design §3 and §4) share these steps: the gate (requirePermission: the
// permission in some scope, the second factor, the shared password refused by staffOnly), the
// person and their roles, whether the caller may see them, and the audit: attempted, the change,
// then the outcome (Panel 0, Q2). The reach rules are in packages/server/src/services/people.

export type Params = { params: Promise<Record<string, string>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | undefined): v is string => typeof v === "string" && UUID.test(v);

export { readBody, badRequest } from "../../desk/_lib/desk";

/** A store failure as an answer: its own status for 404, 409 and 422; 500 (and Sentry) otherwise. */
export function peopleFailure(err: unknown, operation: string): NextResponse {
  if (err instanceof PeopleStoreError && err.status !== 500) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`People ${operation} failed:`, err);
  Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation } });
  return NextResponse.json({ error: "This could not be done. Nothing was changed." }, { status: 500 });
}

export const notFound = () => NextResponse.json({ error: "Staff member not found." }, { status: 404 });
export const forbidden = (required: string, error = "You don't have permission for this action.") =>
  NextResponse.json({ error, code: "forbidden", required }, { status: 403 });
export const ownAccess = () => NextResponse.json({ error: "Nobody changes their own access. Ask another admin.", code: "own_access" }, { status: 403 });
export const conflict = (error: string, code: string) => NextResponse.json({ error, code }, { status: 409 });

/** The reason every change carries (the audit log, and the request or assignment it makes). */
export function reasonOf(body: Record<string, unknown>): string | null {
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  return reason ? reason.slice(0, 500) : null;
}

export interface Person {
  profile: ProfileRow;
  rows: AssignmentRow[];
}

type Gated = { ok: true; actor: Actor; person: Person; now: Date } | { ok: false; response: NextResponse };

/**
 * The gate for a route on one person: the permission in some scope first (so a caller with none
 * learns nothing, not even whether the person exists), then the person and every role they hold or
 * held, then whether the caller may see them (a Managing Editor: their desks only).
 */
export async function gatePerson(request: NextRequest, rule: RouteRule, id: string | undefined): Promise<Gated> {
  const gate = await requirePermission(request, rule, ANY_SCOPE);
  if (!gate.ok) return gate;
  if (!isUuid(id)) return { ok: false, response: notFound() };
  const now = new Date();
  let person: Person;
  try {
    const profile = await getProfile(id);
    if (!profile) return { ok: false, response: notFound() };
    person = { profile, rows: await listAssignments([id]) };
  } catch (err) {
    return { ok: false, response: peopleFailure(err, "getPerson") };
  }
  if (!canSee(gate.actor.record, person.rows, now)) return { ok: false, response: forbidden(rule.permissions[0]) };
  return { ok: true, actor: gate.actor, person, now };
}

/** True when the person is an active Super Admin and nobody else is: they cannot be removed in the app. */
export async function isLastSuperAdmin(person: Person, now: Date): Promise<boolean> {
  const holds = liveRows(person.rows, now).some((r) => r.role_key === "super_admin" && !r.is_break_glass);
  if (!holds || person.profile.status !== "active") return false;
  return !(await anotherActiveSuperAdmin(person.profile.user_id, now));
}

export const lastSuperAdmin = () =>
  conflict("This is the last active Super Admin. Make another one first; the owner's SQL editor remains the way back in.", "last_super_admin");

export interface PersonEntry {
  action: string;
  /** Who it is about: the audit row's entity (entity_type "staff"). */
  personId: string;
  /** The role's scope, for a role's grant, renewal or revocation. */
  scope?: { language: string | null; section: string | null };
  before?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Runs one audited change: the attempt row first (refused with 503 if it cannot be written). */
export async function auditedPerson<T>(
  actor: Actor,
  entry: PersonEntry,
  change: () => Promise<T>,
  after: (value: T) => Record<string, unknown>
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  const language: ScopeLanguage | null = entry.scope?.language === "en" || entry.scope?.language === "hi" ? entry.scope.language : null;
  const target: Target | undefined = entry.scope ? { language, section: entry.scope.section } : undefined;
  const row: AuditEntry = { action: entry.action, entityType: "staff", entityId: entry.personId, target, before: entry.before ?? null, reason: entry.reason ?? null };
  const attempt = await beginAudit(actor, row);
  if (!attempt) return { ok: false, response: auditUnavailable() };
  try {
    const value = await change();
    await finishAudit(actor, attempt, "succeeded", { ...row, after: after(value) });
    return { ok: true, value };
  } catch (err) {
    await finishAudit(actor, attempt, "failed", { ...row, reason: err instanceof Error ? err.message : String(err) });
    return { ok: false, response: peopleFailure(err, entry.action) };
  }
}

/** A Super Admin's change: a request a second Super Admin decides (the matrix's A). Answers 202. */
export async function ask(
  actor: Actor,
  kind: RequestKind,
  /** null for a person being added, who has no account yet: the audit row names their email. */
  personId: string | null,
  details: Record<string, unknown>,
  reason: string,
  scope?: PersonEntry["scope"]
): Promise<NextResponse> {
  const result = await auditedPerson<RequestRow>(
    actor,
    { action: "access.request", personId: personId ?? `email:${String(details.email ?? "")}`, scope, reason },
    () => createRequest({ kind, userId: personId, details, reason, requestedBy: actor.userId as string }),
    (r) => ({ request: r.id, kind, details })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ request: result.value, asked: true }, { status: 202 });
}
