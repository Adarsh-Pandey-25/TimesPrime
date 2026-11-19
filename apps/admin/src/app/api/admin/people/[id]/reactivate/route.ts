import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { setStatus } from "@timesprime/server/repositories/people";
import { isTheirPerson, planFor } from "@timesprime/server/services/people/reach";
import { ask, auditedPerson, badRequest, conflict, forbidden, gatePerson, ownAccess, readBody, reasonOf, type Params } from "../../_lib/people";

// Reactivates a suspended staff member (Panel 1 design §3): it gives access back, so a Super Admin
// asks and a second one decides; a Managing Editor acts at once for their own people. Roles that
// expired meanwhile stay expired.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/[id]/reactivate"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gatePerson(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, person, now } = gated;
  const { profile, rows } = person;

  if (actor.userId === profile.user_id) return ownAccess();
  const reason = reasonOf(body);
  if (!reason) return badRequest("A reason is required.");
  if (profile.status === "active") return conflict("This person is not suspended.", "active");
  const plan = planFor(actor.record, "user.manage", now, (scopes) => isTheirPerson(scopes, rows, now));
  if (plan === null) return forbidden("user.manage", "A Managing Editor reactivates only the people of their own desks.");
  if (plan === "ask") return ask(actor, "reactivate", profile.user_id, {}, reason);

  const result = await auditedPerson(
    actor,
    { action: "staff.reactivate", personId: profile.user_id, before: { status: profile.status }, reason },
    () => setStatus(profile.user_id, "active"),
    (p) => ({ status: p.status })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ status: result.value.status });
}
