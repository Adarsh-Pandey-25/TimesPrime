import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { grant } from "@timesprime/server/repositories/people";
import { liveRows, planFor, withinReach } from "@timesprime/server/services/people/reach";
import { defaultDays, isExpiryDays, isGrantableRole, readScope } from "@timesprime/shared/config/people";
import { ask, auditedPerson, badRequest, conflict, forbidden, gatePerson, ownAccess, readBody, reasonOf, type Params } from "../../_lib/people";

// Grants a role, in a scope, for a time (Panel 1 design §3). A Managing Editor grants Writer,
// Sub-editor or Desk Editor in their own scope, at once; a Super Admin asks, and a second Super
// Admin decides (for a privileged role the database requires the two of them as well). Nobody
// grants themselves. Body: role, language, section (empty for all), days (30, 90, 180 or 365),
// reason.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/[id]/roles"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gatePerson(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, person, now } = gated;
  const { profile, rows } = person;

  if (actor.userId === profile.user_id) return ownAccess();
  const role = typeof body.role === "string" ? body.role : "";
  if (!isGrantableRole(role)) return badRequest("role must be one of the roles granted in the app (the commercial roles wait for Panel 9).");
  const scope = readScope(role, body.language, body.section);
  if ("error" in scope) return badRequest(scope.error);
  const days = body.days === undefined ? defaultDays(role) : body.days;
  if (!isExpiryDays(days)) return badRequest("days must be 30, 90, 180 or 365.");
  const reason = reasonOf(body);
  if (!reason) return badRequest("A reason is required.");
  if (profile.status !== "active") return conflict("This person is suspended. Reactivate them first.", "suspended");
  const holds = liveRows(rows, now).some((r) => r.role_key === role && !r.is_break_glass && r.language === scope.language && r.section === scope.section);
  if (holds) return conflict("This person already holds this role in this scope. Renew it instead.", "holds");

  const plan = planFor(actor.record, "role.assign", now, (scopes) => withinReach(scopes, role, scope));
  if (plan === null) return forbidden("role.assign", "A Managing Editor grants Writer, Sub-editor or Desk Editor, in their own scope.");
  if (plan === "ask") return ask(actor, "grant", profile.user_id, { role, language: scope.language, section: scope.section, days }, reason, scope);

  const result = await auditedPerson(
    actor,
    { action: "role.assign", personId: profile.user_id, scope, reason },
    () =>
      grant({ userId: profile.user_id, role, language: scope.language, section: scope.section, days, reason, grantedBy: actor.userId as string, approvedBy: null, replaces: null }),
    (a) => ({ assignment: a.id, role: a.role_key, language: a.language, section: a.section, expires_at: a.expires_at })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ assignment: result.value }, { status: 201 });
}
