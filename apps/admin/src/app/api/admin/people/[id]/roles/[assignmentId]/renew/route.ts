import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { grant } from "@timesprime/server/repositories/people";
import { planFor, withinReach } from "@timesprime/server/services/people/reach";
import { defaultDays, isExpiryDays } from "@timesprime/shared/config/people";
import { ask, auditedPerson, badRequest, conflict, forbidden, gatePerson, ownAccess, readBody, reasonOf, type Params } from "../../../../_lib/people";

// Renews a role (Panel 1 design §3): a new row for the same role and scope, from now, and the old
// one revoked as "renewed", in one transaction (access_grant). The same rules as a grant: a
// Managing Editor within reach at once, a Super Admin by a request. An expired role can be renewed;
// a revoked one is granted again instead. Body: days (30, 90, 180 or 365), reason.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/[id]/roles/[assignmentId]/renew"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id, assignmentId } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gatePerson(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, person, now } = gated;
  const { profile, rows } = person;

  if (actor.userId === profile.user_id) return ownAccess();
  const row = rows.find((r) => r.id === assignmentId);
  if (!row) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if (row.revoked_at) return conflict("This role was revoked. Grant it again instead.", "revoked");
  if (row.is_break_glass) return conflict("Emergency access is not renewed; start a new one.", "break_glass");
  const days = body.days === undefined ? defaultDays(row.role_key) : body.days;
  if (!isExpiryDays(days)) return badRequest("days must be 30, 90, 180 or 365.");
  const reason = reasonOf(body);
  if (!reason) return badRequest("A reason is required.");
  if (profile.status !== "active") return conflict("This person is suspended. Reactivate them first.", "suspended");

  const scope = { language: row.language, section: row.section };
  const plan = planFor(actor.record, "role.assign", now, (scopes) => withinReach(scopes, row.role_key, scope));
  if (plan === null) return forbidden("role.assign", "A Managing Editor renews Writer, Sub-editor or Desk Editor, in their own scope.");
  if (plan === "ask") {
    return ask(actor, "renew", profile.user_id, { assignment_id: row.id, role: row.role_key, language: row.language, section: row.section, days }, reason, scope);
  }

  const result = await auditedPerson(
    actor,
    { action: "role.renew", personId: profile.user_id, scope, before: { assignment: row.id, expires_at: row.expires_at }, reason },
    () =>
      grant({ userId: profile.user_id, role: row.role_key, language: row.language, section: row.section, days, reason, grantedBy: actor.userId as string, approvedBy: null, replaces: row.id }),
    (a) => ({ assignment: a.id, replaces: row.id, expires_at: a.expires_at })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ assignment: result.value });
}
