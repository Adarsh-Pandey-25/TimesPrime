import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { endSessions } from "@timesprime/server/repositories/people";
import { isTheirPerson, planFor } from "@timesprime/server/services/people/reach";
import { auditedPerson, badRequest, forbidden, gatePerson, readBody, reasonOf, type Params } from "../../_lib/people";

// Signs a staff member out everywhere (Panel 1 design §2): their Supabase sessions are deleted
// (staff_end_sessions, migration admin-1), so their next request is refused and they sign in again,
// with their second factor. It removes nothing else, so one person does it: a Super Admin, a
// Managing Editor for their own people, or anyone for themselves.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/[id]/sign-out"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gatePerson(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, person, now } = gated;
  const { profile, rows } = person;

  const self = actor.userId === profile.user_id;
  if (!self && planFor(actor.record, "user.manage", now, (scopes) => isTheirPerson(scopes, rows, now), true) === null) {
    return forbidden("user.manage", "A Managing Editor signs out only the people of their own desks.");
  }

  const result = await auditedPerson(
    actor,
    { action: "staff.sign_out", personId: profile.user_id, reason: reasonOf(body) },
    () => endSessions(profile.user_id),
    (n) => ({ sessions_ended: n })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ sessionsEnded: result.value });
}
