import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { authAccount, recoveryToken } from "@timesprime/server/repositories/people";
import { isTheirPerson, planFor } from "@timesprime/server/services/people/reach";
import { welcomePath } from "@timesprime/shared/config/people";
import { ask, auditedPerson, badRequest, conflict, forbidden, gatePerson, ownAccess, peopleFailure, readBody, reasonOf, type Params } from "../../_lib/people";

// A new one-time "set your password" link, for a forgotten password (Panel 1 design §4, M2). A
// Managing Editor makes one for their own people at once; a Super Admin asks, and the second Super
// Admin who approves gets the link. The link alone does not take over an account that has a second
// factor: the welcome page asks for its code before the new password (POST /api/admin/password).
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/[id]/password-link"].POST;

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
  if (profile.status !== "active") return conflict("This person is suspended. Reactivate them first.", "suspended");
  const plan = planFor(actor.record, "user.manage", now, (scopes) => isTheirPerson(scopes, rows, now));
  if (plan === null) return forbidden("user.manage", "A Managing Editor makes links only for the people of their own desks.");
  if (plan === "ask") return ask(actor, "password_link", profile.user_id, {}, reason);

  let email: string | null;
  try {
    email = (await authAccount(profile.user_id))?.email ?? null;
  } catch (err) {
    return peopleFailure(err, "authAccount");
  }
  if (!email) return conflict("This account has no email to make a link for.", "no_email");

  const result = await auditedPerson(
    actor,
    { action: "staff.password_link", personId: profile.user_id, reason },
    () => recoveryToken(email),
    // Never the token: only that a link was made.
    () => ({ link_made: true })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ link: welcomePath(result.value) });
}
