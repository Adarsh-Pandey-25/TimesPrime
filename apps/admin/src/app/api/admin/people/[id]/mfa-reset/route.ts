import "server-only";

import type { NextRequest } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { asks } from "@timesprime/server/services/people/reach";
import { ask, badRequest, forbidden, gatePerson, ownAccess, readBody, reasonOf, type Params } from "../../_lib/people";

// Asks to reset a lost second factor (Panel 1 design §4, M2; Panel 0 design §5: "an in-app reset
// that needs two admins"). Always a request: one Super Admin asks, saying how they checked that it
// really is the person; a second Super Admin approves, and then the person's factors are deleted
// and their sessions ended, so at their next sign-in they set up a new one. A Managing Editor asks a
// Super Admin. Body: reason.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/[id]/mfa-reset"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gatePerson(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, person, now } = gated;

  if (actor.userId === person.profile.user_id) return ownAccess();
  const reason = reasonOf(body);
  if (!reason) return badRequest("Say how you checked that it really is them: a reason is required.");
  if (!asks(actor.record, "user.manage", now)) {
    return forbidden("user.manage", "Two Super Admins reset a second factor. Ask a Super Admin.");
  }
  return ask(actor, "mfa_reset", person.profile.user_id, {}, reason);
}
