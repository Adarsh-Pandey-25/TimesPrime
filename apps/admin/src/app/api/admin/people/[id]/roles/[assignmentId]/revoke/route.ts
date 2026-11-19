import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { endBreakGlass, revoke } from "@timesprime/server/repositories/people";
import { planFor, withinReach } from "@timesprime/server/services/people/reach";
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
} from "../../../../_lib/people";

// Revokes a role (Panel 1 design §3): removing access takes one person, so a Super Admin acts at
// once, and a Managing Editor for the roles they could grant. It applies to the person's next
// request (roles are read on every request). Rows are history: revoked, never deleted. The last
// active Super Admin's role cannot be revoked. Body: reason.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/[id]/roles/[assignmentId]/revoke"].POST;

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
  if (row.revoked_at) return conflict("This role was already revoked.", "revoked");
  const reason = reasonOf(body);
  if (!reason) return badRequest("A reason is required.");

  const scope = { language: row.language, section: row.section };
  const plan = planFor(actor.record, "role.assign", now, (scopes) => withinReach(scopes, row.role_key, scope), true);
  if (plan === null) return forbidden("role.assign", "A Managing Editor revokes Writer, Sub-editor or Desk Editor, in their own scope.");
  if (row.role_key === "super_admin" && !row.is_break_glass) {
    try {
      if (await isLastSuperAdmin(person, now)) return lastSuperAdmin();
    } catch (err) {
      return peopleFailure(err, "isLastSuperAdmin");
    }
  }

  const result = await auditedPerson(
    actor,
    { action: "role.revoke", personId: profile.user_id, scope, before: { assignment: row.id, role: row.role_key, expires_at: row.expires_at }, reason },
    async () => {
      const revoked = await revoke(row.id, actor.userId as string, reason);
      // A Super Admin who loses the role loses their emergency access with it (M3).
      if (row.role_key === "super_admin" && !row.is_break_glass) await endBreakGlass(profile.user_id, actor.userId as string, "Super Admin role revoked", now);
      return revoked;
    },
    (a) => ({ assignment: a.id, revoked_at: a.revoked_at })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ assignment: result.value });
}
