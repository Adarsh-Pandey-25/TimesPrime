import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import {
  addProfile,
  authAccounts,
  ensureAuthUser,
  findAuthUser,
  getProfile,
  grant,
  listAssignments,
  listProfiles,
  recoveryToken,
  type AssignmentRow,
  type AuthAccount,
} from "@timesprime/server/repositories/people";
import { canSee, planFor, withinReach } from "@timesprime/server/services/people/reach";
import { defaultDays, isExpiryDays, isGrantableRole, readEmail, readScope, welcomePath } from "@timesprime/shared/config/people";
import { ask, auditedPerson, badRequest, forbidden, peopleFailure, readBody, reasonOf } from "./_lib/people";
import { callerView, personView } from "./_lib/views";

// The staff directory (Panel 1 design §4): everyone for a Super Admin, a Managing Editor's desks
// for them; each person's status, live roles with desk and expiry, second factor and last sign-in.
// If Supabase Auth cannot be asked, the directory still comes back, without emails and factors.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people"].GET;
const ADD = ADMIN_ROUTE_RULES["/api/admin/people"].POST;
const NAME_MAX = 100;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();
  try {
    const [profiles, rows] = await Promise.all([listProfiles(), listAssignments()]);
    let accounts: Map<string, AuthAccount> | null = null;
    try {
      accounts = await authAccounts();
    } catch (err) {
      console.error("Supabase Auth's accounts could not be read:", err);
      Sentry.captureException(err, { tags: { source: "supabase-auth" }, extra: { operation: "authAccounts" } });
    }
    const byUser = new Map<string, AssignmentRow[]>();
    for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
    const people = profiles
      .filter((p) => canSee(actor.record, byUser.get(p.user_id) ?? [], now))
      .map((p) => personView(p, byUser.get(p.user_id) ?? [], accounts ? (accounts.get(p.user_id) ?? null) : undefined, now));
    return NextResponse.json({ people, caller: callerView(actor, now), accounts: accounts !== null });
  } catch (err) {
    return peopleFailure(err, "listPeople");
  }
}

/**
 * Adds a person (Panel 1 design §4, M2): their account and a first role, with a one-time "set your
 * password" link. A Managing Editor adds Writer, Sub-editor or Desk Editor in their own scope, at
 * once, and gets the link to hand over. A Super Admin asks; the second Super Admin who approves gets
 * the link. The account is made with the email confirmed and no password, so nobody can sign in to
 * it until the link is used. Body: email, display_name, role, language, section, days, reason.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gate = await requirePermission(request, ADD, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();

  const email = readEmail(body.email);
  if (!email) return badRequest("email must be an email address.");
  const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!name || name.length > NAME_MAX) return badRequest(`display_name is required, at most ${NAME_MAX} characters.`);
  const role = typeof body.role === "string" ? body.role : "";
  if (!isGrantableRole(role)) return badRequest("role must be one of the roles granted in the app (the commercial roles wait for Panel 9).");
  const scope = readScope(role, body.language, body.section);
  if ("error" in scope) return badRequest(scope.error);
  const days = body.days === undefined ? defaultDays(role) : body.days;
  if (!isExpiryDays(days)) return badRequest("days must be 30, 90, 180 or 365.");
  const reason = reasonOf(body);
  if (!reason) return badRequest("A reason is required.");

  try {
    const existing = await findAuthUser(email);
    if (existing && (await getProfile(existing.id))) {
      return NextResponse.json({ error: "This email is already a staff member. Grant the role on their page.", code: "staff", userId: existing.id }, { status: 409 });
    }
  } catch (err) {
    return peopleFailure(err, "findAuthUser");
  }

  const plan = planFor(actor.record, "role.assign", now, (scopes) => withinReach(scopes, role, scope));
  if (plan === null) return forbidden("role.assign", "A Managing Editor adds Writers, Sub-editors and Desk Editors, in their own scope.");
  if (plan === "ask") return ask(actor, "add_person", null, { email, display_name: name, role, language: scope.language, section: scope.section, days }, reason, scope);

  const result = await auditedPerson(
    actor,
    { action: "staff.add", personId: `email:${email}`, scope, reason },
    async () => {
      const userId = await ensureAuthUser(email);
      await addProfile(userId, name, actor.userId as string);
      const assignment = await grant({ userId, role, language: scope.language, section: scope.section, days, reason, grantedBy: actor.userId as string, approvedBy: null, replaces: null });
      // The token is returned once, to the person adding, and is never stored or written to the audit log.
      const token = await recoveryToken(email);
      return { userId, assignment, token };
    },
    (v) => ({ user_id: v.userId, assignment: v.assignment.id, role, language: scope.language, section: scope.section, expires_at: v.assignment.expires_at })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ person: { userId: result.value.userId, email, name }, link: welcomePath(result.value.token) }, { status: 201 });
}
