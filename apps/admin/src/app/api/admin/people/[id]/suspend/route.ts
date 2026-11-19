import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { endSessions, setStatus } from "@timesprime/server/repositories/people";
import { isTheirPerson, planFor } from "@timesprime/server/services/people/reach";
import {
  auditedPerson,
  badRequest,
  conflict,
  forbidden,
  gatePerson,
  isLastSuperAdmin,
  lastSuperAdmin,
  ownAccess,
  peopleFailure,
  readBody,
  reasonOf,
  type Params,
} from "../../_lib/people";

// Suspends a staff member (Panel 1 design §3): removing access takes one person, so a Super Admin
// acts at once, and a Managing Editor for their own people. Every check then says no (status is
// read on every request), and their sessions are ended, so the next request signs them out. Their
// roles stay as they are, for a reactivation. The last active Super Admin cannot be suspended.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/[id]/suspend"].POST;

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
  if (profile.status === "suspended") return conflict("This person is already suspended.", "suspended");
  const plan = planFor(actor.record, "user.manage", now, (scopes) => isTheirPerson(scopes, rows, now), true);
  if (plan === null) return forbidden("user.manage", "A Managing Editor suspends only the people of their own desks.");
  try {
    if (await isLastSuperAdmin(person, now)) return lastSuperAdmin();
  } catch (err) {
    return peopleFailure(err, "isLastSuperAdmin");
  }

  const result = await auditedPerson(
    actor,
    { action: "staff.suspend", personId: profile.user_id, before: { status: profile.status }, reason },
    async () => {
      const updated = await setStatus(profile.user_id, "suspended");
      // Suspended is already enforced on their next request; ending the sessions as well is best
      // effort, and its failure does not undo the suspension.
      let sessionsEnded: number | null = null;
      try {
        sessionsEnded = await endSessions(profile.user_id);
      } catch (err) {
        console.error("Ending a suspended person's sessions failed:", err);
        Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "endSessions" } });
      }
      return { updated, sessionsEnded };
    },
    (v) => ({ status: v.updated.status, sessions_ended: v.sessionsEnded })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ status: result.value.updated.status, sessionsEnded: result.value.sessionsEnded });
}
